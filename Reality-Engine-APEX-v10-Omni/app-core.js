/* ============================================================
   نظام إدارة المشاريع المتكامل — نسخة مستقلة (بدون إنترنت/بدون Claude)
   تخزين محلي بالكامل (localStorage) + إمكانية تصدير/استيراد ملف JSON
   للمزامنة اليدوية بين الأجهزة.
   ============================================================ */

/* ---------------- Helpers ---------------- */
const uid = () => Math.random().toString(36).slice(2, 10);

/* ============================================================
   بنية تحتية مشتركة عامة (لا خاصة بمجال واحد) — ناقل أحداث حقيقي
   وعامل فعلياً، وسجل محوِّلات (Adapters) بعقد صريح. أي محرك (Digital
   Twin، الجدولة، وأي محرك مستقبلي) يستدعي هذا المصنع ليُنشئ نسخته
   الخاصة، بدل تكرار نفس منطق النشر/الاشتراك في كل مجال على حدة —
   إصلاح معماري حقيقي اكتُشف أثناء مراجعة محرك الجدولة: كنت على وشك
   تكرار نفس الكود الذي بنيته لمحرك التوأم الرقمي بالضبط.
   ============================================================ */
function createEventBus() {
  const listeners = {};
  return {
    on(eventName, handler) {
      (listeners[eventName] = listeners[eventName] || []).push(handler);
      return () => { listeners[eventName] = (listeners[eventName] || []).filter((h) => h !== handler); };
    },
    emit(eventName, payload) {
      (listeners[eventName] || []).forEach((h) => { try { h(payload); } catch (e) { console.error(`خطأ في مُستمِع الحدث "${eventName}":`, e); } });
    },
  };
}
function createAdapterRegistry(domainLabel) {
  const adapters = {};
  return {
    register(name, adapter) {
      if (typeof adapter.supports !== "function" || typeof adapter.parse !== "function") {
        throw new Error(`محوِّل "${name}" (${domainLabel}) يجب أن يوفّر الدالتين supports() وparse() ليلتزم بالعقد.`);
      }
      adapters[name] = adapter;
    },
    findFor(format) { return Object.values(adapters).find((a) => a.supports(format)) || null; },
    all() { return Object.assign({}, adapters); },
  };
}

/* ============================================================
   تجزئة كلمات المرور (SHA-256 متزامن + ملح عشوائي لكل مستخدم)
   ملاحظة صريحة: هذا يحمي من قراءة كلمات المرور كنص صريح في حال
   اطّلع أحد على البيانات المحلية أو نسخة المزامنة السحابية — لكنه
   ليس بديلاً عن حماية خادم حقيقي (لا حدّ لمحاولات الدخول، لا انتهاء
   صلاحية جلسة). استُخدم SHA-256 متزامن بدل واجهة SubtleCrypto غير
   المتزامنة تفادياً لإعادة هيكلة كامل تدفق الحفظ المتزامن في النظام.
   ============================================================ */
