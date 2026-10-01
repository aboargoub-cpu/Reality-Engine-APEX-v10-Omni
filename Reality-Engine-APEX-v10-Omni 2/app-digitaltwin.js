/* ============================================================
   التوثيق الرقمي للمشروع والرصد الذكي (Digital Twin / Smart Monitoring)
   ============================================================
   هذا الملف يبني البنية التحتية (قاعدة البيانات، الواجهات، سير العمل)
   لاستقبال نتائج جاهزة من خدمات خارجية متخصصة (مسح ثلاثي الأبعاد،
   رؤية حاسوبية، نظارات ذكية) — لا يُنفَّذ داخله أي معالجة LiDAR أو
   نماذج تعلّم آلي أو تطبيق نظارات فعلي، لأن هذا مستحيل من متصفح واحد
   بلا خادم وبنية حوسبة GPU حقيقية.

   "نقطة التكامل" الصادقة الوحيدة الممكنة من متصفح بلا خادم هي:
   1) استيراد ملف JSON بصيغة موثَّقة أدناه (PMS_EXTERNAL_RESULT_SCHEMA)
      — يعمل فعلياً الآن، ويمكن لأي خدمة خارجية إنشاء ملف بهذه الصيغة.
   2) عند استخدام المزامنة السحابية (Firebase) — أي خدمة خارجية تملك
      بيانات اتصال نفس مشروع Firebase تستطيع الكتابة مباشرة في مجموعة
      Firestore التي يقرأها هذا النظام، فتظهر النتائج فوراً بلا استيراد
      يدوي. هذا نمط حقيقي وقابل للتنفيذ من طرف الخدمة الخارجية، لكنه
      غير مُفعَّل هنا فعلياً (يحتاج بناء تلك الخدمة الخارجية نفسها أولاً)
      — موصوف بدقة في صفحة "مركز الاتصالات الخارجية"، لا مُنفَّذ زوراً.
   ============================================================ */

/* ============================================================
   طبقة الإعدادات المركزية (Configuration) — كل عتبة/وزن كان متناثراً
   كثابتاً "سحرياً" في أماكن مختلفة، أصبح هنا في سطح واحد قابل للتعديل
   والاستبدال، بدل نص برمجي مبعثر.
   ============================================================ */
const DigitalTwinConfig = {
  scanConflictThresholdPct: 10,
  progressVerificationAlertThreshold: 5,
  rbiCriticalityWeights: { "حرجة جداً": 40, "مرتفعة": 25, "متوسطة": 10, "منخفضة": 0 },
  recencyWeightBrackets: [{ maxAgeDays: 7, weight: 1 }, { maxAgeDays: 30, weight: 0.7 }, { maxAgeDays: 90, weight: 0.4 }, { maxAgeDays: Infinity, weight: 0.15 }],
};

/* ============================================================
   ناقل الأحداث (Event Bus) — نظام نشر/اشتراك حقيقي وعامل فعلياً
   (لا وهمي)، ينفصل به "ماذا حدث" عن "من يتفاعل معه". يُستخدَم اليوم
   لفصل الآثار الجانبية (كإنشاء NCR تلقائياً) عن دالة الإضافة نفسها.
   نقطة امتداد حقيقية للمستقبل: عند وجود خادم حقيقي، هذه بالضبط نقطة
   الوصل الطبيعية لبثّ نفس الأحداث عبر WebSocket لأنظمة أخرى مشتركة،
   بلا أي تغيير في منطق العمل نفسه — فقط إضافة مُستمِع جديد هنا.
   ============================================================ */
const DigitalTwinEvents = createEventBus();

/* ============================================================
   مستودع بيانات التوأم الرقمي (Repository Pattern) — طبقة عزل حقيقية
   وعاملة اليوم بين منطق الأعمال وموقع التخزين الفعلي (STATE.data
   محلياً الآن). كل دالة عمل تنادي هذا المستودع، لا STATE.data مباشرة.

   نقطة الامتداد الحقيقية: عند بناء خادم حقيقي مستقبلاً (كما في خطة
   الانتقال المُسلَّمة سابقاً)، تُستبدَل هذه الكائنات الداخلية فقط
   بنسخة تستدعي fetch() لواجهة API حقيقية بنفس التوقيعات بالضبط —
   صفر تغيير مطلوب في أي دالة عمل تستخدم المستودع. هذا هو العقد
   (Contract) الذي يجب أن يلتزم به أي تطبيق مستقبلي لهذا المستودع.
   ============================================================ */
/* ============================================================
   محرك الحالة (Twin State Engine) — يسجّل كل انتقال حالة فعلي
   لعنصر (لا الحالة الحالية فقط، بل تاريخ كامل من التغييرات بالوقت
   الحقيقي لكل تغيير) — قدرة لم تكن موجودة إطلاقاً قبل هذا التصميم.
   ============================================================ */
const TwinStateEngine = {
  recordTransition(assetId, previousState, newState) {
    if (previousState === newState) return null; // لا تسجيل حين لا تغيير فعلي
    STATE.data.twinStateHistory = STATE.data.twinStateHistory || [];
    const entry = { id: uid(), assetId, previousState: previousState || null, newState, timestamp: Date.now() };
    STATE.data.twinStateHistory.push(entry);
    DigitalTwinEvents.emit("state:changed", entry);
    return entry;
  },
  getHistory(assetId) {
    return (STATE.data.twinStateHistory || []).filter((h) => h.assetId === assetId).sort((a, b) => b.timestamp - a.timestamp);
  },
  getTransitionCount(assetId) { return this.getHistory(assetId).length; },
};

const DigitalTwinRepository = {
  // -- العناصر (Assets) --
  getAssets(projectId) { return (STATE.data.projectAssets || []).filter((a) => !projectId || a.projectId === projectId); },
  getAssetById(id) { return (STATE.data.projectAssets || []).find((a) => a.id === id) || null; },
  saveAsset(asset) {
    if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية تعديل عناصر التوثيق الرقمي."); return null; }
    const isNew = !asset.id;
    const previous = isNew ? null : this.getAssetById(asset.id);
    if (isNew) asset.id = uid();
    const idx = (STATE.data.projectAssets || []).findIndex((a) => a.id === asset.id);
    if (idx >= 0) STATE.data.projectAssets[idx] = asset; else STATE.data.projectAssets.push(asset);
    if (previous) TwinStateEngine.recordTransition(asset.id, previous.status, asset.status);
    DigitalTwinEvents.emit(isNew ? "asset:created" : "asset:updated", asset);
    return asset;
  },
  // -- المسوحات (Reality Captures) --
  getCaptures(filter) {
    return (STATE.data.realityCaptures || []).filter((c) =>
      (!filter || !filter.projectId || c.projectId === filter.projectId) &&
      (!filter || !filter.assetId || c.assetId === filter.assetId));
  },
  addCapture(capture) {
    if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية إضافة مسوحات."); return null; }
    if (!capture.id) capture.id = uid();
    STATE.data.realityCaptures.push(capture);
    DigitalTwinEvents.emit("capture:added", capture);
    return capture;
  },
  // -- تقارير الانحراف (Deviation Reports) --
  getDeviations(assetId) { const asset = (STATE.data.projectAssets || []).find((a) => a.id === assetId); return (STATE.data.deviationReports || []).filter((d) => !assetId || matchesAssetIdentifier(d, asset)); },
  addDeviation(deviation) {
    if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية إضافة تقارير انحراف."); return null; }
    if (!deviation.id) deviation.id = uid();
    STATE.data.deviationReports.push(deviation);
    DigitalTwinEvents.emit("deviation:added", deviation);
    return deviation;
  },
  // -- التفتيش الذكي (Smart Inspections) --
  getInspections(assetId) { return (STATE.data.smartInspections || []).filter((i) => !assetId || i.assetId === assetId); },
  addInspection(inspection) {
    if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية إضافة تفتيشات."); return null; }
    if (!inspection.id) inspection.id = uid();
    STATE.data.smartInspections.push(inspection);
    DigitalTwinEvents.emit("inspection:added", inspection);
    if (inspection.overallResult === "مرفوض") DigitalTwinEvents.emit("inspection:rejected", inspection);
    return inspection;
  },
  // -- تقييمات المقاولين ومستشعرات IoT وسجلات الصيانة --
  getContractorEvaluations(projectId) { return (STATE.data.contractorEvaluations || []).filter((e) => !projectId || e.projectId === projectId); },
  getSensorReadings(projectId) { return (STATE.data.sensorReadings || []).filter((r) => !projectId || r.projectId === projectId); },
  getMaintenanceRecords(assetId) { return (STATE.data.maintenanceRecords || []).filter((m) => !assetId || m.assetId === assetId); },
};

/* ============================================================
   عقد المحوِّلات الخارجية (Reality Capture Adapter Contract) — تعريف
   صريح لما يجب أن يوفّره أي مصدر بيانات مسح خارجي مستقبلي (JSON، أو
   لاحقاً Firestore مباشر، أو استدعاء API حقيقي لخدمة مسح تجارية).
   المحوِّل الحالي (JSON) هو أول تطبيق حقيقي لهذا العقد، لا الوحيد
   الممكن مستقبلاً — أي محوِّل جديد يطبِّق نفس الدالتين فقط.
   ============================================================ */
const RealityCaptureAdapterRegistry = createAdapterRegistry("Reality Capture");
function registerRealityCaptureAdapter(name, adapter) { RealityCaptureAdapterRegistry.register(name, adapter); }
function getRealityCaptureAdapterFor(format) { return RealityCaptureAdapterRegistry.findFor(format); }

const PMS_EXTERNAL_RESULT_SCHEMA_VERSION = "1.0";
/* الصيغة الموثَّقة التي يجب أن يلتزم بها أي ملف JSON مستورَد من خدمة خارجية:
{
  "schemaVersion": "1.0",
  "source": "اسم الخدمة الخارجية (مثال: Buildots / OpenSpace / اسم مزوّد الدرون)",
  "realityCaptures": [ { "projectId", "assetCode", "captureType", "captureDate", "deviceInfo", "status", "resultSummary" } ],
  "deviationReports": [ { "projectId", "assetCode", "elementId", "deviationType", "designValue", "actualValue", "deviationPct", "location", "detectedAt" } ],
  "aiAnalysisResults": [ { "projectId", "analysisType", "resultSummary", "confidencePct", "receivedAt" } ]
}
*/

/* ---------------- بناء معاينة استيراد نتائج خارجية (بنفس فلسفة معاينة Primavera) ---------------- */
function buildExternalResultImportPreview(jsonText) {
  const warnings = [];
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch (e) { return { error: "الملف ليس JSON صالحاً: " + e.message }; }
  if (!parsed.schemaVersion) warnings.push("الملف لا يحدِّد رقم إصدار الصيغة (schemaVersion) — سيُفترض أنه متوافق، لكن تحقّق من ذلك يدوياً.");
  const findProjectByAnyRef = (ref) => STATE.data.projects.find((p) => p.id === ref || p.name === ref);

  const realityCaptures = (parsed.realityCaptures || []).map((r) => {
    const proj = findProjectByAnyRef(r.projectId);
    if (!proj) warnings.push(`سجلّ مسح/التقاط يشير لمشروع غير موجود: "${r.projectId}" — سيُتجاهَل عند التنفيذ.`);
    return Object.assign({}, r, { _resolvedProjectId: proj ? proj.id : null });
  });
  const deviationReports = (parsed.deviationReports || []).map((d) => {
    const proj = findProjectByAnyRef(d.projectId);
    if (!proj) warnings.push(`تقرير انحراف يشير لمشروع غير موجود: "${d.projectId}" — سيُتجاهَل عند التنفيذ.`);
    return Object.assign({}, d, { _resolvedProjectId: proj ? proj.id : null });
  });
  const aiAnalysisResults = (parsed.aiAnalysisResults || []).map((a) => {
    const proj = findProjectByAnyRef(a.projectId);
    if (!proj) warnings.push(`نتيجة تحليل ذكاء اصطناعي تشير لمشروع غير موجود: "${a.projectId}" — سيُتجاهَل عند التنفيذ.`);
    return Object.assign({}, a, { _resolvedProjectId: proj ? proj.id : null });
  });

  return {
    source: parsed.source || "غير محدَّد",
    realityCaptures, deviationReports, aiAnalysisResults, warnings,
    summary: {
      realityCaptureCount: realityCaptures.filter((r) => r._resolvedProjectId).length,
      deviationCount: deviationReports.filter((d) => d._resolvedProjectId).length,
      aiResultCount: aiAnalysisResults.filter((a) => a._resolvedProjectId).length,
      skippedCount: [...realityCaptures, ...deviationReports, ...aiAnalysisResults].filter((r) => !r._resolvedProjectId).length,
    },
  };
}

/* أول تطبيق حقيقي لعقد المحوِّلات أعلاه — يُطبِّع نفس منطق التحليل
   الموجود فعلاً (buildExternalResultImportPreview) خلف واجهة العقد
   الموحَّدة، بلا أي تغيير في السلوك — تنظيم صريح، لا إعادة كتابة. */
registerRealityCaptureAdapter("json-file", {
  supports: (format) => format === "json",
  parse: (rawText) => buildExternalResultImportPreview(rawText),
});

