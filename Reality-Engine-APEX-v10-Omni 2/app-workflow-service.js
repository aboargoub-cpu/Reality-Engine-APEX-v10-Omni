/* ============================================================
   طبقة خدمة سير العمل (Workflow Service Boundary)
   ============================================================
   محرك سير العمل الحقيقي الوحيد موجود بالكامل في app-core.js:
     startWorkflowInstance, getWorkflowInstanceFor, resolveStageApprover,
     userMatchesApprover, violatesSeparationOfDuties, canActOnWorkflowInstance,
     advanceWorkflow, checkWorkflowSLA, getMyWorkflowTasks

   هذا الملف غلاف تفويض بحت — لا إعادة تنفيذ، لا محرك ثانٍ. الهدف نقطة
   استدعاء واحدة (WorkflowService.*) لأي كود جديد مستقبلاً.

   ============================================================
   حقيقة مُتحقَّقة من البيانات الفعلية (seedData في app-core.js):
   المحرك نفسه عام بالتصميم (يعمل مع أي moduleKey له تعريف نشط)،
   لكن **حالياً يوجد تعريف سير عمل نشط لوحدة "invoices" فقط**.
   الشهادات (certificates)، شهادات المقاولين (subcontractorCertificates)،
   أوامر التغيير (changeOrders)، والمطالبات (claims) تُدار حالياً عبر
   حقول "status/stage" وآليات انتقال مكتوبة يدوياً بشكل مستقل تماماً
   عن هذا المحرك (مثال: subcontractorCertAdvanceStage, certificateAdvanceStage) —
   لم تُدمَج مع المحرك في هذه الجولة، لأن ذلك يغيّر سلوكاً فعلياً
   ويحتاج اختباراً مخصَّصاً منفصلاً ومتعمَّداً، لا نقلاً عرضياً ضمن
   هذا الـRefactor المعماري.

   لتوسعة المحرك لوحدة جديدة مستقبلاً (خطوة منفصلة قادمة، لا هنا):
   1) إضافة إدخال جديد في workflowDefinitions بـmodule: "<الوحدة>" وactive: true.
   2) استبدال دالة الانتقال اليدوية الحالية لتلك الوحدة باستدعاء
      WorkflowService.start / WorkflowService.advance بدلاً من التعديل المباشر لحقل status.
   3) اختبار كامل لكل مسارات الاعتماد/الرفض/الإرجاع قبل أي إطلاق.
   ============================================================ */

const WorkflowService = {
  /** بدء نسخة سير عمل جديدة لكائن أعمال حقيقي (تفويض مباشر لـ startWorkflowInstance) */
  start(moduleKey, businessObjectId, projectId) {
    return startWorkflowInstance(moduleKey, businessObjectId, projectId);
  },
  /** نسخة سير العمل النشطة الحالية لكائن أعمال محدَّد (تفويض مباشر لـ getWorkflowInstanceFor) */
  getInstanceFor(moduleKey, businessObjectId) {
    return getWorkflowInstanceFor(moduleKey, businessObjectId);
  },
  /** هل يملك هذا المستخدم صلاحية اتخاذ هذا الإجراء على نسخة سير عمل محدَّدة؟ */
  canAct(user, instance, action) {
    return canActOnWorkflowInstance(user, instance, action);
  },
  /** تقديم إجراء (اعتماد/رفض/إعادة/إعادة تقديم/إلغاء) — تفويض مباشر لـ advanceWorkflow */
  advance(moduleKey, businessObjectId, action, comment) {
    return advanceWorkflow(moduleKey, businessObjectId, action, comment);
  },
  /** فحص تجاوز مهلة الخدمة (SLA) لمرحلة سير عمل حالية */
  checkSLA(instance) {
    return checkWorkflowSLA(instance);
  },
  /** كل مهام الاعتماد المُعلَّقة الحقيقية لمستخدم معيَّن */
  getMyTasks(user) {
    return getMyWorkflowTasks(user);
  },
  /** هل يوجد تعريف سير عمل نشط لهذه الوحدة فعلياً؟ (فحص صادق، لا افتراض) */
  hasActiveDefinition(moduleKey) {
    return !!getActiveWorkflowDefinition(moduleKey);
  },
};