function sha256Hex(str) {
  function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
  const maxWord = Math.pow(2, 32);
  let result = "";
  let words = [];
  const utf8 = unescape(encodeURIComponent(str));
  let asciiStr = utf8;
  const asciiBitLength = asciiStr.length * 8;

  let hash = [];
  let k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  asciiStr += "\x80";
  while (asciiStr.length % 64 - 56) asciiStr += "\x00";
  for (let i = 0; i < asciiStr.length; i++) {
    const j = asciiStr.charCodeAt(i);
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = ((asciiBitLength / maxWord) | 0);
  words[words.length] = (asciiBitLength);

  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0);
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? "0" : "") + b.toString(16);
    }
  }
  return result;
}
function generateSalt() { return uid() + uid(); }
function hashPassword(password, salt) { return sha256Hex(salt + ":" + password); }
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (isoDate, days) => { const d = new Date(isoDate); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const fmtMoney = (n) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date(todayISO())) / 86400000);
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const daysBetween = (a, b) => {
  if (!a || !b) return 1;
  return Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000));
};
const addDays = (dateStr, days) => {
  if (!dateStr) return dateStr;
  const dt = new Date(dateStr);
  dt.setDate(dt.getDate() + (Number(days) || 0));
  return dt.toISOString().slice(0, 10);
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- أثر أوامر التغيير المعتمدة على الميزانية والجدول الزمني ---------------- */
function approvedChangeOrdersImpact(projectId, changeOrders) {
  const approved = (changeOrders || []).filter((c) => c.projectId === projectId && c.status === "معتمد");
  const costImpact = approved.reduce((s, c) => s + (Number(c.costImpact) || 0), 0);
  const scheduleImpactDays = approved.reduce((s, c) => s + (Number(c.scheduleImpactDays) || 0), 0);
  return { costImpact, scheduleImpactDays, count: approved.length };
}
function approvedClaimsImpact(projectId, claims) {
  // مطالبة مُعتمَدة (كاملة أو جزئياً) تُمثِّل تعديلاً حقيقياً مُلزِماً على قيمة العقد وجدوله —
  // نفس أثر أمر التغيير المُعتمَد تماماً، ولم تكن مُدرَجة هنا سابقاً (كانت تُعرَض فقط، لا تُحتسَب فعلياً)
  const approved = (claims || []).filter((c) => c.projectId === projectId && (c.status === "معتمدة كاملة" || c.status === "معتمدة جزئياً"));
  const costImpact = approved.reduce((s, c) => s + (Number(c.amountApproved) || 0), 0);
  const scheduleImpactDays = approved.reduce((s, c) => s + (Number(c.daysApproved) || 0), 0);
  return { costImpact, scheduleImpactDays, count: approved.length };
}

/* ---------------- Earned Value Management (PMI) ---------------- */
function computeEVM(project, budgetItems, changeOrders) {
  const changeOrderImpact = approvedChangeOrdersImpact(project.id, changeOrders);
  const claimImpact = approvedClaimsImpact(project.id, STATE.data ? STATE.data.claims : null);
  const impact = { costImpact: changeOrderImpact.costImpact + claimImpact.costImpact, scheduleImpactDays: changeOrderImpact.scheduleImpactDays + claimImpact.scheduleImpactDays };
  const originalBAC = Number(project.contractValue) || 0;
  const BAC = originalBAC + impact.costImpact;
  const items = budgetItems.filter((b) => b.projectId === project.id);
  const AC = items.reduce((s, b) => s + Number(b.actual || 0), 0);
  const effectiveEndDate = impact.scheduleImpactDays ? addDays(project.endDate, impact.scheduleImpactDays) : project.endDate;
  let timeElapsedPct = null;
  if (project.startDate && effectiveEndDate) {
    const total = daysBetween(project.startDate, effectiveEndDate);
    const elapsed = daysBetween(project.startDate, todayISO());
    timeElapsedPct = clamp((elapsed / total) * 100, 0, 100);
  }
  const PV = timeElapsedPct != null ? (BAC * timeElapsedPct) / 100 : null;
  const EV = (BAC * (Number(project.completion) || 0)) / 100;
  const CPI = AC > 0 ? EV / AC : null;
  const SPI = PV > 0 ? EV / PV : null;
  const EAC = CPI && CPI > 0 ? BAC / CPI : BAC;
  const ETC = EAC - AC;
  const VAC = BAC - EAC;
  let health = "info";
  if (CPI != null && SPI != null) {
    if (CPI >= 0.95 && SPI >= 0.95) health = "good";
    else if (CPI < 0.85 || SPI < 0.85) health = "danger";
    else health = "warn";
  }
  return {
    BAC, originalBAC, changeOrdersCostImpact: impact.costImpact, changeOrdersScheduleImpactDays: impact.scheduleImpactDays,
    approvedChangeOrdersCount: impact.count, effectiveEndDate,
    AC, PV, EV, CPI, SPI, EAC, ETC, VAC, timeElapsedPct, health,
  };
}

function deriveTaskStatus(t) {
  const comp = Number(t.completion) || 0;
  if (comp >= 100) return "منتهي";
  const today = todayISO();
  if (t.end && today > t.end) return "متأخر";
  if (t.start && today >= t.start) return "قيد التنفيذ";
  return "لم يبدأ";
}
function deriveDecisionStatus(d) {
  if (d.status === "منجزة") return "منجزة";
  const today = todayISO();
  if (d.dueDate && today > d.dueDate) return "متأخرة";
  return "مفتوحة";
}
/* دالة عامة لاشتقاق حالة أي بند «متابعة» له تاريخ إغلاق مستهدف وحالة يدوية —
   تتقبّل تسميات الحالات لأن الصيغة النحوية العربية تختلف بحسب الكلمة
   (بند/ملاحظة مؤنث "مفتوحة"، طلب/فحص مذكر "مفتوح")، فتُمنع بذلك الأخطاء
   النحوية والمقارنات الخاطئة بين وحدات مختلفة تتشارك المنطق نفسه. */
function deriveTrackedStatus(item, labels) {
  if (item.status === labels.closed) return labels.closed;
  if (labels.rejected && item.status === labels.rejected) return labels.rejected;
  const today = todayISO();
  if (item.targetCloseDate && today > item.targetCloseDate) return labels.overdue;
  return item.status === labels.inProgress ? labels.inProgress : labels.open;
}
function derivePunchStatus(item) {
  return deriveTrackedStatus(item, { open: "مفتوحة", inProgress: "قيد المراجعة", closed: "مغلقة", overdue: "متأخرة", rejected: "مرفوضة" });
}
function deriveQCStatus(item) {
  return deriveTrackedStatus(item, { open: "مفتوح", inProgress: "قيد المعالجة", closed: "مغلق", overdue: "متأخر" });
}
function deriveHSEStatus(item) {
  return deriveTrackedStatus(item, { open: "مفتوح", inProgress: "قيد المعالجة", closed: "مغلق", overdue: "متأخر" });
}
function deriveDocumentStatus(doc) {
  if (!doc.expiryDate) return "دائم";
  const dd = daysUntil(doc.expiryDate);
  if (dd == null) return "دائم";
  if (dd < 0) return "منتهي";
  if (dd <= 30) return "ينتهي قريباً";
  return "ساري";
}
function deriveProjectStatus(p) {
  const comp = Number(p.completion) || 0;
  if (comp >= 100) return "منتهي";
  if (p.startDate && p.endDate) {
    const total = daysBetween(p.startDate, p.endDate);
    const elapsed = daysBetween(p.startDate, todayISO());
    const expected = clamp((elapsed / total) * 100, 0, 100);
    if (comp < expected - 10) return "متأخر";
  }
  return "قيد التنفيذ";
}

/* ---------------- Simplified CPM ---------------- */
/* ============================================================
   نواة CPM موحَّدة — الخوارزمية الحقيقية الوحيدة (تمرير أمامي/خلفي)
   تُستدعى من كل من الحساب المبني على تواريخ فعلية والحساب المبني
   على مُدَد افتراضية (مونت كارلو). كانتا نسختين مستقلتين من نفس
   المنطق بالضبط قبل هذا التوحيد — خلل معماري حقيقي اكتُشف أثناء
   مراجعة محرك الجدولة، وأثبتّ إصلاحه بإعادة تشغيل كل الاختبارات
   السابقة (اليدوية والإحصائية) بلا أي تغيير في النتائج.
   getDuration(taskId) => عدد الأيام — مصدر المدة يختلف حسب الاستخدام،
   المنطق نفسه لا يتغيّر إطلاقاً.
   ============================================================ */
/* ============================================================
   إعدادات محرك الجدولة المركزية — نفس مبدأ DigitalTwinConfig، تجميع
   كل عتبة/معامل كان مبعثراً في أماكن مختلفة (معاملات مونت كارلو
   الافتراضية، معامل التعافي التقريبي) في سطح واحد قابل للتعديل.
   ============================================================ */
const ScheduleConfig = {
  monteCarloDefaultOptimisticFactor: 0.8,
  monteCarloDefaultPessimisticFactor: 1.3,
  recoveryHeuristicExpediteFactor: 0.3,
  dcmaLongDurationDays: 44, // ممارسة شائعة (DCMA 14-Point Assessment)
  dcmaHighFloatDays: 44,
};

/* ============================================================
   مستودع بيانات الجدولة (Repository Pattern) — نفس مبدأ
   DigitalTwinRepository بالضبط. نقطة الامتداد الحقيقية نفسها: عند
   خادم حقيقي مستقبلاً، تُستبدَل هذه الكائنات فقط بنسخة تستدعي API
   حقيقياً، بصفر تغيير في أي دالة عمل تستخدم المستودع.
   ============================================================ */
const ScheduleEvents = createEventBus();
const ScheduleRepository = {
  getTasks(projectId) { return (STATE.data.tasks || []).filter((t) => !projectId || t.projectId === projectId); },
  getTaskById(id) { return (STATE.data.tasks || []).find((t) => t.id === id) || null; },
  saveTask(task) {
    const isNew = !task.id;
    if (isNew) task.id = uid();
    const idx = (STATE.data.tasks || []).findIndex((t) => t.id === task.id);
    if (idx >= 0) STATE.data.tasks[idx] = task; else STATE.data.tasks.push(task);
    ScheduleEvents.emit(isNew ? "task:created" : "task:updated", task);
    return task;
  },
  getBaselines(projectId) { const p = (STATE.data.projects || []).find((pr) => pr.id === projectId); return (p && p.baselines) || []; },
};

/* ============================================================
   شبكة معرفة المشروع (Project Knowledge Graph) — طبقة استعلام
   منطقية فوق البيانات الموجودة فعلياً، لا قاعدة بيانات رسومية
   جديدة. كل علاقة هنا تُحسَب من حقول حقيقية موجودة أصلاً في النظام
   — لا بيانات مُصنَّعة. مصمَّمة لتُستبدَل لاحقاً بـPostgreSQL/رسم
   بياني حقيقي على الخادم بلا تغيير منطق الأعمال المستخدِم لها.
   ============================================================ */
const RELATIONSHIP_DEFINITIONS = [
  { type: "belongsTo", from: "Activity", to: "Project", resolve: (t) => t.projectId ? [t.projectId] : [] },
  { type: "dependsOn", from: "Activity", to: "Activity", resolve: (t) => (t.predecessorDetails || []).map((p) => p.taskId).concat(t.predecessors || []) },
  { type: "performedBy", from: "Activity", to: "Resource", resolve: (t) => t.responsibleResourceId ? [t.responsibleResourceId] : [] },
  { type: "belongsTo", from: "Invoice", to: "Project", resolve: (i) => i.projectId ? [i.projectId] : [] },
  { type: "linkedTo", from: "Invoice", to: "Custody", resolve: (i) => i.custodyId ? [i.custodyId] : [] },
  { type: "claimsAgainst", from: "Certificate", to: "Contract", resolve: (c) => c.contractId ? [c.contractId] : [] },
  { type: "belongsTo", from: "Certificate", to: "Project", resolve: (c) => c.projectId ? [c.projectId] : [] },
  { type: "belongsTo", from: "Risk", to: "Project", resolve: (r) => r.projectId ? [r.projectId] : [] },
  { type: "claimsAgainst", from: "Claim", to: "Contract", resolve: (c) => c.contractId ? [c.contractId] : [] },
  { type: "belongsTo", from: "PunchlistItem", to: "Project", resolve: (p) => p.projectId ? [p.projectId] : [] },
  { type: "belongsTo", from: "GmNote", to: "Project", resolve: (n) => n.projectId ? [n.projectId] : [] },
  { type: "assignedTo", from: "GmNote", to: "Resource", resolve: (n) => n.assignedPmResourceId ? [n.assignedPmResourceId] : [] },
  { type: "belongsTo", from: "DailyReport", to: "Project", resolve: (r) => r.projectId ? [r.projectId] : [] },
  { type: "documents", from: "DailyReport", to: "Activity", resolve: (r) => r.completedTaskIds || [] },
  { type: "belongsTo", from: "ChangeOrder", to: "Project", resolve: (c) => c.projectId ? [c.projectId] : [] },
  { type: "allocatedTo", from: "Resource", to: "Project", resolve: (r) => getResourceProjectIds(r) },
  { type: "manages", from: "Resource", to: "Project", resolve: (r) => (STATE.data.projects || []).filter((p) => p.projectManagerId === r.id).map((p) => p.id) },
  { type: "requests", from: "ResourceTransferRequest", to: "Resource", resolve: (req) => req.resourceId ? [req.resourceId] : [] },
  { type: "targets", from: "ResourceTransferRequest", to: "Project", resolve: (req) => req.targetProjectId ? [req.targetProjectId] : [] },
  { type: "belongsTo", from: "Asset", to: "Project", resolve: (a) => a.projectId ? [a.projectId] : [] },
  { type: "linkedTo", from: "Asset", to: "Activity", resolve: (a) => a.linkedTaskId ? [a.linkedTaskId] : [] },
  { type: "linkedTo", from: "Asset", to: "Contract", resolve: (a) => a.linkedContractId ? [a.linkedContractId] : [] },
  { type: "linkedTo", from: "Asset", to: "BudgetItem", resolve: (a) => a.linkedBudgetItemId ? [a.linkedBudgetItemId] : [] },
  { type: "childOf", from: "Asset", to: "Asset", resolve: (a) => a.parentAssetId ? [a.parentAssetId] : [] },
];
function getEntityRelationships(entityType, entity) {
  const outgoing = RELATIONSHIP_DEFINITIONS.filter((r) => r.from === entityType).map((r) => ({ type: r.type, targetType: r.to, targetIds: r.resolve(entity) })).filter((r) => r.targetIds.length);
  return outgoing;
}
/* استعلام عكسي: كل الكائنات من نوع معيَّن التي ترتبط بكائن هدف محدَّد.
   مثال: كل الفواتير المرتبطة بمشروع P — queryIncomingRelationships("Project", p.id, "Invoice") */
function queryIncomingRelationships(targetType, targetId, sourceType) {
  const collectionMap = { Project: "projects", Activity: "tasks", Invoice: "invoices", Certificate: "certificates",
    Risk: "risks", Claim: "claims", PunchlistItem: "punchlist", GmNote: "gmNotes", DailyReport: "dailyReports",
    ChangeOrder: "changeOrders", Resource: "resourcePool", Contract: "contracts", Custody: "custodies", ResourceTransferRequest: "resourceTransferRequests", Asset: "projectAssets", BudgetItem: "budgetItems" };
  const collection = collectionMap[sourceType];
  if (!collection) return [];
  const defs = RELATIONSHIP_DEFINITIONS.filter((r) => r.from === sourceType && r.to === targetType);
  if (!defs.length) return [];
  return (STATE.data[collection] || []).filter((entity) => defs.some((d) => d.resolve(entity).includes(targetId)));
}

/* ============================================================
   محرك أحداث المشروع (Project Event Engine) — سجل بنيوي للتغييرات
   المهمّة فقط، لا كل تفاعل واجهة تافه. كل حدث حقيقي مرتبط ببيانات
   فعلية، لا مُصنَّع.
   ============================================================ */
let projectEventSequenceCounter = 0;
/* ============================================================
   محرك سير العمل والاعتماد المركزي (Workflow & Approval Engine) —
   محرك واحد قابل لإعادة الاستخدام لكل الوحدات، لا سير عمل مكتوب
   يدوياً بداخل كل وحدة كما كان (فحصت هذا فعلياً: 4 آليات اعتماد
   منفصلة كانت موجودة قبل هذا — GM Notes، طلبات نقل المعدات،
   مستخلصات المالك، قوائم التسليم — كل واحدة بمنطقها الخاص).

   البنية: WorkflowDefinition (له نسخة/version؛ التعديل لا يُغيِّر
   نسخاً قديمة تعمل فعلاً) → WorkflowInstance (لكل كائن أعمال حقيقي)
   → History (سجل غير قابل للتعديل بعد الاعتماد).
   ============================================================ */
function getActiveWorkflowDefinition(moduleKey) {
  return (STATE.data.workflowDefinitions || []).find((w) => w.module === moduleKey && w.active);
}
function startWorkflowInstance(moduleKey, businessObjectId, projectId) {
  const def = getActiveWorkflowDefinition(moduleKey);
  if (!def || !def.stages.length) return null;
  const firstStage = def.stages[0];
  const instance = {
    id: uid(), workflowDefId: def.id, workflowVersion: def.version, module: moduleKey,
    businessObjectId, projectId, currentStageId: firstStage.id, status: "قيد التنفيذ",
    startedBy: STATE.user ? STATE.user.name : "النظام", startedByUserId: STATE.user ? STATE.user.id : null, startedDate: todayISO(),
    history: [{ stageId: firstStage.id, stageName: firstStage.name, action: "بدء", user: STATE.user ? STATE.user.name : "النظام", userId: STATE.user ? STATE.user.id : null, role: STATE.user ? STATE.user.role : null, date: todayISO(), timestamp: Date.now(), comment: "" }],
  };
  STATE.data.workflowInstances = STATE.data.workflowInstances || [];
  STATE.data.workflowInstances.push(instance);
  return instance;
}
function getWorkflowInstanceFor(moduleKey, businessObjectId) {
  return (STATE.data.workflowInstances || []).find((i) => i.module === moduleKey && i.businessObjectId === businessObjectId);
}
/* حل المُكلَّف الفعلي بمرحلة — دور ثابت، مستخدم محدَّد، أو شرائح مبلغ (سلطة اعتماد مالية قابلة للتعديل، لا مكتوبة في الكود) */
function resolveStageApprover(stage, businessObject) {
  if (!stage.approverRule) return null;
  const rule = stage.approverRule;
  if (rule.type === "role") return { type: "role", role: rule.role };
  if (rule.type === "user") return { type: "user", userId: rule.userId };
  if (rule.type === "amount-tiered") {
    const amount = Number((businessObject && businessObject[rule.amountField || "amount"]) || 0);
    const tiers = (STATE.data.approvalAuthorityLevels || {})[rule.module] || rule.tiers || [];
    const tier = tiers.find((t) => amount <= t.maxAmount) || tiers[tiers.length - 1];
    return tier ? { type: "role", role: tier.role, tierLabel: `حتى ${fmtMoney(tier.maxAmount)}` } : null;
  }
  return null;
}
function userMatchesApprover(user, approver) {
  if (!approver) return false;
  if (approver.type === "role") return user.role === approver.role;
  if (approver.type === "user") return user.id === approver.userId;
  return false;
}
/* فصل المهام (Separation of Duties) — من أنشأ لا يعتمد، مبدأ عام يُفحَص هنا مرة واحدة بدل تكراره في كل وحدة */
function violatesSeparationOfDuties(instance, user) {
  return !!(instance.startedByUserId && instance.startedByUserId === user.id);
}
function canActOnWorkflowInstance(user, instance, action) {
  if (!user) return { allowed: false, reason: "بلا مستخدم." };
  const def = (STATE.data.workflowDefinitions || []).find((w) => w.id === instance.workflowDefId);
  if (!def) return { allowed: false, reason: "تعريف سير العمل غير موجود." };
  const stage = def.stages.find((s) => s.id === instance.currentStageId);
  if (!stage) return { allowed: false, reason: "المرحلة الحالية غير معروفة." };
  if (!can(user, `${instance.module}.${action}`, { projectId: instance.projectId })) return { allowed: false, reason: "لا تملك صلاحية هذا الإجراء على هذه الوحدة/المشروع." };
  if ((action === "approve" || action === "reject") && stage.enforceSoD !== false && violatesSeparationOfDuties(instance, user)) {
    return { allowed: false, reason: "فصل المهام: من أنشأ هذا الطلب لا يستطيع اعتماده أو رفضه." };
  }
  const businessObject = (STATE.data[MODULES[instance.module].collection] || []).find((r) => r.id === instance.businessObjectId);
  const approver = resolveStageApprover(stage, businessObject);
  if (approver && (action === "approve" || action === "reject" || action === "return")) {
    const delegatedToMe = (STATE.data.delegations || []).some((d) => d.toUserId === user.id && !d.revoked && d.startDate <= todayISO() && d.endDate >= todayISO() && (d.permissions || []).includes(`${instance.module}.approve`) && userMatchesApprover({ role: d.fromUserRole, id: d.fromUserId }, approver));
    if (!userMatchesApprover(user, approver) && !delegatedToMe) {
      return { allowed: false, reason: `هذه المرحلة تحتاج اعتماد: ${approver.role || "مستخدم محدَّد"}${approver.tierLabel ? " (" + approver.tierLabel + ")" : ""}.` };
    }
  }
  return { allowed: true };
}
function advanceWorkflow(moduleKey, businessObjectId, action, comment) {
  const instance = getWorkflowInstanceFor(moduleKey, businessObjectId);
  if (!instance) return { success: false, error: "لا يوجد سير عمل نشط لهذا العنصر." };
  if (instance.status !== "قيد التنفيذ") return { success: false, error: "سير العمل هذا مكتمل أو مُلغى — لا يمكن اتخاذ إجراء جديد عليه." };
  const check = canActOnWorkflowInstance(STATE.user, instance, action);
  if (!check.allowed) return { success: false, error: check.reason };
  if ((action === "reject" || action === "return") && (!comment || !comment.trim())) return { success: false, error: "يجب كتابة سبب الرفض/الإعادة." };
  const def = (STATE.data.workflowDefinitions || []).find((w) => w.id === instance.workflowDefId);
  const stageIndex = def.stages.findIndex((s) => s.id === instance.currentStageId);
  const currentStage = def.stages[stageIndex];
  let newStageId = instance.currentStageId, newStatus = instance.status;
  if (action === "approve") {
    if (stageIndex < def.stages.length - 1) { newStageId = def.stages[stageIndex + 1].id; }
    else { newStatus = "معتمد"; }
  } else if (action === "reject") {
    newStatus = "مرفوض";
  } else if (action === "return") {
    newStageId = def.stages[0].id; // إعادة للمُقدِّم — يبدأ التصحيح من أول مرحلة قابلة للتعديل
    newStatus = "قيد التنفيذ";
  } else if (action === "resubmit") {
    newStageId = def.stages[Math.min(stageIndex + 1, def.stages.length - 1)].id;
    newStatus = "قيد التنفيذ";
  } else if (action === "cancel") {
    newStatus = "مُلغى";
  }
  const entry = { stageId: newStageId, stageName: (def.stages.find((s) => s.id === newStageId) || currentStage).name, action,
    user: STATE.user.name, userId: STATE.user.id, role: STATE.user.role, date: todayISO(), timestamp: Date.now(), comment: comment || "", previousStageId: instance.currentStageId };
  STATE.data.workflowInstances = STATE.data.workflowInstances.map((i) => i.id === instance.id
    ? Object.assign({}, i, { currentStageId: newStageId, status: newStatus, history: [...i.history, entry] }) : i);
  logAudit("update", "workflowInstances", instance.id, `${moduleKey} #${businessObjectId} — ${action} من ${STATE.user.name}`);
  if (instance.projectId) {
    emitProjectEvent({ projectId: instance.projectId, eventType: "WORKFLOW_" + action.toUpperCase(), sourceEntity: "WorkflowInstance", sourceEntityId: instance.id,
      newState: { stage: entry.stageName, status: newStatus }, severity: action === "reject" ? "danger" : action === "return" ? "warn" : "info",
      evidence: [`${moduleKey}: ${entry.action} — ${entry.stageName}${comment ? " — " + comment : ""}`] });
  }
  // إشعارات مركزية حقيقية عبر NotificationEngine — لا استبدال لـemitProjectEvent، إضافة موازية فقط
  if (typeof NotificationEngine !== "undefined") {
    if ((action === "reject" || action === "return") && instance.startedByUserId) {
      NotificationEngine.emit("workflow", "advanced", { notifyUserId: instance.startedByUserId, moduleKey, businessObjectId, projectId: instance.projectId, action, label: entry.stageName });
    } else if (action === "approve" && newStatus === "قيد التنفيذ") {
      const nextStage = def.stages.find((s) => s.id === newStageId);
      const approver = nextStage ? resolveStageApprover(nextStage, { id: businessObjectId }) : null;
      if (approver && approver.type === "user" && approver.userId) {
        NotificationEngine.emit("workflow", "advanced", { notifyUserId: approver.userId, moduleKey, businessObjectId, projectId: instance.projectId, action, label: entry.stageName });
      } else if (approver && approver.type === "role") {
        (STATE.data.users || []).filter((u) => u.role === approver.role).forEach((u) =>
          NotificationEngine.emit("workflow", "advanced", { notifyUserId: u.id, moduleKey, businessObjectId, projectId: instance.projectId, action, label: entry.stageName }));
      }
    }
  }
  return { success: true, instance: STATE.data.workflowInstances.find((i) => i.id === instance.id) };
}
function checkWorkflowSLA(instance) {
  const def = (STATE.data.workflowDefinitions || []).find((w) => w.id === instance.workflowDefId);
  if (!def) return { overdue: false };
  const stage = def.stages.find((s) => s.id === instance.currentStageId);
  if (!stage || !stage.slaHours) return { overdue: false };
  const lastEntry = instance.history[instance.history.length - 1];
  const hoursElapsed = (Date.now() - lastEntry.timestamp) / 3600000;
  const overdue = hoursElapsed > stage.slaHours;
  const escalationLevel = hoursElapsed > stage.slaHours * 2 ? "تصعيد للمدير" : overdue ? "تذكير" : null;
  return { overdue, hoursElapsed: Math.round(hoursElapsed), slaHours: stage.slaHours, escalationLevel };
}
function getMyWorkflowTasks(user) {
  return (STATE.data.workflowInstances || []).filter((i) => {
    if (i.status !== "قيد التنفيذ") return false;
    const def = (STATE.data.workflowDefinitions || []).find((w) => w.id === i.workflowDefId);
    if (!def) return false;
    const stage = def.stages.find((s) => s.id === i.currentStageId);
    if (!stage) return false;
    const businessObject = (STATE.data[MODULES[i.module].collection] || []).find((r) => r.id === i.businessObjectId);
    const approver = resolveStageApprover(stage, businessObject);
    return approver && userMatchesApprover(user, approver) && !violatesSeparationOfDuties(i, user);
  });
}

function emitProjectEvent({ projectId, eventType, sourceEntity, sourceEntityId, affectedEntities, previousState, newState, severity, confidence, evidence }) {
  STATE.data.projectEvents = STATE.data.projectEvents || [];
  const event = {
    id: uid(), projectId, eventType, timestamp: Date.now(), sequence: projectEventSequenceCounter++,
    sourceEntity, sourceEntityId, affectedEntities: affectedEntities || [],
    previousState: previousState !== undefined ? previousState : null, newState: newState !== undefined ? newState : null,
    severity: severity || "info", confidence: confidence != null ? confidence : 1, evidence: evidence || [],
    createdBy: (STATE.user && STATE.user.name) || "النظام",
  };
  STATE.data.projectEvents.push(event);
  saveData(STATE.data);
  return event;
}
function getProjectEvents(projectId) {
  return (STATE.data.projectEvents || []).filter((e) => e.projectId === projectId).sort((a, b) => (b.timestamp - a.timestamp) || ((b.sequence || 0) - (a.sequence || 0)));
}
function getEventsForEntity(sourceEntity, sourceEntityId) {
  return (STATE.data.projectEvents || []).filter((e) => e.sourceEntity === sourceEntity && e.sourceEntityId === sourceEntityId).sort((a, b) => (b.timestamp - a.timestamp) || ((b.sequence || 0) - (a.sequence || 0)));
}

/* ============================================================
   محرك "لماذا؟" (WHY Engine) — لنشاط متأخر تحديداً، كنقطة انطلاق
   حقيقية. قواعد وحسابات مباشرة على بيانات فعلية، لا استدعاء ذكاء
   اصطناعي لتفسير أرقام — تماماً كما يُطلَب صراحة: الاستدلال يُبنى من
   الأدلة، لا من نص مولَّد بلا مرجع.
   ============================================================ */
function explainActivityDelay(taskId) {
  const task = (STATE.data.tasks || []).find((t) => t.id === taskId);
  if (!task) return { available: false, reason: "النشاط غير موجود." };
  const reasons = [];
  const today = todayISO();
  const isOverdue = task.end && task.end < today && Number(task.completion || 0) < 100;
  if (!isOverdue) return { available: false, reason: "هذا النشاط ليس متأخراً حالياً حسب تاريخ النهاية ونسبة الإنجاز." };

  const daysLate = Math.floor((new Date(today) - new Date(task.end)) / 86400000);
  reasons.push({ type: "FACT", text: `تاريخ النهاية المخطَّط ${task.end}، اليوم ${daysLate} يوماً بعده، ونسبة الإنجاز الحالية ${task.completion || 0}%.` });

  const predDetails = task.predecessorDetails || [];
  if (predDetails.length) {
    if (criticalTaskIds(STATE.data.tasks || []).has(taskId)) {
      reasons.push({ type: "CALCULATION", text: "هذا النشاط على المسار الحرج للمشروع — أي تأخير فيه يؤخِّر تاريخ الانتهاء الكلي مباشرة." });
    }
    const delayedPredecessors = predDetails.map((p) => (STATE.data.tasks || []).find((t) => t.id === p.taskId)).filter((t) => t && t.end && t.end < today && Number(t.completion || 0) < 100);
    if (delayedPredecessors.length) {
      reasons.push({ type: "INFERENCE", text: `${delayedPredecessors.length} من الأنشطة السابقة له لا تزال متأخرة أيضاً (${delayedPredecessors.map((t) => t.name).join("، ")})، وقد يكون هذا سبباً جزئياً.` });
    }
  }

  const responsibleResource = task.responsibleResourceId ? (STATE.data.resourcePool || []).find((r) => r.id === task.responsibleResourceId) : null;
  if (responsibleResource) {
    const theirOtherOverdueTasks = (STATE.data.tasks || []).filter((t) => t.id !== taskId && t.responsibleResourceId === responsibleResource.id && t.end && t.end < today && Number(t.completion || 0) < 100);
    if (theirOtherOverdueTasks.length) {
      reasons.push({ type: "INFERENCE", text: `المسؤول (${responsibleResource.name}) لديه ${theirOtherOverdueTasks.length} نشاطاً متأخراً آخر في نفس الوقت — قد يشير لضغط عمل زائد.` });
    }
  }

  const relatedEvents = getEventsForEntity("Activity", taskId);
  if (relatedEvents.length) {
    reasons.push({ type: "FACT", text: `سجل الأحداث يُظهِر ${relatedEvents.length} حدثاً مرتبطاً بهذا النشاط تحديداً.` });
  }

  return { available: true, taskId, taskName: task.name, daysLate, reasons };
}
function computeCPMCore(tasks, getDuration) {
  const byId = {};
  tasks.forEach((t) => (byId[t.id] = t));
  /* علاقات كل نشاط: [{taskId (السابق), type, lagDays}] — من predecessorDetails
     الحقيقية إن وُجدت (تحفظ النوع والفارق الزمني)، أو مُشتقَّة تلقائياً كـFS
     بفارق صفر من predecessors (توافق كامل مع كل بيانات النظام السابقة). */
  const predEdges = (t) => {
    if (Array.isArray(t.predecessorDetails) && t.predecessorDetails.length) return t.predecessorDetails.filter((e) => byId[e.taskId]);
    return (Array.isArray(t.predecessors) ? t.predecessors : []).filter((id) => byId[id]).map((id) => ({ taskId: id, type: "FS", lagDays: 0 }));
  };
  const succEdges = {}; // لكل سابق: قائمة اللاحقين مع نوع العلاقة والفارق كما تراها منه
  tasks.forEach((t) => (succEdges[t.id] = []));
  tasks.forEach((t) => predEdges(t).forEach((e) => { if (succEdges[e.taskId]) succEdges[e.taskId].push({ taskId: t.id, type: e.type || "FS", lagDays: Number(e.lagDays) || 0 }); }));

  const ES = {}, EF = {};
  const visited = new Set();
  const visit = (id) => {
    if (visited.has(id)) return EF[id];
    visited.add(id);
    const edges = predEdges(byId[id]);
    let es = 0;
    edges.forEach((e) => {
      visit(e.taskId); // تأكّد من حساب السابق أولاً
      const lag = Number(e.lagDays) || 0;
      let candidate;
      if (e.type === "SS") candidate = ES[e.taskId] + lag;
      else if (e.type === "FF") candidate = EF[e.taskId] + lag - getDuration(id);
      else if (e.type === "SF") candidate = ES[e.taskId] + lag - getDuration(id);
      else candidate = EF[e.taskId] + lag; // FS، الافتراضي
      es = Math.max(es, candidate);
    });
    ES[id] = es;
    EF[id] = es + getDuration(id);
    return EF[id];
  };
  tasks.forEach((t) => visit(t.id));
  const projectEnd = Math.max(0, ...tasks.map((t) => EF[t.id] || 0));

  const LF = {}, LS = {};
  const visited2 = new Set();
  const visitBack = (id) => {
    if (visited2.has(id)) return LS[id];
    visited2.add(id);
    const succs = succEdges[id] || [];
    const lsCandidates = [];
    succs.forEach((e) => {
      visitBack(e.taskId);
      const lag = e.lagDays;
      if (e.type === "SS") lsCandidates.push(LS[e.taskId] - lag);
      else if (e.type === "FF") lsCandidates.push(LF[e.taskId] - lag - getDuration(id));
      else if (e.type === "SF") lsCandidates.push(LF[e.taskId] - lag);
      else lsCandidates.push(LS[e.taskId] - lag - getDuration(id)); // FS
    });
    const ls = lsCandidates.length ? Math.min(...lsCandidates) : projectEnd - getDuration(id);
    LS[id] = ls;
    LF[id] = ls + getDuration(id); // اتساق داخلي كامل دائماً: LF = LS + المدة
    return LS[id];
  };
  tasks.forEach((t) => visitBack(t.id));

  const critical = new Set();
  const slack = {};
  tasks.forEach((t) => {
    const s = (LS[t.id] ?? 0) - (ES[t.id] ?? 0);
    slack[t.id] = s;
    if (s <= 0.0001) critical.add(t.id);
  });
  return { critical, slack, ES, EF, LS, LF, projectEnd };
}
function computeCriticalPath(tasks) {
  const dur = (t) => daysBetween(t.start || todayISO(), t.end || todayISO());
  const byId = {};
  tasks.forEach((t) => (byId[t.id] = t));
  const result = computeCPMCore(tasks, (id) => dur(byId[id]));
  return { critical: result.critical, slack: result.slack, ES: result.ES, EF: result.EF, LS: result.LS, LF: result.LF };
}
/* ============================================================
   محاكاة مونت كارلو لمخاطر الجدول الزمني — خوارزمية حقيقية وقياسية
   (نفس ما تفعله Primavera Risk Analysis وSafran فعلياً)، لا بحثاً
   غير محلول. تُعيد حساب شبكة CPM آلاف المرات بمُدَد عشوائية مُستمَدة
   من توزيعات احتمالية حقيقية (Triangular أو PERT)، وتُحصي كم مرة
   انتهى المشروع عند كل تاريخ لبناء توزيع ثقة حقيقي (P10/P50/P80/P90).
   ============================================================ */

/* عيّنة عشوائية من توزيع مثلثي حقيقي (Triangular Distribution) عبر طريقة
   المعكوس التراكمي (Inverse CDF) — صيغة رياضية موصوفة بالكامل، لا تقريب. */
function sampleTriangular(min, mode, max) {
  if (max <= min) return min;
  const u = Math.random();
  const fc = (mode - min) / (max - min);
  if (u < fc) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/* عيّنة من توزيع PERT (تقريب Beta قياسي مستخدَم فعلياً في إدارة المخاطر
   الزمنية) — الصيغة: يُحوَّل PERT إلى Beta(alpha, beta) عبر معاملات
   الشكل القياسية، بمتوسط = (min + 4×mode + max) / 6. */
function samplePERT(min, mode, max) {
  if (max <= min) return min;
  const mean = (min + 4 * mode + max) / 6;
  const alpha = mean === min ? 1 : ((mean - min) * (2 * mode - min - max)) / ((mode - mean) * (max - min) || 1);
  const alphaSafe = alpha > 0 && isFinite(alpha) ? alpha : 2;
  const betaShape = (alphaSafe * (max - mean)) / (mean - min || 1);
  const betaSafe = betaShape > 0 && isFinite(betaShape) ? betaShape : 2;
  // عيّنة Beta عبر نسبة متغيرين Gamma (طريقة قياسية موصوفة رياضياً)
  const sampleGamma = (shape) => {
    if (shape < 1) { const u = Math.random(); return sampleGamma(1 + shape) * Math.pow(u, 1 / shape); }
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    while (true) {
      let x, v;
      do { x = (Math.random() * 2 - 1) + (Math.random() * 2 - 1) + (Math.random() * 2 - 1); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u2 = Math.random();
      if (u2 < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u2) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const g1 = sampleGamma(alphaSafe), g2 = sampleGamma(betaSafe);
  const betaSample = g1 / (g1 + g2);
  return min + betaSample * (max - min);
}

/* محرك CPM يعمل بالمُدَد المباشرة (أيام من بداية المشروع)، لا بتواريخ
   ثابتة — ضروري لإعادة الحساب آلاف المرات بمُدَد مختلفة كل مرة بسرعة،
   بدل تحويل تواريخ فعلية في كل تكرار. */
function computeCPMWithDurations(taskList, durationMap) {
  const result = computeCPMCore(taskList, (id) => (durationMap[id] != null ? durationMap[id] : 0));
  return { projectEnd: result.projectEnd, critical: result.critical };
}

function percentile(sortedArr, p) {
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function runMonteCarloSimulation(tasks, iterations, distributionType) {
  if (!tasks.length) return { available: false, reason: "لا توجد أنشطة في هذا المشروع لمحاكاتها." };
  const sampler = distributionType === "pert" ? samplePERT : sampleTriangular;
  const taskEstimates = tasks.map((t) => {
    const likely = daysBetween(t.start || todayISO(), t.end || todayISO());
    const optimistic = t.optimisticDuration != null && t.optimisticDuration !== "" ? Number(t.optimisticDuration) : Math.max(1, Math.round(likely * ScheduleConfig.monteCarloDefaultOptimisticFactor));
    const pessimistic = t.pessimisticDuration != null && t.pessimisticDuration !== "" ? Number(t.pessimisticDuration) : Math.round(likely * ScheduleConfig.monteCarloDefaultPessimisticFactor);
    return { id: t.id, predecessors: t.predecessors, optimistic, likely, pessimistic };
  });

  const finishTimes = [];
  const criticalCount = {};
  tasks.forEach((t) => { criticalCount[t.id] = 0; });

  for (let i = 0; i < iterations; i++) {
    const durationMap = {};
    taskEstimates.forEach((te) => {
      durationMap[te.id] = te.pessimistic > te.optimistic ? sampler(te.optimistic, te.likely, te.pessimistic) : te.likely;
    });
    const result = computeCPMWithDurations(taskEstimates, durationMap);
    finishTimes.push(result.projectEnd);
    result.critical.forEach((id) => { criticalCount[id] = (criticalCount[id] || 0) + 1; });
  }

  finishTimes.sort((a, b) => a - b);
  const deterministicResult = computeCPMWithDurations(taskEstimates, Object.fromEntries(taskEstimates.map((te) => [te.id, te.likely])));

  const criticalityIndex = tasks.map((t) => ({ taskId: t.id, name: t.name, criticalityPct: Math.round((criticalCount[t.id] / iterations) * 1000) / 10 }))
    .sort((a, b) => b.criticalityPct - a.criticalityPct);

  return {
    available: true, iterations, distributionType: distributionType === "pert" ? "PERT (تقريب Beta)" : "مثلثي (Triangular)",
    p10: Math.round(percentile(finishTimes, 10) * 10) / 10,
    p50: Math.round(percentile(finishTimes, 50) * 10) / 10,
    p80: Math.round(percentile(finishTimes, 80) * 10) / 10,
    p90: Math.round(percentile(finishTimes, 90) * 10) / 10,
    deterministicDays: deterministicResult.projectEnd,
    scheduleContingencyDays: Math.round((percentile(finishTimes, 80) - deterministicResult.projectEnd) * 10) / 10,
    criticalityIndex: criticalityIndex.slice(0, 15),
  };
}
/* ============================================================
   كشف تعارض الموارد — هل نفس الشخص معيَّن على مهمتين متداخلتين
   زمنياً في نفس المشروع؟ (يعتمد على حقل "المسؤول" النصي في المهام،
   لعدم وجود ربط مباشر حالياً بين المهام وسجل الموارد الرئيسي)
   ============================================================ */
function tasksOverlap(a, b) {
  if (!a.start || !a.end || !b.start || !b.end) return false;
  return a.start <= b.end && b.start <= a.end;
}
function detectResourceConflicts(tasks) {
  const conflicts = [];
  const byProject = {};
  (tasks || []).forEach((t) => {
    if (!t.assignee || !String(t.assignee).trim()) return;
    (byProject[t.projectId] = byProject[t.projectId] || []).push(t);
  });
  Object.values(byProject).forEach((group) => {
    const byAssignee = {};
    group.forEach((t) => {
      const key = String(t.assignee).trim().toLowerCase();
      (byAssignee[key] = byAssignee[key] || []).push(t);
    });
    Object.values(byAssignee).forEach((list) => {
      if (list.length < 2) return;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (tasksOverlap(list[i], list[j]) && deriveTaskStatus(list[i]) !== "منتهي" && deriveTaskStatus(list[j]) !== "منتهي") {
            conflicts.push({ assignee: list[i].assignee, projectId: list[i].projectId, taskA: list[i], taskB: list[j] });
          }
        }
      }
    });
  });
  return conflicts;
}

let _criticalTaskIdsCache = { signature: null, result: null };
function computeTasksSignature(tasks) {
  // بصمة رخيصة: عدد المهام + أحدث توقيت تعديل + مجموع الإنجاز — كافية عملياً لاكتشاف أي تغيير حقيقي
  let maxUpdatedAt = 0, completionSum = 0;
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].updatedAt > maxUpdatedAt) maxUpdatedAt = tasks[i].updatedAt || 0;
    completionSum += Number(tasks[i].completion || 0);
  }
  return tasks.length + "|" + maxUpdatedAt + "|" + completionSum;
}
function criticalTaskIds(tasks) {
  const signature = computeTasksSignature(tasks);
  if (_criticalTaskIdsCache.signature === signature) return _criticalTaskIdsCache.result;
  const byProject = {};
  tasks.forEach((t) => { (byProject[t.projectId] = byProject[t.projectId] || []).push(t); });
  const critical = new Set();
  Object.values(byProject).forEach((group) => {
    try { computeCriticalPath(group).critical.forEach((id) => critical.add(id)); } catch (e) {}
  });
  _criticalTaskIdsCache = { signature, result: critical };
  return critical;
}

const riskScore = (r) => (Number(r.probability) || 0) * (Number(r.impact) || 0);
const riskLevel = (score) => (score >= 15 ? "danger" : score >= 8 ? "warn" : "good");

/* ---------------- 5-level risk heat scale (PMI-style probability x impact) ---------------- */
function riskHeatColor(score) {
  if (score >= 20) return "#8B0000"; // حرج
  if (score >= 15) return "#E5484D"; // مرتفع
  if (score >= 10) return "#F5A623"; // متوسط
  if (score >= 5) return "#D9C441"; // منخفض
  return "#2FBF71"; // منخفض جداً
}
function riskHeatLabel(score) {
  if (score >= 20) return "حرج";
  if (score >= 15) return "مرتفع";
  if (score >= 10) return "متوسط";
  if (score >= 5) return "منخفض";
  return "منخفض جداً";
}
function projectRiskExposure(projectId, risks) {
  return (risks || []).filter((r) => r.projectId === projectId && r.status !== "مغلق").reduce((s, r) => s + riskScore(r), 0);
}

/* ---------------- Resource pool & custody helpers ---------------- */
function custodyInvoicedTotal(custodyId, invoices) {
  return (invoices || []).filter((i) => i.custodyId === custodyId && i.approvalStatus !== "مرفوض").reduce((s, i) => s + Number(i.amount || 0), 0);
}
function custodyVariance(custody, invoices) {
  return Number(custody.amount || 0) - custodyInvoicedTotal(custody.id, invoices);
}
/* ---- تسلسل العهد: عهدة أصلية (محاسب ← مدير مشروع) قد تُوزَّع منها عهد فرعية (مدير مشروع ← مهندس) ---- */
function subCustodiesOf(custodyId, custodies) {
  return (custodies || []).filter((c) => c.parentCustodyId === custodyId);
}
function custodyUsedTotal(custodyId, custodies, invoices) {
  const direct = custodyInvoicedTotal(custodyId, invoices);
  const givenAsSubCustodies = subCustodiesOf(custodyId, custodies).reduce((s, c) => s + Number(c.amount || 0), 0);
  return direct + givenAsSubCustodies;
}
function custodyVarianceFull(custody, custodies, invoices) {
  return Number(custody.amount || 0) - custodyUsedTotal(custody.id, custodies, invoices);
}
function isHumanResource(resource) {
  if (!resource) return false;
  if (resource.category) return resource.category === "موارد بشرية";
  return resource.type === "مدير مشروع" || resource.type === "مهندس" || resource.type === "عامل" || resource.type === "موظف آخر"; // توافق مع سجلات قديمة بلا حقل category
}
function getResourceProjectIds(resource) {
  if (!resource) return [];
  if (Array.isArray(resource.assignedProjectIds) && resource.assignedProjectIds.length) return resource.assignedProjectIds;
  return resource.assignedProjectId ? [resource.assignedProjectId] : []; // توافق مع سجلات أُنشئت قبل دعم تعدُّد المشاريع
}
function isResourceAssignedToProject(resource, projectId) {
  return getResourceProjectIds(resource).includes(projectId);
}
function assignedResourcesForProject(projectId, resourcePool) {
  return (resourcePool || []).filter((r) => isResourceAssignedToProject(r, projectId));
}
function projectAssignedDailyCost(projectId, resourcePool) {
  return assignedResourcesForProject(projectId, resourcePool).reduce((s, r) => s + getRateAtDate(r, todayISO()), 0);
}

/* ============================================================
   سجل تغييرات السعر اليومي (راتب مورد بشري أو سعر إيجار معدة) —
   كل تغيير له تاريخ سريان محدَّد، فتُحسب التكاليف دائماً بالسعر
   الصحيح تاريخياً لا بالسعر الحالي فقط. لا يُستبدَل السعر بصمت أبداً.
   ============================================================ */
function getRateAtDate(resource, dateStr) {
  const history = Array.isArray(resource.rateHistory) ? resource.rateHistory : [];
  if (!history.length) return Number(resource.dailyRate) || 0;
  const applicable = history.filter((h) => !h.effectiveFrom || h.effectiveFrom <= dateStr).sort((a, b) => (b.effectiveFrom || "").localeCompare(a.effectiveFrom || ""));
  return applicable.length ? Number(applicable[0].rate) || 0 : Number(resource.dailyRate) || 0;
}
function recordRateChange(resourceId) {
  const resource = (STATE.data.resourcePool || []).find((r) => r.id === resourceId);
  if (!resource) return;
  const currentRate = Number(resource.dailyRate) || 0;
  const newRateStr = prompt(`السعر اليومي الحالي: ${currentRate} د.ل\n\nأدخل السعر الجديد:`, String(currentRate));
  if (newRateStr == null) return;
  const newRate = Number(newRateStr);
  if (isNaN(newRate) || newRate < 0) { alert("أدخل رقماً صحيحاً غير سالب."); return; }
  const effectiveFrom = prompt("تاريخ سريان السعر الجديد (YYYY-MM-DD):", todayISO());
  if (effectiveFrom == null) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom.trim())) { alert("صيغة التاريخ غير صحيحة — استخدم YYYY-MM-DD."); return; }
  const history = (Array.isArray(resource.rateHistory) && resource.rateHistory.length > 0) ? resource.rateHistory.slice() : [{ rate: currentRate, effectiveFrom: null }];
  history.push({ rate: newRate, effectiveFrom: effectiveFrom.trim() });
  const latestRate = getRateAtDate(Object.assign({}, resource, { rateHistory: history }), todayISO());
  STATE.data.resourcePool = STATE.data.resourcePool.map((r) => r.id === resourceId
    ? Object.assign({}, r, { rateHistory: history, dailyRate: latestRate, updatedAt: Date.now() })
    : r);
  logAudit("update", "resourcePool", resourceId, `تغيير السعر اليومي لـ${resource.name}: من ${currentRate} إلى ${newRate} د.ل اعتباراً من ${effectiveFrom.trim()}`);
  saveData(STATE.data);
  renderApp();
  alert(`تم تسجيل السعر الجديد (${newRate} د.ل) اعتباراً من ${effectiveFrom.trim()}. أي تكلفة قبل هذا التاريخ ستبقى محسوبة بالسعر القديم تلقائياً.`);
}