function applyExternalResultImport(preview) {
  if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية استيراد نتائج خارجية للتوثيق الرقمي."); return 0; }
  const now = Date.now();
  STATE.data.realityCaptures = STATE.data.realityCaptures || [];
  STATE.data.deviationReports = STATE.data.deviationReports || [];
  STATE.data.aiAnalysisResults = STATE.data.aiAnalysisResults || [];
  let created = 0;
  preview.realityCaptures.filter((r) => r._resolvedProjectId).forEach((r) => {
    STATE.data.realityCaptures.push({ id: uid(), projectId: r._resolvedProjectId, assetCode: r.assetCode || "", captureType: r.captureType || "أخرى", captureDate: r.captureDate || todayISO(), deviceInfo: r.deviceInfo || "", status: r.status || "مُعالَج ونتائجه جاهزة", resultSummary: r.resultSummary || "", detectedCompletionPct: r.detectedCompletionPct != null ? Number(r.detectedCompletionPct) : null, capturedBy: preview.source, updatedAt: now });
    created++;
  });
  preview.deviationReports.filter((d) => d._resolvedProjectId).forEach((d) => {
    STATE.data.deviationReports.push({ id: uid(), projectId: d._resolvedProjectId, assetCode: d.assetCode || "", elementId: d.elementId || "", deviationType: d.deviationType || "أخرى", designValue: d.designValue || "", actualValue: d.actualValue || "", deviationPct: Number(d.deviationPct) || 0, location: d.location || "", detectedBy: "تحليل ذكاء اصطناعي خارجي: " + preview.source, detectedAt: d.detectedAt || todayISO(), status: "مفتوح", updatedAt: now });
    created++;
  });
  preview.aiAnalysisResults.filter((a) => a._resolvedProjectId).forEach((a) => {
    STATE.data.aiAnalysisResults.push({ id: uid(), projectId: a._resolvedProjectId, source: preview.source, analysisType: a.analysisType || "أخرى", resultSummary: a.resultSummary || "", confidencePct: Number(a.confidencePct) || null, receivedAt: a.receivedAt || todayISO(), status: "جديد", updatedAt: now });
    created++;
  });
  logAudit("create", "externalAnalysis", "import-" + uid().slice(0, 4), `استيراد نتائج خارجية من "${preview.source}": ${created} سجل`);
  saveData(STATE.data);
  return created;
}

/* ---------------- فحص حقيقي وعملي: مطابقة نسبة الإنجاز المُطالَب بها في المستخلص مع النسبة المتتبَّعة في النظام، ومع أحدث رصد مسح فعلي إن وُجد ---------------- */
function getProgressVerificationAlertThreshold() { return DigitalTwinConfig.progressVerificationAlertThreshold; } // قراءة حيّة من الإعدادات، لا نسخة مُجمَّدة وقت التحميل (إصلاح ثغرة اكتُشفت في المراجعة الذاتية)
/* حساب نسبة إنجاز حقيقية مُشتقَّة من بيانات المهام الفعلية، مُوزَّنة بمدة كل مهمة —
   لا نسخة يدوية أخرى. هذا يمنح ميزة "التحقّق من التطابق" مرجعاً مستقلاً فعلياً
   يُقارَن به، بدل مقارنة رقمين يدويين ببعضهما (وهو ما كان يحدث فعلياً قبل هذا). */
function computeTaskWeightedCompletion(projectId) {
  const tasks = (STATE.data.tasks || []).filter((t) => t.projectId === projectId);
  if (!tasks.length) return null;
  let totalWeight = 0, weightedSum = 0;
  tasks.forEach((t) => {
    const duration = Math.max(1, daysBetween(t.start, t.end) || 1); // مدة صفرية أو غير محدَّدة تُحسَب بحدّها الأدنى يوماً واحداً بدل تصفيرها من الحساب بالكامل
    const completion = clamp(Number(t.completion || 0), 0, 100);
    totalWeight += duration;
    weightedSum += duration * completion;
  });
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function computeProgressVerification(certificateId) {
  const cert = STATE.data.certificates.find((c) => c.id === certificateId);
  if (!cert) return null;
  const project = STATE.data.projects.find((p) => p.id === cert.projectId);
  if (!project) return null;
  const claimedPct = Number(cert.cumulativeCompletionPercent) || 0;
  const taskWeightedPct = computeTaskWeightedCompletion(cert.projectId);
  const trackedPct = taskWeightedPct != null ? taskWeightedPct : (Number(project.completion) || 0);
  const trackedSource = taskWeightedPct != null ? "مُحتسَبة فعلياً من بيانات المهام (موزَّنة بالمدة)" : "الحقل اليدوي لنسبة إنجاز المشروع (لا توجد مهام مسجَّلة بعد لحساب رقم مستقل)";
  const variancePct = claimedPct - trackedPct;
  const threshold = getProgressVerificationAlertThreshold();
  let level = Math.abs(variancePct) > threshold * 2 ? "danger" : Math.abs(variancePct) > threshold ? "warn" : "good";

  // تقاطع إضافي حقيقي مع أحدث بيانات مسح فعلي للمشروع (5D) — طبقة تحقّق ثالثة مستقلة عن تتبّع النظام الداخلي
  const projectCaptures = (STATE.data.realityCaptures || []).filter((rc) => rc.projectId === cert.projectId && rc.detectedCompletionPct != null && rc.detectedCompletionPct !== "");
  let scannedPct = null, scannedVariancePct = null, scannedDate = null;
  if (projectCaptures.length) {
    const latest = projectCaptures.slice().sort((a, b) => (b.captureDate || "").localeCompare(a.captureDate || ""))[0];
    scannedPct = Number(latest.detectedCompletionPct);
    scannedVariancePct = claimedPct - scannedPct;
    scannedDate = latest.captureDate;
    if (Math.abs(scannedVariancePct) > threshold * 2 && level !== "danger") level = "danger";
  }
  return { claimedPct, trackedPct, trackedSource, variancePct, level, scannedPct, scannedVariancePct, scannedDate, hasScanCrossCheck: scannedPct != null };
}

/* ============================================================
   عارض BIM حقيقي — Autodesk Platform Services (APS، سابقاً Forge)
   ============================================================
   هذا عارض WebGL حقيقي يعمل فعلاً (نفس مكتبة Autodesk الرسمية
   المستخدَمة في Autodesk Construction Cloud نفسه) — لا محاكاة.

   القيد الصادق الوحيد هنا: لعرض نموذج حقيقي تحتاج (أ) رفع وترجمة
   ملف BIM لصيغة SVF عبر Model Derivative API (يحتاج حساب مطوّر APS
   وطلب خادم-إلى-خادم بمفتاح سرّي — لا يمكن تنفيذه من هذا المتصفح
   لنفس سبب رفض SAP/Primavera Cloud)، و(ب) رمز وصول (Access Token)
   صالح لمدة ساعة واحدة فقط قبل أن ينتهي، تحتاج لصقه هنا يدوياً وتجديده
   كل ساعة — هذا ليس نقص تنفيذ، بل قيد فعلي في تصميم OAuth الخاص بـAPS
   نفسه عند عدم وجود خادم وسيط يجدِّد الرمز تلقائياً بالنيابة عنك.
   ============================================================ */
let apsViewerInstance = null;
function initAPSViewer(token, urn, containerId) {
  if (typeof Autodesk === "undefined" || !Autodesk.Viewing) {
    alert("مكتبة عارض Autodesk لم تُحمَّل بعد — تحقق من اتصال الإنترنت وأعد المحاولة.");
    return;
  }
  const options = {
    env: "AutodeskProduction",
    api: "derivativeV2",
    getAccessToken: (onTokenReady) => { onTokenReady(token, 3600); },
  };
  Autodesk.Viewing.Initializer(options, () => {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (apsViewerInstance) { try { apsViewerInstance.finish(); } catch (e) { /* تجاهل */ } }
    const viewer = new Autodesk.Viewing.GuiViewer3D(container);
    viewer.start();
    apsViewerInstance = viewer;
    viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, (event) => {
      const dbIds = event.dbIdArray;
      STATE.apsSelectedDbId = (dbIds && dbIds.length) ? dbIds[0] : null;
      renderApp();
    });
    const documentId = urn.startsWith("urn:") ? urn : "urn:" + urn;
    Autodesk.Viewing.Document.load(documentId, (doc) => {
      const defaultModel = doc.getRoot().getDefaultGeometry();
      viewer.loadDocumentNode(doc, defaultModel);
      STATE.apsViewerStatus = "loaded";
      renderApp();
    }, (errorCode, errorMsg) => {
      STATE.apsViewerStatus = "error";
      STATE.apsViewerError = `فشل تحميل النموذج (رمز ${errorCode}): ${errorMsg}`;
      renderApp();
    });
  });
}
function launchAPSViewerFromForm() {
  const token = document.getElementById("aps-token-input").value.trim();
  const urn = document.getElementById("aps-urn-input").value.trim();
  if (!token || !urn) { alert("أدخل رمز الوصول (Access Token) ومُعرِّف النموذج (URN) أولاً."); return; }
  STATE.apsViewerStatus = "loading";
  STATE.apsViewerError = null;
  renderApp();
  setTimeout(() => initAPSViewer(token, urn, "aps-viewer-container"), 50); // بعد إعادة العرض ليكون الحاوي موجوداً في الصفحة
}

/* ============================================================
   التلوين الرباعي الأبعاد (4D) — يلوِّن عناصر النموذج الفعلية داخل
   العارض حسب حالة الجدول الزمني الحقيقية، عبر setThemingColor
   الموثَّقة رسمياً من Autodesk (لا محاكاة). يتطلّب نموذجاً محمَّلاً
   فعلاً في عارض BIM أولاً، وربط كل عنصر بـdbId من نموذج الأصول.
   ============================================================ */
function apply4DScheduleColoring() {
  if (!apsViewerInstance) { alert("حمِّل نموذج BIM أولاً من تبويب عارض BIM قبل تطبيق التلوين الزمني."); return; }
  if (typeof THREE === "undefined") { alert("مكتبة THREE (المُضمَّنة مع عارض Autodesk) غير محمَّلة بعد."); return; }
  const assets = filterByProject(STATE.data.projectAssets || []).filter((a) => a.dbId != null && a.dbId !== "");
  if (!assets.length) { alert("لا توجد عناصر مرتبطة بـdbId بعد — أضف مُعرِّف العنصر لكل أصل من سجل العناصر أولاً."); return; }
  const critical = criticalTaskIds(STATE.data.tasks || []);
  let coloredCount = 0;
  assets.forEach((asset) => {
    const task = (STATE.data.tasks || []).find((t) => t.id === asset.linkedTaskId);
    let color;
    if (!task) color = new THREE.Vector4(0.5, 0.5, 0.5, 0.3);
    else if (Number(task.completion) >= 100) color = new THREE.Vector4(0.18, 0.75, 0.44, 0.6);
    else if (critical.has(task.id)) color = new THREE.Vector4(0.9, 0.28, 0.3, 0.6);
    else if (Number(task.completion) > 0) color = new THREE.Vector4(0.96, 0.65, 0.14, 0.6);
    else color = new THREE.Vector4(0.36, 0.55, 0.93, 0.4);
    apsViewerInstance.setThemingColor(Number(asset.dbId), color);
    coloredCount++;
  });
  if (apsViewerInstance.impl && apsViewerInstance.impl.invalidate) apsViewerInstance.impl.invalidate(true, true, true);
  alert(`تم تلوين ${coloredCount} عنصر حسب حالته الزمنية الفعلية: أخضر=مكتمل، أحمر=على المسار الحرج، كهرماني=قيد التنفيذ، أزرق=لم يبدأ، رمادي=بلا نشاط مرتبط.`);
}
function clear4DColoring() {
  if (!apsViewerInstance) return;
  apsViewerInstance.clearThemingColors();
  if (apsViewerInstance.impl && apsViewerInstance.impl.invalidate) apsViewerInstance.impl.invalidate(true, true, true);
}

/* ============================================================
   عارض سحابة نقاط مبسَّط — مبني مباشرة على THREE.js الأساسية (لا
   Potree). حزمة Potree الحقيقية على npm ليست بديلاً بسيطاً لسطر
   واحد (تحتاج jQuery ونسخة THREE مُجمَّعة خاصة بها وعملية بناء
   كاملة) — بخلاف Firebase وMSAL وLeaflet وعارض Autodesk، فهذا
   ليس تكاملاً واقعياً بنفس السهولة، فبُني هذا البديل الأبسط عوضاً
   عنه، يدعم سحب دوران بسيط وتكبيراً، ومناسب لسحب نقاط متوسطة الحجم
   (آلاف إلى بضعة ملايين نقطة) لا عشرات الملايين كما تدعمه Potree
   الحقيقية عبر تقنية التدفق الهرمي (Octree Streaming) غير المُنفَّذة هنا.
   ============================================================ */
/* ============================================================
   تحليل حجمي حقيقي لسحابة النقاط — نموذج ارتفاع رقمي شبكي (Digital
   Elevation Model) — هي التقنية المعيارية الفعلية المستخدَمة في
   برمجيات المسح المساحي الحقيقية (كـPix4D وDroneDeploy) لقياس حجم
   المكاوم الترابية وأعمال الحفر، لا محاكاة ولا ذكاء اصطناعي مُتوهَّم.
   كل رقم هنا محسوب من إحداثيات النقاط الفعلية فقط.
   ============================================================ */
