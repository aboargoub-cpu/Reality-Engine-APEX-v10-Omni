/* ============================================================
   تعريف الوحدات: الحقول + عمليات الإضافة/التعديل/الحذف
   ============================================================ */

function projectOptions() {
  const scope = getUserScopedProjectIds();
  const list = scope ? STATE.data.projects.filter((p) => scope.has(p.id)) : STATE.data.projects;
  return list.map((p) => ({ value: p.id, label: p.name }));
}
function projName(id) {
  const p = STATE.data.projects.find((x) => x.id === id);
  return p ? p.name : "—";
}
/* ============================================================
   ترميز لوني حقيقي للمشاريع — فكرة مستعارة من كيفية تفكير المهندس
   الفعلية أصلاً (رسومات مُرمَّزة بالألوان حسب التخصص: إنشائي أزرق،
   كهرباء أصفر...)، لا تصميم تطبيق عام. لون ثابت لكل مشروع، مُعيَّن
   تلقائياً وحتمياً (نفس المشروع = نفس اللون دائماً)، مع إمكانية
   تخصيص يدوي اختياري.
   ============================================================ */
const PROJECT_COLOR_PALETTE = ["#22d3ee", "#F5A623", "#2FBF71", "#a78bfa", "#E5484D", "#38bdf8", "#fb923c", "#4ade80", "#f472b6", "#facc15"];
function getProjectColor(projectIdOrProject) {
  const project = typeof projectIdOrProject === "string" ? STATE.data.projects.find((p) => p.id === projectIdOrProject) : projectIdOrProject;
  if (!project) return "#8a99a8";
  if (project.colorOverride) return project.colorOverride;
  let hash = 0;
  for (let i = 0; i < project.id.length; i++) hash = (hash * 31 + project.id.charCodeAt(i)) >>> 0;
  return PROJECT_COLOR_PALETTE[hash % PROJECT_COLOR_PALETTE.length];
}
function pmName(id) {
  const r = (STATE.data.resourcePool || []).find((x) => x.id === id);
  return r ? r.name : "—";
}
function custodyLabel(id) {
  const c = (STATE.data.custodies || []).find((x) => x.id === id);
  return c ? `عهدة رقم ${c.number} — ${fmtMoney(c.amount)} (${projName(c.projectId)})` : "—";
}

/* ============================================================
   بنية تحتية للدمج الذكي بين نسختين من البيانات (بلا سيرفر مركزي):
   كل سجل يحمل "updatedAt"، وكل حذف يُسجَّل كـ"شاهد قبر" (Tombstone)
   بدل الحذف الصامت — هذا ما يسمح بدمج نسختين مختلفتين لاحقاً بدقة
   (من عدَّل آخراً يفوز على مستوى السجل الواحد، تماماً كما تفعل قواعد
   البيانات السحابية الحقيقية عند الكتابة الكاملة لمستند واحد).
   ============================================================ */
function addTombstone(collection, id) {
  STATE.data._tombstones = STATE.data._tombstones || [];
  STATE.data._tombstones.push({ collection, id, deletedAt: Date.now() });
}

/* ============================================================
   سجل التدقيق (Audit Log) — سجل حقيقي وشفاف لكل عملية إنشاء/تعديل/حذف
   في النظام: من نفَّذها، متى، وعلى أي سجل بالضبط. مُخزَّن محلياً ضمن
   بيانات النظام نفسها (لا خادم مركزياً)، ويُعرض بالكامل في صفحة
   "سجل التدقيق" القابلة للبحث والتصفية.
   ============================================================ */
const AUDIT_LABEL_KEYS = ["name", "title", "number", "itemNumber", "subject", "party", "decisionText", "item", "description"];
function getRecordLabel(row) {
  if (!row) return "—";
  for (const k of AUDIT_LABEL_KEYS) {
    if (row[k]) return String(row[k]).slice(0, 60);
  }
  return row.id || "—";
}
function logAudit(action, collection, recordId, label) {
  STATE.data._auditLog = STATE.data._auditLog || [];
  STATE.data._auditLog.push({
    id: uid(), timestamp: Date.now(),
    userId: STATE.user && STATE.user.id, userName: (STATE.user && STATE.user.name) || "—", userRole: (STATE.user && STATE.user.role) || "—",
    action, collection, recordId, label: label || "—",
  });
  // حد معقول لحجم السجل حتى لا يتضخم التخزين المحلي إلى ما لا نهاية
  if (STATE.data._auditLog.length > 2000) STATE.data._auditLog = STATE.data._auditLog.slice(-2000);
}

function findModuleKeyByCollection(collection) {
  // مجموعات كثيرة في هذا النظام هي تابات فرعية لصفحة واحدة، لا صلاحية مستقلة باسم كل منها —
  // خلل جذري حقيقي كان يمنع أي تعديل شرعي لها عبر النموذج القياسي بصمت تام لكل الأدوار
  const subTabPermissionMap = {
    materials: "resources", equipment: "resources", labor: "resources",
    procurementBids: "procurement",
    bankAccounts: "finance", budgetItems: "finance",
    progressItems: "progress",
    decisions: "meetings",
    contractorEvaluations: "digitalTwin", projectAssets: "digitalTwin", realityCaptures: "digitalTwin",
    deviationReports: "digitalTwin", arSessions: "digitalTwin", maintenanceRecords: "digitalTwin",
    sensorReadings: "digitalTwin", aiAnalysisResults: "digitalTwin", smartInspections: "digitalTwin",
    realityTwinSessions: "realityTwin",
  };
  if (subTabPermissionMap[collection]) return subTabPermissionMap[collection];
  return Object.keys(MODULES).find((k) => MODULES[k].collection === collection);
}
function genericAdd(collection, extra) {
  return (vals) => {
    const moduleKey = findModuleKeyByCollection(collection);
    if (moduleKey && STATE.user && !canEdit(STATE.user.role, moduleKey)) { alert("دورك الحالي لا يملك صلاحية الإضافة هنا."); return; }
    const row = Object.assign({ id: uid(), createdBy: STATE.user && STATE.user.name, updatedAt: Date.now() }, vals, extra ? extra(vals) : {});
    STATE.data[collection] = [...(STATE.data[collection] || []), row];
    logAudit("create", collection, row.id, getRecordLabel(row));
    if (typeof clearDigitalTwinRenderCache === "function") clearDigitalTwinRenderCache();
    saveData(STATE.data);
  };
}
function genericUpdate(collection, extra) {
  return (id, vals) => {
    const moduleKey = findModuleKeyByCollection(collection);
    if (moduleKey && STATE.user && !canEdit(STATE.user.role, moduleKey)) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
    let updatedRow = null;
    STATE.data[collection] = (STATE.data[collection] || []).map((r) => {
      if (r.id !== id) return r;
      updatedRow = Object.assign({}, r, vals, extra ? extra(vals, r) : {}, { lastEditedBy: STATE.user && STATE.user.name, updatedAt: Date.now() });
      return updatedRow;
    });
    if (updatedRow) logAudit("update", collection, id, getRecordLabel(updatedRow));
    if (typeof clearDigitalTwinRenderCache === "function") clearDigitalTwinRenderCache();
    saveData(STATE.data);
  };
}
function cancelOrphanedWorkflowInstance(moduleKey, businessObjectId) {
  if (!moduleKey) return;
  const instance = getWorkflowInstanceFor(moduleKey, businessObjectId);
  if (!instance || instance.status !== "قيد التنفيذ") return; // لا سير عمل نشط لهذا العنصر، أو مكتمل فعلاً — لا شيء لتنظيفه
  const entry = { stageId: instance.currentStageId, stageName: "أُلغي تلقائياً", action: "cancel", user: (STATE.user && STATE.user.name) || "النظام",
    userId: STATE.user ? STATE.user.id : null, role: STATE.user ? STATE.user.role : null, date: todayISO(), timestamp: Date.now(),
    comment: "أُلغي سير العمل تلقائياً لأن العنصر المرتبط به حُذف من النظام.", previousStageId: instance.currentStageId };
  STATE.data.workflowInstances = STATE.data.workflowInstances.map((i) => i.id === instance.id
    ? Object.assign({}, i, { status: "مُلغى", history: [...i.history, entry] }) : i);
}

function genericRemove(collection) {
  return (id) => {
    const moduleKey = findModuleKeyByCollection(collection);
    if (moduleKey && STATE.user && !canEdit(STATE.user.role, moduleKey)) { alert("دورك الحالي لا يملك صلاحية الحذف هنا."); return; }
    const row = (STATE.data[collection] || []).find((r) => r.id === id);
    addTombstone(collection, id);
    STATE.data[collection] = (STATE.data[collection] || []).filter((r) => r.id !== id);
    cancelOrphanedWorkflowInstance(moduleKey, id);
    logAudit("delete", collection, id, getRecordLabel(row));
    if (typeof clearDigitalTwinRenderCache === "function") clearDigitalTwinRenderCache();
    saveData(STATE.data);
  };
}
function deleteResourcePoolEntry(id) {
  STATE.data.projects = (STATE.data.projects || []).map((p) =>
    p.projectManagerId === id ? Object.assign({}, p, { projectManagerId: "", updatedAt: Date.now() }) : p
  );
  genericRemove("resourcePool")(id);
}

/* ---- اختيار الفائز بين عروض الموردين المنافسة على طلب شراء واحد ---- */
/* ---- حذف مهمة مع التحقق من اعتماد مهام أخرى عليها كنشاط سابق (Predecessor) ---- */
function deleteTaskWithDependencyCheck(id) {
  if (STATE.user && !canEdit(STATE.user.role, "tasks")) { alert("دورك الحالي لا يملك صلاحية حذف المهام."); return; }
  const task = (STATE.data.tasks || []).find((t) => t.id === id);
  if (!task) return;
  const dependents = (STATE.data.tasks || []).filter((t) => Array.isArray(t.predecessors) && t.predecessors.includes(id));
  let msg = `سيتم حذف المهمة «${task.name}» نهائياً.`;
  if (dependents.length) {
    msg += `\n\nتحذير: ${dependents.length} مهمة أخرى تعتمد على هذه المهمة كنشاط سابق (${dependents.map((t) => t.name).join("، ")}) — سيُزال الترابط تلقائياً منها بعد الحذف، وقد يتغيّر حساب المسار الحرج لتلك المهام نتيجة لذلك.`;
  }
  msg += "\n\nهل تريد المتابعة؟";
  if (!confirm(msg)) return;
  addTombstone("tasks", id);
  logAudit("delete", "tasks", id, getRecordLabel(task));
  STATE.data.tasks = (STATE.data.tasks || [])
    .filter((t) => t.id !== id)
    .map((t) => (Array.isArray(t.predecessors) && t.predecessors.includes(id))
      ? Object.assign({}, t, { predecessors: t.predecessors.filter((pid) => pid !== id), updatedAt: Date.now() })
      : t);
  cancelOrphanedWorkflowInstance("tasks", id);
  saveData(STATE.data);
}

/* ---- إضافة عهدة مع ترقيم تلقائي تسلسلي لكل مشروع (لا إدخال يدوي للرقم أبداً) ---- */
function addCustody(vals) {
  if (STATE.user && !canEdit(STATE.user.role, "custodies")) { alert("دورك الحالي لا يملك صلاحية إضافة عهدة."); return; }
  const existingForProject = (STATE.data.custodies || []).filter((c) => c.projectId === vals.projectId);
  const nextNum = existingForProject.length ? Math.max(...existingForProject.map((c) => parseInt(c.number, 10) || 0)) + 1 : 1;
  const row = Object.assign({}, vals, { id: uid(), number: String(nextNum), updatedAt: Date.now() });
  STATE.data.custodies = [...(STATE.data.custodies || []), row];
  logAudit("create", "custodies", row.id, `عهدة رقم ${row.number} — ${getCustodianName(row)} (${fmtMoney(row.amount)})`);
  saveData(STATE.data);
}

/* ---- إنشاء/تحديث حساب دخول مرتبط مباشرة من نموذج المورد (لمدير مشروع/مهندس فقط) ---- */
function upsertLinkedUserAccount(resourceId, resourceName, resourceType, username, password) {
  if (!username || !password) return;
  if (resourceType !== "مدير مشروع" && resourceType !== "مهندس") return;
  const role = resourceType === "مدير مشروع" ? "مدير المشروع" : "مهندس الموقع";
  const uname = String(username).trim();
  const existing = (STATE.data.users || []).find((u) => u.linkedResourceId === resourceId);
  if (existing) {
    const salt = generateSalt();
    STATE.data.users = STATE.data.users.map((u) => u.id === existing.id
      ? Object.assign({}, u, { name: resourceName, username: uname, salt, passwordHash: hashPassword(password, salt), updatedAt: Date.now() })
      : u);
    return;
  }
  const dup = (STATE.data.users || []).some((u) => String(u.username || "").trim().toLowerCase() === uname.toLowerCase());
  if (dup) { alert(`تنبيه: اسم المستخدم "${uname}" مُستخدَم من قبل حساب آخر — لم يُنشأ حساب جديد لهذا المورد. عدِّل اسم المستخدم من صفحة "المستخدمون" لاحقاً.`); return; }
  const salt = generateSalt();
  const newUser = { id: uid(), name: resourceName, role, username: uname, salt, passwordHash: hashPassword(password, salt), linkedResourceId: resourceId, updatedAt: Date.now() };
  STATE.data.users = [...(STATE.data.users || []), newUser];
}

function selectBidWinner(bidId) {
  if (STATE.user && !canEdit(STATE.user.role, "procurement")) { alert("دورك الحالي لا يملك صلاحية اختيار الفائز بالعرض."); return; }
  const bids = STATE.data.procurementBids || [];
  const winningBid = bids.find((b) => b.id === bidId);
  if (!winningBid) return;
  STATE.data.procurementBids = bids.map((b) =>
    b.procurementId === winningBid.procurementId ? Object.assign({}, b, { isWinner: b.id === bidId, updatedAt: Date.now() }) : b
  );
  STATE.data.procurement = (STATE.data.procurement || []).map((r) =>
    r.id === winningBid.procurementId ? Object.assign({}, r, { supplier: winningBid.supplierName, amount: winningBid.quotedAmount, updatedAt: Date.now() }) : r
  );
  logAudit("update", "procurement", winningBid.procurementId, `اختيار الفائز بالعطاء: ${winningBid.supplierName} (${fmtMoney(winningBid.quotedAmount)})`);
  saveData(STATE.data);
  renderApp();
}

/* ============================================================
   حذف مشروع بالكامل (Cascade Delete) — المشروع هو الكيان الجذري الذي
   تُشير إليه أكثر من 20 مجموعة بيانات عبر projectId. الحذف العادي (فلترة
   بسيطة) كان سيترك كل هذه السجلات "يتيمة" (تُشير لمشروع لم يعد موجوداً)
   دون أي تنبيه للمستخدم بحجم ما سيتأثر. هذه الدالة تعرض ملخصاً شفافاً
   بكل ما سيُحذف قبل التنفيذ، ثم تُنظّف كل المجموعات المرتبطة فعلياً،
   وتُلغي فقط تعيين الموارد (دون حذفها) لأنها كيانات مستقلة عن المشروع.
   ============================================================ */
const PROJECT_LINKED_COLLECTIONS = [
  { key: "tasks", label: "المهام" },
  { key: "dailyReports", label: "التقارير اليومية" },
  { key: "procurement", label: "طلبات الشراء" },
  { key: "contracts", label: "العقود" },
  { key: "invoices", label: "الفواتير" },
  { key: "qc", label: "بنود الجودة" },
  { key: "hse", label: "بنود السلامة" },
  { key: "risks", label: "المخاطر" },
  { key: "labor", label: "العمالة" },
  { key: "equipment", label: "المعدات" },
  { key: "materials", label: "المواد" },
  { key: "custodies", label: "العهد والسُلف" },
  { key: "certificates", label: "مستخلصات المالك" },
  { key: "subcontractorCertificates", label: "مستخلصات المقاولين من الباطن" },
  { key: "claims", label: "المطالبات" },
  { key: "correspondence", label: "المراسلات" },
  { key: "meetings", label: "الاجتماعات" },
  { key: "decisions", label: "القرارات" },
  { key: "punchlist", label: "بنود الملاحظات والتسليم" },
  { key: "documents", label: "الوثائق والتراخيص" },
  { key: "budgetItems", label: "بنود الميزانية" },
  { key: "progressItems", label: "بنود الإنجاز" },
  { key: "changeOrders", label: "أوامر التغيير" },
  { key: "ledger", label: "قيود الحسابات" },
  { key: "projectAssets", label: "عناصر المشروع (التوثيق الرقمي)" },
  { key: "realityCaptures", label: "مسوحات وتوثيق الواقع" },
  { key: "deviationReports", label: "تقارير الانحرافات" },
  { key: "arSessions", label: "جلسات التفتيش الذكي" },
  { key: "aiAnalysisResults", label: "نتائج التحليل الذكي" },
  { key: "smartInspections", label: "التفتيشات الذكية" },
  { key: "contractorEvaluations", label: "تقييمات المقاولين" },
  { key: "sensorReadings", label: "قراءات مستشعرات IoT" },
  { key: "maintenanceRecords", label: "سجلات الصيانة" },
  { key: "gmNotes", label: "ملاحظات الإدارة العليا" },
  { key: "discussionAnalyses", label: "تحليلات النقاش بالذكاء الاصطناعي" },
  { key: "projectNotes", label: "ملاحظات المشروع" },
  { key: "projectChatMessages", label: "رسائل غرفة المشروع" },
  { key: "chatRooms", label: "غرف النقاش" },
  { key: "chatRoomReadState", label: "حالة قراءة الغرف" },
  { key: "notifications", label: "الإشعارات" },
  { key: "resourceTransferRequests", label: "طلبات نقل المعدات" },
  { key: "projectEvents", label: "أحداث المشروع" },
];

function countProjectRelatedRecords(projectId) {
  const related = [];
  PROJECT_LINKED_COLLECTIONS.forEach(({ key, label }) => {
    const n = (STATE.data[key] || []).filter((r) => r.projectId === projectId).length;
    if (n > 0) related.push({ key, label, count: n });
  });
  const procIds = new Set((STATE.data.procurement || []).filter((r) => r.projectId === projectId).map((r) => r.id));
  const bidCount = (STATE.data.procurementBids || []).filter((b) => procIds.has(b.procurementId)).length;
  if (bidCount > 0) related.push({ key: "procurementBids", label: "عروض موردين مرتبطة بطلبات الشراء", count: bidCount });
  const assignedResources = (STATE.data.resourcePool || []).filter((r) => r.assignedProjectId === projectId).length;
  if (assignedResources > 0) related.push({ key: "resourcePool", label: "موارد معيّنة (سيُلغى تعيينها فقط، لن تُحذف)", count: assignedResources });
  return related;
}

function deleteProjectCascade(projectId) {
  if (STATE.user && !canEdit(STATE.user.role, "projects")) { alert("دورك الحالي لا يملك صلاحية حذف المشاريع."); return; }
  const project = (STATE.data.projects || []).find((p) => p.id === projectId);
  if (!project) return;
  const related = countProjectRelatedRecords(projectId);
  let msg = `سيتم حذف المشروع «${project.name}» نهائياً.`;
  if (related.length) {
    msg += "\n\nسيُحذف أيضاً كل ما هو مرتبط به:\n" + related.map((r) => `• ${r.label}: ${r.count}`).join("\n");
  }
  msg += "\n\nهذا الإجراء لا يمكن التراجع عنه. متابعة؟";
  if (!confirm(msg)) return;

  PROJECT_LINKED_COLLECTIONS.forEach(({ key }) => {
    (STATE.data[key] || []).filter((r) => r.projectId === projectId).forEach((r) => addTombstone(key, r.id));
    STATE.data[key] = (STATE.data[key] || []).filter((r) => r.projectId !== projectId);
  });
  // تنظيف من الدرجة الثانية: عروض الموردين لا تحمل projectId مباشرة، بل ترتبط بطلب شراء (procurementId)
  // قد يكون قد حُذف للتو ضمن السطر أعلاه — دون هذا السطر تبقى إشارات معلَّقة لطلبات لم تعد موجودة.
  const remainingProcurementIds = new Set(STATE.data.procurement.map((r) => r.id));
  (STATE.data.procurementBids || []).filter((b) => !remainingProcurementIds.has(b.procurementId)).forEach((b) => addTombstone("procurementBids", b.id));
  STATE.data.procurementBids = (STATE.data.procurementBids || []).filter((b) => remainingProcurementIds.has(b.procurementId));
  STATE.data.resourcePool = (STATE.data.resourcePool || []).map((r) =>
    r.assignedProjectId === projectId ? Object.assign({}, r, { assignedProjectId: null, status: "متاح", updatedAt: Date.now() }) : r
  );
  addTombstone("projects", projectId);
  logAudit("delete", "projects", projectId, `حذف كامل للمشروع «${project.name}» (${related.map((r) => `${r.label}: ${r.count}`).join("، ")})`);
  STATE.data.projects = STATE.data.projects.filter((p) => p.id !== projectId);

  // إلغاء أي سير عمل نشط بأكمله كان مرتبطاً بهذا المشروع — لا تُترَك اعتمادات معلَّقة لعناصر حُذفت للتو
  STATE.data.workflowInstances = (STATE.data.workflowInstances || []).map((i) =>
    i.projectId === projectId && i.status === "قيد التنفيذ"
      ? Object.assign({}, i, { status: "مُلغى", history: [...i.history, { stageId: i.currentStageId, stageName: "أُلغي تلقائياً", action: "cancel",
          user: (STATE.user && STATE.user.name) || "النظام", userId: STATE.user ? STATE.user.id : null, role: STATE.user ? STATE.user.role : null,
          date: todayISO(), timestamp: Date.now(), comment: "أُلغي سير العمل تلقائياً لحذف المشروع المرتبط به بالكامل.", previousStageId: i.currentStageId }] })
      : i
  );

  if (STATE.projectFilter === projectId) STATE.projectFilter = "all";
  if (STATE.dashboardDrill && STATE.dashboardDrill.projectId === projectId) STATE.dashboardDrill = { level: "portfolio" };

  saveData(STATE.data);
}

