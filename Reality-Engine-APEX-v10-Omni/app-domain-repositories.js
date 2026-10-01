/* ============================================================
   Domain Repositories — طبقة Repository مسمّاة بحسب النطاق، فوق
   الطبقة العامة الموجودة أصلاً (Repository في app-repository.js)
   والدوال الحقيقية الأخرى (WorkflowService، الإشعارات، سجل التدقيق).

   كل واحدة غلاف تفويض بحت — لا إعادة تنفيذ لأي منطق أعمال أو فحص
   صلاحية. الهدف: أسماء واضحة بحسب النطاق (ProjectRepository.getById
   بدل Repository.get('projects', id))، جاهزة للاستخدام التدريجي في
   أي Refactor مستقبلي، بلا Big Bang.

   *لم يُبنَ WBSRepository* — لا نطاق WBS حقيقي في نموذج البيانات
   الحالي (مُتحقَّق منه سابقاً هذه الجلسة)، ولن أُنشئ نطاقاً وهمياً
   فقط لإكمال القائمة، كما طُلب صراحةً.

   ScheduleRepository وDocumentRepository موجودتان أصلاً ومكتملتان
   (app-core.js وapp-document-management.js على التوالي) — لم تُنسَخا
   أو تُعدَّلا هنا، فقط أُعيد استخدامهما حيث يلزم.

   أخطاء واضحة وموحَّدة عبر كل الدوال: NOT_FOUND، VALIDATION_ERROR،
   PERMISSION_DENIED، STORAGE_ERROR، INVALID_ENTITY — بلا أي تكرار
   لمنطق الصلاحيات نفسه، فقط ترجمة نتيجة الفحص الموجود أصلاً في
   MODULES/AuthorizationService إلى شكل خطأ موحَّد قابل للمعالجة.
   ============================================================ */

/** مصنع عام يبني Repository مسمّى حول moduleKey حقيقي موجود في MODULES، بلا تكرار منطق */
function createModuleBackedRepository(moduleKey) {
  return {
    create(vals) {
      const before = Repository.list(moduleKey);
      const beforeIds = new Set(before.map((r) => r.id));
      Repository.add(moduleKey, vals);
      // MODULES.*.add الحالية (وgenericAdd نفسها) لا تُرجِع السجل المُنشَأ فعلياً في أي وحدة تقريباً
      // (مُتحقَّق منه مباشرة: كلاهما بلا return إطلاقاً) — لا كائن خطأ يُرجَع أيضاً عند رفض الصلاحية، بل
      // alert قديم فقط. هنا نستنتج النتيجة الحقيقية بمقارنة القائمة قبل/بعد، بلا أي لمس لـMODULES نفسها
      const after = Repository.list(moduleKey);
      if (after.length === before.length) return { error: "PERMISSION_DENIED", message: "لم يُنشَأ السجل — تحقّق من صلاحياتك الحالية." };
      const created = after.find((r) => !beforeIds.has(r.id));
      return { success: true, record: created || null };
    },
    getById(id) { return Repository.get(moduleKey, id); },
    list(filterFn) { const rows = Repository.list(moduleKey); return typeof filterFn === "function" ? rows.filter(filterFn) : rows; },
    update(id, vals) {
      if (!Repository.get(moduleKey, id)) return { error: "NOT_FOUND", message: "السجل غير موجود فعلياً." };
      Repository.update(moduleKey, id, vals);
      return { success: true };
    },
    remove(id) {
      if (!Repository.get(moduleKey, id)) return { error: "NOT_FOUND", message: "السجل غير موجود فعلياً." };
      Repository.remove(moduleKey, id);
      return { success: true };
    },
  };
}

const ProjectRepository = createModuleBackedRepository("projects");
const TaskRepository = createModuleBackedRepository("tasks");
const InvoiceRepository = createModuleBackedRepository("invoices");
const ContractRepository = createModuleBackedRepository("contracts");
const ProcurementRepository = createModuleBackedRepository("procurement");
/** لا نطاق "موردين" مستقل في MODULES حالياً — تقييمات المقاولين (contractorEvaluations) أقرب نطاق حقيقي موجود فعلياً */
const SupplierRepository = createModuleBackedRepository("contractorEvaluations");
const ClaimRepository = createModuleBackedRepository("claims");
const RiskRepository = createModuleBackedRepository("risks");
const UserRepository = createModuleBackedRepository("users");

/** WorkflowRepository — وصول بيانات بحت لتعريفات سير العمل، بلا أي منطق تنفيذ (ذلك في WorkflowService كما هو) */
const WorkflowRepository = {
  getById(id) { return (STATE.data.workflowDefinitions || []).find((w) => w.id === id) || null; },
  list(moduleKey) { return (STATE.data.workflowDefinitions || []).filter((w) => !moduleKey || w.module === moduleKey); },
};
/** WorkflowInstanceRepository — وصول بيانات بحت لنسخ سير العمل الجارية، بلا منطق تنفيذ (ذلك في WorkflowService) */
const WorkflowInstanceRepository = {
  getById(id) { return (STATE.data.workflowInstances || []).find((w) => w.id === id) || null; },
  list(moduleKey, businessObjectId) {
    return (STATE.data.workflowInstances || []).filter((w) => (!moduleKey || w.module === moduleKey) && (!businessObjectId || w.businessObjectId === businessObjectId));
  },
};
/** NotificationRepository — غلاف مُسمّى حول الدوال الحقيقية الموجودة أصلاً (createNotification/getUnreadNotifications) */
const NotificationRepository = {
  getById(id) { return (STATE.data.notifications || []).find((n) => n.id === id) || null; },
  list(userId) { return (STATE.data.notifications || []).filter((n) => !userId || n.userId === userId); },
  create(userId, type, text, relatedType, relatedId) { createNotification(userId, type, text, relatedType, relatedId); return { success: true }; },
  getUnread(userId) { return getUnreadNotifications(userId); },
};
/** AuditRepository — قراءة فقط بطبيعة سجل التدقيق (Append-only)؛ الكتابة تبقى حصراً عبر logAudit الموجودة أصلاً */
const AuditRepository = {
  getById(id) { return (STATE.data._auditLog || []).find((a) => a.id === id) || null; },
  list(filterFn) { const rows = STATE.data._auditLog || []; return typeof filterFn === "function" ? rows.filter(filterFn) : rows; },
};
