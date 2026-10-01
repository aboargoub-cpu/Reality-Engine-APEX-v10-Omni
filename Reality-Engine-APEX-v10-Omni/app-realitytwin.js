/* ============================================================
   RealityTwin — تبويب مستقل (كما طُلب صراحة: لا يُدمَج داخل "التوثيق
   الرقمي والرصد الذكي" العام). هذا هو الجسر الفعلي بين تطبيق
   RealityTwin AI الأصلي (مسح LiDAR على آيفون + محرك تسجيل هندسي
   Horn/RANSAC حقيقي + محرك CPM لمقارنة الجدول) وبين هذا النظام —
   لا استبدال لِما هو موجود أصلاً (Primavera، EVM، سجلّ المخاطر)، بل
   مصدر أدلة ميدانية حقيقية يغذّيها.

   التكامل الفعلي: زر "تصدير إلى التوثيق الرقمي" يستخدم نفس عقد
   الاستيراد الموثَّق أصلاً في app-digitaltwin.js
   (PMS_EXTERNAL_RESULT_SCHEMA_VERSION + applyExternalResultImport) —
   بنية بيانات موجودة ومُختبَرة أصلاً في هذا النظام، لا طبقة جديدة
   منفصلة عنها.
   ============================================================ */

function realityTwinSessionsForScope() {
  return filterByProject(STATE.data.realityTwinSessions || []);
}

/* ============================================================
   بدء مسح جديد — نفس تجربة الصور والوضوح الحقيقية: طلب إذن الكاميرا
   فعلياً، ثم تسليم الجلسة لتطبيق RealityTwin AI الأصلي (LiDAR حقيقي)
   عبر نفس عقد التسليم الموثَّق أصلاً في ios-integration-contract.json
   (projectId, captureSessionId, requestedControlPointIds, returnURL).

   هذا النمط موجود ومُختبَر أصلاً في app-v12-mobile.js (launchScanner) —
   لا يُعاد بناء منطق مختلف؛ الفرق الوحيد هنا أن نقاط الضبط والجلسة
   تُنشآن كسجلّ realityTwinSessions حقيقي بدل حالة apex12 المؤقَّتة،
   لأن هذا التبويب مبني على نموذج بياناته الخاص.
   ============================================================ */
function ensureRealityTwinCaptureDraft(projectId) {
  STATE.data.realityTwinCaptureDrafts = STATE.data.realityTwinCaptureDrafts || {};
  if (!STATE.data.realityTwinCaptureDrafts[projectId]) {
    STATE.data.realityTwinCaptureDrafts[projectId] = {
      points: [
        { id: "RCP-001", role: "ORIGIN", found: false },
        { id: "RCP-002", role: "CONTROL", found: false },
        { id: "RCP-003", role: "CONTROL", found: false },
        { id: "RCP-004", role: "CHECK", found: false },
      ],
    };
  }
  return STATE.data.realityTwinCaptureDrafts[projectId];
}
function setRealityTwinCaptureProject(projectId) { STATE.realityTwinCaptureProjectId = projectId; renderApp(); }
function scanRealityTwinControlPoint(projectId, pointId) {
  // محاكاة تعرّف QR فورية (نفس نمط "recognize" الموجود أصلاً في app-v12-mobile.js) —
  // التعرّف الفعلي على الرمز يحدث داخل كاميرا التطبيق الأصلي بعد التسليم؛ هذا يُعلِّم
  // النقطة كمُكتشَفة ميدانياً بحيث يبقى إدخال الإحداثيات المساحية الحقيقية هو الخطوة التالية.
  const draft = ensureRealityTwinCaptureDraft(projectId);
  const p = draft.points.find((x) => x.id === pointId);
  if (!p) return;
  p.scanned = true;
  saveData(STATE.data); renderApp();
}
function saveRealityTwinControlPointAxis(projectId, pointId, axis, value) {
  const draft = ensureRealityTwinCaptureDraft(projectId);
  const p = draft.points.find((x) => x.id === pointId);
  if (!p) return;
  p.xyz = p.xyz || [0, 0, 0];
  const idx = { x: 0, y: 1, z: 2 }[axis];
  p.xyz[idx] = Number(value) || 0;
  p.found = p.xyz.some((v) => v !== 0) || p.scanned; // يُعتبَر "مُقاس" بمجرد إدخال قيمة فعلية أو مسح رمزه
  saveData(STATE.data);
}
function addRealityTwinControlPoint(projectId) {
  const draft = ensureRealityTwinCaptureDraft(projectId);
  const n = draft.points.length + 1;
  draft.points.push({ id: `RCP-${String(n).padStart(3, "0")}`, role: "CONTROL", found: false });
  saveData(STATE.data); renderApp();
}

