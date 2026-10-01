/* ============================================================
   Global Search Architecture + Knowledge Graph
   ============================================================
   1) بحث شامل قائم على سجل مزوِّدين (نمط مطابق لـAIProviders و
      DocumentStorageProviders الموجودين أصلاً) — كل نطاق بيانات
      يُسجِّل دالة بحث خاصة به، بدل دالة واحدة ضخمة تكبر بلا حدود.
      نُقلَت منطق البحث الموجود أصلاً في computeGlobalSearchResults
      بلا أي تغيير سلوكي — فقط أُعيد تنظيمه كمزوِّدين مستقلين، وأُضيفت
      النطاقات الناقصة المطلوبة صراحةً (مدفوعات، موردون، مناقصات،
      أصول). النطاقات الموجودة أصلاً تبقى بالسلوك نفسه تماماً.

      *WBS لم يُضَف* — لا نطاق WBS حقيقي في نموذج البيانات الحالي
      (مُتحقَّق منه سابقاً هذه الجلسة)، لن أُضيف نطاقاً وهمياً.

   2) Knowledge Graph — علاقات حقيقية مُستخرَجة من حقول ربط فعلية
      موجودة أصلاً في البيانات (claim.contractId، invoice.custodyId،
      task.projectId...)، لا علاقات مُخترَعة. كل علاقة مُصنَّفة صراحةً:
      "foreign-key" (معرِّف حقيقي مباشر) أو "name-match" (تطابق اسم
      نصي، أضعف من foreign-key). هذا التصنيف الصادق ضروري لأي استخدام
      مستقبلي بالذكاء الاصطناعي — لا يجوز أن يُعامَل استدلال بالاسم
      كحقيقة مؤكَّدة بنفس ثقة معرِّف حقيقي.
   ============================================================ */

/* ============================================================
   1) Search Index Registry
   ============================================================ */
const SearchIndexProviders = {};
function registerSearchProvider(entityType, searchFn) {
  if (typeof searchFn !== "function") throw new Error(`مزوِّد بحث "${entityType}" يجب أن يكون دالة.`);
  SearchIndexProviders[entityType] = searchFn;
}
function runAllSearchProviders(query, push, has) {
  Object.values(SearchIndexProviders).forEach((fn) => fn(query, push, has));
}

registerSearchProvider("projects", (q, push, has) => {
  STATE.data.projects.forEach((p) => { if (has(p.name) || has(p.owner)) push("dashboard", "🗂", p.name, "مشروع — اضغط لفتح لوحة تحكمه", p.id, "projectDrill"); });
});
registerSearchProvider("tasks", (q, push, has) => {
  STATE.data.tasks.forEach((t) => { if (has(t.name)) push("tasks", "✔", t.name, `مهمة — ${projName(t.projectId)}`, t.projectId, null, "tasks", t.id); });
});
registerSearchProvider("risks", (q, push, has) => {
  (STATE.data.risks || []).forEach((r) => { if (has(r.title)) push("risks", "⚠", r.title, `خطر — ${projName(r.projectId)}`, r.projectId, null, "risks", r.id); });
});
registerSearchProvider("invoices", (q, push, has) => {
  (STATE.data.invoices || []).forEach((i) => { if (has(i.number)) push("invoices", "🧾", i.number, `فاتورة — ${projName(i.projectId)}`, i.projectId, null, "invoices", i.id); });
});
registerSearchProvider("certificates", (q, push, has) => {
  (STATE.data.certificates || []).forEach((c) => { if (has(c.number)) push("certificates", "📜", `مستخلص رقم ${c.number}`, projName(c.projectId), c.projectId, null, "certificates", c.id); });
});
registerSearchProvider("claims", (q, push, has) => {
  (STATE.data.claims || []).forEach((c) => { if (has(c.claimNumber) || has(c.reason)) push("claims", "⚖", `مطالبة ${c.claimNumber}`, projName(c.projectId), c.projectId, null, "claims", c.id); });
});
registerSearchProvider("correspondence", (q, push, has) => {
  (STATE.data.correspondence || []).forEach((c) => { if (has(c.subject) || has(c.refNumber)) push("correspondence", "✉", c.subject, `${c.refNumber || ""} — ${projName(c.projectId)}`, c.projectId, null, "correspondence", c.id); });
});
registerSearchProvider("meetings", (q, push, has) => {
  (STATE.data.meetings || []).forEach((m) => { if (has(m.title)) push("meetings", "🗓", m.title, projName(m.projectId), m.projectId, null, "meetings", m.id); });
});
registerSearchProvider("decisions", (q, push, has) => {
  (STATE.data.decisions || []).forEach((dec) => { if (has(dec.decisionText)) push("meetings", "🗓", dec.decisionText.slice(0, 50), `قرار — ${projName(dec.projectId)}`, dec.projectId, null, "decisions", dec.id); });
});
registerSearchProvider("punchlist", (q, push, has) => {
  (STATE.data.punchlist || []).forEach((pl) => { if (has(pl.description) || has(pl.itemNumber)) push("punchlist", "📝", `${pl.itemNumber}: ${pl.description.slice(0, 40)}`, projName(pl.projectId), pl.projectId, null, "punchlist", pl.id); });
});
registerSearchProvider("documents", (q, push, has) => {
  (STATE.data.documents || []).forEach((doc) => { if (has(doc.title) || has(doc.refNumber)) push("documents", "📁", doc.title, `${doc.refNumber || ""} — ${projName(doc.projectId)}`, doc.projectId, null, "documents", doc.id); });
});
registerSearchProvider("contracts", (q, push, has) => {
  (STATE.data.contracts || []).forEach((c) => { if (has(c.party)) push("contracts", "📄", c.party, `عقد — ${projName(c.projectId)}`, c.projectId, null, "contracts", c.id); });
});
registerSearchProvider("custodies", (q, push, has) => {
  (STATE.data.custodies || []).forEach((c) => { if (has(c.number) || has(getCustodianName(c))) push("custodies", "💼", `عهدة رقم ${c.number}`, `${getCustodianName(c)} — ${projName(c.projectId)}`, c.projectId, null, "custodies", c.id); });
});
registerSearchProvider("resourcePool", (q, push, has) => {
  (STATE.data.resourcePool || []).forEach((r) => { if (has(r.name)) push("resources", "👥", r.name, r.type, null, null, "resourcePool", r.id); });
});