/* ============================================================
   نطاق رؤية المشاريع حسب هوية المستخدم المسجَّل دخوله فعلياً — لا يكفي
   أن يملك الدور صلاحية "عرض" صفحة المشاريع، بل يجب أن يرى فيها فقط
   مشاريعه هو تحديداً إن كان مدير مشروع أو مهندس موقع مرتبطاً بمورد محدد.
   مالك الشركة والمدير العام والمحاسب العام يحتاجون رؤية الشركة كاملة
   لطبيعة عملهم، فلا يُقيَّدون.
   ============================================================ */
function getUserScopedProjectIds() {
  const user = STATE.user;
  if (!user || !user.linkedResourceId) return null; // بلا ربط = بلا تقييد إضافي (يعتمد على صلاحيات الصفحة فقط)
  if (user.role === "مدير المشروع") {
    return new Set((STATE.data.projects || []).filter((p) => p.projectManagerId === user.linkedResourceId).map((p) => p.id));
  }
  if (user.role === "مهندس الموقع") {
    const resource = (STATE.data.resourcePool || []).find((r) => r.id === user.linkedResourceId);
    const scopedIds = new Set();
    // المصدر الأول: كل مشاريع التخصيص المباشر (Allocation) — يدعم أكثر من مشروع لنفس المهندس
    getResourceProjectIds(resource).forEach((pid) => scopedIds.add(pid));
    // المصدر الثاني (الأكثر شيوعاً فعلياً): أي مشروع لديه فيه نشاط مسؤول عنه تحديداً — حتى لو لم يُضبَط حقل التخصيص المباشر
    (STATE.data.tasks || []).forEach((t) => { if (t.responsibleResourceId === user.linkedResourceId && t.projectId) scopedIds.add(t.projectId); });
    return scopedIds;
  }
  return null; // باقي الأدوار (مالك الشركة، مدير عام، المحاسب العام) تحتاج رؤية كل المشاريع
}