async function launchRealityTwinCapture(projectId) {
  const draft = ensureRealityTwinCaptureDraft(projectId);
  const readyPoints = draft.points.filter((p) => p.found);
  if (readyPoints.length < 3) { alert("أدخل إحداثيات 3 نقاط ضبط على الأقل قبل بدء المسح (Horn/RANSAC يحتاج 3 كحدّ أدنى، 4 موصى بها مع نقطة تحقّق مستقلة)."); return; }
  try {
    if (!window.isSecureContext) throw new Error("يجب تشغيل النظام عبر HTTPS لطلب صلاحية الكاميرا.");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("المتصفح لا يدعم الوصول إلى الكاميرا — استخدم Safari على آيفون أو Chrome على أندرويد.");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
    stream.getTracks().forEach((t) => t.stop()); // الإذن فقط هنا؛ الالتقاط الفعلي (LiDAR) يحدث داخل التطبيق الأصلي بعد التسليم
    const sessionId = "cap-" + Date.now();
    const payload = new URLSearchParams({ projectId, captureSessionId: sessionId, requestedControlPointIds: draft.points.map((p) => p.id).join(","), returnURL: location.origin + location.pathname + "?captureReturn=" + sessionId });
    const scheme = `realityengine://capture?${payload}`;
    const universal = `https://capture.reality-engine.local/launch?${payload}`;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    // سجلّ فوري بحالة "قيد المعالجة" — يتحوّل لاحقاً لـ"مسجَّل ومُتحقَّق منه" عند عودة حزمة المسح من التطبيق الأصلي (أو يُدخِله المستخدم يدوياً في الجدول أدناه بعد الانتهاء)
    MODULES.realityTwinSessions.add({ projectId, sessionId, capturedAt: todayISO(), controlPointsUsed: readyPoints.length, status: "قيد المعالجة", notes: "تم تسليم الجلسة للتطبيق الأصلي — بانتظار عودة حزمة المسح." });
    if (ios) { location.href = scheme; setTimeout(() => { if (document.visibilityState === "visible") location.href = universal; }, 900); }
    else { alert("تم منح صلاحية الكاميرا وتسجيل الجلسة. أكمل المسح بتطبيق RealityTwin AI على آيفون/آيباد (LiDAR)، ثم أدخل نتائج التسجيل الهندسي في الجدول أدناه عند العودة."); }
  } catch (e) { alert(e.message || "تعذّر فتح الكاميرا."); }
}

/* تصميم "لوحة قياس" داكنة مقصودة (مختلفة عمداً عن الثيم الفاتح الافتراضي
   للنظام) — نفس الفلسفة البصرية المستخدَمة في شاشة "نقاط الضبط" الأصلية
   لتطبيق RealityTwin AI: هذه شاشة ميدانية تُستخدَم تحت ضوء شمس مباشر على
   الموقع، لا شاشة مكتبية، فالتباين العالي والألوان الداكنة اختيار وظيفي. */