/* --- نطاقات جديدة أُضيفت لتلبية القائمة المطلوبة صراحةً --- */
registerSearchProvider("payments", (q, push, has) => {
  (STATE.data.ledger || []).forEach((l) => { if (has(l.description) || has(l.category)) push("finance", "💰", l.description || l.category || "قيد دفتر أستاذ", `${l.type || ""} — ${projName(l.projectId)}`, l.projectId, null, "ledger", l.id); });
});
registerSearchProvider("suppliers", (q, push, has) => {
  (STATE.data.contractorEvaluations || []).forEach((c) => { if (has(c.contractorName)) push("digitalTwin", "🏆", c.contractorName, `تقييم مقاول/مورِّد — ${projName(c.projectId)}`, c.projectId, null, "contractorEvaluations", c.id); });
});
registerSearchProvider("tender", (q, push, has) => {
  (STATE.data.procurement || []).forEach((p) => { if (has(p.title) || has(p.itemDescription)) push("procurement", "📋", p.title || p.itemDescription, `طلب مشتريات/مناقصة — ${projName(p.projectId)}`, p.projectId, null, "procurement", p.id); });
  (STATE.data.procurementBids || []).forEach((b) => { if (has(b.supplierName)) push("procurement", "📋", b.supplierName, "عرض مناقصة", null, null, "procurementBids", b.id); });
});
registerSearchProvider("assets", (q, push, has) => {
  (STATE.data.projectAssets || []).forEach((a) => { if (has(a.name) || has(a.assetCode)) push("digitalTwin", "🏗", a.name, `أصل توأم رقمي — ${projName(a.projectId)}`, a.projectId, null, "projectAssets", a.id); });
});

/* ============================================================
   إعادة بناء computeGlobalSearchResults لتستدعي السجل الجديد فقط —
   نفس التوقيع، نفس الشكل المُعاد تماماً، نفس فحص النطاق والصلاحية.
   ============================================================ */
function computeGlobalSearchResults(query) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const scope = getUserScopedProjectIds();
  const results = [];
  const push = (navKey, icon, label, sub, projectId, special, moduleKey, recordId) => {
    if (!canView(STATE.user.role, navKey)) return;
    if (scope && projectId && !scope.has(projectId)) return;
    results.push({ navKey, icon, label, sub, projectId: projectId || null, special: special || null, moduleKey: moduleKey || null, recordId: recordId || null });
  };
  const has = (v) => String(v || "").toLowerCase().includes(q);
  runAllSearchProviders(q, push, has);
  return results.slice(0, 30);
}

