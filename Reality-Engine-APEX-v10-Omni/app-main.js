/* ============================================================
   الهيكل العام للتطبيق: الحالة، تسجيل الدخول، الشريط الجانبي، والموجّه
   ============================================================ */

const STATE = {
  data: null,
  user: null,
  active: "dashboard",
  projectFilter: "all",
  sidebarOpen: true,
  mobileSidebarOpen: false,
  canInstall: false,
  modal: null,
  tableState: {},
  resourcesTab: "labor",
  meetingsTab: "meetings",
  globalSearchQuery: "",
  globalSearchOpen: false,
  scheduleRange: "weekly",
  aiMessages: [],
  dashboardDrill: { level: "portfolio" },
  riskMatrixFilter: null,
};

const VIEW_RENDERERS = {
  dashboard: renderDashboard,
  projects: () => renderSimpleModuleWithEVM(),
  schedule: renderSchedule,
  sitereports: renderSiteReportsView,
  tasks: () => renderTasksModule(),
  resources: renderResources,
  procurement: renderProcurementView,
  contracts: renderContractsView,
  finance: renderFinance,
  "financial-intel": renderFinancialIntel,
  "financial-hub": renderFinancialHub,
  invoices: renderInvoicesView,
  certificates: renderCertificatesView,
  auditLog: renderAuditLogView,
  connections: renderConnectionsCenter,
  msgraph: renderMsGraphView,
  primavera: renderPrimaveraView,
  digitalTwin: renderDigitalTwinView,
  realityTwin: renderRealityTwinView,
  subcontractorCertificates: renderSubcontractorCertificatesView,
  claims: renderClaimsView,
  correspondence: renderCorrespondenceView,
  gmNotes: renderGmNotesView,
  projectChatRoom: renderProjectChatRoomView,
  projectNotes: renderProjectNotesView,
  meetings: renderMeetingsView,
  punchlist: renderPunchlistView,
  documents: renderDocumentsView,
  mediaGallery: renderMediaGalleryView,
  custodies: renderCustodies,
  users: renderUsersView,
  progress: renderProgress,
  risks: renderRisks,
  changeOrders: renderChangeOrders,
  qc: renderQCView,
  hse: renderHSEView,
  ai: renderAI,
  predictiveAnalytics: renderPredictiveAnalyticsView,
  cloud: renderCloud,
  data: renderDataView,
  help: renderHelp,
};

function renderSimpleModuleWithEVM() {
  const rows = filterByProject(STATE.data.projects);
  const readOnly = !canEdit(STATE.user.role, "projects");
  const extraColumns = [
    { key: "_status", label: "الحالة (تلقائي)", render: (_, row) => { const s = deriveProjectStatus(row); return statusDot(s === "متأخر" ? "danger" : s === "منتهي" ? "good" : "warn", s); } },
    { key: "_cpi", label: "CPI", render: (_, row) => { const e = computeEVM(row, STATE.data.budgetItems, STATE.data.changeOrders); return `<span style="font-family:monospace">${e.CPI != null ? e.CPI.toFixed(2) : "—"}</span>`; } },
    { key: "_spi", label: "SPI", render: (_, row) => { const e = computeEVM(row, STATE.data.budgetItems, STATE.data.changeOrders); return `<span style="font-family:monospace">${e.SPI != null ? e.SPI.toFixed(2) : "—"}</span>`; } },
    { key: "_sv", label: "انحراف الجدول (SV)", render: (_, row) => {
        if (!row.baselineEnd || !row.endDate) return "—";
        const diff = daysBetween(row.baselineEnd, row.endDate) * (new Date(row.endDate) >= new Date(row.baselineEnd) ? 1 : -1);
        if (row.endDate === row.baselineEnd) return statusDot("good", "0 يوم (على خط الأساس)");
        return statusDot(diff > 0 ? "danger" : "good", `${diff > 0 ? "+" : ""}${diff} يوم عن الأساس`);
      } },
    { key: "_health", label: "الصحة العامة (EVM)", render: (_, row) => { const e = computeEVM(row, STATE.data.budgetItems, STATE.data.changeOrders); const map = { good: "ممتاز", warn: "يحتاج متابعة", danger: "خطر", info: "بيانات غير كافية" }; return statusDot(e.health, map[e.health]); } },
  ];
  const html = renderModuleView("projects", "إدارة المشاريع", MODULES.projects.fields(), rows, extraColumns, readOnly);
  if (readOnly || !rows.length) return html;
  const rebaselineRow = rows.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  return html + `<div class="frame p4" style="margin-top:14px;">
    <h3 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">إعادة خط الأساس (Re-baseline)</h3>
    <p style="font-size:11.5px;color:var(--muted);margin:0 0 10px;">يعتمد التواريخ والميزانية الحالية كخط أساس جديد لحساب الانحرافات المستقبلية — استخدمها فقط بعد اعتماد رسمي لتعديل خطة المشروع.</p>
    <div style="display:flex;gap:8px;">
      <select id="rebaseline-project-select" style="flex:1;max-width:260px;">${rebaselineRow}</select>
      ${btn("اعتماد كخط أساس جديد", "rebaselineProject(document.getElementById('rebaseline-project-select').value)", "ghost", "sm")}
    </div>
  </div>`;
}
function renderRecentEventsPanel(projectId) {
  const events = getProjectEvents(projectId);
  if (!events.length) return "";
  const showCount = STATE.eventsPanelExpanded ? 15 : 4;
  const eventIcons = { INVOICE_SUBMITTED: "🧾", NCR_CREATED: "⚠", NCR_REPEATED: "🔁", ACTIVITY_DELAYED: "⏰",
    GM_NOTE_ISSUED: "📝", GM_NOTE_RESPONSE_SUBMITTED: "↩", GM_NOTE_ACCEPTED: "✓", GM_NOTE_REJECTED: "✕", RESOURCE_ALLOCATED: "📦" };
  const severityColor = { danger: "var(--danger)", warn: "var(--warn)", info: "var(--info)", good: "var(--good)" };
  return `<div class="frame p4" style="margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="STATE.eventsPanelExpanded=!STATE.eventsPanelExpanded;renderApp();">
      <h3 style="font-size:13px;color:#3D4759;margin:0;">🧠 أحداث المشروع الحقيقية (${events.length})</h3>
      <span style="color:var(--muted2);">${STATE.eventsPanelExpanded ? "▲" : "▼"}</span>
    </div>
    <div style="margin-top:8px;">
      ${events.slice(0, showCount).map((e) => `<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border2);">
        <span style="font-size:14px;">${eventIcons[e.eventType] || "🔹"}</span>
        <div style="flex:1;">
          <div style="font-size:11.5px;color:#0F1420;">${esc(e.evidence[0] || e.eventType)}</div>
          <div style="font-size:9.5px;color:var(--muted2);margin-top:1px;">${esc(new Date(e.timestamp).toLocaleString("ar"))} — ${esc(e.createdBy)}</div>
        </div>
        <span style="width:6px;height:6px;border-radius:50%;background:${severityColor[e.severity] || "var(--muted2)"};margin-top:4px;"></span>
      </div>`).join("")}
    </div>
    ${events.length > showCount ? `<p style="font-size:10.5px;color:var(--muted2);margin-top:6px;text-align:center;">${events.length - showCount} حدثاً إضافياً — اضغط للتوسيع</p>` : ""}
  </div>`;
}