function renderRealityTwinCaptureView() {
  const projects = filterByProject(STATE.data.projects || []);
  const projectId = STATE.realityTwinCaptureProjectId || (projects[0] && projects[0].id) || "";
  if (!projectId) return `<div class="frame p4" style="text-align:center;color:var(--muted2);padding:20px;">أنشئ مشروعاً أولاً من تبويب "المشاريع".</div>`;
  const draft = ensureRealityTwinCaptureDraft(projectId);
  const foundCount = draft.points.filter((p) => p.found).length;
  const project = projects.find((p) => p.id === projectId);

  const markerCard = (p) => {
    const measured = p.found;
    const xyz = p.xyz || [0, 0, 0];
    return `<div style="border:1px solid ${measured ? "#24304A" : "#4A3320"};border-radius:18px;background:#131B2E;padding:16px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;border-radius:11px;background:#0D1524;border:1px solid #24304A;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8ECF4" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="16" y="16" width="4" height="4"/></svg>
        </div>
        <div style="flex-grow:1;">
          <div style="color:#E8ECF4;font-weight:700;font-size:14.5px;">${esc(p.id)}</div>
          <div style="color:${measured ? "#6B7797" : "#FBBF24"};font-size:11.5px;font-family:monospace;">${measured ? "Measured" : "Not yet measured"}</div>
        </div>
        <button onclick="scanRealityTwinControlPoint('${projectId}','${p.id}')" style="display:flex;align-items:center;gap:6px;padding:9px 14px;border-radius:10px;background:${p.scanned ? "rgba(22,163,74,.15)" : "#0D1524"};border:1px solid ${p.scanned ? "rgba(22,163,74,.4)" : "#24304A"};color:${p.scanned ? "#4ADE80" : "#818CF8"};font-size:12.5px;font-family:inherit;cursor:pointer;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          ${p.scanned ? "✓ Scanned" : "Scan"}
        </button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px;">
        ${["X", "Y", "Z"].map((axis, i) => `
          <div>
            <label style="display:block;font-size:10px;color:#6B7797;text-align:center;margin-bottom:5px;font-family:monospace;">${axis} (m)</label>
            <input type="text" inputmode="decimal" value="${xyz[i]?.toFixed ? xyz[i].toFixed(3) : "0.000"}"
              onchange="saveRealityTwinControlPointAxis('${projectId}','${p.id}','${axis.toLowerCase()}',this.value);renderApp();"
              style="width:100%;box-sizing:border-box;background:#0D1524;border:1px solid #24304A;border-radius:9px;color:#E8ECF4;font-family:monospace;font-size:13px;text-align:center;padding:9px 6px;" />
          </div>`).join("")}
      </div>
    </div>`;
  };

  return `
    <div style="background:#0B1220;border-radius:20px;padding:20px 16px 24px 16px;">
      <div style="margin-bottom:14px;">
        <select onchange="setRealityTwinCaptureProject(this.value)" style="width:100%;background:#131B2E;border:1px solid #24304A;border-radius:10px;color:#E8ECF4;font-size:13px;padding:10px 12px;">
          ${projects.map((p) => `<option value="${p.id}" ${p.id === projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
        </select>
      </div>
      <div style="color:#6B7797;font-size:11px;font-family:monospace;letter-spacing:.04em;margin-bottom:2px;">${esc((project?.code || project?.name || "").toUpperCase())}</div>
      <h2 style="color:#fff;font-size:24px;font-weight:800;margin:2px 0 14px 0;">Control Points</h2>
      <div style="background:rgba(22,163,74,.12);border:1px solid rgba(22,163,74,.35);color:#86EFAC;border-radius:14px;padding:14px 16px;font-size:12.5px;line-height:1.7;margin-bottom:16px;">
        Use at least 3 markers, spread apart and at different heights — not in a straight line. Enter the surveyed X/Y/Z printed or measured on site for each one.
      </div>
      ${draft.points.map(markerCard).join("")}
      <button onclick="addRealityTwinControlPoint('${projectId}')" style="width:100%;padding:14px;border-radius:14px;border:1px dashed #2A3A56;background:transparent;color:#8895AC;font-size:13px;cursor:pointer;margin-bottom:18px;">+ Add another marker</button>
      <button onclick="launchRealityTwinCapture('${projectId}')" style="width:100%;padding:16px;border-radius:14px;border:none;background:#4F46E5;color:#fff;font-size:15px;font-weight:800;cursor:pointer;">📷 Save &amp; start scan</button>
      <div style="text-align:center;color:#6B7797;font-size:11.5px;font-family:monospace;margin-top:10px;">${foundCount} of ${draft.points.length} markers measured</div>
      <div style="text-align:center;color:#4A5A7A;font-size:10.5px;margin-top:12px;">اطبع علامات RCP من <code>RealityTwin_Control_Markers_A4.pdf</code> بحجم 100%، ثبّتها متباعدة وغير مستقيمة. على آيفون/آيباد: تسليم فوري للتطبيق الأصلي لإجراء مسح LiDAR حقيقي — المتصفح لا يستطيع الوصول لمستشعر LiDAR مباشرة.</div>
    </div>
    <div style="height:96px;"></div>`;
}

/* ملاحظة: مطابقة الجدول البسيطة (متوسط غير مُرجَّح، بلا اختبار دلالة) التي
   كانت هنا استُبدلت بمنهجية Earned Schedule الكاملة في
   app-realitytwin-science.js (computeEarnedSchedule/computeStatisticalDivergence/
   computeProgressTrendForecast) — انظر renderRealityTwinView أدناه. */

function renderRealityTwinView() {
  const readOnly = !canEdit(STATE.user.role, "realityTwin");
  const sessions = realityTwinSessionsForScope();
  const verified = sessions.filter((s) => s.status === "مسجَّل ومُتحقَّق منه");
  const avgRms = verified.length ? verified.filter((s) => s.rmsResidualM != null && s.rmsResidualM !== "").reduce((a, s, _i, arr) => a + Number(s.rmsResidualM) / arr.length, 0) : null;
  const maxDeviation = sessions.reduce((max, s) => (s.ifcMaxDeviationMm != null && s.ifcMaxDeviationMm !== "" && Number(s.ifcMaxDeviationMm) > max ? Number(s.ifcMaxDeviationMm) : max), 0);

  const projectIds = [...new Set(sessions.map((s) => s.projectId))];
  const science = projectIds.map((pid) => ({
    projectId: pid,
    es: computeEarnedSchedule(pid),
    div: computeStatisticalDivergence(pid),
    trend: computeProgressTrendForecast(pid),
  }));
  const significantCount = science.filter((s) => s.div && s.div.significant).length;

  const kpis = [
    kpiCard({ label: "جلسات مسح مسجَّلة", value: sessions.length, sub: `${verified.length} مُتحقَّق منها هندسياً` }),
    kpiCard({ label: "متوسط دقة التسجيل (RMS)", value: avgRms != null ? `${avgRms.toFixed(3)} م` : "—", sub: "Horn/RANSAC، أقل = أدق" }),
    kpiCard({ label: "أقصى انحراف عن موديل IFC", value: maxDeviation ? `${maxDeviation} مم` : "—", level: maxDeviation > 25 ? "danger" : maxDeviation ? "warn" : null }),
    kpiCard({ label: "تباين ذو دلالة إحصائية", value: significantCount, sub: "z-test 95% ثقة، لا ضجيج عشوائي", level: significantCount ? "danger" : "good" }),
  ];

  const scienceCards = science.map(({ projectId, es, div, trend }) => `
    <div class="frame p4" style="margin-bottom:12px;">
      <h3 style="margin:0 0 10px 0;font-size:13.5px;">${esc(projName(projectId))}</h3>
      ${!es.available ? `<div style="color:var(--muted2);font-size:12px;">Earned Schedule: ${esc(es.reason)}</div>` : `
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px;">
        <div class="frame kpi ${es.SVt < 0 ? "kpi-danger" : "kpi-good"}"><div class="lbl"><span>SV(t) — انحراف الجدول بالزمن</span></div><div class="val">${es.SVt > 0 ? "+" : ""}${es.SVt} يوم</div><div class="sub">Earned Schedule (Lipke) — لا يتقارب لصفر قرب الإنجاز كالطريقة التقليدية</div></div>
        <div class="frame kpi ${es.SPIt < 1 ? "kpi-danger" : "kpi-good"}"><div class="lbl"><span>SPI(t)</span></div><div class="val">${es.SPIt ?? "—"}</div><div class="sub">أقل من 1 = أبطأ من المخطَّط زمنياً</div></div>
        <div class="frame kpi"><div class="lbl"><span>تقدّم موثَّق (مُرجَّح بالثقة)</span></div><div class="val">${es.EVpct}%</div><div class="sub">± ${es.standardErrorPct} نقطة (خطأ قياسي مُرجَّح بعكس التباين، ${es.sessionCount} جلسة)</div></div>
        <div class="frame kpi ${es.forecastSlipDays > 0 ? "kpi-warn" : "kpi-good"}"><div class="lbl"><span>تاريخ الإنجاز المتوقَّع</span></div><div class="val">${esc(es.forecastFinishDate || "—")}</div><div class="sub">مخطَّط: ${esc(es.plannedFinishDate)} (${es.forecastSlipDays > 0 ? "+" : ""}${es.forecastSlipDays ?? "—"} يوم)</div></div>
      </div>`}
      ${div ? `<div style="font-size:12px;margin-bottom:6px;">${statusDot(div.significant ? "danger" : "good", `اختبار الدلالة الإحصائية: ${div.trackedPct}% مُدَّعى مقابل ${div.scannedPct}% موثَّق (z=${div.z}) — ${div.verdict}`)}</div>` : ""}
      ${trend && trend.available ? `<div style="font-size:12px;color:var(--muted);">توقّع اتجاهي (انحدار خطي على ${trend.sampleCount} قياسات متتالية، R²=${trend.r2}): الإنجاز الكامل ~${esc(trend.forecastFinishDate)} بمعدّل ${trend.slopePctPerDay}%/يوم</div>` : trend ? `<div style="font-size:11px;color:var(--muted2);">توقّع اتجاهي: ${esc(trend.reason)}</div>` : ""}
    </div>`).join("") || `<div class="frame p4" style="text-align:center;color:var(--muted2);padding:14px;">لا توجد جلسات مسح تحمل نسبة إنجاز موثَّقة بعد لهذا النطاق.</div>`;

  const tab = STATE.realityTwinTab || "evidence";
  const tabBtn = (key, label) => `<button class="btn ${tab === key ? "primary" : "ghost"} sm" onclick="setRealityTwinTab('${key}')">${label}</button>`;

  if (tab === "capture") {
    return `${sectionHeader("RealityTwin — بدء مسح جديد")}
      <div style="display:flex;gap:8px;margin-bottom:14px;">${tabBtn("evidence", "📊 الأدلة والمطابقة")}${tabBtn("capture", "📷 بدء مسح جديد")}</div>
      ${renderRealityTwinCaptureView()}`;
  }

  return `${sectionHeader("RealityTwin — المسح الميداني والمطابقة الهندسية",
    !readOnly ? btn("⇪ تصدير الأدلة إلى التوثيق الرقمي", "exportRealityTwinEvidenceToDigitalTwin()", "primary", "sm") : "")}
    <div style="display:flex;gap:8px;margin-bottom:14px;">${tabBtn("evidence", "📊 الأدلة والمطابقة")}${tabBtn("capture", "📷 بدء مسح جديد")}</div>
    <div class="frame p4" style="margin-bottom:14px;font-size:12px;color:var(--muted);">
      هذا التبويب مصدر مستقل للأدلة الميدانية الحقيقية القادمة من تطبيق RealityTwin AI (مسح LiDAR على آيفون، تسجيل هندسي
      Horn/RANSAC، ومقارنة الموديل IFC مع نتيجة المسح) — منفصل عمداً عن "التوثيق الرقمي والرصد الذكي" العام الذي يبقى
      سجلاً عاماً لأي خدمة مسح خارجية. زر التصدير أعلاه يغذّي سجلّات المسح والانحرافات هناك تلقائياً من هذه البيانات.
    </div>
    <div class="kpi-grid" style="margin-bottom:14px;">${kpis.join("")}</div>

    <h2 style="font-size:14px;margin:0 0 10px 0;">مطابقة الجدول الزمني — Earned Schedule + دلالة إحصائية + توقّع اتجاهي</h2>
    ${scienceCards}

    ${renderModuleView("realityTwinSessions", "جلسات المسح والتسجيل الهندسي", MODULES.realityTwinSessions.fields(), sessions, [], readOnly)}
    <div style="height:96px;"></div>`;
}
function setRealityTwinTab(tab) { STATE.realityTwinTab = tab; renderApp(); }

/* التصدير الفعلي: يبني نفس صيغة PMS_EXTERNAL_RESULT_SCHEMA_VERSION الموثَّقة
   أصلاً في app-digitaltwin.js، ثم يستدعي applyExternalResultImport() مباشرة —
   لا تصدير/استيراد ملف يدوي؛ نفس صفحة التطبيق، نفس الحالة (STATE) مباشرة. */
function exportRealityTwinEvidenceToDigitalTwin() {
  if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية تصدير الأدلة إلى التوثيق الرقمي."); return; }
  const sessions = realityTwinSessionsForScope();
  if (!sessions.length) { alert("لا توجد جلسات مسح مسجَّلة في هذا النطاق لتصديرها."); return; }

  const realityCaptures = sessions.map((s) => ({
    projectId: projName(s.projectId), assetCode: s.sessionId || "", captureType: "مسح ليزري LiDAR",
    captureDate: s.capturedAt || todayISO(), deviceInfo: s.deviceModel || "iPhone LiDAR",
    status: s.status === "مسجَّل ومُتحقَّق منه" ? "مُعالَج ونتائجه جاهزة" : s.status === "فشل التسجيل — تحتاج إعادة مسح" ? "فشلت المعالجة" : "بانتظار المعالجة الخارجية",
    resultSummary: `RMS residual: ${s.rmsResidualM ?? "—"} م · نقاط ضبط: ${s.controlPointsUsed ?? "—"} · خوارزمية: ${s.algorithmVersion || "Horn/RANSAC"}`,
    detectedCompletionPct: s.scanVerifiedProgressPct ?? null,
  }));

  const deviationReports = sessions.filter((s) => s.ifcMaxDeviationMm != null && s.ifcMaxDeviationMm !== "" && Number(s.ifcMaxDeviationMm) > 0).map((s) => ({
    projectId: projName(s.projectId), assetCode: s.sessionId || "", elementId: s.sessionId || "",
    deviationType: "بُعد/قياس", designValue: "موديل IFC المرجعي (0 مم انحراف)", actualValue: `انحراف ${s.ifcMaxDeviationMm} مم عن الموديل (قياس مباشر من مطابقة المسح، لا نسبة مئوية متاحة)`,
    location: s.notes || s.sessionId || "", detectedAt: s.capturedAt || todayISO(),
  }));

  const payload = { schemaVersion: PMS_EXTERNAL_RESULT_SCHEMA_VERSION, source: "RealityTwin AI (iOS LiDAR + محرك التسجيل الهندسي)", realityCaptures, deviationReports };
  const preview = buildExternalResultImportPreview(JSON.stringify(payload));
  if (preview.error) { alert("تعذّر بناء حزمة التصدير: " + preview.error); return; }
  const created = applyExternalResultImport(preview);
  renderApp();
  alert(`تم تصدير ${created} سجلاً من RealityTwin إلى التوثيق الرقمي (${preview.summary.realityCaptureCount} مسح، ${preview.summary.deviationCount} انحراف).${preview.summary.skippedCount ? `\nتم تجاهل ${preview.summary.skippedCount} سجلاً لعدم مطابقة اسم المشروع تماماً.` : ""}`);
}