/* ============================================================
   مستخلصات المالك (Owner Payment Certificates) — محرك الحساب
   دورة العمل: مسودة → مقدَّم للمالك → معتمد (بانتظار الصرف) → محصَّل بالكامل
              (أو: مرفوض/معاد للتعديل في أي نقطة قبل الاعتماد)
   ============================================================ */
const CERTIFICATE_STAGES = ["مسودة", "مقدَّم للمالك", "معتمد (بانتظار الصرف)", "مرفوض/معاد للتعديل", "محصَّل بالكامل"];

function certificateComputed(c) {
  const gross = Number(c.grossValueCumulative || 0);
  const prev = Number(c.previousCertifiedCumulative || 0);
  const currentGrossValue = gross - prev;
  const retentionPercent = Number(c.retentionPercent || 0);
  const retentionAmount = currentGrossValue * (retentionPercent / 100);
  const advanceRecovery = Number(c.advanceRecoveryAmount || 0);
  const netCurrentDue = currentGrossValue - retentionAmount - advanceRecovery;
  // المبلغ المعتمد فعلياً من المالك قد يختلف عن الصافي المطالَب به؛ إن لم يُعتمد بعد نستخدم الصافي المطالَب كتقدير للأنبوب (pipeline)
  const netApprovedOrExpected = c.approvedAmount != null && c.approvedAmount !== "" ? Number(c.approvedAmount) : netCurrentDue;
  const paid = Number(c.paidAmount || 0);
  const outstanding = netApprovedOrExpected - paid;
  return { currentGrossValue, retentionAmount, netCurrentDue, netApprovedOrExpected, paid, outstanding };
}

function certificatesForProject(projectId, certificates) {
  return (certificates || []).filter((c) => c.projectId === projectId);
}

/* يُستخدم في السيولة: مبالغ معتمدة فعلياً من المالك ولم تُحصَّل بعد — أعلى موثوقية من فاتورة عادية غير معتمدة */
function certifiedUncollectedTotal(certificates) {
  return (certificates || [])
    .filter((c) => c.stage === "معتمد (بانتظار الصرف)" || c.stage === "محصَّل بالكامل")
    .reduce((s, c) => s + certificateComputed(c).outstanding, 0);
}
/* قيمة الأنبوب: مستخلصات مُقدَّمة لكن لم يعتمدها المالك بعد — إيراد متوقع غير مؤكد، يُعرض بشكل منفصل عن السيولة المؤكدة */
function submittedPendingTotal(certificates) {
  return (certificates || [])
    .filter((c) => c.stage === "مقدَّم للمالك")
    .reduce((s, c) => s + certificateComputed(c).netCurrentDue, 0);
}
function certificatesRetentionHeldTotal(certificates) {
  return (certificates || [])
    .filter((c) => c.stage !== "مرفوض/معاد للتعديل" && c.stage !== "مسودة")
    .reduce((s, c) => s + certificateComputed(c).retentionAmount, 0);
}

/* ============================================================
   مستخلصات المقاولين من الباطن (Subcontractor Payment Certificates)
   عكس اتجاه مستخلصات المالك تماماً: هنا نحن الجهة التي تراجع وتعتمد
   وتصرف الدفعة، والمقاول من الباطن هو مُقدِّم المستخلص.
   دورة العمل: مُقدَّم من المقاول → قيد المراجعة الفنية → معتمد للصرف
              (أو: مرفوض/معاد للمقاول) → مدفوع
   ============================================================ */
const SUBCONTRACTOR_CERT_STAGES = ["مُقدَّم من المقاول", "قيد المراجعة الفنية", "معتمد للصرف", "مرفوض/معاد للمقاول", "مدفوع"];

function subcontractorCertComputed(c) {
  const gross = Number(c.grossValueCumulative || 0);
  const prev = Number(c.previousCertifiedCumulative || 0);
  const currentGrossValue = gross - prev;
  const retentionPercent = Number(c.retentionPercent || 0);
  const retentionAmount = currentGrossValue * (retentionPercent / 100);
  const advanceRecovery = Number(c.advanceRecoveryAmount || 0);
  const netCurrentDue = currentGrossValue - retentionAmount - advanceRecovery;
  const netApprovedOrExpected = c.approvedAmount != null && c.approvedAmount !== "" ? Number(c.approvedAmount) : netCurrentDue;
  const paid = Number(c.paidAmount || 0);
  const outstanding = netApprovedOrExpected - paid;
  return { currentGrossValue, retentionAmount, netCurrentDue, netApprovedOrExpected, paid, outstanding };
}
/* مبالغ معتمدة للصرف لم تُدفع بعد — التزام مالي مؤكد يجب إدراجه في التدفق النقدي الخارج المتوقع */
function subcontractorApprovedUnpaidTotal(certs) {
  return (certs || [])
    .filter((c) => c.stage === "معتمد للصرف" || c.stage === "مدفوع")
    .reduce((s, c) => s + subcontractorCertComputed(c).outstanding, 0);
}
/* مستخلصات مُقدَّمة من المقاول لم تُعتمد بعد فنياً — التزام محتمل غير مؤكد بعد */
function subcontractorPendingPipelineTotal(certs) {
  return (certs || [])
    .filter((c) => c.stage === "مُقدَّم من المقاول" || c.stage === "قيد المراجعة الفنية")
    .reduce((s, c) => s + subcontractorCertComputed(c).netCurrentDue, 0);
}
function subcontractorRetentionHeldTotal(certs) {
  return (certs || [])
    .filter((c) => c.stage !== "مرفوض/معاد للمقاول")
    .reduce((s, c) => s + subcontractorCertComputed(c).retentionAmount, 0);
}

