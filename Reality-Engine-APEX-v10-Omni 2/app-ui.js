/* ============================================================
   عناصر واجهة عامة قابلة لإعادة الاستخدام
   ============================================================ */

function statusDot(level, label) {
  return `<span class="status"><span class="dot ${level}"></span>${label ? esc(label) : ""}</span>`;
}
function generateSparklineSVG(values, colorHex) {
  if (!values || values.length < 2) return "";
  const w = 70, h = 22, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const lastX = pad + (w - pad * 2);
  const lastY = h - pad - ((values[values.length - 1] - min) / range) * (h - pad * 2);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
    <polyline points="${points}" fill="none" stroke="${colorHex || "#22d3ee"}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></polyline>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2" fill="${colorHex || "#22d3ee"}"></circle>
  </svg>`;
}
function kpiCard({ label, value, sub, level, sparkline }) {
  const sparkColor = level === "danger" ? "#E5484D" : level === "warn" ? "#F5A623" : level === "good" ? "#2FBF71" : "#22d3ee";
  return `<div class="frame kpi ${level ? "kpi-" + level : ""}">
    <div class="lbl"><span>${esc(label)}</span>${level ? `<span class="dot ${level}"></span>` : ""}</div>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:6px;">
      <div class="val">${esc(value)}</div>
      ${sparkline && sparkline.length >= 2 ? generateSparklineSVG(sparkline, sparkColor) : ""}
    </div>
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
  </div>`;
}
function ringBadge(label, value, colorHex) {
  const r = 15, circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - pct / 100);
  return `<div class="ring-wrap" title="${esc(label)}: ${value}">
    <svg width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="${r}" fill="none" stroke="#1a2531" stroke-width="4"></circle>
      <circle cx="18" cy="18" r="${r}" fill="none" stroke="${colorHex}" stroke-width="4" stroke-linecap="round"
        stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
        transform="rotate(-90 18 18)"></circle>
      <text x="18" y="21" text-anchor="middle" font-size="10" font-family="monospace" fill="#e8edf2">${Math.round(value)}</text>
    </svg>
    <span class="ring-lbl">${esc(label)}</span>
  </div>`;
}
function sectionHeader(title, rightHtml = "") {
  return `<div class="section-head"><h2>${esc(title)}</h2><div class="right">${rightHtml}</div></div>`;
}
function btn(label, onclick, variant = "primary", size = "") {
  return `<button class="btn ${variant} ${size}" onclick="${onclick}">${label}</button>`;
}
function emptyState(text) { return `<div class="empty">${esc(text)}</div>`; }

/* ---------------- Breadcrumb (used by executive dashboard drill-down) ---------------- */
function breadcrumbHTML(items) {
  const parts = items.map((it, i) => {
    const isLast = i === items.length - 1;
    if (isLast || !it.onclick) return `<span class="crumb current">${esc(it.label)}</span>`;
    return `<span class="crumb link" onclick="${it.onclick}">${esc(it.label)}</span>`;
  });
  return `<div class="breadcrumb">${parts.join('<span class="crumb-sep">/</span>')}</div>`;
}

/* ---------------- Generic sortable/searchable table ---------------- */
/* columns: [{key,label,render:(val,row)=>html}]  rows: [{...}] */
const TABLE_PAGE_SIZE = 25;
function renderDataTable(moduleKey, columns, rows, readOnly) {
  const st = STATE.tableState[moduleKey] || { search: "", sortKey: null, sortDir: 1, page: 1 };
  if (st.page == null) st.page = 1;
  STATE.tableState[moduleKey] = st;

  let filtered = rows;
  if (st.search.trim()) {
    const q = st.search.trim().toLowerCase();
    filtered = filtered.filter((r) => columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q)));
  }
  if (st.sortKey) {
    filtered = filtered.slice().sort((a, b) => {
      const av = a[st.sortKey], bv = b[st.sortKey];
      const an = Number(av), bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn) && av !== "" && bv !== "" && av != null && bv != null) return (an - bn) * st.sortDir;
      return String(av ?? "").localeCompare(String(bv ?? ""), "ar") * st.sortDir;
    });
  }

  const searchBar = `<div class="searchbar">
      <input id="tsearch-${moduleKey}" class="inp" placeholder="بحث..." value="${esc(st.search)}" oninput="onTableSearch('${moduleKey}', this.value)" />
      <span class="count">${filtered.length} سجل</span>
    </div>`;

  if (!filtered.length) return searchBar + emptyState(rows.length ? "لا توجد نتائج مطابقة." : "لا توجد سجلات بعد.");

  const totalPages = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));
  if (st.page > totalPages) st.page = totalPages;
  if (st.page < 1) st.page = 1;
  const pageStart = (st.page - 1) * TABLE_PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + TABLE_PAGE_SIZE);

  STATE.bulkSelection = STATE.bulkSelection || {};
  const selectedForModule = STATE.bulkSelection[moduleKey] || new Set();
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selectedForModule.has(r.id));
  const bulkBar = !readOnly && selectedForModule.size ? `<div class="frame p4" style="margin-bottom:10px;border-right:3px solid var(--accent);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
    <span style="font-size:12px;color:#0F1420;">تحديد ${selectedForModule.size} عنصراً</span>
    <div style="display:flex;gap:6px;">
      <button class="btn ghost sm" onclick="bulkDuplicateSelected('${moduleKey}')">📋 نسخ الكل كأساس</button>
      <button class="btn danger sm" onclick="bulkDeleteSelected('${moduleKey}')">🗑 حذف المحدَّد</button>
      <button class="btn ghost sm" onclick="clearBulkSelection('${moduleKey}')">إلغاء التحديد</button>
    </div>
  </div>` : "";
  const head = `<tr>${!readOnly ? `<th style="width:24px;"><input type="checkbox" ${allOnPageSelected ? "checked" : ""} onchange="toggleSelectAllOnPage('${moduleKey}', this.checked)" /></th>` : ""}${columns.map((c) => `<th onclick="onTableSort('${moduleKey}','${c.key}')">${esc(c.label)} ${st.sortKey === c.key ? (st.sortDir === 1 ? "▲" : "▼") : ""}</th>`).join("")}${!readOnly ? "<th></th>" : ""}</tr>`;
  const body = pageRows.map((r) => {
    const tds = columns.map((c) => `<td>${c.render ? c.render(r[c.key], r) : esc(r[c.key] ?? "—")}</td>`).join("");
    const checkboxTd = !readOnly ? `<td><input type="checkbox" ${selectedForModule.has(r.id) ? "checked" : ""} onchange="toggleRowSelection('${moduleKey}','${r.id}', this.checked)" /></td>` : "";
    const actions = readOnly ? "" : `<td class="actions">
        <button onclick="openEditModal('${moduleKey}','${r.id}')" title="تعديل">✎</button>
        <button onclick="duplicateRow('${moduleKey}','${r.id}')" title="نسخ كأساس لسجل جديد">📋</button>
        <button class="del" onclick="onDeleteRow('${moduleKey}','${r.id}')" title="حذف">🗑</button>
      </td>`;
    return `<tr>${checkboxTd}${tds}${actions}</tr>`;
  }).join("");

  const pagerHtml = totalPages > 1 ? `<div class="pager">
      <button class="btn ghost sm" ${st.page <= 1 ? "disabled" : ""} onclick="onTablePageChange('${moduleKey}', ${st.page - 1})">‹ السابق</button>
      <span class="pager-info">صفحة ${st.page} من ${totalPages} (${pageStart + 1}–${Math.min(pageStart + TABLE_PAGE_SIZE, filtered.length)} من ${filtered.length})</span>
      <button class="btn ghost sm" ${st.page >= totalPages ? "disabled" : ""} onclick="onTablePageChange('${moduleKey}', ${st.page + 1})">التالي ›</button>
    </div>` : "";

  return `${searchBar}${bulkBar}<div style="overflow-x:auto"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>${pagerHtml}`;
}

function onTablePageChange(moduleKey, newPage) {
  const st = STATE.tableState[moduleKey] || { search: "", sortKey: null, sortDir: 1, page: 1 };
  st.page = newPage;
  STATE.tableState[moduleKey] = st;
  renderApp();
}

function onTableSearch(moduleKey, val) {
  STATE.tableState[moduleKey] = Object.assign(STATE.tableState[moduleKey] || {}, { search: val });
  renderApp();
  // restore focus to the search input after re-render
  const el = document.querySelector(`.searchbar input`);
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}
function onTableSort(moduleKey, key) {
  const st = STATE.tableState[moduleKey] || { search: "", sortKey: null, sortDir: 1 };
  if (st.sortKey === key) st.sortDir = -st.sortDir; else { st.sortKey = key; st.sortDir = 1; }
  STATE.tableState[moduleKey] = st;
  renderApp();
}

/* ---------------- Generic module view: header + table + modal wiring ---------------- */
function renderModuleView(moduleKey, title, fields, rows, extraColumns = [], readOnly = false, extraRightHtml = "") {
  const columns = [
    ...fields.filter((f) => f.showInTable !== false).map((f) => ({ key: f.key, label: f.label, render: f.render })),
    ...extraColumns,
  ];
  const addBtn = readOnly
    ? `<span class="readonly-tag">عرض فقط لدورك الحالي</span>`
    : btn("+ إضافة", `openAddModal('${moduleKey}')`, "primary", "sm");
  return `
    ${sectionHeader(title, extraRightHtml + addBtn)}
    <div class="frame p4">${renderDataTable(moduleKey, columns, rows, readOnly)}</div>
  `;
}

/* ---------------- Generic Add/Edit Modal ---------------- */
/* STATE.modal = { moduleKey, fields, values, editingId (null=add), onSubmit(values) } */
function openAddModal(moduleKey) {
  const cfg = MODULES[moduleKey];
  if (STATE.user && !canEdit(STATE.user.role, moduleKey)) { alert(`دورك الحالي (${STATE.user.role}) لا يملك صلاحية الإضافة في هذه الصفحة. راجع من يملك هذه الصلاحية في فريقك، أو تواصل مع الإدارة إن كنت تحتاجها.`); return; }
  const fields = cfg.fields();
  const values = {};
  fields.forEach((f) => (values[f.key] = f.default ?? (f.type === "multiselect" ? [] : "")));
  if (fields.some((f) => f.key === "projectId") && !values.projectId) {
    if (STATE.projectFilter && STATE.projectFilter !== "all") {
      values.projectId = STATE.projectFilter;
    } else {
      const scope = getUserScopedProjectIds();
      if (scope && scope.size === 1) values.projectId = Array.from(scope)[0];
    }
  }
  STATE.modal = { moduleKey, title: "إضافة سجل جديد", fields, values, editingId: null };
  renderApp();
}
function openEditModal(moduleKey, id) {
  const cfg = MODULES[moduleKey];
  if (STATE.user && !canEdit(STATE.user.role, moduleKey)) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
  const fields = cfg.fields();
  const row = STATE.data[cfg.collection].find((r) => r.id === id);
  if (!row) return;
  const blankFieldsRaw = cfg.blankFieldsOnEdit;
  const blankFields = typeof blankFieldsRaw === "function" ? blankFieldsRaw(row) : (blankFieldsRaw || []);
  const values = {};
  fields.forEach((f) => (values[f.key] = blankFields.includes(f.key) ? "" : (row[f.key] ?? (f.type === "multiselect" ? [] : ""))));
  STATE.modal = { moduleKey, title: "تعديل السجل", fields, values, editingId: id };
  renderApp();
}
function closeModal() { STATE.modal = null; renderApp(); }

function onResourceCategoryChange(value) {
  STATE.modal.values.category = value;
  STATE.modal.values.type = ""; // النوع القديم قد لا يكون منطقياً للفئة الجديدة
  STATE.modal.fields = MODULES[STATE.modal.moduleKey].fields(); // إعادة بناء الحقول لتعكس خيارات النوع الصحيحة لهذه الفئة
  renderApp();
}
function onModalFieldChange(key, value) {
  STATE.modal.values[key] = value;
}
function onModalMultiSelectChange(key, selectEl) {
  STATE.modal.values[key] = Array.from(selectEl.selectedOptions).map((o) => o.value);
}
function syncPredecessorsFromDetails() {
  STATE.modal.values.predecessors = (STATE.modal.values.predecessorDetails || []).map((d) => d.taskId);
}
function addTaskRelationship() {
  const taskSelect = document.getElementById("rel-task-select");
  const typeSelect = document.getElementById("rel-type-select");
  const lagInput = document.getElementById("rel-lag-input");
  const taskId = taskSelect.value;
  if (!taskId) { alert("اختر نشاطاً سابقاً أولاً."); return; }
  if (STATE.modal.editingId && taskId === STATE.modal.editingId) { alert("لا يمكن أن يكون النشاط سابقاً لنفسه."); return; }
  const details = STATE.modal.values.predecessorDetails || [];
  if (details.some((d) => d.taskId === taskId)) { alert("هذا النشاط مضاف بالفعل كسابق — احذفه أولاً إن أردت تعديل نوع العلاقة."); return; }
  details.push({ taskId, type: typeSelect.value, lagDays: Number(lagInput.value) || 0 });
  STATE.modal.values.predecessorDetails = details;
  syncPredecessorsFromDetails();
  renderApp();
}
function removeTaskRelationship(index) {
  const details = STATE.modal.values.predecessorDetails || [];
  details.splice(index, 1);
  STATE.modal.values.predecessorDetails = details;
  syncPredecessorsFromDetails();
  renderApp();
}
let activeVoiceRecognition = null;
let activeVoiceFieldKey = null;
function toggleVoiceInput(fieldKey) {
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionAPI) {
    alert("هذا المتصفح لا يدعم تحويل الكلام إلى نص. جرّب Chrome على الحاسوب أو الهاتف.");
    return;
  }
  const statusEl = document.getElementById(`voicestatus-${fieldKey}`);
  const btnEl = document.getElementById(`voicebtn-${fieldKey}`);
  if (activeVoiceRecognition && activeVoiceFieldKey === fieldKey) {
    activeVoiceRecognition.stop();
    return;
  }
  if (activeVoiceRecognition) activeVoiceRecognition.stop(); // إيقاف أي تسجيل آخر مفتوح أولاً

  const recognition = new SpeechRecognitionAPI();
  recognition.lang = "ar-SA";
  recognition.continuous = true;
  recognition.interimResults = true;
  activeVoiceRecognition = recognition;
  activeVoiceFieldKey = fieldKey;
  if (btnEl) btnEl.textContent = "⏹ إيقاف التسجيل";
  if (statusEl) statusEl.textContent = "جارِ الاستماع...";

  let finalTranscript = "";
  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript + " ";
      else interim += transcript;
    }
    const textarea = document.getElementById(`voicearea-${fieldKey}`);
    if (textarea && STATE.modal) {
      const base = STATE.modal.values[`_voiceBase_${fieldKey}`] != null ? STATE.modal.values[`_voiceBase_${fieldKey}`] : (STATE.modal.values[fieldKey] || "");
      const combined = (base ? base + " " : "") + finalTranscript + interim;
      textarea.value = combined;
      STATE.modal.values[fieldKey] = combined;
    }
  };
  recognition.onerror = (event) => {
    if (statusEl) statusEl.textContent = event.error === "not-allowed" ? "رُفض إذن الميكروفون." : "تعذّر التسجيل: " + event.error;
  };
  recognition.onend = () => {
    if (btnEl) btnEl.textContent = "🎙 إدخال صوتي (تحويل الكلام إلى نص)";
    if (statusEl) statusEl.textContent = "";
    activeVoiceRecognition = null;
    activeVoiceFieldKey = null;
  };
  if (STATE.modal) STATE.modal.values[`_voiceBase_${fieldKey}`] = STATE.modal.values[fieldKey] || "";
  recognition.start();
}
function clearSignaturePad(fieldKey) {
  const canvas = document.getElementById("sigpad-" + fieldKey);
  if (canvas) { const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height); }
}
function saveSignaturePad(fieldKey) {
  const canvas = document.getElementById("sigpad-" + fieldKey);
  if (!canvas || !STATE.modal) return;
  STATE.modal.values[fieldKey] = canvas.toDataURL("image/png");
  renderApp();
}
function captureGPSForModal(latKey, lngKey, accKey) {
  if (!("geolocation" in navigator)) { alert("هذا المتصفح لا يدعم تحديد الموقع الجغرافي."); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (!STATE.modal) return;
      STATE.modal.values[latKey] = pos.coords.latitude;
      STATE.modal.values[lngKey] = pos.coords.longitude;
      STATE.modal.values[accKey] = pos.coords.accuracy;
      renderApp();
    },
    (err) => {
      const messages = { 1: "رُفض إذن الوصول للموقع — يجب السماح به من إعدادات المتصفح.", 2: "تعذّر تحديد الموقع حالياً (قد تكون خارج التغطية أو GPS معطَّل).", 3: "انتهت مهلة تحديد الموقع — حاول مرة أخرى." };
      alert(messages[err.code] || "تعذّر تحديد الموقع: " + err.message);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

/* ============================================================
   نظام إشعارات لحظية (Toast) — أول آلية تغذية راجعة حقيقية وغير
   مُعطِّلة للتفاعل، بدل الحفظ الصامت أو alert() الحاجز للنافذة
   بأكملها. تختفي تلقائياً، وتتراكم لو ظهر أكثر من واحد.
   ============================================================ */
function showToast(message, type) {
  STATE.toasts = STATE.toasts || [];
  const id = uid();
  STATE.toasts.push({ id, message, type: type || "success" });
  renderApp();
  setTimeout(() => {
    STATE.toasts = (STATE.toasts || []).filter((t) => t.id !== id);
    renderApp();
  }, 3000);
}
const TOAST_UNDO_CALLBACKS = {};
function showUndoToast(message, onUndo) {
  STATE.toasts = STATE.toasts || [];
  const id = uid();
  TOAST_UNDO_CALLBACKS[id] = onUndo;
  STATE.toasts.push({ id, message, type: "info", undoable: true });
  renderApp();
  setTimeout(() => {
    delete TOAST_UNDO_CALLBACKS[id];
    STATE.toasts = (STATE.toasts || []).filter((t) => t.id !== id);
    renderApp();
  }, 6000); // نافذة أطول من التنبيه العادي — يحتاج المستخدم وقتاً حقيقياً ليقرأ ويقرر
}
function runToastUndo(id) {
  const cb = TOAST_UNDO_CALLBACKS[id];
  delete TOAST_UNDO_CALLBACKS[id];
  STATE.toasts = (STATE.toasts || []).filter((t) => t.id !== id);
  if (cb) cb();
}
/* ============================================================
   زر الإجراء السريع العائم (FAB) — أفكار خارج الصندوق: بدل أن يبحث
   المهندس في القائمة الجانبية عن "تقرير يومي" أثناء وقوفه في الموقع،
   زر واحد كبير بمتناول الإبهام يفتح أكثر إجراءاته تكراراً مباشرة.
   ============================================================ */
const ROLE_DASHBOARD_DEFAULTS = {
  "مدير عام": [
    { icon: "🗂", label: "مشروع جديد", moduleKey: "projects" },
    { icon: "👥", label: "مورد جديد", moduleKey: "resourcePool" },
    { icon: "📝", label: "ملاحظة إدارة عليا", moduleKey: "gmNotes" },
  ],
  "مدير المشروع": [
    { icon: "✔", label: "مهمة عمل جديدة", moduleKey: "tasks" },
    { icon: "🧾", label: "فاتورة جديدة", moduleKey: "invoices" },
    { icon: "↩", label: "الرد على ملاحظات الإدارة العليا", gotoPage: "gmNotes" },
  ],
  "مهندس الموقع": [
    { icon: "📋", label: "تنفيذ عمل / تقرير يومي", moduleKey: "sitereports" },
    { icon: "↩", label: "الرد على ملاحظة (بند مرفوض)", gotoPage: "punchlist" },
    { icon: "🛡", label: "ملاحظة سلامة (HSE)", moduleKey: "hse" },
  ],
};
/* اختصارات مخصَّصة لكل تاب على حدة — تظهر بدل الإجراءات الافتراضية
   للدور فور مغادرة الصفحة الرئيسية، لا مضافة إليها. لو تاب ما ليس
   له اختصار مُعرَّف هنا، يُستخدَم اختصار "إضافة هنا" العام كحدّ أدنى
   بدل قائمة فارغة بلا فائدة. */
const TAB_QUICK_ACTIONS = {
  punchlist: [{ icon: "✔", label: "بند تشيك ليست جديد", moduleKey: "punchlist" }],
  sitereports: [{ icon: "📋", label: "تقرير يومي جديد", moduleKey: "sitereports" }],
  invoices: [{ icon: "🧾", label: "فاتورة جديدة", moduleKey: "invoices" }, { icon: "🏦", label: "المركز المالي", gotoPage: "financial-hub" }],
  tasks: [{ icon: "✔", label: "مهمة عمل جديدة", moduleKey: "tasks" }, { icon: "📅", label: "عرض الجدول الزمني (Gantt)", gotoPage: "schedule" }],
  risks: [{ icon: "⚠", label: "خطر جديد", moduleKey: "risks" }],
  meetings: [{ icon: "🗓", label: "اجتماع جديد", moduleKey: "meetings" }],
  gmNotes: [{ icon: "📝", label: "ملاحظة إدارة عليا جديدة", moduleKey: "gmNotes" }],
  projectNotes: [{ icon: "🗒", label: "ملاحظة مشروع جديدة", moduleKey: "projectNotes" }],
  claims: [{ icon: "⚖", label: "مطالبة جديدة", moduleKey: "claims" }, { icon: "📄", label: "عرض العقود", gotoPage: "contracts" }],
  contracts: [{ icon: "📄", label: "عقد جديد", moduleKey: "contracts" }, { icon: "🏦", label: "المركز المالي", gotoPage: "financial-hub" }],
  custodies: [{ icon: "💼", label: "عهدة جديدة", moduleKey: "custodies" }, { icon: "🏦", label: "المركز المالي", gotoPage: "financial-hub" }],
  hse: [{ icon: "🛡", label: "ملاحظة سلامة جديدة", moduleKey: "hse" }],
  qc: [{ icon: "✅", label: "ملاحظة جودة جديدة", moduleKey: "qc" }],
  correspondence: [{ icon: "✉", label: "خطاب جديد", moduleKey: "correspondence" }],
  changeOrders: [{ icon: "🔀", label: "أمر تغيير جديد", moduleKey: "changeOrders" }],
  documents: [{ icon: "📁", label: "وثيقة جديدة", moduleKey: "documents" }],
  resourcePool: [{ icon: "👥", label: "مورد جديد", moduleKey: "resourcePool" }],
  certificates: [{ icon: "📜", label: "مستخلص جديد", moduleKey: "certificates" }, { icon: "🏦", label: "المركز المالي", gotoPage: "financial-hub" }],
  subcontractorCertificates: [{ icon: "🧱", label: "مستخلص مقاول جديد", moduleKey: "subcontractorCertificates" }],
  projects: [{ icon: "🗂", label: "مشروع جديد", moduleKey: "projects" }, { icon: "👥", label: "إضافة موارد", gotoPage: "resources" }],
  procurement: [{ icon: "🛒", label: "طلب شراء / عطاء جديد", moduleKey: "procurement" }],
  finance: [{ icon: "💳", label: "بند ميزانية جديد", moduleKey: "budgetItems" }, { icon: "🏦", label: "المركز المالي", gotoPage: "financial-hub" }],
  schedule: [{ icon: "✔", label: "نشاط جديد في الجدول", moduleKey: "tasks" }, { icon: "📋", label: "عرض قائمة المهام", gotoPage: "tasks" }],
  realityTwin: [
    { icon: "📷", label: "بدء مسح جديد", gotoPage: "realityTwin", setState: { key: "realityTwinTab", value: "capture" } },
    { icon: "📊", label: "الأدلة والمطابقة", gotoPage: "realityTwin", setState: { key: "realityTwinTab", value: "evidence" } },
    { icon: "⇪", label: "تصدير الأدلة إلى التوثيق الرقمي", customAction: "exportRealityTwinEvidenceToDigitalTwin" },
  ],
};
function getFabActionsForContext(role, activePage) {
  const roleDefaults = ROLE_DASHBOARD_DEFAULTS[role] || [{ icon: "🗒", label: "ملاحظة مشروع", moduleKey: "projectNotes" }];
  if (activePage === "dashboard" || !activePage) return roleDefaults;
  // صفحة "الموارد" فيها 4 تابات فرعية بأربع وحدات بيانات مختلفة تماماً — لا يمكن تمييزها إلا بفحص التاب الفرعي الفعلي
  if (activePage === "resources") {
    const subTab = STATE.resourcesTab || "labor";
    if (subTab === "pool") return canEdit(role, "resourcePool") ? [{ icon: "👥", label: "مورد جديد (السجل الرئيسي)", moduleKey: "resourcePool" }] : roleDefaults;
    const subTabLabels = { labor: "عامل جديد", equipment: "معدة جديدة", materials: "مادة جديدة" };
    if (subTabLabels[subTab] && canEdit(role, "resources")) return [{ icon: "🔧", label: subTabLabels[subTab], moduleKey: subTab }];
    return roleDefaults;
  }
  const curated = (TAB_QUICK_ACTIONS[activePage] || []).filter((a) => {
    if (a.scrollToBottom) return true;
    if (a.gotoPage) return canView(role, a.gotoPage);
    return canEdit(role, a.moduleKey || activePage);
  });
  if (curated.length) return curated;
  // لا اختصار مُعرَّف لهذا التاب — احتياط عام، فقط لو كان تاباً حقيقياً قابلاً للإضافة (لا صفحة خاصة كالمحادثة)
  if (MODULES[activePage] && typeof MODULES[activePage].fields === "function" && canEdit(role, activePage)) {
    return [{ icon: "⚡", label: "إضافة هنا", moduleKey: activePage, contextual: true }];
  }
  // لا شيء لإضافته في هذه الصفحة تحديداً بهذا الدور — بدل قائمة فارغة تبدو معطَّلة، اعرض اختصاراته الأساسية دائماً
  return roleDefaults;
}
function toggleFab() { STATE.fabOpen = !STATE.fabOpen; renderApp(); }
function runFabAction(index) {
  const actions = getFabActionsForContext(STATE.user.role, STATE.active);
  const action = actions[index];
  STATE.fabOpen = false;
  if (!action) return;
  if (action.customAction) { const fn = window[action.customAction]; if (typeof fn === "function") fn(); return; }
  if (action.gotoPage) {
    if (action.setState) STATE[action.setState.key] = action.setState.value;
    setActive(action.gotoPage);
    return;
  }
  setActive(action.moduleKey);
  setTimeout(() => openAddModal(action.moduleKey), 60);
}
function isFabHidden() {
  try { return localStorage.getItem("pms_fab_hidden") === "1"; } catch (e) { return false; }
}
function promptHideFab() {
  if (!confirm("إخفاء زر الإضافة السريع؟ يمكنك إعادته لاحقاً من لوحة الأوامر (Ctrl+K) — اكتب «إظهار زر الإضافة».")) return;
  try { localStorage.setItem("pms_fab_hidden", "1"); } catch (e) { /* تجاهل بأمان لو التخزين محظور */ }
  STATE.fabOpen = false;
  renderApp();
  showToast("تم إخفاء الزر — أعده من لوحة الأوامر (Ctrl+K) في أي وقت", "info");
}
function restoreFab() {
  try { localStorage.removeItem("pms_fab_hidden"); } catch (e) { /* تجاهل بأمان */ }
  renderApp();
  showToast("تم إظهار زر الإضافة السريع مجدداً", "success");
}
function renderFab() {
  if (!STATE.user || isFabHidden()) return "";
  const actions = getFabActionsForContext(STATE.user.role, STATE.active);
  const actionsHtml = STATE.fabOpen ? actions.map((a, i) => `<div class="fab-action ${a.contextual ? "fab-action-contextual" : ""}" onclick="runFabAction(${i})">
    <span>${esc(a.label)}</span><span class="fab-ic">${a.icon}</span>
  </div>`).join("") : "";
  const pos = STATE.fabPosition || { left: 16, bottom: 24 };
  const posStyle = `left:${pos.left}px;bottom:${pos.bottom}px;right:auto;`;
  return `<div class="fab-container" id="fab-container" style="${posStyle}">
    ${actionsHtml}
    <button class="fab-main ${STATE.fabOpen ? "open" : ""}" id="fab-drag-handle">+</button>
  </div>`;
}
/* سحب حقيقي للزر العائم — لا يُثبَّت مكانه، ويُحفَظ في localStorage فيبقى
   في نفس المكان حتى بعد إعادة تحميل النظام.
   ملاحظة تصميم مهمة: مستمعو mousemove/mouseup على window يُربَطون
   مرة واحدة فقط أبداً (لا مع كل عرض)، ويبحثون عن عنصر الزر الحالي
   طازجاً في كل استدعاء، بدل الاحتفاظ بمرجع قديم — هذا يمنع تراكم
   عشرات المستمعين المكرَّرين بعد التنقّل بين صفحات كثيرة، والذي كان
   يُسبِّب فتح/إغلاق القائمة عشوائياً بضغطة واحدة (خلل حقيقي مؤكَّد). */
let fabDragGloballyInitialized = false;
let fabDragState = { dragging: false, moved: false, startX: 0, startY: 0, startLeft: 0, startBottom: 0 };
function initFabDrag() {
  const handle = document.getElementById("fab-drag-handle");
  if (!handle || typeof handle.addEventListener !== "function") return;
  if (!handle._fabMouseDownBound) {
    handle._fabMouseDownBound = true;
    const getPoint = (e) => (e.touches && e.touches[0]) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
    const onDown = (e) => {
      fabDragState.dragging = true; fabDragState.moved = false; fabDragState.longPressFired = false;
      const p = getPoint(e);
      fabDragState.startX = p.x; fabDragState.startY = p.y;
      const pos = STATE.fabPosition || { left: 16, bottom: 24 };
      fabDragState.startLeft = pos.left; fabDragState.startBottom = pos.bottom;
      clearTimeout(fabDragState.longPressTimer);
      fabDragState.longPressTimer = setTimeout(() => {
        if (fabDragState.dragging) { // الضغط المطوَّل يعتمد فقط على عتبة الإلغاء الأوسع أعلاه، لا على "moved" الأكثر حساسية
          fabDragState.longPressFired = true;
          promptHideFab();
        }
      }, 600);
    };
    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive: true });
  }
  if (fabDragGloballyInitialized) return;
  fabDragGloballyInitialized = true;
  const getPoint = (e) => (e.touches && e.touches[0]) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
  window.addEventListener("mousemove", (e) => {
    if (!fabDragState.dragging) return;
    const container = document.getElementById("fab-container");
    if (!container) return;
    const p = getPoint(e);
    const dx = p.x - fabDragState.startX, dy = p.y - fabDragState.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) fabDragState.moved = true; // عتبة أكثر تسامحاً لتمييز نقرة عادية (بها رعشة طبيعية) عن سحب حقيقي مقصود
    if (Math.abs(dx) > 20 || Math.abs(dy) > 20) clearTimeout(fabDragState.longPressTimer); // عتبة أوسع بكثير لإلغاء الضغط المطوَّل فقط — رعشة اليد الطبيعية أثناء الثبات 600ms لا تُبطله
    if (!fabDragState.moved) return;
    if (e.preventDefault) e.preventDefault();
    const newLeft = Math.max(4, Math.min(window.innerWidth - 60, fabDragState.startLeft + dx));
    const newBottom = Math.max(4, Math.min(window.innerHeight - 60, fabDragState.startBottom - dy));
    container.style.left = newLeft + "px";
    container.style.bottom = newBottom + "px";
    STATE.fabPosition = { left: newLeft, bottom: newBottom };
  });
  window.addEventListener("touchmove", (e) => {
    if (!fabDragState.dragging) return;
    const container = document.getElementById("fab-container");
    if (!container) return;
    const p = getPoint(e);
    const dx = p.x - fabDragState.startX, dy = p.y - fabDragState.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) fabDragState.moved = true; // عتبة أكثر تسامحاً لتمييز نقرة عادية (بها رعشة طبيعية) عن سحب حقيقي مقصود
    if (Math.abs(dx) > 20 || Math.abs(dy) > 20) clearTimeout(fabDragState.longPressTimer); // عتبة أوسع بكثير لإلغاء الضغط المطوَّل فقط — رعشة اليد الطبيعية أثناء الثبات 600ms لا تُبطله
    if (!fabDragState.moved) return;
    if (e.preventDefault) e.preventDefault();
    const newLeft = Math.max(4, Math.min(window.innerWidth - 60, fabDragState.startLeft + dx));
    const newBottom = Math.max(4, Math.min(window.innerHeight - 60, fabDragState.startBottom - dy));
    container.style.left = newLeft + "px";
    container.style.bottom = newBottom + "px";
    STATE.fabPosition = { left: newLeft, bottom: newBottom };
  }, { passive: false });
  const onUp = () => {
    if (!fabDragState.dragging) return;
    fabDragState.dragging = false;
    clearTimeout(fabDragState.longPressTimer);
    if (fabDragState.longPressFired) {
      fabDragState.longPressFired = false; // الضغطة المطوَّلة تكفّلت بالتعامل مع هذا التفاعل بالفعل
    } else if (fabDragState.moved) {
      localStorage.setItem("pms_fab_position", JSON.stringify(STATE.fabPosition));
    } else {
      toggleFab(); // نقرة بلا سحب حقيقي = فتح/إغلاق القائمة كالمعتاد
    }
  };
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchend", onUp);
}
function loadFabPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem("pms_fab_position"));
    if (saved && typeof saved.left === "number" && typeof saved.bottom === "number") STATE.fabPosition = saved;
  } catch (e) { /* لا موضع محفوظ، استخدم الافتراضي */ }
}

function dismissToast(id) {
  STATE.toasts = (STATE.toasts || []).filter((t) => t.id !== id);
  renderApp();
}
function renderToasts() {
  if (!STATE.toasts || !STATE.toasts.length) return "";
  const colors = { success: "#2FBF71", error: "#E5484D", info: "#22d3ee" };
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  return `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:200;display:flex;flex-direction:column;gap:8px;align-items:center;">
    ${STATE.toasts.map((t) => `<div style="background:#EEF2FF;border:1px solid ${colors[t.type] || colors.success};border-right:3px solid ${colors[t.type] || colors.success};border-radius:8px;padding:10px 16px;font-size:12.5px;color:#0F1420;box-shadow:0 8px 24px -8px rgba(0,0,0,.6);display:flex;align-items:center;gap:8px;min-width:200px;">
      <span style="color:${colors[t.type] || colors.success};">${icons[t.type] || icons.success}</span><span style="flex:1;">${esc(t.message)}</span>
      ${t.undoable ? `<button onclick="runToastUndo('${t.id}')" style="background:none;border:1px solid var(--info);color:var(--info);border-radius:5px;cursor:pointer;font-size:11px;padding:3px 8px;font-weight:700;">↩ تراجع</button>` : ""}
      <button onclick="dismissToast('${t.id}')" style="background:none;border:none;color:var(--muted2);cursor:pointer;font-size:14px;padding:0 2px;">✕</button>
    </div>`).join("")}
  </div>`;
}

function submitModal(ev) {
  ev.preventDefault();
  const m = STATE.modal;
  const cfg = MODULES[m.moduleKey];
  if (cfg.validate) {
    const err = cfg.validate(m.values, m.editingId);
    if (err) { alert(err); return; }
  }
  const isNew = !m.editingId;
  if (m.editingId) cfg.update(m.editingId, m.values);
  else cfg.add(m.values);
  STATE.modal = null;
  renderApp();
  showToast(isNew ? "تمت الإضافة بنجاح" : "تم الحفظ بنجاح", "success");
}

/* ============================================================
   نسخ سجل كأساس لسجل جديد — تسريع حقيقي للعمل المتكرر (تقرير يومي
   مشابه للأمس، فاتورة بنفس البنود، بند تشيك ليست مشابه) بلا إعادة
   كتابة كل الحقول من الصفر. لا وحدة أعمال جديدة — فقط اختصار حول
   نموذج الإضافة الموجود أصلاً.
   ============================================================ */
const DUPLICATE_RESET_KEYS = new Set(["id", "createdBy", "createdByRole", "updatedAt", "lastEditedBy", "responseHistory", "versions", "gmLocked", "status", "paidAmount", "closedDate", "correctiveAction", "approvedAmount", "issuedByUserId", "issuerLevel"]);
function duplicateRow(moduleKey, id) {
  const cfg = MODULES[moduleKey];
  const original = (STATE.data[cfg.collection] || []).find((r) => r.id === id);
  if (!original) return;
  openAddModal(moduleKey); // يبني القيم الافتراضية الصحيحة والصلاحيات والحقول أولاً، ثم نستبدل فوقها
  if (!STATE.modal) return; // رُفض الفتح (بلا صلاحية) — لا داعٍ للاستمرار
  const fields = STATE.modal.fields;
  fields.forEach((f) => {
    if (DUPLICATE_RESET_KEYS.has(f.key) || f.type === "photo" || f.type === "photos") return; // إعادة تصفير حقول لا معنى لنقلها لسجل جديد
    if (f.type === "date" && original[f.key]) { STATE.modal.values[f.key] = todayISO(); return; } // التواريخ تُحدَّث لليوم، لا تُنسَخ حرفياً
    if (original[f.key] !== undefined) STATE.modal.values[f.key] = original[f.key];
  });
  STATE.modal.title = "نسخ كأساس لسجل جديد — عدِّل ما يلزم ثم حفظ";
  renderApp();
  showToast("تم نسخ الحقول — عدِّل التاريخ والتفاصيل ثم اضغط حفظ", "info");
}

function toggleRowSelection(moduleKey, id, checked) {
  STATE.bulkSelection = STATE.bulkSelection || {};
  const set = STATE.bulkSelection[moduleKey] || new Set();
  if (checked) set.add(id); else set.delete(id);
  STATE.bulkSelection[moduleKey] = set;
  renderApp();
}
function toggleSelectAllOnPage(moduleKey, checked) {
  const cfg = MODULES[moduleKey];
  const rows = filterByProject(STATE.data[cfg.collection] || []);
  STATE.bulkSelection = STATE.bulkSelection || {};
  const set = STATE.bulkSelection[moduleKey] || new Set();
  rows.forEach((r) => { if (checked) set.add(r.id); else set.delete(r.id); });
  STATE.bulkSelection[moduleKey] = set;
  renderApp();
}
function clearBulkSelection(moduleKey) {
  STATE.bulkSelection = STATE.bulkSelection || {};
  STATE.bulkSelection[moduleKey] = new Set();
  renderApp();
}
function bulkDeleteSelected(moduleKey) {
  const ids = Array.from((STATE.bulkSelection && STATE.bulkSelection[moduleKey]) || []);
  if (!ids.length) return;
  if (!confirm(`حذف ${ids.length} عنصراً محدَّداً؟`)) return;
  let deletedCount = 0;
  ids.forEach((id) => {
    const before = (STATE.data[MODULES[moduleKey].collection] || []).length;
    MODULES[moduleKey].remove(id); // يُطبِّق نفس فحص الصلاحية للعنصر الواحد — لا تجاوز جماعي للأمان
    if ((STATE.data[MODULES[moduleKey].collection] || []).length < before) deletedCount++;
  });
  clearBulkSelection(moduleKey);
  showToast(`تم حذف ${deletedCount} من ${ids.length}${deletedCount < ids.length ? " — بعض العناصر لم تُحذَف (صلاحية أو قيد آخر)" : ""}`, deletedCount === ids.length ? "success" : "info");
}
function bulkDuplicateSelected(moduleKey) {
  const ids = Array.from((STATE.bulkSelection && STATE.bulkSelection[moduleKey]) || []);
  if (!ids.length) return;
  if (ids.length === 1) { duplicateRow(moduleKey, ids[0]); clearBulkSelection(moduleKey); return; }
  alert("النسخ الجماعي يفتح كل عنصر على حدة للمراجعة قبل الحفظ — سيتم فتح أول عنصر الآن؛ كرِّر لكل عنصر آخر عند الحاجة.");
  duplicateRow(moduleKey, ids[0]);
}

function onDeleteRow(moduleKey, id) {
  const cfg = MODULES[moduleKey];
  if (!cfg.skipGenericConfirm && !confirm("هل أنت متأكد من الحذف؟")) return;
  const collection = cfg.collection;
  const rowBeforeDelete = collection ? (STATE.data[collection] || []).find((r) => r.id === id) : null;
  cfg.remove(id);
  renderApp();
  if (rowBeforeDelete) {
    showUndoToast("تم الحذف", () => restoreDeletedRow(moduleKey, rowBeforeDelete));
  } else {
    showToast("تم الحذف", "info");
  }
}
function restoreDeletedRow(moduleKey, row) {
  const cfg = MODULES[moduleKey];
  const collection = cfg.collection;
  if (!collection) return;
  // إعادة الصف بمعرِّفه الأصلي بالضبط — لا عبر add() الذي يُنشئ معرِّفاً جديداً ويكسر أي ربط سابق كان يشير لهذا السجل
  STATE.data[collection] = [...(STATE.data[collection] || []), row];
  logAudit("update", collection, row.id, `استعادة بعد حذف: ${getRecordLabel(row)}`);
  saveData(STATE.data);
  renderApp();
  showToast("تم استرجاع العنصر بنجاح", "success");
}

/* ---- Photo / gallery field handlers ---- */
const MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 ميغابايت — حدّ أقصى لحجم الملف الأصلي قبل الضغط
function formatFileSizeMB(bytes) { return (bytes / (1024 * 1024)).toFixed(1); }
async function onPhotoInputChange(key, inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
    alert(`حجم الصورة (${formatFileSizeMB(file.size)}MB) يتجاوز الحدّ الأقصى المسموح (8MB). اختر صورة أصغر، أو صغِّر حجمها أولاً.`);
    inputEl.value = "";
    return;
  }
  try {
    const dataUrl = await compressImageFile(file);
    STATE.modal.values[key] = dataUrl;
    renderApp();
  } catch (e) { alert("تعذّر معالجة الصورة."); }
}
function removePhoto(key) { STATE.modal.values[key] = ""; renderApp(); }
async function runPhotoDetection(key) {
  const imageDataUrl = STATE.modal.values[key];
  if (!imageDataUrl) return;
  STATE.modal.values[`_detection_${key}`] = { loading: true };
  renderApp();
  try {
    const results = await runObjectDetectionOnPhoto(imageDataUrl);
    STATE.modal.values[`_detection_${key}`] = results;
  } catch (e) {
    STATE.modal.values[`_detection_${key}`] = { error: e.message };
  }
  renderApp();
}

async function onPhotosInputChange(key, inputEl) {
  const files = Array.from(inputEl.files || []);
  if (!files.length) return;
  const oversized = files.filter((f) => f.size > MAX_PHOTO_UPLOAD_BYTES);
  const validFiles = files.filter((f) => f.size <= MAX_PHOTO_UPLOAD_BYTES);
  if (oversized.length) {
    alert(`تم تجاوز ${oversized.length} من ${files.length} صورة الحدّ الأقصى (8MB) ولن تُرفَع: ${oversized.map((f) => `${f.name} (${formatFileSizeMB(f.size)}MB)`).join("، ")}`);
  }
  if (!validFiles.length) { inputEl.value = ""; return; }
  const current = Array.isArray(STATE.modal.values[key]) ? STATE.modal.values[key] : [];
  const compressed = await Promise.all(validFiles.map((f) => compressImageFile(f).catch(() => null)));
  STATE.modal.values[key] = current.concat(compressed.filter(Boolean));
  renderApp();
}
function removePhotoAt(key, idx) {
  const arr = Array.isArray(STATE.modal.values[key]) ? STATE.modal.values[key].slice() : [];
  arr.splice(idx, 1);
  STATE.modal.values[key] = arr;
  renderApp();
}

/* ---- Barcode scan overlay ---- */
function openScanner(targetKey) {
  STATE.scanner = { targetKey, error: null };
  renderApp();
  setTimeout(() => {
    const video = document.getElementById("scanner-video");
    if (!video) return;
    startBarcodeScan(video, (text) => {
      STATE.modal.values[STATE.scanner.targetKey] = text;
      closeScanner();
    }, (err) => {
      STATE.scanner.error = err;
      renderApp();
    });
  }, 50);
}
function closeScanner() {
  stopBarcodeScan();
  STATE.scanner = null;
  renderApp();
}
function openAssetScanner() {
  STATE.scanner = { targetKey: "ASSET_LOOKUP", error: null };
  renderApp();
  setTimeout(() => {
    const video = document.getElementById("scanner-video");
    if (!video) return;
    startBarcodeScan(video, (text) => {
      const asset = (STATE.data.projectAssets || []).find((a) => a.id === text || a.assetCode === text);
      closeScanner();
      if (asset) { STATE.digitalTwinAssetId = asset.id; STATE.digitalTwinTab = "asset360"; STATE.active = "digitalTwin"; renderApp(); }
      else alert(`لم يُعثر على عنصر مطابق للرمز الممسوح: ${text}`);
    }, (err) => {
      STATE.scanner.error = err;
      renderApp();
    });
  }, 50);
}
function renderScannerOverlay() {
  if (!STATE.scanner) return "";
  return `<div class="modal-overlay" style="z-index:200;">
    <div class="modal-box" style="max-width:420px;">
      <div class="modal-head"><h3>مسح الباركود بالكاميرا</h3><button onclick="closeScanner()">✕</button></div>
      <div class="modal-body">
        ${STATE.scanner.error ? `<div style="color:var(--danger);font-size:12px;margin-bottom:10px;">${esc(STATE.scanner.error)}</div>` : ""}
        <video id="scanner-video" style="width:100%;border-radius:8px;background:#000;" muted playsinline></video>
        <p style="font-size:11px;color:var(--muted);margin-top:10px;">وجّه الكاميرا نحو الباركود — سيُملأ الحقل تلقائياً عند القراءة.</p>
        <button class="btn ghost" style="margin-top:10px;" onclick="closeScanner()">إلغاء</button>
      </div>
    </div>
  </div>`;
}

/* ---- Runs after the modal HTML is injected into the DOM: draw generated barcodes ---- */
function initProjectLocationPreview(lat, lng, name) {
  const container = document.getElementById("project-location-preview");
  if (!container || typeof L === "undefined") {
    if (container) container.innerHTML = `<div style="padding:16px;text-align:center;font-size:11.5px;color:var(--muted2);">تعذّر تحميل الخريطة (يحتاج اتصالاً بالإنترنت).</div>`;
    return;
  }
  const map = L.map("project-location-preview", { zoomControl: true }).setView([lat, lng], 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
  L.marker([lat, lng]).addTo(map).bindPopup(esc(name || ""));
  setTimeout(() => map.invalidateSize(), 80);
}

/* ---- Runs after the modal HTML is injected into the DOM: draw generated barcodes and initialize the map picker ---- */
function afterModalRender() {
  document.querySelectorAll("svg[data-barcode-for]").forEach((svg) => {
    const key = svg.getAttribute("data-barcode-for");
    const val = STATE.modal && STATE.modal.values[key];
    if (val) renderBarcodeInto(svg, val);
  });
  const mapField = STATE.modal && STATE.modal.fields.find((f) => f.type === "map");
  if (mapField) {
    const latKey = mapField.latKey || "lat";
    const lngKey = mapField.lngKey || "lng";
    const containerId = "map-picker-" + mapField.key;
    const container = document.getElementById(containerId);
    if (container && typeof L !== "undefined") {
      const existingLat = Number(STATE.modal.values[latKey]);
      const existingLng = Number(STATE.modal.values[lngKey]);
      const hasExisting = !isNaN(existingLat) && !isNaN(existingLng) && STATE.modal.values[latKey] !== "" && STATE.modal.values[lngKey] !== "";
      const centerLat = hasExisting ? existingLat : 26.0;
      const centerLng = hasExisting ? existingLng : 17.5; // مركز افتراضي تقريبي لليبيا حين لا تتوفر إحداثيات بعد
      const map = L.map(containerId).setView([centerLat, centerLng], hasExisting ? 14 : 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
      let marker = hasExisting ? L.marker([centerLat, centerLng]).addTo(map) : null;
      map.on("click", (e) => {
        if (marker) map.removeLayer(marker);
        marker = L.marker(e.latlng).addTo(map);
        STATE.modal.values[latKey] = e.latlng.lat;
        STATE.modal.values[lngKey] = e.latlng.lng;
        const label = container.parentElement.querySelector(".map-coords-label");
        if (label) label.textContent = `📍 الإحداثيات المحدَّدة: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
      });
      setTimeout(() => map.invalidateSize(), 80);
    } else if (container) {
      container.innerHTML = `<div style="padding:16px;text-align:center;font-size:11.5px;color:var(--muted2);">تعذّر تحميل الخريطة (يحتاج اتصالاً بالإنترنت) — أدخل الموقع كنص في الحقل أدناه بدلاً من ذلك، أو حاول لاحقاً عند توفر الإنترنت.</div>`;
    }
  }
  const sigField = STATE.modal && STATE.modal.fields.find((f) => f.type === "signature");
  if (sigField) {
    const canvas = document.getElementById("sigpad-" + sigField.key);
    if (canvas && !canvas._sigInitialized) {
      canvas._sigInitialized = true;
      const ctx = canvas.getContext("2d");
      ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2; ctx.lineCap = "round";
      let drawing = false;
      const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
      };
      const start = (e) => { drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
      const move = (e) => { if (!drawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
      const end = () => { drawing = false; };
      canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move); canvas.addEventListener("mouseup", end); canvas.addEventListener("mouseleave", end);
      canvas.addEventListener("touchstart", start); canvas.addEventListener("touchmove", move); canvas.addEventListener("touchend", end);
    }
  }
}