function renderTasksModule() {
  const rows = filterByProject(STATE.data.tasks);
  const readOnly = !canEdit(STATE.user.role, "tasks");
  const criticalSet = criticalTaskIds(STATE.data.tasks);
  const extraColumns = [
    { key: "_status", label: "الحالة (تلقائي)", render: (_, row) => { const s = deriveTaskStatus(row); return statusDot(s === "متأخر" ? "danger" : s === "منتهي" ? "good" : "warn", s); } },
    { key: "_critical", label: "مسار حرج (CPM)", render: (_, row) => criticalSet.has(row.id) ? `<span class="badge-pill">حرج</span>` : `<span style="color:var(--muted2);font-size:12px;">—</span>` },
    { key: "_why", label: "لماذا؟", render: (_, row) => {
      const isOverdue = row.end && row.end < todayISO() && Number(row.completion || 0) < 100;
      if (!isOverdue) return "—";
      return `<button class="btn ghost sm" onclick="STATE.whyTaskId='${row.id}';renderApp();">❓ لماذا متأخر؟</button>`;
    } },
  ];
  const whyPanel = STATE.whyTaskId ? renderWhyDelayPanel(STATE.whyTaskId) : "";
  return whyPanel + renderModuleView("tasks", "إدارة المهام", MODULES.tasks.fields(), rows, extraColumns, readOnly);
}
function renderWhyDelayPanel(taskId) {
  const explanation = explainActivityDelay(taskId);
  if (!explanation.available) return `<div class="frame p4" style="margin-bottom:14px;">${emptyState(explanation.reason)}${btn("إغلاق", "STATE.whyTaskId=null;renderApp();", "ghost", "sm")}</div>`;
  const typeColors = { FACT: "#22d3ee", CALCULATION: "#a78bfa", INFERENCE: "#F5A623" };
  const typeLabels = { FACT: "حقيقة", CALCULATION: "حساب", INFERENCE: "استدلال" };
  return `<div class="ai-panel" style="margin-bottom:14px;"><div class="ai-panel-inner">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span class="ai-badge">❓ لماذا تأخَّر «${esc(explanation.taskName)}»؟ (${explanation.daysLate} يوماً)<span class="ai-live-dot"></span></span>
      ${btn("إغلاق", "STATE.whyTaskId=null;renderApp();", "ghost", "sm")}
    </div>
    ${explanation.reasons.map((r) => `<div style="display:flex;gap:8px;margin-bottom:6px;font-size:12px;">
      <span style="background:${typeColors[r.type] || "#666"};color:#0a0f16;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;white-space:nowrap;">${typeLabels[r.type] || r.type}</span>
      <span style="color:#0F1420;">${esc(r.text)}</span>
    </div>`).join("")}
    <p style="font-size:10.5px;color:var(--muted2);margin-top:8px;">تفسير قائم على قواعد وحسابات حقيقية من بيانات المشروع — لا استنتاج ذكاء اصطناعي حر بلا مرجع.</p>
  </div></div>`;
}

