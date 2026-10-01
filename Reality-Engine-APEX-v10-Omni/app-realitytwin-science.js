/* ============================================================
   RealityTwin Science — أقصى ما هو مُتاح علمياً لمطابقة "التقدم
   الموثّق بالمسح مقابل الجدول المُدَّعى"، لا مجرد مقارنة رقمين.

   يبني هذا الملف مباشرة على محرك CPM الحقيقي الموجود أصلاً في
   app-core.js (computeCPMCore: forward/backward pass كامل بأربع
   علاقات FS/SS/FF/SF ولاغ حقيقي) — لا محرك جديد مُعاد اختراعه.

   المنهجيات المُطبَّقة، كل واحدة منها ممارسة علمية منشورة لا اجتهاد:

   1) Earned Schedule (Lipke, 2003) — الامتداد المنشور والمُعتمَد من
      AACE لطريقة EVM التقليدية، يقيس انحراف الجدول بوحدة الزمن (أيام)
      بدل النسبة المئوية أو المال. المشكلة العلمية المعروفة في SV
      التقليدي أنه يتقارب نحو صفر آلياً قرب نهاية المشروع بغضّ النظر
      عن التأخير الفعلي — Earned Schedule تحلّ هذا تحديداً.
   2) ترجيح الأدلة بعكس التباين (Inverse-Variance Weighting) — نفس
      المبدأ المستخدَم في المساحة الجيوديسية لدمج قياسات متفاوتة
      الدقة: كل جلسة مسح تُرجَّح بعكس (RMS residual² وعدد نقاط الضبط)،
      لا متوسط بسيط يُساوي بين مسح دقيق جداً ومسح ضعيف الجودة.
   3) اختبار الدلالة الإحصائية (z-test) — هل الفرق بين المُدَّعى
      والموثَّق أكبر مما يمكن تفسيره بعدم يقين القياس نفسه، أم أنه
      ضجيج طبيعي؟ يمنع إنذارات كاذبة من فروقات غير ذات دلالة.
   4) توقّع الإنجاز بالانحدار الخطي على سلسلة القياسات الزمنية —
      مؤشر استباقي (Leading Indicator) لا رجعي فقط.
   ============================================================ */

/* ---------------- أدوات إحصائية عامة ---------------- */
/* اسم مميَّز عمداً (لا linearRegression العام) — تجنّباً لتصادم صامت حقيقي
   كان موجوداً هنا: app-financial.js يُعرِّف linearRegression بنفس الاسم
   بصيغة عائد مختلفة (بلا R²)؛ إعلان لاحق بنفس الاسم في نظام سكربتات
   عامة كهذا يُلغي الأول صامتاً وقت التشغيل دون أي خطأ ظاهر. */
function rtLinearRegressionWithR2(points) {
  // points: [{x,y}], يُعيد {slope, intercept, r2}
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((a, p) => a + p.x, 0), sumY = points.reduce((a, p) => a + p.y, 0);
  const meanX = sumX / n, meanY = sumY / n;
  let num = 0, den = 0;
  points.forEach((p) => { num += (p.x - meanX) * (p.y - meanY); den += (p.x - meanX) ** 2; });
  if (den === 0) return null;
  const slope = num / den, intercept = meanY - slope * meanX;
  let ssRes = 0, ssTot = 0;
  points.forEach((p) => { const pred = slope * p.x + intercept; ssRes += (p.y - pred) ** 2; ssTot += (p.y - meanY) ** 2; });
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return { slope, intercept, r2, n };
}

/* ---------------- 1) منحنى القيمة المخطَّطة PV(t) من محرك CPM الحقيقي ---------------- */
function computeProjectPVCurve(projectId) {
  const tasks = (STATE.data.tasks || []).filter((t) => t.projectId === projectId && t.start && t.end);
  if (!tasks.length) return null;
  const getDuration = (id) => {
    const t = tasks.find((x) => x.id === id);
    return t ? Math.max(1, daysBetween(t.start, t.end) || 1) : 1;
  };
  const cpm = computeCPMCore(tasks, getDuration);
  const totalWeight = tasks.reduce((s, t) => s + getDuration(t.id), 0);
  if (!totalWeight || !isFinite(cpm.projectEnd) || cpm.projectEnd <= 0) return null;

  // PV(t): النسبة المخطَّطة المتراكمة عند اليوم t، بافتراض تقدّم خطي لكل
  // نشاط ضمن نافذته المبكرة (نفس افتراض SPI/CPI القياسي في EVM). دقة اليوم
  // الواحد كافية لأغراض هذه المطابقة ولا تحتاج محاكاة أدق.
  const days = Math.ceil(cpm.projectEnd);
  const pv = new Array(days + 1).fill(0);
  for (let t = 0; t <= days; t++) {
    let earned = 0;
    tasks.forEach((task) => {
      const es = cpm.ES[task.id], ef = cpm.EF[task.id], w = getDuration(task.id);
      const frac = t <= es ? 0 : t >= ef ? 1 : (t - es) / Math.max(ef - es, 1e-9);
      earned += w * frac;
    });
    pv[t] = earned / totalWeight;
  }
  return { pv, projectEndDays: cpm.projectEnd, cpm, totalWeight, taskCount: tasks.length };
}