/* ---- Field configs ---- */
function projectFields() {
  return [
    { key: "name", label: "اسم المشروع", required: true },
    { key: "colorOverride", label: "لون تمييز المشروع (اختياري — لون تلقائي ثابت إن تُرِك فارغاً)", type: "select",
      options: ["", ...PROJECT_COLOR_PALETTE], showInTable: false,
      render: (v, row) => `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${getProjectColor(row)};vertical-align:middle;"></span>` },
    { key: "owner", label: "المالك" },
    { key: "consultant", label: "الاستشاري" },
    { key: "projectManagerId", label: "مدير المشروع (من السجل الرئيسي للموارد)", type: "select",
      options: (STATE.data.resourcePool || []).filter((r) => r.type === "مدير مشروع").map((r) => ({ value: r.id, label: r.name })),
      render: (v) => v ? esc(pmName(v)) : "—" },
    { key: "teamEngineerIds", label: "المهندسون المُشرفون على المشروع (يمكن اختيار أكثر من مهندس)", type: "multiselect",
      options: (STATE.data.resourcePool || []).filter((r) => r.type === "مهندس").map((r) => ({ value: r.id, label: r.name })), showInTable: false,
      render: (v) => Array.isArray(v) && v.length ? v.map((id) => { const r = (STATE.data.resourcePool || []).find((x) => x.id === id); return r ? esc(r.name) : ""; }).join("، ") : "—" },
    { key: "mapPicker", label: "تحديد الموقع على الخريطة (اضغط لتثبيت الدبوس)", type: "map", latKey: "lat", lngKey: "lng", showInTable: false },
    { key: "location", label: "وصف الموقع (عنوان نصي، اختياري إن حُدِّد على الخريطة أعلاه)",
      render: (v, r) => (v || (r.lat && r.lng)) ? `<button type="button" class="btn ghost sm" onclick="event.stopPropagation();openProjectLocation('${r.id}')">📍 فتح في الخريطة</button>` : "—" },
    { key: "contractValue", label: "قيمة العقد (BAC)", type: "number", render: (v) => v ? fmtMoney(v) : "—" },
    { key: "startDate", label: "تاريخ البداية", type: "date" },
    { key: "endDate", label: "تاريخ النهاية", type: "date" },
    { key: "completion", label: "نسبة الإنجاز %", type: "number", render: (v) => `${v || 0}%` },
    { key: "risk", label: "مستوى الخطر العام", type: "select", options: ["منخفض", "متوسط", "مرتفع"],
      render: (v) => statusDot(v === "مرتفع" ? "danger" : v === "متوسط" ? "warn" : "good", v) },
  ];
}
function taskFields() {
  const tOpts = filterByProject(STATE.data.tasks).map((t) => ({ value: t.id, label: t.name }));
  const engineerOpts = filterByProject(STATE.data.resourcePool || [], true).filter((r) => r.type === "مهندس" || r.type === "مدير مشروع").map((r) => ({ value: r.id, label: `${r.name} (${r.type})` }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "name", label: "اسم المهمة", required: true },
    { key: "assignee", label: "المسؤول (نص حر، اختياري)" },
    { key: "responsibleResourceId", label: "المهندس/المشرف المسؤول عن هذا النشاط تحديداً", type: "select", options: engineerOpts,
      render: (v) => { const r = (STATE.data.resourcePool || []).find((x) => x.id === v); return r ? esc(r.name) : "—"; } },
    { key: "start", label: "تاريخ البداية", type: "date" },
    { key: "end", label: "تاريخ النهاية", type: "date" },
    { key: "priority", label: "الأولوية", type: "select", options: ["عالية", "متوسطة", "منخفضة"] },
    { key: "completion", label: "الإنجاز %", type: "number", render: (v) => `${v || 0}%` },
    { key: "predecessors", label: "الأنشطة السابقة والعلاقات المنطقية بينها (نهاية-بداية، بداية-بداية، وغيرها)", type: "relationships", options: tOpts, showInTable: false },
    { key: "optimisticDuration", label: "المدة المتفائلة بالأيام (لتحليل مخاطر الجدول، اختياري — افتراضي 80% من المدة الحالية)", type: "number", showInTable: false },
    { key: "pessimisticDuration", label: "المدة المتشائمة بالأيام (لتحليل مخاطر الجدول، اختياري — افتراضي 130% من المدة الحالية)", type: "number", showInTable: false },
  ];
}
function reportFields() {
  const tOpts = filterByProject(STATE.data.tasks).map((t) => ({ value: t.id, label: `${projName(t.projectId)} — ${t.name}` }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "date", label: "التاريخ", type: "date", required: true },
    { key: "completedTaskIds", label: "المهام المنفذة اليوم (يُبنى ملخص التقرير تلقائياً منها)", type: "multiselect", options: tOpts, showInTable: false },
    { key: "activities", label: "ملاحظات إضافية / تفاصيل حرة (اختياري)", type: "voiceTextarea" },
    { key: "workers", label: "عدد العمال", type: "number" },
    { key: "equipment", label: "المعدات المستخدمة" },
    { key: "weather", label: "حالة الطقس" },
    { key: "notes", label: "ملاحظات", type: "textarea" },
    { key: "photos", label: "صور من الموقع", type: "photos", showInTable: false },
    { key: "status", label: "حالة الاعتماد", showInTable: true,
      render: (v) => statusDot(v === "معتمد" ? "good" : v === "يحتاج تعديل" ? "danger" : "warn", v || "مُقدَّم — بانتظار مراجعة مدير المشروع") },
  ];
}
function procurementFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "item", label: "البند المطلوب", required: true },
    { key: "stage", label: "المرحلة", type: "select", options: ["طلب احتياج","موافقة","طلب عروض","استلام عروض","التقييم","أمر شراء","التوريد","الفاتورة","الدفع"],
      render: (v) => statusDot(["الدفع","التوريد"].includes(v) ? "good" : "warn", v) },
    { key: "supplier", label: "المورد" },
    { key: "amount", label: "القيمة التقديرية", type: "number", render: (v) => v ? fmtMoney(v) : "—" },
    { key: "requestDate", label: "تاريخ الطلب", type: "date" },
  ];
}

/* ---- عروض الموردين (Supplier Bids/Quotes) — مقارنة تنافسية مرتبطة بطلب شراء محدد ---- */
function procurementBidFields() {
  const reqOpts = filterByProject(STATE.data.procurement || []).map((p) => ({ value: p.id, label: `${p.item} — ${projName(p.projectId)}` }));
  return [
    { key: "procurementId", label: "طلب الشراء المرتبط", type: "select", options: reqOpts, required: true,
      render: (v) => { const r = (STATE.data.procurement || []).find((p) => p.id === v); return r ? esc(r.item) : "—"; } },
    { key: "supplierName", label: "اسم المورد", required: true },
    { key: "quotedAmount", label: "المبلغ المعروض", type: "number", required: true, render: (v) => fmtMoney(v) },
    { key: "deliveryDays", label: "مدة التوريد (أيام)", type: "number", render: (v) => v ? `${v} يوم` : "—" },
    { key: "paymentTerms", label: "شروط الدفع" },
    { key: "technicalCompliance", label: "المطابقة الفنية", type: "select", options: ["مطابق", "مطابق جزئياً", "غير مطابق"],
      render: (v) => statusDot(v === "مطابق" ? "good" : v === "غير مطابق" ? "danger" : "warn", v || "مطابق") },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}
function contractFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "party", label: "الطرف الآخر", required: true },
    { key: "type", label: "نوع العقد", type: "select", options: ["مقاول فرعي", "مورد", "استشاري", "عقد رئيسي"] },
    { key: "value", label: "القيمة", type: "number", render: (v) => v ? fmtMoney(v) : "—" },
    { key: "expiryDate", label: "تاريخ الانتهاء", type: "date", render: (v) => {
        const d = daysUntil(v);
        const level = d == null ? "info" : d < 0 ? "danger" : d <= 30 ? "warn" : "good";
        return statusDot(level, v ? `${v}${d != null ? ` (${d} يوم)` : ""}` : "—");
      } },
    { key: "status", label: "الحالة", type: "select", options: ["ساري", "منتهي", "قيد التجديد"] },
  ];
}
function invoiceFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "type", label: "الجهة", type: "select", options: ["عميل", "مورد"] },
    { key: "category", label: "نوع الفاتورة", type: "select",
      options: ["فاتورة عادية", "مستخلص (Progress)", "دفعة مقدمة", "مقاول من الباطن", "استشاري"],
      render: (v) => v || "فاتورة عادية" },
    { key: "number", label: "رقم الفاتورة", required: true },
    { key: "amount", label: "القيمة الإجمالية", type: "number", render: (v) => fmtMoney(v) },
    { key: "custodyId", label: "العهدة المرتبطة (لفواتير مدير المشروع)", type: "select",
      options: filterByProject(STATE.data.custodies || []).map((c) => {
        const used = custodyUsedTotal(c.id, STATE.data.custodies, STATE.data.invoices);
        const remaining = Number(c.amount || 0) - used;
        return { value: c.id, label: `عهدة رقم ${c.number} — المتبقي: ${fmtMoney(remaining)} من ${fmtMoney(c.amount)} (${projName(c.projectId)})` };
      }),
      render: (v) => v ? custodyLabel(v) : "—" },
    { key: "retentionPercent", label: "نسبة المحتجز % (للمستخلصات)", type: "number", render: (v) => v ? `${v}%` : "—" },
    { key: "approvalStatus", label: "حالة مراجعة المحاسب العام", type: "select", options: ["—", "مقدَّم", "معتمد", "مرفوض"],
      render: (v) => v && v !== "—" ? statusDot(v === "معتمد" ? "good" : v === "مرفوض" ? "danger" : "warn", v) : statusDot("info", "بانتظار المراجعة") },
    { key: "paidAmount", label: "المدفوع", type: "number", render: (v) => fmtMoney(v || 0) },
    { key: "bankAccountId", label: "الحساب البنكي (لتحديد أي حساب مرَّت عبره الدفعة)", type: "select",
      options: (STATE.data.bankAccounts || []).map((b) => ({ value: b.id, label: b.name })),
      render: (v) => { const b = (STATE.data.bankAccounts || []).find((x) => x.id === v); return b ? esc(b.name) : "—"; }, showInTable: false },
    { key: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["مدفوعة", "جزئية", "مستحقة"],
      render: (v) => statusDot(v === "مدفوعة" ? "good" : v === "جزئية" ? "warn" : "danger", v) },
    { key: "barcodeValue", label: "الباركود (مسح أو إدخال يدوي)", type: "barcode", showInTable: false },
    { key: "photo", label: "صورة الفاتورة", type: "photo", showInTable: false },
  ];
}
function qcFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "category", label: "النوع", type: "select", options: ["طلب فحص", "فحص مواد", "فحص موقع", "NCR", "إجراء تصحيحي", "Punch List"] },
    { key: "title", label: "العنوان", required: true },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "raisedBy", label: "لوحظ بواسطة" },
    { key: "responsibleParty", label: "الجهة المسؤولة عن المعالجة" },
    { key: "correctiveAction", label: "الإجراء التصحيحي", type: "textarea" },
    { key: "targetCloseDate", label: "تاريخ الإغلاق المستهدف", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["مفتوح", "قيد المعالجة", "مغلق"],
      render: (v, row) => { const s = deriveQCStatus(row); return statusDot(s === "مغلق" ? "good" : s === "متأخر" ? "danger" : "warn", s); } },
    { key: "closedDate", label: "تاريخ الإغلاق الفعلي", type: "date" },
    { key: "verifiedBy", label: "تحقّق من الإغلاق" },
  ];
}
function hseFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "category", label: "النوع", type: "select", options: ["حادث", "Near Miss", "Toolbox Meeting", "تصريح عمل", "تقييم مخاطر"] },
    { key: "title", label: "الوصف", required: true },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "severity", label: "درجة الخطورة", type: "select", options: ["—", "منخفض", "متوسط", "مرتفع"],
      render: (v) => v && v !== "—" ? statusDot(v === "مرتفع" ? "danger" : v === "متوسط" ? "warn" : "good", v) : "—" },
    { key: "investigator", label: "المحقّق المسؤول" },
    { key: "rootCause", label: "السبب الجذري", type: "textarea" },
    { key: "correctiveAction", label: "الإجراء التصحيحي/الوقائي", type: "textarea" },
    { key: "targetCloseDate", label: "تاريخ الإغلاق المستهدف", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["مفتوح", "قيد المعالجة", "مغلق"],
      render: (v, row) => { const s = deriveHSEStatus(row); return statusDot(s === "مغلق" ? "good" : s === "متأخر" ? "danger" : "warn", s); } },
    { key: "closedDate", label: "تاريخ الإغلاق الفعلي", type: "date" },
  ];
}
function riskFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "title", label: "وصف الخطر", required: true },
    { key: "probability", label: "الاحتمالية (1-5)", type: "select", options: [1,2,3,4,5] },
    { key: "impact", label: "الأثر (1-5)", type: "select", options: [1,2,3,4,5] },
    { key: "mitigation", label: "خطة التخفيف", type: "textarea" },
    { key: "owner", label: "المسؤول عن المخطر" },
    { key: "status", label: "الحالة", type: "select", options: ["مفتوح", "قيد المعالجة", "مغلق"],
      render: (v) => statusDot(v === "مغلق" ? "good" : v === "قيد المعالجة" ? "warn" : "danger", v) },
  ];
}
function laborFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "name", label: "اسم الفريق/العامل", required: true },
    { key: "role", label: "التخصص" },
    { key: "count", label: "العدد", type: "number" },
    { key: "dailyRate", label: "الأجر اليومي للفرد", type: "number", render: (v) => v ? fmtMoney(v) : "—" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "status", label: "الحضور", type: "select", options: ["حاضر", "غياب جزئي", "غائب"],
      render: (v) => statusDot(v === "حاضر" ? "good" : v === "غياب جزئي" ? "warn" : "danger", v) },
  ];
}
function equipFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "name", label: "اسم المعدة", required: true },
    { key: "status", label: "الحالة", type: "select", options: ["تعمل", "متوقفة - صيانة", "معطلة"],
      render: (v) => statusDot(v === "تعمل" ? "good" : v === "معطلة" ? "danger" : "warn", v) },
    { key: "hours", label: "ساعات التشغيل اليوم", type: "number" },
    { key: "hourlyRate", label: "تكلفة التشغيل بالساعة", type: "number", render: (v) => v ? fmtMoney(v) : "—" },
    { key: "fuel", label: "الوقود %", type: "number", render: (v) => `${v || 0}%` },
    { key: "location", label: "الموقع الحالي" },
  ];
}
function matFields() {
  return [
    { key: "projectId", label: "الموقع (مشروع أو مخزن)", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "name", label: "اسم المادة", required: true },
    { key: "unit", label: "الوحدة" },
    { key: "unitCost", label: "تكلفة الوحدة", type: "number", render: (v) => v ? fmtMoney(v) : "—" },
    { key: "inStock", label: "المخزون الفعلي (محسوب من سجل الحركات)", type: "number",
      render: (v, r) => { const stock = computeMaterialCurrentStock(r.id); return statusDot(stock <= Number(r.reorderLevel || 0) ? "danger" : "good", `${stock} ${r.unit || ""}`); } },
    { key: "consumed", label: "الاستهلاك الأسبوعي", type: "number" },
    { key: "reorderLevel", label: "حد إعادة الطلب", type: "number" },
  ];
}

/* ---- المستخدمون: حسابات دخول بصلاحيات محددة، يديرها مالك الشركة ---- */
function userFields() {
  const resourceOptions = (STATE.data.resourcePool || [])
    .filter((r) => r.type === "مدير مشروع" || r.type === "مهندس")
    .map((r) => ({ value: r.id, label: `${r.name} (${r.type})` }));
  return [
    { key: "name", label: "الاسم الكامل", required: true },
    { key: "role", label: "الدور", type: "select", options: ROLES.filter((r) => r !== "مالك الشركة"), required: true },
    { key: "username", label: "اسم المستخدم (لتسجيل الدخول)", required: true },
    { key: "password", label: "كلمة المرور (اتركها فارغة عند التعديل للإبقاء على الحالية)", type: "password", render: () => "••••••••" },
    { key: "linkedResourceId", label: "مرتبط بسجل الموارد (لتحديد مشاريعه المتاحة تلقائياً — لمدير المشروع/مهندس الموقع فقط)",
      type: "select", options: resourceOptions,
      render: (v) => { const r = (STATE.data.resourcePool || []).find((x) => x.id === v); return r ? esc(r.name) : "— (بلا ربط)"; } },
    { key: "status", label: "حالة الحساب", type: "select", options: ["نشط", "معطَّل", "موقوف", "مقفَل", "منتظر التفعيل"],
      render: (v) => statusDot(v === "نشط" || !v ? "good" : v === "منتظر التفعيل" ? "info" : "danger", v || "نشط") },
    { key: "lastLoginAt", label: "آخر تسجيل دخول", showInTable: false, render: (v) => v ? new Date(v).toLocaleString("ar") : "لم يسجّل دخوله بعد" },
  ];
}
/* ---- Master resource pool (managed by المدير العام): project managers, engineers, workers, equipment ---- */
/* ============================================================
   التوثيق الرقمي للعناصر (Digital Twin) — سجل عناصر المشروع وربطها
   بكل ما يخصها من عقود ومهام ووثائق موجودة أصلاً في النظام.
   ============================================================ */
/* ============================================================
   التفتيش الذكي (Smart Inspection) — قائمة فحص + GPS حقيقي + قياسات
   + صور، مع إمكانية إصدار NCR تلقائياً عند الرفض.
   ============================================================ */
const SMART_INSPECTION_CHECKLIST_ITEMS = [
  { key: "checklist_materials", label: "مطابقة المواد للمواصفات المعتمدة" },
  { key: "checklist_installation", label: "سلامة التركيب/التنفيذ" },
  { key: "checklist_dimensions", label: "مطابقة الأبعاد للمخطط" },
  { key: "checklist_housekeeping", label: "نظافة وترتيب الموقع" },
  { key: "checklist_safety", label: "توافر معدات السلامة المطلوبة" },
  { key: "checklist_documentation", label: "توثيق التصاريح والفحوصات المطلوبة" },
];
function smartInspectionFields() {
  const assetOptions = filterByProject(STATE.data.projectAssets || []).map((a) => ({ value: a.id, label: a.name }));
  const checklistOpts = ["ناجح", "فاشل", "غير منطبق"];
  const checklistFields = SMART_INSPECTION_CHECKLIST_ITEMS.map((item) => ({
    key: item.key, label: item.label, type: "select", options: checklistOpts, showInTable: false,
    render: (v) => statusDot(v === "فاشل" ? "danger" : v === "ناجح" ? "good" : "info", v || "—"),
  }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "assetId", label: "العنصر المُفتَّش (اختياري)", type: "select", options: assetOptions, render: (v) => { const a = (STATE.data.projectAssets || []).find((x) => x.id === v); return a ? esc(a.name) : "—"; } },
    { key: "inspectorName", label: "المفتِّش", required: true },
    { key: "inspectionDate", label: "تاريخ التفتيش", type: "date" },
    ...checklistFields,
    { key: "measurement1Label", label: "قياس 1 — الوصف (اختياري)", showInTable: false },
    { key: "measurement1Value", label: "قياس 1 — القيمة", type: "number", showInTable: false },
    { key: "measurement2Label", label: "قياس 2 — الوصف (اختياري)", showInTable: false },
    { key: "measurement2Value", label: "قياس 2 — القيمة", type: "number", showInTable: false },
    { key: "gpsCapture", label: "الموقع الجغرافي لحظة التفتيش", type: "gps", latKey: "gpsLat", lngKey: "gpsLng", accKey: "gpsAccuracy", showInTable: false },
    { key: "photo", label: "صورة رئيسية", type: "photo", showInTable: false },
    { key: "photo2", label: "صورة إضافية (اختياري)", type: "photo", showInTable: false },
    { key: "overallResult", label: "النتيجة الإجمالية", type: "select", options: ["معتمد", "معتمد بملاحظات", "مرفوض"],
      render: (v) => statusDot(v === "معتمد" ? "good" : v === "مرفوض" ? "danger" : "warn", v || "—") },
    { key: "ncrId", label: "رقم NCR الصادر (إن وُجد)", showInTable: false, render: (v) => v ? "✓ صدر NCR مرتبط" : "—" },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}

/* ============================================================
   تقييم أداء المقاولين — يغذّي تصنيف المقاولين في مركز القيادة التنفيذي
   ============================================================ */
function contractorEvaluationFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "contractorName", label: "اسم المقاول", required: true },
    { key: "evaluationDate", label: "تاريخ التقييم", type: "date" },
    { key: "qualityScore", label: "تقييم الجودة (1-5)", type: "number" },
    { key: "scheduleScore", label: "تقييم الالتزام بالجدول الزمني (1-5)", type: "number" },
    { key: "safetyScore", label: "تقييم السلامة (1-5)", type: "number" },
    { key: "cooperationScore", label: "تقييم التعاون والاستجابة (1-5)", type: "number" },
    { key: "evaluatedBy", label: "قيَّمه" },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}
function computeEvaluationOverallScore(ev) {
  const scores = [ev.qualityScore, ev.scheduleScore, ev.safetyScore, ev.cooperationScore].map(Number).filter((n) => !isNaN(n) && n > 0);
  return scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null;
}
function computeContractorRanking(evaluations) {
  const byContractor = {};
  (evaluations || []).forEach((ev) => {
    const key = String(ev.contractorName || "").trim();
    if (!key) return;
    (byContractor[key] = byContractor[key] || []).push(ev);
  });
  return Object.entries(byContractor).map(([name, evs]) => {
    const overallScores = evs.map(computeEvaluationOverallScore).filter((n) => n != null);
    const avgScore = overallScores.length ? overallScores.reduce((s, n) => s + n, 0) / overallScores.length : null;
    return { contractorName: name, evaluationCount: evs.length, avgScore };
  }).sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
}

