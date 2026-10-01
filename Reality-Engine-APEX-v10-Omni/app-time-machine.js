/* ============================================================
   Project Time Machine — لقطات مشروع زمنية شاملة
   ============================================================
   يمتدّ من TwinTimeMachine الموجودة أصلاً (app-digitaltwin.js) ولا
   يستبدلها — تلك تبقى كما هي بالضبط (لقطات أصول مُركَّزة، خفيفة،
   بلا تغيير). هذا نظام أوسع فعلياً يغطّي كل المجالات المطلوبة معاً
   في لقطة واحدة: الجدول، التقدّم، التكلفة، المخاطر، الوثائق، الصور،
   حالة BIM/التوثيق الرقمي.

   لا يُعيد حساب أي شيء بنفسه — يستدعي فقط الدوال الحقيقية الموجودة
   أصلاً ومُختبَرة مسبقاً (computeEVM، computeTaskWeightedCompletion،
   collectAllProjectMedia، DigitalTwinRepository.getAssets) في لحظة
   أخذ اللقطة، ويُجمِّد نتائجها كما هي حينها.

   *لا تخزين سحابي في هذه المرحلة* — IndexedDB المحلي فقط (مسجَّل
   بشكل صحيح في COLLECTION_TO_STORE_MAP ضمن Store "digitalTwin").
   ============================================================ */

