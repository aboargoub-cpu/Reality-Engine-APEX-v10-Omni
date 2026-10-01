/* ============================================================
   Notification Engine — محرك إشعارات مركزي حقيقي
   ============================================================
   الحالة السابقة (مُتحقَّق منها بالفحص المباشر): createNotification
   كانت تُستدعى مباشرة ومُضمَّنة (hardcoded) من 8 مواضع مختلفة داخل
   منطق الأعمال (ردود الملاحظات، طلبات نقل الموارد، الإشارة في
   الدردشة) — كل موضع يبني نص الإشعار بنفسه بلا أي تنظيم مركزي.

   هذا الملف يُضيف طبقة مركزية حقيقية فوق ذلك، بلا حذف أو كسر لأي
   شيء موجود:
     - createNotification/getUnreadNotifications/markNotificationRead
       تبقى تماماً كما هي (لم تُحذَف، لم تُعدَّل توقيعاتها).
     - المخطَّط الحالي {id, userId, type, text, relatedType, relatedId,
       createdAt, read} يبقى صالحاً 100%، الحقول الجديدة (priority,
       entityLink, action, dueDate, source) إضافية اختيارية فقط —
       أي إشعار قديم بلا هذه الحقول يستمر بالعمل بلا أي مشكلة في
       renderNotificationPanel/goToNotification الموجودتين أصلاً.

   ناقل أحداث حقيقي مخصَّص (بنفس نمط createEventBus المُستخدَم أصلاً
   لـDigitalTwinEvents/ScheduleEvents) — أي مصدر بيانات يُصدِر حدثاً
   حقيقياً هنا، والمحرك نفسه يستمع ويُترجم لإشعار حقيقي، بدل استدعاء
   مباشر مُبعثَر لكل حالة.
   ============================================================ */

const NotificationEvents = createEventBus();

/* ============================================================
   1) قنوات الإرسال — In-App حقيقية تعمل الآن، والباقي مُسجَّل
      بصدق كامل كواجهة جاهزة غير مُفعَّلة (لا وظيفة مزيَّفة)
   ============================================================ */
const NotificationChannelProviders = {};
function registerNotificationChannel(name, provider) {
  if (typeof provider.send !== "function") throw new Error(`قناة إشعار "${name}" يجب أن توفّر send().`);
  NotificationChannelProviders[name] = provider;
}
registerNotificationChannel("inApp", {
  displayName: "داخل النظام (In-App) — تعمل فعلياً الآن",
  staticallyAvailable: true,
  send(notification) {
    STATE.data.notifications = STATE.data.notifications || [];
    STATE.data.notifications.push(notification);
    saveData(STATE.data);
    return { success: true };
  },
});
["email", "msTeams", "push", "sms"].forEach((name) => {
  const labels = { email: "البريد الإلكتروني", msTeams: "Microsoft Teams", push: "إشعارات الجوال (Push)", sms: "رسائل SMS" };
  registerNotificationChannel(name, {
    displayName: `${labels[name]} — مُسجَّلة ضمن البنية، غير مُفعَّلة بعد`,
    staticallyAvailable: false,
    send() { return { success: false, reason: `قناة "${labels[name]}" مُسجَّلة (تثبت قابلية التبديل الفعلية) لكن تحتاج خدمة خلفية حقيقية غير موجودة بعد — لا إرسال وهمي.` }; },
  });
});

/* ============================================================
   2) المحرك المركزي — كل حقول المخطَّط المطلوبة، بتوافق كامل رجعي
   ============================================================ */
const NotificationEngine = {
  notify({ userId, source, type, text, priority, entityLink, action, dueDate, relatedType, relatedId, channels }) {
    if (!userId) return { success: false, reason: "userId مطلوب." };
    const notification = {
      id: uid(), userId, type: type || "update", text: text || "", createdAt: Date.now(), read: false,
      source: source || null,
      priority: priority || "متوسطة",
      dueDate: dueDate || null,
      action: action || null,
      entityLink: entityLink || (relatedType ? { moduleKey: relatedType, recordId: relatedId } : null),
      relatedType: relatedType || (entityLink ? entityLink.moduleKey : null),
      relatedId: relatedId || (entityLink ? entityLink.recordId : null),
    };
    const targetChannels = channels && channels.length ? channels : ["inApp"];
    const results = targetChannels.map((ch) => {
      const provider = NotificationChannelProviders[ch];
      if (!provider) return { channel: ch, success: false, reason: "قناة غير مسجَّلة." };
      return Object.assign({ channel: ch }, provider.send(notification));
    });
    return { success: results.some((r) => r.success), notification, channelResults: results };
  },
  emit(source, eventType, payload) {
    NotificationEvents.emit(`${source}:${eventType}`, payload);
  },
  on(source, eventType, handler) {
    return NotificationEvents.on(`${source}:${eventType}`, handler);
  },
};

/* ============================================================
   3) مستمعون حقيقيون — تحويل حدث فعلي لإشعار فعلي
   ============================================================ */