/* ---------------- Login ---------------- */
function renderLogin() {
  const tmpUsername = STATE._loginUsername || "";
  const tmpPassword = STATE._loginPassword || "";
  const err = STATE._loginError;
  return `<div class="login-wrap">
    <div class="frame login-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <div class="brand-badge">PM</div>
        <div>
          <div style="font-weight:700;color:#0F1420;">نظام إدارة المشاريع المتكامل</div>
          <div style="font-size:11px;color:var(--muted2);font-family:monospace;">يعمل محلياً بالكامل بدون إنترنت</div>
        </div>
      </div>
      <div class="field">
        <label>اسم المستخدم</label>
        <input class="inp" style="width:100%;" value="${esc(tmpUsername)}" placeholder="اسم المستخدم" oninput="STATE._loginUsername=this.value" onkeydown="if(event.key==='Enter'){document.getElementById('login-pass').focus();}" />
      </div>
      <div class="field">
        <label>كلمة المرور</label>
        <input id="login-pass" class="inp" style="width:100%;" type="password" value="${esc(tmpPassword)}" placeholder="كلمة المرور" oninput="STATE._loginPassword=this.value" onkeydown="if(event.key==='Enter'){doLogin();}" />
      </div>
      ${err ? `<div style="color:var(--danger);font-size:12px;margin-bottom:10px;">${esc(err)}</div>` : ""}
      <button class="btn primary" style="width:100%;justify-content:center;" onclick="doLogin()">دخول النظام</button>
      <p style="font-size:10px;color:#4b5a68;line-height:1.7;margin-top:12px;">هذا تحقق دخول محلي داخل المتصفح فقط، وليس نظام حماية بمستوى خادم. للحصول على بيانات الدخول، تواصل مع مسؤول النظام في مؤسستك.</p>
    </div>
  </div>`;
}
function doLogin() {
  const username = (STATE._loginUsername || "").trim();
  const password = STATE._loginPassword || "";
  if (!username || !password) { STATE._loginError = "أدخل اسم المستخدم وكلمة المرور."; renderApp(); return; }
  const match = (STATE.data.users || []).find((u) => String(u.username || "").trim().toLowerCase() === username.toLowerCase());
  if (match && match.status && match.status !== "نشط") {
    const statusMessages = { "معطَّل": "هذا الحساب معطَّل. تواصل مع الإدارة.", "موقوف": "هذا الحساب موقوف مؤقتاً. تواصل مع الإدارة.", "مقفَل": "هذا الحساب مقفَل بسبب محاولات دخول فاشلة متكررة. تواصل مع الإدارة لإعادة تفعيله.", "منتظر التفعيل": "هذا الحساب بانتظار تفعيل الإدارة." };
    STATE._loginError = statusMessages[match.status] || "هذا الحساب غير نشط حالياً.";
    renderApp();
    return;
  }
  const passwordOk = match && (match.passwordHash
    ? hashPassword(password, match.salt) === match.passwordHash
    : String(match.password || "") === password); // توافق مؤقت مع حسابات قديمة لم تُحدَّث بعد لصيغة التجزئة
  if (!match || !passwordOk) {
    if (match) {
      const attempts = (match.failedLoginAttempts || 0) + 1;
      const shouldLock = attempts >= 5;
      STATE.data.users = STATE.data.users.map((u) => u.id === match.id ? Object.assign({}, u, { failedLoginAttempts: attempts, status: shouldLock ? "مقفَل" : u.status }) : u);
      saveData(STATE.data);
      if (shouldLock) logAudit("update", "users", match.id, `قفل الحساب تلقائياً بعد ${attempts} محاولات دخول فاشلة متتالية`);
    }
    STATE._loginError = "اسم المستخدم أو كلمة المرور غير صحيحة.";
    renderApp();
    return;
  }
  if (!match.passwordHash) {
    // ترقية تلقائية وشفافة لحساب قديم من نص صريح إلى تجزئة مع ملح، دون أي إجراء من المستخدم
    const salt = generateSalt();
    STATE.data.users = STATE.data.users.map((u) => u.id === match.id
      ? Object.assign({}, u, { passwordHash: hashPassword(password, salt), salt, password: undefined })
      : u);
    saveData(STATE.data);
  }
  STATE.data.users = STATE.data.users.map((u) => u.id === match.id ? Object.assign({}, u, { failedLoginAttempts: 0, lastLoginAt: Date.now() }) : u);
  saveData(STATE.data);
  STATE.user = { id: match.id, name: match.name, role: match.role, username: match.username, linkedResourceId: match.linkedResourceId };
  STATE._loginError = null;
  STATE._loginPassword = "";
  saveUser(STATE.user);
  renderApp();
}
function doLogout() {
  STATE.user = null;
  STATE._loginUsername = "";
  STATE._loginPassword = "";
  clearUser();
  renderApp();
}

/* ---------------- Global Search — scans across all modules ---------------- */
/* [مُنتقَلة إلى app-search-graph.js — computeGlobalSearchResults أصبحت غلافاً حول سجل
   مزوِّدي بحث (SearchIndexProviders)، بنفس السلوك تماماً، مع نطاقات إضافية جديدة] */
function onGlobalSearchInput(v) {
  STATE.globalSearchQuery = v;
  STATE.globalSearchOpen = v.trim().length >= 2;
  renderApp();
}
function clearGlobalSearch() {
  STATE.globalSearchQuery = "";
  STATE.globalSearchOpen = false;
  renderApp();
}
function jumpToSearchResult(navKey, projectId, special, moduleKey, recordId) {
  STATE.active = navKey;
  if (projectId) STATE.projectFilter = projectId;
  if (special === "projectDrill" && projectId) {
    STATE.active = "dashboard";
    STATE.dashboardDrill = { level: "project", projectId };
  } else if (navKey === "dashboard") {
    STATE.dashboardDrill = { level: "portfolio" };
  }
  STATE.globalSearchQuery = "";
  STATE.globalSearchOpen = false;
  renderApp();
  if (moduleKey && recordId && MODULES[moduleKey] && canEdit(STATE.user.role, moduleKey === "decisions" ? "meetings" : moduleKey === "resourcePool" ? "resources" : moduleKey)) {
    setTimeout(() => openEditModal(moduleKey, recordId), 80); // بعد استقرار التنقّل، فتح السجل نفسه مباشرة للتعديل — لا الصفحة فقط
  }
}

function renderGlobalSearchResults() {
  const results = computeGlobalSearchResults(STATE.globalSearchQuery);
  if (!results.length) return `<div class="gsearch-results"><div class="gsearch-empty">لا توجد نتائج مطابقة لـ«${esc(STATE.globalSearchQuery)}»</div></div>`;
  const items = results.map((r) =>
    `<div class="gsearch-item" onclick="jumpToSearchResult('${r.navKey}',${r.projectId ? `'${r.projectId}'` : "null"},${r.special ? `'${r.special}'` : "null"},${r.moduleKey ? `'${r.moduleKey}'` : "null"},${r.recordId ? `'${r.recordId}'` : "null"})">
      <span class="ic">${r.icon}</span>
      <div class="txt"><div class="lbl">${esc(r.label)}</div><div class="sub">${esc(r.sub || "")}</div></div>
      ${r.recordId ? `<span style="font-size:9px;color:var(--muted2);">↵ فتح مباشر</span>` : ""}
    </div>`
  ).join("");
  return `<div class="gsearch-results">${items}</div>`;
}

