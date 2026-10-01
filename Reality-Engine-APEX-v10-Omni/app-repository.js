/* ============================================================
   طبقة خدمة المستودع (Repository Service Boundary)
   ============================================================
   غلاف تفويض بحت حول MODULES وgenericAdd/genericUpdate/genericRemove
   الموجودة أصلاً في app-modules.js — لا إعادة كتابة، لا تغيير سلوك.

   MODULES تبقى تماماً كما هي (تعريفها، حقولها، فحوصات الصلاحية
   الداخلية فيها). هذا الملف يوفّر واجهة استدعاء بديلة (Repository.*)
   لأي كود جديد، بحيث يصبح ممكناً مستقبلاً استبدال هذه العمليات
   بطلبات API/Backend حقيقية (Repository.update يصبح PUT /api/...)
   بلا أي تعديل على واجهة المستخدم التي تستدعيها — كما طُلب صراحةً.

   القراءة (list/get): لا توجد دالة قراءة موحَّدة في MODULES أصلاً
   (كل الاستدعاءات القديمة تقرأ STATE.data[collection] مباشرة في مئات
   المواضع) — لم أُغيِّر أي واحدة منها في هذه الجولة. الدوال هنا
   واجهة قراءة جديدة اختيارية لأي كود مستقبلي فقط.
   ============================================================ */

const Repository = {
  /** أسماء كل الوحدات المُسجَّلة فعلياً (تفويض مباشر لـ MODULES) */
  listModuleKeys() {
    return Object.keys(MODULES);
  },
  /** كل سجلات وحدة معيَّنة — قراءة مباشرة من STATE.data، لا تُغيِّر أي قراءة قديمة قائمة */
  list(moduleKey) {
    const mod = MODULES[moduleKey];
    if (!mod) return [];
    return STATE.data[mod.collection] || [];
  },
  /** سجل واحد بمعرِّفه */
  get(moduleKey, id) {
    return this.list(moduleKey).find((r) => r.id === id) || null;
  },
  /** إضافة سجل — تفويض مباشر لـ MODULES[moduleKey].add (يشمل فحص الصلاحية الداخلي كما هو) */
  add(moduleKey, vals) {
    const mod = MODULES[moduleKey];
    if (!mod) throw new Error(`وحدة غير معروفة: ${moduleKey}`);
    return mod.add(vals);
  },
  /** تعديل سجل — تفويض مباشر لـ MODULES[moduleKey].update */
  update(moduleKey, id, vals) {
    const mod = MODULES[moduleKey];
    if (!mod) throw new Error(`وحدة غير معروفة: ${moduleKey}`);
    return mod.update(id, vals);
  },
  /** حذف سجل — تفويض مباشر لـ MODULES[moduleKey].remove */
  remove(moduleKey, id) {
    const mod = MODULES[moduleKey];
    if (!mod) throw new Error(`وحدة غير معروفة: ${moduleKey}`);
    return mod.remove(id);
  },
};

/* ============================================================
   نُقلَت هاتان الدالتان من app-views.js بلا أي تغيير منطقي — طبقة
   Data Access حقيقية (كتابة/قراءة بسيطة بلا قاعدة أعمال). نقاط
   الاستدعاء الحقيقية (app-modules.js وapp-views.js، مُتحقَّق منها
   ببحث مباشر في الكود قبل النقل) تعمل تماماً كما كانت.
   ============================================================ */
function markRoomAsRead(roomId) {
  if (!STATE.user) return;
  STATE.data.chatRoomReadState = STATE.data.chatRoomReadState || [];
  const existing = STATE.data.chatRoomReadState.find((s) => s.roomId === roomId && s.userId === STATE.user.id);
  if (existing) existing.lastReadTimestamp = Date.now();
  else STATE.data.chatRoomReadState.push({ roomId, userId: STATE.user.id, lastReadTimestamp: Date.now() });
  saveData(STATE.data);
}
function createNotification(userId, type, text, relatedType, relatedId) {
  if (!userId) return;
  STATE.data.notifications = STATE.data.notifications || [];
  STATE.data.notifications.push({ id: uid(), userId, type, text, relatedType, relatedId, createdAt: Date.now(), read: false });
  saveData(STATE.data);
}
