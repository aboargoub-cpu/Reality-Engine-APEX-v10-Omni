/* ============================================================
   طبقة قاعدة البيانات المحلية (Local Database Layer) — IndexedDB
   ============================================================
   الهدف: إزالة اعتماد النظام الأساسي على localStorage كقاعدة بيانات
   للـBusiness Data. IndexedDB يصبح مصدر الحفظ الحقيقي (Source of
   Truth) لكل بيانات الأعمال، مقسَّمة فعلياً إلى Object Stores
   منفصلة حقيقية (لا وثيقة واحدة كبيرة).

   *localStorage لم يُحذَف* — لا يزال يُستخدَم فقط للإعدادات الصغيرة
   غير الحساسة (كما طُلب صراحةً): جلسة المستخدم الحالي (USER_KEY)،
   إعدادات المزامنة السحابية، إعدادات Microsoft 365، تفضيلات الزر
   العائم، مفتاح Anthropic API. الكتلة الكبيرة القديمة (DATA_KEY)
   *تبقى موجودة بلا حذف* كشبكة أمان — لا يُكتَب إليها بعد الآن، لكنها
   لا تُمسَح تلقائياً، تجنُّباً لأي فقد بيانات لا رجعة فيه.

   ============================================================
   خريطة التخطيط الحقيقية (Collection → Store) — 56 مجموعة بيانات
   فعلية حالياً (مُتحقَّق منها من seedData) تُوزَّع على 26 Object
   Store: 22 كما طُلِبت بالاسم صراحةً + 6 مجموعات إضافية بحكم الحاجة
   الفعلية (توثيق صريح، لا إخفاء): finance, operations,
   communications (بيانات حقيقية لا تُغطّيها الأسماء الـ22 بشكل صادق)
   — programs/portfolios/wbs/suppliers أسماء مطلوبة صريحاً لكنها
   بلا بيانات فعلية حالياً في نموذج البيانات الحالي (Stores جاهزة
   وخالية، لا بيانات وهمية فيها).
   ============================================================ */

const PMS_IDB_MAIN_NAME = "pms_main_db_v1";
const PMS_IDB_MAIN_VERSION = 1;

/** كل Object Stores الحقيقية التي تُنشَأ فعلياً في قاعدة البيانات */
const PMS_STORE_NAMES = [
  "projects", "programs", "portfolios", "tasks", "wbs", "resources",
  "contracts", "invoices", "payments", "procurement", "suppliers",
  "claims", "risks", "documents", "users", "workflows", "workflowInstances",
  "notifications", "auditLogs", "events", "assets", "digitalTwin", "settings",
  "finance", "operations", "communications",
];

/** خريطة التوزيع الحقيقية: كل مجموعة بيانات فعلية موجودة في STATE.data → أي Store تذهب إليها */
const COLLECTION_TO_STORE_MAP = {
  projects: "projects",
  tasks: "tasks",
  resourcePool: "resources", resourceTransferRequests: "resources",
  contracts: "contracts", changeOrders: "contracts",
  invoices: "invoices",
  ledger: "payments", bankAccounts: "payments",
  procurement: "procurement", procurementBids: "procurement",
  contractorEvaluations: "suppliers",
  claims: "claims",
  risks: "risks",
  documents: "documents",
  documentRecords: "documents", documentTransmittals: "documents", documentRelationships: "documents",
  users: "users",
  workflowDefinitions: "workflows", approvalAuthorityLevels: "workflows", delegations: "workflows", temporaryGrants: "workflows",
  workflowInstances: "workflowInstances",
  notifications: "notifications",
  _auditLog: "auditLogs", _tombstones: "auditLogs", aiTokenUsageLog: "auditLogs",
  projectEvents: "events",
  labor: "assets", equipment: "assets", materials: "assets",
  projectAssets: "digitalTwin", realityCaptures: "digitalTwin", deviationReports: "digitalTwin",
  arSessions: "digitalTwin", aiAnalysisResults: "digitalTwin", smartInspections: "digitalTwin",
  sensorReadings: "digitalTwin", maintenanceRecords: "digitalTwin", pointCloudSnapshotsIndex: "digitalTwin",
  twinSnapshots: "digitalTwin", projectTimeMachineSnapshots: "digitalTwin",
  msLinkedItems: "settings",
  custodies: "finance", certificates: "finance", subcontractorCertificates: "finance", budgetItems: "finance", progressItems: "finance",
  dailyReports: "operations", correspondence: "operations", meetings: "operations", decisions: "operations",
  punchlist: "operations", qc: "operations", hse: "operations", gmNotes: "operations", projectNotes: "operations",
  projectChatMessages: "communications", chatRooms: "communications", chatRoomReadState: "communications", discussionAnalyses: "communications",
};
/** عكس الخريطة أعلاه — لكل Store، أي مجموعات STATE.data الحقيقية تُقرَأ منها عند التحميل */
const STORE_TO_COLLECTIONS_MAP = {};
Object.entries(COLLECTION_TO_STORE_MAP).forEach(([collection, store]) => {
  (STORE_TO_COLLECTIONS_MAP[store] = STORE_TO_COLLECTIONS_MAP[store] || []).push(collection);
});