function projectAssetFields() {
  const assetOptions = filterByProject(STATE.data.projectAssets || []).map((a) => ({ value: a.id, label: a.name }));
  const contractOptions = filterByProject(STATE.data.contracts || []).map((c) => ({ value: c.id, label: c.party }));
  const taskOptions = filterByProject(STATE.data.tasks || []).map((t) => ({ value: t.id, label: t.name }));
  const budgetOptions = filterByProject(STATE.data.budgetItems || []).map((b) => ({ value: b.id, label: b.category }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)), section: "أساسي" },
    { key: "assetCode", label: "رمز العنصر (Asset ID)", required: true, section: "أساسي" },
    { key: "name", label: "اسم العنصر", required: true, section: "أساسي" },
    { key: "assetType", label: "نوع العنصر", type: "select", options: ["خط أنابيب", "معدة", "مبنى/منشأة", "صمام", "محطة ضخ", "لوحة كهربائية", "أخرى"], section: "أساسي" },
    { key: "criticality", label: "درجة الحرجية (Risk-Based Inspection — مبدأ API 580)", type: "select", options: ["حرجة جداً", "مرتفعة", "متوسطة", "منخفضة"],
      render: (v) => statusDot(v === "حرجة جداً" ? "danger" : v === "مرتفعة" ? "warn" : "info", v || "متوسطة"), section: "أساسي" },
    { key: "parentAssetId", label: "العنصر الأصل (تسلسل هرمي، اختياري)", type: "select", options: assetOptions, render: (v) => { const a = (STATE.data.projectAssets || []).find((x) => x.id === v); return a ? esc(a.name) : "—"; }, section: "أساسي" },
    { key: "location", label: "الموقع/المنطقة", section: "أساسي" },
    { key: "assetMapPicker", label: "تحديد موقع العنصر على الخريطة (اختياري)", type: "map", latKey: "lat", lngKey: "lng", showInTable: false, section: "أساسي" },
    { key: "status", label: "الحالة", type: "select", options: ["مخطَّط", "قيد التنفيذ", "منفَّذ", "قيد الصيانة"],
      render: (v) => statusDot(v === "منفَّذ" ? "good" : v === "قيد الصيانة" ? "warn" : "info", v || "مخطَّط"), section: "أساسي" },
    { key: "photo", label: "صورة العنصر", type: "photo", showInTable: false, section: "أساسي" },
    { key: "linkedContractId", label: "العقد المرتبط", type: "select", options: contractOptions, render: (v) => { const c = (STATE.data.contracts || []).find((x) => x.id === v); return c ? esc(c.party) : "—"; }, section: "الجدولة والتكلفة" },
    { key: "linkedTaskId", label: "النشاط المرتبط في الجدول الزمني", type: "select", options: taskOptions, render: (v) => { const t = (STATE.data.tasks || []).find((x) => x.id === v); return t ? esc(t.name) : "—"; }, section: "الجدولة والتكلفة" },
    { key: "linkedBudgetItemId", label: "بند التكلفة المخصَّص لهذا العنصر (5D حقيقي على مستوى العنصر)", type: "select", options: budgetOptions, render: (v) => { const b = (STATE.data.budgetItems || []).find((x) => x.id === v); return b ? esc(b.category) : "—"; }, section: "الجدولة والتكلفة" },
    { key: "supplier", label: "المورِّد", section: "الجدولة والتكلفة" },
    { key: "installDate", label: "تاريخ التركيب/الإنشاء", type: "date", section: "الجدولة والتكلفة" },
    { key: "contractor", label: "المقاول المنفِّذ", section: "الجدولة والتكلفة" },
    { key: "drawingRef", label: "رقم/رابط المخطط الهندسي (اختياري)", section: "BIM وثلاثي الأبعاد" },
    { key: "bimReference", label: "مرجع نموذج BIM (اختياري — رابط أو رقم عنصر خارجي)", section: "BIM وثلاثي الأبعاد" },
    { key: "apsUrn", label: "مُعرِّف نموذج Autodesk Platform Services (URN، لعرضه فعلياً في عارض BIM)", section: "BIM وثلاثي الأبعاد" },
    { key: "dbId", label: "مُعرِّف العنصر داخل النموذج (dbId، لتلوينه حسب حالة الجدول في العرض الرباعي الأبعاد 4D)", type: "number", section: "BIM وثلاثي الأبعاد" },
    { key: "videoRef", label: "رابط فيديو توضيحي (اختياري — الفيديو خارجي، لا يُرفَع هنا لتفادي حدود التخزين المحلي)", section: "BIM وثلاثي الأبعاد" },
    { key: "warrantyProvider", label: "جهة الضمان (بعد التسليم، اختياري)", section: "الضمان والصيانة" },
    { key: "warrantyExpiryDate", label: "تاريخ انتهاء الضمان", type: "date", section: "الضمان والصيانة" },
    { key: "lastMaintenanceDate", label: "تاريخ آخر صيانة", type: "date", section: "الضمان والصيانة" },
    { key: "notes", label: "ملاحظات", type: "textarea", section: "الضمان والصيانة" },
  ];
}
function realityCaptureFields() {
  const assetOptions = filterByProject(STATE.data.projectAssets || []).map((a) => ({ value: a.id, label: a.name }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "assetId", label: "العنصر المرتبط (اختياري)", type: "select", options: assetOptions, render: (v) => { const a = (STATE.data.projectAssets || []).find((x) => x.id === v); return a ? esc(a.name) : "—"; } },
    { key: "captureType", label: "نوع المسح/التوثيق", type: "select", options: ["مسح ليزري LiDAR", "تصوير جوي بالدرون", "كاميرا 360°", "صور ميدانية عادية"] },
    { key: "captureDate", label: "تاريخ الالتقاط", type: "date" },
    { key: "deviceInfo", label: "الجهاز/الخدمة المستخدَمة" },
    { key: "capturedBy", label: "نفَّذ الالتقاط" },
    { key: "externalJobId", label: "مُعرِّف المهمة لدى الخدمة الخارجية (إن وُجد)" },
    { key: "status", label: "حالة المعالجة", type: "select", options: ["بانتظار الرفع", "بانتظار المعالجة الخارجية", "مُعالَج ونتائجه جاهزة", "فشلت المعالجة"],
      render: (v) => statusDot(v === "مُعالَج ونتائجه جاهزة" ? "good" : v === "فشلت المعالجة" ? "danger" : "warn", v || "بانتظار الرفع") },
    { key: "detectedCompletionPct", label: "نسبة الإنجاز المرصودة فعلياً من هذا المسح (%، اختياري)", type: "number", render: (v) => v != null && v !== "" ? `${v}%` : "—" },
    { key: "resultSummary", label: "ملخص النتائج", type: "textarea" },
    { key: "photo", label: "صورة توضيحية/عينة", type: "photo", showInTable: false },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}
function deviationReportFields() {
  const assetOptions = filterByProject(STATE.data.projectAssets || []).map((a) => ({ value: a.id, label: a.name }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "assetId", label: "العنصر المتأثر", type: "select", options: assetOptions, render: (v) => { const a = (STATE.data.projectAssets || []).find((x) => x.id === v); return a ? esc(a.name) : "—"; } },
    { key: "elementId", label: "معرِّف العنصر الدقيق (من نظام مسح خارجي، إن وُجد)" },
    { key: "deviationType", label: "نوع الانحراف", type: "select", options: ["نسبة إنجاز", "بُعد/قياس", "جودة", "تغيير غير معتمَد", "عمل ناقص", "أخرى"] },
    { key: "designValue", label: "القيمة التصميمية/المخطَّطة" },
    { key: "actualValue", label: "القيمة الفعلية المرصودة" },
    { key: "deviationPct", label: "نسبة الانحراف %", type: "number", render: (v) => v != null && v !== "" ? `${v}%` : "—" },
    { key: "location", label: "الموقع الدقيق" },
    { key: "detectedBy", label: "مصدر الرصد" },
    { key: "detectedAt", label: "تاريخ الرصد", type: "date" },
    { key: "photo", label: "صورة", type: "photo", showInTable: false },
    { key: "status", label: "الحالة", type: "select", options: ["مفتوح", "قيد المراجعة", "معالَج", "مرفوض (غير صحيح)"],
      render: (v) => statusDot(v === "معالَج" ? "good" : v === "مرفوض (غير صحيح)" ? "info" : "warn", v || "مفتوح") },
    { key: "resolution", label: "إجراء المعالجة", type: "textarea" },
  ];
}
function arSessionFields() {
  const assetOptions = filterByProject(STATE.data.projectAssets || []).map((a) => ({ value: a.id, label: a.name }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "assetId", label: "العنصر المتعلِّق بالجلسة (اختياري)", type: "select", options: assetOptions, render: (v) => { const a = (STATE.data.projectAssets || []).find((x) => x.id === v); return a ? esc(a.name) : "—"; } },
    { key: "sessionType", label: "نوع الجلسة", type: "select", options: ["تفتيش ميداني (نظارة/تطبيق ذكي)", "مساعدة خبير عن بُعد", "توثيق تصميم بالواقع المعزَّز"] },
    { key: "engineerName", label: "المهندس الميداني" },
    { key: "expertName", label: "الخبير عن بُعد (إن وُجد)" },
    { key: "sessionDate", label: "تاريخ الجلسة", type: "date" },
    { key: "durationMinutes", label: "المدة (دقيقة)", type: "number" },
    { key: "recordingLink", label: "رابط التسجيل (إن وُجد)" },
    { key: "photo", label: "لقطة من الجلسة", type: "photo", showInTable: false },
    { key: "notes", label: "محضر الجلسة/الملاحظات", type: "textarea" },
  ];
}
/* ============================================================
   RealityTwin — جلسات المسح الميداني (LiDAR) والتسجيل الهندسي الحقيقي
   (Horn/RANSAC + ICP) ومقارنة الموديل IFC مع نتيجة المسح. هذا منفصل
   عمداً عن realityCaptures (سجلّ عام يدوي لأي خدمة مسح خارجية) —
   هذا هو مصدر الأدلة الفعلي القادم من تطبيق RealityTwin AI الأصلي
   (iOS LiDAR + محرك التسجيل)، لا إدخال يدوي وصفي. زر "تصدير إلى
   التوثيق الرقمي" في تبويب RealityTwin يغذّي realityCaptures/
   deviationReports تلقائياً من هذه السجلات عبر نفس عقد الاستيراد
   الموثَّق أصلاً (PMS_EXTERNAL_RESULT_SCHEMA_VERSION).
   ============================================================ */
function realityTwinSessionFields() {
  const assetOptions = filterByProject(STATE.data.projectAssets || []).map((a) => ({ value: a.id, label: a.name }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "assetId", label: "العنصر المرتبط (اختياري)", type: "select", options: assetOptions, render: (v) => { const a = (STATE.data.projectAssets || []).find((x) => x.id === v); return a ? esc(a.name) : "—"; } },
    { key: "sessionId", label: "معرِّف جلسة المسح", required: true },
    { key: "capturedAt", label: "تاريخ المسح", type: "date" },
    { key: "deviceModel", label: "الجهاز (آيفون/آيباد)" },
    { key: "pointCount", label: "عدد النقاط الملتقَطة", type: "number", render: (v) => v != null && v !== "" ? Number(v).toLocaleString("en-US") : "—" },
    { key: "controlPointsUsed", label: "نقاط الضبط المستخدَمة (RCP)", type: "number" },
    { key: "algorithmVersion", label: "خوارزمية التسجيل", render: (v) => v || "Horn/RANSAC" },
    { key: "rmsResidualM", label: "دقة التسجيل RMS residual (م)", type: "number", render: (v) => v != null && v !== "" ? `${v} م` : "—" },
    { key: "ifcMaxDeviationMm", label: "أقصى انحراف عن موديل IFC (مم)", type: "number", render: (v) => v != null && v !== "" ? `${v} مم` : "—" },
    { key: "scanVerifiedProgressPct", label: "نسبة الإنجاز الموثَّقة بالمسح (%)", type: "number", render: (v) => v != null && v !== "" ? `${v}%` : "—" },
    { key: "evidenceHash", label: "بصمة الأدلة SHA-256" },
    { key: "status", label: "الحالة", type: "select", options: ["قيد المعالجة", "مسجَّل ومُتحقَّق منه", "فشل التسجيل — تحتاج إعادة مسح"],
      render: (v) => statusDot(v === "مسجَّل ومُتحقَّق منه" ? "good" : v === "فشل التسجيل — تحتاج إعادة مسح" ? "danger" : "warn", v || "قيد المعالجة") },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}
/* ============================================================
   قراءات مستشعرات IoT — تسجيل دوري/يدوي حقيقي، لا بثاً حياً فعلياً
   (البث الحي الحقيقي عبر MQTT/WebSockets يحتاج خادماً مركزياً دائم
   التشغيل، غير ممكن من متصفح واحد بلا اتصال دائم — نفس القيد
   المُفصَّل في خطة الانتقال للمنصة السحابية). هذا سجل حقيقي لقراءات
   تُدخَل دورياً (يدوياً أو باستيراد دفعي من نظام IoT خارجي)، مع
   تنبيهات عتبة حقيقية عند تجاوز الحدود الآمنة.
   ============================================================ */
/* ============================================================
   ملاحظات الإدارة العليا (GM) لمدير المشروع — دورة كاملة: ملاحظة
   بصورة وموعد تنفيذ، رد مدير المشروع بصورة، تشيك ليست تنفيذ حقيقي
   بسبب صريح عند عدم التنفيذ، وربط ترحيل حقيقي للملاحظة التالية.
   ============================================================ */
function gmNoteFields() {
  const isPmIssuer = STATE.user && STATE.user.role === "مدير المشروع";
  const pmOpts = filterByProject(STATE.data.resourcePool || [], true).filter((r) => r.type === "مدير مشروع").map((r) => ({ value: r.id, label: r.name }));
  const engineerOpts = filterByProject(STATE.data.resourcePool || [], true).filter((r) => r.type === "مهندس").map((r) => ({ value: r.id, label: r.name }));
  const taskOpts = filterByProject(STATE.data.tasks || []).map((t) => ({ value: t.id, label: t.name }));
  const fields = [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "title", label: "عنوان الملاحظة", required: true },
    { key: "description", label: "وصف الملاحظة", type: "textarea" },
    { key: "photo", label: isPmIssuer ? "صورة توضيحية (اختياري)" : "صورة توضيحية من الإدارة العليا (اختياري)", type: "photo", showInTable: false },
    { key: "priority", label: "الأهمية", type: "select", options: ["عالية", "متوسطة", "منخفضة"],
      render: (v) => statusDot(v === "عالية" ? "danger" : v === "متوسطة" ? "warn" : "info", v || "متوسطة") },
    { key: "category", label: "التصنيف (اختياري)" },
    { key: "raisedDate", label: "تاريخ الملاحظة", type: "date" },
    { key: "dueDate", label: "يجب التنفيذ خلال (الموعد النهائي)", type: "date", required: true },
    { key: "relatedTaskId", label: "النشاط المرتبط (اختياري)", type: "select", options: taskOpts, render: (v) => { const t = (STATE.data.tasks || []).find((x) => x.id === v); return t ? esc(t.name) : "—"; } },
  ];
  if (isPmIssuer) {
    fields.push({ key: "assignedEngineerResourceId", label: "المهندس المُكلَّف بالرد", type: "select", options: engineerOpts, required: true,
      render: (v) => { const r = (STATE.data.resourcePool || []).find((x) => x.id === v); return r ? esc(r.name) : "—"; } });
  } else {
    fields.push({ key: "assignedPmResourceId", label: "مدير المشروع المُكلَّف بالرد", type: "select", options: pmOpts, required: true,
      render: (v) => { const r = (STATE.data.resourcePool || []).find((x) => x.id === v); return r ? esc(r.name) : "—"; } });
  }
  fields.push(
    { key: "gmComment", label: isPmIssuer ? "تعليق إضافي (اختياري)" : "تعليق إضافي من الإدارة العليا (اختياري)", type: "textarea", showInTable: false },
    { key: "status", label: "حالة سير العمل", showInTable: true,
      render: (v) => { const level = v === "مقبولة ومغلقة" ? "good" : v === "مُعادة للمهندس" || v === "مُعادة لمدير المشروع" ? "danger" : v === "بانتظار مراجعة GM" || v === "بانتظار مراجعة مدير المشروع" ? "warn" : "info"; return statusDot(level, v || "بانتظار الرد"); } },
  );
  return fields;
}
/* ============================================================
   سير عمل الرد الحقيقي GM ← PM ← GM — كل نسخة رد تُحفَظ كاملة في
   responseHistory، لا استبدال للنسخة السابقة. الملاحظة الأصلية
   (title/description/priority/category/dueDate/assignedPmResourceId)
   للقراءة فقط دائماً بعد الإنشاء — لا حقل منها ضمن نموذج الرد إطلاقاً.
   ============================================================ */
function submitPmResponse(noteId, response, actionTaken, completionStatus, evidencePhoto) {
  const note = (STATE.data.gmNotes || []).find((n) => n.id === noteId);
  if (!note) return;
  const isPmToEngineerNote = note.issuerLevel === "PM";
  if (isPmToEngineerNote) {
    const assignedEngineer = (STATE.data.resourcePool || []).find((r) => r.id === note.assignedEngineerResourceId);
    if (!assignedEngineer || !STATE.user || STATE.user.linkedResourceId !== assignedEngineer.id) { alert("فقط المهندس المُكلَّف تحديداً بهذه الملاحظة يمكنه الرد عليها."); return; }
  } else {
    if (!checkPermission("الرد على ملاحظة إدارة عليا (Respond to GM Note)", STATE.user.role)) { alert("دورك الحالي لا يملك صلاحية الرد على ملاحظات الإدارة العليا."); return; }
  }
  if (!response || !response.trim()) { alert("يجب إدخال نص الرد."); return; }
  const versionNumber = (note.responseHistory || []).length + 1;
  const entry = { version: versionNumber, submittedBy: STATE.user.name, submittedDate: todayISO(),
    response: response.trim(), actionTaken: actionTaken || "", completionStatus: completionStatus || "قيد التنفيذ", evidencePhoto: evidencePhoto || "",
    gmDecision: null, gmComment: "", gmDecisionDate: "" };
  const updated = Object.assign({}, note, { responseHistory: [...(note.responseHistory || []), entry], status: isPmToEngineerNote ? "بانتظار مراجعة مدير المشروع" : "بانتظار مراجعة GM", updatedAt: Date.now() });
  STATE.data.gmNotes = STATE.data.gmNotes.map((n) => (n.id === noteId ? updated : n));
  logAudit("update", "gmNotes", noteId, `${STATE.user.name} أرسل رداً (نسخة ${versionNumber}) على ملاحظة: ${note.title}`);
  if (isPmToEngineerNote) {
    if (note.issuedByUserId) createNotification(note.issuedByUserId, "reply", `${STATE.user.name} أرسل رداً على ملاحظتك: ${note.title}`, "gmNote", noteId);
  } else {
    (STATE.data.users || []).filter((u) => u.role === "مدير عام" || u.role === "مالك الشركة").forEach((u) => {
      createNotification(u.id, "reply", `${STATE.user.name} أرسل رداً على ملاحظة: ${note.title}`, "gmNote", noteId);
    });
  }
  if (note.projectId) {
    emitProjectEvent({ projectId: note.projectId, eventType: "GM_NOTE_RESPONSE_SUBMITTED", sourceEntity: "GmNote", sourceEntityId: noteId,
      newState: { version: versionNumber, completionStatus: entry.completionStatus }, severity: "info",
      evidence: [`رد نسخة ${versionNumber} من ${STATE.user.name} على «${note.title}» — الحالة: ${entry.completionStatus}`] });
  }
  saveData(STATE.data);
  renderApp();
}
function gmDecideOnResponse(noteId, decision, comment) {
  const note = (STATE.data.gmNotes || []).find((n) => n.id === noteId);
  if (!note || !note.responseHistory || !note.responseHistory.length) return;
  const isPmToEngineerNote = note.issuerLevel === "PM";
  if (isPmToEngineerNote) {
    if (!STATE.user || STATE.user.id !== note.issuedByUserId) { alert("فقط مدير المشروع الذي أنشأ هذه الملاحظة يمكنه اتخاذ قرار بشأن الرد عليها."); return; }
  } else {
    const requiredPerm = decision === "accepted" ? "قبول رد مدير المشروع (Accept PM Response)" : "رفض رد مدير المشروع (Reject PM Response)";
    if (!checkPermission(requiredPerm, STATE.user.role)) { alert("دورك الحالي لا يملك صلاحية هذا القرار."); return; }
  }
  if (decision === "rejected" && (!comment || !comment.trim())) { alert("يجب إدخال تعليق يوضّح ما يجب تصحيحه عند الرفض."); return; }
  const history = note.responseHistory.slice();
  const lastEntry = Object.assign({}, history[history.length - 1], { gmDecision: decision, gmComment: comment || "", gmDecisionDate: todayISO() });
  history[history.length - 1] = lastEntry;
  const newStatus = decision === "accepted" ? "مقبولة ومغلقة" : (isPmToEngineerNote ? "مُعادة للمهندس" : "مُعادة لمدير المشروع");
  const updated = Object.assign({}, note, { responseHistory: history, status: newStatus, updatedAt: Date.now() });
  STATE.data.gmNotes = STATE.data.gmNotes.map((n) => (n.id === noteId ? updated : n));
  logAudit("update", "gmNotes", noteId, `${STATE.user.name} ${decision === "accepted" ? "قبل" : "رفض"} الرد على ملاحظة: ${note.title}`);
  const assignedResourceId = isPmToEngineerNote ? note.assignedEngineerResourceId : note.assignedPmResourceId;
  const assignedResource = (STATE.data.resourcePool || []).find((r) => r.id === assignedResourceId);
  const assignedUser = assignedResource ? (STATE.data.users || []).find((u) => u.linkedResourceId === assignedResource.id) : null;
  if (assignedUser) createNotification(assignedUser.id, "update", `${decision === "accepted" ? "قُبِل ردّك" : "أُعيدت إليك"} على ملاحظة: ${note.title}`, "gmNote", noteId);
  if (note.projectId) {
    const priorRejections = history.slice(0, -1).filter((h) => h.gmDecision === "rejected").length;
    emitProjectEvent({
      projectId: note.projectId, eventType: decision === "accepted" ? "GM_NOTE_ACCEPTED" : "GM_NOTE_REJECTED", sourceEntity: "GmNote", sourceEntityId: noteId,
      newState: { decision, comment: comment || null }, severity: decision === "rejected" && priorRejections >= 1 ? "danger" : decision === "rejected" ? "warn" : "info",
      evidence: decision === "rejected" ? [`رُفض للمرة ${priorRejections + 1} — «${comment}»${priorRejections >= 1 ? " (رُفض سابقاً أيضاً على هذه الملاحظة تحديداً)" : ""}`] : [`قُبِل الرد على «${note.title}»`],
    });
  }
  saveData(STATE.data);
  renderApp();
  showToast(decision === "accepted" ? "تم قبول الرد بنجاح" : "تم رفض الرد وإعادته لمدير المشروع", decision === "accepted" ? "success" : "info");
}

function deriveGmNoteStatus(note) {
  if (note.carriedToId) return "مُرحَّلة لملاحظة تالية";
  if (note.status === "مقبولة ومغلقة") return "منجزة ومغلقة";
  if (note.status === "مُعادة لمدير المشروع") return "أُعيدت لمدير المشروع للتصحيح";
  if (note.status === "مُعادة للمهندس") return "أُعيدت للمهندس للتصحيح";
  if (note.status === "بانتظار مراجعة GM") return "بانتظار مراجعة الإدارة العليا";
  if (note.status === "بانتظار مراجعة مدير المشروع") return "بانتظار مراجعة مدير المشروع";
  if (note.dueDate && note.dueDate < todayISO()) return "متأخرة عن الموعد";
  return note.issuerLevel === "PM" ? "بانتظار رد المهندس" : "بانتظار رد مدير المشروع";
}

function maintenanceRecordFields() {
  const assetOptions = filterByProject(STATE.data.projectAssets || []).map((a) => ({ value: a.id, label: a.name }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "assetId", label: "العنصر/الأصل", type: "select", options: assetOptions, required: true, render: (v) => { const a = (STATE.data.projectAssets || []).find((x) => x.id === v); return a ? esc(a.name) : "—"; } },
    { key: "maintenanceType", label: "نوع الصيانة", type: "select", options: ["دورية وقائية", "طارئة/إصلاح عطل", "فحص ضمان", "معايرة"] },
    { key: "date", label: "التاريخ", type: "date", required: true },
    { key: "performedBy", label: "من نفَّذ الصيانة" },
    { key: "cost", label: "التكلفة (إن وُجدت)", type: "number", render: (v) => v ? fmtMoney(v) : "—" },
    { key: "description", label: "وصف العمل المُنفَّذ", type: "textarea" },
    { key: "nextDueDate", label: "تاريخ الصيانة القادمة المتوقَّع", type: "date" },
  ];
}
function sensorReadingFields() {
  const assetOptions = filterByProject(STATE.data.projectAssets || []).map((a) => ({ value: a.id, label: a.name }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "assetId", label: "العنصر/المعدة المرتبطة (اختياري)", type: "select", options: assetOptions, render: (v) => { const a = (STATE.data.projectAssets || []).find((x) => x.id === v); return a ? esc(a.name) : "—"; } },
    { key: "sensorType", label: "نوع المستشعر", type: "select", options: ["حرارة", "اهتزاز", "نضج خرسانة", "تتبّع GPS معدات", "بيئي (رطوبة/غبار)", "عدّاد ذكي", "أخرى"] },
    { key: "readingValue", label: "القيمة المقروءة", type: "number", required: true },
    { key: "unit", label: "الوحدة (مثال: °C، Hz، %)" },
    { key: "readingDate", label: "تاريخ ووقت القراءة", type: "date" },
    { key: "thresholdMin", label: "الحد الأدنى الآمن (اختياري)", type: "number" },
    { key: "thresholdMax", label: "الحد الأقصى الآمن (اختياري)", type: "number" },
    { key: "source", label: "مصدر البيانات (يدوي أو اسم نظام IoT خارجي)" },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}
/* ============================================================
   كشف تسارع القراءة (Rate-of-Change Alarm) — تقنية حقيقية ومُثبَّتة
   في أنظمة الرصد الصناعي الفعلية (مثل معايير رصد الاهتزاز والحرارة
   الصناعية)، تكشف مشكلة محتملة قبل تجاوز الحدّ الثابت نفسه — تغيّر
   سريع غير طبيعي بين قراءتين متتاليتين لنفس المستشعر قد يُنذر بعطل
   مبكراً، حتى لو ظلت القيمة نفسها ضمن الحدود "الآمنة" شكلياً.
   ============================================================ */
/* ============================================================
   استخبارات الأسطول عبر كل المشاريع (Fleet-Wide Intelligence) —
   فكرة خارج الصندوق حقيقية: كل تحليل سابق كان محصوراً بمشروع واحد.
   هنا نبحث عبر كل مشاريع المؤسسة معاً: هل نوع معدة أو مورِّد معيَّن
   يُظهر نمط مشاكل متكرراً؟ حماية إحصائية حقيقية: لا "نمط" يُعلَن إلا
   بحد أدنى من العيّنات، لمنع إنذارات كاذبة من عيّنة صغيرة جداً.
   ============================================================ */
/* ============================================================
   تحليل باريتو/ABC للأصول — تقنية إدارة أصول حقيقية ومُثبَّتة
   (مرجعية في معيار ISO 55000)، لا اختراعاً: تحديد "القلّة الحيوية"
   من العناصر المسؤولة عن أغلب المشاكل الفعلية المسجَّلة، لتوجيه
   أولوية الاهتمام والموارد المحدودة نحوها تحديداً.
   ============================================================ */
function computeParetoAnalysis(projectId) {
  const assets = (STATE.data.projectAssets || []).filter((a) => a.projectId === projectId);
  if (!assets.length) return { available: false, reason: "لا عناصر مسجَّلة لهذا المشروع." };
  const withCounts = assets.map((a) => {
    const matchesAsset = (rc) => matchesAssetIdentifier(rc, a);
    const issueCount = (STATE.data.deviationReports || []).filter(matchesAsset).length;
    return { assetId: a.id, assetName: a.name, issueCount };
  }).filter((a) => a.issueCount > 0).sort((a, b) => b.issueCount - a.issueCount);
  const totalIssues = withCounts.reduce((s, a) => s + a.issueCount, 0);
  if (!totalIssues) return { available: false, reason: "لا انحرافات مسجَّلة بعد لهذا المشروع — لا معنى لتحليل باريتو بلا بيانات حقيقية عن مشاكل فعلية." };
  let cumulative = 0;
  const classified = withCounts.map((a) => {
    const cumulativeBeforePct = (cumulative / totalIssues) * 100;
    cumulative += a.issueCount;
    const cumulativePct = (cumulative / totalIssues) * 100;
    // التصنيف المعياري الصحيح: يُحدَّد بموضع الحدّ التراكمي *قبل* هذا العنصر، لا بعده —
    // فالعنصر الذي يُسبِّب تجاوز الحدّ ينتمي للفئة الأدنى (الأهم)، لا لفئة ما بعد تجاوزه
    // (خلل حقيقي وُجد هنا فعلياً: مساهم وحيد يمثّل 100% كان يُصنَّف C خطأً بدل A)
    const abcClass = cumulativeBeforePct < 80 ? "A" : cumulativeBeforePct < 95 ? "B" : "C";
    return Object.assign({}, a, { pctOfTotal: Math.round((a.issueCount / totalIssues) * 1000) / 10, cumulativePct: Math.round(cumulativePct * 10) / 10, abcClass });
  });
  const classACount = classified.filter((a) => a.abcClass === "A").length;
  return { available: true, classified, totalIssues, totalAssetsWithIssues: withCounts.length,
    vitalFewSummary: `${classACount} عنصراً من ${withCounts.length} (${Math.round((classACount/withCounts.length)*100)}%) مسؤولة عن 80% من إجمالي الانحرافات المسجَّلة الفعلية.` };
}
/* ضبط إحصائي للعمليات (SPC) — قواعد Western Electric المعيارية
   الحقيقية في هندسة الجودة الصناعية، لا حدّاً ثابتاً بسيطاً: يكتشف
   انحرافاً إحصائياً ذا دلالة حقيقية (لا نقطة شاذة عابرة) في سلسلة
   قراءات مستشعر واحد عبر الزمن. */
function computeSPCAnalysis(assetId, sensorType) {
  const readings = (STATE.data.sensorReadings || [])
    .filter((r) => r.assetId === assetId && r.sensorType === sensorType && r.readingDate)
    .sort((a, b) => a.readingDate.localeCompare(b.readingDate));
  if (readings.length < 8) return { available: false, reason: `يحتاج 8 قراءات على الأقل لتحليل SPC ذي دلالة إحصائية حقيقية — المتوفر حالياً: ${readings.length}.` };
  const values = readings.map((r) => Number(r.readingValue));
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const last3 = values.slice(-3);
  const last8 = values.slice(-8);
  // قاعدة Western Electric الثانية: نقطتان من آخر 3 نقاط تتجاوزان 2 انحراف معياري على الجانب نفسه
  const beyond2Sigma = last3.filter((v) => Math.abs(v - mean) > 2 * stdDev && Math.sign(v - mean) === Math.sign(last3[last3.length - 1] - mean));
  const rule2Triggered = beyond2Sigma.length >= 2;
  // قاعدة Western Electric الرابعة: 8 نقاط متتالية على نفس جانب المتوسط (انحراف نظامي مستمر، لا عشوائي)
  const rule4Triggered = last8.length === 8 && (last8.every((v) => v > mean) || last8.every((v) => v < mean));
  return { available: true, mean: Math.round(mean * 100) / 100, stdDev: Math.round(stdDev * 100) / 100, sampleSize: values.length,
    rule2Triggered, rule4Triggered, hasSignal: rule2Triggered || rule4Triggered,
    interpretation: rule2Triggered ? "نقطتان من آخر 3 قراءات تجاوزتا حدّي انحرافين معياريين على الجانب نفسه — انحراف إحصائي ذو دلالة حقيقية، لا تذبذباً عشوائياً."
      : rule4Triggered ? "آخر 8 قراءات متتالية كلها على نفس جانب المتوسط التاريخي — انحراف نظامي مستمر يستدعي مراجعة، لا تصحيحاً ذاتياً متوقَّعاً."
      : "القراءات ضمن التذبذب الطبيعي المتوقَّع إحصائياً — لا إشارة انحراف حقيقية حالياً." };
}

function computeFleetWidePatterns(minSampleSize) {
  const minSample = minSampleSize || 3;
  const scope = getUserScopedProjectIds();
  // نطاق حقيقي: مدير مشروع لا يجوز أن يرى اسم مورِّد أو نوع عنصر خاصاً بمشروع آخر لا يديره إطلاقاً —
  // هذا يبقى استخباراً حقيقياً عبر المحفظة الكاملة فقط للأدوار غير المُقيَّدة (GM/المالك)، لا كل الأدوار
  const allAssets = (STATE.data.projectAssets || []).filter((a) => !scope || scope.has(a.projectId));
  if (allAssets.length < minSample) return { available: false, reason: `عدد العناصر الإجمالي (${allAssets.length}) أقل من الحدّ الأدنى للعيّنة الموثوقة إحصائياً (${minSample}) — لا نمط يُعلَن بثقة بعد.` };
  const hasIssue = (asset) => (STATE.data.deviationReports || []).some((rc) => matchesAssetIdentifier(rc, asset));
  const overallIssueRate = allAssets.filter(hasIssue).length / allAssets.length;
  const groupBy = (keyFn, groupLabel) => {
    const groups = {};
    allAssets.forEach((a) => { const key = keyFn(a); if (!key) return; (groups[key] = groups[key] || []).push(a); });
    return Object.entries(groups)
      .filter(([, assets]) => assets.length >= minSample)
      .map(([key, assets]) => {
        const withIssues = assets.filter(hasIssue).length;
        const rate = withIssues / assets.length;
        const projectsInvolved = new Set(assets.map((a) => a.projectId)).size;
        return { groupLabel, key, sampleSize: assets.length, projectsInvolved, issueRate: rate, withIssues,
          significantlyWorse: rate > overallIssueRate * 1.5 && rate > 0.3 }; // شرطان معاً: أعلى من المتوسط بوضوح، وليس نسبة تافهة صغيرة
      })
      .filter((g) => g.significantlyWorse)
      .sort((a, b) => b.issueRate - a.issueRate);
  };
  const byType = groupBy((a) => a.assetType, "نوع العنصر");
  const bySupplier = groupBy((a) => a.supplier, "المورِّد");
  return { available: true, overallIssueRate, patterns: [...byType, ...bySupplier], totalAssetsAnalyzed: allAssets.length };
}
/* توقّع تجاوز عتبة حرجة — امتداد أمين لاتجاه الصحة الطولي المُحتسَب
   فعلياً: استقراء خطي بسيط، لا نموذج تعلّم آلي، ومُصنَّف صراحةً
   PREDICTION لا FACT — تمييز التصنيفات هذا مطلوب دائماً في هذا النظام. */
function computePredictiveThresholdProjection(assetId, criticalDeviationCount) {
  const threshold = criticalDeviationCount || 5;
  const trend = computeAssetHealthTrend(assetId);
  if (!trend.available || trend.timeline.length < 2) return { available: false, reason: "يحتاج اتجاهاً طولياً حقيقياً بمسحين على الأقل." };
  const first = trend.timeline[0], last = trend.timeline[trend.timeline.length - 1];
  const daysElapsed = daysBetween(first.date, last.date);
  if (daysElapsed <= 0 || trend.deviationTrend <= 0) return { available: false, reason: "لا اتجاه تصاعدي حقيقي حالياً لاستقرائه — الاتجاه مستقر أو متحسِّن." };
  const ratePerDay = trend.deviationTrend / daysElapsed;
  const currentCount = last.deviationCount;
  if (currentCount >= threshold) return { available: true, alreadyCrossed: true, currentCount, threshold };
  const daysToThreshold = Math.ceil((threshold - currentCount) / ratePerDay);
  const projectedDate = addDays(todayISO(), daysToThreshold);
  return { available: true, alreadyCrossed: false, currentCount, threshold, daysToThreshold, projectedDate,
    label: "PREDICTION", caveat: "استقراء خطي بسيط من الاتجاه الحالي فقط — ليس ضماناً، والمعدل الفعلي قد يتغيّر بتدخّل صيانة أو ظروف مختلفة." };
}

function computeSensorRateOfChangeAlert(reading, allReadings) {
  const sameSensor = (allReadings || []).filter((r) =>
    r.id !== reading.id && r.assetId === reading.assetId && r.sensorType === reading.sensorType && r.readingDate && reading.readingDate);
  if (!sameSensor.length) return { available: false, reason: "لا توجد قراءة سابقة لنفس المستشعر على هذا العنصر للمقارنة." };
  const priorReadings = sameSensor.filter((r) => r.readingDate < reading.readingDate).sort((a, b) => b.readingDate.localeCompare(a.readingDate));
  if (!priorReadings.length) return { available: false, reason: "هذه أقدم قراءة مسجَّلة لهذا المستشعر — لا مرجع سابق للمقارنة." };
  const prior = priorReadings[0];
  const daysBetweenReadings = Math.max(1, daysBetween(prior.readingDate, reading.readingDate));
  const valueDelta = Number(reading.readingValue) - Number(prior.readingValue);
  const ratePerDay = valueDelta / daysBetweenReadings;
  // عتبة تسارع نسبية: تغيّر يتجاوز 40% من القيمة السابقة نفسها في يوم واحد يُعدّ تسارعاً غير طبيعي إحصائياً لمعظم المستشعرات الصناعية
  const priorMagnitude = Math.max(1, Math.abs(Number(prior.readingValue)));
  const relativeRatePct = (Math.abs(ratePerDay) / priorMagnitude) * 100;
  const isAbnormalRate = relativeRatePct > 40;
  return {
    available: true, priorValue: Number(prior.readingValue), priorDate: prior.readingDate, currentValue: Number(reading.readingValue),
    valueDelta, daysBetweenReadings, ratePerDay, relativeRatePct: Math.round(relativeRatePct),
    isAbnormalRate, direction: valueDelta > 0 ? "صاعد" : "نازل",
  };
}
/* اتجاه صحّة العنصر عبر الزمن — لا لقطة واحدة، بل تتبّع طولي حقيقي
   لعدد الانحرافات المسجَّلة عبر مسوحات متعاقبة فعلية لهذا العنصر
   تحديداً، لاكتشاف تدهور تدريجي قبل أن يتحوّل لأزمة واضحة. */
/* ============================================================
   الخيط الرقمي (Digital Thread) — مفهوم بحثي مُميَّز عن "التوأم
   الرقمي" نفسه: التوأم يُحاكي حالة العنصر الحالية، بينما الخيط
   يُقدِّم تتبّعاً موحَّداً كاملاً عبر الزمن ("سلك يربط كل مراحل حياة
   العنصر" — الأدبيات). حالياً بيانات عنصر واحد مُبعثَرة عبر مجموعات
   منفصلة (تحوّلات حالة، مسوحات، انحرافات، قراءات مستشعر) بلا سرد
   زمني واحد يربطها. هذا يبنيه فعلياً: خط زمني واحد حقيقي، لا محاكاة.
   ============================================================ */
function computeAssetDigitalThread(assetId) {
  const asset = (STATE.data.projectAssets || []).find((a) => a.id === assetId);
  if (!asset) return { available: false, reason: "العنصر غير موجود." };
  const events = [];

  events.push({ date: asset.installDate || todayISO(), type: "إنشاء", icon: "🆕", source: "سجل العناصر", text: `تسجيل العنصر «${asset.name}» في سجل التوثيق الرقمي.`, actor: asset.createdBy || null });

  (STATE.data.twinStateHistory || []).filter((h) => h.assetId === assetId).forEach((h) => {
    events.push({ date: new Date(h.timestamp).toISOString().slice(0, 10), type: "تغيّر حالة", icon: "🔄", source: "محرك الحالة", text: `تغيّرت الحالة من «${h.previousState || "—"}» إلى «${h.newState}».`, actor: null });
  });

  const matchesAsset = (rc) => matchesAssetIdentifier(rc, asset);
  (STATE.data.realityCaptures || []).filter(matchesAsset).forEach((c) => {
    events.push({ date: c.captureDate || todayISO(), type: "مسح واقعي", icon: "📷", source: `مسح (${c.captureType || "غير محدَّد"})`, text: `مسح فعلي${c.detectedCompletionPct != null ? ` — نسبة إنجاز مكتشَفة ${c.detectedCompletionPct}%` : ""}.`, actor: c.capturedBy || null });
  });

  (STATE.data.deviationReports || []).filter(matchesAsset).forEach((d) => {
    events.push({ date: d.detectedAt || todayISO(), type: "انحراف", icon: "⚠", source: d.detectedBy || "تقرير انحراف", text: `انحراف «${d.deviationType || "غير محدَّد"}»${d.deviationPct ? ` بنسبة ${d.deviationPct}%` : ""} — الحالة: ${d.status || "مفتوح"}.`, actor: null });
  });

  if (asset.linkedTaskId) {
    const task = (STATE.data.tasks || []).find((t) => t.id === asset.linkedTaskId);
    if (task) events.push({ date: task.start || todayISO(), type: "ربط نشاط", icon: "🔗", source: "الجدول الزمني", text: `مرتبط بالنشاط «${task.name}» (إنجاز حالي ${task.completion || 0}%).`, actor: null });
  }

  (STATE.data.sensorReadings || []).filter((r) => r.assetId === assetId).forEach((r) => {
    const level = deriveSensorAlertLevel(r);
    if (level === "danger") events.push({ date: r.readingDate || todayISO(), type: "تنبيه مستشعر", icon: "📟", source: `مستشعر ${r.sensorType || ""}`, text: `قراءة تجاوزت الحدّ الآمن: ${r.readingValue}.`, actor: null });
  });

  events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return { available: true, assetName: asset.name, eventCount: events.length, events,
    sourceCollections: Array.from(new Set(events.map((e) => e.type))) };
}

function computeAssetHealthTrend(assetId) {
  const asset = (STATE.data.projectAssets || []).find((a) => a.id === assetId);
  if (!asset) return { available: false };
  const matchesAsset = (rc) => matchesAssetIdentifier(rc, asset);
  const captures = (STATE.data.realityCaptures || []).filter(matchesAsset).sort((a, b) => (a.captureDate || "").localeCompare(b.captureDate || ""));
  if (captures.length < 2) return { available: false, reason: "يحتاج مسحين على الأقل بتوقيتين مختلفين لرصد اتجاه حقيقي — مسح واحد فقط لا يكفي لأي اتجاه." };
  const deviations = (STATE.data.deviationReports || []).filter(matchesAsset);
  const timeline = captures.map((cap) => {
    const devCountUpToThisCapture = deviations.filter((d) => d.detectedAt && d.detectedAt <= cap.captureDate).length;
    return { date: cap.captureDate, deviationCount: devCountUpToThisCapture, completionPct: cap.detectedCompletionPct };
  });
  const first = timeline[0], last = timeline[timeline.length - 1];
  const deviationTrend = last.deviationCount - first.deviationCount;
  const trendDirection = deviationTrend > 0 ? "متدهور" : deviationTrend < 0 ? "متحسِّن" : "مستقر";
  return { available: true, timeline, deviationTrend, trendDirection, scanCount: captures.length, firstDate: first.date, lastDate: last.date };
}

function deriveSensorAlertLevel(reading) {
  const v = Number(reading.readingValue);
  const min = reading.thresholdMin !== "" && reading.thresholdMin != null ? Number(reading.thresholdMin) : null;
  const max = reading.thresholdMax !== "" && reading.thresholdMax != null ? Number(reading.thresholdMax) : null;
  if ((min != null && v < min) || (max != null && v > max)) return "danger";
  return "good";
}

function aiAnalysisResultFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "source", label: "مصدر التحليل (اسم الخدمة الخارجية)" },
    { key: "analysisType", label: "نوع التحليل", type: "select", options: ["مخالفة معدات حماية شخصية PPE", "تقدّم تنفيذ من الصور/الفيديو", "مشكلة جودة مرصودة بصرياً", "نشاط غير آمن مرصود"] },
    { key: "resultSummary", label: "ملخص النتيجة", type: "textarea" },
    { key: "confidencePct", label: "نسبة الثقة % (إن توفَّرت)", type: "number", render: (v) => v != null && v !== "" ? `${v}%` : "—" },
    { key: "receivedAt", label: "تاريخ الاستلام", type: "date" },
    { key: "photo", label: "الصورة/اللقطة المرتبطة", type: "photo", showInTable: false },
    { key: "status", label: "الحالة", type: "select", options: ["جديد", "تمت المراجعة", "تم اتخاذ إجراء", "مرفوض"],
      render: (v) => statusDot(v === "تم اتخاذ إجراء" ? "good" : v === "مرفوض" ? "info" : "warn", v || "جديد") },
  ];
}