/* ============================================================
   طبقة تخزين سحابة النقاط — نفس نمط AIProviderRegistry بالضبط:
   الواجهة لا تعتمد على مزوِّد واحد. IndexedDB هو المزوِّد الحقيقي
   العامل محلياً اليوم؛ التخزين السحابي مُسجَّل بنفس العقد لإثبات
   قابلية الاستبدال الفعلية عند توفّر خادم حقيقي — بصدق كامل: يُرجِع
   سبب عدم التوفّر الآن، لا محاكاة وهمية لرفع سحابي غير موجود.
   ============================================================ */
const PointCloudStorageProviders = {};
function registerPointCloudStorageProvider(name, provider) {
  if (typeof provider.save !== "function" || typeof provider.load !== "function") {
    throw new Error(`مزوِّد تخزين سحابة النقاط "${name}" يجب أن يوفّر save()/load() ليلتزم بالعقد.`);
  }
  PointCloudStorageProviders[name] = provider;
}
function getActivePointCloudStorageProvider() {
  return PointCloudStorageProviders[STATE.pointCloudStoragePreference || "indexeddb"] || PointCloudStorageProviders.indexeddb;
}

registerPointCloudStorageProvider("indexeddb", {
  displayName: "تخزين محلي على هذا الجهاز (IndexedDB) — يعمل فعلياً الآن",
  staticallyAvailable: true,
  crossDevice: false,
  async save(key, points) {
    try { await idbPut(key, points); return { success: true }; }
    catch (e) { return { success: false, reason: e.message }; }
  },
  async load(key) {
    try { const points = await idbGet(key); return points ? { success: true, points } : { success: false, reason: "غير موجود." }; }
    catch (e) { return { success: false, reason: e.message }; }
  },
  async delete(key) {
    try { await idbPut(key, null); return { success: true }; }
    catch (e) { return { success: false, reason: e.message }; }
  },
});
registerPointCloudStorageProvider("cloud", {
  displayName: "تخزين سحابي مشترك بين كل الأجهزة (يحتاج خادماً — غير مُفعَّل بعد)",
  staticallyAvailable: false,
  crossDevice: true,
  async save() { return { success: false, reason: "لا خادم تخزين سحابي مُهيَّأ بعد لهذا النظام. عند توفّره، سيُستخدَم هذا المسار تلقائياً بلا تغيير في منطق العمل — البنية جاهزة الآن، تنفيذه الفعلي لاحقاً." }; },
  async load() { return { success: false, reason: "لا خادم تخزين سحابي مُهيَّأ بعد." }; },
  async delete() { return { success: false, reason: "لا خادم تخزين سحابي مُهيَّأ بعد." }; },
});
function listPointCloudStorageProviders() {
  return Object.entries(PointCloudStorageProviders).map(([key, p]) => ({ key, displayName: p.displayName, available: p.staticallyAvailable, crossDevice: p.crossDevice }));
}

function computePointCloudDEM(points, cellSize) {
  if (!points.length) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cols = Math.max(1, Math.ceil((maxX - minX) / cellSize));
  const rows = Math.max(1, Math.ceil((maxY - minY) / cellSize));
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
  points.forEach((p) => {
    const col = Math.min(cols - 1, Math.floor((p.x - minX) / cellSize));
    const row = Math.min(rows - 1, Math.floor((p.y - minY) / cellSize));
    if (grid[row][col] === null || p.z > grid[row][col]) grid[row][col] = p.z; // أعلى ارتفاع فعلي في كل خلية — النموذج المعياري لسطح المسح
  });
  return { grid, cols, rows, minX, minY, cellSize, pointCount: points.length };
}
function computeVolumeFromDEM(dem, referenceZ) {
  if (!dem) return { volume: 0, cellsWithData: 0, coveragePct: 0 };
  const cellArea = dem.cellSize * dem.cellSize;
  let volume = 0, cellsWithData = 0;
  for (let r = 0; r < dem.rows; r++) {
    for (let c = 0; c < dem.cols; c++) {
      const z = dem.grid[r][c];
      if (z === null) continue;
      cellsWithData++;
      volume += cellArea * (z - referenceZ); // موجب = مادة فوق المرجع (مكوم/بناء)، سالب = تحت المرجع (حفر)
    }
  }
  const totalCells = dem.rows * dem.cols;
  return { volume, cellsWithData, totalCells, coveragePct: totalCells ? Math.round((cellsWithData / totalCells) * 100) : 0 };
}
/* مقارنة قطع/دفن حقيقية بين مسحين لنفس المنطقة بتوقيتين مختلفين —
   الاستخدام الأكثر قيمة فعلياً لهذا النوع من التحليل: تتبّع تقدّم
   أعمال الحفر أو تغيّر حجم مكوم مواد بمرور الوقت. */
function computeCutFillComparison(pointsBefore, pointsAfter, cellSize) {
  const demBefore = computePointCloudDEM(pointsBefore, cellSize);
  const demAfter = computePointCloudDEM(pointsAfter, cellSize);
  if (!demBefore || !demAfter) return { available: false, reason: "أحد المسحين لا يحتوي نقاطاً صالحة." };
  // فحص سلامة أساسي: هل الصندوقان المحيطان للمسحين متقاربان بما يكفي لمقارنتهما بصدق؟
  // هذا ليس محاذاة (Registration) حقيقية — تحذير أمانة فقط، لا تصحيح تلقائي.
  const overlapWarning = Math.abs(demBefore.minX - demAfter.minX) > cellSize * 5 || Math.abs(demBefore.minY - demAfter.minY) > cellSize * 5;
  const cols = Math.min(demBefore.cols, demAfter.cols), rows = Math.min(demBefore.rows, demAfter.rows);
  const cellArea = cellSize * cellSize;
  let cutVolume = 0, fillVolume = 0, comparedCells = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const zBefore = demBefore.grid[r][c], zAfter = demAfter.grid[r][c];
      if (zBefore === null || zAfter === null) continue;
      comparedCells++;
      const diff = zAfter - zBefore;
      if (diff > 0) fillVolume += cellArea * diff; // ارتفاع زاد = إضافة/دفن
      else cutVolume += cellArea * -diff; // ارتفاع قلّ = إزالة/حفر
    }
  }
  return { available: true, cutVolume, fillVolume, netChange: fillVolume - cutVolume, comparedCells, overlapWarning,
    reason: overlapWarning ? "تنبيه: حدود المسحين المكانية متباعدة بشكل يستدعي التحقّق من محاذاة الالتقاط قبل الوثوق بهذه المقارنة." : null };
}
/* تحليل كثافة/تغطية سحابة النقاط فعلياً — لا افتراضاً، بل عدّ حقيقي
   للنقاط ضمن كل خلية من الصندوق المحيط الفعلي بالبيانات. */
function computePointCloudDensityAnalysis(points, cellSize) {
  if (!points.length) return { available: false };
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cols = Math.max(1, Math.ceil((maxX - minX) / cellSize));
  const rows = Math.max(1, Math.ceil((maxY - minY) / cellSize));
  const density = Array.from({ length: rows }, () => new Array(cols).fill(0));
  points.forEach((p) => {
    const col = Math.min(cols - 1, Math.floor((p.x - minX) / cellSize));
    const row = Math.min(rows - 1, Math.floor((p.y - minY) / cellSize));
    density[row][col]++;
  });
  let emptyCells = 0, sparseCells = 0, totalCells = rows * cols;
  const avgDensity = points.length / totalCells;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (density[r][c] === 0) emptyCells++;
    else if (density[r][c] < avgDensity * 0.2) sparseCells++;
  }
  return { available: true, totalCells, emptyCells, sparseCells, avgDensity, coveragePct: Math.round(((totalCells - emptyCells) / totalCells) * 100) };
}

function parsePointCloudXYZ(text) {
  const points = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every((n) => !isNaN(n))) {
      points.push({ x: parts[0], y: parts[1], z: parts[2],
        r: parts[3] != null ? parts[3] / 255 : 0.7, g: parts[4] != null ? parts[4] / 255 : 0.7, b: parts[5] != null ? parts[5] / 255 : 0.7 });
    }
  }
  return points;
}
let pcRenderState = null;
function initPointCloudViewer(points, containerId) {
  if (typeof THREE === "undefined") { alert("مكتبة THREE (المُضمَّنة مع عارض Autodesk) غير محمَّلة بعد — افتح عارض BIM أولاً في هذه الجلسة."); return false; }
  const container = document.getElementById(containerId);
  if (!container) return false;
  container.innerHTML = "";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.01, 10000);
  /* xr: true — عارض Autodesk نفسه نظام عرض مغلق لا يوثِّق نقطة امتداد WebXR،
     فتم استهداف عارض سحابة النقاط هذا تحديداً (THREE.js خام تحت السيطرة
     الكاملة هنا) بدل محاولة حقن WebXR داخل عارض BIM بلا أساس موثَّق. */
  const renderer = new THREE.WebGLRenderer({ antialias: true, xr: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  if (renderer.xr) renderer.xr.enabled = true; // مطلوب فعلياً وفق مواصفة WebXR Device API الموثَّقة

  const positions = new Float32Array(points.length * 3);
  const colors = new Float32Array(points.length * 3);
  let cx = 0, cy = 0, cz = 0;
  points.forEach((pt, i) => { cx += pt.x; cy += pt.y; cz += pt.z; });
  cx /= points.length; cy /= points.length; cz /= points.length;
  points.forEach((pt, i) => {
    positions[i * 3] = pt.x - cx; positions[i * 3 + 1] = pt.y - cy; positions[i * 3 + 2] = pt.z - cz;
    colors[i * 3] = pt.r; colors[i * 3 + 1] = pt.g; colors[i * 3 + 2] = pt.b;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true });
  const pointCloud = new THREE.Points(geometry, material);
  scene.add(pointCloud);

  geometry.computeBoundingSphere();
  const radius = (geometry.boundingSphere && geometry.boundingSphere.radius) || 10;
  camera.position.set(radius * 1.5, radius * 1.5, radius * 1.5);
  camera.lookAt(0, 0, 0);

  let isDragging = false, prevX = 0, prevY = 0;
  const onDown = (e) => { isDragging = true; prevX = e.clientX; prevY = e.clientY; };
  const onUp = () => { isDragging = false; };
  const onMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - prevX, dy = e.clientY - prevY;
    pointCloud.rotation.y += dx * 0.005;
    pointCloud.rotation.x += dy * 0.005;
    prevX = e.clientX; prevY = e.clientY;
  };
  const onWheel = (e) => { e.preventDefault(); camera.position.multiplyScalar(1 + e.deltaY * 0.001); };
  renderer.domElement.addEventListener("mousedown", onDown);
  renderer.domElement.addEventListener("mouseup", onUp);
  renderer.domElement.addEventListener("mousemove", onMove);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

  renderer.setAnimationLoop(() => { renderer.render(scene, camera); }); // setAnimationLoop إلزامي وفق مواصفة WebXR — لا يعمل XR مع requestAnimationFrame العادية

  if (pcRenderState) { try { pcRenderState.renderer.setAnimationLoop(null); } catch (e) { /* تجاهل */ } }
  pcRenderState = { scene, camera, renderer, pointCloud, container };
  return true;
}

/* ============================================================
   الواقع الافتراضي (WebXR) — استُهدِف عارض سحابة النقاط هذا تحديداً
   (THREE.js خام تحت السيطرة الكاملة)، لا عارض BIM (نظام Autodesk
   مغلق بلا نقطة امتداد WebXR موثَّقة). التحقّق من الدعم إلزامي قبل
   عرض أي زر — بيئة اختبار هذا النظام تحديداً (Chromium بلا جهاز XR
   حقيقي) لا تدعم navigator.xr إطلاقاً، وهذا تأكَّد منه صراحة قبل
   البناء، لا افتراضاً. لا يمكن التحقّق من جلسة VR فعلية حقيقية إلا
   على جهاز Meta Quest حقيقي أو مماثل — غير متاح في بيئة العمل هذه.
   ============================================================ */
async function checkWebXRSupport() {
  if (typeof navigator === "undefined" || !navigator.xr) return { supported: false, reason: "هذا المتصفح/الجهاز لا يدعم WebXR إطلاقاً (navigator.xr غير موجود) — يحتاج متصفح نظارة Meta Quest أو مماثل، أو متصفح حاسوب بامتداد WebXR Emulator." };
  try {
    const supported = await navigator.xr.isSessionSupported("immersive-vr");
    return supported ? { supported: true } : { supported: false, reason: "الجهاز يدعم WebXR لكن لا يدعم جلسة immersive-vr تحديداً." };
  } catch (e) {
    return { supported: false, reason: "تعذّر التحقّق من دعم WebXR: " + e.message };
  }
}
let activeXRSession = null;
async function enterVRMode() {
  if (!pcRenderState) { alert("افتح عارض سحابة نقاط أولاً."); return; }
  const check = await checkWebXRSupport();
  if (!check.supported) { alert("تعذّر الدخول لوضع VR: " + check.reason); return; }
  try {
    const session = await navigator.xr.requestSession("immersive-vr");
    await pcRenderState.renderer.xr.setSession(session);
    activeXRSession = session;
    session.addEventListener("end", () => { activeXRSession = null; renderApp(); });
    renderApp();
  } catch (e) {
    alert("فشل بدء جلسة VR: " + e.message);
  }
}
function exitVRMode() {
  if (activeXRSession) { try { activeXRSession.end(); } catch (e) { /* تجاهل */ } }
}

