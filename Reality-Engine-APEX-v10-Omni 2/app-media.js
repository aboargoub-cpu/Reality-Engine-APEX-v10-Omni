/* ============================================================
   الصور والباركود: ضغط الصور، توليد باركود، ومسح باركود بالكاميرا
   المكتبات (JsBarcode / ZXing) تُحمَّل عبر الإنترنت عند الحاجة فقط.
   إن تعذّر تحميلها (لا إنترنت)، تستمر بقية الميزات بالعمل عادياً.
   ============================================================ */

function compressImageFile(file, maxWidth = 760, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderBarcodeInto(svgEl, value) {
  if (typeof JsBarcode === "undefined" || !value) return false;
  try {
    JsBarcode(svgEl, String(value), { format: "CODE128", width: 1.6, height: 42, fontSize: 12, margin: 4 });
    return true;
  } catch (e) { return false; }
}

let _zxingReader = null;
let _scanStream = null;
async function startBarcodeScan(videoEl, onResult, onError) {
  try {
    if (typeof ZXing === "undefined") throw new Error("مكتبة المسح لم تُحمَّل — تحقق من الإنترنت.");
    _zxingReader = new ZXing.BrowserMultiFormatReader();
    const devices = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
    const deviceId = devices.length ? (devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1]).deviceId : undefined;
    _zxingReader.decodeFromVideoDevice(deviceId, videoEl, (result, err) => {
      if (result) onResult(result.getText());
    });
  } catch (e) {
    onError(e.message);
  }
}
function stopBarcodeScan() {
  try { if (_zxingReader) _zxingReader.reset(); } catch (e) {}
  _zxingReader = null;
}

/* ============================================================
   كشف كائنات حقيقي — TensorFlow.js + نموذج COCO-SSD مُدرَّب مسبقاً
   وحقيقياً (لا محاكاة، يعمل بالكامل داخل المتصفح، يزن ~5 م.ب يُحمَّل
   مرة واحدة ويُخزَّن مؤقَّتاً). صراحة ضرورية: هذا النموذج يكشف 80
   فئة عامة فقط (شخص، سيارة، شاحنة، حافلة...) من مجموعة بيانات COCO
   العامة — لا يكشف "مطابقة معدات حماية" ولا "صب خرسانة" ولا "خطأ
   تركيب حديد تسليح"؛ تلك تحتاج نموذجاً مُدرَّباً خصيصاً على بيانات
   مواقع إنشائية لا يملكه أحد هنا. هذا استخدام صادق لأحدث تقنية
   متاحة فعلياً ضمن حدودها الحقيقية، لا ادّعاء رؤية حاسوبية إنشائية.
   ============================================================ */
const COCO_CLASS_LABELS_AR = { person: "شخص", car: "سيارة", truck: "شاحنة", bus: "حافلة", motorcycle: "دراجة نارية", bicycle: "دراجة هوائية" };
let _cocoModel = null;
async function loadObjectDetectionModel() {
  if (_cocoModel) return _cocoModel;
  if (typeof cocoSsd === "undefined") throw new Error("مكتبة الكشف عن الكائنات (TensorFlow.js) لم تُحمَّل بعد — تحقق من اتصال الإنترنت وأعد المحاولة.");
  _cocoModel = await cocoSsd.load();
  return _cocoModel;
}
async function runObjectDetectionOnPhoto(imageDataUrl) {
  const model = await loadObjectDetectionModel();
  const img = document.createElement("img");
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("تعذّر تحميل الصورة للتحليل."));
    img.src = imageDataUrl;
  });
  const predictions = await model.detect(img);
  return predictions.map((p) => ({
    classEn: p.class,
    classAr: COCO_CLASS_LABELS_AR[p.class] || p.class,
    confidencePct: Math.round(p.score * 100),
    bbox: p.bbox,
  }));
}