/* ---------------- Google Maps external link (no embedding — lightweight) ---------------- */
function mapsUrlFor(location, lat, lng) {
  if (lat != null && lat !== "" && lng != null && lng !== "") {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (!location) return null;
  const trimmed = String(location).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}
function openProjectLocation(projectId) {
  const p = STATE.data.projects.find((x) => x.id === projectId);
  const url = p && mapsUrlFor(p.location, p.lat, p.lng);
  if (!url) { alert("لم يتم تحديد موقع لهذا المشروع بعد. حدِّده على الخريطة التفاعلية أو أضف عنواناً نصياً من نموذج تعديل المشروع."); return; }
  window.open(url, "_blank");
}

/* ---------------- Nav & Roles ---------------- */
const NAV_SECTIONS = [
  { section: null, items: [
    { key: "dashboard", label: "لوحة التحكم", ic: "◧" },
  ] },
  { section: "ضبط المشروع الأساسي", items: [
    { key: "projects", label: "المشاريع", ic: "🗂" },
    { key: "schedule", label: "الجدول الزمني", ic: "📅" },
    { key: "tasks", label: "المهام", ic: "✔" },
    { key: "progress", label: "نسب الإنجاز", ic: "📈" },
    { key: "risks", label: "سجل المخاطر", ic: "⚠" },
  ] },
  { section: "الإدارة المالية والتجارية", items: [
    { key: "financial-hub", label: "المركز المالي (نظرة موحَّدة)", ic: "🏦", group: "نظرة موحَّدة" },
    { key: "financial-intel", label: "التحليل المالي الذكي (EVM/CPI/SPI)", ic: "🧮", group: "نظرة موحَّدة" },
    { key: "contracts", label: "العقود", ic: "📄", group: "العقود والمطالبات" },
    { key: "changeOrders", label: "أوامر التغيير", ic: "🔀", group: "العقود والمطالبات" },
    { key: "claims", label: "سجل المطالبات", ic: "⚖", group: "العقود والمطالبات" },
    { key: "invoices", label: "الفواتير", ic: "🧾", group: "الفواتير والمستخلصات" },
    { key: "certificates", label: "مستخلصات المالك", ic: "📜", group: "الفواتير والمستخلصات" },
    { key: "subcontractorCertificates", label: "مستخلصات المقاولين من الباطن", ic: "🧱", group: "الفواتير والمستخلصات" },
    { key: "custodies", label: "العهد", ic: "💼", group: "النقد والميزانية" },
    { key: "finance", label: "الميزانية التفصيلية", ic: "💳", group: "النقد والميزانية" },
  ] },
  { section: "المشتريات والعطاءات", items: [
    { key: "procurement", label: "المشتريات والعطاءات", ic: "🛒" },
  ] },
  { section: "إدارة الموقع الميداني", items: [
    { key: "sitereports", label: "التقارير اليومية", ic: "📋" },
    { key: "resources", label: "الموارد", ic: "👥" },
    { key: "qc", label: "الجودة QA/QC", ic: "🛡" },
    { key: "hse", label: "السلامة HSE", ic: "⛑" },
    { key: "punchlist", label: "قائمة الملاحظات والتسليم", ic: "📝" },
  ] },
  { section: "الإدارة المؤسسية", items: [
    { key: "correspondence", label: "المراسلات", ic: "✉" },
    { key: "gmNotes", label: "ملاحظات الإدارة العليا", ic: "📝" },
    { key: "projectChatRoom", label: "غرفة نقاش المشروع", ic: "💬" },
    { key: "projectNotes", label: "ملاحظات ومتابعات المشروع", ic: "🗒" },
    { key: "meetings", label: "الاجتماعات والقرارات", ic: "🗓" },
    { key: "documents", label: "الوثائق والتراخيص والضمانات", ic: "📁" },
    { key: "mediaGallery", label: "معرض الوسائط (كل الصور)", ic: "🖼" },
    { key: "users", label: "المستخدمون", ic: "🔑" },
    { key: "auditLog", label: "سجل التدقيق", ic: "📜" },
    { key: "connections", label: "مركز الاتصالات الخارجية", ic: "🔌" },
    { key: "cloud", label: "المزامنة السحابية", ic: "☁" },
    { key: "data", label: "البيانات والنسخ الاحتياطي", ic: "💾" },
    { key: "help", label: "دليل الاستخدام", ic: "❓" },
  ] },
  { section: "التقنيات المستقبلية والذكاء", items: [
    { key: "ai", label: "المساعد الذكي (AI Copilot)", ic: "🤖", group: "الذكاء والتحليل" },
    { key: "predictiveAnalytics", label: "التحليلات التنبؤية والتعلّم", ic: "📊", group: "الذكاء والتحليل" },
    { key: "digitalTwin", label: "التوثيق الرقمي والرصد الذكي", ic: "🏗", group: "التوأم الرقمي والجدولة" },
    { key: "realityTwin", label: "RealityTwin — المسح الميداني والمطابقة", ic: "📡", group: "التوأم الرقمي والجدولة" },
    { key: "primavera", label: "Primavera P6", ic: "📐", group: "التوأم الرقمي والجدولة" },
    { key: "msgraph", label: "Microsoft 365 (Outlook)", ic: "📧", group: "التكامل الخارجي" },
  ] },
];
const NAV = NAV_SECTIONS.flatMap((s) => s.items);
const ALL_KEYS = NAV.map((n) => n.key);

/* ============================================================
   البنية المعمارية الجديدة للصلاحيات المؤسسية — طبقة إضافية فوق
   النظام الحالي، لا استبدال له. كل الفحوصات القديمة (canEdit,
   canView, checkPermission, getUserScopedProjectIds) تبقى تعمل
   بالضبط كما هي، ويستدعيها can() الجديد داخلياً، فلا ينكسر أي شيء.

   الإجراءات المدعومة لكل وحدة: view, create, edit, delete, submit,
   approve, reject, export, download, print.
   ============================================================ */
const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "submit", "approve", "reject", "export", "download", "print"];

function seedFinePermissionsFromLegacy() {
  const matrix = {};
  Object.keys(ROLE_CONFIG).forEach((role) => {
    matrix[role] = {};
    ALL_KEYS.forEach((moduleKey) => {
      const view = canView(role, moduleKey);
      const edit = canEdit(role, moduleKey);
      matrix[role][moduleKey] = {
        view, create: edit, edit, delete: edit,
        submit: edit, approve: false, reject: false, // الاعتماد/الرفض فعل تنفيذي متميز، لا يُستَنتَج تلقائياً من صلاحية التعديل العامة
        export: view, download: view, print: view,
      };
    });
  });
  // تطبيق تمييزات دقيقة معروفة فعلياً من هذه الجلسة — من يُنشئ لا يعتمد بالضرورة (فصل المهام الأساسي)
  const approvalOverrides = [
    { role: "مدير عام", module: "gmNotes", approve: true, reject: true },
    { role: "مدير عام", module: "punchlist", approve: true, reject: true },
    { role: "المحاسب العام", module: "invoices", approve: true, reject: true },
    { role: "مدير عام", module: "invoices", approve: true, reject: true },
    { role: "مالك الشركة", module: "invoices", approve: true, reject: true },
    { role: "المحاسب العام", module: "certificates", approve: true, reject: true },
    { role: "المحاسب العام", module: "subcontractorCertificates", approve: true, reject: true },
    { role: "مدير المشروع", module: "punchlist", approve: true, reject: true }, // لبنوده الخاصة فقط — يُطبَّق نطاقه في نقطة الاستخدام
  ];
  approvalOverrides.forEach((o) => {
    if (matrix[o.role] && matrix[o.role][o.module]) {
      matrix[o.role][o.module].approve = o.approve;
      matrix[o.role][o.module].reject = o.reject;
    }
  });
  return matrix;
}

function getFinePermissionsMatrix() {
  if (!STATE.data.finePermissions) STATE.data.finePermissions = seedFinePermissionsFromLegacy();
  return STATE.data.finePermissions;
}

/* الخدمة المركزية للصلاحيات — مصدر الحقيقة الوحيد المطلوب صراحة.
   can(user, "invoices.approve", { projectId }) بدل شروط دور متناثرة. */
function can(user, permissionKey, resource) {
  if (!user) return false;
  const freshUser = (STATE.data.users || []).find((u) => u.id === user.id);
  if (freshUser && freshUser.status && freshUser.status !== "نشط") return false; // حساب غير نشط = بلا صلاحيات مطلقاً، بغضّ النظر عن أي شيء آخر
  const [moduleKey, action] = permissionKey.includes(".") ? permissionKey.split(".") : [permissionKey, "view"];
  const matrix = getFinePermissionsMatrix();
  const roleGrid = matrix[user.role];
  let allowed = roleGrid && roleGrid[moduleKey] ? !!roleGrid[moduleKey][action] : (action === "view" ? canView(user.role, moduleKey) : canEdit(user.role, moduleKey));
  // صلاحية مؤقتة صريحة تتجاوز المصفوفة الأساسية إن كانت سارية الآن فقط
  const temp = (STATE.data.temporaryGrants || []).find((g) => g.userId === user.id && g.module === moduleKey && g.action === action && g.startDate <= todayISO() && g.endDate >= todayISO() && !g.revoked);
  if (temp) allowed = true;
  // تفويض صلاحية من مستخدم آخر، ساري الآن فقط
  const delegation = (STATE.data.delegations || []).find((d) => d.toUserId === user.id && d.startDate <= todayISO() && d.endDate >= todayISO() && !d.revoked && (d.permissions || []).some((p) => p === permissionKey || p === moduleKey));
  if (delegation) allowed = true;
  if (!allowed) return false;
  // نطاق المشروع: إن كان للمورد مشروع محدَّد، يجب أن يقع ضمن نطاق المستخدم
  if (resource && resource.projectId) {
    const scope = getUserScopedProjectIdsFor(user);
    if (scope && !scope.has(resource.projectId)) return false;
  }
  return true;
}
/* نسخة تقبل مستخدماً محدَّداً بدل STATE.user الحالي دائماً — مطلوبة لفحص صلاحيات مستخدمين آخرين من واجهة الإدارة */
function getUserScopedProjectIdsFor(user) {
  const savedUser = STATE.user;
  STATE.user = user;
  try { return getUserScopedProjectIds(); } finally { STATE.user = savedUser; }
}
const ROLE_CONFIG = {
  "مالك الشركة": {
    icon: "★", desc: "متابعة شاملة عن بُعد لكل المشاريع والأرقام، وإدارة حسابات المستخدمين (مدراء المشاريع، المهندسون، المحاسب)",
    view: ALL_KEYS, edit: ["users"],
  },
  "مدير عام": {
    icon: "◈", desc: "إدارة السجل الرئيسي للموارد (مدراء المشاريع، المهندسون، العمال، المعدات) وتعيين مدراء المشاريع عند إنشاء المشاريع، ومتابعة ملاحظات الإدارة العليا لمدراء المشاريع، واعتماد أوامر التغيير",
    view: ALL_KEYS,
    edit: ["resourcePool", "projects", "gmNotes", "punchlist", "changeOrders"],
  },
  "مدير المشروع": {
    icon: "◆", desc: "إدارة كاملة لمشاريعه: الجدول، الموارد، المخاطر، الجودة والسلامة، والفواتير والعهد ومستخلصات المالك والمقاولين من الباطن والمطالبات والمراسلات والاجتماعات وقوائم التسليم والوثائق، والرد على ملاحظات الإدارة العليا، والمشاركة في غرفة نقاش المشروع",
    view: ["dashboard","projects","schedule","sitereports","tasks","resources","procurement","contracts","finance","financial-intel","financial-hub","invoices","certificates","subcontractorCertificates","claims","custodies","progress","risks","changeOrders","correspondence","meetings","punchlist","documents","mediaGallery","qc","hse","ai","msgraph","primavera","digitalTwin","realityTwin","predictiveAnalytics","gmNotes","projectChatRoom","projectNotes","cloud","data","help"],
    edit: ["projects","schedule","sitereports","tasks","resources","resourcePool","procurement","contracts","progress","risks","changeOrders","qc","hse","ledger","invoices","certificates","subcontractorCertificates","claims","custodies","correspondence","meetings","punchlist","documents","primavera","digitalTwin","realityTwin","gmNotes","projectChatRoom","projectNotes"],
  },
  "مهندس الموقع": {
    icon: "▲", desc: "تسجيل التقارير اليومية وتحديث المهام والموارد والجودة والسلامة، وتوثيق اجتماعات الموقع وملاحظات التفتيش والتسليم، وتقديم فواتير الصرف مقابل أي عهدة فرعية يُسلَّمها من مدير المشروع، والمشاركة في غرفة نقاش المشروع",
    view: ["dashboard","schedule","sitereports","tasks","resources","progress","qc","hse","meetings","punchlist","custodies","invoices","msgraph","digitalTwin","realityTwin","projectChatRoom","mediaGallery","gmNotes","cloud","help"],
    edit: ["sitereports","tasks","resources","qc","hse","meetings","punchlist","invoices","digitalTwin","realityTwin","projectChatRoom"],
  },
  "المحاسب العام": {
    icon: "$", desc: "إدارة الميزانية والفواتير والمدفوعات والعقود المالية، ومطابقة العهد والفواتير، واعتماد تحصيل مستخلصات المالك وصرف مستخلصات المقاولين من الباطن، ومتابعة صلاحية الوثائق والضمانات المالية لجميع المشاريع",
    view: ["dashboard","projects","contracts","finance","financial-intel","financial-hub","invoices","certificates","subcontractorCertificates","claims","custodies","documents","mediaGallery","procurement","changeOrders","auditLog","connections","msgraph","predictiveAnalytics","cloud","data","help"],
    edit: ["finance","invoices","certificates","subcontractorCertificates","claims","custodies","contracts","procurement","ledger"],
  },
};