function triggerPointCloudImport() { document.getElementById("pointcloud-file-input").click(); }
/* ============================================================
   تخزين IndexedDB حقيقي — أحدث تقنية تخزين محلي فعلياً مدعومة في كل
   المتصفحات الحديثة، بسعة أكبر بكثير من localStorage (عادة مئات
   الميجابايت إلى غيغابايتات حسب المتصفح والجهاز، لا 5-10 م.ب فقط).
   يُستخدَم هنا تحديداً لحفظ ملفات سحابة النقاط المرفوعة — لم تكن
   تُحفَظ إطلاقاً سابقاً (تُفقَد عند إعادة تحميل الصفحة)، والآن تُستعاد
   تلقائياً. لا تغيير على طبقة بيانات النظام الأساسية (STATE.data
   تبقى في localStorage كما هي) — إضافة آمنة، لا استبدال محفوف بالمخاطر.
   ============================================================ */
const PMS_IDB_NAME = "pms_offline_store";
const PMS_IDB_STORE = "attachments";
function openPMSIndexedDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB غير مدعوم في هذا المتصفح.")); return; }
    const req = indexedDB.open(PMS_IDB_NAME, 1);
    req.onupgradeneeded = (e) => { e.target.result.createObjectStore(PMS_IDB_STORE); };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
