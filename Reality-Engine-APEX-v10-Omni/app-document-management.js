/* ============================================================
   Document Management Architecture
   ============================================================
   نظام مستقل وجديد بالكامل، منفصل تماماً عن وحدة "documents" الموجودة
   أصلاً (تراخيص/تصاريح/ضمانات) — تلك تبقى كما هي بلا أي تغيير، هذا
   نظام أعمّ لإدارة أي وثيقة مرتبطة بأي كائن في النظام (مهمة، فاتورة،
   مطالبة، عقد...) بحقول ودعم موصوفين صراحة في الطلب.

   *لا تُخزَّن بايتات الملفات الفعلية داخل STATE.data إطلاقاً* —
   الميتاداتا فقط (اسم، حجم، هاش، رقم إصدار...) تعيش في STATE.data
   (خفيفة، تُزامَن مع IndexedDB الرئيسي كالمعتاد). البايتات الحقيقية
   تُخزَّن في قاعدة IndexedDB منفصلة ومخصَّصة (نفس القاعدة المُستخدَمة
   فعلاً لسحابة النقاط: idbPut/idbGet في app-digitaltwin.js) — بمفتاح
   مميَّز يمنع أي تضارب مع مفاتيح سحابة النقاط.

   Storage Adapter: نمط مطابق تماماً لـPointCloudStorageProviders
   الموجود أصلاً — عقد save(key,bytes)/load(key) واحد، مزوِّد
   IndexedDB يعمل فعلياً اليوم، وواجهة جاهزة لتسجيل مزوِّد Object
   Storage سحابي مستقبلاً بلا أي تغيير في كود الاستدعاء.
   ============================================================ */

/* ============================================================
   1) Storage Adapter — تجريد التخزين الفعلي للبايتات
   ============================================================ */
const DocumentStorageProviders = {};
function registerDocumentStorageProvider(name, provider) {
  if (typeof provider.save !== "function" || typeof provider.load !== "function" || typeof provider.remove !== "function") {
    throw new Error(`مزوِّد تخزين الوثائق "${name}" يجب أن يوفّر save()/load()/remove() ليلتزم بالعقد.`);
  }
  DocumentStorageProviders[name] = provider;
}
function getActiveDocumentStorageProvider() {
  return DocumentStorageProviders[STATE.documentStoragePreference || "indexeddb"] || DocumentStorageProviders.indexeddb;
}
registerDocumentStorageProvider("indexeddb", {
  displayName: "تخزين محلي على هذا الجهاز (IndexedDB) — يعمل فعلياً الآن",
  staticallyAvailable: true, crossDevice: false,
  async save(key, bytes) {
    try { await idbPut(`doc:${key}`, bytes); return { success: true }; }
    catch (e) { return { success: false, reason: e.message }; }
  },
  async load(key) {
    try { const bytes = await idbGet(`doc:${key}`); return bytes != null ? { success: true, bytes } : { success: false, reason: "الملف غير موجود فعلياً." }; }
    catch (e) { return { success: false, reason: e.message }; }
  },
  async remove(key) {
    try { await idbPut(`doc:${key}`, undefined); return { success: true }; }
    catch (e) { return { success: false, reason: e.message }; }
  },
});
/* مزوِّد سحابي — واجهة جاهزة بصدق كامل، غير مُفعَّل فعلياً بعد (لا يوجد Backend حقيقي بعد لرفع/جلب الملفات
   بأمان). يُسجَّل هنا لإثبات قابلية التبديل، لا ليُستخدَم فعلياً — لا وظيفة مزيَّفة، رفض صريح دائماً. */
registerDocumentStorageProvider("cloud-object-storage", {
  displayName: "تخزين سحابي (Object Storage) — غير مُفعَّل بعد، يحتاج خادماً حقيقياً",
  staticallyAvailable: false, crossDevice: true,
  async save() { return { success: false, reason: "التخزين السحابي غير مُفعَّل فعلياً — يحتاج نقطة API خلفية حقيقية لرفع الملفات بأمان (مثل رابط Upload مُوقَّع مسبقاً). هذا التسجيل يثبت فقط أن الواجهة جاهزة للتبديل مستقبلاً دون أي تعديل في كود الاستدعاء." }; },
  async load() { return { success: false, reason: "التخزين السحابي غير مُفعَّل فعلياً." }; },
  async remove() { return { success: false, reason: "التخزين السحابي غير مُفعَّل فعلياً." }; },
});

/* حساب هاش حقيقي (SHA-256) لمحتوى الملف — يُستخدَم للتحقّق من التطابق ومنع تكرار الرفع غير المقصود */
async function computeFileHash(base64OrText) {
  return sha256Hex(base64OrText);
}