function resourcePoolFields() {
  const role = STATE.user && STATE.user.role;
  const isPM = role === "مدير المشروع";
  const isGM = role === "مدير عام" || role === "مالك الشركة";
  const category = STATE.modal && STATE.modal.values ? STATE.modal.values.category : null;
  const typeOptionsByCategory = {
    "موارد بشرية": isPM ? ["عامل", "مهندس", "موظف آخر"] : ["مدير مشروع", "مهندس", "عامل", "موظف آخر"],
    "مواد": ["مادة خام", "مادة استهلاكية", "مادة أخرى"],
    "معدات": ["معدة ثقيلة", "مركبة", "آلة", "أداة", "معدة أخرى"],
  };
  const currentCategory = category || "موارد بشرية";
  const isHuman = currentCategory === "موارد بشرية";
  const isMaterialOrEquipment = !isHuman;
  const fields = [
    { key: "category", label: "الفئة", type: "select", options: ["موارد بشرية", "مواد", "معدات"], required: true },
    { key: "name", label: isHuman ? "الاسم" : "اسم العنصر", required: true },
    { key: "type", label: "النوع / التصنيف", type: "select", options: typeOptionsByCategory[currentCategory] || typeOptionsByCategory["موارد بشرية"], required: true },
    { key: "specialty", label: isHuman ? "التخصص" : "المواصفة / الموديل" },
  ];
  if (isHuman) fields.push({ key: "phone", label: "رقم الهاتف" });
  if (isMaterialOrEquipment) {
    fields.push(
      { key: "quantity", label: "الكمية", type: "number" },
      { key: "unit", label: "الوحدة (طن، متر، قطعة، يوم...)" },
    );
  }
  fields.push(
    { key: "dailyRate", label: isHuman ? "السعر اليومي" : "سعر الوحدة / التكلفة", type: "number", showInTable: true,
      render: (v, row) => {
        if (isPM && (row.type === "مدير مشروع" || row.type === "مهندس")) return "—";
        return v ? fmtMoney(v) : "—";
      } },
    { key: "status", label: "الحالة", type: "select", options: ["متاح", "معيّن", "قيد الصيانة", "غير متاح"],
      render: (v) => statusDot(v === "معيّن" ? "warn" : (v === "قيد الصيانة" || v === "غير متاح") ? "danger" : "good", v || "متاح") },
  );
  if (isHuman) {
    fields.push(
      { key: "assignedProjectIds", label: "المشاريع المُكلَّف بها (يمكن أكثر من مشروع في نفس الوقت)", type: "multiselect", options: projectOptions(),
        render: (v, row) => { const ids = getResourceProjectIds(row); return ids.length ? ids.map((id) => esc(projName(id))).join("، ") : "—"; } },
    );
  } else {
    fields.push(
      { key: "assignedProjectId", label: "المشروع الحالي (فارغ = في المخزن الرئيسي)", type: "select", options: projectOptions(),
        render: (v) => v ? esc(projName(v)) : "📦 المخزن الرئيسي" },
      { key: "transferDate", label: "تاريخ آخر انتقال فعلي إلى هذا المشروع", type: "date", showInTable: false },
    );
  }
  fields.push(
    { key: "allocationStartDate", label: "تاريخ بداية التخصيص", type: "date", showInTable: false },
    { key: "allocationEndDate", label: "تاريخ نهاية التخصيص", type: "date", showInTable: false },
  );
  if (isMaterialOrEquipment) {
    fields.push(
      { key: "responsiblePersonId", label: "الشخص المسؤول عن هذا العنصر", type: "select", options: filterByProject(STATE.data.resourcePool || [], true).filter((r) => r.category === "موارد بشرية" || !r.category).map((r) => ({ value: r.id, label: r.name })), showInTable: false,
        render: (v) => { const r = (STATE.data.resourcePool || []).find((x) => x.id === v); return r ? esc(r.name) : "—"; } },
    );
  }
  if (isGM) {
    fields.push(
      { key: "_loginUsername", label: "اسم مستخدم لتسجيل الدخول (فقط لمدير مشروع/مهندس — اتركه فارغاً غير ذلك)", showInTable: false },
      { key: "_loginPassword", label: "كلمة مرور (اتركها فارغة إن كنت لا تريد إنشاء/تغيير حساب دخول الآن)", type: "password", showInTable: false }
    );
  }
  return fields;
}