function renderModal() {
  const m = STATE.modal;
  if (!m) return "";
  const hasSections = m.fields.some((f) => f.section);
  const fieldHtml = (f) => {
    const val = m.values[f.key];
    let input = "";
    if (f.type === "select") {
      const isResourceCategoryField = m.moduleKey === "resourcePool" && f.key === "category";
      const changeHandler = isResourceCategoryField ? `onResourceCategoryChange(this.value)` : `onModalFieldChange('${f.key}', this.value)`;
      input = `<select name="${f.key}" ${f.required ? "required" : ""} onchange="${changeHandler}">
        <option value="">اختر...</option>
        ${f.options.map((o) => {
          const ov = (o && o.value !== undefined) ? o.value : o;
          const ol = (o && o.label !== undefined) ? o.label : o;
          return `<option value="${esc(ov)}" ${String(val) === String(ov) ? "selected" : ""}>${esc(ol)}</option>`;
        }).join("")}
      </select>`;
    } else if (f.type === "multiselect") {
      input = `<select name="${f.key}" multiple onchange="onModalMultiSelectChange('${f.key}', this)">
        ${f.options.map((o) => {
          const ov = (o && o.value !== undefined) ? o.value : o;
          const ol = (o && o.label !== undefined) ? o.label : o;
          const sel = Array.isArray(val) && val.includes(String(ov)) ? "selected" : "";
          return `<option value="${esc(ov)}" ${sel}>${esc(ol)}</option>`;
        }).join("")}
      </select>`;
    } else if (f.type === "relationships") {
      const details = Array.isArray(m.values.predecessorDetails) ? m.values.predecessorDetails : [];
      const relLabels = { FS: "نهاية إلى بداية (FS)", SS: "بداية إلى بداية (SS)", FF: "نهاية إلى نهاية (FF)", SF: "بداية إلى نهاية (SF)" };
      const taskName = (id) => { const t = (f.options || []).find((o) => String(o.value) === String(id)); return t ? t.label : id; };
      input = `<div>
        ${details.length ? details.map((d, i) => `<div style="display:flex;gap:6px;align-items:center;background:#F5F6F9;border-radius:6px;padding:6px 10px;margin-bottom:6px;font-size:11.5px;">
          <span style="flex:1;color:#0F1420;">${esc(taskName(d.taskId))}</span>
          <span style="color:var(--muted2);">${esc(relLabels[d.type] || d.type)}</span>
          <span style="color:var(--muted2);">فارق: ${d.lagDays || 0} يوم</span>
          <button type="button" class="btn danger sm" onclick="removeTaskRelationship(${i})">حذف</button>
        </div>`).join("") : `<div style="font-size:11.5px;color:var(--muted2);margin-bottom:6px;">لا توجد أنشطة سابقة مضافة بعد.</div>`}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
          <select id="rel-task-select" style="flex:1;min-width:140px;"><option value="">اختر نشاطاً سابقاً...</option>${(f.options || []).map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select>
          <select id="rel-type-select"><option value="FS">نهاية إلى بداية (FS)</option><option value="SS">بداية إلى بداية (SS)</option><option value="FF">نهاية إلى نهاية (FF)</option><option value="SF">بداية إلى نهاية (SF)</option></select>
          <input id="rel-lag-input" type="number" placeholder="فارق (أيام)" value="0" style="width:100px;" />
          <button type="button" class="btn ghost sm" onclick="addTaskRelationship()">+ إضافة</button>
        </div>
      </div>`;
    } else if (f.type === "textarea") {
      input = `<textarea name="${f.key}" rows="3" ${f.required ? "required" : ""} oninput="onModalFieldChange('${f.key}', this.value)">${esc(val)}</textarea>`;
    } else if (f.type === "voiceTextarea") {
      input = `<div>
        <textarea id="voicearea-${f.key}" name="${f.key}" rows="3" ${f.required ? "required" : ""} oninput="onModalFieldChange('${f.key}', this.value)">${esc(val)}</textarea>
        <button type="button" id="voicebtn-${f.key}" class="btn ghost sm" style="margin-top:6px;" onclick="toggleVoiceInput('${f.key}')">🎙 إدخال صوتي (تحويل الكلام إلى نص)</button>
        <span id="voicestatus-${f.key}" style="font-size:11px;color:var(--muted2);margin-right:8px;"></span>
      </div>`;
    } else if (f.type === "photo") {
      const detectionResults = m.values[`_detection_${f.key}`];
      input = `<div>
        ${val ? `<div style="margin-bottom:8px;"><img src="${val}" style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid var(--border2);" /></div>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input type="file" accept="image/*" capture="environment" style="display:none" id="photoinput-${f.key}" onchange="onPhotoInputChange('${f.key}', this)" />
          <button type="button" class="btn ghost sm" onclick="document.getElementById('photoinput-${f.key}').click()">📷 ${val ? "استبدال الصورة" : "إضافة صورة"}</button>
          ${val ? `<button type="button" class="btn danger sm" onclick="removePhoto('${f.key}')">حذف الصورة</button>` : ""}
          ${val ? `<button type="button" class="btn ghost sm" onclick="runPhotoDetection('${f.key}')">🔍 كشف كائنات عامة (تجريبي)</button>` : ""}
        </div>
        ${val ? `<p style="font-size:10px;color:var(--muted2);margin-top:4px;">يكشف فقط فئات عامة (أشخاص، مركبات) من نموذج TensorFlow.js عام — لا يكشف معدات حماية أو أعمالاً إنشائية محدَّدة.</p>` : ""}
        ${detectionResults ? `<div style="margin-top:6px;padding:8px;background:#FFFFFF;border-radius:6px;">
          ${detectionResults.loading ? `<span style="font-size:11px;color:var(--muted2);">جارِ تحميل النموذج وتحليل الصورة...</span>`
            : detectionResults.error ? `<span style="font-size:11px;color:var(--warn);">${esc(detectionResults.error)}</span>`
            : detectionResults.length ? detectionResults.map((d) => `<span style="display:inline-block;background:#EEF2FF;border-radius:5px;padding:2px 8px;font-size:11px;color:#0F1420;margin:2px;">${esc(d.classAr)} (${d.confidencePct}%)</span>`).join("")
            : `<span style="font-size:11px;color:var(--muted2);">لم يُكتشَف أي من الفئات الـ80 العامة في هذه الصورة.</span>`}
        </div>` : ""}
      </div>`;
    } else if (f.type === "photos") {
      const arr = Array.isArray(val) ? val : [];
      input = `<div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          ${arr.map((src, i) => `<div style="position:relative;"><img src="${src}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;border:1px solid var(--border2);" /><button type="button" onclick="removePhotoAt('${f.key}',${i})" style="position:absolute;top:-6px;left:-6px;background:var(--danger);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;line-height:1;">✕</button></div>`).join("")}
        </div>
        <input type="file" accept="image/*" capture="environment" multiple style="display:none" id="photosinput-${f.key}" onchange="onPhotosInputChange('${f.key}', this)" />
        <button type="button" class="btn ghost sm" onclick="document.getElementById('photosinput-${f.key}').click()">📷 إضافة صور</button>
      </div>`;
    } else if (f.type === "barcode") {
      input = `<div>
        <div style="display:flex;gap:8px;">
          <input name="${f.key}" type="text" value="${esc(val)}" oninput="onModalFieldChange('${f.key}', this.value)" style="flex:1;" />
          <button type="button" class="btn ghost sm" onclick="openScanner('${f.key}')">📷 مسح</button>
        </div>
        ${val ? `<div style="margin-top:8px;background:#fff;padding:6px;border-radius:6px;display:inline-block;"><svg data-barcode-for="${f.key}"></svg></div>` : ""}
      </div>`;
    } else if (f.type === "map") {
      const latKey = f.latKey || "lat";
      const lngKey = f.lngKey || "lng";
      const hasCoords = m.values[latKey] && m.values[lngKey];
      input = `<div>
        <div id="map-picker-${f.key}" style="height:220px;border-radius:8px;overflow:hidden;border:1px solid var(--border2);background:#1a2531;display:flex;align-items:center;justify-content:center;color:var(--muted2);font-size:12px;">جارِ تحميل الخريطة...</div>
        <div class="map-coords-label" style="font-size:11px;color:var(--muted2);margin-top:6px;">${hasCoords ? `📍 الإحداثيات المحدَّدة: ${Number(m.values[latKey]).toFixed(5)}, ${Number(m.values[lngKey]).toFixed(5)}` : "اضغط على الخريطة لتحديد موقع المشروع بدقة"}</div>
      </div>`;
    } else if (f.type === "gps") {
      const latKey = f.latKey || "gpsLat";
      const lngKey = f.lngKey || "gpsLng";
      const accKey = f.accKey || "gpsAccuracy";
      const hasCoords = m.values[latKey] && m.values[lngKey];
      input = `<div>
        <button type="button" class="btn ghost sm" onclick="captureGPSForModal('${latKey}','${lngKey}','${accKey}')">📍 تحديد موقعي الحالي (GPS)</button>
        <div class="gps-coords-label" style="font-size:11px;color:var(--muted2);margin-top:6px;">${hasCoords ? `الموقع: ${Number(m.values[latKey]).toFixed(6)}, ${Number(m.values[lngKey]).toFixed(6)} (دقة ~${Math.round(m.values[accKey] || 0)} متر)` : "لم يُحدَّد الموقع بعد — يتطلب إذن الوصول للموقع من المتصفح."}</div>
      </div>`;
    } else if (f.type === "signature") {
      input = `<div>
        ${val ? `<img src="${val}" style="max-width:250px;max-height:100px;border:1px solid var(--border2);border-radius:6px;background:white;display:block;margin-bottom:6px;" />` : ""}
        <canvas id="sigpad-${f.key}" width="300" height="120" style="border:1px solid var(--border2);border-radius:6px;background:white;touch-action:none;cursor:crosshair;display:block;"></canvas>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <button type="button" class="btn ghost sm" onclick="clearSignaturePad('${f.key}')">مسح</button>
          <button type="button" class="btn primary sm" onclick="saveSignaturePad('${f.key}')">✓ اعتماد التوقيع</button>
        </div>
        <p style="font-size:10px;color:var(--muted2);margin-top:4px;">توقيع بصري مُسجَّل بالرسم على الشاشة، مرتبط بسجل التدقيق — ليس توقيعاً تشفيرياً بمعيار PKI قانوني.</p>
      </div>`;
    } else if (f.type === "date") {
      input = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <input name="${f.key}" type="date" value="${esc(val)}" ${f.required ? "required" : ""} oninput="onModalFieldChange('${f.key}', this.value)" style="flex:1;min-width:130px;" />
        <button type="button" class="btn ghost sm" onclick="onModalFieldChange('${f.key}', todayISO()); renderApp();">اليوم</button>
        <button type="button" class="btn ghost sm" onclick="onModalFieldChange('${f.key}', addDaysISO(todayISO(), 7)); renderApp();">+٧ أيام</button>
        <button type="button" class="btn ghost sm" onclick="onModalFieldChange('${f.key}', addDaysISO(todayISO(), 30)); renderApp();">+٣٠ يوماً</button>
      </div>`;
    } else {
      input = `<input name="${f.key}" type="${f.type || "text"}" value="${esc(val)}" ${f.required ? "required" : ""} oninput="onModalFieldChange('${f.key}', this.value)" />`;
      if (m.moduleKey === "invoices" && f.key === "amount" && m.values.custodyId) {
        const custody = (STATE.data.custodies || []).find((c) => c.id === m.values.custodyId);
        if (custody) {
          const usedSoFar = custodyUsedTotal(custody.id, STATE.data.custodies, STATE.data.invoices);
          const remainingBefore = Number(custody.amount || 0) - usedSoFar;
          const thisAmount = Number(val) || 0;
          const remainingAfter = remainingBefore - thisAmount;
          const color = remainingAfter < 0 ? "var(--danger)" : remainingAfter < remainingBefore * 0.15 ? "var(--warn)" : "var(--good)";
          input += `<div style="font-size:10.5px;color:${color};margin-top:4px;">المتبقي في العهدة الآن: ${fmtMoney(remainingBefore)}${thisAmount ? ` — بعد هذه الفاتورة سيصبح: ${fmtMoney(remainingAfter)}${remainingAfter < 0 ? " ⚠ يتجاوز المتبقي فعلياً" : ""}` : ""}</div>`;
        }
      }
    }
    return `<div class="field"><label>${esc(f.label)}${f.required ? " *" : ""}</label>${input}</div>`;
  };

  let fieldsHtml;
  if (!hasSections) {
    fieldsHtml = m.fields.map(fieldHtml).join("");
  } else {
    const sectionOrder = [];
    const bySection = {};
    m.fields.forEach((f) => {
      const sec = f.section || "أخرى";
      if (!bySection[sec]) { bySection[sec] = []; sectionOrder.push(sec); }
      bySection[sec].push(f);
    });
    const activeSection = m.activeSection || sectionOrder[0];
    const tabs = sectionOrder.map((sec) => `<button type="button" class="btn ${sec === activeSection ? "primary" : "ghost"} sm" onclick="STATE.modal.activeSection='${esc(sec)}';renderApp();">${esc(sec)}</button>`).join("");
    fieldsHtml = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border);">${tabs}</div>`
      + sectionOrder.map((sec) => `<div style="${sec === activeSection ? "" : "display:none;"}">${bySection[sec].map(fieldHtml).join("")}</div>`).join("");
  }

  return `<div class="modal-overlay" onclick="if(event.target===this) closeModal()">
    <div class="modal-box" onclick="event.stopPropagation()">
      <div class="modal-head"><h3>${esc(m.title)}</h3><button onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <form id="entity-form" onsubmit="submitModal(event)">
          ${fieldsHtml}
          <div class="form-actions">
            <button type="submit" class="btn primary">حفظ</button>
            <button type="button" class="btn ghost" onclick="closeModal()">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  </div>${renderScannerOverlay()}`;
}