const ProjectTimeMachine = {
  /** أخذ لقطة زمنية شاملة حقيقية لمشروع الآن */
  createSnapshot(projectId, label) {
    if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية أخذ لقطة زمنية للمشروع."); return null; }
    const project = (STATE.data.projects || []).find((p) => p.id === projectId);
    if (!project) { alert("المشروع غير موجود."); return null; }

    const tasks = (STATE.data.tasks || []).filter((t) => t.projectId === projectId);
    const evm = computeEVM(project, STATE.data.budgetItems, STATE.data.changeOrders);
    const actualCompletion = computeTaskWeightedCompletion(projectId);
    const risks = (STATE.data.risks || []).filter((r) => r.projectId === projectId);
    const documents = (STATE.data.documents || []).filter((d) => d.projectId === projectId);
    const photos = collectAllProjectMedia(projectId);
    const assets = DigitalTwinRepository.getAssets(projectId).map((a) => ({ id: a.id, name: a.name, assetType: a.assetType, status: a.status, criticality: a.criticality }));
    const deviations = (STATE.data.deviationReports || []).filter((d) => d.projectId === projectId);

    const snapshot = {
      id: uid(), projectId, label: label || `لقطة ${todayISO()}`, takenAt: Date.now(),
      schedule: {
        taskCount: tasks.length,
        completedCount: tasks.filter((t) => Number(t.completion || 0) >= 100).length,
        delayedCount: tasks.filter((t) => t.end && t.end < todayISO() && Number(t.completion || 0) < 100).length,
        criticalPathTaskCount: computeCriticalPath(tasks).critical.size,
      },
      progress: {
        plannedCompletionPct: evm.timeElapsedPct != null ? Math.round(evm.timeElapsedPct) : null,
        actualCompletionPct: actualCompletion != null ? Math.round(actualCompletion) : Math.round(Number(project.completion) || 0),
      },
      cost: { BAC: evm.BAC, AC: evm.AC, EV: evm.EV, CPI: evm.CPI, SPI: evm.SPI, EAC: evm.EAC },
      risk: { openCount: risks.filter((r) => r.status !== "مغلق").length, totalCount: risks.length },
      documents: { count: documents.length },
      photos: { count: photos.length },
      digitalTwin: { assets, openDeviationsCount: deviations.filter((d) => d.status !== "مغلق" && d.status !== "مرفوض (غير صحيح)").length },
    };
    STATE.data.projectTimeMachineSnapshots = STATE.data.projectTimeMachineSnapshots || [];
    STATE.data.projectTimeMachineSnapshots.push(snapshot);
    logAudit("create", "projectTimeMachineSnapshots", snapshot.id, `أخذ لقطة زمنية شاملة للمشروع: ${snapshot.label}`);
    saveData(STATE.data);
    return snapshot;
  },

  /** كل اللقطات الحقيقية لمشروع، مُرتَّبة زمنياً (الأحدث أولاً) */
  getSnapshots(projectId) {
    return (STATE.data.projectTimeMachineSnapshots || []).filter((s) => s.projectId === projectId).sort((a, b) => b.takenAt - a.takenAt);
  },

  /** حذف لقطة (بصلاحية حقيقية) */
  removeSnapshot(snapshotId) {
    if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية حذف لقطة زمنية."); return false; }
    const before = (STATE.data.projectTimeMachineSnapshots || []).length;
    STATE.data.projectTimeMachineSnapshots = (STATE.data.projectTimeMachineSnapshots || []).filter((s) => s.id !== snapshotId);
    if (STATE.data.projectTimeMachineSnapshots.length === before) return false;
    saveData(STATE.data);
    return true;
  },

  /** مقارنة حقيقية بين تاريخين (لقطتين) — التخطيط مقابل الفعلي، التكلفة، الجدول، الانحراف */
  compareSnapshots(snapshotIdA, snapshotIdB) {
    const a = (STATE.data.projectTimeMachineSnapshots || []).find((s) => s.id === snapshotIdA);
    const b = (STATE.data.projectTimeMachineSnapshots || []).find((s) => s.id === snapshotIdB);
    if (!a || !b) return { available: false, reason: "لقطة واحدة أو كلاهما غير موجودة فعلياً." };
    // ضمان أن (a) هي الأقدم زمنياً دائماً، بغضّ النظر عن ترتيب التمرير — مقارنة "من ← إلى" منطقية دوماً
    const [older, newer] = a.takenAt <= b.takenAt ? [a, b] : [b, a];

    const progressDeviation = {
      planned: { before: older.progress.plannedCompletionPct, after: newer.progress.plannedCompletionPct },
      actual: { before: older.progress.actualCompletionPct, after: newer.progress.actualCompletionPct },
      // الانحراف الحقيقي: الفعلي مطروحاً منه المخطَّط، في نفس اللحظة الأحدث — لا تخميناً
      currentDeviationPct: newer.progress.actualCompletionPct != null && newer.progress.plannedCompletionPct != null
        ? Math.round(newer.progress.actualCompletionPct - newer.progress.plannedCompletionPct) : null,
    };
    const costDeviation = {
      CPI: { before: older.cost.CPI, after: newer.cost.CPI },
      SPI: { before: older.cost.SPI, after: newer.cost.SPI },
      AC: { before: older.cost.AC, after: newer.cost.AC, deltaReal: newer.cost.AC - older.cost.AC },
      EAC: { before: older.cost.EAC, after: newer.cost.EAC },
    };
    const scheduleDeviation = {
      taskCount: { before: older.schedule.taskCount, after: newer.schedule.taskCount },
      delayedCount: { before: older.schedule.delayedCount, after: newer.schedule.delayedCount, delta: newer.schedule.delayedCount - older.schedule.delayedCount },
      completedCount: { before: older.schedule.completedCount, after: newer.schedule.completedCount },
      criticalPathTaskCount: { before: older.schedule.criticalPathTaskCount, after: newer.schedule.criticalPathTaskCount },
    };
    const riskDeviation = { openCount: { before: older.risk.openCount, after: newer.risk.openCount, delta: newer.risk.openCount - older.risk.openCount } };

    // مقارنة أصول حقيقية (نفس منطق TwinTimeMachine.compareSnapshots تماماً، لا تكرار مستقل مختلف السلوك)
    const assetChanges = [];
    const newerAssetsById = {};
    newer.digitalTwin.assets.forEach((asset) => { newerAssetsById[asset.id] = asset; });
    older.digitalTwin.assets.forEach((assetOld) => {
      const assetNew = newerAssetsById[assetOld.id];
      if (!assetNew) { assetChanges.push({ assetId: assetOld.id, name: assetOld.name, type: "removed" }); return; }
      if (assetOld.status !== assetNew.status) assetChanges.push({ assetId: assetOld.id, name: assetOld.name, type: "status-changed", from: assetOld.status, to: assetNew.status });
      delete newerAssetsById[assetOld.id];
    });
    Object.values(newerAssetsById).forEach((assetNew) => assetChanges.push({ assetId: assetNew.id, name: assetNew.name, type: "added" }));

    return {
      available: true, dateA: older, dateB: newer,
      progressDeviation, costDeviation, scheduleDeviation, riskDeviation, assetChanges,
      documentsDeviation: { before: older.documents.count, after: newer.documents.count, delta: newer.documents.count - older.documents.count },
      photosDeviation: { before: older.photos.count, after: newer.photos.count, delta: newer.photos.count - older.photos.count },
    };
  },
};