/* ============================================================
   2) Knowledge Graph Service — علاقات حقيقية من حقول ربط فعلية
   ============================================================ */
const KnowledgeGraphService = {
  getRelatedEntities(entityType, entityId) {
    const edges = [];
    const d = STATE.data;
    if (entityType === "projects") {
      (d.tasks || []).filter((t) => t.projectId === entityId).forEach((t) => edges.push({ type: "tasks", id: t.id, label: t.name, linkType: "foreign-key", direction: "out" }));
      (d.contracts || []).filter((c) => c.projectId === entityId).forEach((c) => edges.push({ type: "contracts", id: c.id, label: c.party, linkType: "foreign-key", direction: "out" }));
      (d.invoices || []).filter((i) => i.projectId === entityId).forEach((i) => edges.push({ type: "invoices", id: i.id, label: i.number, linkType: "foreign-key", direction: "out" }));
      (d.claims || []).filter((c) => c.projectId === entityId).forEach((c) => edges.push({ type: "claims", id: c.id, label: c.claimNumber, linkType: "foreign-key", direction: "out" }));
      (d.risks || []).filter((r) => r.projectId === entityId).forEach((r) => edges.push({ type: "risks", id: r.id, label: r.title, linkType: "foreign-key", direction: "out" }));
      (d.documents || []).filter((doc) => doc.projectId === entityId).forEach((doc) => edges.push({ type: "documents", id: doc.id, label: doc.title, linkType: "foreign-key", direction: "out" }));
      (d.correspondence || []).filter((c) => c.projectId === entityId).forEach((c) => edges.push({ type: "correspondence", id: c.id, label: c.subject, linkType: "foreign-key", direction: "out" }));
      (d.projectAssets || []).filter((a) => a.projectId === entityId).forEach((a) => edges.push({ type: "assets", id: a.id, label: a.name, linkType: "foreign-key", direction: "out" }));
      (d.contractorEvaluations || []).filter((c) => c.projectId === entityId).forEach((c) => edges.push({ type: "suppliers", id: c.id, label: c.contractorName, linkType: "foreign-key", direction: "out" }));
    } else if (entityType === "contracts") {
      const contract = (d.contracts || []).find((c) => c.id === entityId);
      if (contract) {
        edges.push({ type: "projects", id: contract.projectId, label: projName(contract.projectId), linkType: "foreign-key", direction: "in" });
        (d.claims || []).filter((c) => c.contractId === entityId).forEach((c) => edges.push({ type: "claims", id: c.id, label: c.claimNumber, linkType: "foreign-key", direction: "out" }));
        // ربط المورِّد بالعقد هنا استدلال بتطابق الاسم النصي فقط — لا معرِّف حقيقي مباشر بينهما في النموذج الحالي
        (d.contractorEvaluations || []).filter((ce) => ce.contractorName && ce.contractorName.trim() === (contract.party || "").trim()).forEach((ce) =>
          edges.push({ type: "suppliers", id: ce.id, label: ce.contractorName, linkType: "name-match", direction: "out" }));
      }
    } else if (entityType === "claims") {
      const claim = (d.claims || []).find((c) => c.id === entityId);
      if (claim) {
        edges.push({ type: "projects", id: claim.projectId, label: projName(claim.projectId), linkType: "foreign-key", direction: "in" });
        if (claim.contractId) { const c = (d.contracts || []).find((x) => x.id === claim.contractId); if (c) edges.push({ type: "contracts", id: c.id, label: c.party, linkType: "foreign-key", direction: "in" }); }
      }
    } else if (entityType === "invoices") {
      const inv = (d.invoices || []).find((i) => i.id === entityId);
      if (inv) {
        edges.push({ type: "projects", id: inv.projectId, label: projName(inv.projectId), linkType: "foreign-key", direction: "in" });
        if (inv.custodyId) { const c = (d.custodies || []).find((x) => x.id === inv.custodyId); if (c) edges.push({ type: "custodies", id: c.id, label: `عهدة ${c.number}`, linkType: "foreign-key", direction: "in" }); }
      }
    }
    return edges;
  },
  getProjectGraph(projectId) {
    const project = (STATE.data.projects || []).find((p) => p.id === projectId);
    if (!project) return { available: false, reason: "المشروع غير موجود." };
    return { available: true, root: { type: "projects", id: projectId, label: project.name }, edges: this.getRelatedEntities("projects", projectId) };
  },
};
