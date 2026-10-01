/* ============================================================
   مزامنة سحابية اختيارية عبر Firebase Firestore (مجاني)
   المستخدم يُنشئ مشروع Firebase خاص به مجاناً ويلصق بيانات الاتصال هنا.
   إن لم يتم الربط، يعمل النظام محلياً بـ localStorage كالمعتاد.
   ============================================================ */

const CLOUD_KEY = "pms_cloud_config_v1";
let cloudApp = null, cloudDb = null, cloudUnsub = null;
let cloudApplyingRemote = false; // guard to avoid write-loop when applying an incoming snapshot

function loadCloudConfig() {
  try { return JSON.parse(localStorage.getItem(CLOUD_KEY)); } catch (e) { return null; }
}
function saveCloudConfig(cfg) { localStorage.setItem(CLOUD_KEY, JSON.stringify(cfg)); }
function clearCloudConfig() {
  localStorage.removeItem(CLOUD_KEY);
  if (cloudUnsub) { cloudUnsub(); cloudUnsub = null; }
  cloudApp = null; cloudDb = null;
  STATE.cloudStatus = "disconnected";
}

function docPath(orgCode) {
  return { col: "pms_orgs", id: orgCode };
}

async function connectCloud(configObj, orgCode, showAlert = true) {
  try {
    if (typeof firebase === "undefined") {
      throw new Error("مكتبة Firebase لم تُحمَّل بعد — تحقق من اتصال الإنترنت وأعد المحاولة.");
    }
    if (!firebase.apps || !firebase.apps.length) {
      cloudApp = firebase.initializeApp(configObj);
    } else {
      cloudApp = firebase.app();
    }
    cloudDb = firebase.firestore();
    const ref = cloudDb.collection(docPath(orgCode).col).doc(docPath(orgCode).id);

    // Fetch once first to decide: adopt remote data, or push our local data as the seed
    const snap = await ref.get();
    if (snap.exists && snap.data() && snap.data().payload) {
      STATE.data = normalizeData(JSON.parse(snap.data().payload));
      saveData(STATE.data);
    } else {
      await ref.set({ payload: JSON.stringify(STATE.data), updatedAt: Date.now(), updatedBy: STATE.user ? STATE.user.name : "unknown" });
    }

    if (cloudUnsub) cloudUnsub();
    cloudUnsub = ref.onSnapshot((doc) => {
      if (!doc.exists) return;
      const d = doc.data();
      if (!d || !d.payload) return;
      cloudApplyingRemote = true;
      try {
        const oldNotificationIds = new Set((STATE.data.notifications || []).map((n) => n.id));
        STATE.data = normalizeData(JSON.parse(d.payload));
        saveData(STATE.data);
        if (STATE.user && typeof notifyNewIncomingNotifications === "function") {
          notifyNewIncomingNotifications(oldNotificationIds);
        }
        renderApp();
      } finally {
        cloudApplyingRemote = false;
      }
    }, (err) => {
      STATE.cloudStatus = "error";
      STATE.cloudError = err.message;
      renderApp();
    });

    STATE.cloudRef = ref;
    STATE.cloudStatus = "connected";
    saveCloudConfig({ configObj, orgCode });
    if (showAlert) showToast("تم الاتصال بالسحابة بنجاح — أي تعديل سيظهر فوراً لكل من يفتح نفس رمز المؤسسة", "success");
    renderApp();
    return true;
  } catch (e) {
    STATE.cloudStatus = "error";
    STATE.cloudError = e.message;
    renderApp();
    if (showAlert) alert("تعذّر الاتصال بالسحابة: " + e.message);
    return false;
  }
}

/* Called after every local mutation (in addition to localStorage) */
function pushCloudUpdate() {
  if (!STATE.cloudRef || cloudApplyingRemote) return;
  const payload = JSON.stringify(STATE.data);
  const approxSizeKB = Math.round(payload.length / 1024);
  if (approxSizeKB > 950) { // حدّ Firestore الفعلي 1024KB لكل وثيقة — تحذير مسبق قبل الفشل الصامت، لا بعده
    STATE.cloudStatus = "error";
    STATE.cloudError = `البيانات (${approxSizeKB}KB) تجاوزت أو تقارب الحدّ الأقصى لحجم وثيقة المزامنة (1024KB) — هذا التحديث لن يُزامَن مع باقي الأجهزة. الصور المتراكمة عبر النظام السبب الأرجح؛ احذف صوراً قديمة غير ضرورية من عناصر أُغلِقت فعلاً.`;
    if (typeof showToast === "function") showToast("⚠ فشلت مزامنة هذا التحديث — البيانات كبيرة جداً. راجع حالة السحابة.", "error");
    renderApp();
    return;
  }
  STATE.cloudRef.set({
    payload,
    updatedAt: Date.now(),
    updatedBy: STATE.user ? STATE.user.name : "unknown",
  }).catch((e) => {
    STATE.cloudStatus = "error";
    STATE.cloudError = e.message;
    if (typeof showToast === "function") showToast("⚠ فشلت مزامنة هذا التحديث مع السحابة — " + e.message, "error");
    renderApp();
  });
}

async function tryAutoReconnectCloud() {
  const saved = loadCloudConfig();
  if (!saved) { STATE.cloudStatus = "disconnected"; return; }
  // مكتبة Firebase تُحمَّل عبر CDN بخاصية defer، فقد لا تكون جاهزة فور تشغيل التطبيق
  // رغم توفر الإنترنت فعلياً — ننتظر قليلاً قبل الحكم بالفشل.
  for (let attempt = 0; attempt < 5 && typeof firebase === "undefined"; attempt++) {
    await new Promise((r) => setTimeout(r, 800));
  }
  await connectCloud(saved.configObj, saved.orgCode, false);
}

/* إعادة محاولة الاتصال تلقائياً فور عودة الإنترنت — لا تنتظر حتى يُعيد المستخدم تحميل الصفحة يدوياً */
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (STATE.cloudStatus !== "connected") tryAutoReconnectCloud();
  });
}