/* ============================================================
   مصفوفة الصلاحيات المركزية (Permission Matrix) — نظام حقيقي قابل
   للتوسع، لا واجهة عرض فقط. الوظائف الدقيقة المطلوبة صراحة، بصيغة
   Function | GM | PM. هذه المصفوفة هي المصدر الوحيد للحقيقة؛ دوال
   سير عمل الملاحظات والتشيك ليست تستدعيها بدل تكرار شروط الدور نصاً.

   صراحة معمارية مهمة: هذا يمنع التلاعب عبر واجهة النظام نفسها (أزرار
   مخفية، نماذج محمية وقت الكتابة كما بُني فعلياً) — لكنه لا يمنع
   قراءة البيانات الخام من STATE.data مباشرة عبر DevTools، لأن هذا
   تطبيق بلا خادم. الحل الكامل لهذا يحتاج تطبيق نفس هذه المصفوفة على
   طبقة API/قاعدة بيانات حقيقية لا توجد هنا.
   ============================================================ */
const PERMISSION_MATRIX = {
  "عرض المشروع (View Project)":                                    { "مدير عام": true,  "مدير المشروع": true },
  "اختيار المشروع (Select Project)":                                { "مدير عام": true,  "مدير المشروع": true },
  "إضافة مورد (Add Resource)":                                      { "مدير عام": true,  "مدير المشروع": "مقيّد بمشاريعه" },
  "تعديل مورد (Edit Resource)":                                     { "مدير عام": true,  "مدير المشروع": "مقيّد بمشاريعه" },
  "رؤية تكلفة مدير المشروع/المهندس (View PM/Engineer Cost)":        { "مدير عام": true,  "مدير المشروع": false },
  "تعديل تكلفة مدير المشروع/المهندس (Edit PM/Engineer Cost)":       { "مدير عام": true,  "مدير المشروع": false },
  "إنشاء ملاحظة إدارة عليا (Create GM Note)":                       { "مدير عام": true,  "مدير المشروع": false },
  "إنشاء ملاحظة لمهندس (Create Note to Engineer)":                  { "مدير عام": false, "مدير المشروع": true },
  "تعديل ملاحظة إدارة عليا الأصلية (Edit GM Note)":                 { "مدير عام": true,  "مدير المشروع": false },
  "الرد على ملاحظة إدارة عليا (Respond to GM Note)":                { "مدير عام": false, "مدير المشروع": true },
  "قبول رد مدير المشروع (Accept PM Response)":                      { "مدير عام": true,  "مدير المشروع": false },
  "رفض رد مدير المشروع (Reject PM Response)":                       { "مدير عام": true,  "مدير المشروع": false },
  "إنشاء بند تشيك ليست (Create Checklist Item)":                    { "مدير عام": true,  "مدير المشروع": "مقيّد بمشاريعه" },
  "تعديل تعريف بند أنشأه GM (Edit GM Checklist Definition)":        { "مدير عام": true,  "مدير المشروع": false },
  "تنفيذ/تحديث حالة بند (Execute Checklist Item)":                  { "مدير عام": true,  "مدير المشروع": true },
  "إضافة مشارك لغرفة نقاش (Add Discussion Participant)":            { "مدير عام": true,  "مدير المشروع": false },
  "مشاهدة النقاش (View Discussion)":                                { "مدير عام": true,  "مدير المشروع": "لغرف عضويته فقط" },
  "إضافة رسالة نقاش (Add Discussion Message)":                      { "مدير عام": true,  "مدير المشروع": "لغرف عضويته فقط" },
};
function checkPermission(functionKey, role) {
  const entry = PERMISSION_MATRIX[functionKey];
  if (!entry) return false;
  const effectiveRole = role === "مالك الشركة" ? "مدير عام" : role; // مالك الشركة له صلاحيات GM كحدّ أدنى في كل هذه المصفوفة
  if (!(effectiveRole in entry)) return false;
  return entry[effectiveRole] === true; // "مقيّد بـ..." تُعامَل كقيد إضافي يُفحَص في نقطة الاستخدام نفسها، لا هنا
}
const ROLES = Object.keys(ROLE_CONFIG);
const canView = (role, key) => !!(ROLE_CONFIG[role] && ROLE_CONFIG[role].view.includes(key));
const canEdit = (role, key) => !!(ROLE_CONFIG[role] && ROLE_CONFIG[role].edit.includes(key));