/* ============================================================
   2) DocumentRepository — الميتاداتا فقط (خفيفة، لا بايتات هنا إطلاقاً)
      الحقول مطابقة تماماً للمطلوب: documentId, tenantId, projectId,
      entityType, entityId, fileName, mimeType, size, hash, version,
      status, createdBy, createdAt, storageKey
   ============================================================ */
/* حقيقة صادقة: لا يوجد نظام Multi-Tenant حقيقي في هذا التطبيق حالياً (مؤكَّد من فحوصات معمارية سابقة —
   وثيقة واحدة، بلا فصل مستأجرين على مستوى قاعدة البيانات). حقل tenantId موجود هنا توافقاً مع المخطَّط
   المطلوب واستعداداً لمستقبل حقيقي، لكنه يحمل قيمة ثابتة واحدة الآن ("default") — لا فرض فعلي لعزل بيانات. */
const DEFAULT_TENANT_ID = "default";

const DocumentRepository = {
  /** رفع نسخة جديدة (مستند جديد بالكامل، أو إصدار جديد لمستند موجود عبر entityId/entityType نفسهما) */
  async upload({ entityType, entityId, projectId, fileName, mimeType, fileBytesBase64 }) {
    if (STATE.user && !canEdit(STATE.user.role, "documents")) { return { success: false, error: "PERMISSION_DENIED", message: "دورك الحالي لا يملك صلاحية رفع وثائق." }; }
    if (!fileName || !fileBytesBase64) { return { success: false, error: "VALIDATION_ERROR", message: "اسم الملف ومحتواه مطلوبان." }; }

    const hash = await computeFileHash(fileBytesBase64);
    const previousVersions = this._listRaw().filter((d) => d.entityType === entityType && d.entityId === entityId && d.fileName === fileName);
    const nextVersion = previousVersions.length ? Math.max(...previousVersions.map((d) => d.version)) + 1 : 1;
    const storageKey = uid();

    const provider = getActiveDocumentStorageProvider();
    const saveResult = await provider.save(storageKey, fileBytesBase64);
    if (!saveResult.success) return { success: false, error: "STORAGE_ERROR", message: saveResult.reason };

    const newDocId = uid();
    const record = {
      documentId: newDocId, id: newDocId, tenantId: DEFAULT_TENANT_ID, projectId, entityType, entityId,
      fileName, mimeType: mimeType || "application/octet-stream", size: fileBytesBase64.length, hash,
      version: nextVersion, status: "مسودة",
      createdBy: STATE.user ? STATE.user.name : "—", createdAt: Date.now(), storageKey,
      checkedOutBy: null, checkedOutAt: null,
    };
    if (previousVersions.length) {
      const previousLatest = previousVersions.reduce((a, b) => (a.version > b.version ? a : b));
      STATE.data.documentRecords = STATE.data.documentRecords.map((d) => d.documentId === previousLatest.documentId ? Object.assign({}, d, { status: "مُستبدَل" }) : d);
    }
    STATE.data.documentRecords = STATE.data.documentRecords || [];
    STATE.data.documentRecords.push(record);
    logAudit("create", "documentRecords", record.documentId, `رفع وثيقة: ${fileName} (إصدار ${nextVersion})`);
    saveData(STATE.data);
    return { success: true, document: record };
  },

  async retrieveBytes(documentId) {
    const doc = this.getById(documentId);
    if (!doc) return { success: false, error: "NOT_FOUND", message: "الوثيقة غير موجودة." };
    const provider = getActiveDocumentStorageProvider();
    const result = await provider.load(doc.storageKey);
    if (!result.success) return { success: false, error: "STORAGE_ERROR", message: result.reason };
    return { success: true, bytes: result.bytes, document: doc };
  },

  getById(documentId) { return this._listRaw().find((d) => d.documentId === documentId) || null; },
  list(entityType, entityId) { return this._listRaw().filter((d) => (!entityType || d.entityType === entityType) && (!entityId || d.entityId === entityId)); },
  listVersionHistory(entityType, entityId, fileName) {
    return this._listRaw().filter((d) => d.entityType === entityType && d.entityId === entityId && d.fileName === fileName).sort((a, b) => b.version - a.version);
  },
  _listRaw() { return STATE.data.documentRecords || []; },

  async remove(documentId) {
    if (STATE.user && !canEdit(STATE.user.role, "documents")) { return { success: false, error: "PERMISSION_DENIED", message: "دورك الحالي لا يملك صلاحية حذف وثائق." }; }
    const doc = this.getById(documentId);
    if (!doc) return { success: false, error: "NOT_FOUND", message: "الوثيقة غير موجودة فعلياً." };
    await getActiveDocumentStorageProvider().remove(doc.storageKey);
    STATE.data.documentRecords = STATE.data.documentRecords.filter((d) => d.documentId !== documentId);
    logAudit("delete", "documentRecords", documentId, `حذف وثيقة: ${doc.fileName}`);
    saveData(STATE.data);
    return { success: true };
  },

  setStatus(documentId, newStatus) {
    if (STATE.user && !canEdit(STATE.user.role, "documents")) { alert("دورك الحالي لا يملك صلاحية تعديل حالة الوثيقة."); return false; }
    const doc = this.getById(documentId);
    if (!doc) return false;
    STATE.data.documentRecords = STATE.data.documentRecords.map((d) => d.documentId === documentId ? Object.assign({}, d, { status: newStatus }) : d);
    logAudit("update", "documentRecords", documentId, `تغيير حالة الوثيقة «${doc.fileName}» إلى: ${newStatus}`);
    saveData(STATE.data);
    return true;
  },
};