/* ---- العهد والسُلف: مدير المشروع يستلم العهدة ويقدّم الفواتير المطابقة لها ---- */
function custodyFields() {
  const topLevelInProject = filterByProject(STATE.data.custodies || []).filter((c) => !c.parentCustodyId);
  const parentOptions = topLevelInProject.map((c) => ({ value: c.id, label: `عهدة رقم ${c.number} — ${getCustodianName(c)} (${c.custodyType === "نقدية (مصاريف تشغيلية)" || !c.custodyType ? fmtMoney(c.amount) : c.itemDescription}, ${projName(c.projectId)})` }));
  const custodianOptions = filterByProject(STATE.data.resourcePool || [], true).map((r) => ({ value: r.id, label: `${r.name} (${r.type})` }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "custodyType", label: "نوع العهدة", type: "select", required: true,
      options: ["نقدية (مصاريف تشغيلية)", "معدات/أدوات", "بطاقة وقود", "جهاز/هاتف", "أخرى"],
      render: (v) => esc(v || "نقدية (مصاريف تشغيلية)") },
    { key: "parentCustodyId", label: "عهدة أصلية (اتركه فارغاً إن كانت عهدة مباشرة من المحاسب)", type: "select", options: parentOptions,
      render: (v) => { const p = (STATE.data.custodies || []).find((c) => c.id === v); return p ? `فرعية من عهدة ${p.number}` : "عهدة أصلية"; } },
    { key: "amount", label: "المبلغ (للعهد النقدية فقط)", type: "number", render: (v) => v ? fmtMoney(v) : "—" },
    { key: "itemDescription", label: "وصف العنصر (للمعدات/الأجهزة/بطاقات الوقود)" },
    { key: "custodianResourceId", label: "مستلم العهدة (من سجل الموارد)", type: "select", options: custodianOptions, required: true,
      render: (v) => { const r = (STATE.data.resourcePool || []).find((x) => x.id === v); return r ? esc(r.name) : "—"; } },
    { key: "dateReceived", label: "تاريخ الاستلام", type: "date" },
    { key: "expectedReturnDate", label: "تاريخ الإعادة المتوقَّع (للعناصر غير النقدية، اختياري)", type: "date" },
    { key: "actualReturnDate", label: "تاريخ الإعادة الفعلي (عند استلامها مجدداً)", type: "date" },
    { key: "returnCondition", label: "حالة الإعادة", type: "select", options: ["سليم", "به عطل/تلف", "مفقود"] },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}
function isCashCustody(custody) { return !custody.custodyType || custody.custodyType === "نقدية (مصاريف تشغيلية)"; }
function getCustodianName(custody) {
  if (custody.custodianResourceId) {
    const r = (STATE.data.resourcePool || []).find((x) => x.id === custody.custodianResourceId);
    if (r) return r.name;
  }
  return custody.custodian || "—"; // توافق مع سجلات قديمة أُنشئت قبل ربط العهدة بسجل الموارد
}
function deriveCustodyStatus(custody) {
  if (!isCashCustody(custody)) {
    if (custody.actualReturnDate) return custody.returnCondition === "مفقود" ? "مفقودة" : custody.returnCondition === "به عطل/تلف" ? "أُعيدت (بها عطل)" : "أُعيدت سليمة";
    if (custody.expectedReturnDate && todayISO() > custody.expectedReturnDate) return "متأخرة عن الإعادة";
    return "قائمة (بحوزة المستلم)";
  }
  return custody.reconciled ? "مطابَقة ومعتمدة" : "قيد المتابعة";
}

/* ---- مستخلصات المالك (Owner Payment Certificates) — دورة عمل كاملة مرتبطة بالسيولة ---- */
function certificateFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "number", label: "رقم المستخلص", required: true },
    { key: "periodFrom", label: "الفترة من", type: "date" },
    { key: "periodTo", label: "الفترة إلى", type: "date" },
    { key: "cumulativeCompletionPercent", label: "نسبة الإنجاز التراكمية وقت المستخلص %", type: "number", render: (v) => v ? `${v}%` : "—" },
    { key: "grossValueCumulative", label: "القيمة الإجمالية التراكمية للأعمال المنفذة", type: "number", required: true, render: (v) => fmtMoney(v) },
    { key: "previousCertifiedCumulative", label: "المستخلص سابقاً (تراكمي)", type: "number", render: (v) => fmtMoney(v || 0) },
    { key: "retentionPercent", label: "نسبة المحتجز %", type: "number", render: (v) => `${v || 0}%` },
    { key: "advanceRecoveryAmount", label: "استرداد دفعة مقدمة (إن وجدت)", type: "number", render: (v) => fmtMoney(v || 0) },
    { key: "stage", label: "مرحلة دورة العمل", type: "select", options: CERTIFICATE_STAGES,
      render: (v) => statusDot(v === "محصَّل بالكامل" ? "good" : v === "مرفوض/معاد للتعديل" ? "danger" : v === "معتمد (بانتظار الصرف)" ? "warn" : "info", v || "مسودة") },
    { key: "submittedDate", label: "تاريخ التقديم للمالك", type: "date" },
    { key: "approvedDate", label: "تاريخ اعتماد المالك", type: "date" },
    { key: "approvedAmount", label: "المبلغ المعتمد فعلياً من المالك", type: "number", render: (v) => v != null && v !== "" ? fmtMoney(v) : "—" },
    { key: "paidAmount", label: "المبلغ المحصَّل فعلياً", type: "number", render: (v) => fmtMoney(v || 0) },
    { key: "bankAccountId", label: "الحساب البنكي (أي حساب استُلِم فيه التحصيل)", type: "select",
      options: (STATE.data.bankAccounts || []).map((b) => ({ value: b.id, label: b.name })),
      render: (v) => { const b = (STATE.data.bankAccounts || []).find((x) => x.id === v); return b ? esc(b.name) : "—"; }, showInTable: false },
    { key: "paidDate", label: "تاريخ التحصيل", type: "date" },
    { key: "notes", label: "ملاحظات", type: "textarea" },
    { key: "attachment", label: "صورة/مستند المستخلص", type: "photo", showInTable: false },
    { key: "approvalSignature", label: "توقيع الاعتماد (بصري)", type: "signature", showInTable: false },
  ];
}

/* ---- مستخلصات المقاولين من الباطن — نحن الجهة المُراجِعة والمُعتمِدة والدافعة، عكس مستخلصات المالك ---- */
function subcontractorCertFields() {
  const subcontractorOptions = filterByProject(STATE.data.contracts || []).filter((c) => c.type === "مقاول فرعي").map((c) => ({ value: c.party, label: c.party }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "subcontractorParty", label: "المقاول من الباطن", type: subcontractorOptions.length ? "select" : undefined, options: subcontractorOptions, required: true },
    { key: "number", label: "رقم مستخلص المقاول", required: true },
    { key: "periodFrom", label: "الفترة من", type: "date" },
    { key: "periodTo", label: "الفترة إلى", type: "date" },
    { key: "cumulativeCompletionPercent", label: "نسبة الإنجاز التراكمية وقت المستخلص %", type: "number", render: (v) => v ? `${v}%` : "—" },
    { key: "grossValueCumulative", label: "القيمة الإجمالية التراكمية للأعمال المنفذة (وفق عقد الباطن)", type: "number", required: true, render: (v) => fmtMoney(v) },
    { key: "previousCertifiedCumulative", label: "المستخلص سابقاً (تراكمي)", type: "number", render: (v) => fmtMoney(v || 0) },
    { key: "retentionPercent", label: "نسبة المحتجز % (من المقاول)", type: "number", render: (v) => `${v || 0}%` },
    { key: "advanceRecoveryAmount", label: "استرداد دفعة مقدمة قدَّمناها للمقاول (إن وجدت)", type: "number", render: (v) => fmtMoney(v || 0) },
    { key: "stage", label: "مرحلة دورة العمل", type: "select", options: SUBCONTRACTOR_CERT_STAGES,
      render: (v) => statusDot(v === "مدفوع" ? "good" : v === "مرفوض/معاد للمقاول" ? "danger" : v === "معتمد للصرف" ? "warn" : "info", v || "مُقدَّم من المقاول") },
    { key: "submittedDate", label: "تاريخ التقديم من المقاول", type: "date" },
    { key: "reviewedDate", label: "تاريخ المراجعة الفنية", type: "date" },
    { key: "approvedAmount", label: "المبلغ المعتمد فعلياً للصرف", type: "number", render: (v) => v != null && v !== "" ? fmtMoney(v) : "—" },
    { key: "paidAmount", label: "المبلغ المدفوع فعلياً للمقاول", type: "number", render: (v) => fmtMoney(v || 0) },
    { key: "bankAccountId", label: "الحساب البنكي (أي حساب صُرِف منه)", type: "select",
      options: (STATE.data.bankAccounts || []).map((b) => ({ value: b.id, label: b.name })),
      render: (v) => { const b = (STATE.data.bankAccounts || []).find((x) => x.id === v); return b ? esc(b.name) : "—"; }, showInTable: false },
    { key: "paidDate", label: "تاريخ الصرف", type: "date" },
    { key: "notes", label: "ملاحظات", type: "textarea" },
    { key: "attachment", label: "صورة/مستند مستخلص المقاول", type: "photo", showInTable: false },
  ];
}

/* ---- سجل المطالبات (Claims) — تمديد مدة و/أو تعويض مالي، منفصل عن أوامر التغيير المعتمدة سلفاً ---- */
function claimFields() {
  const contractOptions = filterByProject(STATE.data.contracts || []).map((c) => ({ value: c.id, label: `${c.party} (${c.type || "—"}, ${projName(c.projectId)})` }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "contractId", label: "العقد المرتبط", type: "select", options: contractOptions, required: true,
      render: (v) => { const c = (STATE.data.contracts || []).find((x) => x.id === v); return c ? esc(c.party) : "—"; } },
    { key: "claimNumber", label: "رقم المطالبة", required: true },
    { key: "type", label: "نوع المطالبة", type: "select", options: ["تمديد مدة", "تعويض مالي", "تمديد مدة وتعويض مالي"] },
    { key: "reason", label: "سبب المطالبة", type: "textarea", required: true },
    { key: "dateRaised", label: "تاريخ رفع المطالبة", type: "date" },
    { key: "daysClaimed", label: "أيام التمديد المطالَب بها", type: "number", render: (v) => v ? `${v} يوم` : "—" },
    { key: "amountClaimed", label: "المبلغ المطالَب به", type: "number", render: (v) => v ? fmtMoney(v) : "—" },
    { key: "status", label: "الحالة", type: "select", options: ["مُقدَّمة", "قيد التفاوض", "معتمدة جزئياً", "معتمدة كاملة", "مرفوضة"],
      render: (v) => statusDot(v === "معتمدة كاملة" ? "good" : v === "مرفوضة" ? "danger" : v === "معتمدة جزئياً" ? "warn" : "info", v || "مُقدَّمة") },
    { key: "daysApproved", label: "أيام التمديد المعتمدة", type: "number", render: (v) => v ? `${v} يوم` : "—" },
    { key: "amountApproved", label: "المبلغ المعتمد", type: "number", render: (v) => v ? fmtMoney(v) : "—" },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}

/* ---- المراسلات (Correspondence Log) — وارد/صادر مع المالك والاستشاري والجهات الحكومية ---- */
function correspondenceFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "direction", label: "الاتجاه", type: "select", options: ["وارد", "صادر"],
      render: (v) => statusDot(v === "وارد" ? "info" : "warn", v || "—") },
    { key: "refNumber", label: "الرقم المرجعي", required: true },
    { key: "subject", label: "الموضوع", required: true },
    { key: "fromParty", label: "من" },
    { key: "toParty", label: "إلى" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "priority", label: "الأولوية", type: "select", options: ["عادية", "عاجلة"],
      render: (v) => v === "عاجلة" ? statusDot("danger", "عاجلة") : "عادية" },
    { key: "status", label: "الحالة", type: "select", options: ["مفتوحة (تحتاج رد)", "تم الرد", "للعلم فقط", "مغلقة"],
      render: (v) => statusDot(v === "مفتوحة (تحتاج رد)" ? "warn" : v === "مغلقة" ? "good" : "info", v || "مفتوحة (تحتاج رد)") },
    { key: "notes", label: "ملاحظات", type: "textarea" },
    { key: "attachment", label: "صورة/مستند المراسلة", type: "photo", showInTable: false },
  ];
}

/* ---- الاجتماعات ---- */
function projectNoteFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "text", label: "الملاحظة", type: "textarea", required: true },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "source", label: "المصدر (يدوي أو من تحليل نقاش)" },
    { key: "completed", label: "منجزة؟", type: "select", options: ["لا", "نعم"], render: (v) => statusDot(v === "نعم" ? "good" : "warn", v === "نعم" ? "منجزة" : "قيد المتابعة") },
    { key: "completedDate", label: "تاريخ الإنجاز", type: "date" },
  ];
}

function meetingFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "title", label: "عنوان الاجتماع", required: true },
    { key: "meetingType", label: "نوع الاجتماع", type: "select", options: ["اجتماع تنسيق", "اجتماع فني", "اجتماع مع المالك", "اجتماع سلامة HSE", "أخرى"] },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "attendees", label: "الحضور" },
    { key: "agenda", label: "جدول الأعمال", type: "textarea", showInTable: false },
    { key: "minutesSummary", label: "ملخص محضر الاجتماع", type: "textarea" },
    { key: "attachment", label: "محضر الاجتماع (صورة/مستند موقَّع)", type: "photo", showInTable: false },
  ];
}

/* ---- القرارات وبنود المتابعة (Action Items) — مرتبطة باجتماع محدد، بحالة تُشتق تلقائياً كالمهام ---- */
function decisionFields() {
  const mOpts = filterByProject(STATE.data.meetings || []).map((m) => ({ value: m.id, label: `${m.title} — ${m.date || ""}` }));
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "meetingId", label: "الاجتماع المرتبط", type: "select", options: mOpts, render: (v) => {
      const m = (STATE.data.meetings || []).find((x) => x.id === v);
      return m ? esc(m.title) : "—";
    } },
    { key: "decisionText", label: "نص القرار / بند المتابعة", type: "textarea", required: true },
    { key: "owner", label: "المسؤول عن التنفيذ" },
    { key: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["مفتوحة", "منجزة"],
      render: (v, row) => { const s = deriveDecisionStatus(row); return statusDot(s === "منجزة" ? "good" : s === "متأخرة" ? "danger" : "warn", s); } },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}

/* ---- قائمة الملاحظات والتسليم (Punch List / Snagging) — تفتيش ما قبل التسليم النهائي أو الجزئي ---- */
function punchlistFields() {
  const isEngineer = STATE.user && STATE.user.role === "مهندس الموقع";
  const fields = [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "itemNumber", label: "رقم البند", required: true },
    { key: "location", label: "الموقع/المنطقة" },
    { key: "category", label: "التخصص", type: "select", options: ["معماري", "كهرباء", "ميكانيكا", "سباكة", "تشطيبات", "عزل", "أخرى"] },
    { key: "description", label: "وصف الملاحظة", type: "textarea", required: true },
    { key: "severity", label: "درجة الخطورة", type: "select", options: ["بسيطة", "متوسطة", "حرجة"],
      render: (v) => statusDot(v === "حرجة" ? "danger" : v === "متوسطة" ? "warn" : "good", v || "بسيطة") },
    { key: "raisedBy", label: "لوحظت بواسطة" },
    { key: "dateRaised", label: "تاريخ الملاحظة", type: "date" },
    { key: "responsibleParty", label: "الجهة المسؤولة عن المعالجة" },
    { key: "targetCloseDate", label: "تاريخ الإغلاق المستهدف", type: "date" },
    { key: "photoBefore", label: "صورة قبل المعالجة", type: "photo", showInTable: false },
  ];
  if (isEngineer) {
    fields.push(
      { key: "correctiveAction", label: "الإجراء التصحيحي المتخذ (يدخله المهندس المشرف)", type: "textarea" },
      { key: "photoAfter", label: "صورة بعد المعالجة", type: "photo", showInTable: false }
    );
  }
  fields.push(
    { key: "notes", label: "ملاحظات", type: "textarea" },
    { key: "status", label: "حالة التنفيذ", type: "select", options: ["مفتوح", "قيد المعالجة", "مُغلَق"],
      render: (v) => statusDot(v === "مُغلَق" ? "good" : v === "قيد المعالجة" ? "warn" : "danger", v || "مفتوح") },
  );
  return fields;
}
/* الحقول التي تُعرِّف البند نفسه — محمية من تعديل PM إن أنشأها GM،
   بخلاف حقول التنفيذ (correctiveAction/photoAfter/status/notes) */