function idbPut(key, value) {
  return openPMSIndexedDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(PMS_IDB_STORE, "readwrite");
    tx.objectStore(PMS_IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  }));
}
function idbGet(key) {
  return openPMSIndexedDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(PMS_IDB_STORE, "readonly");
    const req = tx.objectStore(PMS_IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function runVolumetricComparison(snapshotKey) {
  if (!STATE.currentPointCloudPoints) { alert("حمِّل سحابة نقاط حالية أولاً."); return; }
  const entry = (STATE.data.pointCloudSnapshotsIndex || []).find((s) => s.key === snapshotKey);
  const provider = PointCloudStorageProviders[entry ? entry.storageProvider : "indexeddb"] || getActivePointCloudStorageProvider();
  const result = await provider.load(snapshotKey);
  if (!result.success) {
    alert(`تعذّر تحميل اللقطة المحفوظة: ${result.reason}${entry && entry.savedByDevice ? " — قد تكون محفوظة على جهاز آخر فقط، ولا يمكن الوصول إليها من هذا الجهاز قبل توفّر تخزين سحابي حقيقي." : ""}`);
    return;
  }
  const cellSize = Number(STATE.volumetricCellSize) || 0.5;
  STATE.volumetricComparisonResult = computeCutFillComparison(result.points, STATE.currentPointCloudPoints, cellSize);
  renderApp();
}
function computeCurrentPointCloudVolume() {
  if (!STATE.currentPointCloudPoints) return null;
  const cellSize = Number(STATE.volumetricCellSize) || 0.5;
  const dem = computePointCloudDEM(STATE.currentPointCloudPoints, cellSize);
  const referenceZ = Number(STATE.volumetricReferenceZ) || 0;
  return computeVolumeFromDEM(dem, referenceZ);
}
/* تصنيف ثقة القياس بناءً على كثافة النقاط الفعلية — مبدأ بحثي حقيقي
   (أدبيات Scan-vs-BIM تُعامِل جودة/كثافة سحابة النقاط كشرط مسبق
   للثقة بأي قياس، لا كملاحظة ثانوية): قياس حجمي من منطقة شحيحة
   التغطية لا يحمل نفس ثقة قياس من منطقة كثيفة التغطية، حتى لو كان
   الرقم النهائي نفسه.
   ============================================================ */
function classifyMeasurementConfidence(densityAnalysis) {
  if (!densityAnalysis.available) return { level: "غير معروفة", reason: "لا بيانات تغطية كافية للحكم." };
  if (densityAnalysis.coveragePct >= 85) return { level: "عالية", reason: `تغطية ${densityAnalysis.coveragePct}% ضمن حدود المسح — كثافة نقاط كافية لقياس موثوق نسبياً.` };
  if (densityAnalysis.coveragePct >= 50) return { level: "متوسطة", reason: `تغطية ${densityAnalysis.coveragePct}% فقط — القياس معقول لكن يحتاج حذراً، فجوات حقيقية في المسح موجودة.` };
  return { level: "منخفضة", reason: `تغطية ${densityAnalysis.coveragePct}% فقط — القياس غير موثوق بثقة كافية؛ يُنصَح بمسح أكثر شمولاً قبل الاعتماد على هذا الرقم في قرارات حقيقية.` };
}
/* إغلاق حلقة البحث الفعلية المُثبَّتة في أدبيات Scan-vs-BIM: نتيجة
   المسح يجب أن "تُحدَّث في الجدول الزمني للمشروع" — لا مجرد رقم
   منعزل. هنا لا نزعم حساباً هندسياً دقيقاً تلقائياً (يحتاج تصنيفاً
   هندسياً حقيقياً لسحابة النقاط، غير مُتاح في متصفح)، بل نُقدِّم
   للمهندس بيانات حقيقية (تغطية، حجم) ليؤكد نسبة إنجاز حقيقية بنفسه،
   لا رقماً مُصطنَعاً يُقدِّمه النظام بثقة زائفة عن نفسه.
   ============================================================ */
function proposeTaskCompletionUpdateFromScan(assetId) {
  const asset = (STATE.data.projectAssets || []).find((a) => a.id === assetId);
  if (!asset || !asset.linkedTaskId) return { available: false, reason: "هذا العنصر غير مربوط بأي نشاط في الجدول الزمني." };
  const task = (STATE.data.tasks || []).find((t) => t.id === asset.linkedTaskId);
  if (!task) return { available: false, reason: "النشاط المرتبط غير موجود." };
  if (!STATE.currentPointCloudPoints) return { available: false, reason: "حمِّل سحابة نقاط أولاً." };
  const density = computePointCloudDensityAnalysis(STATE.currentPointCloudPoints, Number(STATE.volumetricCellSize) || 0.5);
  const confidence = classifyMeasurementConfidence(density);
  return { available: true, task, currentTaskCompletion: Number(task.completion || 0), confidence, coveragePct: density.available ? density.coveragePct : null };
}
function applyTaskCompletionUpdateFromScan(taskId, newCompletionPct) {
  if (STATE.user && !canEdit(STATE.user.role, "tasks")) { alert("دورك الحالي لا يملك صلاحية تعديل نسبة إنجاز المهام."); return; }
  const pct = clamp(Number(newCompletionPct), 0, 100);
  const task = (STATE.data.tasks || []).find((t) => t.id === taskId);
  if (!task) return;
  TaskRepository.update(taskId, Object.assign({}, task, { completion: pct }));
  showToast(`تم تحديث نسبة إنجاز «${task.name}» إلى ${pct}% بناءً على مسح ميداني حقيقي`, "success");
  renderApp();
}

function renderVolumetricAnalysisPanel() {
  if (!STATE.currentPointCloudPoints) return "";
  const cellSize = STATE.volumetricCellSize || 0.5;
  const referenceZ = STATE.volumetricReferenceZ || 0;
  const volume = computeCurrentPointCloudVolume();
  const density = computePointCloudDensityAnalysis(STATE.currentPointCloudPoints, cellSize);
  const confidence = classifyMeasurementConfidence(density);
  const confidenceColor = confidence.level === "عالية" ? "var(--good)" : confidence.level === "متوسطة" ? "var(--warn)" : "var(--danger)";
  return `<div class="frame p4" style="margin-bottom:14px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 8px;">📐 تحليل حجمي حقيقي (نموذج ارتفاع شبكي — التقنية المعيارية في برمجيات المسح الفعلية)</h3>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
      <label style="font-size:11.5px;color:var(--muted);">حجم الخلية (م): <input type="number" step="0.1" value="${cellSize}" style="width:60px;" onchange="STATE.volumetricCellSize=Number(this.value);renderApp();" /></label>
      <label style="font-size:11.5px;color:var(--muted);">مستوى المرجع Z (م): <input type="number" step="0.1" value="${referenceZ}" style="width:70px;" onchange="STATE.volumetricReferenceZ=Number(this.value);renderApp();" /></label>
      ${btn("💾 حفظ هذه اللقطة للمقارنة لاحقاً", "saveNamedPointCloudSnapshot()", "ghost", "sm")}
    </div>
    <div class="kpi-grid" style="margin-bottom:10px;">
      ${kpiCard({ label: "الحجم المحسوب (نسبةً للمرجع)", value: `${volume.volume.toFixed(1)} م³`, sub: volume.volume >= 0 ? "فوق المرجع" : "تحت المرجع (حفر)", level: "info" })}
      ${kpiCard({ label: "التغطية داخل حدود المسح", value: `${density.coveragePct}%`, sub: `${density.emptyCells} خلية فارغة من ${density.totalCells}`, level: density.coveragePct >= 90 ? "good" : density.coveragePct >= 60 ? "warn" : "danger" })}
    </div>
    <div style="background:#F5F6F9;border-radius:8px;padding:8px 10px;margin-bottom:10px;border-right:3px solid ${confidenceColor};">
      <span style="font-size:11.5px;color:${confidenceColor};font-weight:700;">ثقة القياس: ${confidence.level}</span>
      <span style="font-size:10.5px;color:var(--muted2);"> — ${esc(confidence.reason)}</span>
    </div>
    <p style="font-size:10px;color:var(--muted2);line-height:1.7;">حساب حقيقي من إحداثيات النقاط الفعلية (نموذج ارتفاع شبكي Digital Elevation Model) — الدقة تعتمد كلياً على كثافة المسح الأصلي وحجم الخلية المُختار. هذا ليس ذكاءً اصطناعياً ولا محاكاة، بل هندسة مساحية مباشرة.</p>
    ${STATE.digitalTwinLinkingAssetId ? renderScanToScheduleSection(STATE.digitalTwinLinkingAssetId) : ""}
    ${renderVolumetricComparisonSection()}
  </div>`;
}
function renderScanToScheduleSection(assetId) {
  const proposal = proposeTaskCompletionUpdateFromScan(assetId);
  if (!proposal.available) return "";
  return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border2);">
    <h4 style="font-size:12px;color:var(--info);margin:0 0 6px;">🔗 تحديث الجدول الزمني من هذا المسح — إغلاق الحلقة البحثية المعيارية</h4>
    <p style="font-size:11px;color:var(--muted);margin:0 0 8px;">النشاط المرتبط «${esc(proposal.task.name)}» — نسبته الحالية في الجدول: ${proposal.currentTaskCompletion}%. ثقة هذا المسح: ${proposal.confidence.level}${proposal.coveragePct != null ? ` (تغطية ${proposal.coveragePct}%)` : ""}.</p>
    <p style="font-size:10px;color:var(--muted2);margin:0 0 8px;">النظام لا يحسب نسبة الإنجاز تلقائياً من شكل سحابة النقاط (يحتاج تصنيفاً هندسياً حقيقياً غير مُتاح من متصفح) — أنت، المهندس، تُدخِل النسبة الحقيقية بناءً على ما رأيته فعلياً في هذا المسح.</p>
    <div style="display:flex;gap:8px;align-items:center;">
      <input type="number" id="scan-completion-input" min="0" max="100" value="${proposal.currentTaskCompletion}" style="width:70px;" />
      ${btn("✓ تحديث نسبة إنجاز النشاط", `applyTaskCompletionUpdateFromScan('${proposal.task.id}', document.getElementById('scan-completion-input').value)`, "primary", "sm")}
    </div>
  </div>`;
}
function renderVolumetricComparisonSection() {
  const comparison = STATE.volumetricComparisonResult;
  return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border2);">
    <h4 style="font-size:12px;color:#3D4759;margin:0 0 8px;">مقارنة قطع/دفن مع لقطة محفوظة سابقاً</h4>
    <div id="pointcloud-snapshots-list" style="font-size:11.5px;color:var(--muted);">جارِ تحميل اللقطات المحفوظة...</div>
    ${comparison ? (comparison.available ? `
      <div style="margin-top:10px;background:#F5F6F9;border-radius:8px;padding:10px;">
        ${comparison.reason ? `<div style="color:var(--warn);font-size:11px;margin-bottom:6px;">⚠ ${esc(comparison.reason)}</div>` : ""}
        <div style="display:flex;gap:16px;font-size:12px;">
          <span style="color:var(--danger);">حفر (Cut): ${comparison.cutVolume.toFixed(1)} م³</span>
          <span style="color:var(--good);">دفن/إضافة (Fill): ${comparison.fillVolume.toFixed(1)} م³</span>
          <span style="color:#0F1420;">صافي التغيّر: ${comparison.netChange > 0 ? "+" : ""}${comparison.netChange.toFixed(1)} م³</span>
        </div>
        <div style="font-size:10px;color:var(--muted2);margin-top:4px;">مقارنة على ${comparison.comparedCells} خلية مشتركة بين المسحين.</div>
      </div>` : `<p style="color:var(--danger);font-size:11px;">${esc(comparison.reason)}</p>`) : ""}
  </div>`;
}
function loadPointCloudSnapshotsList() {
  const allEntries = STATE.data.pointCloudSnapshotsIndex || [];
  const index = STATE.projectFilter !== "all" ? allEntries.filter((s) => !s.projectId || s.projectId === STATE.projectFilter) : allEntries;
  const el = document.getElementById("pointcloud-snapshots-list");
  if (!el) return;
  if (!index.length) { el.innerHTML = "لا توجد لقطات محفوظة بعد."; return; }
  el.innerHTML = index.map((s) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
    <span>${esc(s.label)} — ${new Date(s.savedAt).toLocaleDateString("ar")} (${s.pointCount.toLocaleString()} نقطة)${s.savedByDevice ? ` <span style="color:var(--muted2);font-size:9.5px;">(محفوظة على جهاز واحد فقط)</span>` : ""}</span>
    <button class="btn ghost sm" onclick="runVolumetricComparison('${s.key}')">مقارنة بالمسح الحالي</button>
  </div>`).join("");
}

function handlePointCloudFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const points = parsePointCloudXYZ(e.target.result);
    if (!points.length) { alert("لم يُعثر على نقاط صالحة في الملف — الصيغة المتوقَّعة: x y z [r g b] في كل سطر."); return; }
    STATE.pointCloudPointCount = points.length;
    STATE.currentPointCloudPoints = points; // إبقاء البيانات الفعلية متاحة للتحليل الحجمي، لا العدد فقط
    renderApp();
    setTimeout(() => initPointCloudViewer(points, "pointcloud-viewer-container"), 50);
    idbPut("last_pointcloud_raw", { text: e.target.result, fileName: file.name, savedAt: Date.now() })
      .then(() => { STATE.pointCloudSavedToIDB = true; renderApp(); })
      .catch((err) => console.warn("تعذّر حفظ سحابة النقاط في IndexedDB:", err.message));
  };
  reader.readAsText(file);
  input.value = "";
}
function saveNamedPointCloudSnapshot() {
  if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية حفظ لقطات سحابة النقاط."); return; }
  if (!STATE.currentPointCloudPoints) { alert("حمِّل سحابة نقاط أولاً قبل حفظها كنسخة مُسمَّاة للمقارنة."); return; }
  const label = prompt("اسم واضح لهذه اللقطة (مثال: «قبل الحفر — 2026/08/01»):");
  if (!label || !label.trim()) return;
  const provider = getActivePointCloudStorageProvider();
  const key = `pointcloud_snapshot_${uid()}`;
  provider.save(key, STATE.currentPointCloudPoints).then((result) => {
    if (!result.success) { alert("تعذّر حفظ اللقطة: " + result.reason); return; }
    // فهرس خفيف فقط (تسمية وتاريخ وعدد نقاط) يدخل في مزامنة النظام العادية — لا بيانات النقاط الثقيلة نفسها
    const linkedAssetId = STATE.digitalTwinLinkingAssetId || null;
    const linkedAsset = linkedAssetId ? (STATE.data.projectAssets || []).find((a) => a.id === linkedAssetId) : null;
    STATE.data.pointCloudSnapshotsIndex = STATE.data.pointCloudSnapshotsIndex || [];
    STATE.data.pointCloudSnapshotsIndex.push({ key, label: label.trim(), savedAt: Date.now(), pointCount: STATE.currentPointCloudPoints.length,
      projectId: linkedAsset ? linkedAsset.projectId : (STATE.projectFilter !== "all" ? STATE.projectFilter : null),
      assetId: linkedAssetId,
      storageProvider: STATE.pointCloudStoragePreference || "indexeddb", savedByDevice: !provider.crossDevice });
    if (linkedAssetId) STATE.digitalTwinLinkingAssetId = null; // اكتمل الربط، لا يستمر لأي لقطة أخرى لاحقة بالخطأ
    saveData(STATE.data);
    showToast(linkedAsset ? `تم حفظ المسح مربوطاً بعنصر «${linkedAsset.name}» تحديداً` : (provider.crossDevice ? "تم حفظ اللقطة — متاحة لكل الأجهزة" : "تم حفظ اللقطة على هذا الجهاز — الفهرس فقط مُزامَن، لا بيانات النقاط الثقيلة (تحتاج تخزيناً سحابياً حقيقياً)"), "success");
    renderApp();
  });
}
async function restoreLastPointCloud() {
  try {
    const saved = await idbGet("last_pointcloud_raw");
    if (!saved) { alert("لا توجد سحابة نقاط محفوظة مسبقاً على هذا الجهاز."); return; }
    const points = parsePointCloudXYZ(saved.text);
    if (!points.length) { alert("الملف المحفوظ لا يحتوي نقاطاً صالحة."); return; }
    STATE.pointCloudPointCount = points.length;
    STATE.currentPointCloudPoints = points;
    renderApp();
    setTimeout(() => initPointCloudViewer(points, "pointcloud-viewer-container"), 50);
  } catch (e) {
    alert("تعذّرت استعادة سحابة النقاط: " + e.message);
  }
}

/* ============================================================
   محرك التحقّق من التقدّم بالذكاء الاصطناعي (AI Progress Verification)
   ============================================================
   هذا ليس رؤية حاسوبية حقيقية ولا مطابقة هندسية لسحابة نقاط مقابل
   BIM (تلك تبقى غير محلولة صناعياً بثقة كاملة كما وُثِّق صراحة في
   التقارير السابقة). هذا محرك ارتباط وتجميع حقيقي: يأخذ (أ) نسبة
   إنجاز مرصودة فعلياً لكل عنصر (detectedCompletionPct — مُدخَلة
   يدوياً أو مستوردة من خدمة مسح خارجية)، (ب) نسبة الإنجاز المتوقَّعة
   من الجدول الزمني الحقيقي (منطق S-Curve خطي قياسي)، (ج) سبب أي
   انحراف من تقارير الانحراف المرتبطة فعلياً، (د) الأثر الزمني من
   محرك التوقّع الإحصائي الحقيقي المبني سابقاً — ويُخرِج تقريراً
   بنفس الصيغة المطلوبة بالضبط، بصدق كامل حول مصدر كل رقم فيه.
   ============================================================ */
/* منحنى S حقيقي بمعادلة تجميع جيب التمام (Cosine Ease) — نموذج رياضي
   قياسي ومعروف لتقريب منحنيات الإنجاز الإنشائية الفعلية (بداية بطيئة
   أثناء التعبئة، تسارع في منتصف التنفيذ، تباطؤ في الإغلاق)، بديل حقيقي
   للافتراض الخطي الساذج — لا اختراع، معادلة موصوفة رياضياً بالكامل:
   f(t) = 50 × (1 − cos(πt))، حيث t = الكسر الزمني المُنقضي (0 إلى 1). */
function computeSCurveExpectedProgress(fractionElapsed) {
  const t = Math.min(1, Math.max(0, fractionElapsed));
  return 50 * (1 - Math.cos(Math.PI * t));
}
function computeElementProgressReport(projectId, assetType) {
  const assets = DigitalTwinRepository.getAssets(projectId).filter((a) => a.assetType === assetType);
  if (!assets.length) return { available: false, reason: `لا توجد عناصر من نوع "${assetType}" مسجَّلة لهذا المشروع في سجل عناصر Digital Twin.` };

  const today = todayISO();
  let totalExpected = 0, totalDetected = 0, detectedCount = 0, totalConfidenceWeight = 0, weightedDetectedSum = 0;
  const causes = [];
  assets.forEach((asset) => {
    const task = (STATE.data.tasks || []).find((t) => t.id === asset.linkedTaskId);
    let expectedPct = 0;
    if (task && task.start && task.end) {
      const totalDays = daysBetween(task.start, task.end);
      const elapsedDays = dateDiffDays(task.start, today);
      expectedPct = computeSCurveExpectedProgress(elapsedDays / totalDays);
    }
    totalExpected += expectedPct;

    const captures = DigitalTwinRepository.getCaptures({ assetId: asset.id }).filter((rc) => rc.detectedCompletionPct != null && rc.detectedCompletionPct !== "")
      .sort((a, b) => (b.captureDate || "").localeCompare(a.captureDate || ""));
    if (captures.length) {
      const latest = captures[0];
      totalDetected += Number(latest.detectedCompletionPct);
      detectedCount++;
      // ثقة متضائلة مع قِدَم المسح — مسح عمره 90 يوماً لا يُحتسَب بنفس ثقة مسح بالأمس
      const ageDays = Math.max(0, dateDiffDays(latest.captureDate || today, today));
      const recencyWeight = (DigitalTwinConfig.recencyWeightBrackets.find((b) => ageDays <= b.maxAgeDays) || { weight: 0.15 }).weight;
      weightedDetectedSum += Number(latest.detectedCompletionPct) * recencyWeight;
      totalConfidenceWeight += recencyWeight;
    }

    DigitalTwinRepository.getDeviations(asset.id).filter((d) => d.status !== "مرفوض (غير صحيح)")
      .forEach((d) => causes.push(`${asset.name}: ${d.deviationType}${d.location ? " — " + d.location : ""}`));
  });

  const avgExpected = assets.length ? totalExpected / assets.length : 0;
  const avgDetected = totalConfidenceWeight > 0 ? weightedDetectedSum / totalConfidenceWeight : null;
  const simpleAvgDetected = detectedCount ? totalDetected / detectedCount : null;
  const deviationPct = avgDetected != null ? avgDetected - avgExpected : null;
  const recencyConfidence = totalConfidenceWeight > 0 ? Math.round((totalConfidenceWeight / detectedCount) * 100) : null;

  const project = STATE.data.projects.find((p) => p.id === projectId);
  const trend = project ? computeTrendForecast(project) : { available: false };
  let scheduleImpactNote = "غير متوفر (لا يوجد اتجاه إنجاز تاريخي كافٍ لهذا المشروع بعد).";
  if (deviationPct != null && deviationPct < -5 && trend.available) {
    scheduleImpactNote = `الاتجاه العام للمشروع يتوقَّع الانتهاء بتاريخ ${trend.forecastCompletionDate} (ثقة ${trend.confidenceLabel}) — انحراف هذا النوع من العناصر قد يُسهم في هذا التأخير المُتوقَّع، لا يُثبته وحده.`;
  } else if (deviationPct != null) {
    scheduleImpactNote = "لا يوجد مؤشر تأخير واضح مرتبط بهذا الانحراف حالياً.";
  }

  return {
    available: true, assetType, plannedCount: assets.length,
    expectedPct: Math.round(avgExpected * 10) / 10,
    detectedPct: avgDetected != null ? Math.round(avgDetected * 10) / 10 : null,
    detectedCoverage: detectedCount, totalCount: assets.length,
    deviationPct: deviationPct != null ? Math.round(deviationPct * 10) / 10 : null,
    recencyConfidencePct: recencyConfidence,
    recencyNote: recencyConfidence != null && recencyConfidence < 70 ? "بعض بيانات الرصد قديمة نسبياً — النسبة المرصودة مُرجَّحة بحداثتها، فتزن المسوحات الحديثة أكثر من القديمة تلقائياً." : null,
    causes: causes.slice(0, 5),
    scheduleImpactNote,
  };
}

/* ============================================================
   آلة الزمن للتوأم الرقمي (Digital Twin Time Machine) — لا ذكاء
   اصطناعي جديد هنا إطلاقاً، استعلام زمني حقيقي على بيانات المسوحات
   المُخزَّنة أصلاً (كل مسح له تاريخ ونسبة إنجاز مرصودة)، مجمَّعة
   لعرض تطوّر الإنجاز الفعلي عبر الزمن لعنصر أو نوع عناصر بأكمله.
   ============================================================ */
/* ============================================================
   آلة الزمن الحقيقية (Twin Time Machine) — لقطات فعلية (Snapshots)
   ومقارناتها، لا بثاً حياً وهمياً (غير ممكن بلا خادم كما وُثِّق
   صراحة). كل لقطة تُجمَّد فعلياً بحالة العناصر لحظة أخذها، والمقارنة
   بين لقطتين تُخرِج فرقاً حقيقياً (عناصر أُضيفت/حُذفت/تغيّرت حالتها).
   ============================================================ */
const TwinTimeMachine = {
  createSnapshot(projectId, label) {
    if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية أخذ لقطة توأم رقمي."); return null; }
    const assets = DigitalTwinRepository.getAssets(projectId).map((a) => ({ id: a.id, name: a.name, assetType: a.assetType, status: a.status, criticality: a.criticality }));
    const snapshot = { id: uid(), projectId, label: label || `لقطة ${todayISO()}`, takenAt: Date.now(), assets };
    STATE.data.twinSnapshots = STATE.data.twinSnapshots || [];
    STATE.data.twinSnapshots.push(snapshot);
    saveData(STATE.data);
    DigitalTwinEvents.emit("snapshot:created", snapshot);
    return snapshot;
  },
  getSnapshots(projectId) {
    return (STATE.data.twinSnapshots || []).filter((s) => s.projectId === projectId).sort((a, b) => b.takenAt - a.takenAt);
  },
  compareSnapshots(snapshotIdA, snapshotIdB) {
    const a = (STATE.data.twinSnapshots || []).find((s) => s.id === snapshotIdA);
    const b = (STATE.data.twinSnapshots || []).find((s) => s.id === snapshotIdB);
    if (!a || !b) return { available: false, reason: "لقطة واحدة أو كلاهما غير موجودة." };
    const changes = [];
    const bAssetsById = {};
    b.assets.forEach((asset) => { bAssetsById[asset.id] = asset; });
    a.assets.forEach((assetA) => {
      const assetB = bAssetsById[assetA.id];
      if (!assetB) { changes.push({ assetId: assetA.id, name: assetA.name, type: "removed" }); return; }
      if (assetA.status !== assetB.status) changes.push({ assetId: assetA.id, name: assetA.name, type: "status-changed", from: assetA.status, to: assetB.status });
      delete bAssetsById[assetA.id];
    });
    Object.values(bAssetsById).forEach((assetB) => changes.push({ assetId: assetB.id, name: assetB.name, type: "added" }));
    return { available: true, snapshotA: a, snapshotB: b, changes, unchangedCount: a.assets.length - changes.filter((c) => c.type !== "added").length };
  },
};

function computeRealityTimeline(projectId, assetType) {
  const assets = (STATE.data.projectAssets || []).filter((a) => a.projectId === projectId && (!assetType || a.assetType === assetType));
  const assetIds = new Set(assets.map((a) => a.id));
  const captures = (STATE.data.realityCaptures || []).filter((rc) => rc.projectId === projectId && assetIds.has(rc.assetId) && rc.detectedCompletionPct != null && rc.detectedCompletionPct !== "");
  if (!captures.length) return { available: false, reason: "لا توجد مسوحات برصد إنجاز فعلي مسجَّلة لهذا النوع من العناصر بعد." };

  const byDate = {};
  captures.forEach((rc) => {
    const d = rc.captureDate || "غير محدَّد";
    byDate[d] = byDate[d] || [];
    byDate[d].push(Number(rc.detectedCompletionPct));
  });
  const timeline = Object.keys(byDate).sort().map((date) => {
    const values = byDate[date];
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    return { date, avgDetectedPct: Math.round(avg * 10) / 10, sampleCount: values.length };
  });
  return { available: true, assetType: assetType || "كل العناصر", timeline, totalCapturePoints: captures.length };
}

/* ============================================================
   خيارات التعافي الزمني — تقدير تقريبي صريح باستخدام أسعار الموارد
   الحقيقية المُسجَّلة، لا خوارزمية توزيع/تسريع موارد مُثبَتة (Resource
   Crashing حقيقي مسألة بحثية بذاتها في إدارة المشاريع). كل رقم هنا
   مُعلَّم صراحة كتقدير تقريبي يحتاج مراجعة مهندس، لا قراراً جاهزاً.
   ============================================================ */
function generateRecoveryOptions(projectId) {
  const tasks = ScheduleRepository.getTasks(projectId);
  let cpm = { critical: new Set(), slack: {} };
  try { cpm = computeCriticalPath(tasks); } catch (e) { /* جدول فارغ أو دائري */ }
  const today = todayISO();
  const criticalDelayed = tasks.filter((t) => cpm.critical.has(t.id) && Number(t.completion) < 100 && t.end && t.end < today);
  if (!criticalDelayed.length) return { available: false, reason: "لا توجد أنشطة على المسار الحرج متأخرة فعلياً حالياً تحتاج خيارات تعافٍ." };

  const targetTask = criticalDelayed.sort((a, b) => a.end.localeCompare(b.end))[0];
  const delayDays = Math.abs(dateDiffDays(targetTask.end, today));
  const remainingDays = Math.max(delayDays, 5);
  const assignedResources = (STATE.data.resourcePool || []).filter((r) => r.assignedProjectId === projectId && (r.type === "عامل" || r.type === "معدة"));
  const avgDailyRate = assignedResources.length ? assignedResources.reduce((s, r) => s + Number(r.dailyRate || 0), 0) / assignedResources.length : 0;
  const option1Cost = Math.round(avgDailyRate * remainingDays);
  const option1Recovery = Math.round(remainingDays * ScheduleConfig.recoveryHeuristicExpediteFactor);

  return {
    available: true, taskName: targetTask.name, delayDays,
    options: [
      { label: "تسريع بمورد إضافي من نفس نوع الموارد المُعيَّنة حالياً", costEstimate: option1Cost, scheduleRecoveryDays: option1Recovery,
        note: avgDailyRate > 0 ? `مبني على متوسط السعر اليومي الفعلي للموارد المُعيَّنة (${fmtMoney(avgDailyRate)}/يوم) — تقدير تقريبي بافتراض تسريع 30% تقريبياً، لا خوارزمية توزيع موارد مُثبَتة.` : "لا توجد موارد مُعيَّنة لهذا المشروع بعد لتقدير التكلفة منها." },
      { label: "إعادة ترتيب: نقل مورد من نشاط غير حرج له فائض زمني", costEstimate: 0, scheduleRecoveryDays: null,
        note: "يحتاج مراجعة هندسية مباشرة لجدوى النقل الفعلية — لا يمكن تقدير الأثر رقمياً دون تحليل تبعية يدوي." },
    ],
    disclaimer: "هذه تقديرات تقريبية أولية لدعم نقاش الإدارة، لا توصية نهائية مُعتمَدة — أي قرار فعلي يحتاج مراجعة مهندس التخطيط.",
  };
}

/* ============================================================
   تقرير فجوات التغطية — يحدِّد بالضبط أي عناصر لم تُمسَح إطلاقاً
   بعد، لتوجيه أولوية الرصد القادم. لا ذكاء اصطناعي، استعلام مباشر
   يقارن سجل عناصر التوأم الرقمي كاملاً بسجل المسوحات المرتبطة به.
   ============================================================ */
/* ============================================================
   شجرة تسلسل هرمي حقيقية للعناصر — استخدام حقل parentAssetId
   الموجود أصلاً، بدل الجدول المسطَّح فقط. مع حماية صريحة من الحلقات
   الدائرية (عنصر يشير لنفسه أو لسلسلة تعود لنفسها) — حالة بيانات
   حقيقية ممكنة الحدوث يجب عدم كسر الواجهة بسببها.
   ============================================================ */
/* خطر متسلسل عبر التسلسل الهرمي للعناصر — لو عنصر فرعي حرج فيه مشكلة
   حقيقية، يجب أن يعرف العنصر الأصل بذلك، لا أن يظهر سليماً بينما
   أحد مكوّناته الفرعية يحمل خطراً فعلياً. حماية من الحلقات الدائرية
   بنفس منطق buildAssetTree المُثبَت، لا تكرار له. */
function computeCascadingAssetRisk(assetId, _visited) {
  const visited = _visited || new Set();
  if (visited.has(assetId)) return { ownScore: null, worstDescendant: null }; // حلقة دائرية — توقّف بأمان
  visited.add(assetId);
  const ownScore = computeAssetIntelligenceScore(assetId);
  const children = (STATE.data.projectAssets || []).filter((a) => a.parentAssetId === assetId);
  let worstDescendant = null;
  children.forEach((child) => {
    const childResult = computeCascadingAssetRisk(child.id, visited);
    const candidates = [childResult.ownScore, childResult.worstDescendant].filter(Boolean);
    candidates.forEach((c) => { if (!worstDescendant || c.riskScore > worstDescendant.riskScore) worstDescendant = c; });
  });
  return { ownScore, worstDescendant };
}
function computeEffectiveAssetRisk(assetId) {
  const result = computeCascadingAssetRisk(assetId);
  if (!result.ownScore) return null;
  if (!result.worstDescendant || result.worstDescendant.riskScore <= result.ownScore.riskScore) {
    return Object.assign({}, result.ownScore, { inheritedFrom: null });
  }
  // خطر موروث من عنصر فرعي يتجاوز خطر العنصر نفسه — يجب أن يظهر هذا بصراحة، لا أن يُخفى داخل رقم واحد بلا تفسير
  return Object.assign({}, result.ownScore, {
    riskScore: Math.max(result.ownScore.riskScore, result.worstDescendant.riskScore),
    level: result.worstDescendant.level === "danger" || result.ownScore.level === "danger" ? "danger" : result.worstDescendant.level === "warn" || result.ownScore.level === "warn" ? "warn" : "good",
    inheritedFrom: result.worstDescendant.assetName,
    signals: [...result.ownScore.signals, { type: "INFERENCE", severity: result.worstDescendant.level, text: `عنصر فرعي «${result.worstDescendant.assetName}» يحمل خطراً حقيقياً (${result.worstDescendant.riskScore} نقطة) ينعكس على هذا العنصر الأصل.` }],
  });
}

/* مركز قيادة التوثيق الرقمي — تجميع حقيقي لكل عناصر المشروع بحسب
   الخطر الفعلي المُحتسَب، لا عرض قائمة مسطَّحة بلا ترتيب أو أولوية. */
function computeDigitalTwinCommandCenter(projectId) {
  const assets = (STATE.data.projectAssets || []).filter((a) => a.projectId === projectId);
  if (!assets.length) return { totalAssets: 0, topRisks: [], byStatus: {}, byCriticality: {} };
  const scored = assets.map((a) => computeEffectiveAssetRisk(a.id)).filter(Boolean);
  const topRisks = scored.filter((s) => s.riskScore > 0).sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);
  const byStatus = {}, byCriticality = {};
  assets.forEach((a) => {
    byStatus[a.status || "غير محدَّد"] = (byStatus[a.status || "غير محدَّد"] || 0) + 1;
    byCriticality[a.criticality || "متوسطة"] = (byCriticality[a.criticality || "متوسطة"] || 0) + 1;
  });
  return { totalAssets: assets.length, topRisks, byStatus, byCriticality, healthyCount: scored.filter((s) => s.level === "good").length, dangerCount: scored.filter((s) => s.level === "danger").length };
}

function buildAssetTree(assets) {
  const byId = {};
  assets.forEach((a) => { byId[a.id] = Object.assign({}, a, { children: [] }); });
  const isCircular = (assetId) => {
    let current = byId[assetId];
    const visited = new Set();
    let hops = 0;
    while (current && current.parentAssetId) {
      if (visited.has(current.parentAssetId) || current.parentAssetId === assetId || hops > 100) return true;
      visited.add(current.parentAssetId);
      current = byId[current.parentAssetId];
      hops++;
    }
    return false;
  };
  const roots = [];
  assets.forEach((a) => {
    const hasValidParent = a.parentAssetId && byId[a.parentAssetId] && !isCircular(a.id);
    if (hasValidParent) byId[a.parentAssetId].children.push(byId[a.id]);
    else roots.push(byId[a.id]);
  });
  return roots;
}

/* ============================================================
   محرك العلاقات (Twin Relationship Engine) — استعلام حقيقي على شكل
   رسم بياني (Graph) فوق الحقول المرتبطة الموجودة أصلاً (parentAssetId،
   linkedTaskId، linkedContractId، linkedBudgetItemId) — لا بنية بيانات
   رسم بياني منفصلة جديدة (غير ضرورية لحجم البيانات الحالي)، بل طبقة
   استعلام حقيقية توفّر تجاوزاً (Traversal) وتحليل أثر (Impact Analysis)
   فوق البيانات العلائقية البسيطة الموجودة فعلاً.
   ============================================================ */
const TwinRelationshipEngine = {
  getRelationships(assetId) {
    const asset = DigitalTwinRepository.getAssetById(assetId);
    if (!asset) return [];
    const rels = [];
    if (asset.parentAssetId) rels.push({ type: "parent", targetType: "asset", targetId: asset.parentAssetId });
    DigitalTwinRepository.getAssets(asset.projectId).filter((a) => a.parentAssetId === assetId).forEach((child) => rels.push({ type: "child", targetType: "asset", targetId: child.id }));
    if (asset.linkedTaskId) rels.push({ type: "linkedTask", targetType: "task", targetId: asset.linkedTaskId });
    if (asset.linkedContractId) rels.push({ type: "linkedContract", targetType: "contract", targetId: asset.linkedContractId });
    if (asset.linkedBudgetItemId) rels.push({ type: "linkedBudget", targetType: "budgetItem", targetId: asset.linkedBudgetItemId });
    return rels;
  },
  traverseDescendants(assetId, maxDepth) {
    const limit = maxDepth || 20;
    const asset = DigitalTwinRepository.getAssetById(assetId);
    const projectId = asset ? asset.projectId : null;
    const visited = new Set([assetId]); // حماية من الحلقات الدائرية — نفس مبدأ buildAssetTree
    const result = [];
    let frontier = [assetId];
    let depth = 0;
    while (frontier.length && depth < limit) {
      const nextFrontier = [];
      frontier.forEach((id) => {
        DigitalTwinRepository.getAssets(projectId).filter((a) => a.parentAssetId === id).forEach((child) => {
          if (!visited.has(child.id)) { visited.add(child.id); result.push(child); nextFrontier.push(child.id); }
        });
      });
      frontier = nextFrontier;
      depth++;
    }
    return result;
  },
  computeImpactAnalysis(assetId) {
    const asset = DigitalTwinRepository.getAssetById(assetId);
    if (!asset) return { available: false, reason: "العنصر غير موجود." };
    const descendants = this.traverseDescendants(assetId);
    const linkedTask = asset.linkedTaskId ? (STATE.data.tasks || []).find((t) => t.id === asset.linkedTaskId) : null;
    const openDeviations = DigitalTwinRepository.getDeviations(assetId).filter((d) => d.status !== "مغلق" && d.status !== "مرفوض (غير صحيح)");
    return {
      available: true, assetId, assetName: asset.name,
      descendantCount: descendants.length, descendants: descendants.slice(0, 20),
      linkedTaskAtRisk: !!(linkedTask && Number(linkedTask.completion) < 100),
      linkedTaskName: linkedTask ? linkedTask.name : null,
      openDeviationCount: openDeviations.length,
    };
  },
};

/* ============================================================
   واجهة مزوِّدات معالجة سحابة النقاط (PointCloudProvider Interface)
   ============================================================
   عقد صريح لقدرات معالجة سحابة نقاط حقيقية (تسجيل، تصنيف، تجزئة،
   تحليل انحراف، بث، معالجة GPU) — هذه القدرات غير موجودة محلياً
   بصدق كامل (تحتاج خدمات خلفية حقيقية كما وُثِّق مراراً)، لذا لا
   يُسجَّل هنا أي مزوِّد محلي يزعم دعمها. الواجهة نفسها حقيقية وقابلة
   للاستعلام الآن — أي خدمة خلفية مستقبلية تُسجِّل نفسها هنا بلا أي
   تغيير في بقية النظام (عارض سحابة النقاط المبني فعلاً منفصل تماماً
   عن هذه الواجهة، فهو "عرض" لا "معالجة" — تمييز مقصود ودقيق).
   ============================================================ */
const POINT_CLOUD_PROCESSING_CAPABILITIES = ["registration", "segmentation", "classification", "deviationAnalysis", "streaming", "gpuProcessing"];
const PointCloudProviderRegistry = {};
function registerPointCloudProvider(name, provider) {
  if (!Array.isArray(provider.supportedCapabilities) || typeof provider.execute !== "function") {
    throw new Error(`مزوِّد سحابة النقاط "${name}" يجب أن يوفّر supportedCapabilities (مصفوفة) ودالة execute().`);
  }
  PointCloudProviderRegistry[name] = provider;
}
function getPointCloudProviderFor(capability) {
  return Object.values(PointCloudProviderRegistry).find((p) => p.supportedCapabilities.includes(capability)) || null;
}
function isPointCloudCapabilityAvailable(capability) { return getPointCloudProviderFor(capability) !== null; }

/* ============================================================
   واجهة مزوِّدات التنبؤ (PredictionProvider Interface)
   ============================================================
   بخلاف سحابة النقاط، بعض قدرات التنبؤ حقيقية وتعمل محلياً فعلاً
   (توقّع التأخير بالانحدار الإحصائي، ترتيب أولوية الفحص) — تُسجَّل
   كمزوِّد محلي حقيقي أدناه، لا وهمي. غيرها (تنبؤ تجاوز التكلفة بذكاء
   اصطناعي حقيقي، تنبؤ عطل معدات) غير مُسجَّل إطلاقاً — بصراحة كاملة،
   لا مزوِّد زائف يزعم دعمها.
   ============================================================ */
const PredictionProviderRegistry = {};
function registerPredictionProvider(name, provider) {
  if (!Array.isArray(provider.supportedCapabilities) || typeof provider.execute !== "function") {
    throw new Error(`مزوِّد التنبؤ "${name}" يجب أن يوفّر supportedCapabilities (مصفوفة) ودالة execute().`);
  }
  PredictionProviderRegistry[name] = provider;
}
function getPredictionProviderFor(capability) {
  return Object.values(PredictionProviderRegistry).find((p) => p.supportedCapabilities.includes(capability)) || null;
}
registerPredictionProvider("statistical-heuristic", {
  supportedCapabilities: ["delayPrediction", "inspectionPriorityScoring"],
  confidenceNote: "إحصاء حقيقي (انحدار خطي، ترجيح حرجية) — ليس تعلّماً آلياً، ولا يُقدِّم نفسه كذلك.",
  execute(capability, input) {
    if (capability === "delayPrediction") return computeTrendForecast(input.project);
    if (capability === "inspectionPriorityScoring") return computeInspectionPriorityRanking(input.projectId);
    throw new Error(`القدرة "${capability}" غير مدعومة من هذا المزوِّد.`);
  },
});

function computeScanCoverageGaps(projectId) {
  const assets = DigitalTwinRepository.getAssets(projectId);
  if (!assets.length) return { available: false, reason: "لا توجد عناصر Digital Twin مسجَّلة لهذا المشروع بعد." };
  const scannedAssetIds = new Set(DigitalTwinRepository.getCaptures({ projectId }).filter((rc) => rc.assetId).map((rc) => rc.assetId));
  const neverScanned = assets.filter((a) => !scannedAssetIds.has(a.id));
  const byType = {};
  neverScanned.forEach((a) => { byType[a.assetType || "غير مصنَّف"] = (byType[a.assetType || "غير مصنَّف"] || 0) + 1; });
  return {
    available: true, totalAssets: assets.length, scannedCount: assets.length - neverScanned.length, neverScannedCount: neverScanned.length,
    neverScannedByType: Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    neverScannedList: neverScanned.slice(0, 30),
  };
}

/* ============================================================
   مقارنة متعدّدة المصادر لعنصر واحد — كل المسوحات المرتبطة به عبر
   كل الأنواع والتواريخ جنباً إلى جنب (ليزر، درون، 360°، يدوي)، مع
   أي انحراف مسجَّل — دمج على مستوى البيانات، لا هندسي، كما وُضِّح
   صراحة في التقارير السابقة (لا مطابقة إحداثيات فعلية بين المصادر).
   ============================================================ */
function getScanConflictThreshold() { return DigitalTwinConfig.scanConflictThresholdPct; } // نفس الإصلاح — قراءة حيّة لا نسخة مُجمَّدة
/* ============================================================
   نقاط ذكاء العنصر (Asset Intelligence Score) — تركيب حقيقي لثلاث
   إشارات فعلية مستقلة عن العنصر الواحد: حالة النشاط الزمني المرتبط،
   انحراف التكلفة للبند المرتبط، وتاريخ الانحرافات الفعلي من المسوحات
   — لا رقم واحد مُصطنَع، بل تجميع مُفسَّر لأسباب حقيقية قابلة للتتبّع.
   ============================================================ */
function computeAssetIntelligenceScore(assetId) {
  if (_digitalTwinRenderCache.intelligenceScore[assetId] !== undefined) return _digitalTwinRenderCache.intelligenceScore[assetId];
  const result = computeAssetIntelligenceScoreUncached(assetId);
  _digitalTwinRenderCache.intelligenceScore[assetId] = result;
  return result;
}
function computeAssetIntelligenceScoreUncached(assetId) {
  const asset = (STATE.data.projectAssets || []).find((a) => a.id === assetId);
  if (!asset) return null;
  const signals = [];
  let riskPoints = 0;

  if (asset.linkedTaskId) {
    const task = (STATE.data.tasks || []).find((t) => t.id === asset.linkedTaskId);
    if (task) {
      const isOverdue = task.end && task.end < todayISO() && Number(task.completion || 0) < 100;
      const isCritical = criticalTaskIds(STATE.data.tasks || []).has(task.id);
      if (isOverdue) { riskPoints += 30; signals.push({ type: "FACT", severity: "danger", text: `النشاط المرتبط «${task.name}» متأخر عن تاريخ نهايته المخطَّط (${task.end}).` }); }
      if (isCritical) { riskPoints += 20; signals.push({ type: "CALCULATION", severity: "warn", text: `النشاط المرتبط على المسار الحرج للمشروع — أي تأخير فيه يؤخِّر تاريخ الانتهاء الكلي.` }); }
      if (!isOverdue && !isCritical) signals.push({ type: "FACT", severity: "good", text: `النشاط المرتبط «${task.name}» ضمن الجدول الزمني الطبيعي حالياً.` });
    }
  }

  if (asset.linkedBudgetItemId) {
    const budgetItem = (STATE.data.budgetItems || []).find((b) => b.id === asset.linkedBudgetItemId);
    if (budgetItem) {
      const budget = Number(budgetItem.budget || 0), actual = Number(budgetItem.actual || 0);
      const overrunPct = budget > 0 ? ((actual - budget) / budget) * 100 : 0;
      if (overrunPct > 10) { riskPoints += 25; signals.push({ type: "CALCULATION", severity: "danger", text: `بند التكلفة المخصَّص «${budgetItem.category}» تجاوز الميزانية بنسبة ${overrunPct.toFixed(1)}% (${fmtMoney(actual)} من ${fmtMoney(budget)}).` }); }
      else if (overrunPct > 0) { riskPoints += 10; signals.push({ type: "CALCULATION", severity: "warn", text: `بند التكلفة تجاوز الميزانية بنسبة ${overrunPct.toFixed(1)}% حتى الآن.` }); }
      else signals.push({ type: "FACT", severity: "good", text: `بند التكلفة ضمن الميزانية المخصَّصة (${fmtMoney(actual)} من ${fmtMoney(budget)}).` });
    }
  }

  const scanHistory = computeAssetScanHistory(assetId);
  if (scanHistory.available) {
    if (scanHistory.deviationCount > 0) { riskPoints += Math.min(25, scanHistory.deviationCount * 8); signals.push({ type: "FACT", severity: scanHistory.deviationCount > 2 ? "danger" : "warn", text: `${scanHistory.deviationCount} انحراف مسجَّل فعلياً من مسوحات الواقع الإنشائي لهذا العنصر تحديداً.` }); }
    if (scanHistory.conflicts.length) { riskPoints += 10; signals.push({ type: "INFERENCE", severity: "warn", text: `تعارض بين مصادر مسح مختلفة في تاريخ واحد — يستدعي مراجعة يدوية لتحديد المصدر الأدق.` }); }
  }

  const trend = computeAssetHealthTrend(assetId);
  if (trend.available && trend.trendDirection === "متدهور") {
    riskPoints += Math.min(20, trend.deviationTrend * 5);
    signals.push({ type: "INFERENCE", severity: "warn", text: `اتجاه طولي متدهور: زادت الانحرافات المسجَّلة بمقدار ${trend.deviationTrend} عبر ${trend.scanCount} مسوحات فعلية من ${trend.firstDate} إلى ${trend.lastDate} — ليست حالة لحظية، بل تراكم فعلي.` });
  } else if (trend.available && trend.trendDirection === "متحسِّن") {
    signals.push({ type: "FACT", severity: "good", text: `اتجاه طولي متحسِّن: انخفضت الانحرافات المسجَّلة عبر ${trend.scanCount} مسوحات متعاقبة فعلية.` });
  }

  if (asset.criticality === "حرجة جداً" && riskPoints > 0) { riskPoints += 15; signals.push({ type: "INFERENCE", severity: "danger", text: `العنصر مُصنَّف «حرجة جداً» — أي إشارة خطر عليه تستحق أولوية فورية، لا مجرد ملاحظة عابرة.` }); }

  const level = riskPoints >= 50 ? "danger" : riskPoints >= 25 ? "warn" : "good";
  if (!signals.length) signals.push({ type: "FACT", severity: "good", text: "لا توجد بيانات مرتبطة كافية (نشاط/تكلفة/مسح) لتحليل هذا العنصر بعد — لا مؤشرات خطر حالياً." });
  // تتبّع اكتمال الشواهد الفعلية — مبدأ VVUQ (التحقّق والتصديق وقياس عدم التأكد،
   // الجزء السابع الجديد من ISO 23247): رقم خطر مبنيّ على مصدر شاهد واحد من ثلاثة
   // ممكنة يستحق تصنيف ثقة أقل صراحةً، لا عرضه بنفس ثقة رقم مبنيّ على كل المصادر.
  const possibleEvidenceSources = 3; // نشاط مرتبط، بند تكلفة مرتبط، تاريخ مسح فعلي
  let actualEvidenceSources = 0;
  if (asset.linkedTaskId) actualEvidenceSources++;
  if (asset.linkedBudgetItemId) actualEvidenceSources++;
  if (computeAssetScanHistory(assetId).available) actualEvidenceSources++;
  const evidenceCompleteness = Math.round((actualEvidenceSources / possibleEvidenceSources) * 100);
  const evidenceConfidence = evidenceCompleteness >= 67 ? "عالية" : evidenceCompleteness >= 34 ? "متوسطة" : "منخفضة";

  return { assetId, assetName: asset.name, riskScore: riskPoints, level, signals,
    evidenceCompleteness, evidenceConfidence,
    evidenceNote: evidenceConfidence === "منخفضة"
      ? `تنبيه أمانة: هذا التقييم مبنيّ على ${actualEvidenceSources} من ${possibleEvidenceSources} مصادر شواهد ممكنة فقط — رقم الخطر حقيقي لما هو متاح، لكن الصورة قد تكون غير مكتملة.`
      : null };
}
function explainAssetAttentionNeeded(assetId) {
  const score = computeAssetIntelligenceScore(assetId);
  if (!score) return { available: false, reason: "العنصر غير موجود." };
  return { available: true, assetName: score.assetName, riskScore: score.riskScore, level: score.level, reasons: score.signals };
}

/* مطابقة موحَّدة لأي سجل يخص عنصراً — بمعرِّفه الداخلي (assetId) أو
   برمزه الخارجي (assetCode، من استيراد ذكاء اصطناعي خارجي). دالة
   مشتركة واحدة بدل تكرار هذا المنطق في كل مكان (وهو ما تسبَّب فعلياً
   في نسخة منه غير مُحدَّثة نسيتها في computeInspectionPriorityRanking). */
function matchesAssetIdentifier(record, asset) {
  if (!record || !asset) return false;
  if (record.assetId === asset.id) return true;
  // مطابقة الرمز فقط لا تكفي — مشروعان مختلفان قد يتشاركان اتفاقية تسمية بالتصادف (مثل "VALVE-001")؛
  // خلل حقيقي وُجد هنا: انحراف يخصّ مشروعاً آخر كان يُنسَب خطأً لعنصر بمشروع مختلف تماماً بنفس الرمز
  if (asset.assetCode && record.assetCode && record.assetCode.trim().toLowerCase() === asset.assetCode.trim().toLowerCase()) {
    if (record.projectId && asset.projectId && record.projectId !== asset.projectId) return false;
    return true;
  }
  return false;
}

/* تخزين مؤقَّت محدود بدورة عرض واحدة (يُصفَّر في كل renderApp حقيقي) —
   لا توقيعاً معقَّداً عبر مجموعات بيانات متعددة (أصول+مهام+ميزانية+
   انحرافات+مسوحات) قد يفوت تغييراً حقيقياً بصمت، بل ضمان أبسط وأكثر
   أمانة: يُعاد الحساب فعلياً مرة واحدة كل عرض، ويُعاد استخدامه فقط
   داخل نفس دورة العرض تلك (حيث الحساب المتكرر الفعلي كان يحدث:
   الجدول + مركز القيادة + الخطر المتسلسل، كل هذا في عرض واحد).
   ============================================================ */
let _digitalTwinRenderCache = { scanHistory: {}, intelligenceScore: {} };
function clearDigitalTwinRenderCache() { _digitalTwinRenderCache = { scanHistory: {}, intelligenceScore: {} }; }

function computeAssetScanHistory(assetId) {
  if (_digitalTwinRenderCache.scanHistory[assetId] !== undefined) return _digitalTwinRenderCache.scanHistory[assetId];
  const result = computeAssetScanHistoryUncached(assetId);
  _digitalTwinRenderCache.scanHistory[assetId] = result;
  return result;
}
function computeAssetScanHistoryUncached(assetId) {
  const asset = (STATE.data.projectAssets || []).find((a) => a.id === assetId);
  if (!asset) return { available: false, reason: "العنصر غير موجود." };
  const matchesAsset = (rc) => matchesAssetIdentifier(rc, asset);
  const captures = (STATE.data.realityCaptures || []).filter(matchesAsset).sort((a, b) => (b.captureDate || "").localeCompare(a.captureDate || ""));
  const deviations = (STATE.data.deviationReports || []).filter(matchesAsset);
  if (!captures.length) return { available: false, reason: `لا توجد مسوحات مسجَّلة للعنصر «${asset.name}» بعد.` };

  const byDate = {};
  captures.forEach((c) => { if (c.detectedCompletionPct != null && c.detectedCompletionPct !== "") { (byDate[c.captureDate] = byDate[c.captureDate] || []).push(Number(c.detectedCompletionPct)); } });
  const conflicts = Object.entries(byDate).filter(([date, values]) => values.length > 1 && (Math.max(...values) - Math.min(...values)) > getScanConflictThreshold())
    .map(([date, values]) => ({ date, values, spread: Math.max(...values) - Math.min(...values) }));

  return {
    available: true, assetName: asset.name,
    captures: captures.map((c) => ({ type: c.captureType, date: c.captureDate, device: c.deviceInfo, detectedPct: c.detectedCompletionPct, source: c.capturedBy })),
    deviationCount: deviations.length,
    conflicts,
  };
}

/* ============================================================
   التحقّق من صحة dbId — يعزل العنصر ويقرِّب الكاميرا إليه فعلياً في
   العارض الحقيقي (Autodesk isolate/fitToView الموثَّقتان رسمياً)،
   بدل الثقة العمياء برقم قد يشير لعنصر خاطئ تماماً.
   ============================================================ */
function highlightAssetInViewer(dbId) {
  if (!apsViewerInstance) { alert("افتح عارض BIM أولاً من تبويب «عارض BIM»."); return; }
  try {
    apsViewerInstance.isolate([Number(dbId)]);
    apsViewerInstance.fitToView([Number(dbId)]);
  } catch (e) {
    alert("تعذّر عزل العنصر — تحقّق أن رقم dbId صحيح ومتوفر في النموذج المُحمَّل حالياً.");
  }
}
function clearViewerIsolation() {
  if (!apsViewerInstance) return;
  try { apsViewerInstance.isolate([]); apsViewerInstance.fitToView(); } catch (e) { /* تجاهل */ }
}

/* ============================================================
   ترتيب أولوية الفحص حسب الحرجية (Risk-Based Inspection) — مبدأ
   صناعي حقيقي ومُعتمَد (إطار API 580 المُستخدَم فعلياً في قطاع
   النفط والغاز)، لا اختراع: العناصر الأكثر حرجية والأقدم رصداً
   والأقل تغطية بيانات تحصل على أولوية فحص أعلى.
   ============================================================ */
const CRITICALITY_WEIGHT = DigitalTwinConfig.rbiCriticalityWeights;
/* توصية تاريخ الفحص القادم — امتداد حقيقي لترتيب الأولوية، يُطبِّق
   مبدأ API 580/581 الفعلي المُشار إليه أصلاً في حقل "درجة الحرجية"
   بالنظام: الفترة الآمنة بين فحصين تتقلَّص مع ارتفاع درجة الحرجية
   ومع تراكم إشارات خطر فعلية، لا فترة ثابتة واحدة لكل العناصر. */
const RBI_BASE_INTERVAL_DAYS = { "حرجة جداً": 30, "مرتفعة": 90, "متوسطة": 180, "منخفضة": 365 };
function computeRecommendedNextInspectionDate(assetId) {
  const asset = (STATE.data.projectAssets || []).find((a) => a.id === assetId);
  if (!asset) return { available: false };
  const baseInterval = RBI_BASE_INTERVAL_DAYS[asset.criticality] || RBI_BASE_INTERVAL_DAYS["متوسطة"];
  const score = computeAssetIntelligenceScore(assetId);
  // كل 10 نقاط خطر فعلية تُقلِّص الفترة الآمنة بنسبة تصل حتى النصف — لا تُصفَّر أبداً (حدّ أدنى أسبوع لمنع فترة سلبية أو تافهة)
  const riskReductionFactor = Math.max(0.5, 1 - (score.riskScore / 200));
  const adjustedInterval = Math.max(7, Math.round(baseInterval * riskReductionFactor));
  const scanHistory = computeAssetScanHistory(assetId);
  const lastScanDate = scanHistory.available ? scanHistory.captures[0].date : null;
  const baseDate = lastScanDate || asset.installDate || todayISO();
  const recommendedDate = addDays(baseDate, adjustedInterval);
  const isOverdue = recommendedDate < todayISO();
  return { available: true, baseInterval, adjustedInterval, riskReductionFactor, lastScanDate, recommendedDate, isOverdue,
    reason: `فترة أساسية ${baseInterval} يوماً لدرجة الحرجية «${asset.criticality || "متوسطة"}»، عُدِّلت إلى ${adjustedInterval} يوماً بناءً على مؤشر الخطر الفعلي الحالي (${score.riskScore} نقطة).` };
}
/* ============================================================
   مؤشر نضج ومعرفة التوثيق الرقمي على مستوى المشروع بأكمله — طبقة
   جديدة كلياً أعلى من كل التحليل السابق (الذي كان دائماً على مستوى
   عنصر واحد أو مشروع واحد). هنا: هل التوأم الرقمي لهذا المشروع
   *شامل* فعلياً، أم أن معظم نطاق العمل الحقيقي بلا تمثيل رقمي إطلاقاً؟
   ============================================================ */
function computeDigitalTwinMaturityIndex(projectId) {
  const project = (STATE.data.projects || []).find((p) => p.id === projectId);
  if (!project) return { available: false };
  const assets = (STATE.data.projectAssets || []).filter((a) => a.projectId === projectId);
  const tasks = (STATE.data.tasks || []).filter((t) => t.projectId === projectId);
  const budgetItems = (STATE.data.budgetItems || []).filter((b) => b.projectId === projectId);

  // 1) تغطية التمثيل الرقمي: كم من نطاق العمل الفعلي (مهام + بنود تكلفة) له عنصر توأم رقمي مرتبط فعلياً؟
  const linkedTaskIds = new Set(assets.map((a) => a.linkedTaskId).filter(Boolean));
  const linkedBudgetIds = new Set(assets.map((a) => a.linkedBudgetItemId).filter(Boolean));
  const taskCoveragePct = tasks.length ? Math.round((linkedTaskIds.size / tasks.length) * 100) : null;
  const budgetCoveragePct = budgetItems.length ? Math.round((linkedBudgetIds.size / budgetItems.length) * 100) : null;

  // 2) تغطية المسح الفعلي: كم من العناصر المسجَّلة له مسح حقيقي واحد على الأقل؟
  const scannedCount = assets.filter((a) => computeAssetScanHistory(a.id).available).length;
  const scanCoveragePct = assets.length ? Math.round((scannedCount / assets.length) * 100) : null;

  // 3) صحة الأسطول العامة: متوسط مؤشر الخطر الفعلي عبر كل العناصر المُحلَّلة
  const scores = assets.map((a) => computeAssetIntelligenceScore(a.id)).filter(Boolean);
  const avgRiskScore = scores.length ? Math.round(scores.reduce((s, x) => s + x.riskScore, 0) / scores.length) : null;

  const dimensions = [
    { key: "taskCoverage", label: "تمثيل المهام رقمياً", pct: taskCoveragePct },
    { key: "budgetCoverage", label: "تمثيل بنود التكلفة رقمياً", pct: budgetCoveragePct },
    { key: "scanCoverage", label: "تغطية المسح الفعلي", pct: scanCoveragePct },
  ].filter((d) => d.pct != null);

  const overallMaturityPct = dimensions.length ? Math.round(dimensions.reduce((s, d) => s + d.pct, 0) / dimensions.length) : 0;
  const maturityLevel = !assets.length ? "لا يوجد توأم رقمي بعد" : overallMaturityPct >= 70 ? "ناضج" : overallMaturityPct >= 35 ? "قيد التطوير" : "أولي جداً";

  return { available: true, assetCount: assets.length, dimensions, overallMaturityPct, maturityLevel, avgRiskScore,
    honestNote: !assets.length ? "لا عناصر مسجَّلة بعد — هذا المؤشر يصبح ذا معنى فقط بعد تسجيل عناصر التوأم الرقمي الفعلية." : null };
}

function computeInspectionPriorityRanking(projectId) {
  const assets = (STATE.data.projectAssets || []).filter((a) => a.projectId === projectId);
  if (!assets.length) return { available: false, reason: "لا توجد عناصر مسجَّلة لهذا المشروع بعد." };
  const today = todayISO();
  const scored = assets.map((a) => {
    const captures = (STATE.data.realityCaptures || []).filter((rc) =>
      matchesAssetIdentifier(rc, a) && rc.detectedCompletionPct != null
    ).sort((x, y) => (y.captureDate || "").localeCompare(x.captureDate || ""));
    const lastScanDate = captures.length ? captures[0].captureDate : null;
    const ageDays = lastScanDate ? Math.max(0, dateDiffDays(lastScanDate, today)) : 9999;
    const criticalityScore = CRITICALITY_WEIGHT[a.criticality] != null ? CRITICALITY_WEIGHT[a.criticality] : CRITICALITY_WEIGHT["متوسطة"];
    const ageScore = Math.min(40, ageDays / 3);
    const coverageScore = captures.length ? 0 : 20;
    return { asset: a, priorityScore: Math.round(criticalityScore + ageScore + coverageScore), ageDays: lastScanDate ? ageDays : null, hasNeverScanned: !captures.length };
  }).sort((a, b) => b.priorityScore - a.priorityScore);
  return { available: true, ranking: scored.slice(0, 20) };
}

/* ============================================================
   استيراد جماعي لعناصر Digital Twin عبر CSV — إغلاق فجوة "عنصر
   واحد كل مرة" لمشروع حقيقي فيه مئات الأصول.
   ============================================================ */
function parseAssetsCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], warnings: ["الملف فارغ."] };
  const parseCsvLine = (line) => {
    const out = []; let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name) => header.findIndex((h) => h.includes(name));
  const iCode = idx("code"), iName = idx("name"), iType = idx("type"), iLocation = idx("location"), iContractor = idx("contractor"), iCriticality = idx("critical");
  const warnings = [];
  if (iCode < 0 || iName < 0) warnings.push("لم يُعثر على عمودي Code أو Name في الملف — تأكد أن الصف الأول يحتوي العناوين الصحيحة (Asset Code, Name, Type, Location, Contractor, Criticality).");
  const rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return { assetCode: cols[iCode] || "", name: cols[iName] || "", assetType: cols[iType] || "أخرى", location: cols[iLocation] || "", contractor: cols[iContractor] || "", criticality: cols[iCriticality] || "متوسطة" };
  }).filter((r) => r.assetCode || r.name);
  return { rows, warnings };
}
function applyBulkAssetImport(projectId, rows) {
  if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية استيراد الأصول للتوثيق الرقمي."); return 0; }
  let created = 0;
  rows.forEach((r) => {
    const asset = Object.assign({ id: uid(), projectId, status: "مخطَّط", updatedAt: Date.now() }, r);
    STATE.data.projectAssets.push(asset);
    created++;
  });
  logAudit("create", "projectAssets", "bulk-import", `استيراد جماعي: ${created} عنصر`);
  saveData(STATE.data);
  return created;
}