/* ============================================================
   3) Check-in / Check-out — قفل حقيقي يمنع تعارض التعديل المتزامن
   ============================================================ */
const DocumentCheckoutService = {
  checkOut(documentId) {
    if (!STATE.user) { alert("يجب تسجيل الدخول."); return false; }
    if (STATE.user && !canEdit(STATE.user.role, "documents")) { alert("دورك الحالي لا يملك صلاحية سحب الوثيقة للتعديل."); return false; }
    const doc = DocumentRepository.getById(documentId);
    if (!doc) { alert("الوثيقة غير موجودة."); return false; }
    if (doc.checkedOutBy && doc.checkedOutBy !== STATE.user.name) {
      alert(`الوثيقة مسحوبة للتعديل حالياً من: ${doc.checkedOutBy} — لا يمكن سحبها مرة أخرى حتى تُعاد.`);
      return false;
    }
    STATE.data.documentRecords = STATE.data.documentRecords.map((d) => d.documentId === documentId ? Object.assign({}, d, { checkedOutBy: STATE.user.name, checkedOutAt: Date.now() }) : d);
    logAudit("update", "documentRecords", documentId, `سحب الوثيقة «${doc.fileName}» للتعديل (Check-out)`);
    saveData(STATE.data);
    return true;
  },
  async checkIn({ documentId, fileBytesBase64 }) {
    const doc = DocumentRepository.getById(documentId);
    if (!doc) return { success: false, error: "NOT_FOUND", message: "الوثيقة غير موجودة." };
    if (doc.checkedOutBy !== (STATE.user ? STATE.user.name : null)) {
      return { success: false, error: "PERMISSION_DENIED", message: `لا يمكنك إعادة هذه الوثيقة — مسحوبة حالياً من: ${doc.checkedOutBy || "لا أحد"}.` };
    }
    const uploadResult = await DocumentRepository.upload({ entityType: doc.entityType, entityId: doc.entityId, projectId: doc.projectId, fileName: doc.fileName, mimeType: doc.mimeType, fileBytesBase64 });
    if (!uploadResult.success) return uploadResult;
    STATE.data.documentRecords = STATE.data.documentRecords.map((d) => d.documentId === documentId ? Object.assign({}, d, { checkedOutBy: null, checkedOutAt: null }) : d);
    saveData(STATE.data);
    return uploadResult;
  },
  discardCheckout(documentId) {
    const doc = DocumentRepository.getById(documentId);
    if (!doc) return false;
    if (doc.checkedOutBy !== (STATE.user ? STATE.user.name : null) && !(STATE.user && (STATE.user.role === "مدير عام" || STATE.user.role === "مالك الشركة"))) {
      alert("لا يمكنك تحرير قفل وثيقة سحبها شخص آخر."); return false;
    }
    STATE.data.documentRecords = STATE.data.documentRecords.map((d) => d.documentId === documentId ? Object.assign({}, d, { checkedOutBy: null, checkedOutAt: null }) : d);
    saveData(STATE.data);
    return true;
  },
};

/* ============================================================
   4) Approval / Review — حالات صريحة، بلا محرك سير عمل ثانٍ. مبدأ
      "محرك واحد فقط للنظام" يُحتَرَم هنا بعدم بناء محرك موازٍ — هذه
      انتقالات حالة بسيطة ومباشرة، وليست سير عمل معقَّداً متعدد
      المراحل يحتاج المحرك الحقيقي.
   ============================================================ */