const PUNCHLIST_DEFINITION_FIELDS = ["itemNumber", "location", "category", "description", "severity", "responsibleParty", "targetCloseDate"];

/* ---- سجل الوثائق والتراخيص والضمانات (Documents / Licenses / Warranties) ---- */
function documentFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "title", label: "عنوان الوثيقة", required: true },
    { key: "docType", label: "نوع الوثيقة", type: "select",
      options: ["رخصة", "تصريح", "ضمان", "رسم هندسي معتمد", "شهادة معايرة", "عقد إضافي", "أخرى"] },
    { key: "refNumber", label: "الرقم المرجعي" },
    { key: "issueDate", label: "تاريخ الإصدار", type: "date" },
    { key: "expiryDate", label: "تاريخ الانتهاء (اتركه فارغاً إن كانت دائمة)", type: "date" },
    { key: "issuingAuthority", label: "الجهة المُصدرة" },
    { key: "attachment", label: "صورة/مستند الوثيقة (رفع نسخة جديدة يحفظ القديمة تلقائياً في سجل الإصدارات)", type: "photo", showInTable: false },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}
function budgetFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "category", label: "البند", required: true },
    { key: "budget", label: "الميزانية المخصصة", type: "number", render: (v) => fmtMoney(v) },
    { key: "actual", label: "المصروف الفعلي", type: "number", render: (v) => fmtMoney(v) },
  ];
}
function progressFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "activity", label: "البند / النشاط", required: true },
    { key: "planned", label: "المخطط %", type: "number", render: (v) => `${v}%` },
    { key: "actual", label: "المنفذ %", type: "number", render: (v, r) => {
        const delta = Number(v) - Number(r.planned);
        return statusDot(delta >= 0 ? "good" : delta >= -15 ? "warn" : "danger", `${v}% (متأخر ${Math.max(0, -delta)}%)`);
      } },
  ];
}

function changeOrderFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "title", label: "عنوان التغيير", required: true },
    { key: "description", label: "الوصف والسبب", type: "textarea" },
    { key: "costImpact", label: "الأثر على التكلفة", type: "number", render: (v) => v ? fmtMoney(v) : "0" },
    { key: "scheduleImpactDays", label: "الأثر على الجدول (أيام)", type: "number", render: (v) => `${v || 0} يوم` },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["مقترح", "قيد المراجعة", "معتمد", "مرفوض"],
      render: (v) => statusDot(v === "معتمد" ? "good" : v === "مرفوض" ? "danger" : "warn", v) },
  ];
}

/* ============================================================
   الحسابات البنكية — رصيد حقيقي محسوَّب من قيود دفتر الأستاذ
   المرتبطة به، لا رقماً واحداً مجمَّعاً عبر كل الشركة كما كان سابقاً.
   ============================================================ */
function bankAccountFields() {
  return [
    { key: "name", label: "اسم الحساب/البطاقة", required: true },
    { key: "bankName", label: "اسم البنك" },
    { key: "accountNumberLast4", label: "آخر 4 أرقام من رقم الحساب (لا تُدخل الرقم الكامل)" },
    { key: "currency", label: "العملة", type: "select", options: ["دينار ليبي", "دولار أمريكي", "يورو"] },
    { key: "openingBalance", label: "الرصيد الافتراضي عند بدء المتابعة في هذا النظام", type: "number", render: (v) => fmtMoney(v || 0) },
    { key: "notes", label: "ملاحظات", type: "textarea" },
  ];
}
/* ============================================================
   إنشاء قيد دفتر أستاذ تلقائياً عند أي دفعة فعلية (فاتورة/مستخلص) —
   الإصلاح الجوهري لمشكلة حقيقية مؤكَّدة: كان دفتر الأستاذ نظاماً
   منفصلاً تماماً يُدخَل يدوياً، لا يتغذّى أبداً من أي دفعة فعلية في
   أي مكان آخر بالنظام، فيمكن أن يتناقض رصيد الحساب البنكي مع مؤشر
   "السيولة المتاحة" في اللوحة الرئيسية تماماً لأنهما لا يتشاركان أي
   بيانات. الآن: أي زيادة حقيقية في مبلغ مدفوع/محصَّل تُنشئ قيداً
   تلقائياً، فيبقى دفتر الأستاذ ورصيد الحساب متّسقَين دائماً معهما.
   ============================================================ */
function autoCreateLedgerEntry(projectId, type, amount, description, sourceType, sourceId, bankAccountId) {
  if (!amount || amount <= 0) return;
  STATE.data.ledger = STATE.data.ledger || [];
  const entry = { id: uid(), projectId, date: todayISO(), type, costCenter: "", activity: description, bankAccountId: bankAccountId || "",
    amount, description: `${description} (قيد تلقائي)`, autoGeneratedFrom: sourceType, autoGeneratedSourceId: sourceId, updatedAt: Date.now() };
  STATE.data.ledger.push(entry);
  logAudit("create", "ledger", entry.id, `قيد تلقائي: ${description} — ${fmtMoney(amount)}`);
}

function computeBankAccountBalance(account, ledgerEntries) {
  const entries = (ledgerEntries || []).filter((e) => e.bankAccountId === account.id);
  const inflow = entries.filter((e) => e.type === "إيراد").reduce((s, e) => s + Number(e.amount || 0), 0);
  const outflow = entries.filter((e) => e.type === "مصروف").reduce((s, e) => s + Number(e.amount || 0), 0);
  return Number(account.openingBalance || 0) + inflow - outflow;
}

function ledgerFields() {
  return [
    { key: "projectId", label: "المشروع", type: "select", options: projectOptions(), required: true, render: (v) => esc(projName(v)) },
    { key: "date", label: "التاريخ", type: "date", required: true },
    { key: "type", label: "النوع", type: "select", options: ["إيراد", "مصروف"], required: true,
      render: (v) => statusDot(v === "إيراد" ? "good" : "warn", v) },
    { key: "costCenter", label: "مركز التكلفة", type: "select",
      options: ["عمالة", "معدات", "مواد", "مقاولين من الباطن", "خدمات", "إداري", "أخرى"] },
    { key: "bankAccountId", label: "الحساب البنكي (اختياري)", type: "select", options: (STATE.data.bankAccounts || []).map((b) => ({ value: b.id, label: `${b.name}${b.bankName ? " — " + b.bankName : ""}` })),
      render: (v) => { const b = (STATE.data.bankAccounts || []).find((x) => x.id === v); return b ? esc(b.name) : "—"; }, showInTable: false },
    { key: "activity", label: "النشاط / البند" },
    { key: "amount", label: "المبلغ", type: "number", required: true, render: (v) => fmtMoney(v) },
    { key: "description", label: "وصف الحركة", type: "textarea" },
  ];
}

function addProject(vals) {
  if (STATE.user && !canEdit(STATE.user.role, "projects")) { alert("دورك الحالي لا يملك صلاحية إضافة مشروع."); return; }
  const row = Object.assign({ id: uid(), updatedAt: Date.now() }, vals, {
    history: [{ date: todayISO(), completion: Number(vals.completion) || 0 }],
    baselineStart: vals.startDate, baselineEnd: vals.endDate, baselineBudget: vals.contractValue,
  });
  STATE.data.projects = [...STATE.data.projects, row];
  const teamEngineerIds = Array.isArray(vals.teamEngineerIds) ? vals.teamEngineerIds : [];
  if (teamEngineerIds.length) {
    STATE.data.resourcePool = STATE.data.resourcePool.map((r) => {
      if (!teamEngineerIds.includes(r.id)) return r;
      const currentIds = getResourceProjectIds(r);
      return currentIds.includes(row.id) ? r : Object.assign({}, r, { assignedProjectIds: [...currentIds, row.id], status: "معيّن" });
    });
  }
  STATE.data.chatRooms = STATE.data.chatRooms || [];
  STATE.data.chatRooms.push({
    id: uid(), projectId: row.id, name: "الغرفة الرئيسية", isMainRoom: true,
    memberResourceIds: [row.projectManagerId, ...teamEngineerIds].filter(Boolean),
    createdBy: (STATE.user && STATE.user.name) || "النظام", createdDate: todayISO(), updatedAt: Date.now(),
  });
  logAudit("create", "projects", row.id, getRecordLabel(row));
  saveData(STATE.data);
}
function rebaselineProject(id) {
  if (STATE.user && !canEdit(STATE.user.role, "projects")) { alert("دورك الحالي لا يملك صلاحية إعادة تحديد خط الأساس."); return; }
  const proj = STATE.data.projects.find((p) => p.id === id);
  if (!proj) return;
  const name = prompt("اسم خط الأساس الجديد (مثال: «خط الأساس المعتمد الأول» أو «بعد أمر التغيير رقم 3»):", `خط أساس ${new Date().toISOString().slice(0, 10)}`);
  if (name == null) return;
  if (!name.trim()) { alert("يجب إدخال اسم لخط الأساس."); return; }
  const projectTasks = STATE.data.tasks.filter((t) => t.projectId === id);
  const baseline = {
    id: uid(), name: name.trim(), savedAt: Date.now(), savedBy: (STATE.user && STATE.user.name) || "—",
    startDate: proj.startDate, endDate: proj.endDate, contractValue: proj.contractValue,
    taskSnapshots: projectTasks.map((t) => ({ taskId: t.id, name: t.name, start: t.start, end: t.end, completion: Number(t.completion) || 0 })),
  };
  STATE.data.projects = STATE.data.projects.map((p) => p.id === id
    ? Object.assign({}, p, {
        baselines: [...(p.baselines || []), baseline],
        baselineStart: proj.startDate, baselineEnd: proj.endDate, baselineBudget: proj.contractValue, // للتوافق مع عمود المقارنة السريعة الحالي في جدول المشاريع
        updatedAt: Date.now(),
      })
    : p);
  logAudit("update", "projects", id, `خط أساس جديد "${name.trim()}" لمشروع ${getRecordLabel(proj)} (${baseline.taskSnapshots.length} نشاط)`);
  saveData(STATE.data);
  renderApp();
  alert(`تم حفظ خط الأساس "${name.trim()}" بنجاح — ${baseline.taskSnapshots.length} نشاط. يمكنك مقارنته بأي خط أساس آخر أو بالوضع الحالي من صفحة مقارنة خطوط الأساس.`);
}

/* ---------------- مقارنة خطوط الأساس — بين خطي أساس محفوظين، أو بين خط أساس والوضع الحالي ---------------- */
function getCurrentAsBaselineSnapshot(project) {
  const projectTasks = STATE.data.tasks.filter((t) => t.projectId === project.id);
  return {
    id: "current", name: "الوضع الحالي (مباشر)", savedAt: Date.now(), savedBy: "—",
    startDate: project.startDate, endDate: project.endDate, contractValue: project.contractValue,
    taskSnapshots: projectTasks.map((t) => ({ taskId: t.id, name: t.name, start: t.start, end: t.end, completion: Number(t.completion) || 0 })),
  };
}
/* daysBetween يفرض حداً أدنى بيوم واحد (مصمَّم لحساب مدد الأنشطة، لا فرق زمني قد يكون صفراً أو سالباً)
   — لذا نستخدم هنا حساب فرق موقَّع صحيح لمقارنات الانزلاق الزمني بين خطوط الأساس. */