/* ---------------- Seed data ---------------- */
function seedData() {
  const p1 = uid(), p2 = uid();
  const pm1 = uid(), pm2 = uid();
  const cust1 = uid(), cust2 = uid();
  const t1 = uid(), t2 = uid(), t3 = uid(), t4 = uid();
  const mtg1 = uid(), mtg2 = uid();
  const procReq1 = uid();
  const eng1Resource = uid();
  return {
    projects: [
      { id: p1, name: "صيانة وتأهيل خط الأنابيب A1", owner: "شركة النفط", consultant: "مكتب استشاري الخليج", contractValue: 4200000, startDate: "2026-02-01", endDate: "2026-11-30", completion: 42, risk: "متوسط", projectManagerId: pm1, location: "حقل النفط الشرقي، ليبيا",
        history: [{ date: "2026-03-01", completion: 8 }, { date: "2026-04-01", completion: 17 }, { date: "2026-05-01", completion: 27 }, { date: "2026-06-01", completion: 35 }, { date: "2026-06-29", completion: 42 }] },
      { id: p2, name: "توسعة محطة الضخ B2", owner: "شركة النفط", consultant: "—", contractValue: 1850000, startDate: "2026-04-15", endDate: "2026-09-30", completion: 18, risk: "مرتفع", projectManagerId: pm2, location: "محطة الضخ B2، منطقة الزاوية، ليبيا",
        history: [{ date: "2026-05-01", completion: 4 }, { date: "2026-06-01", completion: 10 }, { date: "2026-06-29", completion: 18 }] },
    ],
    tasks: [
      { id: t1, projectId: p1, name: "صب قاعدة خزان الترسيب", assignee: "م. خالد", start: "2026-06-20", end: "2026-07-02", priority: "عالية", completion: 60, predecessors: [] },
      { id: t2, projectId: p1, name: "تمديد كابلات القوى", assignee: "م. سالم", start: "2026-06-25", end: "2026-06-30", priority: "متوسطة", completion: 90, predecessors: [] },
      { id: t3, projectId: p2, name: "توريد المضخات الرئيسية", assignee: "م. أحمد", start: "2026-06-10", end: "2026-06-28", priority: "عالية", completion: 20, predecessors: [] },
      { id: t4, projectId: p2, name: "أعمال العزل الحراري", assignee: "م. يوسف", start: "2026-07-01", end: "2026-07-10", priority: "منخفضة", completion: 0, predecessors: [t3] },
    ],
    dailyReports: [
      { id: uid(), projectId: p1, date: "2026-06-15", completedTaskIds: [t1], activities: "بدء صب قاعدة الخزان — الدفعة الأولى", workers: 18, equipment: "خلاطة", weather: "صافٍ", notes: "" },
      { id: uid(), projectId: p1, date: "2026-06-29", completedTaskIds: [t1, t2], activities: "استكمال صب خرسانة القاعدة + تمديد حديد التسليح", workers: 24, equipment: "رافعة، خلاطة", weather: "صافٍ", notes: "لا ملاحظات" },
      { id: uid(), projectId: p2, date: "2026-06-29", completedTaskIds: [t3], activities: "فحص أساسات المضخات", workers: 10, equipment: "مضخة خرسانة", weather: "غائم", notes: "تأخر توريد مواد العزل" },
    ],
    labor: [
      { id: uid(), projectId: p1, name: "فريق الخرسانة", role: "عمال بناء", count: 14, dailyRate: 90, date: todayISO(), status: "حاضر" },
      { id: uid(), projectId: p1, name: "فريق الكهرباء", role: "فنيو كهرباء", count: 6, dailyRate: 120, date: todayISO(), status: "حاضر" },
      { id: uid(), projectId: p2, name: "فريق التركيبات", role: "فنيو ميكانيكا", count: 8, dailyRate: 110, date: todayISO(), status: "غياب جزئي" },
    ],
    resourcePool: [
      { id: pm1, name: "م. عبدالسلام الفيتوري", type: "مدير مشروع", specialty: "مشاريع البنية التحتية للنفط والغاز", phone: "0910000001", dailyRate: 350, status: "معيّن", assignedProjectId: p1 },
      { id: pm2, name: "م. حسام المبروك", type: "مدير مشروع", specialty: "مشاريع المحطات والتوسعات", phone: "0910000002", dailyRate: 350, status: "معيّن", assignedProjectId: p2 },
      { id: eng1Resource, name: "م. خالد", type: "مهندس", specialty: "هندسة مدنية", phone: "0910000003", dailyRate: 180, status: "معيّن", assignedProjectId: p1 },
      { id: uid(), name: "م. سالم", type: "مهندس", specialty: "هندسة كهربائية", phone: "0910000004", dailyRate: 170, status: "معيّن", assignedProjectId: p1 },
      { id: uid(), name: "م. أحمد", type: "مهندس", specialty: "هندسة ميكانيكية", phone: "0910000005", dailyRate: 190, status: "متاح", assignedProjectId: null },
      { id: uid(), name: "خليفة السنوسي", type: "عامل", specialty: "عامل بناء", phone: "0910000006", dailyRate: 70, status: "متاح", assignedProjectId: null },
      { id: uid(), name: "رافعة 50 طن (رقم الأصل RC-12)", type: "معدة", specialty: "رافعة", phone: "—", dailyRate: 900, status: "متاح", assignedProjectId: null },
      { id: uid(), name: "حفارة (رقم الأصل EX-07)", type: "معدة", specialty: "حفارة", phone: "—", dailyRate: 700, status: "متاح", assignedProjectId: null },
    ],
    users: (() => {
      const mkUser = (name, role, username, plainPassword, extra) => {
        const salt = generateSalt();
        return Object.assign({ id: uid(), name, role, username, salt, passwordHash: hashPassword(plainPassword, salt), status: "نشط", failedLoginAttempts: 0, lastLoginAt: null }, extra || {});
      };
      return [
        mkUser("مالك الشركة", "مالك الشركة", "owner", "owner123"),
        mkUser("المدير العام", "مدير عام", "gm", "gm123"),
        mkUser("م. عبدالسلام الفيتوري", "مدير المشروع", "pm1", "pm123", { linkedResourceId: pm1 }),
        mkUser("م. حسام المبروك", "مدير المشروع", "pm2", "pm123", { linkedResourceId: pm2 }),
        mkUser("م. خالد", "مهندس الموقع", "eng1", "eng123", { linkedResourceId: eng1Resource }),
        mkUser("المحاسب العام", "المحاسب العام", "acc1", "acc123"),
      ];
    })(),
    custodies: [
      { id: cust1, projectId: p1, custodyType: "نقدية (مصاريف تشغيلية)", number: "3", amount: 5000, custodian: "م. عبدالسلام الفيتوري", dateReceived: "2026-06-15", notes: "عهدة مصاريف تشغيلية للموقع", reconciled: false },
      { id: cust2, projectId: p2, custodyType: "نقدية (مصاريف تشغيلية)", number: "1", amount: 8000, custodian: "م. حسام المبروك", dateReceived: "2026-06-20", notes: "عهدة مصاريف نقل ومستلزمات", reconciled: false },
      { id: uid(), projectId: p1, custodyType: "نقدية (مصاريف تشغيلية)", number: "4", parentCustodyId: cust1, amount: 1200, custodian: "م. خالد", dateReceived: "2026-06-22", notes: "عهدة فرعية لمصاريف يومية بسيطة في الموقع", reconciled: false },
      { id: uid(), projectId: p1, custodyType: "معدات/أدوات", number: "5", itemDescription: "جهاز مسح ليزري (Total Station) — رقم الجرد TS-014", custodian: "م. خالد", dateReceived: "2026-06-10", expectedReturnDate: "2026-09-30", notes: "لأعمال المساحة الميدانية" },
    ],
    certificates: [
      { id: uid(), projectId: p1, number: "1", periodFrom: "2026-02-01", periodTo: "2026-03-31",
        cumulativeCompletionPercent: 20, grossValueCumulative: 840000, previousCertifiedCumulative: 0,
        retentionPercent: 10, advanceRecoveryAmount: 0,
        stage: "محصَّل بالكامل",
        submittedDate: "2026-04-02", approvedDate: "2026-04-10", approvedAmount: 756000,
        paidAmount: 756000, paidDate: "2026-04-25", notes: "أول مستخلص للمشروع — تمت الموافقة والتحصيل دون خصومات إضافية." },
      { id: uid(), projectId: p1, number: "2", periodFrom: "2026-04-01", periodTo: "2026-06-29",
        cumulativeCompletionPercent: 42, grossValueCumulative: 1764000, previousCertifiedCumulative: 840000,
        retentionPercent: 10, advanceRecoveryAmount: 0,
        stage: "مقدَّم للمالك",
        submittedDate: "2026-06-30", approvedDate: null, approvedAmount: null,
        paidAmount: 0, paidDate: null, notes: "بانتظار رد المالك/الاستشاري." },
      { id: uid(), projectId: p2, number: "1", periodFrom: "2026-04-15", periodTo: "2026-06-29",
        cumulativeCompletionPercent: 18, grossValueCumulative: 333000, previousCertifiedCumulative: 0,
        retentionPercent: 10, advanceRecoveryAmount: 0,
        stage: "معتمد (بانتظار الصرف)",
        submittedDate: "2026-06-30", approvedDate: "2026-07-05", approvedAmount: 299700,
        paidAmount: 0, paidDate: null, notes: "معتمد من المالك، بانتظار تحويل المبلغ." },
    ],
    subcontractorCertificates: [
      { id: uid(), projectId: p1, number: "1", subcontractorParty: "مقاول الأعمال المدنية", periodFrom: "2026-02-01", periodTo: "2026-03-31",
        cumulativeCompletionPercent: 25, grossValueCumulative: 300000, previousCertifiedCumulative: 0,
        retentionPercent: 10, advanceRecoveryAmount: 0,
        stage: "مدفوع",
        submittedDate: "2026-04-01", reviewedDate: "2026-04-05", approvedAmount: 270000,
        paidAmount: 270000, paidDate: "2026-04-15", notes: "أول مستخلص للمقاول — مطابق للأعمال المنفذة فعلياً في الموقع." },
      { id: uid(), projectId: p1, number: "2", subcontractorParty: "مقاول الأعمال المدنية", periodFrom: "2026-04-01", periodTo: "2026-06-29",
        cumulativeCompletionPercent: 45, grossValueCumulative: 540000, previousCertifiedCumulative: 300000,
        retentionPercent: 10, advanceRecoveryAmount: 0,
        stage: "قيد المراجعة الفنية",
        submittedDate: "2026-07-02", reviewedDate: null, approvedAmount: null,
        paidAmount: 0, paidDate: null, notes: "بانتظار مطابقة نسبة الإنجاز مع سجل التقارير اليومية قبل الاعتماد." },
    ],
    claims: [
      { id: uid(), projectId: p1, claimNumber: "C-1", type: "تمديد مدة",
        reason: "تأخر تسليم الموقع من المالك بسبب إجراءات تصريح الدخول الأمني",
        dateRaised: "2026-03-10", daysClaimed: 15, amountClaimed: 0,
        status: "معتمدة جزئياً", daysApproved: 7, amountApproved: 0,
        notes: "تمت الموافقة على 7 أيام فقط من أصل 15 يوماً المطالب بها." },
      { id: uid(), projectId: p2, claimNumber: "C-1", type: "تعويض مالي",
        reason: "تكاليف إضافية نتيجة تغيير مواصفات مواد العزل من قبل الاستشاري بعد بدء التوريد",
        dateRaised: "2026-06-01", daysClaimed: 0, amountClaimed: 45000,
        status: "قيد التفاوض", daysApproved: 0, amountApproved: 0, notes: "" },
    ],
    correspondence: [
      { id: uid(), projectId: p1, direction: "وارد", refNumber: "OWN-2026-118", subject: "طلب توضيح بخصوص مواصفات حديد التسليح المستخدم",
        fromParty: "المالك — شركة النفط", toParty: "إدارة المشروع", date: "2026-06-20",
        status: "تم الرد", priority: "عادية", notes: "تم الرد بمستند فني موقّع من مدير المشروع." },
      { id: uid(), projectId: p1, direction: "صادر", refNumber: "PM-2026-045", subject: "إخطار بتأخر توريد مواد العزل الحراري من المورد المعتمد",
        fromParty: "إدارة المشروع", toParty: "الاستشاري — مكتب استشاري الخليج", date: "2026-07-01",
        status: "مفتوحة (تحتاج رد)", priority: "عاجلة", notes: "بانتظار رد الاستشاري على طلب تمديد مهلة التوريد." },
      { id: uid(), projectId: p2, direction: "وارد", refNumber: "OWN-2026-076", subject: "تعليمات تغيير مواصفات مواد العزل بمحطة الضخ",
        fromParty: "الاستشاري", toParty: "إدارة المشروع", date: "2026-06-01",
        status: "مغلقة", priority: "عادية", notes: "تم تنفيذها ورُفعت كمطالبة مالية C-1." },
    ],
    meetings: [
      { id: mtg1, projectId: p1, title: "اجتماع تنسيق أسبوعي — تقدم أعمال الخرسانة", meetingType: "اجتماع تنسيق",
        date: "2026-06-28", attendees: "مدير المشروع، مهندس الموقع، ممثل المقاول من الباطن",
        agenda: "مراجعة نسبة الإنجاز، معوقات توريد الحديد، خطة الأسبوع القادم.",
        minutesSummary: "تم الاتفاق على زيادة عدد فرق الصب لتعويض التأخر الطفيف، ومتابعة المورد يومياً لضمان وصول حديد التسليح." },
      { id: mtg2, projectId: p2, title: "اجتماع فني مع الاستشاري — مواصفات العزل", meetingType: "اجتماع فني",
        date: "2026-06-01", attendees: "مدير المشروع، الاستشاري، مهندس الجودة",
        agenda: "مراجعة تعليمات تغيير مواصفات مواد العزل الحراري وأثرها على التكلفة والجدول.",
        minutesSummary: "تقرر رفع مطالبة مالية رسمية لتغطية الفرق في التكلفة الناتج عن التغيير." },
    ],
    decisions: [
      { id: uid(), projectId: p1, meetingId: mtg1, decisionText: "زيادة عدد فرق صب الخرسانة من فريق واحد إلى فريقين لتعويض التأخر",
        owner: "م. عبدالسلام الفيتوري", dueDate: "2026-07-05", status: "منجزة", notes: "" },
      { id: uid(), projectId: p1, meetingId: mtg1, decisionText: "المتابعة اليومية مع مورد حديد التسليح لضمان الالتزام بمواعيد التوريد",
        owner: "م. خالد", dueDate: "2026-07-15", status: "مفتوحة", notes: "" },
      { id: uid(), projectId: p1, meetingId: mtg1, decisionText: "تحديث مصفوفة الاتصال الخاصة بالطوارئ في الموقع",
        owner: "م. خالد", dueDate: "2026-06-30", status: "مفتوحة", notes: "" },
      { id: uid(), projectId: p2, meetingId: mtg2, decisionText: "إعداد ورفع مطالبة مالية رسمية (Claim) لتغطية فرق تكلفة مواصفات العزل الجديدة",
        owner: "م. حسام المبروك", dueDate: "2026-06-10", status: "منجزة", notes: "تم ربطها بالمطالبة C-1 في سجل المطالبات." },
    ],
    punchlist: [
      { id: uid(), projectId: p1, itemNumber: "PL-1", location: "الطابق الأول — الوحدة السكنية 3", category: "سباكة",
        description: "تسريب بسيط في تمديدات السباكة أسفل حوض المطبخ", severity: "متوسطة",
        raisedBy: "م. خالد", dateRaised: "2026-06-25", responsibleParty: "مقاول السباكة",
        targetCloseDate: "2026-07-05", status: "مفتوحة", closedDate: "", notes: "" },
      { id: uid(), projectId: p1, itemNumber: "PL-2", location: "الواجهة الخارجية", category: "تشطيبات",
        description: "خدوش طلاء تحتاج معالجة قبل التسليم النهائي", severity: "بسيطة",
        raisedBy: "م. خالد", dateRaised: "2026-07-01", responsibleParty: "مقاول الطلاء",
        targetCloseDate: "2026-07-20", status: "قيد المراجعة",
        correctiveAction: "أُعيد طلاء الواجهة بالكامل ومطابقتها للون المعتمد في المواصفات.", photoAfter: "",
        closedDate: "", notes: "" },
      { id: uid(), projectId: p1, itemNumber: "PL-3", location: "غرفة الكهرباء الرئيسية", category: "كهرباء",
        description: "لوحة التوزيع الكهربائية غير مؤرَّضة بشكل صحيح — مخاطرة سلامة", severity: "حرجة",
        raisedBy: "م. سالم", dateRaised: "2026-06-20", responsibleParty: "مقاول الكهرباء",
        targetCloseDate: "2026-06-28", status: "مغلقة",
        correctiveAction: "تم تأريض اللوحة بشكل صحيح وفحصها من مهندس السلامة.", closedDate: "2026-06-27", notes: "تم التصحيح والفحص من مهندس السلامة." },
      { id: uid(), projectId: p2, itemNumber: "PL-1", location: "منطقة المضخات", category: "عزل",
        description: "عزل حراري غير مكتمل حول أنابيب التصريف", severity: "متوسطة",
        raisedBy: "م. حسام المبروك", dateRaised: "2026-07-02", responsibleParty: "مقاول العزل",
        targetCloseDate: "2026-07-25", status: "مفتوحة", closedDate: "", notes: "" },
    ],
    documents: [
      { id: uid(), projectId: p1, title: "رخصة بناء رئيسية", docType: "رخصة", refNumber: "LIC-2026-0091",
        issueDate: "2026-01-15", expiryDate: "2027-01-15", issuingAuthority: "البلدية المحلية", notes: "" },
      { id: uid(), projectId: p1, title: "شهادة معايرة معدات الرفع (الرافعة 50 طن)", docType: "شهادة معايرة", refNumber: "CAL-2026-334",
        issueDate: "2025-08-01", expiryDate: "2026-08-01", issuingAuthority: "مركز المعايرة الوطني", notes: "" },
      { id: uid(), projectId: p1, title: "تصريح دخول أمني للموقع", docType: "تصريح", refNumber: "PERM-2026-0450",
        issueDate: "2026-02-01", expiryDate: "2026-07-01", issuingAuthority: "الجهة الأمنية المختصة", notes: "بحاجة لتجديد فوري لاستمرار دخول الفرق للموقع." },
      { id: uid(), projectId: p2, title: "ضمان تصنيع المضخات الرئيسية", docType: "ضمان", refNumber: "WAR-2026-058",
        issueDate: "2026-05-10", expiryDate: "2028-05-10", issuingAuthority: "شركة المعدات الصناعية", notes: "" },
      { id: uid(), projectId: p2, title: "الرسم الهندسي المعتمد لتصميم الأساسات", docType: "رسم هندسي معتمد", refNumber: "DWG-B2-014",
        issueDate: "2026-04-20", expiryDate: "", issuingAuthority: "مكتب استشاري الخليج", notes: "لا ينتهي — وثيقة مرجعية دائمة." },
    ],
    documentRecords: [],
    documentTransmittals: [],
    documentRelationships: [],
    equipment: [
      { id: uid(), projectId: p1, name: "رافعة 50 طن", status: "تعمل", hours: 6, hourlyRate: 180, fuel: 70, location: "الموقع الرئيسي" },
      { id: uid(), projectId: p1, name: "خلاطة خرسانة", status: "تعمل", hours: 5, hourlyRate: 60, fuel: 55, location: "منطقة الصب" },
      { id: uid(), projectId: p2, name: "حفارة", status: "متوقفة - صيانة", hours: 0, hourlyRate: 140, fuel: 20, location: "الورشة" },
    ],
    materials: [
      { id: uid(), projectId: p1, name: "حديد تسليح 16مم", unit: "طن", unitCost: 3200, inStock: 32, consumed: 8, reorderLevel: 15 },
      { id: uid(), projectId: p1, name: "أسمنت", unit: "طن", unitCost: 480, inStock: 12, consumed: 6, reorderLevel: 15 },
      { id: uid(), projectId: p2, name: "مواد عزل حراري", unit: "لفة", unitCost: 950, inStock: 4, consumed: 2, reorderLevel: 10 },
    ],
    procurement: [
      { id: uid(), projectId: p2, item: "مضخات رئيسية", stage: "أمر شراء", supplier: "شركة المعدات الصناعية", amount: 320000, requestDate: "2026-05-10" },
      { id: procReq1, projectId: p1, item: "حديد تسليح إضافي", stage: "التقييم", supplier: "—", amount: 90000, requestDate: "2026-06-15" },
    ],
    procurementBids: [
      { id: uid(), procurementId: procReq1, supplierName: "مؤسسة الفولاذ الليبي للتوريدات", quotedAmount: 92000, deliveryDays: 10, paymentTerms: "30% مقدم، الباقي عند التسليم", technicalCompliance: "مطابق", isWinner: false, notes: "مورد معتمد سابقاً، سجل تسليم جيد." },
      { id: uid(), procurementId: procReq1, supplierName: "شركة الشرق للحديد والصلب", quotedAmount: 87500, deliveryDays: 18, paymentTerms: "دفعة كاملة مقدماً", technicalCompliance: "مطابق", isWinner: false, notes: "أقل سعر، لكن مدة التوريد أطول ودفعة كاملة مقدماً." },
      { id: uid(), procurementId: procReq1, supplierName: "مجموعة النصر التجارية", quotedAmount: 95500, deliveryDays: 7, paymentTerms: "30% مقدم، الباقي عند التسليم", technicalCompliance: "مطابق جزئياً", isWinner: false, notes: "مطابقة جزئية للمواصفة الفنية (قطر التسليح مختلف قليلاً) رغم سرعة التوريد." },
    ],
    contracts: [
      { id: uid(), projectId: p1, party: "مقاول الأعمال المدنية", type: "مقاول فرعي", value: 1200000, expiryDate: "2026-08-15", status: "ساري" },
      { id: uid(), projectId: p2, party: "مورد المضخات", type: "مورد", value: 320000, expiryDate: "2026-07-05", status: "ساري" },
    ],
    budgetItems: [
      { id: uid(), projectId: p1, category: "أعمال مدنية", budget: 1500000, actual: 980000 },
      { id: uid(), projectId: p1, category: "كهرباء وأجهزة", budget: 800000, actual: 410000 },
      { id: uid(), projectId: p2, category: "معدات وتوريدات", budget: 900000, actual: 620000 },
      { id: uid(), projectId: p2, category: "أعمال ميكانيكية", budget: 600000, actual: 95000 },
    ],
    invoices: [
      { id: uid(), projectId: p1, type: "عميل", category: "مستخلص (Progress)", retentionPercent: 10, approvalStatus: "معتمد", number: "INV-1001", amount: 500000, paidAmount: 500000, status: "مدفوعة", dueDate: "2026-06-10" },
      { id: uid(), projectId: p1, type: "مورد", category: "فاتورة عادية", number: "SUP-2044", amount: 90000, paidAmount: 0, status: "مستحقة", dueDate: "2026-07-05" },
      { id: uid(), projectId: p1, type: "مورد", category: "فاتورة عادية", number: "PC-0301", amount: 3200, paidAmount: 3200, status: "مدفوعة", dueDate: "2026-06-16", custodyId: cust1, approvalStatus: "مقدَّم", createdBy: "م. عبدالسلام الفيتوري" },
      { id: uid(), projectId: p2, type: "مورد", category: "فاتورة عادية", number: "SUP-2051", amount: 320000, paidAmount: 160000, status: "جزئية", dueDate: "2026-07-15" },
      { id: uid(), projectId: p2, type: "عميل", category: "مستخلص (Progress)", retentionPercent: 10, approvalStatus: "مقدَّم", number: "INV-1002", amount: 210000, paidAmount: 0, status: "مستحقة", dueDate: "2026-07-20" },
    ],
    progressItems: [
      { id: uid(), projectId: p1, activity: "أعمال الحفر", planned: 100, actual: 100 },
      { id: uid(), projectId: p1, activity: "أعمال الخرسانة", planned: 80, actual: 55 },
      { id: uid(), projectId: p2, activity: "توريد المضخات", planned: 60, actual: 20 },
      { id: uid(), projectId: p2, activity: "الأعمال الكهربائية", planned: 30, actual: 5 },
    ],
    qc: [
      { id: uid(), projectId: p1, category: "طلب فحص", title: "فحص جودة الخرسانة - قاعدة الخزان", status: "مفتوح", date: "2026-06-28",
        raisedBy: "م. خالد", responsibleParty: "مقاول الأعمال المدنية", correctiveAction: "", targetCloseDate: "2026-07-20", closedDate: "", verifiedBy: "" },
      { id: uid(), projectId: p2, category: "NCR", title: "عدم توافق مواصفة العزل المورّدة", status: "قيد المعالجة", date: "2026-06-27",
        raisedBy: "مهندس الجودة", responsibleParty: "مورد مواد العزل", correctiveAction: "استبدال الدفعة غير المطابقة بمواصفة صحيحة معتمدة من الاستشاري", targetCloseDate: "2026-07-01", closedDate: "", verifiedBy: "" },
      { id: uid(), projectId: p1, category: "فحص موقع", title: "فحص أساسات المضخات قبل الصب", status: "مغلق", date: "2026-05-20",
        raisedBy: "م. خالد", responsibleParty: "مقاول الأعمال المدنية", correctiveAction: "لا يوجد — الفحص مطابق من أول مرة", targetCloseDate: "2026-05-25", closedDate: "2026-05-24", verifiedBy: "مهندس الجودة" },
    ],
    hse: [
      { id: uid(), projectId: p1, category: "Toolbox Meeting", title: "اجتماع السلامة الأسبوعي", severity: "—", date: "2026-06-29",
        investigator: "", rootCause: "", correctiveAction: "", targetCloseDate: "", status: "مغلق", closedDate: "2026-06-29" },
      { id: uid(), projectId: p2, category: "Near Miss", title: "سقوط أداة من ارتفاع بدون إصابة", severity: "متوسط", date: "2026-06-26",
        investigator: "مهندس السلامة", rootCause: "عدم تثبيت الأداة بحبل أمان مخصص أثناء العمل على ارتفاع", correctiveAction: "توزيع حبال أمان لجميع العاملين على المرتفعات وتوعية فورية لكل الفرق", targetCloseDate: "2026-07-05", status: "قيد المعالجة", closedDate: "" },
      { id: uid(), projectId: p1, category: "حادث", title: "انزلاق عامل في منطقة الحفر أثناء أعمال الأساسات", severity: "مرتفع", date: "2026-06-20",
        investigator: "مهندس السلامة", rootCause: "", correctiveAction: "", targetCloseDate: "2026-06-30", status: "مفتوح", closedDate: "" },
    ],
    risks: [
      { id: uid(), projectId: p2, title: "تأخر توريد المضخات من المورد الخارجي", probability: 4, impact: 4, mitigation: "تفعيل مورد بديل محلي وتسريع أمر الشراء", owner: "قسم المشتريات", status: "مفتوح" },
      { id: uid(), projectId: p1, title: "تقلبات أسعار الحديد والأسمنت", probability: 3, impact: 3, mitigation: "تثبيت الأسعار عبر عقود توريد مسبقة", owner: "مدير المشروع", status: "مفتوح" },
      { id: uid(), projectId: p2, title: "نقص كوادر فنية متخصصة بالعزل الحراري", probability: 2, impact: 3, mitigation: "التعاقد مع مقاول متخصص مؤقت", owner: "الموارد البشرية", status: "قيد المعالجة" },
    ],
    changeOrders: [
      { id: uid(), projectId: p2, title: "إضافة نظام عزل إضافي للأنابيب الجانبية", description: "طلب من المالك لتغطية أنابيب لم تكن ضمن النطاق الأصلي", costImpact: 45000, scheduleImpactDays: 6, status: "قيد المراجعة", date: "2026-06-20" },
    ],
    ledger: [
      { id: uid(), projectId: p1, date: "2026-06-25", type: "مصروف", costCenter: "عمالة", activity: "أجور فريق الخرسانة", amount: 12600, description: "أجور أسبوعية" },
      { id: uid(), projectId: p1, date: "2026-06-27", type: "مصروف", costCenter: "مواد", activity: "شراء أسمنت", amount: 28800, description: "توريد دفعة أسمنت" },
      { id: uid(), projectId: p1, date: "2026-06-10", type: "إيراد", costCenter: "أخرى", activity: "تحصيل مستخلص", amount: 500000, description: "دفعة المستخلص INV-1001" },
      { id: uid(), projectId: p2, date: "2026-06-22", type: "مصروف", costCenter: "معدات", activity: "تشغيل حفارة", amount: 8400, description: "أجرة تشغيل أسبوعية" },
      { id: uid(), projectId: p2, date: "2026-06-28", type: "مصروف", costCenter: "مقاولين من الباطن", activity: "دفعة مقاول التركيبات", amount: 35000, description: "دفعة على الحساب" },
    ],
    _tombstones: [],
    _auditLog: [],
    aiTokenUsageLog: [],
    msLinkedItems: [],
    projectAssets: [
      { id: uid(), projectId: p1, assetCode: "AST-001", name: "خط الأنابيب الرئيسي - القطاع الشمالي", assetType: "خط أنابيب", location: "الكيلومتر 0-12", installDate: "2026-04-01", contractor: "شركة المقاولات الرئيسية", status: "قيد التنفيذ", notes: "" },
    ],
    realityCaptures: [],
    deviationReports: [],
    arSessions: [],
    aiAnalysisResults: [],
    smartInspections: [],
    contractorEvaluations: [
      { id: uid(), projectId: p1, contractorName: "شركة المقاولات الرئيسية", evaluationDate: "2026-07-01", qualityScore: 4, scheduleScore: 3, safetyScore: 5, cooperationScore: 4, evaluatedBy: "م. عبدالسلام الفيتوري", notes: "أداء جيد عموماً مع تأخر بسيط في التسليمات." },
    ],
    bankAccounts: [
      { id: uid(), name: "الحساب التشغيلي الرئيسي", bankName: "مصرف الجمهورية", accountNumberLast4: "4821", currency: "دينار ليبي", openingBalance: 250000, notes: "" },
    ],
    sensorReadings: [
      { id: uid(), projectId: p1, sensorType: "نضج خرسانة", readingValue: 32, unit: "°C", readingDate: "2026-07-20", thresholdMin: 10, thresholdMax: 35, source: "يدوي" },
    ],
    maintenanceRecords: [],
    gmNotes: [],
    discussionAnalyses: [],
    projectNotes: [],
    projectChatMessages: [],
    chatRooms: [
      { id: uid(), projectId: p1, name: "الغرفة الرئيسية", isMainRoom: true, memberResourceIds: [pm1, eng1Resource], createdBy: "النظام", createdDate: "2026-02-01", updatedAt: Date.now() },
      { id: uid(), projectId: p2, name: "الغرفة الرئيسية", isMainRoom: true, memberResourceIds: [pm2], createdBy: "النظام", createdDate: "2026-04-15", updatedAt: Date.now() },
    ],
    chatRoomReadState: [],
    notifications: [],
    resourceTransferRequests: [],
    projectEvents: [],
    workflowDefinitions: [
      {
        id: "wf-invoice-v1", name: "دورة اعتماد الفواتير", module: "invoices", version: 1, active: true,
        createdBy: "النظام", createdDate: todayISO(),
        stages: [
          { id: "submitted", name: "مُقدَّمة", type: "submission", slaHours: null, approverRule: null },
          { id: "review", name: "مراجعة مالية", type: "review", slaHours: 72, approverRule: { type: "role", role: "المحاسب العام" } },
          { id: "approval", name: "اعتماد نهائي", type: "approval", slaHours: 48, approverRule: { type: "amount-tiered", module: "invoices", amountField: "amount" } },
          { id: "approved", name: "معتمدة", type: "final-approval", slaHours: null, approverRule: null },
        ],
      },
    ],
    workflowInstances: [],
    approvalAuthorityLevels: {
      invoices: [
        { maxAmount: 10000, role: "المحاسب العام" },
        { maxAmount: 100000, role: "مدير عام" },
        { maxAmount: Infinity, role: "مالك الشركة" },
      ],
    },
    delegations: [],
    pointCloudSnapshotsIndex: [],
    twinSnapshots: [],
    projectTimeMachineSnapshots: [],
    temporaryGrants: [],
  };
}

