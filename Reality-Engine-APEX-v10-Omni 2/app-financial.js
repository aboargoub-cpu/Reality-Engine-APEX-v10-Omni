/* ============================================================
   محرك التحليل المالي الذكي
   كل الحسابات هنا مبنية على معادلات مالية/PMBOK معروفة (EVM، Aging،
   Burn Rate...) وليست "ذكاءً اصطناعياً" تنبؤياً حقيقياً — يُعرض ذلك
   بصراحة في الواجهة كتقديرات حسابية، لا توقعات نموذج مدرَّب.
   ============================================================ */

function ledgerFor(projectId) {
  const rows = STATE.data.ledger || [];
  return projectId ? rows.filter((r) => r.projectId === projectId) : rows;
}

/* ---- 1. Cash Flow ---- */
function computeCashFlow(projects, ledger, invoices, certificates, subcontractorCertificates) {
  const cashIn = ledger.filter((l) => l.type === "إيراد").reduce((s, l) => s + Number(l.amount || 0), 0)
    + invoices.filter((i) => i.type === "عميل").reduce((s, i) => s + Number(i.paidAmount || 0), 0)
    + (certificates || []).reduce((s, c) => s + Number(c.paidAmount || 0), 0);
  const cashOut = ledger.filter((l) => l.type === "مصروف").reduce((s, l) => s + Number(l.amount || 0), 0)
    + (subcontractorCertificates || []).reduce((s, c) => s + Number(c.paidAmount || 0), 0);
  const currentBalance = cashIn - cashOut;
  // Projected: current balance + expected inflows (unpaid client invoices + certified-but-uncollected owner certificates)
  //          - expected outflows (unpaid supplier invoices + approved-but-unpaid subcontractor certificates)
  const invoiceInflow = invoices.filter((i) => i.type === "عميل").reduce((s, i) => s + (Number(i.amount || 0) - Number(i.paidAmount || 0)), 0);
  const certifiedInflow = certifiedUncollectedTotal(certificates);
  const expectedInflow = invoiceInflow + certifiedInflow;
  const invoiceOutflow = invoices.filter((i) => i.type === "مورد").reduce((s, i) => s + (Number(i.amount || 0) - Number(i.paidAmount || 0)), 0);
  const subcontractorOutflow = subcontractorApprovedUnpaidTotal(subcontractorCertificates);
  const expectedOutflow = invoiceOutflow + subcontractorOutflow;
  const projectedBalance = currentBalance + expectedInflow - expectedOutflow;
  // بنود منفصلة: مستخلصات مُقدَّمة لم تُعتمد/تُحصَّل بعد — محتملة وليست مؤكدة، لا تُدرج في الرصيد المتوقع أعلاه
  const pendingCertifiedPipeline = submittedPendingTotal(certificates);
  const pendingSubcontractorPipeline = subcontractorPendingPipelineTotal(subcontractorCertificates);
  return {
    cashIn, cashOut, currentBalance, expectedInflow, expectedOutflow, projectedBalance,
    certifiedInflow, pendingCertifiedPipeline, subcontractorOutflow, pendingSubcontractorPipeline,
  };
}

/* ---- 2. Profitability ---- */
/* ============================================================
   محرك التحليلات التنبؤية والتعلّم من البيانات — إحصاء حقيقي، لا
   تعلّم آلي عميق (بيانات شركة واحدة صغيرة نسبياً لا تكفي لتدريب
   نموذج معمَّم يمكن الوثوق به، وهذا قيد صريح لا يُخفى). ما يلي هو
   انحدار خطي حقيقي (Linear Regression) على مسار المشروع الفعلي،
   واكتشاف شواذ إحصائي حقيقي (Z-Score)، وتعلّم تنظيمي حقيقي من أداء
   المشاريع السابقة المكتملة فعلياً في هذه الشركة.
   ============================================================ */

/* انحدار خطي بالمربعات الصغرى (Least-Squares) — دالة عامة قابلة لإعادة الاستخدام */
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null; // كل نقاط x متطابقة — لا يوجد انحدار ممكن
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept, n };
}

/* توقّع تاريخ الانتهاء وEAC عبر انحدار المسار الفعلي — بديل حقيقي أدق من EAC=BAC/CPI
   وحيد النسبة (لا يعكس تحسّن أو تراجع الأداء بمرور الوقت، بخلاف هذا). */