function dateDiffDays(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function compareBaselines(baselineA, baselineB) {
  const scheduleSlipDays = dateDiffDays(baselineA.endDate, baselineB.endDate);
  const costVariance = (Number(baselineB.contractValue) || 0) - (Number(baselineA.contractValue) || 0);
  const byIdA = new Map(baselineA.taskSnapshots.map((t) => [t.taskId, t]));
  const byIdB = new Map(baselineB.taskSnapshots.map((t) => [t.taskId, t]));
  const allTaskIds = new Set([...byIdA.keys(), ...byIdB.keys()]);
  const taskVariances = [];
  allTaskIds.forEach((tid) => {
    const a = byIdA.get(tid), b = byIdB.get(tid);
    if (a && b) {
      const dateSlip = dateDiffDays(a.end, b.end);
      taskVariances.push({ taskId: tid, name: b.name || a.name, status: "matched", startA: a.start, endA: a.end, startB: b.start, endB: b.end, completionA: a.completion, completionB: b.completion, dateSlipDays: dateSlip, completionDelta: b.completion - a.completion });
    } else if (a && !b) {
      taskVariances.push({ taskId: tid, name: a.name, status: "removed", startA: a.start, endA: a.end, completionA: a.completion });
    } else if (!a && b) {
      taskVariances.push({ taskId: tid, name: b.name, status: "added", startB: b.start, endB: b.end, completionB: b.completion });
    }
  });
  return { scheduleSlipDays, costVariance, taskVariances };
}
function updateProject(id, vals) {
  if (STATE.user && !canEdit(STATE.user.role, "projects")) { alert("دورك الحالي لا يملك صلاحية تعديل المشاريع."); return; }
  const prev = STATE.data.projects.find((p) => p.id === id);
  const history = prev && prev.history ? [...prev.history] : [];
  if (prev && Number(vals.completion) !== Number(prev.completion)) {
    history.push({ date: todayISO(), completion: Number(vals.completion) || 0 });
  }
  STATE.data.projects = STATE.data.projects.map((p) => (p.id === id ? Object.assign({}, p, vals, { history, updatedAt: Date.now() }) : p));
  logAudit("update", "projects", id, getRecordLabel(vals));
  saveData(STATE.data);
}

/* ============================================================
   مُستمِعو الأحداث الافتراضيون — سلوك النظام الحالي، لكن مُعلَناً
   كمستمِع صريح لا منطقاً مطموراً داخل دالة الإضافة. لإضافة سلوك جديد
   عند رفض تفتيش (كإشعار مستقبلي مثلاً)، يُضاف مستمِع آخر هنا فقط —
   بلا لمس دالة smartInspections.add نفسها إطلاقاً.
   ============================================================ */
DigitalTwinEvents.on("inspection:rejected", (inspection) => {
  if (inspection.ncrId) return; // NCR موجودة أصلاً لهذا التفتيش
  const asset = DigitalTwinRepository.getAssetById(inspection.assetId);
  const ncr = { id: uid(), projectId: inspection.projectId, category: "NCR",
    title: `NCR من تفتيش ذكي${asset ? " — " + asset.name : ""} (${inspection.inspectorName})`,
    date: inspection.inspectionDate || todayISO(), raisedBy: inspection.inspectorName,
    responsibleParty: asset ? asset.contractor : "", status: "مفتوح", updatedAt: Date.now() };
  STATE.data.qc = [...(STATE.data.qc || []), ncr];
  inspection.ncrId = ncr.id;
  logAudit("create", "qc", ncr.id, `NCR تلقائي من تفتيش ذكي مرفوض: ${ncr.title}`);
});

/* ---- Module registry used by the generic modal/table engine ---- */
/* ============================================================
   نظام المخزون الحقيقي — سجل حركات فعلي (استلام/سحب/تحويل بين
   المواقع)، لا رقماً واحداً يُكتَب يدوياً ويُعدَّل مباشرة بلا أثر.
   كل حركة محفوظة بتاريخها وطالبها وسببها — يمكن معرفة "من سحب كم
   ولماذا" فعلياً، لا فقط "كم تبقّى" حالياً.
   ============================================================ */
function computeMaterialCurrentStock(materialId) {
  const material = (STATE.data.materials || []).find((m) => m.id === materialId);
  if (!material) return 0;
  const transactions = (STATE.data.materialTransactions || []).filter((t) => t.materialId === materialId);
  // الرصيد الافتتاحي (الرقم اليدوي القديم) يبقى الأساس الدائم دائماً — توافقاً رجعياً مع بيانات
  // مسجَّلة قبل بناء سجل الحركات؛ كل حركة لاحقة تُضاف/تُطرَح من فوقه، لا تُلغيه بمجرد وجودها
  const openingBalance = Number(material.inStock || 0);
  const delta = transactions.reduce((sum, t) => {
    if (t.type === "استلام" || t.type === "تحويل وارد") return sum + Number(t.quantity || 0);
    if (t.type === "سحب" || t.type === "تحويل صادر") return sum - Number(t.quantity || 0);
    return sum;
  }, 0);
  return openingBalance + delta;
}
function computeMaterialTransactionHistory(materialId) {
  return (STATE.data.materialTransactions || []).filter((t) => t.materialId === materialId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
function recordMaterialTransaction(materialId, type, quantity, purpose) {
  if (STATE.user && !canEdit(STATE.user.role, "resources")) { alert("دورك الحالي لا يملك صلاحية تسجيل حركات المخزون."); return false; }
  const material = (STATE.data.materials || []).find((m) => m.id === materialId);
  if (!material) return false;
  const scope = getUserScopedProjectIds();
  if (scope && !scope.has(material.projectId)) { alert("لا يمكنك تسجيل حركة على مخزون مشروع خارج نطاق إدارتك الحالي."); return false; }
  const qty = Number(quantity);
  if (!qty || qty <= 0) { alert("أدخل كمية صحيحة أكبر من صفر."); return false; }
  if ((type === "سحب" || type === "تحويل صادر") && qty > computeMaterialCurrentStock(materialId)) {
    alert(`الكمية المطلوب سحبها (${qty}) تتجاوز المخزون الفعلي المتوفر (${computeMaterialCurrentStock(materialId)}) — لا يمكن سحب أكثر من الموجود فعلياً.`);
    return false;
  }
  STATE.data.materialTransactions = STATE.data.materialTransactions || [];
  STATE.data.materialTransactions.push({ id: uid(), materialId, projectId: material.projectId, type, quantity: qty,
    date: todayISO(), requestedByUserId: STATE.user ? STATE.user.id : null, requestedByName: STATE.user ? STATE.user.name : "—", purpose: purpose || "" });
  saveData(STATE.data);
  return true;
}
function transferMaterialToProject(materialId, quantity, targetProjectId, purpose) {
  if (STATE.user && !canEdit(STATE.user.role, "resources")) { alert("دورك الحالي لا يملك صلاحية تحويل المواد بين المواقع."); return false; }
  const sourceMaterial = (STATE.data.materials || []).find((m) => m.id === materialId);
  if (!sourceMaterial) return false;
  // منع تحويل مواد إلى (أو من) مشروع خارج نطاق إدارة المستخدم الحالي فعلياً — كان بالإمكان التدخّل
  // في مخزون مشروع لا يملك صلاحية عليه إطلاقاً، فقط لأن الصلاحية العامة "resources" مُحقَّقة
  const scope = getUserScopedProjectIds();
  if (scope && (!scope.has(sourceMaterial.projectId) || !scope.has(targetProjectId))) {
    alert("لا يمكنك تحويل مواد من أو إلى مشروع خارج نطاق إدارتك الحالي.");
    return false;
  }
  if (sourceMaterial.projectId === targetProjectId) { alert("لا يمكن تحويل مادة لنفس موقعها الحالي."); return false; }
  const qty = Number(quantity);
  if (!qty || qty <= 0) { alert("أدخل كمية صحيحة أكبر من صفر."); return false; }
  const currentStock = computeMaterialCurrentStock(materialId);
  if (qty > currentStock) { alert(`الكمية المطلوب تحويلها (${qty}) تتجاوز المخزون الفعلي المتوفر (${currentStock}) في هذا الموقع.`); return false; }
  // إيجاد سجل مطابق لنفس المادة (بالاسم) في الموقع الهدف، أو إنشاؤه إن لم يكن موجوداً بعد
  let targetMaterial = (STATE.data.materials || []).find((m) => m.projectId === targetProjectId && m.name.trim().toLowerCase() === sourceMaterial.name.trim().toLowerCase());
  if (!targetMaterial) {
    targetMaterial = Object.assign({ id: uid(), updatedAt: Date.now() }, { projectId: targetProjectId, name: sourceMaterial.name, unit: sourceMaterial.unit, unitCost: sourceMaterial.unitCost, inStock: 0, reorderLevel: sourceMaterial.reorderLevel });
    STATE.data.materials = [...(STATE.data.materials || []), targetMaterial];
  }
  STATE.data.materialTransactions = STATE.data.materialTransactions || [];
  const now = Date.now();
  STATE.data.materialTransactions.push(
    { id: uid(), materialId: sourceMaterial.id, projectId: sourceMaterial.projectId, type: "تحويل صادر", quantity: qty, date: todayISO(),
      requestedByUserId: STATE.user ? STATE.user.id : null, requestedByName: STATE.user ? STATE.user.name : "—", purpose: purpose || "", transferPairId: targetMaterial.id },
    { id: uid(), materialId: targetMaterial.id, projectId: targetProjectId, type: "تحويل وارد", quantity: qty, date: todayISO(),
      requestedByUserId: STATE.user ? STATE.user.id : null, requestedByName: STATE.user ? STATE.user.name : "—", purpose: purpose || "", transferPairId: sourceMaterial.id }
  );
  saveData(STATE.data);
  return true;
}
/* ملخص المادة عبر كل المواقع معاً — يجيب فعلياً عن "كل موقع كم به من هذه المادة؟" */
function computeMaterialStockAcrossLocations(materialName) {
  const scope = getUserScopedProjectIds();
  let matchingMaterials = (STATE.data.materials || []).filter((m) => m.name.trim().toLowerCase() === materialName.trim().toLowerCase());
  // لا يجوز أن يرى المستخدم مخزون مشروع خارج نطاق إدارته الحقيقي — حتى لو تشارك مادة بالاسم نفسه مع مشروع آخر
  if (scope) matchingMaterials = matchingMaterials.filter((m) => scope.has(m.projectId));
  return matchingMaterials.map((m) => ({ materialId: m.id, projectId: m.projectId, projectName: projName(m.projectId), stock: computeMaterialCurrentStock(m.id), unit: m.unit }))
    .filter((x) => x.stock > 0 || true).sort((a, b) => b.stock - a.stock);
}

const MODULES = {
  projects:   { collection: "projects",     fields: projectFields,    add: addProject, update: updateProject, remove: deleteProjectCascade, skipGenericConfirm: true,
    validate: (vals) => {
      if (vals.startDate && vals.endDate && vals.endDate < vals.startDate) return "تاريخ الانتهاء لا يمكن أن يكون قبل تاريخ البدء.";
      if (vals.contractValue !== "" && vals.contractValue != null && Number(vals.contractValue) < 0) return "قيمة العقد لا يمكن أن تكون سالبة.";
      if (vals.completion !== "" && vals.completion != null && (Number(vals.completion) < 0 || Number(vals.completion) > 100)) return "نسبة الإنجاز يجب أن تكون بين 0 و100.";
      return null;
    } },
  tasks:      { collection: "tasks",        fields: taskFields,       add: genericAdd("tasks"),
    update: (id, vals) => {
      const old = (STATE.data.tasks || []).find((t) => t.id === id);
      const wasOverdue = old && old.end && old.end < todayISO() && Number(old.completion || 0) < 100;
      genericUpdate("tasks")(id, vals);
      const updated = (STATE.data.tasks || []).find((t) => t.id === id);
      const isOverdue = updated && updated.end && updated.end < todayISO() && Number(updated.completion || 0) < 100;
      if (updated && isOverdue && !wasOverdue) {
        emitProjectEvent({
          projectId: updated.projectId, eventType: "ACTIVITY_DELAYED", sourceEntity: "Activity", sourceEntityId: updated.id,
          previousState: { completion: old.completion, end: old.end }, newState: { completion: updated.completion, end: updated.end },
          severity: "warn", confidence: 1, evidence: [`النشاط «${updated.name}» تجاوز تاريخ نهايته (${updated.end}) بنسبة إنجاز ${updated.completion || 0}% فقط`],
        });
      }
    },
    remove: deleteTaskWithDependencyCheck, skipGenericConfirm: true,
    validate: (vals) => {
      if (vals.start && vals.end && vals.end < vals.start) return "تاريخ النهاية لا يمكن أن يكون قبل تاريخ البداية.";
      if (vals.completion !== "" && vals.completion != null && (Number(vals.completion) < 0 || Number(vals.completion) > 100)) return "نسبة الإنجاز يجب أن تكون بين 0 و100.";
      return null;
    } },
  sitereports:{ collection: "dailyReports", fields: reportFields,     add: genericAdd("dailyReports", () => ({ status: "مُقدَّم" })),
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "sitereports")) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
      const old = (STATE.data.dailyReports || []).find((r) => r.id === id);
      // اعتماد التقرير محجوز لمدير المشروع فعلياً (نفس الأدوار المُستخدَمة في الدالة المخصَّصة approveDailyReport) —
      // كان بالإمكان تجاوز تلك الدالة كلياً عبر تعديل هذا الحقل مباشرة من نموذج التعديل العام
      if (old && STATE.user && STATE.user.role !== "مدير المشروع" && STATE.user.role !== "مدير عام" && STATE.user.role !== "مالك الشركة") {
        vals = Object.assign({}, vals, { status: old.status, approvedBy: old.approvedBy, approvalDate: old.approvalDate });
      }
      genericUpdate("dailyReports")(id, vals);
    },
    remove: genericRemove("dailyReports"),
    validate: (vals, editingId) => {
      const hasTasks = Array.isArray(vals.completedTaskIds) && vals.completedTaskIds.length > 0;
      const hasText = String(vals.activities || "").trim() || String(vals.notes || "").trim();
      if (!hasTasks && !hasText) return "أضف مهمة واحدة على الأقل من قائمة المهام المنفذة، أو اكتب ملاحظة عن أعمال اليوم.";
      if (vals.workers !== "" && vals.workers != null && Number(vals.workers) < 0) return "عدد العمال لا يمكن أن يكون سالباً.";
      const dup = (STATE.data.dailyReports || []).some((r) => r.id !== editingId && r.projectId === vals.projectId && r.date === vals.date);
      if (dup) return "يوجد بالفعل تقرير مسجَّل لهذا المشروع في هذا التاريخ — عدّل التقرير الموجود بدل إنشاء تقرير مكرَّر.";
      return null;
    } },
  procurement:{ collection: "procurement",  fields: procurementFields,add: genericAdd("procurement"), update: genericUpdate("procurement"), remove: genericRemove("procurement"),
    validate: (vals) => (vals.amount !== "" && vals.amount != null && Number(vals.amount) < 0) ? "القيمة التقديرية لا يمكن أن تكون سالبة." : null },
  procurementBids: { collection: "procurementBids", fields: procurementBidFields, add: genericAdd("procurementBids"), update: genericUpdate("procurementBids"), remove: genericRemove("procurementBids"),
    validate: (vals) => {
      if (vals.quotedAmount !== "" && vals.quotedAmount != null && Number(vals.quotedAmount) < 0) return "المبلغ المعروض لا يمكن أن يكون سالباً.";
      if (vals.deliveryDays !== "" && vals.deliveryDays != null && Number(vals.deliveryDays) < 0) return "مدة التوريد لا يمكن أن تكون سالبة.";
      return null;
    } },
  contracts:  { collection: "contracts",    fields: contractFields,   add: genericAdd("contracts"), update: genericUpdate("contracts"), remove: genericRemove("contracts"),
    validate: (vals) => (vals.value !== "" && vals.value != null && Number(vals.value) < 0) ? "قيمة العقد لا يمكن أن تكون سالبة." : null },
  invoices:   { collection: "invoices",     fields: invoiceFields,
    add: (vals) => {
      const countBefore = STATE.data.invoices.length;
      genericAdd("invoices")(vals);
      if (STATE.data.invoices.length > countBefore) {
        const created = STATE.data.invoices[STATE.data.invoices.length - 1];
        if (vals.projectId) {
          emitProjectEvent({ projectId: vals.projectId, eventType: "INVOICE_SUBMITTED", sourceEntity: "Invoice", sourceEntityId: created.id,
            newState: { amount: created.amount, type: created.type }, severity: "info", evidence: [`فاتورة رقم ${created.number || created.id} بقيمة ${created.amount}`] });
        }
        startWorkflowInstance("invoices", created.id, vals.projectId || null);
      }
    },
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "invoices")) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
      const old = (STATE.data.invoices || []).find((i) => i.id === id);
      // حقول قرار مالي محجوزة لمن يملك سلطة مراجعة حقيقية فعلياً (لا كل من يملك صلاحية "invoices" العامة لتقديم مصروفه الخاص) —
      // خلل حقيقي وُجد هنا: مهندس صاحب فاتورته نفسها كان يستطيع رفضها بنفسه مباشرة، مخفياً تجاوزه الفعلي عن المحاسب تماماً
      const financialReviewerRoles = ["المحاسب العام", "مدير عام", "مالك الشركة"];
      if (old && STATE.user && !financialReviewerRoles.includes(STATE.user.role)) {
        vals = Object.assign({}, vals, { approvalStatus: old.approvalStatus, bankAccountId: old.bankAccountId });
      }
      const oldPaid = Number(old ? old.paidAmount || 0 : 0);
      const newPaid = Number(vals.paidAmount || 0);
      if (newPaid > oldPaid) {
        // فحص جوهري: لا يُسجَّل أي صرف فعلي قبل اكتمال اعتماد سير العمل الخاص بهذه الفاتورة تحديداً —
        // كان بالإمكان تسجيل دفع كامل لفاتورة كبيرة تحتاج اعتماد المالك، بينما سير عملها لا يزال في أول مرحلة، بلا أي فحص إطلاقاً.
        const instance = getWorkflowInstanceFor("invoices", id);
        if (instance && instance.status !== "معتمد") {
          alert(`لا يمكن تسجيل صرف على هذه الفاتورة قبل اكتمال اعتماد سير العمل الخاص بها — حالتها الحالية: ${instance.status === "قيد التنفيذ" ? "قيد الاعتماد (لم تكتمل بعد)" : instance.status}. راجع لوحة «اعتماداتي» لإتمام الاعتماد أولاً.`);
          return;
        }
      }
      genericUpdate("invoices")(id, vals);
      if (newPaid > oldPaid) {
        const ledgerType = vals.type === "عميل" ? "إيراد" : "مصروف";
        autoCreateLedgerEntry(vals.projectId, ledgerType, newPaid - oldPaid, `دفعة فاتورة رقم ${vals.number || id}`, "invoice", id, vals.bankAccountId);
      }
    },
    remove: genericRemove("invoices"),
    validate: (vals) => {
      if (vals.amount !== "" && vals.amount != null && Number(vals.amount) < 0) return "قيمة الفاتورة لا يمكن أن تكون سالبة.";
      if (vals.paidAmount !== "" && vals.paidAmount != null && Number(vals.paidAmount) < 0) return "المبلغ المدفوع لا يمكن أن يكون سالباً.";
      if (Number(vals.paidAmount || 0) > Number(vals.amount || 0)) return "المبلغ المدفوع لا يمكن أن يتجاوز قيمة الفاتورة.";
      return null;
    } },
  qc:         { collection: "qc",           fields: qcFields,         add: genericAdd("qc"), update: genericUpdate("qc"), remove: genericRemove("qc"),
    validate: (vals) => (vals.status === "مغلق" && !vals.closedDate) ? "أدخل تاريخ الإغلاق الفعلي قبل تعليم البند كـ«مغلق»." : null },
  hse:        { collection: "hse",          fields: hseFields,        add: genericAdd("hse"), update: genericUpdate("hse"), remove: genericRemove("hse"),
    validate: (vals) => (vals.status === "مغلق" && !vals.closedDate) ? "أدخل تاريخ الإغلاق الفعلي قبل تعليم البند كـ«مغلق»." : null },
  risks:      { collection: "risks",        fields: riskFields,       add: genericAdd("risks"), update: genericUpdate("risks"), remove: genericRemove("risks") },
  changeOrders:{ collection: "changeOrders", fields: changeOrderFields, add: genericAdd("changeOrders"),
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "changeOrders")) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
      const old = (STATE.data.changeOrders || []).find((c) => c.id === id);
      // "الحالة" (معتمد/مرفوض) تُغذِّي مباشرة حساب BAC/EVM الحقيقي — لا يجوز أن يُقرِّرها مُقدِّم أمر
      // التغيير نفسه؛ التكلفة والأثر الزمني المُقترَحان يبقيان مفتوحين له لأنهما جوهر الطلب نفسه، لا القرار عليه
      const financialReviewerRoles = ["المحاسب العام", "مدير عام", "مالك الشركة"];
      if (old && STATE.user && !financialReviewerRoles.includes(STATE.user.role)) {
        vals = Object.assign({}, vals, { status: old.status });
      }
      genericUpdate("changeOrders")(id, vals);
    },
    remove: genericRemove("changeOrders") },
  bankAccounts: { collection: "bankAccounts", fields: bankAccountFields, add: genericAdd("bankAccounts"), update: genericUpdate("bankAccounts"), remove: genericRemove("bankAccounts"),
    validate: (vals) => (vals.openingBalance !== "" && vals.openingBalance != null && Number(vals.openingBalance) < 0) ? "الرصيد الافتراضي لا يمكن أن يكون سالباً." : null },
  ledger:     { collection: "ledger",         fields: ledgerFields,     add: genericAdd("ledger"), update: genericUpdate("ledger"), remove: genericRemove("ledger"),
    validate: (vals) => (vals.amount !== "" && vals.amount != null && Number(vals.amount) < 0) ? "المبلغ لا يمكن أن يكون سالباً — استخدم نوع الحركة (إيراد/مصروف) بدلاً من إشارة سالبة." : null },
  labor:      { collection: "labor",        fields: laborFields,      add: genericAdd("labor"), update: genericUpdate("labor"), remove: genericRemove("labor"),
    validate: (vals) => {
      if (vals.count !== "" && vals.count != null && Number(vals.count) < 0) return "عدد الأفراد لا يمكن أن يكون سالباً.";
      if (vals.dailyRate !== "" && vals.dailyRate != null && Number(vals.dailyRate) < 0) return "الأجر اليومي لا يمكن أن يكون سالباً.";
      return null;
    } },
  equipment:  { collection: "equipment",    fields: equipFields,      add: genericAdd("equipment"), update: genericUpdate("equipment"), remove: genericRemove("equipment"),
    validate: (vals) => {
      if (vals.hours !== "" && vals.hours != null && Number(vals.hours) < 0) return "ساعات التشغيل لا يمكن أن تكون سالبة.";
      if (vals.fuel !== "" && vals.fuel != null && (Number(vals.fuel) < 0 || Number(vals.fuel) > 100)) return "نسبة الوقود يجب أن تكون بين 0 و100.";
      return null;
    } },
  materials:  { collection: "materials",    fields: matFields,        add: genericAdd("materials"),
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "resources")) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
      const old = (STATE.data.materials || []).find((m) => m.id === id);
      if (old) {
        // بعد وجود أي حركة حقيقية مسجَّلة، لا يجوز تعديل "المخزون" مباشرة بعد ذلك — التعديل المباشر
        // يُفرِّغ قيمة سجل الحركات كلياً؛ أي تغيير فعلي للمخزون يجب أن يمرّ عبر سحب/استلام/تحويل حقيقي
        if (computeMaterialTransactionHistory(id).length > 0) vals = Object.assign({}, vals, { inStock: old.inStock });
        // تكلفة الوحدة قرار تسعير مالي، لا عملية تشغيلية يومية — محجوزة لمن يملك سلطة مالية حقيقية
        const financiallyAwareRoles = ["المحاسب العام", "مدير المشروع", "مدير عام", "مالك الشركة"];
        if (STATE.user && !financiallyAwareRoles.includes(STATE.user.role)) vals = Object.assign({}, vals, { unitCost: old.unitCost });
      }
      genericUpdate("materials")(id, vals);
    },
    remove: genericRemove("materials"),
    validate: (vals) => (vals.inStock !== "" && vals.inStock != null && Number(vals.inStock) < 0) ? "المخزون الحالي لا يمكن أن يكون سالباً." : null },
  budgetItems:{ collection: "budgetItems",  fields: budgetFields,     add: genericAdd("budgetItems"), update: genericUpdate("budgetItems"), remove: genericRemove("budgetItems"),
    validate: (vals) => {
      if (vals.budget !== "" && vals.budget != null && Number(vals.budget) < 0) return "قيمة الميزانية لا يمكن أن تكون سالبة.";
      if (vals.actual !== "" && vals.actual != null && Number(vals.actual) < 0) return "القيمة الفعلية لا يمكن أن تكون سالبة.";
      return null;
    } },
  progressItems:{ collection: "progressItems", fields: progressFields, add: genericAdd("progressItems"), update: genericUpdate("progressItems"), remove: genericRemove("progressItems"),
    validate: (vals) => {
      if (vals.planned !== "" && vals.planned != null && (Number(vals.planned) < 0 || Number(vals.planned) > 100)) return "نسبة الإنجاز المخطَّطة يجب أن تكون بين 0 و100.";
      if (vals.actual !== "" && vals.actual != null && (Number(vals.actual) < 0 || Number(vals.actual) > 100)) return "نسبة الإنجاز الفعلية يجب أن تكون بين 0 و100.";
      return null;
    } },
  contractorEvaluations: { collection: "contractorEvaluations", fields: contractorEvaluationFields, add: genericAdd("contractorEvaluations"), update: genericUpdate("contractorEvaluations"), remove: genericRemove("contractorEvaluations"),
    validate: (vals) => {
      const scoreKeys = ["qualityScore", "scheduleScore", "safetyScore", "cooperationScore"];
      for (const k of scoreKeys) {
        if (vals[k] !== "" && vals[k] != null && (Number(vals[k]) < 1 || Number(vals[k]) > 5)) return "كل تقييم يجب أن يكون بين 1 و5.";
      }
      return null;
    } },
  smartInspections: { collection: "smartInspections", fields: smartInspectionFields,
    add: (vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية إضافة تفتيش ذكي."); return; }
      const row = Object.assign({ id: uid(), updatedAt: Date.now() }, vals);
      if (row.overallResult === "مرفوض") DigitalTwinEvents.emit("inspection:rejected", row);
      STATE.data.smartInspections = [...(STATE.data.smartInspections || []), row];
      logAudit("create", "smartInspections", row.id, `تفتيش ذكي (${row.overallResult || "بلا نتيجة"}) — ${row.inspectorName}`);
      saveData(STATE.data);
    },
    update: genericUpdate("smartInspections"), remove: genericRemove("smartInspections") },
  projectAssets: { collection: "projectAssets", fields: projectAssetFields, add: genericAdd("projectAssets"), update: genericUpdate("projectAssets"), remove: genericRemove("projectAssets") },
  realityCaptures: { collection: "realityCaptures", fields: realityCaptureFields, add: genericAdd("realityCaptures"), update: genericUpdate("realityCaptures"), remove: genericRemove("realityCaptures"),
    validate: (vals) => {
      if (vals.detectedCompletionPct !== "" && vals.detectedCompletionPct != null) {
        if (Number(vals.detectedCompletionPct) < 0 || Number(vals.detectedCompletionPct) > 100) return "نسبة الإنجاز المرصودة يجب أن تكون بين 0 و100.";
        if (!vals.photo) return "أي نسبة إنجاز مرصودة يجب أن تُدعَم بصورة إثبات — لا يُقبل رقم بلا دليل مرئي مرفق (لإغلاق ثغرة إدخال أي رقم بلا تحقّق).";
      }
      return null;
    } },
  deviationReports: { collection: "deviationReports", fields: deviationReportFields, add: genericAdd("deviationReports"), update: genericUpdate("deviationReports"), remove: genericRemove("deviationReports"),
    validate: (vals) => (vals.deviationPct !== "" && vals.deviationPct != null && Number(vals.deviationPct) < 0) ? "نسبة الانحراف لا يمكن أن تكون سالبة." : null },
  arSessions: { collection: "arSessions", fields: arSessionFields, add: genericAdd("arSessions"), update: genericUpdate("arSessions"), remove: genericRemove("arSessions") },
  realityTwinSessions: { collection: "realityTwinSessions", fields: realityTwinSessionFields, add: genericAdd("realityTwinSessions"), update: genericUpdate("realityTwinSessions"), remove: genericRemove("realityTwinSessions"),
    validate: (vals) => {
      if (vals.rmsResidualM !== "" && vals.rmsResidualM != null && Number(vals.rmsResidualM) < 0) return "قيمة RMS residual لا يمكن أن تكون سالبة.";
      if (vals.controlPointsUsed !== "" && vals.controlPointsUsed != null && Number(vals.controlPointsUsed) < 3) return "التسجيل الهندسي الموثوق يحتاج 3 نقاط ضبط على الأقل (Horn/RANSAC).";
      if (vals.scanVerifiedProgressPct !== "" && vals.scanVerifiedProgressPct != null && (Number(vals.scanVerifiedProgressPct) < 0 || Number(vals.scanVerifiedProgressPct) > 100)) return "نسبة الإنجاز الموثّقة بالمسح يجب أن تكون بين 0 و100.";
      return null;
    } },
  projectNotes: { collection: "projectNotes", fields: projectNoteFields, add: genericAdd("projectNotes"), update: genericUpdate("projectNotes"), remove: genericRemove("projectNotes") },
  gmNotes: { collection: "gmNotes", fields: gmNoteFields,
    add: (vals) => {
      const isPmIssuer = STATE.user && STATE.user.role === "مدير المشروع";
      const requiredPermission = isPmIssuer ? "إنشاء ملاحظة لمهندس (Create Note to Engineer)" : "إنشاء ملاحظة إدارة عليا (Create GM Note)";
      if (STATE.user && !checkPermission(requiredPermission, STATE.user.role)) { alert("دورك الحالي لا يملك صلاحية إنشاء هذا النوع من الملاحظات."); return; }
      const row = Object.assign({ id: uid(), issuerLevel: isPmIssuer ? "PM" : "GM", issuedByUserId: STATE.user ? STATE.user.id : null,
        status: isPmIssuer ? "بانتظار رد المهندس" : "بانتظار رد مدير المشروع", responseHistory: [], updatedAt: Date.now() }, vals);
      STATE.data.gmNotes = [...(STATE.data.gmNotes || []), row];
      logAudit("create", "gmNotes", row.id, `${isPmIssuer ? "مدير المشروع" : "GM"} أنشأ ملاحظة: ${row.title}`);
      const assignedResourceId = isPmIssuer ? row.assignedEngineerResourceId : row.assignedPmResourceId;
      const assignedResource = (STATE.data.resourcePool || []).find((r) => r.id === assignedResourceId);
      const assignedUser = assignedResource ? (STATE.data.users || []).find((u) => u.linkedResourceId === assignedResource.id) : null;
      if (assignedUser) createNotification(assignedUser.id, "note", `ملاحظة جديدة من ${isPmIssuer ? "مدير المشروع" : "الإدارة العليا"}: ${row.title}`, "gmNote", row.id);
      if (row.projectId) {
        emitProjectEvent({ projectId: row.projectId, eventType: "GM_NOTE_ISSUED", sourceEntity: "GmNote", sourceEntityId: row.id,
          newState: { title: row.title, priority: row.priority, assignedTo: assignedResource ? assignedResource.name : null, issuerLevel: row.issuerLevel },
          severity: row.priority === "عالية" ? "warn" : "info", evidence: [`ملاحظة ${isPmIssuer ? "من مدير المشروع" : "إدارة عليا"}: ${row.title}${assignedResource ? ` — موجَّهة لـ ${assignedResource.name}` : ""}`] });
      }
      saveData(STATE.data);
    },
    update: genericUpdate("gmNotes"), remove: genericRemove("gmNotes") },
  maintenanceRecords: { collection: "maintenanceRecords", fields: maintenanceRecordFields, add: genericAdd("maintenanceRecords"), update: genericUpdate("maintenanceRecords"), remove: genericRemove("maintenanceRecords") },
  sensorReadings: { collection: "sensorReadings", fields: sensorReadingFields, add: genericAdd("sensorReadings"), update: genericUpdate("sensorReadings"), remove: genericRemove("sensorReadings") },
  aiAnalysisResults: { collection: "aiAnalysisResults", fields: aiAnalysisResultFields, add: genericAdd("aiAnalysisResults"), update: genericUpdate("aiAnalysisResults"), remove: genericRemove("aiAnalysisResults"),
    validate: (vals) => (vals.confidencePct !== "" && vals.confidencePct != null && (Number(vals.confidencePct) < 0 || Number(vals.confidencePct) > 100)) ? "نسبة الثقة يجب أن تكون بين 0 و100." : null },
  resourcePool:{ collection: "resourcePool", fields: resourcePoolFields,
    blankFieldsOnEdit: (row) => {
      const role = STATE.user && STATE.user.role;
      const isPM = role === "مدير المشروع";
      // لا يكفي إخفاء العرض في الجدول — يجب ألا تُملَأ القيمة الحقيقية في نموذج التعديل نفسه إطلاقاً لمدير المشروع
      return (isPM && (row.type === "مدير مشروع" || row.type === "مهندس")) ? ["dailyRate"] : [];
    },
    add: (vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "resourcePool")) { alert("دورك الحالي لا يملك صلاحية الإضافة هنا."); return; }
      const role = STATE.user && STATE.user.role;
      const isPM = role === "مدير المشروع";
      // حماية فعلية وقت الكتابة — لا مجرد إخفاء عرض: مدير المشروع لا يمكنه إطلاقاً تحديد تكلفة مدير مشروع/مهندس عند الإنشاء
      if (isPM && (vals.type === "مدير مشروع" || vals.type === "مهندس")) delete vals.dailyRate;
      const row = Object.assign({ id: uid(), updatedAt: Date.now() }, vals);
      delete row._loginUsername; delete row._loginPassword;
      STATE.data.resourcePool = [...(STATE.data.resourcePool || []), row];
      logAudit("create", "resourcePool", row.id, `${row.name} (${row.type})`);
      upsertLinkedUserAccount(row.id, row.name, row.type, vals._loginUsername, vals._loginPassword);
      saveData(STATE.data);
    },
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "resourcePool")) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
      const role = STATE.user && STATE.user.role;
      const isPM = role === "مدير المشروع";
      STATE.data.resourcePool = (STATE.data.resourcePool || []).map((r) => {
        if (r.id !== id) return r;
        // حماية فعلية وقت الكتابة: مدير المشروع لا يستطيع تعديل تكلفة مدير مشروع/مهندس مهما أُرسِل في النموذج
        const isProtectedCostRow = isPM && (r.type === "مدير مشروع" || r.type === "مهندس");
        const updated = Object.assign({}, r, vals, {
          dailyRate: isProtectedCostRow ? r.dailyRate : ((vals.dailyRate === "" || vals.dailyRate == null) ? r.dailyRate : vals.dailyRate),
          updatedAt: Date.now(),
        });
        delete updated._loginUsername; delete updated._loginPassword;
        return updated;
      });
      logAudit("update", "resourcePool", id, vals.name || id);
      upsertLinkedUserAccount(id, vals.name, vals.type, vals._loginUsername, vals._loginPassword);
      saveData(STATE.data);
    },
    remove: deleteResourcePoolEntry,
    blankFieldsOnEdit: (row) => {
      const role = STATE.user && STATE.user.role;
      return (role === "مدير المشروع" && (row.type === "مدير مشروع" || row.type === "مهندس")) ? ["dailyRate"] : [];
    },
    validate: (vals) => {
      if (vals.dailyRate !== "" && vals.dailyRate != null && Number(vals.dailyRate) < 0) return "السعر اليومي لا يمكن أن يكون سالباً.";
      const role = STATE.user && STATE.user.role;
      if (role === "مدير المشروع" && (vals.type === "مدير مشروع" || vals.type === "مهندس")) {
        return "مدير المشروع لا يستطيع إضافة أو تعديل مدراء مشاريع أو مهندسين — هذا محصور بالمدير العام.";
      }
      if (vals._loginPassword && String(vals._loginPassword).length > 0 && String(vals._loginPassword).length < 4) {
        return "كلمة المرور يجب أن تكون 4 أحرف على الأقل.";
      }
      if (vals._loginUsername && !vals._loginPassword) return "أدخل كلمة مرور أيضاً لإنشاء حساب الدخول، أو اترك الحقلين فارغين معاً.";
      return null;
    } },
  custodies:  { collection: "custodies",    fields: custodyFields,    add: addCustody, update: genericUpdate("custodies"), remove: genericRemove("custodies"),
    validate: (vals, editingId) => {
      const isCash = !vals.custodyType || vals.custodyType === "نقدية (مصاريف تشغيلية)";
      if (isCash) {
        if (!vals.amount || Number(vals.amount) <= 0) return "أدخل مبلغاً أكبر من صفر للعهدة النقدية.";
      } else {
        if (!vals.itemDescription || !vals.itemDescription.trim()) return "أدخل وصف العنصر (المعدة/الجهاز/بطاقة الوقود) لهذا النوع من العهدة.";
      }
      if (vals.amount !== "" && vals.amount != null && Number(vals.amount) < 0) return "مبلغ العهدة لا يمكن أن يكون سالباً.";
      if (isCash && vals.parentCustodyId) {
        const parent = (STATE.data.custodies || []).find((c) => c.id === vals.parentCustodyId);
        if (parent) {
          const otherSubs = subCustodiesOf(parent.id, STATE.data.custodies).filter((c) => c.id !== editingId);
          const alreadyGiven = otherSubs.reduce((s, c) => s + Number(c.amount || 0), 0);
          const directInvoiced = custodyInvoicedTotal(parent.id, STATE.data.invoices);
          const remaining = Number(parent.amount || 0) - alreadyGiven - directInvoiced;
          if (Number(vals.amount || 0) > remaining) {
            return `المبلغ يتجاوز المتبقي الفعلي في العهدة الأصلية رقم ${parent.number} (المتبقي: ${fmtMoney(remaining)}).`;
          }
        }
      }
      return null;
    } },
  certificates: {
    collection: "certificates", fields: certificateFields,
    add: genericAdd("certificates"),
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "certificates")) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
      const old = (STATE.data.certificates || []).find((c) => c.id === id);
      // مرحلة الاعتماد والمبلغ المعتمَد يُمثِّلان موافقة المالك الخارجية الفعلية، تُسجَّل داخلياً عبر المحاسب العام
      // تحديداً (من يتابع التحصيل فعلياً) — لا مُقدِّم المستخلص نفسه (غالباً مدير المشروع)، فهذا انتحال موافقة لم تحدث
      const financialReviewerRoles = ["المحاسب العام", "مدير عام", "مالك الشركة"];
      if (old && STATE.user && !financialReviewerRoles.includes(STATE.user.role)) {
        vals = Object.assign({}, vals, { stage: old.stage, approvedAmount: old.approvedAmount, approvedDate: old.approvedDate, bankAccountId: old.bankAccountId, paidAmount: old.paidAmount });
      }
      const oldPaid = Number(old ? old.paidAmount || 0 : 0);
      const newPaid = Number(vals.paidAmount || 0);
      genericUpdate("certificates")(id, vals);
      if (newPaid > oldPaid) autoCreateLedgerEntry(vals.projectId, "إيراد", newPaid - oldPaid, `تحصيل مستخلص رقم ${vals.number || id}`, "certificate", id, vals.bankAccountId);
    },
    remove: genericRemove("certificates"),
    validate: (vals, editingId) => {
      if (Number(vals.grossValueCumulative || 0) < Number(vals.previousCertifiedCumulative || 0)) {
        return "القيمة التراكمية للأعمال المنفذة لا يمكن أن تقل عن المستخلص سابقاً (تراكمي).";
      }
      if (vals.retentionPercent !== "" && vals.retentionPercent != null && (Number(vals.retentionPercent) < 0 || Number(vals.retentionPercent) > 100)) {
        return "نسبة المحتجز يجب أن تكون بين 0 و100.";
      }
      const priorOwnerCerts = (STATE.data.certificates || []).filter((c) => c.projectId === vals.projectId && c.id !== editingId);
      if (priorOwnerCerts.length) {
        const actualLastCum = Math.max(...priorOwnerCerts.map((c) => Number(c.grossValueCumulative || 0)));
        const entered = Number(vals.previousCertifiedCumulative || 0);
        if (entered !== actualLastCum) {
          const proceed = confirm(`تنبيه دقّة: أدخلت «المستخلص سابقاً» بقيمة ${fmtMoney(entered)}، بينما آخر مستخلص فعلي مسجَّل لهذا المشروع قيمته التراكمية ${fmtMoney(actualLastCum)}.\n\nإن كان هذا مقصوداً (تصحيح سابق) اضغط موافقة للمتابعة، وإلا اضغط إلغاء وصحِّح الرقم.`);
          if (!proceed) return "يرجى تصحيح «المستخلص سابقاً (تراكمي)» لمطابقة آخر مستخلص فعلي، أو تأكيد التنبيه للمتابعة.";
        }
      }
      if (vals.stage === "معتمد (بانتظار الصرف)" || vals.stage === "محصَّل بالكامل") {
        if (vals.approvedAmount === "" || vals.approvedAmount == null) return "أدخل المبلغ المعتمد فعلياً من المالك قبل نقل المستخلص لهذه المرحلة.";
      }
      if (vals.stage === "محصَّل بالكامل" && (!vals.paidAmount || Number(vals.paidAmount) <= 0)) {
        return "أدخل المبلغ المحصَّل فعلياً قبل تعليم المستخلص كـ«محصَّل بالكامل».";
      }
      return null;
    },
  },
  claims: { collection: "claims", fields: claimFields, add: genericAdd("claims"),
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "claims")) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
      const old = (STATE.data.claims || []).find((c) => c.id === id);
      // قرار الاعتماد (الحالة + المبلغ/الأيام المعتمدة) يُغذِّي مباشرة حساب BAC/EVM الحقيقي — لا يجوز أن
      // يُقرِّره مُقدِّم المطالبة نفسه (غالباً مدير المشروع)، بل من يملك سلطة مراجعة تعاقدية حقيقية فعلياً
      const financialReviewerRoles = ["المحاسب العام", "مدير عام", "مالك الشركة"];
      if (old && STATE.user && !financialReviewerRoles.includes(STATE.user.role)) {
        vals = Object.assign({}, vals, { status: old.status, amountApproved: old.amountApproved, daysApproved: old.daysApproved });
      }
      genericUpdate("claims")(id, vals);
    },
    remove: genericRemove("claims"),
    validate: (vals) => {
      if (vals.amountClaimed !== "" && vals.amountClaimed != null && Number(vals.amountClaimed) < 0) return "المبلغ المطالَب به لا يمكن أن يكون سالباً.";
      if (vals.amountApproved !== "" && vals.amountApproved != null && Number(vals.amountApproved) < 0) return "المبلغ المعتمد لا يمكن أن يكون سالباً.";
      if (Number(vals.amountApproved || 0) > Number(vals.amountClaimed || 0)) return "المبلغ المعتمد لا يمكن أن يتجاوز المبلغ المطالَب به.";
      if (vals.daysClaimed !== "" && vals.daysClaimed != null && Number(vals.daysClaimed) < 0) return "أيام التمديد المطالَب بها لا يمكن أن تكون سالبة.";
      if (Number(vals.daysApproved || 0) > Number(vals.daysClaimed || 0)) return "أيام التمديد المعتمدة لا يمكن أن تتجاوز الأيام المطالَب بها.";
      return null;
    } },
  subcontractorCertificates: {
    collection: "subcontractorCertificates", fields: subcontractorCertFields,
    add: genericAdd("subcontractorCertificates"),
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "subcontractorCertificates")) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
      const old = (STATE.data.subcontractorCertificates || []).find((c) => c.id === id);
      const financialReviewerRoles = ["المحاسب العام", "مدير عام", "مالك الشركة"];
      if (old && STATE.user && !financialReviewerRoles.includes(STATE.user.role)) {
        vals = Object.assign({}, vals, { stage: old.stage, approvedAmount: old.approvedAmount, reviewedDate: old.reviewedDate, bankAccountId: old.bankAccountId, paidAmount: old.paidAmount });
      }
      const oldPaid = Number(old ? old.paidAmount || 0 : 0);
      const newPaid = Number(vals.paidAmount || 0);
      genericUpdate("subcontractorCertificates")(id, vals);
      if (newPaid > oldPaid) autoCreateLedgerEntry(vals.projectId, "مصروف", newPaid - oldPaid, `دفعة لمقاول من الباطن — مستخلص ${vals.number || id}`, "subcontractorCertificate", id, vals.bankAccountId);
    },
    remove: genericRemove("subcontractorCertificates"),
    validate: (vals, editingId) => {
      if (Number(vals.grossValueCumulative || 0) < Number(vals.previousCertifiedCumulative || 0)) {
        return "القيمة التراكمية للأعمال المنفذة لا يمكن أن تقل عن المستخلص سابقاً (تراكمي).";
      }
      if (vals.retentionPercent !== "" && vals.retentionPercent != null && (Number(vals.retentionPercent) < 0 || Number(vals.retentionPercent) > 100)) {
        return "نسبة المحتجز يجب أن تكون بين 0 و100.";
      }
      const priorSubCerts = (STATE.data.subcontractorCertificates || []).filter((c) => c.projectId === vals.projectId && c.id !== editingId);
      if (priorSubCerts.length) {
        const actualLastCumSub = Math.max(...priorSubCerts.map((c) => Number(c.grossValueCumulative || 0)));
        const enteredSub = Number(vals.previousCertifiedCumulative || 0);
        if (enteredSub !== actualLastCumSub) {
          const proceedSub = confirm(`تنبيه دقّة: أدخلت «المستخلص سابقاً» بقيمة ${fmtMoney(enteredSub)}، بينما آخر مستخلص فعلي مسجَّل لهذا المشروع قيمته التراكمية ${fmtMoney(actualLastCumSub)}.\n\nإن كان هذا مقصوداً (تصحيح سابق) اضغط موافقة للمتابعة، وإلا اضغط إلغاء وصحِّح الرقم.`);
          if (!proceedSub) return "يرجى تصحيح «المستخلص سابقاً (تراكمي)» لمطابقة آخر مستخلص فعلي، أو تأكيد التنبيه للمتابعة.";
        }
      }
      if (vals.stage === "معتمد للصرف" || vals.stage === "مدفوع") {
        if (vals.approvedAmount === "" || vals.approvedAmount == null) return "أدخل المبلغ المعتمد فعلياً للصرف قبل نقل المستخلص لهذه المرحلة.";
      }
      if (vals.stage === "مدفوع" && (!vals.paidAmount || Number(vals.paidAmount) <= 0)) {
        return "أدخل المبلغ المدفوع فعلياً قبل تعليم المستخلص كـ«مدفوع».";
      }
      return null;
    },
  },
  correspondence: { collection: "correspondence", fields: correspondenceFields, add: genericAdd("correspondence"), update: genericUpdate("correspondence"), remove: genericRemove("correspondence") },
  meetings: {
    collection: "meetings", fields: meetingFields,
    add: genericAdd("meetings"), update: genericUpdate("meetings"),
    remove: (id) => {
      const linked = (STATE.data.decisions || []).some((d) => d.meetingId === id);
      if (linked) { alert("لا يمكن حذف هذا الاجتماع لوجود قرارات/بنود متابعة مرتبطة به. احذف تلك القرارات أولاً أو أزل الربط."); return; }
      genericRemove("meetings")(id);
    },
  },
  decisions: { collection: "decisions", fields: decisionFields, add: genericAdd("decisions"), update: genericUpdate("decisions"), remove: genericRemove("decisions") },
  punchlist: { collection: "punchlist", fields: punchlistFields,
    add: (vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "punchlist")) { alert("دورك الحالي لا يملك صلاحية الإضافة هنا."); return; }
      const isGM = STATE.user && (STATE.user.role === "مدير عام" || STATE.user.role === "مالك الشركة");
      const row = Object.assign({ id: uid(), createdByRole: STATE.user ? STATE.user.role : "", createdByUserId: STATE.user ? STATE.user.id : null, gmLocked: isGM, updatedAt: Date.now() }, vals);
      STATE.data.punchlist = [...(STATE.data.punchlist || []), row];
      logAudit("create", "punchlist", row.id, `${row.itemNumber} — ${row.description || ""}`);
      if (row.projectId) {
        const priorSimilar = (STATE.data.punchlist || []).filter((p) => p.id !== row.id && p.projectId === row.projectId && p.location === row.location && p.category === row.category && row.location && row.category);
        emitProjectEvent({
          projectId: row.projectId, eventType: priorSimilar.length ? "NCR_REPEATED" : "NCR_CREATED", sourceEntity: "PunchlistItem", sourceEntityId: row.id,
          newState: { location: row.location, category: row.category, severity: row.severity },
          severity: priorSimilar.length ? "warn" : "info", confidence: 1,
          evidence: priorSimilar.length ? [`${priorSimilar.length} بند سابق بنفس الموقع والتصنيف (${row.location} — ${row.category})`] : [`بند جديد: ${row.itemNumber}`],
        });
      }
      saveData(STATE.data);
    },
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "punchlist")) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
      const isGM = STATE.user && (STATE.user.role === "مدير عام" || STATE.user.role === "مالك الشركة");
      STATE.data.punchlist = (STATE.data.punchlist || []).map((r) => {
        if (r.id !== id) return r;
        // حماية فعلية وقت الكتابة: بند أنشأه GM لا يستطيع PM تغيير تعريفه الأصلي، فقط حقول التنفيذ
        if (r.gmLocked && !isGM) {
          const protectedVals = Object.assign({}, vals);
          PUNCHLIST_DEFINITION_FIELDS.forEach((f) => { protectedVals[f] = r[f]; });
          return Object.assign({}, r, protectedVals, { updatedAt: Date.now() });
        }
        return Object.assign({}, r, vals, { updatedAt: Date.now() });
      });
      logAudit("update", "punchlist", id, vals.description || id);
      saveData(STATE.data);
    },
    remove: genericRemove("punchlist") },
  documents: { collection: "documents", fields: documentFields, add: genericAdd("documents"),
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "documents")) { alert("دورك الحالي لا يملك صلاحية التعديل هنا."); return; }
      STATE.data.documents = (STATE.data.documents || []).map((d) => {
        if (d.id !== id) return d;
        const versions = d.versions || [];
        const attachmentChanged = vals.attachment !== undefined && vals.attachment !== d.attachment && d.attachment;
        const updated = Object.assign({}, d, vals, {
          versions: attachmentChanged ? [...versions, { fileData: d.attachment, replacedAt: Date.now(), replacedBy: (STATE.user && STATE.user.name) || "—" }] : versions,
          lastEditedBy: STATE.user && STATE.user.name, updatedAt: Date.now(),
        });
        return updated;
      });
      const updatedDoc = STATE.data.documents.find((d) => d.id === id);
      logAudit("update", "documents", id, getRecordLabel(updatedDoc));
      saveData(STATE.data);
    },
    remove: genericRemove("documents"),
    validate: (vals) => (vals.issueDate && vals.expiryDate && vals.expiryDate < vals.issueDate) ? "تاريخ الانتهاء لا يمكن أن يكون قبل تاريخ الإصدار." : null },
  users: {
    collection: "users", fields: userFields,
    add: (vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "users")) { alert("دورك الحالي لا يملك صلاحية إنشاء حسابات مستخدمين."); return; }
      const salt = generateSalt();
      const row = Object.assign({}, vals, { id: uid(), salt, passwordHash: hashPassword(vals.password, salt), password: undefined, updatedAt: Date.now() });
      STATE.data.users = [...(STATE.data.users || []), row];
      logAudit("create", "users", row.id, `${row.name} (${row.role}) — حساب جديد: ${row.username}`);
      saveData(STATE.data);
    },
    update: (id, vals) => {
      if (STATE.user && !canEdit(STATE.user.role, "users")) { alert("دورك الحالي لا يملك صلاحية تعديل حسابات المستخدمين."); return; }
      let passwordChanged = false;
      STATE.data.users = (STATE.data.users || []).map((u) => {
        if (u.id !== id) return u;
        const updated = Object.assign({}, u, vals);
        if (vals.password) {
          // كلمة مرور جديدة فعلاً — أعِد التجزئة بملح جديد
          const salt = generateSalt();
          updated.salt = salt;
          updated.passwordHash = hashPassword(vals.password, salt);
          passwordChanged = true;
        } else {
          // تُركت فارغة — أبقِ التجزئة والملح الحاليين كما هما
          updated.passwordHash = u.passwordHash;
          updated.salt = u.salt;
        }
        if (vals.status && vals.status !== u.status) {
          if (vals.status === "نشط") updated.failedLoginAttempts = 0; // إعادة تصفير المحاولات الفاشلة عند إعادة التفعيل — لا يُقفَل فوراً من رصيد قديم
          logAudit("update", "users", id, `تغيير حالة الحساب: ${u.status || "نشط"} ← ${vals.status} — بواسطة ${STATE.user ? STATE.user.name : "؟"}`);
        }
        updated.password = undefined;
        updated.updatedAt = Date.now();
        return updated;
      });
      logAudit("update", "users", id, `${vals.name || id}${passwordChanged ? " (تغيير كلمة المرور)" : ""}`);
      saveData(STATE.data);
    },
    remove: (id) => {
      if (STATE.user && STATE.user.id === id) { alert("لا يمكنك حذف حسابك الحالي وأنت مسجّل الدخول به."); return; }
      genericRemove("users")(id);
    },
    blankFieldsOnEdit: ["password"],
    validate: (vals, editingId) => {
      const uname = String(vals.username || "").trim();
      if (!uname) return "اسم المستخدم مطلوب.";
      if (!editingId && (!vals.password || String(vals.password).length < 4)) return "كلمة المرور مطلوبة (٤ أحرف على الأقل) عند إنشاء حساب جديد.";
      if (vals.password && String(vals.password).length < 4) return "كلمة المرور يجب أن تكون ٤ أحرف على الأقل.";
      const dup = (STATE.data.users || []).some((u) => u.id !== editingId && String(u.username).trim().toLowerCase() === uname.toLowerCase());
      if (dup) return "اسم المستخدم هذا مُستخدَم من قبل. اختر اسماً آخر.";
      return null;
    },
  },
};