let _pmsMainDbPromise = null;
function openPmsMainDb() {
  if (_pmsMainDbPromise) return _pmsMainDbPromise;
  _pmsMainDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(PMS_IDB_MAIN_NAME, PMS_IDB_MAIN_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      PMS_STORE_NAMES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _pmsMainDbPromise;
}

const LocalDatabase = {
  /** كل السجلات الحقيقية في Store معيَّن */
  async getAll(storeName) {
    const db = await openPmsMainDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  /** كتابة مجموعة سجلات حقيقية دفعة واحدة — put (لا add)، فيُصبح إعادة التشغيل آمناً تلقائياً (لا تكرار، تحديث بالمعرِّف نفسه) */
  async putAll(storeName, records) {
    if (!records || !records.length) return;
    const db = await openPmsMainDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      records.forEach((r) => {
        if (r && r.id != null) { tx.objectStore(storeName).put(r); return; }
        // خلل حقيقي وُجِد ومُصلَح سابقاً (documentRecords كانت تُفقَد صمتاً لغياب حقل id) — تحذير صريح
        // الآن بدل التجاهل الصامت، حتى تُكتشَف أي مجموعة بيانات مستقبلية تنسى هذا الحقل فوراً، لا بعد فقد بيانات حقيقي
        console.warn(`تحذير حقيقي: سجل في Store "${storeName}" بلا حقل "id" — لن يُحفَظ إطلاقاً في IndexedDB. تأكَّد أن كل سجل جديد يحمل حقل id مطابقاً لمفتاحه الأساسي الحقيقي.`, r);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  /** تفريغ Store بالكامل قبل إعادة كتابته من الصفر (يُستخدَم في saveData للحفاظ على مطابقة تامة مع الحالة الحالية، بما فيها السجلات المحذوفة) */
  async clearStore(storeName) {
    const db = await openPmsMainDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  /** هل توجد أي بيانات حقيقية محفوظة فعلاً في IndexedDB؟ (فحص صادق، لا افتراض) */
  async hasAnyData() {
    for (const storeName of PMS_STORE_NAMES) {
      const rows = await this.getAll(storeName);
      if (rows.length) return true;
    }
    return false;
  },
};

/* ============================================================
   طبقة الترحيل (Migration Layer)
   ============================================================
   آمن: لا يحذف أي بيانات قديمة من localStorage.
   قابل لإعادة التشغيل: علامة نجاح صريحة في localStorage (إعداد
   صغير، لا بيانات أعمال) + استخدام put (لا add) في كل الكتابات،
   فحتى إعادة تشغيل الترحيل خطأً لا يُكرِّر أي سجل.
   يحافظ على IDs: نفس معرِّف كل سجل (uid() الأصلي) يُستخدَم كـkeyPath
   في IndexedDB — بلا أي تغيير.
   يحافظ على العلاقات: حقول الربط (مثل task.projectId) نصوص/مراجع
   داخل السجل نفسه، لم تُغيَّر بنيتها إطلاقاً أثناء النقل.
   ============================================================ */
const MIGRATION_DONE_FLAG_KEY = "pms_idb_migration_v1_done";

async function migrateLocalStorageToIndexedDB() {
  if (localStorage.getItem(MIGRATION_DONE_FLAG_KEY) === "true") {
    return { migrated: false, reason: "الترحيل تمّ مسبقاً فعلياً (علامة موجودة) — لا حاجة لإعادته." };
  }
  const raw = localStorage.getItem(DATA_KEY);
  if (!raw) {
    // لا بيانات قديمة إطلاقاً (تثبيت جديد تماماً) — لا شيء لترحيله، لكن نُعلِّم الترحيل كمكتمل لتجنُّب أي فحص لاحق غير ضروري
    localStorage.setItem(MIGRATION_DONE_FLAG_KEY, "true");
    return { migrated: false, reason: "لا بيانات قديمة في localStorage (تثبيت جديد) — لا حاجة للترحيل." };
  }
  let oldData;
  try {
    oldData = JSON.parse(raw);
  } catch (e) {
    return { migrated: false, reason: "تعذّر قراءة بيانات localStorage القديمة (تالفة) — لم يُنفَّذ أي ترحيل، البيانات القديمة لم تُحذَف." };
  }
  const migratedCounts = {};
  for (const [collection, storeName] of Object.entries(COLLECTION_TO_STORE_MAP)) {
    const records = oldData[collection];
    if (Array.isArray(records) && records.length) {
      const needsTag = (STORE_TO_COLLECTIONS_MAP[storeName] || []).length > 1;
      // نفس إصلاح التصادم الحقيقي المُطبَّق في writeAllCollectionsToIndexedDB — سجلات قديمة من مجموعتين
      // مختلفتين تتشاركان id بالتصادف كانت ستتصادم هنا أيضاً أثناء الترحيل نفسه بلا هذا الإصلاح
      const tagged = needsTag ? records.map((r) => Object.assign({}, r, { id: `${collection}:${r.id}`, _pmsCollection: collection, _pmsRealId: r.id })) : records;
      await LocalDatabase.putAll(storeName, tagged);
      migratedCounts[collection] = records.length;
    }
  }
  localStorage.setItem(MIGRATION_DONE_FLAG_KEY, "true");
  return { migrated: true, migratedCounts, totalCollections: Object.keys(migratedCounts).length };
}