function computeTrendForecast(project) {
  const history = (project.history || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (history.length < 2) {
    return { available: false, reason: "لا تكفي نقاط بيانات تاريخية (يحتاج نقطتين على الأقل من تطوّر الإنجاز عبر الزمن)." };
  }
  const t0 = new Date(history[0].date).getTime();
  const points = history.map((h) => ({ x: (new Date(h.date).getTime() - t0) / 86400000, y: Number(h.completion) || 0 }));
  const reg = linearRegression(points);
  if (!reg || reg.slope <= 0) {
    return { available: false, reason: "معدّل الإنجاز الحالي راكد أو سالب حسب الاتجاه التاريخي — لا يمكن توقّع تاريخ انتهاء منطقي بهذا الاتجاه." };
  }
  const daysTo100 = (100 - reg.intercept) / reg.slope;
  const forecastDate = new Date(t0 + daysTo100 * 86400000);
  const confidence = history.length >= 6 ? "متوسطة إلى جيدة" : history.length >= 3 ? "منخفضة إلى متوسطة" : "منخفضة جداً";
  return {
    available: true,
    forecastCompletionDate: forecastDate.toISOString().slice(0, 10),
    dailyVelocityPct: reg.slope,
    dataPointsUsed: history.length,
    confidenceLabel: confidence,
    confidenceNote: `مبني على ${history.length} نقطة رصد فعلية فقط — كلما زادت نقاط الرصد المستقبلية، زادت دقة هذا التوقّع تلقائياً.`,
  };
}

/* اكتشاف شواذ إحصائي حقيقي (Z-Score) — لا معادلة ذكاء اصطناعي، إحصاء موصوف
   بالكامل: أي قيمة تنحرف أكثر من عتبة عن متوسط مجموعتها تُعلَّم كشاذة. */
function detectStatisticalAnomalies(values, labels, threshold = 2) {
  if (values.length < 4) return { available: false, reason: "لا تكفي نقاط بيانات لحساب انحراف معياري ذو دلالة (يحتاج 4 قيم على الأقل)." };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return { available: true, anomalies: [], mean, stdDev };
  const anomalies = values.map((v, i) => ({ label: labels[i], value: v, zScore: (v - mean) / stdDev }))
    .filter((a) => Math.abs(a.zScore) > threshold);
  return { available: true, anomalies, mean, stdDev, threshold };
}

/* تعلّم تنظيمي حقيقي: قياس متوسط تجاوز الجدول والتكلفة الفعلي من مشاريع
   هذه الشركة المكتملة فعلياً، لا افتراضات عامة من بيانات خارجية. */
function computeHistoricalCompanyBenchmark(projects) {
  const completed = (projects || []).filter((p) => Number(p.completion) >= 100 && p.baselineEnd && p.endDate && p.baselineBudget);
  if (completed.length < 2) {
    return { available: false, reason: `لا تكفي مشاريع مكتملة لبناء معيار تنظيمي موثوق (يوجد ${completed.length} فقط، يحتاج 2 على الأقل، وكل مشروع إضافي يزيد الثقة).` };
  }
  const scheduleOverruns = completed.map((p) => dateDiffDays(p.baselineEnd, p.endDate));
  const costOverruns = completed.map((p) => ((Number(p.contractValue) - Number(p.baselineBudget)) / Number(p.baselineBudget)) * 100);
  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  return {
    available: true,
    projectCount: completed.length,
    avgScheduleOverrunDays: avg(scheduleOverruns),
    avgCostOverrunPct: avg(costOverruns),
    confidenceNote: completed.length < 5 ? "عدد المشاريع المكتملة قليل حتى الآن — هذا المعيار سيصبح أدق تدريجياً مع اكتمال مشاريع أكثر." : "معيار مبني على عدد معقول من المشاريع المكتملة فعلياً في هذه الشركة.",
  };
}

/* ============================================================
   المساعد الذكي الفوري (AI Copilot) — يجيب فوراً وبلا حاجة لمفتاح API
   خارجي على أسئلة إدارية متوقَّعة، باستخدام محركات حسابية حقيقية
   مبنية ومُختبَرة أصلاً في هذا النظام (مؤشر الصحة، تصنيف المقاولين،
   مطابقة الإنجاز) — لا نموذج لغوي، بل استعلامات منظَّمة على بيانات حقيقية.
   الدردشة الحرة المفتوحة تبقى تحتاج مفتاح API كما هي، لأسئلة غير متوقَّعة.
   ============================================================ */
function copilotProjectsStatus(data) {
  const projects = filterByProject(data.projects || []);
  if (!projects.length) return "لا توجد مشاريع مسجَّلة في نطاقك حالياً.";
  const lines = projects.map((p) => {
    const health = computeProjectHealthScore(p, data);
    return `• ${p.name}: إنجاز ${p.completion || 0}%، مؤشر الصحة ${health.score}/100 (${health.label})`;
  });
  return `لديك ${projects.length} مشروع ضمن نطاقك:\n${lines.join("\n")}`;
}
function copilotAtRiskProjects(data) {
  const projects = filterByProject(data.projects || []);
  const scored = projects.map((p) => ({ p, health: computeProjectHealthScore(p, data) })).sort((a, b) => a.health.score - b.health.score);
  const atRisk = scored.filter((s) => s.health.score < 70);
  if (!atRisk.length) return "لا توجد مشاريع في نطاق الخطر حالياً (كل المشاريع بمؤشر صحة 70/100 أو أعلى).";
  return `${atRisk.length} مشروع في نطاق الخطر:\n${atRisk.map((s) => `• ${s.p.name}: ${s.health.score}/100 — أهم سبب: ${s.health.breakdown[0] ? s.health.breakdown[0].label : "—"}`).join("\n")}`;
}
function copilotWhyDelayed(data, projectId) {
  const project = (data.projects || []).find((p) => p.id === projectId);
  if (!project) return "حدِّد مشروعاً لعرض أسباب تأخره.";
  const health = computeProjectHealthScore(project, data);
  if (!health.breakdown.length) return `مشروع «${project.name}» ليس متأخراً حسب البيانات المسجَّلة — مؤشر الصحة ${health.score}/100.`;
  return `أسباب تراجع مؤشر صحة مشروع «${project.name}» (${health.score}/100) مرتَّبة حسب الأثر:\n${health.breakdown.map((b) => `• ${b.label} (${b.detail || ""}) — أثر: -${b.amount} نقطة`).join("\n")}`;
}
function copilotUnderperformingContractor(data) {
  const evals = filterByProject(data.contractorEvaluations || []);
  const ranking = computeContractorRanking(evals);
  if (!ranking.length) return "لا توجد تقييمات مقاولين مسجَّلة بعد لتحديد الأداء.";
  const worst = ranking[ranking.length - 1];
  return `الأضعف أداءً حسب التقييمات المسجَّلة: «${worst.contractorName}» بمتوسط ${worst.avgScore != null ? worst.avgScore.toFixed(1) : "—"}/5 عبر ${worst.evaluationCount} تقييم. الأفضل أداءً: «${ranking[0].contractorName}» بمتوسط ${ranking[0].avgScore != null ? ranking[0].avgScore.toFixed(1) : "—"}/5.`;
}
function copilotRiskyPayments(data) {
  const certs = filterByProject(data.certificates || []);
  const risky = certs.map((c) => ({ c, v: computeProgressVerification(c.id) })).filter((r) => r.v && r.c.cumulativeCompletionPercent && r.v.level !== "good");
  const unreconciled = filterByProject(data.custodies || []).filter((cu) => isCashCustody(cu) && !cu.reconciled);
  const lines = [];
  risky.forEach((r) => lines.push(`• مستخلص ${r.c.number}: مطالَب بـ${r.v.claimedPct}% لكن المتتبَّع فعلياً ${r.v.trackedPct}% (فرق ${r.v.variancePct > 0 ? "+" : ""}${r.v.variancePct.toFixed(1)} نقطة)`));
  if (unreconciled.length) lines.push(`• ${unreconciled.length} عهدة نقدية بانتظار المطابقة النهائية من المحاسب العام`);
  if (!lines.length) return "لا توجد دفعات أو عهد تحمل مؤشرات خطر واضحة حالياً.";
  return `دفعات وعهد تحتاج مراجعة:\n${lines.join("\n")}`;
}
function copilotManagementDecisions(data) {
  const projects = filterByProject(data.projects || []);
  const scored = projects.map((p) => ({ p, health: computeProjectHealthScore(p, data) })).sort((a, b) => a.health.score - b.health.score);
  const decisions = [];
  if (scored[0] && scored[0].health.score < 70) decisions.push(`مراجعة عاجلة لمشروع «${scored[0].p.name}» (مؤشر صحة ${scored[0].health.score}/100) — السبب الأكبر: ${scored[0].health.breakdown[0] ? scored[0].health.breakdown[0].label : "—"}.`);
  const paymentIssues = copilotRiskyPayments(data);
  if (!paymentIssues.startsWith("لا توجد")) decisions.push("مراجعة مطابقة الدفعات المذكورة في تنبيهات المدفوعات الخطرة.");
  const contractorNote = copilotUnderperformingContractor(data);
  if (!contractorNote.startsWith("لا توجد")) decisions.push(contractorNote);
  if (!decisions.length) return "لا توجد قرارات عاجلة مطلوبة حسب البيانات الحالية — المحفظة ضمن نطاق صحي.";
  return `أهم ما يحتاج قراراً من الإدارة الآن:\n${decisions.map((d, i) => `${i + 1}. ${d}`).join("\n")}`;
}
const COPILOT_QUESTIONS = [
  { key: "status", label: "ما هي الحالة الحالية لمشاريعي؟", handler: (data) => copilotProjectsStatus(data) },
  { key: "atrisk", label: "أي المشاريع في خطر؟", handler: (data) => copilotAtRiskProjects(data) },
  { key: "contractor", label: "أي مقاول أداؤه ضعيف؟", handler: (data) => copilotUnderperformingContractor(data) },
  { key: "payments", label: "ما هي الدفعات الخطرة؟", handler: (data) => copilotRiskyPayments(data) },
  { key: "forecast", label: "ما هي تواريخ الانتهاء المتوقَّعة؟", handler: (data) => copilotForecastDates(data) },
  { key: "subscores", label: "ما تفصيل مؤشر الصحة لكل مشروع؟", handler: (data) => copilotHealthSubScores(data) },
  { key: "decisions", label: "ما القرارات التي يجب أن تتخذها الإدارة؟", handler: (data) => copilotManagementDecisions(data) },
];
function copilotHealthSubScores(data) {
  const projects = filterByProject(data.projects || []);
  if (!projects.length) return "لا توجد مشاريع في نطاقك.";
  return projects.map((p) => {
    const d = computeProjectHealthScoreDetailed(p, data);
    const s = d.subScores;
    return `• ${p.name} (إجمالي ${d.overallScore}/100): الجدول ${s.schedule}، التكلفة ${s.cost}، الجودة ${s.quality}، المخاطر ${s.risk}، العقود ${s.contract}، ثقة التقدّم ${s.progressConfidence != null ? s.progressConfidence + "%" : "غير متوفرة"}`;
  }).join("\n");
}
/* ============================================================
   محرك متابعة الأعمال اليومية — فجوة حقيقية لم تكن مغطّاة: لا مقارنة
   بين "ما كان يجب تنفيذه اليوم" و"ما أُبلِغ فعلياً"، ولا كشف لأيام
   عمل نشطة بلا تقرير يومي مقدَّم إطلاقاً. حساب مباشر على بيانات
   موجودة أصلاً (المهام + التقارير اليومية)، لا محرك جديد معقَّد.
   ============================================================ */
function computeTodaysPlannedTasks(projectId, date) {
  return ScheduleRepository.getTasks(projectId).filter((t) => t.start && t.end && t.start <= date && date <= t.end && Number(t.completion) < 100);
}
function computeDailyFollowUp(projectId, date) {
  const planned = computeTodaysPlannedTasks(projectId, date);
  const reports = (STATE.data.dailyReports || []).filter((r) => r.projectId === projectId && r.date === date);
  const reportedTaskIds = new Set();
  reports.forEach((r) => (r.completedTaskIds || []).forEach((id) => reportedTaskIds.add(id)));
  const untouchedTasks = planned.filter((t) => !reportedTaskIds.has(t.id));
  return {
    date, plannedCount: planned.length, touchedCount: planned.length - untouchedTasks.length,
    untouchedTasks, hasReportToday: reports.length > 0, reportCount: reports.length,
  };
}
function computeMissingDailyReports(projectId, daysBack) {
  const results = [];
  for (let i = 1; i <= daysBack; i++) { // يبدأ من الأمس — اليوم الحالي قد لا يكون قد انتهى بعد
    const date = addDays(todayISO(), -i);
    const planned = computeTodaysPlannedTasks(projectId, date);
    if (!planned.length) continue; // لا عمل مخطَّط أصلاً، لا حاجة لتقرير
    const reports = (STATE.data.dailyReports || []).filter((r) => r.projectId === projectId && r.date === date);
    if (!reports.length) results.push({ date, plannedCount: planned.length });
  }
  return results.sort((a, b) => b.date.localeCompare(a.date));
}
function computeDailyReportStreak(projectId) {
  let streak = 0;
  for (let i = 1; i <= 60; i++) {
    const date = addDays(todayISO(), -i);
    const planned = computeTodaysPlannedTasks(projectId, date);
    if (!planned.length) continue;
    const hasReport = (STATE.data.dailyReports || []).some((r) => r.projectId === projectId && r.date === date);
    if (hasReport) streak++;
    else break;
  }
  return streak;
}

function copilotForecastDates(data) {
  const projects = filterByProject(data.projects || []);
  const lines = projects.map((p) => {
    const trend = computeTrendForecast(p);
    if (!trend.available) return `• ${p.name}: لا يمكن التوقّع حالياً (${trend.reason})`;
    return `• ${p.name}: ${trend.forecastCompletionDate} (ثقة ${trend.confidenceLabel}، من ${trend.dataPointsUsed} نقطة رصد) — الأصلي: ${p.endDate || "—"}`;
  });
  return `توقّع تاريخ الانتهاء الفعلي (بالانحدار على المسار التاريخي الحقيقي، لا افتراض ثابت):\n${lines.join("\n")}`;
}

/* ============================================================
   التقارير التلقائية بالذكاء الاصطناعي (Autonomous Reporting) — تُبنى
   بالكامل من نفس محركات Copilot الحقيقية أعلاه (لا نموذج لغوي جديد)،
   منظَّمة كتقرير سردي جاهز للمدير التنفيذي بدل إجابة سؤال واحد.
   ============================================================ */
function generateAutonomousReport(data, periodType) {
  const periodLabel = { daily: "يومي", weekly: "أسبوعي", monthly: "شهري" }[periodType] || "يومي";
  const periodDays = { daily: 1, weekly: 7, monthly: 30 }[periodType] || 1;
  const sinceDate = addDays(todayISO(), -periodDays);

  const recentReports = filterByProject(data.dailyReports || []).filter((r) => r.date >= sinceDate);
  const recentCompletedTasks = filterByProject(data.tasks || []).filter((t) => Number(t.completion) >= 100 && t.end >= sinceDate);
  const recentRisks = filterByProject(data.risks || []).filter((r) => (r.dateRaised || "") >= sinceDate);

  const sections = [];
  sections.push(`# التقرير ${periodLabel} — ${todayISO()}\n`);
  sections.push(`## 1) الحالة العامة\n${copilotProjectsStatus(data)}\n`);
  if (periodType !== "monthly") {
    sections.push(`## 2) نشاط الفترة (آخر ${periodDays} يوم)\n• ${recentReports.length} تقرير يومي مُقدَّم\n• ${recentCompletedTasks.length} نشاط اكتمل\n• ${recentRisks.length} خطر جديد سُجِّل\n`);
  }
  sections.push(`## ${periodType !== "monthly" ? "3" : "2"}) المشاكل والأسباب الجذرية\n${copilotAtRiskProjects(data)}\n`);
  sections.push(`## ${periodType !== "monthly" ? "4" : "3"}) الدفعات والمخاطر المالية\n${copilotRiskyPayments(data)}\n`);
  if (periodType === "monthly") {
    sections.push(`## 4) توقّع تواريخ الانتهاء\n${copilotForecastDates(data)}\n`);
    sections.push(`## 5) أداء المقاولين\n${copilotUnderperformingContractor(data)}\n`);
  }
  sections.push(`## ${periodType !== "monthly" ? "5" : "6"}) القرارات المُوصى بها\n${copilotManagementDecisions(data)}\n`);
  return sections.join("\n");
}

function computeProfitability(projects, budgetItems, ledger, invoices, changeOrders, certificates) {
  const totalContractValue = projects.reduce((s, p) => {
    const impact = approvedChangeOrdersImpact(p.id, changeOrders);
    return s + Number(p.contractValue || 0) + impact.costImpact;
  }, 0);
  const totalBudgetCost = budgetItems.reduce((s, b) => s + Number(b.budget || 0), 0);
  const totalActualCost = budgetItems.reduce((s, b) => s + Number(b.actual || 0), 0);
  const expectedProfit = totalContractValue - totalBudgetCost;
  const revenue = invoices.filter((i) => i.type === "عميل").reduce((s, i) => s + Number(i.paidAmount || 0), 0)
    + (certificates || []).reduce((s, c) => s + Number(c.paidAmount || 0), 0);
  const actualProfit = revenue - totalActualCost;
  const margin = totalContractValue > 0 ? (expectedProfit / totalContractValue) * 100 : null;
  const actualMargin = revenue > 0 ? (actualProfit / revenue) * 100 : null;
  const variance = actualProfit - expectedProfit;
  return { totalContractValue, expectedProfit, actualProfit, margin, actualMargin, variance, revenue };
}

/* ---- 3. Progress claims (مستخلصات) ---- */
function computeClaims(invoices) {
  const claims = invoices.filter((i) => i.category === "مستخلص (Progress)");
  const submitted = claims.reduce((s, c) => s + Number(c.amount || 0), 0);
  const approved = claims.filter((c) => c.approvalStatus === "معتمد").reduce((s, c) => s + Number(c.amount || 0), 0);
  const notApproved = claims.filter((c) => c.approvalStatus !== "معتمد").reduce((s, c) => s + Number(c.amount || 0), 0);
  const uncollected = claims.reduce((s, c) => s + (Number(c.amount || 0) - Number(c.paidAmount || 0)), 0);
  const collectedClaims = claims.filter((c) => Number(c.paidAmount || 0) >= Number(c.amount || 0) && c.dueDate);
  let avgCollectionDays = null;
  if (collectedClaims.length) {
    avgCollectionDays = Math.round(collectedClaims.reduce((s, c) => s + Math.max(0, daysBetween(c.dueDate, todayISO())), 0) / collectedClaims.length);
  }
  return { count: claims.length, submitted, approved, notApproved, uncollected, avgCollectionDays };
}

/* ---- 4. Expenses breakdown (from ledger) ---- */
function computeExpenseBreakdown(ledger) {
  const expenses = ledger.filter((l) => l.type === "مصروف");
  const byCostCenter = {};
  expenses.forEach((e) => { const k = e.costCenter || "أخرى"; byCostCenter[k] = (byCostCenter[k] || 0) + Number(e.amount || 0); });
  const byMonth = {};
  expenses.forEach((e) => { const k = (e.date || "").slice(0, 7); byMonth[k] = (byMonth[k] || 0) + Number(e.amount || 0); });
  const todayStr = todayISO();
  const todayTotal = expenses.filter((e) => e.date === todayStr).reduce((s, e) => s + Number(e.amount || 0), 0);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const weekTotal = expenses.filter((e) => e.date >= weekAgo).reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const monthTotal = expenses.filter((e) => e.date >= monthAgo).reduce((s, e) => s + Number(e.amount || 0), 0);
  return { expenses, byCostCenter, byMonth, todayTotal, weekTotal, monthTotal };
}

/* ---- 5. Contracts (current value after approved change orders) ---- */
function computeContractStatus(project, changeOrders, budgetItems) {
  const approvedCOs = (changeOrders || []).filter((c) => c.projectId === project.id && c.status === "معتمد");
  const coValue = approvedCOs.reduce((s, c) => s + Number(c.costImpact || 0), 0);
  const originalValue = Number(project.contractValue) || 0;
  const currentValue = originalValue + coValue;
  const consumed = (budgetItems || []).filter((b) => b.projectId === project.id).reduce((s, b) => s + Number(b.actual || 0), 0);
  const remaining = currentValue - consumed;
  const consumedPct = currentValue > 0 ? (consumed / currentValue) * 100 : 0;
  return { originalValue, coValue, currentValue, consumed, remaining, consumedPct };
}

/* ---- 6. Financial vs Technical progress ---- */
function computeFinTechProgress(project, budgetItems, changeOrders) {
  const evm = computeEVM(project, budgetItems, changeOrders);
  const technicalPct = Number(project.completion) || 0;
  const financialPct = evm.BAC > 0 ? (evm.AC / evm.BAC) * 100 : 0;
  return { technicalPct, financialPct, gap: financialPct - technicalPct };
}

/* ---- 7. Resource costs ---- */
function computeResourceCosts(labor, equipment, materials, subcontractorLedger) {
  const laborCost = (labor || []).reduce((s, l) => s + (Number(l.count) || 0) * (Number(l.dailyRate) || 0), 0);
  const equipmentCost = (equipment || []).reduce((s, e) => s + (Number(e.hours) || 0) * (Number(e.hourlyRate) || 0), 0);
  const materialCost = (materials || []).reduce((s, m) => s + (Number(m.consumed) || 0) * (Number(m.unitCost) || 0), 0);
  const subcontractorCost = (subcontractorLedger || []).filter((l) => l.costCenter === "مقاولين من الباطن" && l.type === "مصروف").reduce((s, l) => s + Number(l.amount || 0), 0);
  const servicesCost = (subcontractorLedger || []).filter((l) => l.costCenter === "خدمات" && l.type === "مصروف").reduce((s, l) => s + Number(l.amount || 0), 0);
  return { laborCost, equipmentCost, materialCost, subcontractorCost, servicesCost, total: laborCost + equipmentCost + materialCost + subcontractorCost + servicesCost };
}

/* ---- 8. Receivables / Payables + Aging ---- */
function computeReceivablesPayables(invoices) {
  const receivables = invoices.filter((i) => i.type === "عميل" && i.status !== "مدفوعة");
  const payables = invoices.filter((i) => i.type === "مورد" && i.status !== "مدفوعة");
  const bucket = (rows) => {
    const b = { current: 0, d30: 0, d60: 0, d90: 0 };
    rows.forEach((r) => {
      const remaining = Number(r.amount || 0) - Number(r.paidAmount || 0);
      const overdue = -(daysUntil(r.dueDate) ?? 0);
      if (overdue <= 0) b.current += remaining;
      else if (overdue <= 30) b.d30 += remaining;
      else if (overdue <= 60) b.d60 += remaining;
      else b.d90 += remaining;
    });
    return b;
  };
  const totalReceivable = receivables.reduce((s, r) => s + (Number(r.amount || 0) - Number(r.paidAmount || 0)), 0);
  const totalPayable = payables.reduce((s, r) => s + (Number(r.amount || 0) - Number(r.paidAmount || 0)), 0);
  const overdueInvoices = invoices.filter((i) => i.status !== "مدفوعة" && daysUntil(i.dueDate) != null && daysUntil(i.dueDate) < 0);
  return { receivables, payables, totalReceivable, totalPayable, agingReceivable: bucket(receivables), agingPayable: bucket(payables), overdueInvoices };
}

/* ---- 9. KPIs ---- */
function computeFinancialKPIs(ledger, invoices) {
  const exp = computeExpenseBreakdown(ledger);
  const revenueToday = (invoices || []).filter((i) => i.type === "عميل").length ? 0 : 0; // placeholder for daily revenue if tracked in ledger
  const incomeToday = ledger.filter((l) => l.type === "إيراد" && l.date === todayISO()).reduce((s, l) => s + Number(l.amount || 0), 0);
  const last30 = ledger.filter((l) => l.type === "مصروف" && l.date >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const burnRate = last30.length ? last30.reduce((s, l) => s + Number(l.amount || 0), 0) / 30 : 0;
  return { costToday: exp.todayTotal, costWeek: exp.weekTotal, costMonth: exp.monthTotal, incomeToday, burnRate };
}

/* ============================================================
   12. لوحة عملي (My Action Items) — بخلاف تنبيهات المحفظة العامة، هذه
   قائمة شخصية بما يحتاج فعلاً من هذا المستخدم تحديداً إجراءً، مبنية على
   دوره ونطاق مشاريعه (يستخدم نطاق الرؤية نفسه المطبَّق في كل مكان آخر).
   ============================================================ */
/* ============================================================
   مهامي كمهندس/مشرف مسؤول — تربط حساب المستخدم (linkedResourceId)
   بالأنشطة المُسنَدة إليه تحديداً (responsibleResourceId)، وتُظهر
   الأنشطة التالية (اللاحقة منطقياً) لكل نشاط ليعرف ماذا بعده.
   ============================================================ */
function computeMyResponsibleTasks(user, data) {
  if (!user || !user.linkedResourceId) return { available: false, reason: "لا يوجد ربط بسجل موارد لحسابك — لا يمكن تحديد الأنشطة المُسنَدة إليك تحديداً." };
  const myTasks = (data.tasks || []).filter((t) => t.responsibleResourceId === user.linkedResourceId && Number(t.completion) < 100);
  const enriched = myTasks.map((t) => {
    const successors = (data.tasks || []).filter((succ) =>
      (succ.predecessorDetails || []).some((d) => d.taskId === t.id) || (succ.predecessors || []).includes(t.id));
    const isOverdue = t.end && t.end < todayISO();
    return { task: t, projectName: projName(t.projectId), successors, isOverdue };
  }).sort((a, b) => (a.isOverdue === b.isOverdue) ? 0 : a.isOverdue ? -1 : 1);
  return { available: true, tasks: enriched };
}
/* ============================================================
   عبء عمل الفريق — لمدير المشروع: كل مهندس تحت مشاريعه وعدد الأنشطة
   المُسنَدة إليه تحديداً وحالتها.
   ============================================================ */
function computeTeamWorkload(pmUser, data) {
  if (!pmUser || !pmUser.linkedResourceId) return { available: false, reason: "لا يوجد ربط بسجل موارد لحسابك." };
  const myProjectIds = new Set((data.projects || []).filter((p) => p.projectManagerId === pmUser.linkedResourceId).map((p) => p.id));
  if (!myProjectIds.size) return { available: false, reason: "لا مشاريع مُسنَدة إليك كمدير مشروع حالياً." };
  const engineers = (data.resourcePool || []).filter((r) => r.type === "مهندس");
  const workload = engineers.map((eng) => {
    const tasks = (data.tasks || []).filter((t) => t.responsibleResourceId === eng.id && myProjectIds.has(t.projectId));
    const overdueTasks = tasks.filter((t) => t.end && t.end < todayISO() && Number(t.completion) < 100);
    return { engineer: eng, taskCount: tasks.length, activeTaskCount: tasks.filter((t) => Number(t.completion) < 100).length, overdueCount: overdueTasks.length };
  }).filter((w) => w.taskCount > 0);
  return { available: true, workload };
}

/* ============================================================
   ترحيل ملاحظة غير منفَّذة — ينشئ ملاحظة جديدة حقيقية (لا مجرد تمديد
   موعد) ترث العنوان والوصف، بموعد تنفيذ جديد، مع ربط ثنائي الاتجاه
   بالملاحظة الأصلية (carriedFromId/carriedToId) لتتبّع تاريخ الترحيل
   الكامل عبر عدة دورات إن تكرر ذلك.
   ============================================================ */
function carryForwardGmNote(noteId, newDueDate) {
  if (STATE.user && !canEdit(STATE.user.role, "gmNotes")) { alert("دورك الحالي لا يملك صلاحية ترحيل ملاحظات الإدارة العليا."); return null; }
  const note = (STATE.data.gmNotes || []).find((n) => n.id === noteId);
  if (!note) return null;
  const newNote = {
    id: uid(), projectId: note.projectId, title: note.title, description: note.description,
    priority: note.priority, category: note.category, relatedTaskId: note.relatedTaskId, assignedPmResourceId: note.assignedPmResourceId,
    raisedDate: todayISO(), dueDate: newDueDate,
    status: "بانتظار رد مدير المشروع", responseHistory: [], carriedFromId: note.id, updatedAt: Date.now(),
  };
  STATE.data.gmNotes.push(newNote);
  STATE.data.gmNotes = STATE.data.gmNotes.map((n) => (n.id === noteId ? Object.assign({}, n, { carriedToId: newNote.id }) : n));
  logAudit("create", "gmNotes", newNote.id, `ترحيل ملاحظة: «${note.title}» إلى موعد جديد ${newDueDate}`);
  saveData(STATE.data);
  return newNote;
}

/* ============================================================
   تلخيص الملاحظات المتكررة — تجميع حقيقي حسب تطابق العنوان (مطابقة
   نصية دقيقة بعد تنسيق بسيط، لا تشابهاً ضبابياً بذكاء اصطناعي غير
   موجود هنا) — يكشف مشكلة تتكرر إثارتها عبر فترات مختلفة بصدق كامل.
   ============================================================ */
function computeRecurringNotesSummary(projectId) {
  const notes = (STATE.data.gmNotes || []).filter((n) => n.projectId === projectId);
  const groups = {};
  notes.forEach((n) => {
    const key = (n.title || "").trim().toLowerCase();
    if (!key) return;
    (groups[key] = groups[key] || []).push(n);
  });
  return Object.values(groups).filter((g) => g.length > 1)
    .map((g) => ({
      title: g[0].title, count: g.length,
      dates: g.map((n) => n.raisedDate).filter(Boolean).sort(),
      unexecutedCount: g.filter((n) => n.status === "مُعادة لمدير المشروع" || (n.dueDate && n.dueDate < todayISO() && n.status !== "مقبولة ومغلقة")).length,
    }))
    .sort((a, b) => b.count - a.count);
}

function computeMyActionItems(user, data) {
  if (!user) return [];
  const items = [];
  const push = (icon, text, navKey, projectId, level) => items.push({ icon, text, navKey, projectId: projectId || null, level });
  const scope = getUserScopedProjectIds();
  const inScope = (projectId) => !scope || scope.has(projectId);

  if (user.role === "مدير المشروع") {
    (data.certificates || []).filter((c) => inScope(c.projectId) && (c.stage === "مسودة" || c.stage === "مرفوض/معاد للتعديل")).forEach((c) =>
      push("📜", `مستخلص رقم ${c.number} (${projName(c.projectId)}) بحاجة ${c.stage === "مسودة" ? "تقديم للمالك" : "مراجعة بعد الرفض"}`, "certificates", c.projectId, "warn"));
    (data.subcontractorCertificates || []).filter((c) => inScope(c.projectId) && c.stage === "مُقدَّم من المقاول").forEach((c) =>
      push("🧱", `مستخلص المقاول «${c.subcontractorParty}» بحاجة مراجعة فنية (${projName(c.projectId)})`, "subcontractorCertificates", c.projectId, "warn"));
    (data.tasks || []).filter((t) => inScope(t.projectId) && deriveTaskStatus(t) === "متأخر").forEach((t) =>
      push("✔", `المهمة «${t.name}» متأخرة (${projName(t.projectId)})`, "tasks", t.projectId, "danger"));
    (data.decisions || []).filter((d) => inScope(d.projectId) && deriveDecisionStatus(d) === "متأخرة" && d.owner).forEach((d) =>
      push("🗓", `قرار متأخر التنفيذ: «${d.decisionText.slice(0, 35)}...» (${projName(d.projectId)})`, "meetings", d.projectId, "danger"));
    (data.correspondence || []).filter((c) => inScope(c.projectId) && c.priority === "عاجلة" && c.status !== "مغلقة").forEach((c) =>
      push("✉", `مراسلة عاجلة بلا رد: ${c.subject} (${projName(c.projectId)})`, "correspondence", c.projectId, "warn"));
    (data.punchlist || []).filter((p) => inScope(p.projectId) && derivePunchStatus(p) === "متأخرة").forEach((p) =>
      push("📝", `ملاحظة تسليم متأخرة: ${p.itemNumber} (${projName(p.projectId)})`, "punchlist", p.projectId, "danger"));
    (data.documents || []).filter((doc) => inScope(doc.projectId) && ["منتهي", "ينتهي قريباً"].includes(deriveDocumentStatus(doc))).forEach((doc) =>
      push("📁", `وثيقة ${deriveDocumentStatus(doc) === "منتهي" ? "منتهية الصلاحية" : "تنتهي قريباً"}: ${doc.title} (${projName(doc.projectId)})`, "documents", doc.projectId, deriveDocumentStatus(doc) === "منتهي" ? "danger" : "warn"));
    (data.contracts || []).filter((c) => inScope(c.projectId) && daysUntil(c.expiryDate) != null && daysUntil(c.expiryDate) <= 30).forEach((c) =>
      push("📄", `عقد «${c.party}» ${daysUntil(c.expiryDate) < 0 ? "منتهي" : `ينتهي خلال ${daysUntil(c.expiryDate)} يوم`} (${projName(c.projectId)})`, "contracts", c.projectId, daysUntil(c.expiryDate) < 0 ? "danger" : "warn"));
    {
      const procIds = new Set((data.procurement || []).filter((r) => inScope(r.projectId)).map((r) => r.id));
      const bidsByProc = {};
      (data.procurementBids || []).filter((b) => procIds.has(b.procurementId)).forEach((b) => (bidsByProc[b.procurementId] = bidsByProc[b.procurementId] || []).push(b));
      Object.entries(bidsByProc).forEach(([procId, bids]) => {
        if (bids.length >= 2 && !bids.some((b) => b.isWinner)) {
          const req = (data.procurement || []).find((r) => r.id === procId);
          if (req) push("🛒", `${bids.length} عروض أسعار بانتظار اختيار الفائز: ${req.item} (${projName(req.projectId)})`, "procurement", req.projectId, "warn");
        }
      });
    }
  }

  if (user.role === "مهندس الموقع") {
    (data.qc || []).filter((q) => inScope(q.projectId) && deriveQCStatus(q) === "متأخر").forEach((q) =>
      push("🛡", `بند جودة متأخر: ${q.title} (${projName(q.projectId)})`, "qc", q.projectId, "danger"));
    (data.hse || []).filter((h) => inScope(h.projectId) && deriveHSEStatus(h) !== "مغلق" && h.category === "حادث").forEach((h) =>
      push("⛑", `حادث سلامة قيد التحقيق: ${h.title} (${projName(h.projectId)})`, "hse", h.projectId, "danger"));
    (data.punchlist || []).filter((p) => inScope(p.projectId) && derivePunchStatus(p) !== "مغلقة").forEach((p) =>
      push("📝", `ملاحظة تسليم مفتوحة: ${p.itemNumber} — ${p.description.slice(0, 30)} (${projName(p.projectId)})`, "punchlist", p.projectId, p.severity === "حرجة" ? "danger" : "warn"));
    // اكتشاف فعّال لملاحظات مدير المشروع الموجَّهة تحديداً لهذا المهندس — لا الاعتماد فقط على الإشعار السلبي
    (data.gmNotes || []).filter((n) => inScope(n.projectId) && n.assignedEngineerResourceId === user.linkedResourceId && n.status === "بانتظار رد المهندس").forEach((n) =>
      push("📝", `ملاحظة من مدير المشروع بانتظار ردك: ${n.title} (${projName(n.projectId)})`, "gmNotes", n.projectId, "warn"));
  }

  if (user.role === "مدير عام") {
    (data.projects || []).filter((p) => !p.projectManagerId).forEach((p) =>
      push("🗂", `مشروع بلا مدير مشروع مُعيَّن: ${p.name}`, "projects", p.id, "warn"));
  }

  if (user.role === "المحاسب العام") {
    (data.invoices || []).filter((i) => i.status === "قيد المراجعة").forEach((i) =>
      push("🧾", `فاتورة ${i.number} بانتظار المراجعة والاعتماد`, "invoices", i.projectId, "warn"));
    (data.certificates || []).filter((c) => c.stage === "معتمد (بانتظار الصرف)").forEach((c) =>
      push("📜", `مستخلص رقم ${c.number} (${projName(c.projectId)}) معتمد — بانتظار تأكيد التحصيل`, "certificates", c.projectId, "warn"));
    (data.subcontractorCertificates || []).filter((c) => c.stage === "معتمد للصرف").forEach((c) =>
      push("🧱", `مستخلص المقاول «${c.subcontractorParty}» (${projName(c.projectId)}) بانتظار تأكيد الصرف`, "subcontractorCertificates", c.projectId, "warn"));
    (data.custodies || []).filter((c) => !c.reconciled).forEach((c) =>
      push("💼", `عهدة رقم ${c.number} (${projName(c.projectId)}) بانتظار المطابقة النهائية`, "custodies", c.projectId, "info"));
  }

  const order = { danger: 0, warn: 1, info: 2 };
  return items.sort((a, b) => order[a.level] - order[b.level]);
}

/* ---- 10. Formula-based predictive indicators (explicitly NOT machine-learning) ---- */
function computePredictive(project, budgetItems, changeOrders) {
  const evm = computeEVM(project, budgetItems, changeOrders);
  let predictedFinishDate = null;
  const scheduleEnd = evm.effectiveEndDate || project.endDate;
  if (project.startDate && scheduleEnd && evm.SPI && evm.SPI > 0) {
    const plannedDuration = daysBetween(project.startDate, scheduleEnd);
    const predictedDuration = Math.round(plannedDuration / evm.SPI);
    const d = new Date(project.startDate);
    d.setDate(d.getDate() + predictedDuration);
    predictedFinishDate = d.toISOString().slice(0, 10);
  }
  const predictedFinalProfit = evm.BAC - evm.EAC;
  const budgetOverrun = evm.EAC > evm.BAC;
  return { predictedFinishDate, predictedFinalProfit, budgetOverrun, EAC: evm.EAC, BAC: evm.BAC };
}

/* ============================================================
   11. مؤشر صحة المشروع الشامل (Project Health Score)
   نموذج قائم على معادلات واضحة وقابلة للتفسير بالكامل (وليس تعلّم آلي) —
   يُجمّع أداء الجدول والتكلفة (EVM)، التعرض للمخاطر المفتوحة، البنود
   المتأخرة (مهام/قرارات/ملاحظات تسليم)، امتثال الوثائق والتراخيص، وتأخر
   تحصيل المستخلصات المعتمدة، في درجة واحدة من 100 مع تفصيل شفاف لكل
   عامل ساهم في خصم النقاط، بحيث يمكن لأي مستخدم معرفة "لماذا" حصل
   المشروع على هذه الدرجة بالضبط، لا مجرد رقم غامض.
   ============================================================ */
function computeProjectHealthScore(project, data) {
  const breakdown = [];
  let score = 100;
  const deduct = (label, amount, detail) => {
    if (amount <= 0) return;
    score -= amount;
    breakdown.push({ label, amount: Math.round(amount * 10) / 10, detail });
  };

  const evm = computeEVM(project, data.budgetItems, data.changeOrders);
  if (evm.CPI != null && evm.CPI < 1) {
    deduct("تجاوز في التكلفة (CPI)", clamp((1 - evm.CPI) * 30, 0, 30), `CPI الحالي ${evm.CPI.toFixed(2)} — إنفاق أعلى من القيمة المكتسبة`);
  }
  if (evm.SPI != null && evm.SPI < 1) {
    deduct("تأخر عن الجدول (SPI)", clamp((1 - evm.SPI) * 30, 0, 30), `SPI الحالي ${evm.SPI.toFixed(2)} — تقدّم فعلي أقل من المخطط`);
  }

  const risks = (data.risks || []).filter((r) => r.projectId === project.id);
  const exposure = projectRiskExposure(project.id, risks);
  if (exposure > 0) {
    deduct("التعرض للمخاطر المفتوحة", clamp(exposure / 4, 0, 15), `إجمالي درجات المخاطر المفتوحة: ${exposure}`);
  }

  const overdueTasks = (data.tasks || []).filter((t) => t.projectId === project.id && deriveTaskStatus(t) === "متأخر").length;
  const overdueDecisions = (data.decisions || []).filter((d) => d.projectId === project.id && deriveDecisionStatus(d) === "متأخرة").length;
  const overduePunch = (data.punchlist || []).filter((p) => p.projectId === project.id && derivePunchStatus(p) === "متأخرة").length;
  const criticalPunchOpen = (data.punchlist || []).filter((p) => p.projectId === project.id && p.severity === "حرجة" && derivePunchStatus(p) !== "مغلقة").length;
  const overdueCount = overdueTasks + overdueDecisions + overduePunch;
  if (overdueCount > 0) {
    deduct("بنود متأخرة (مهام/قرارات/ملاحظات تسليم)", clamp(overdueCount * 3, 0, 20),
      `${overdueTasks} مهمة، ${overdueDecisions} قرار، ${overduePunch} ملاحظة تسليم متأخرة`);
  }
  if (criticalPunchOpen > 0) {
    deduct("ملاحظات تسليم حرجة لم تُغلق", clamp(criticalPunchOpen * 5, 0, 15), `${criticalPunchOpen} ملاحظة حرجة مفتوحة`);
  }

  const expiredDocs = (data.documents || []).filter((doc) => doc.projectId === project.id && deriveDocumentStatus(doc) === "منتهي").length;
  if (expiredDocs > 0) {
    deduct("وثائق/تراخيص منتهية الصلاحية", clamp(expiredDocs * 5, 0, 15), `${expiredDocs} وثيقة منتهية تحتاج تجديداً فورياً`);
  }

  const staleCerts = (data.certificates || []).filter((c) =>
    c.projectId === project.id && c.stage === "معتمد (بانتظار الصرف)" && c.approvedDate && (-daysUntil(c.approvedDate)) > 30
  ).length;
  if (staleCerts > 0) {
    deduct("مستخلصات معتمدة تأخر تحصيلها", clamp(staleCerts * 5, 0, 10), `${staleCerts} مستخلص معتمد منذ أكثر من 30 يوماً دون تحصيل`);
  }

  const staleSubcontractorCerts = (data.subcontractorCertificates || []).filter((c) =>
    c.projectId === project.id && c.stage === "معتمد للصرف" && c.reviewedDate && (-daysUntil(c.reviewedDate)) > 30
  ).length;
  if (staleSubcontractorCerts > 0) {
    deduct("مستخلصات مقاولين معتمدة تأخر صرفها", clamp(staleSubcontractorCerts * 4, 0, 8), `${staleSubcontractorCerts} مستخلص مقاول معتمد منذ أكثر من 30 يوماً دون صرف — قد يؤثر على استمرارية العمل`);
  }

  const openHighSeverityHSE = (data.hse || []).filter((h) => h.projectId === project.id && h.severity === "مرتفع" && deriveHSEStatus(h) !== "مغلق").length;
  if (openHighSeverityHSE > 0) {
    deduct("حوادث سلامة مرتفعة الخطورة لم تُغلق", clamp(openHighSeverityHSE * 10, 0, 25), `${openHighSeverityHSE} حادث مرتفع الخطورة قيد التحقيق — أولوية قصوى`);
  }
  const overdueQC = (data.qc || []).filter((q) => q.projectId === project.id && deriveQCStatus(q) === "متأخر").length;
  const openNCR = (data.qc || []).filter((q) => q.projectId === project.id && q.category === "NCR" && deriveQCStatus(q) !== "مغلق").length;
  if (overdueQC > 0 || openNCR > 0) {
    deduct("بنود جودة متأخرة أو عدم توافق غير مغلق", clamp(overdueQC * 3 + openNCR * 4, 0, 15), `${overdueQC} بند جودة متأخر، ${openNCR} تقرير عدم توافق (NCR) مفتوح`);
  }

  score = clamp(Math.round(score), 0, 100);
  const level = score >= 80 ? "good" : score >= 60 ? "warn" : "danger";
  const label = score >= 80 ? "ممتاز" : score >= 60 ? "يحتاج متابعة" : "حرج — يحتاج تدخلاً عاجلاً";
  breakdown.sort((a, b) => b.amount - a.amount);
  return { score, level, label, breakdown };
}

/* ============================================================
   مؤشر الصحة المُفصَّل بـ6 محاور مُسمَّاة — نفس منطق الخصم أعلاه
   بالضبط، مُعاد تنظيمه في محاور تُعرَض منفصلة لمدير المشروع، مع
   إضافة حقيقية جديدة: "ثقة التقدّم" المبنية فعلياً على نسبة تغطية
   بيانات المسح الفعلي (Reality Capture) لعناصر Digital Twin —
   لا افتراض ثقة عالية دون بيانات حقيقية تدعمها.
   ============================================================ */
function computeProjectHealthScoreDetailed(project, data) {
  const full = computeProjectHealthScore(project, data);
  const evm = computeEVM(project, data.budgetItems, data.changeOrders);
  const risks = (data.risks || []).filter((r) => r.projectId === project.id);
  const exposure = projectRiskExposure(project.id, risks);
  const overdueTasks = (data.tasks || []).filter((t) => t.projectId === project.id && deriveTaskStatus(t) === "متأخر").length;
  const overdueDecisions = (data.decisions || []).filter((d) => d.projectId === project.id && deriveDecisionStatus(d) === "متأخرة").length;
  const overduePunch = (data.punchlist || []).filter((p) => p.projectId === project.id && derivePunchStatus(p) === "متأخرة").length;
  const criticalPunchOpen = (data.punchlist || []).filter((p) => p.projectId === project.id && p.severity === "حرجة" && derivePunchStatus(p) !== "مغلقة").length;
  const overdueQC = (data.qc || []).filter((q) => q.projectId === project.id && deriveQCStatus(q) === "متأخر").length;
  const openNCR = (data.qc || []).filter((q) => q.projectId === project.id && q.category === "NCR" && deriveQCStatus(q) !== "مغلق").length;
  const expiredDocs = (data.documents || []).filter((doc) => doc.projectId === project.id && deriveDocumentStatus(doc) === "منتهي").length;
  const staleCerts = (data.certificates || []).filter((c) => c.projectId === project.id && c.stage === "معتمد (بانتظار الصرف)" && c.approvedDate && (-daysUntil(c.approvedDate)) > 30).length;

  const scheduleScore = clamp(100 - (evm.SPI != null && evm.SPI < 1 ? clamp((1 - evm.SPI) * 30, 0, 30) : 0) - clamp((overdueTasks + overdueDecisions) * 3, 0, 20), 0, 100);
  const costScore = clamp(100 - (evm.CPI != null && evm.CPI < 1 ? clamp((1 - evm.CPI) * 30, 0, 30) : 0), 0, 100);
  const qualityScore = clamp(100 - clamp(overduePunch * 3, 0, 20) - clamp(criticalPunchOpen * 5, 0, 15) - clamp(overdueQC * 3 + openNCR * 4, 0, 15), 0, 100);
  const riskScore = clamp(100 - clamp(exposure / 4, 0, 15), 0, 100);
  const contractScore = clamp(100 - clamp(expiredDocs * 5, 0, 15) - clamp(staleCerts * 5, 0, 10), 0, 100);

  const assets = (data.projectAssets || []).filter((a) => a.projectId === project.id);
  const assetsWithScans = assets.filter((a) => (data.realityCaptures || []).some((rc) => rc.assetId === a.id && rc.detectedCompletionPct != null && rc.detectedCompletionPct !== ""));
  const progressConfidenceScore = assets.length ? Math.round((assetsWithScans.length / assets.length) * 100) : null;

  return {
    overallScore: full.score, overallLevel: full.level, overallLabel: full.label, breakdown: full.breakdown,
    subScores: {
      schedule: scheduleScore, cost: costScore, quality: qualityScore, risk: riskScore, contract: contractScore,
      progressConfidence: progressConfidenceScore,
    },
    progressConfidenceNote: progressConfidenceScore == null
      ? "لا توجد عناصر Digital Twin مسجَّلة لهذا المشروع بعد — لا يمكن حساب ثقة تقدّم مبنية على بيانات مسح فعلية."
      : `${assetsWithScans.length} من ${assets.length} عنصراً لديها بيانات مسح فعلية فعلية.`,
  };
}