/* ---------------- 2) ترجيح أدلة المسح بعكس التباين ---------------- */
function computeConfidenceWeightedScanEvidence(projectId) {
  const sessions = (STATE.data.realityTwinSessions || []).filter((s) =>
    s.projectId === projectId && s.scanVerifiedProgressPct != null && s.scanVerifiedProgressPct !== "");
  if (!sessions.length) return null;
  let sumW = 0, sumWX = 0;
  const weighted = sessions.map((s) => {
    const rms = Math.max(Number(s.rmsResidualM) || 0.05, 0.001); // افتراض متحفِّظ إن لم تُسجَّل: 5 سم
    const cps = Math.max(Number(s.controlPointsUsed) || 3, 3);
    // وزن يعكس التباين: (RMS)² أقل = ثقة أعلى؛ عدد نقاط ضبط أكبر = ثقة أعلى (جذر تربيعي، نفس تحسّن الخطأ القياسي مع تكرار العيّنات في الإحصاء)
    const weight = Math.sqrt(cps) / (rms * rms);
    sumW += weight; sumWX += weight * Number(s.scanVerifiedProgressPct);
    return { sessionId: s.sessionId, pct: Number(s.scanVerifiedProgressPct), weight, rms, cps };
  });
  const weightedMean = sumWX / sumW;
  // تباين مُرجَّح (Weighted variance) وخطأ قياسي مُرجَّح — نفس صيغة دمج القياسات في المساحة الجيوديسية
  let sumWSq = 0, weightedVarNum = 0;
  weighted.forEach((w) => { sumWSq += w.weight ** 2; weightedVarNum += w.weight * (w.pct - weightedMean) ** 2; });
  const effectiveN = weighted.length > 1 ? (sumW ** 2) / sumWSq : 1;
  const weightedVariance = weighted.length > 1 ? weightedVarNum / sumW : (weighted[0].rms * 400) ** 2; // جلسة واحدة: عدم يقين مشتقّ من RMS فقط
  const standardError = Math.sqrt(weightedVariance / Math.max(effectiveN, 1));
  return { weightedMeanPct: weightedMean, standardErrorPct: standardError, sessionCount: sessions.length, effectiveN, sessions: weighted };
}

/* ---------------- 1+2) Earned Schedule الفعلية ---------------- */
function computeEarnedSchedule(projectId) {
  const project = (STATE.data.projects || []).find((p) => p.id === projectId);
  const pvCurve = computeProjectPVCurve(projectId);
  const evidence = computeConfidenceWeightedScanEvidence(projectId);
  if (!project || !project.startDate || !pvCurve || !evidence) {
    return { available: false, reason: !project?.startDate ? "المشروع بلا تاريخ بداية مسجَّل." : !pvCurve ? "لا مهام كافية بتواريخ بداية/نهاية لبناء منحنى CPM." : "لا جلسات مسح تحمل نسبة إنجاز موثَّقة بعد." };
  }
  const AT = Math.max(0, daysBetween(project.startDate, todayISO()));
  const EV = evidence.weightedMeanPct / 100;

  // عكس منحنى PV(t) لإيجاد ES: أكبر يوم t حيث PV(t) <= EV، ثم استيفاء خطي
  const { pv } = pvCurve;
  let esLow = 0;
  for (let t = 0; t < pv.length; t++) { if (pv[t] <= EV) esLow = t; else break; }
  let ES;
  if (esLow >= pv.length - 1) ES = esLow;
  else {
    const pvLow = pv[esLow], pvHigh = pv[esLow + 1];
    ES = pvHigh > pvLow ? esLow + (EV - pvLow) / (pvHigh - pvLow) : esLow;
  }
  const SVt = ES - AT; // أيام؛ سالب = متأخر
  const SPIt = AT > 0 ? ES / AT : (EV > 0 ? Infinity : 1);
  const plannedDurationDays = pvCurve.projectEndDays;
  // توقّع مدة الإنجاز الفعلية = المدة المخطَّطة ÷ SPI(t) — صيغة AACE RP منشورة لتوقّع الإنجاز بطريقة Earned Schedule
  const forecastDurationDays = SPIt > 0 && isFinite(SPIt) ? plannedDurationDays / SPIt : null;
  const plannedFinishDate = addDaysISO(project.startDate, Math.round(plannedDurationDays));
  const forecastFinishDate = forecastDurationDays != null ? addDaysISO(project.startDate, Math.round(forecastDurationDays)) : null;
  const forecastSlipDays = forecastDurationDays != null ? Math.round((forecastDurationDays - plannedDurationDays) * 10) / 10 : null;

  return {
    available: true, AT, ES: Math.round(ES * 100) / 100, SVt: Math.round(SVt * 100) / 100, SPIt: isFinite(SPIt) ? Math.round(SPIt * 1000) / 1000 : null,
    EVpct: Math.round(EV * 1000) / 10, standardErrorPct: Math.round(evidence.standardErrorPct * 10) / 10,
    plannedDurationDays: Math.round(plannedDurationDays * 10) / 10, plannedFinishDate,
    forecastFinishDate, forecastSlipDays, sessionCount: evidence.sessionCount, effectiveN: Math.round(evidence.effectiveN * 10) / 10,
  };
}