/* ---------------- Shell (sidebar + topbar) ---------------- */
/* ============================================================
   نظام الرجوع للخلف — يحفظ لقطة كاملة من حالة الواجهة (كل فلاتر
   وبحث وفرز وموضع تمرير، لأن هذه كلها بالفعل حقول STATE.* في هذا
   النظام) قبل أي تنقّل، فيعود المستخدم لنفس مكانه تماماً — لا مجرد
   العودة لنفس الصفحة فارغة من حالتها.
   ============================================================ */
function initBackButtonTrap() {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  window.addEventListener("popstate", () => {
    if (STATE.navHistory && STATE.navHistory.length) {
      goBack();
      // أعد وضع حاجز سجل جديد فوراً، فتبقى الضغطة التالية على زر الرجوع
      // مُعتَرَضة أيضاً، ما دام لا يزال هناك سجل تنقّل داخلي فعلي
      if (window.history && typeof window.history.pushState === "function") {
        try { window.history.pushState({ pmsBackTrap: true }, "", location.href); } catch (e) { /* تجاهل بأمان */ }
      }
    }
    // لا سجل تنقّل داخلي متبقٍ = اترك سلوك الرجوع الافتراضي (خروج فعلي) يحدث بلا تدخّل
  });
}

function pushNavHistory() {
  STATE.navHistory = STATE.navHistory || [];
  const snapshot = Object.assign({}, STATE);
  delete snapshot.data; // لا تُكرِّر قاعدة البيانات نفسها في كل لقطة (توفير ذاكرة حقيقي)
  delete snapshot.navHistory; // تجنّب تداخل المكدس داخل نفسه
  const appEl = document.getElementById("app");
  snapshot._scrollY = appEl ? appEl.scrollTop : 0;
  STATE.navHistory.push(snapshot);
  if (STATE.navHistory.length > 30) STATE.navHistory.shift(); // حدّ معقول يمنع تضخّم الذاكرة بلا حاجة
  /* ربط حقيقي بسجل متصفح فعلي — هذا ما يجعل زر الرجوع الفعلي في
     الهاتف (أسفل الشاشة أو إيماءة النظام) يعمل مع النظام، لا يخرج
     منه مباشرة. */
  if (typeof window !== "undefined" && window.history && typeof window.history.pushState === "function") {
    try { window.history.pushState({ pmsBackTrap: true }, "", location.href); } catch (e) { /* بعض بيئات file:// قد ترفض هذا، تجاهل بأمان */ }
  }
}
function goBack() {
  if (!STATE.navHistory || !STATE.navHistory.length) return;
  const previous = STATE.navHistory.pop();
  const scrollY = previous._scrollY || 0;
  delete previous._scrollY;
  const historyStack = STATE.navHistory; // احتفظ بالمكدس نفسه، فلا يُستبدَل بالكامل عند الاستعادة
  Object.keys(STATE).forEach((k) => { if (k !== "data" && k !== "navHistory") delete STATE[k]; });
  Object.assign(STATE, previous);
  STATE.navHistory = historyStack;
  STATE._pendingScrollRestore = scrollY;
  renderApp();
}
/* ============================================================
   طي/فتح أقسام القائمة الجانبية — كل عنوان رئيسي فقط يظهر افتراضياً،
   والعناصر الفرعية تظهر كقائمة منسدلة عند الضغط على العنوان. القسم
   الذي يحوي الصفحة النشطة يُفتَح تلقائياً عند التنقّل إليه، لكن أي
   طيّ يدوي لاحق من المستخدم (حتى لهذا القسم نفسه) يُحتَرَم بالكامل.
   ============================================================ */
function getNavExpandedSections() {
  if (!STATE.navExpandedSections) {
    const activeSection = NAV_SECTIONS.find((sec) => sec.items.some((n) => n.key === STATE.active));
    STATE.navExpandedSections = new Set(activeSection ? [activeSection.section] : []);
  }
  return STATE.navExpandedSections;
}
function toggleNavSection(sectionName) {
  const set = getNavExpandedSections();
  if (set.has(sectionName)) set.delete(sectionName); else set.add(sectionName);
  renderApp();
}
function setActive(key) {
  if (key === "apex" && !(window.APEX12?.apexCommanderAllowed?.() || ["مدير عام","مالك الشركة","مدير PMO","Executive","APEX Commander"].includes(String(STATE.user?.role||"")))) {
    return;
  }
  const targetSection = NAV_SECTIONS.find((sec) => sec.items.some((n) => n.key === key));
  if (targetSection) getNavExpandedSections().add(targetSection.section);
  if (key !== STATE.active) pushNavHistory();
  STATE.active = key;
  STATE.mobileSidebarOpen = false;
  renderApp();
}
function toggleSidebar() { STATE.sidebarOpen = !STATE.sidebarOpen; renderApp(); }
function toggleMobileSidebar() { STATE.mobileSidebarOpen = !STATE.mobileSidebarOpen; renderApp(); }
function closeMobileSidebar() { STATE.mobileSidebarOpen = false; renderApp(); }
function setProjectFilter(v) {
  if (v !== "all" && STATE.user) {
    const scope = getUserScopedProjectIds();
    if (scope && !scope.has(v)) { alert("لا يمكنك عرض بيانات مشروع خارج نطاق إدارتك الحالي."); return; }
  }
  STATE.projectFilter = v;
  STATE.dashboardDrill = { level: "portfolio" };
  renderApp();
}

