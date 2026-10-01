/* ============================================================
   طبقة خدمة الأحداث (Event Service Boundary)
   ============================================================
   تحليل دقيق فعلي (لا تخمين) لثلاث آليات أحداث موجودة حالياً:

   1) createEventBus() (app-core.js) — تنفيذ Pub/Sub عام صحيح
      (on/emit/unsubscribe). حالتان فعليتان:
        - ScheduleEvents: تُصدِر فعلياً "task:created"/"task:updated"
          من داخل ScheduleRepository.saveTask — **لكن صفر مستمع
          (.on) مُسجَّل في أي ملف آخر حالياً**. بنية تحتية جاهزة،
          بلا مستهلك حتى الآن — لا كود ميت حرفياً (تُصدِر فعلاً)،
          لكن لا أثر مرصود لأي مستمع بعد.
        - DigitalTwinEvents: 7 نقاط إصدار حقيقية (asset:created/updated,
          capture:added, deviation:added, inspection:added/rejected,
          snapshot:created, state:changed) — **نفس الحال: صفر مستمع
          مُسجَّل حالياً في أي ملف آخر**.
      لم تُحذَف أي منهما. الاتجاه المعماري المستقبلي هو createEventBus،
      كما طُلب صراحةً.

   2) emitProjectEvent (app-core.js) — **ليست Pub/Sub فعلياً**: تكتب
      مباشرة وبشكل متزامن إلى STATE.data.projectEvents وتستدعي
      saveData()، وتُقرَأ عبر getProjectEvents/getEventsForEntity من
      نفس المصفوفة مباشرة. 11 نقطة استدعاء حقيقية عبر النظام تعتمد
      على هذا السلوك المتزامن بالضبط. تحويلها لتمرّ عبر createEventBus
      بلا مستمع يُنفِّذ الكتابة نفسها سيُوقِف الكتابة فعلياً ويُعطِّل كل
      قارئ — لهذا **لم يتم أي تحويل لمنطقها الداخلي في هذه الجولة**؛
      هذا يحتاج خطوة منفصلة متعمَّدة، لا نقلاً عرضياً هنا.

   الغلاف أدناه لا يُغيِّر أي سلوك — تفويض مباشر بحت.
   ============================================================ */

const EventService = {
  /** الاستماع لحدث على ناقل التوثيق الرقمي (DigitalTwinEvents) */
  onDigitalTwin(eventName, handler) {
    return DigitalTwinEvents.on(eventName, handler);
  },
  /** إصدار حدث على ناقل التوثيق الرقمي */
  emitDigitalTwin(eventName, payload) {
    return DigitalTwinEvents.emit(eventName, payload);
  },
  /** الاستماع لحدث على ناقل الجدولة (ScheduleEvents) */
  onSchedule(eventName, handler) {
    return ScheduleEvents.on(eventName, handler);
  },
  /** إصدار حدث على ناقل الجدولة */
  emitSchedule(eventName, payload) {
    return ScheduleEvents.emit(eventName, payload);
  },
  /** تفويض مباشر لـ emitProjectEvent — بلا أي تغيير في آليته الداخلية (كتابة متزامنة حقيقية، لا حافلة أحداث) */
  emitProjectEvent(eventData) {
    return emitProjectEvent(eventData);
  },
  /** تفويض مباشر لقراءة أحداث مشروع معيَّن */
  getProjectEvents(projectId) {
    return getProjectEvents(projectId);
  },
};