/* ============================================================
   محرك الدمج الذكي بين نسختين من البيانات (بلا سيرفر مركزي) —
   يدمج كل مجموعة سجل-بسجل: الأحدث "updatedAt" يفوز، والحذف يُحترم
   فقط إن كان "شاهد القبر" أحدث من آخر تعديل معروف لذلك السجل (وإلا
   يُعاد السجل — أي أن التعديل بعد الحذف "يُحيي" السجل من جديد، وهو
   سلوك متوقَّع ومقصود لا خلل).
   ============================================================ */
function mergeIncomingData(remoteData) {
  const local = STATE.data;
  const merged = {};

  const localTombstones = local._tombstones || [];
  const remoteTombstones = (remoteData && remoteData._tombstones) || [];
  const tombstoneMap = new Map();
  [...localTombstones, ...remoteTombstones].forEach((t) => {
    const key = t.collection + ":" + t.id;
    const existing = tombstoneMap.get(key);
    if (!existing || t.deletedAt > existing.deletedAt) tombstoneMap.set(key, t);
  });
  const isDeleted = (collection, id, recordUpdatedAt) => {
    const t = tombstoneMap.get(collection + ":" + id);
    return !!t && t.deletedAt >= (recordUpdatedAt || 0);
  };

  const allKeys = new Set([...Object.keys(local), ...Object.keys(remoteData || {})]);
  allKeys.forEach((key) => {
    if (key === "_tombstones") return;
    const localArr = Array.isArray(local[key]) ? local[key] : null;
    const remoteArr = remoteData && Array.isArray(remoteData[key]) ? remoteData[key] : null;
    if (!localArr && !remoteArr) {
      merged[key] = local[key] !== undefined ? local[key] : (remoteData ? remoteData[key] : undefined);
      return;
    }
    const byId = new Map();
    (localArr || []).forEach((r) => byId.set(r.id, r));
    (remoteArr || []).forEach((r) => {
      const existing = byId.get(r.id);
      if (!existing) { byId.set(r.id, r); return; }
      if ((r.updatedAt || 0) > (existing.updatedAt || 0)) byId.set(r.id, r);
    });
    const finalRecords = [];
    byId.forEach((rec, id) => { if (!isDeleted(key, id, rec.updatedAt)) finalRecords.push(rec); });
    merged[key] = finalRecords;
  });

  merged._tombstones = Array.from(tombstoneMap.values());
  return merged;
}

function normalizeData(raw) {
  const base = seedData();
  const d = {};
  Object.keys(base).forEach((k) => {
    if (raw && Array.isArray(raw[k])) { d[k] = raw[k]; return; }
    if (k === "users") { d[k] = base[k]; return; } // بيانات تمهيدية لتسجيل الدخول، وليست بيانات عرض توضيحي — لا يجوز أن تبدأ فارغة وإلا فقد المستخدم القدرة على الدخول
    d[k] = Array.isArray(base[k]) ? [] : ((raw && raw[k] !== undefined) ? raw[k] : base[k]);
  });
  if (raw) Object.keys(raw).forEach((k) => { if (!(k in d)) d[k] = raw[k]; });
  d.projects = d.projects.map((p) => {
    const withDefaults = Object.assign({ history: [] }, p);
    if (!withDefaults.history || !withDefaults.history.length) {
      withDefaults.history = [{ date: todayISO(), completion: Number(p.completion) || 0 }];
    }
    if (!withDefaults.baselineStart) withDefaults.baselineStart = withDefaults.startDate;
    if (!withDefaults.baselineEnd) withDefaults.baselineEnd = withDefaults.endDate;
    if (!withDefaults.baselineBudget) withDefaults.baselineBudget = withDefaults.contractValue;
    return withDefaults;
  });
  d.tasks = d.tasks.map((t) => Object.assign({ predecessors: [] }, t, { predecessors: Array.isArray(t.predecessors) ? t.predecessors : [] }));
  return d;
}

/* ---------------- Storage (localStorage) ---------------- */
const DATA_KEY = "pms_standalone_data_v1";
const USER_KEY = "pms_standalone_user_v1";

async function loadData() {
  await migrateLocalStorageToIndexedDB();
  const hasRealData = await LocalDatabase.hasAnyData();
  if (!hasRealData) {
    const seed = seedData();
    await queueIndexedDBWrite(seed);
    return seed;
  }
  const data = {};
  const storeRowsCache = {};
  for (const collection of Object.keys(COLLECTION_TO_STORE_MAP)) {
    const storeName = COLLECTION_TO_STORE_MAP[collection];
    if (!storeRowsCache[storeName]) storeRowsCache[storeName] = await LocalDatabase.getAll(storeName);
    const collectionsInThisStore = STORE_TO_COLLECTIONS_MAP[storeName] || [];
    // Store يحوي مجموعة واحدة فقط → كل سجلاته حقيقياً تخصّها، بلا حاجة لأي فرز، ولا مفتاح تخزين مركَّب إطلاقاً
    if (collectionsInThisStore.length <= 1) { data[collection] = storeRowsCache[storeName]; continue; }
    // Store يحوي أكثر من مجموعة حقيقية معاً (مثل finance) → الفرز بحقل _pmsCollection، ثم استرجاع id الحقيقي
    // الأصلي من _pmsRealId (مفتاح التخزين الفعلي في IndexedDB كان مركَّباً لمنع تصادم فعلي مؤكَّد بين
    // سجلين من مجموعتين مختلفتين يتشاركان id نفسه بالتصادف — record.id المُعاد هنا مطابق تماماً للأصل،
    // بلا أي أثر لهذا التركيب الداخلي على أي طبقة أخرى في النظام)
    data[collection] = storeRowsCache[storeName]
      .filter((r) => r._pmsCollection === collection)
      .map((r) => { const clean = Object.assign({}, r); clean.id = r._pmsRealId; delete clean._pmsCollection; delete clean._pmsRealId; return clean; });
  }
  return normalizeData(data);
}
async function writeAllCollectionsToIndexedDB(data) {
  for (const storeName of PMS_STORE_NAMES) {
    const collections = STORE_TO_COLLECTIONS_MAP[storeName] || [];
    const needsTag = collections.length > 1; // فقط عند تشارُك أكثر من مجموعة حقيقية بنفس الـStore
    const combined = collections.reduce((acc, c) => {
      const rows = Array.isArray(data[c]) ? data[c] : [];
      // إصلاح تصادم حقيقي مؤكَّد بالاختبار: بدون هذا، سجلان من مجموعتين مختلفتين بـid متطابق بالتصادف
      // كانا سيتشاركان مفتاح IndexedDB نفسه (keyPath: "id") فيستبدل أحدهما الآخر صمتاً. المفتاح الفعلي
      // المكتوب لـIndexedDB هنا مركَّب (المجموعة:id) لضمان تفرّده دائماً، لكن id الحقيقي يبقى محفوظاً
      // في _pmsRealId ويُستعاد بالضبط عند القراءة — لا تغيير إطلاقاً على id كما يراه أي كود آخر في النظام
      return acc.concat(needsTag ? rows.map((r) => Object.assign({}, r, { id: `${c}:${r.id}`, _pmsCollection: c, _pmsRealId: r.id })) : rows);
    }, []);
    await LocalDatabase.clearStore(storeName);
    await LocalDatabase.putAll(storeName, combined);
  }
}
let _pendingSaveQueue = Promise.resolve();
function queueIndexedDBWrite(data) {
  // قفل تسلسلي حقيقي وموحَّد لكل الكتابات، بلا استثناء لأي نقطة دخول — بما فيها كتابة البذرة الأولى
  // من loadData نفسها — لا فقط استدعاءات saveData. خلل حقيقي وُجِد ومُختبَر: كتابة البذرة الأولى كانت
  // مساراً مستقلاً تماماً عن هذا القفل، فتسابقت مع أول saveData() فعلي بعدها وأعادت كتابة بيانات حديثة بأخرى قديمة.
  _pendingSaveQueue = _pendingSaveQueue
    .then(() => writeAllCollectionsToIndexedDB(data))
    .catch((e) => console.error("خطأ في حفظ البيانات إلى IndexedDB:", e));
  return _pendingSaveQueue;
}
function saveData(data) {
  queueIndexedDBWrite(data);
  if (typeof pushCloudUpdate === "function") pushCloudUpdate();
}
function loadUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
}
function saveUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
function clearUser() { localStorage.removeItem(USER_KEY); }