const QUICK_ACCESS_BY_ROLE = {
  "مدير المشروع": ["projects", "schedule", "sitereports", "certificates"],
  "مهندس الموقع": ["sitereports", "punchlist", "qc", "digitalTwin"],
  "المحاسب العام": ["invoices", "certificates", "finance", "custodies"],
  "مدير عام": ["resourcePool", "projects"],
  "مالك الشركة": ["dashboard", "ai", "predictiveAnalytics"],
};
function renderShell() {
  const role = STATE.user.role;
  const allowed = ROLE_CONFIG[role].view;
  if (!allowed.includes(STATE.active)) STATE.active = "dashboard";

  const quickAccessKeys = (QUICK_ACCESS_BY_ROLE[role] || []).filter((k) => allowed.includes(k));
  const quickAccessHtml = quickAccessKeys.length ? `<div class="nav-section-label"><span class="lbl">⭐ الأكثر استخداماً لدورك</span></div>${
    quickAccessKeys.map((key) => {
      const item = NAV.find((n) => n.key === key);
      if (!item) return "";
      return `<button class="nav-item ${STATE.active === key ? "active" : ""}" onclick="setActive('${key}')">
        <span class="ic">${item.ic}</span><span class="lbl">${esc(item.label)}</span>
      </button>`;
    }).join("")
  }<div class="nav-section-label" style="margin-top:4px;"><span class="lbl">كل الأقسام</span></div>` : "";

  const DIGITAL_TWIN_SUBITEMS = [
    { tab: "assets", ic: "🏗", label: "سجل العناصر والتسلسل الهرمي" },
    { tab: "progressreport", ic: "📊", label: "تحقّق التقدّم بالذكاء الاصطناعي" },
    { tab: "bimviewer", ic: "🧊", label: "عارض BIM + تلوين 4D" },
    { tab: "pointcloud", ic: "☁", label: "سحابة النقاط + واقع افتراضي" },
    { tab: "sensors", ic: "📟", label: "مستشعرات IoT" },
    { tab: "captures", ic: "📡", label: "المسوحات والمقارنة الزمنية" },
  ];
  const navHtml = NAV_SECTIONS.map((sec, secIndex) => {
    const items = sec.items.filter((n) => allowed.includes(n.key));
    if (!items.length) return "";
    let lastGroup = null;
    const itemsHtml = items.map((n) => {
      const groupHeaderHtml = n.group && n.group !== lastGroup
        ? (() => { lastGroup = n.group; return `<div class="nav-subgroup-label"><span>${esc(n.group)}</span></div>`; })()
        : "";
      if (n.key === "digitalTwin") {
        const isActive = STATE.active === "digitalTwin";
        const expanded = STATE.digitalTwinNavExpanded !== false; // مفتوحة افتراضياً لإبراز القدرات فوراً
        const subHtml = expanded ? DIGITAL_TWIN_SUBITEMS.map((s) => `<div class="nav-subitem ${isActive && (STATE.digitalTwinTab || "assets") === s.tab ? "active" : ""}" onclick="setActive('digitalTwin');setDigitalTwinTab('${s.tab}');">
            <span>${s.ic}</span><span>${esc(s.label)}</span>
          </div>`).join("") : "";
        return groupHeaderHtml + `<button class="nav-item nav-item-premium ${isActive ? "active" : ""}" data-sec="${secIndex}" onclick="setActive('digitalTwin')">
            <span class="ic">${n.ic}</span><span class="lbl">${esc(n.label)}</span>
            <span class="nav-badge">6 قدرات<span class="nav-live-dot"></span></span>
            <span class="nav-expand-toggle" onclick="event.stopPropagation();STATE.digitalTwinNavExpanded=${!expanded};renderApp();">${expanded ? "▲" : "▼"}</span>
          </button>${subHtml}`;
      }
      if (n.key === "projectChatRoom") {
        const totalUnread = (STATE.data.projects || []).reduce((sum, p) => {
          const rooms = getAccessibleChatRooms(p.id, STATE.user);
          return sum + rooms.reduce((s, r) => s + computeUnreadMessageCount(r.id), 0);
        }, 0);
        return groupHeaderHtml + `<button class="nav-item ${STATE.active === n.key ? "active" : ""}" data-sec="${secIndex}" onclick="setActive('${n.key}')">
          <span class="ic">${n.ic}</span><span class="lbl">${esc(n.label)}</span>
          ${totalUnread ? `<span class="nav-badge" style="background:rgba(229,72,77,.15);color:#E5484D;">${totalUnread}<span class="nav-live-dot" style="background:#E5484D;box-shadow:0 0 5px #E5484D;"></span></span>` : ""}
        </button>`;
      }
      return groupHeaderHtml + `<button class="nav-item ${STATE.active === n.key ? "active" : ""}" data-sec="${secIndex}" onclick="setActive('${n.key}')">
        <span class="ic">${n.ic}</span><span class="lbl">${esc(n.label)}</span>
      </button>`;
    }).join("");
    const isSectionExpanded = getNavExpandedSections().has(sec.section);
    const headerHtml = sec.section ? `<div class="nav-section-label nav-section-toggle" onclick="toggleNavSection('${esc(sec.section)}')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
      <span class="lbl">${esc(sec.section)}</span>
      <span class="nav-section-arrow" style="font-size:9px;transition:transform .15s;">${isSectionExpanded ? "▼" : "◂"}</span>
    </div>` : "";
    return headerHtml + (sec.section && !isSectionExpanded ? "" : `<div class="nav-section-items">${itemsHtml}</div>`);
  }).join("");

  const userScope = getUserScopedProjectIds();
  const visibleProjects = userScope ? STATE.data.projects.filter((p) => userScope.has(p.id)) : STATE.data.projects;
  const projOptsHtml = visibleProjects.map((p) => `<option value="${p.id}" ${STATE.projectFilter === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  const allProjectsLabel = userScope ? "كل مشاريعي" : "جميع المشاريع";

  const bodyHtml = (VIEW_RENDERERS[STATE.active] || renderDashboard)();

  return `<div class="app-shell">
    ${STATE.mobileSidebarOpen ? `<div class="sidebar-backdrop no-print" onclick="closeMobileSidebar()"></div>` : ""}
    <aside class="sidebar no-print ${STATE.sidebarOpen ? "" : "collapsed"} ${STATE.mobileSidebarOpen ? "mobile-open" : ""}">
      <div class="sidebar-head">
        <div class="brand-badge">PM</div>
        <div class="brand-text"><div class="brand-name">نظام إدارة المشاريع</div><div class="brand-sub">Offline Edition</div></div>
      </div>
      <nav class="nav">${quickAccessHtml}${navHtml}</nav>
      <button class="sidebar-toggle" onclick="toggleSidebar()">☰</button>
    </aside>
    <div class="main">
      <header class="topbar no-print">
        <div class="topbar-left">
          <button class="mobile-menu-btn" onclick="toggleMobileSidebar()">☰</button>
          ${(STATE.navHistory || []).length ? `<button class="btn ghost sm" onclick="goBack()" style="white-space:nowrap;">← رجوع</button>` : ""}
          <span class="hide-mobile" style="font-size:11px;color:var(--muted2);font-family:monospace;">${todayISO()}</span>
          <span class="hide-mobile" style="color:#334;">|</span>
          <select onchange="setProjectFilter(this.value)">
            <option value="all">${allProjectsLabel}</option>
            ${projOptsHtml}
          </select>
          <div class="gsearch notif-wrap" style="position:relative;">
            <button class="btn ghost sm" onclick="toggleNotificationPanel()" style="position:relative;">
              🔔${getUnreadNotifications(STATE.user.id).length ? `<span class="nav-badge" style="position:absolute;top:-6px;right:-6px;background:rgba(229,72,77,.2);color:#E5484D;">${getUnreadNotifications(STATE.user.id).length}</span>` : ""}
            </button>
            ${STATE.notificationPanelOpen ? renderNotificationPanel() : ""}
          </div>
          <div class="gsearch">
            <input id="global-search-input" type="text" placeholder="🔍 بحث شامل في النظام..." value="${esc(STATE.globalSearchQuery || "")}"
              oninput="onGlobalSearchInput(this.value)" onkeydown="if(event.key==='Escape'){clearGlobalSearch();}" />
            ${STATE.globalSearchOpen ? renderGlobalSearchResults() : ""}
          </div>
        </div>
        <div class="topbar-right">
          ${(STATE.canInstall || (isIOSDevice() && !isRunningStandalone())) ? btn("📲 تثبيت", "triggerInstallPrompt()", "primary", "sm") : ""}
          <span class="hide-mobile" style="display:flex;align-items:center;font-size:11px;color:var(--muted2);">${
            STATE.cloudStatus === "connected"
              ? `<span class="sync-dot"></span>مزامنة سحابية فورية نشطة`
              : STATE.cloudStatus === "error"
              ? `<span class="dot danger"></span>خطأ بالمزامنة السحابية`
              : `<span class="dot info"></span>محفوظ محلياً على هذا الجهاز فقط`
          }</span>
          <div class="user-badge">
            <span>${ROLE_CONFIG[role].icon}</span>
            <span><b>${esc(STATE.user.name)}</b><span class="role">${esc(role)}</span></span>
          </div>
          ${role === "مالك الشركة" ? btn("↺", "resetSystemData()", "ghost", "sm") : ""}
          <button class="btn ghost sm" onclick="doLogout()">خروج</button>
        </div>
      </header>
      <main class="content">${bodyHtml}</main>
      ${renderBottomNav(role, allowed)}
      ${renderMobileSearchOverlay()}
    </div>
  </div>`;
}
function renderBottomNav(role, allowed) {
  const quickKeys = (QUICK_ACCESS_BY_ROLE[role] || []).filter((k) => allowed.includes(k)).slice(0, 3);
  const items = quickKeys.map((key) => NAV.find((n) => n.key === key)).filter(Boolean);
  if (!items.length) return "";
  return `<nav class="bottom-nav">
    ${items.map((item) => `<button class="bottom-nav-item ${STATE.active === item.key ? "active" : ""}" onclick="setActive('${item.key}')">
      <span class="ic">${item.ic}</span><span>${esc(item.label.length > 12 ? item.label.slice(0, 10) + "…" : item.label)}</span>
    </button>`).join("")}
    <button class="bottom-nav-item" onclick="openMobileSearchOverlay()">
      <span class="ic">🔍</span><span>بحث</span>
    </button>
    <button class="bottom-nav-item" onclick="toggleMobileSidebar()">
      <span class="ic">☰</span><span>المزيد</span>
    </button>
  </nav>`;
}
function openMobileSearchOverlay() { STATE.mobileSearchOpen = true; STATE.globalSearchQuery = ""; renderApp(); }
function closeMobileSearchOverlay() { STATE.mobileSearchOpen = false; renderApp(); }
function renderMobileSearchOverlay() {
  if (!STATE.mobileSearchOpen) return "";
  return `<div style="position:fixed;inset:0;background:#FFFFFF;z-index:500;display:flex;flex-direction:column;">
    <div style="display:flex;gap:8px;align-items:center;padding:14px;border-bottom:1px solid var(--border2);">
      <input id="mobile-search-input" type="text" placeholder="🔍 بحث شامل في كل النظام — مشاريع، مهام، فواتير، عقود، مخاطر..." value="${esc(STATE.globalSearchQuery || "")}"
        oninput="onGlobalSearchInput(this.value)" style="flex:1;background:var(--row);border:1px solid var(--border2);border-radius:8px;padding:10px 12px;color:#0F1420;font-size:15px;" autofocus />
      <button class="btn ghost sm" onclick="closeMobileSearchOverlay()">إغلاق</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:10px;">
      ${STATE.globalSearchQuery ? renderGlobalSearchResultsFullscreen() : `<p style="text-align:center;color:var(--muted2);font-size:12.5px;margin-top:30px;">اكتب اسم مشروع، رقم فاتورة، اسم مهمة، أو أي شيء آخر — تُفتح النتيجة مباشرة للتعديل.</p>`}
    </div>
  </div>`;
}
function renderGlobalSearchResultsFullscreen() {
  const results = computeGlobalSearchResults(STATE.globalSearchQuery);
  if (!results.length) return `<div class="gsearch-empty">لا توجد نتائج مطابقة لـ«${esc(STATE.globalSearchQuery)}»</div>`;
  return results.map((r) =>
    `<div class="gsearch-item" style="border-radius:8px;margin-bottom:4px;" onclick="closeMobileSearchOverlay();jumpToSearchResult('${r.navKey}',${r.projectId ? `'${r.projectId}'` : "null"},${r.special ? `'${r.special}'` : "null"},${r.moduleKey ? `'${r.moduleKey}'` : "null"},${r.recordId ? `'${r.recordId}'` : "null"})">
      <span class="ic">${r.icon}</span>
      <div class="txt"><div class="lbl">${esc(r.label)}</div><div class="sub">${esc(r.sub || "")}</div></div>
      ${r.recordId ? `<span style="font-size:9px;color:var(--muted2);">↵ فتح مباشر</span>` : ""}
    </div>`
  ).join("");
}

/* ---------------- Root render ---------------- */
function renderApp() {
  clearDigitalTwinRenderCache();
  const root = document.getElementById("app");
  if (!STATE.user) {
    root.innerHTML = renderLogin();
    return;
  }
  // حفظ التركيز وموضع المؤشر قبل إعادة البناء الكاملة للواجهة (مشكلة حقيقية: أي مربع بحث/إدخال نصي كان يفقد التركيز بعد كل حرف)
  const active = document.activeElement;
  let focusId = null, selStart = null, selEnd = null;
  if (active && active.id && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    focusId = active.id;
    selStart = active.selectionStart;
    selEnd = active.selectionEnd;
  }
  root.innerHTML = renderShell() + renderModal() + renderHandoffSubCustodyModal() + renderQuickIssueCustodyModal() + renderCommandPalette() + renderToasts() + renderFab();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (selStart != null && el.setSelectionRange) {
        try { el.setSelectionRange(selStart, selEnd); } catch (e) { /* بعض أنواع الإدخال (مثل date/number) لا تدعم setSelectionRange */ }
      }
    }
  }
  if (STATE.modal) afterModalRender();
  if (STATE.assetBarcodeId) {
    const svg = document.getElementById("asset-barcode-svg");
    if (svg) renderBarcodeInto(svg, STATE.assetBarcodeId);
  }
  if (STATE.active === "projectChatRoom") {
    const chatContainer = document.getElementById("chat-messages-container");
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  if (STATE._pendingScrollRestore != null) {
    const appEl = document.getElementById("app");
    if (appEl) appEl.scrollTop = STATE._pendingScrollRestore;
    delete STATE._pendingScrollRestore;
  }
  initFabDrag();
  if (STATE.active === "digitalTwin" && (STATE.digitalTwinTab || "overview") === "pointcloud" && STATE.currentPointCloudPoints) {
    loadPointCloudSnapshotsList();
  }
  if (STATE.commandPaletteOpen && focusId !== "command-palette-input") {
    const cpInput = document.getElementById("command-palette-input");
    if (cpInput && cpInput.focus) cpInput.focus();
  }
  if (STATE.user && STATE.active === "schedule" && (STATE.scheduleView || "gantt") === "gantt") {
    const tasks = filterByProject(STATE.data.tasks).slice().sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    ganttInit(tasks);
  }
  if (STATE.user && STATE.active === "dashboard" && STATE.dashboardDrill && STATE.dashboardDrill.level === "project") {
    const proj = (STATE.data.projects || []).find((p) => p.id === STATE.dashboardDrill.projectId);
    if (proj && proj.lat && proj.lng) initProjectLocationPreview(proj.lat, proj.lng, proj.name);
  }
}

/* ---------------- Bootstrap ---------------- */
/* ---------------- تثبيت التطبيق على الشاشة الرئيسية (PWA Install) ---------------- */
let deferredInstallPrompt = null;
function isRunningStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}
function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    STATE.canInstall = true;
    renderApp();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    STATE.canInstall = false;
    renderApp();
  });
}
async function triggerInstallPrompt() {
  if (isIOSDevice()) {
    alert("للتثبيت على آيفون/آيباد:\n\n1) اضغط زر «المشاركة» (المربع مع السهم للأعلى) في شريط Safari السفلي.\n2) اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).\n3) اضغط «إضافة».\n\nملاحظة: هذا يعمل فقط من متصفح Safari مباشرة، وليس من داخل تطبيق آخر.");
    return;
  }
  if (!deferredInstallPrompt) {
    alert("خيار التثبيت غير متاح حالياً في هذا المتصفح. جرّب فتح الرابط في Chrome (أندرويد) أو تأكد أن الصفحة تُفتح عبر HTTPS.");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  STATE.canInstall = false;
  renderApp();
}

async function initApp() {
  STATE.data = await loadData();
  STATE.user = loadUser();
  loadFabPosition();
  initBackButtonTrap();
  if (STATE.user) {
    const freshRecord = (STATE.data.users || []).find((u) => u.id === STATE.user.id);
    if (!freshRecord || (freshRecord.status && freshRecord.status !== "نشط")) {
      STATE.user = null;
      clearUser();
    }
  }
  STATE.cloudStatus = "disconnected";
  STATE.msGraphStatus = "disconnected";
  STATE.canInstall = false;
  renderApp();

  if (STATE.user && typeof scanForSLABreaches === "function") {
    const slaResult = scanForSLABreaches();
    if (slaResult.notified > 0) renderApp();
  }
  if (typeof tryAutoReconnectCloud === "function") {
    tryAutoReconnectCloud();
  }
  if (typeof tryAutoReconnectMsGraph === "function") {
    tryAutoReconnectMsGraph().then(() => renderApp());
  }

  if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
    navigator.serviceWorker.register("service-worker.js").then(() => {
      console.log("[PMS] تسجيل Service Worker نجح — إن لم يظهر زر التثبيت رغم ذلك، راجع تبويب Application في أدوات المطوّر.");
    }).catch((err) => {
      console.error("[PMS] فشل تسجيل Service Worker — هذا يمنع ظهور زر التثبيت التلقائي على أندرويد:", err);
    });
  }
}
/* ============================================================
   لوحة الأوامر السريعة (Command Palette) — Ctrl/Cmd+K — تنقّل فوري
   لأي صفحة أو تنفيذ إجراء سريع (إضافة سجل) بلا المرور عبر القائمة
   الجانبية خطوة بخطوة. ميزة جديدة حقيقية، لا تكرار لشريط البحث
   الشامل الموجود أصلاً (ذاك يبحث في البيانات، هذا في الصفحات والإجراءات).
   ============================================================ */
function getCommandPaletteItems() {
  if (!STATE.user) return [];
  const role = STATE.user.role;
  const allowed = ROLE_CONFIG[role].view;
  const editable = ROLE_CONFIG[role].edit || [];
  const actionCommands = [
    { key: "projects", label: "+ إضافة مشروع جديد" }, { key: "tasks", label: "+ إضافة مهمة جديدة" },
    { key: "sitereports", label: "+ تقرير يومي جديد" }, { key: "risks", label: "+ إضافة خطر جديد" },
    { key: "meetings", label: "+ تسجيل اجتماع جديد" }, { key: "gmNotes", label: "+ ملاحظة إدارة عليا جديدة" },
  ].filter((a) => editable.includes(a.key)).map((a) => ({ type: "action", icon: "➕", label: a.label, execute: () => { setActive(a.key); setTimeout(() => openAddModal(a.key), 60); } }));
  const fabToggleCommand = isFabHidden()
    ? [{ type: "action", icon: "👁", label: "إظهار زر الإضافة السريع (+)", execute: () => restoreFab() }]
    : [{ type: "action", icon: "🙈", label: "إخفاء زر الإضافة السريع (+)", execute: () => promptHideFab() }];
  const navCommands = NAV.filter((n) => allowed.includes(n.key)).map((n) => ({
    type: "nav", icon: n.ic, label: "الذهاب إلى: " + n.label, execute: () => setActive(n.key),
  }));
  return [...actionCommands, ...fabToggleCommand, ...navCommands];
}
function openCommandPalette() { STATE.commandPaletteOpen = true; STATE.commandPaletteQuery = ""; STATE.commandPaletteSelectedIndex = 0; renderApp(); }
function closeCommandPalette() { STATE.commandPaletteOpen = false; renderApp(); }
function filterCommandPaletteItems() {
  const q = (STATE.commandPaletteQuery || "").trim().toLowerCase();
  const items = getCommandPaletteItems();
  if (!q) return items.slice(0, 10);
  return items.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 10);
}
function onCommandPaletteInput(v) { STATE.commandPaletteQuery = v; STATE.commandPaletteSelectedIndex = 0; renderApp(); }
function onCommandPaletteKeydown(e) {
  const items = filterCommandPaletteItems();
  if (e.key === "ArrowDown") { e.preventDefault(); STATE.commandPaletteSelectedIndex = Math.min((STATE.commandPaletteSelectedIndex || 0) + 1, Math.max(items.length - 1, 0)); renderApp(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); STATE.commandPaletteSelectedIndex = Math.max((STATE.commandPaletteSelectedIndex || 0) - 1, 0); renderApp(); }
  else if (e.key === "Enter") { e.preventDefault(); executeCommandPaletteItem(STATE.commandPaletteSelectedIndex || 0); }
  else if (e.key === "Escape") { closeCommandPalette(); }
}
function executeCommandPaletteItem(index) {
  const items = filterCommandPaletteItems();
  const item = items[index];
  if (!item) return;
  closeCommandPalette();
  item.execute();
}
function renderCommandPalette() {
  if (!STATE.commandPaletteOpen) return "";
  const items = filterCommandPaletteItems();
  const selectedIndex = Math.min(STATE.commandPaletteSelectedIndex || 0, Math.max(items.length - 1, 0));
  return `<div class="modal-overlay" onclick="if(event.target===this) closeCommandPalette();">
    <div class="modal-box" style="max-width:520px;">
      <div class="modal-body" style="padding:14px;">
        <input id="command-palette-input" class="inp" style="width:100%;font-size:14px;padding:10px;" placeholder="اكتب للبحث عن صفحة أو إجراء سريع... (Ctrl+K)" value="${esc(STATE.commandPaletteQuery || "")}" oninput="onCommandPaletteInput(this.value)" onkeydown="onCommandPaletteKeydown(event)" />
        <div style="max-height:320px;overflow-y:auto;margin-top:8px;">
          ${items.length ? items.map((item, i) => `<div class="nav-subitem ${i === selectedIndex ? "active" : ""}" style="padding:10px 12px;cursor:pointer;" onclick="executeCommandPaletteItem(${i})">
            <span>${item.icon}</span><span style="margin-right:6px;">${esc(item.label)}</span>
          </div>`).join("") : `<div style="padding:20px;text-align:center;color:var(--muted2);font-size:12px;">لا نتائج مطابقة</div>`}
        </div>
        <div style="font-size:10px;color:var(--muted2);margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">↑↓ للتنقّل — Enter للتنفيذ — Esc للإغلاق</div>
      </div>
    </div>
  </div>`;
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (STATE.user) openCommandPalette();
  }
});
document.addEventListener("DOMContentLoaded", initApp);