/* ---------------- 3) اختبار الدلالة الإحصائية ---------------- */
function computeStatisticalDivergence(projectId) {
  const trackedPct = computeTaskWeightedCompletion(projectId); // موجودة أصلاً في app-digitaltwin.js
  const evidence = computeConfidenceWeightedScanEvidence(projectId);
  if (trackedPct == null || !evidence) return null;
  const diff = trackedPct - evidence.weightedMeanPct;
  // عدم يقين "الرقم المُدَّعى" نفسه غير مقيس مباشرة؛ نفترض تحفّظاً 5 نقاط
  // مئوية (ممارسة قياسية عند غياب قياس عدم يقين مصرَّح به للطرف الآخر في
  // اختبار z لفرق وسطين) — نُصرِّح بهذا الافتراض بدل إخفائه.
  const claimedAssumedSE = 5;
  const combinedSE = Math.sqrt(claimedAssumedSE ** 2 + evidence.standardErrorPct ** 2);
  const z = combinedSE > 0 ? diff / combinedSE : 0;
  const significant = Math.abs(z) > 1.96; // 95% ثقة، اختبار ثنائي الطرف قياسي
  return {
    trackedPct: Math.round(trackedPct * 10) / 10, scannedPct: Math.round(evidence.weightedMeanPct * 10) / 10,
    diffPts: Math.round(diff * 10) / 10, z: Math.round(z * 100) / 100, significant,
    verdict: !significant ? "ضمن حدود عدم اليقين — لا دلالة إحصائية" : diff > 0 ? "تجاوز مُدَّعى بدلالة إحصائية (تحقّق ميداني)" : "تقدّم موثَّق أعلى من المُسجَّل — راجع تحديث الجدول",
  };
}

/* ---------------- 4) توقّع الإنجاز بالانحدار الخطي على سلسلة القياسات ---------------- */
function computeProgressTrendForecast(projectId) {
  const project = (STATE.data.projects || []).find((p) => p.id === projectId);
  const sessions = (STATE.data.realityTwinSessions || []).filter((s) =>
    s.projectId === projectId && s.scanVerifiedProgressPct != null && s.scanVerifiedProgressPct !== "" && s.capturedAt);
  if (!project?.startDate || sessions.length < 2) return { available: false, reason: "تحتاج جلستي مسح موثَّقتين بتاريخ على الأقل للتوقّع الاتجاهي." };
  const points = sessions.map((s) => ({ x: daysBetween(project.startDate, s.capturedAt), y: Number(s.scanVerifiedProgressPct) }));
  const reg = rtLinearRegressionWithR2(points);
  if (!reg || reg.slope <= 0) return { available: false, reason: "لا يوجد اتجاه تقدّم موجب واضح في القياسات المتتالية بعد." };
  const forecastDay100 = (100 - reg.intercept) / reg.slope;
  const forecastDate = addDaysISO(project.startDate, Math.round(forecastDay100));
  return { available: true, slopePctPerDay: Math.round(reg.slope * 1000) / 1000, r2: Math.round(reg.r2 * 1000) / 1000, forecastFinishDate: forecastDate, forecastDay: Math.round(forecastDay100 * 10) / 10, sampleCount: points.length };
}