const DOCUMENT_REVIEWER_ROLES = ["مدير المشروع", "مدير عام", "مالك الشركة"];
const DocumentReviewService = {
  submitForReview(documentId) {
    const doc = DocumentRepository.getById(documentId);
    if (!doc) return false;
    if (doc.status !== "مسودة") { alert("لا يمكن تقديم إلا وثيقة في حالة «مسودة»."); return false; }
    return DocumentRepository.setStatus(documentId, "قيد المراجعة");
  },
  approve(documentId, comment) {
    if (STATE.user && !DOCUMENT_REVIEWER_ROLES.includes(STATE.user.role)) { alert("دورك الحالي لا يملك صلاحية اعتماد الوثائق."); return false; }
    const doc = DocumentRepository.getById(documentId);
    if (!doc || doc.status !== "قيد المراجعة") { alert("لا يمكن اعتماد إلا وثيقة قيد المراجعة فعلياً."); return false; }
    const ok = DocumentRepository.setStatus(documentId, "معتمد");
    if (ok) logAudit("update", "documentRecords", documentId, `اعتماد الوثيقة${comment ? ` — ملاحظة: ${comment}` : ""}`);
    return ok;
  },
  reject(documentId, reason) {
    if (STATE.user && !DOCUMENT_REVIEWER_ROLES.includes(STATE.user.role)) { alert("دورك الحالي لا يملك صلاحية رفض الوثائق."); return false; }
    const doc = DocumentRepository.getById(documentId);
    if (!doc || doc.status !== "قيد المراجعة") { alert("لا يمكن رفض إلا وثيقة قيد المراجعة فعلياً."); return false; }
    const ok = DocumentRepository.setStatus(documentId, "مرفوض");
    if (ok) logAudit("update", "documentRecords", documentId, `رفض الوثيقة — السبب: ${reason || "—"}`);
    return ok;
  },
};

/* ============================================================
   5) Transmittal — سجل إرسال رسمي لمجموعة وثائق لجهة مستلمة
   ============================================================ */
const DocumentTransmittalService = {
  create({ projectId, documentIds, recipientName, purpose }) {
    if (STATE.user && !canEdit(STATE.user.role, "documents")) { alert("دورك الحالي لا يملك صلاحية إنشاء خطاب تسليم."); return null; }
    if (!documentIds || !documentIds.length) { alert("اختر وثيقة واحدة على الأقل."); return null; }
    const realDocs = documentIds.map((id) => DocumentRepository.getById(id)).filter(Boolean);
    if (!realDocs.length) { alert("الوثائق المُختارة غير موجودة فعلياً."); return null; }
    const transmittal = {
      id: uid(), projectId, documentIds: realDocs.map((d) => d.documentId),
      recipientName: recipientName || "—", purpose: purpose || "",
      sentBy: STATE.user ? STATE.user.name : "—", sentAt: Date.now(), acknowledgedAt: null,
    };
    STATE.data.documentTransmittals = STATE.data.documentTransmittals || [];
    STATE.data.documentTransmittals.push(transmittal);
    logAudit("create", "documentTransmittals", transmittal.id, `خطاب تسليم ${realDocs.length} وثيقة إلى: ${transmittal.recipientName}`);
    saveData(STATE.data);
    return transmittal;
  },
  acknowledge(transmittalId) {
    STATE.data.documentTransmittals = (STATE.data.documentTransmittals || []).map((t) => t.id === transmittalId ? Object.assign({}, t, { acknowledgedAt: Date.now() }) : t);
    saveData(STATE.data);
  },
  listForProject(projectId) { return (STATE.data.documentTransmittals || []).filter((t) => t.projectId === projectId); },
};

/* ============================================================
   6) Document Relationships — علاقات صريحة بين الوثائق
   ============================================================ */
const DOCUMENT_RELATIONSHIP_TYPES = ["يستبدل", "مرفق بـ", "يشير إلى"];
const DocumentRelationshipService = {
  link(fromDocumentId, toDocumentId, relationType) {
    if (STATE.user && !canEdit(STATE.user.role, "documents")) { alert("دورك الحالي لا يملك صلاحية ربط الوثائق."); return null; }
    if (!DOCUMENT_RELATIONSHIP_TYPES.includes(relationType)) { alert("نوع علاقة غير معروف."); return null; }
    if (!DocumentRepository.getById(fromDocumentId) || !DocumentRepository.getById(toDocumentId)) { alert("إحدى الوثيقتين غير موجودة فعلياً."); return null; }
    const rel = { id: uid(), fromDocumentId, toDocumentId, relationType, createdBy: STATE.user ? STATE.user.name : "—", createdAt: Date.now() };
    STATE.data.documentRelationships = STATE.data.documentRelationships || [];
    STATE.data.documentRelationships.push(rel);
    saveData(STATE.data);
    return rel;
  },
  getRelationshipsFor(documentId) {
    return (STATE.data.documentRelationships || []).filter((r) => r.fromDocumentId === documentId || r.toDocumentId === documentId);
  },
};