/* ============================================================
   4) SLA — مصدر إشعارات حقيقي مطلوب صراحةً، كان غائباً تماماً كإشعار
      فعلي (checkWorkflowSLA كانت تُستخدَم فقط للعرض المرئي في لوحة
      "اعتماداتي المُعلَّقة"، لا لإصدار أي إشعار حقيقي أبداً).

      *صدق كامل حول طبيعة هذا الفحص*: هذا نظام PWA بلا خادم حقيقي أو
      مُجدوِل خلفي (لا setInterval أو Cron موجود أصلاً في كل الكود) —
      هذا فحص حقيقي يعمل عند كل إقلاع/تحميل حقيقي للتطبيق (لحظة
      استخدام فعلية)، لا دفعاً فورياً حقيقياً في الخلفية بلا تفاعل.
      تتبّع slaBreachNotifiedAt على نسخة سير العمل نفسها يمنع تكرار
      الإشعار في كل فحص لاحق لنفس الخرق.
   ============================================================ */
function scanForSLABreaches() {
  if (!STATE.user) return { checked: 0, notified: 0 };
  const activeInstances = (STATE.data.workflowInstances || []).filter((i) => i.status === "قيد التنفيذ");
  let notifiedCount = 0;
  activeInstances.forEach((instance) => {
    const sla = checkWorkflowSLA(instance); // تفويض مباشر بحت — لا تكرار لمنطق حساب المهلة نفسه
    if (!sla.overdue || instance.slaBreachNotifiedAt) return;
    const def = (STATE.data.workflowDefinitions || []).find((w) => w.id === instance.workflowDefId);
    const stage = def ? def.stages.find((s) => s.id === instance.currentStageId) : null;
    if (!stage) return;
    const approver = resolveStageApprover(stage, { id: instance.businessObjectId }); // تفويض مباشر بحت أيضاً
    const targetUserIds = [];
    if (approver && approver.type === "user" && approver.userId) targetUserIds.push(approver.userId);
    else if (approver && approver.type === "role") (STATE.data.users || []).filter((u) => u.role === approver.role).forEach((u) => targetUserIds.push(u.id));
    targetUserIds.forEach((uid_) => NotificationEngine.notify({
      userId: uid_, source: "sla", type: "update",
      text: `تجاوز مهلة الاعتماد (SLA): ${instance.module} #${instance.businessObjectId} — متأخر ${sla.hoursElapsed} ساعة${sla.escalationLevel === "تصعيد للمدير" ? " — يحتاج تصعيداً فعلياً" : ""}`,
      priority: sla.escalationLevel === "تصعيد للمدير" ? "عاجلة" : "عالية",
      entityLink: { moduleKey: instance.module, recordId: instance.businessObjectId, projectId: instance.projectId },
      action: { label: "اعتماد الآن", navKey: instance.module },
    }));
    if (targetUserIds.length) {
      instance.slaBreachNotifiedAt = Date.now();
      notifiedCount++;
    }
  });
  if (notifiedCount) saveData(STATE.data);
  return { checked: activeInstances.length, notified: notifiedCount };
}
NotificationEngine.on("workflow", "advanced", (payload) => {
  if (!payload.notifyUserId) return;
  NotificationEngine.notify({
    userId: payload.notifyUserId, source: "workflow", type: "update",
    text: `سير عمل "${payload.moduleKey}": ${payload.action === "approve" ? "اعتماد" : payload.action === "reject" ? "رفض" : payload.action} — ${payload.label || ""}`,
    priority: payload.action === "reject" ? "عالية" : "متوسطة",
    entityLink: { moduleKey: payload.moduleKey, recordId: payload.businessObjectId, projectId: payload.projectId },
    action: { label: "عرض التفاصيل", navKey: payload.moduleKey },
  });
});

/* مستمع حقيقي لحدث موجود أصلاً بلا أي تعديل عليه (DigitalTwinEvents.emit("inspection:rejected", ...) في
   app-digitaltwin.js) — يُترجمه لإشعار حقيقي لمدير المشروع الفعلي، محقِّقاً مصدر QA/QC المطلوب بأسلوب
   Event-Driven حقيقي، لا استدعاء مباشر جديد داخل منطق التفتيش نفسه */
if (typeof DigitalTwinEvents !== "undefined") {
  DigitalTwinEvents.on("inspection:rejected", (inspection) => {
    const project = (STATE.data.projects || []).find((p) => p.id === inspection.projectId);
    if (!project || !project.projectManagerId) return;
    const pmResource = (STATE.data.resourcePool || []).find((r) => r.id === project.projectManagerId);
    const pmUser = pmResource ? (STATE.data.users || []).find((u) => u.linkedResourceId === pmResource.id) : null;
    if (!pmUser) return;
    NotificationEngine.notify({
      userId: pmUser.id, source: "qaqc", type: "update",
      text: `تفتيش ذكي مرفوض بواسطة ${inspection.inspectorName || "—"} — يحتاج مراجعة عاجلة`, priority: "عاجلة",
      entityLink: { moduleKey: "digitalTwin", recordId: inspection.id, projectId: inspection.projectId },
      action: { label: "عرض التفتيش", navKey: "digitalTwin" },
    });
  });
}
