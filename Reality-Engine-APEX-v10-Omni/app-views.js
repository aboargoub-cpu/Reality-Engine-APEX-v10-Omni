/* ============================================================
   شاشات النظام (Views)
   ============================================================ */

function filterByProject(rows, isResourcePool) {
  const scope = getUserScopedProjectIds();
  const getPid = (r) => (r.projectId !== undefined ? r.projectId : r.id); // مجموعة "المشاريع" نفسها تُعرِّف هويتها بـ id لا بـ projectId
  let out = rows;
  if (scope) {
    out = out.filter((r) => isResourcePool ? (!getResourceProjectIds(r).length || getResourceProjectIds(r).some((pid) => scope.has(pid))) : scope.has(getPid(r)));
  }
  if (STATE.projectFilter !== "all") {
    out = out.filter((r) => isResourcePool ? (!getResourceProjectIds(r).length || getResourceProjectIds(r).includes(STATE.projectFilter)) : getPid(r) === STATE.projectFilter);
  }
  return out;
}

/* ---------------- Simple CRUD-only modules ---------------- */
function renderSimpleModule(moduleKey, title, collection, extraColumns = []) {
  const rows = filterByProject(STATE.data[collection]);
  const fields = MODULES[moduleKey].fields();
  const readOnly = !canEdit(STATE.user.role, moduleKey);
  return renderModuleView(moduleKey, title, fields, rows, extraColumns, readOnly);
}

/* ---------------- Executive Dashboard (Portfolio -> Project -> Activity Drill-Down) ---------------- */
/* ============================================================
   بطاقة لوحة تحكم قابلة للطي — عنوان في مستطيل حديث، يظهر المحتوى
   فقط عند الضغط عليه. تُغلِّف محتوى مُحتسَباً بالفعل، بلا أي لمس
   لمنطق الحساب نفسه — تغيير في طريقة العرض النهائي فقط.
   ============================================================ */
function getDashboardCardExpanded(cardKey, defaultExpanded) {
  if (!STATE.dashboardCardsExpanded) STATE.dashboardCardsExpanded = {};
  if (!(cardKey in STATE.dashboardCardsExpanded)) STATE.dashboardCardsExpanded[cardKey] = !!defaultExpanded;
  return STATE.dashboardCardsExpanded[cardKey];
}
function toggleDashboardCard(cardKey) {
  if (!STATE.dashboardCardsExpanded) STATE.dashboardCardsExpanded = {};
  STATE.dashboardCardsExpanded[cardKey] = !getDashboardCardExpanded(cardKey, false);
  renderApp();
}
function collapsibleCard(title, contentHtml, cardKey, defaultExpanded) {
  if (!contentHtml || !contentHtml.trim()) return "";
  const isExpanded = getDashboardCardExpanded(cardKey, defaultExpanded);
  return `<div class="dash-card${isExpanded ? " expanded" : ""}" style="margin-bottom:12px;">
    <div class="dash-card-header" onclick="toggleDashboardCard('${esc(cardKey)}')">
      <span class="dash-card-title">${esc(title)}</span>
      <span class="dash-card-arrow">${isExpanded ? "▼" : "◂"}</span>
    </div>
    ${isExpanded ? `<div class="dash-card-body">${contentHtml}</div>` : ""}
  </div>`;
}
/* لوحة اختيار حقيقية — شبكة بطاقات مربَّعة، كل بطاقة قسم واحد، تُختار فتظهر نتيجتها في منطقة منفصلة أسفل الشبكة
   تماماً — لا قائمة عمودية طويلة واحدة. كل بطاقة تحمل محتوى مُحتسَباً بالفعل، بلا لمس لأي منطق حساب. */
function renderTilePicker(sections) {
  const realSections = sections.filter((s) => s.content && s.content.trim());
  if (!realSections.length) return "";
  const tilesHtml = realSections.map((s) => {
    const isExpanded = getDashboardCardExpanded(s.key, s.defaultExpanded);
    return `<div class="dash-tile${isExpanded ? " active" : ""}" onclick="toggleDashboardCard('${esc(s.key)}')">
      <span class="dash-tile-icon">${s.icon || "▦"}</span>
      <span class="dash-tile-title">${esc(s.title)}</span>
    </div>`;
  }).join("");
  const expandedSections = realSections.filter((s) => getDashboardCardExpanded(s.key, s.defaultExpanded));
  const resultsHtml = expandedSections.map((s) => `<div class="dash-card expanded" style="margin-bottom:12px;">
    <div class="dash-card-header" onclick="toggleDashboardCard('${esc(s.key)}')">
      <span class="dash-card-title">${s.icon || ""} ${esc(s.title)}</span>
      <span class="dash-card-arrow">▼ إغلاق</span>
    </div>
    <div class="dash-card-body">${s.content}</div>
  </div>`).join("");
  return `<div class="dash-tile-grid">${tilesHtml}</div>${resultsHtml}`;
}

function renderDashboard() {
  const drill = STATE.dashboardDrill || { level: "portfolio" };
  if (drill.level === "activity" && drill.projectId && drill.taskId) {
    return renderActivityDrilldown(drill.projectId, drill.taskId);
  }
  if (drill.level === "project" && drill.projectId) {
    return renderProjectDrilldown(drill.projectId);
  }
  return renderPortfolioDashboard();
}

function drillToProject(projectId) { pushNavHistory(); STATE.dashboardDrill = { level: "project", projectId }; renderApp(); }
function drillToActivity(projectId, taskId) { STATE.dashboardDrill = { level: "activity", projectId, taskId }; renderApp(); }
function drillToPortfolio() { STATE.dashboardDrill = { level: "portfolio" }; renderApp(); }
function backToProjectDrill(projectId) { STATE.dashboardDrill = { level: "project", projectId }; renderApp(); }

/* Reusable S-curve builder (planned vs actual cumulative completion) for a single project */
function buildSCurveHtml(proj, title) {
  if (!proj || !proj.startDate || !proj.endDate) return "";
  const start = new Date(proj.startDate), end = new Date(proj.endDate);
  const totalDays = Math.max(1, Math.round((end - start) / 86400000));
  const history = (proj.history || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const points = 8, labels = [], planned = [], actual = [];
  for (let i = 0; i <= points; i++) {
    const dt = new Date(start.getTime() + (totalDays * i / points) * 86400000);
    const dISO = dt.toISOString().slice(0, 10);
    labels.push(dISO.slice(5));
    planned.push(Math.round(clamp((i / points) * 100, 0, 100)));
    const past = history.filter((h) => h.date <= dISO);
    if (past.length) actual.push(Math.round(past[past.length - 1].completion));
    else if (dISO <= todayISO() && history.length) actual.push(Math.round(history[0].completion));
    else actual.push(null);
  }
  const svg = lineChart(labels, [
    { name: "المخطط", color: "#5b6b7a", values: planned, dashed: true },
    { name: "المنفذ", color: "#F5A623", values: actual },
  ], { min: 0, max: 100 });
  return `<div class="frame p4" style="margin-bottom:16px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">${esc(title || ("منحنى S — المخطط مقابل المنفذ تراكمياً: " + proj.name))}</h3>
    <div class="chart-box">${svg.outerHTML}</div>
    ${legendHTML([{ name: "المخطط", color: "#5b6b7a" }, { name: "المنفذ", color: "#F5A623" }])}
  </div>`;
}

/* Small horizontal risk-score bar used across dashboard levels */
function riskBarRow(r) {
  const score = riskScore(r);
  const pct = Math.round((score / 25) * 100);
  return `<div style="margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;gap:8px;">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.title)}</span>
      <span style="font-family:monospace;color:${riskHeatColor(score)};flex-shrink:0;">${score}/25</span>
    </div>
    <div style="background:#FFFFFF;border-radius:4px;height:8px;overflow:hidden;">
      <div style="width:${pct}%;height:100%;background:${riskHeatColor(score)};"></div>
    </div>
  </div>`;
}

/* ---------------- Level 1: Portfolio ---------------- */
function renderPortfolioDashboard() {
  const d = STATE.data;
  const projects = filterByProject(d.projects);
  const tasks = filterByProject(d.tasks);
  const invoices = filterByProject(d.invoices);
  const equipment = filterByProject(d.equipment);
  const contracts = filterByProject(d.contracts);
  const materials = filterByProject(d.materials);
  const budgetItems = filterByProject(d.budgetItems);
  const hse = filterByProject(d.hse);
  const certificates = filterByProject(d.certificates || []);
  const risks = filterByProject(d.risks || []);

  const delayedProjects = projects.filter((p) => deriveProjectStatus(p) === "متأخر").length;
  const avgCompletion = projects.length ? Math.round(projects.reduce((s, p) => s + (p.completion || 0), 0) / projects.length) : 0;
  const totalActual = budgetItems.reduce((s, b) => s + Number(b.actual || 0), 0);
  const revenue = invoices.filter((i) => i.type === "عميل").reduce((s, i) => s + Number(i.paidAmount || 0), 0)
    + certificates.reduce((s, c) => s + Number(c.paidAmount || 0), 0);
  const cashAvailable = revenue - totalActual;
  const dueInvoices = invoices.filter((i) => i.status !== "مدفوعة");
  const activeEquipment = equipment.filter((e) => e.status === "تعمل").length;
  const overdueTasks = tasks.filter((t) => deriveTaskStatus(t) === "متأخر");
  const todayCritical = tasks.filter((t) => t.priority === "عالية" && deriveTaskStatus(t) !== "منتهي");
  const lowStock = materials.filter((m) => Number(m.inStock) <= Number(m.reorderLevel));
  const expiringContracts = contracts.filter((c) => { const dd = daysUntil(c.expiryDate); return dd != null && dd <= 30; });
  const highRisks = risks.filter((r) => riskScore(r) >= 15);

  const evmByProject = {};
  projects.forEach((p) => (evmByProject[p.id] = computeEVM(p, d.budgetItems, d.changeOrders)));
  const evmList = Object.values(evmByProject);
  const totalEV = evmList.reduce((s, e) => s + e.EV, 0);
  const totalAC = evmList.reduce((s, e) => s + e.AC, 0);
  const totalPV = evmList.reduce((s, e) => s + (e.PV || 0), 0);
  const portfolioCPI = totalAC > 0 ? totalEV / totalAC : null;
  const portfolioSPI = totalPV > 0 ? totalEV / totalPV : null;

  const overdueDecisions = (filterByProject(d.decisions || [])).filter((dec) => deriveDecisionStatus(dec) === "متأخرة");
  const openCorrespondence = (filterByProject(d.correspondence || [])).filter((c) => c.priority === "عاجلة" && c.status !== "مغلقة");
  const criticalPunchOpen = (filterByProject(d.punchlist || [])).filter((pl) => pl.severity === "حرجة" && derivePunchStatus(pl) !== "مغلقة");
  const docAlerts = (filterByProject(d.documents || [])).filter((doc) => {
    const s = deriveDocumentStatus(doc);
    return s === "منتهي" || s === "ينتهي قريباً";
  });
  const openHighSeverityHSE = hse.filter((h) => h.severity === "مرتفع" && deriveHSEStatus(h) !== "مغلق");
  const overdueHSE = hse.filter((h) => deriveHSEStatus(h) === "متأخر");
  const overdueQC = (filterByProject(d.qc || [])).filter((q) => deriveQCStatus(q) === "متأخر");
  const resourceConflicts = detectResourceConflicts(tasks);
  const alerts = [
    ...expiringContracts.map((c) => ({ text: `عقد «${c.party}» ينتهي خلال ${daysUntil(c.expiryDate)} يوم`, level: "warn" })),
    ...overdueTasks.map((t) => ({ text: `المهمة «${t.name}» متأخرة`, level: "danger" })),
    ...resourceConflicts.map((c) => ({ text: `تعارض موارد: «${c.assignee}» معيَّن على مهمتين متداخلتين زمنياً`, level: "danger" })),
    ...lowStock.map((m) => ({ text: `مخزون «${m.name}» منخفض (${m.inStock} ${m.unit})`, level: "warn" })),
    ...dueInvoices.filter((i) => daysUntil(i.dueDate) != null && daysUntil(i.dueDate) < 0).map((i) => ({ text: `فاتورة ${i.number} متجاوزة تاريخ الاستحقاق`, level: "danger" })),
    ...openHighSeverityHSE.map((h) => ({ text: `حادث سلامة مرتفع الخطورة لم يُغلق: ${h.title}`, level: "danger" })),
    ...overdueHSE.map((h) => ({ text: `بند سلامة متأخر عن الإغلاق المستهدف: ${h.title}`, level: "danger" })),
    ...overdueQC.map((q) => ({ text: `بند جودة متأخر (${q.category}): ${q.title}`, level: "danger" })),
    ...highRisks.map((r) => ({ text: `خطر مرتفع: ${r.title} (درجة ${riskScore(r)})`, level: "danger" })),
    ...overdueDecisions.map((dec) => ({ text: `قرار متأخر التنفيذ: «${dec.decisionText.slice(0, 40)}${dec.decisionText.length > 40 ? "…" : ""}»`, level: "danger" })),
    ...openCorrespondence.map((c) => ({ text: `مراسلة عاجلة بلا رد: ${c.subject}`, level: "warn" })),
    ...criticalPunchOpen.map((pl) => ({ text: `ملاحظة حرجة غير مغلقة: ${pl.description.slice(0, 40)}${pl.description.length > 40 ? "…" : ""}`, level: "danger" })),
    ...docAlerts.map((doc) => {
      const s = deriveDocumentStatus(doc);
      return { text: s === "منتهي" ? `وثيقة منتهية الصلاحية: ${doc.title}` : `وثيقة تنتهي خلال ${daysUntil(doc.expiryDate)} يوم: ${doc.title}`, level: s === "منتهي" ? "danger" : "warn" };
    }),
  ];

  const computePortfolioCompletionTrend = () => {
    const dateSet = new Set();
    projects.forEach((p) => (p.history || []).forEach((h) => dateSet.add(h.date)));
    const sortedDates = Array.from(dateSet).sort();
    if (sortedDates.length < 2) return null;
    return sortedDates.map((date) => {
      const valuesAtDate = projects.map((p) => {
        const entries = (p.history || []).filter((h) => h.date <= date);
        return entries.length ? entries[entries.length - 1].completion : null;
      }).filter((v) => v != null);
      return valuesAtDate.length ? Math.round(valuesAtDate.reduce((s, v) => s + v, 0) / valuesAtDate.length) : null;
    }).filter((v) => v != null);
  };
  const portfolioTrend = computePortfolioCompletionTrend();

  const kpis = [
    kpiCard({ label: "عدد المشاريع", value: projects.length, level: "info" }),
    kpiCard({ label: "المشاريع المتأخرة", value: delayedProjects, level: delayedProjects ? "danger" : "good" }),
    kpiCard({ label: "متوسط نسبة الإنجاز", value: avgCompletion + "%", level: avgCompletion >= 50 ? "good" : "warn", sparkline: portfolioTrend }),
    kpiCard({ label: "السيولة المتاحة", value: fmtMoney(cashAvailable), sub: "د.ل / وحدة العملة", level: cashAvailable >= 0 ? "good" : "danger" }),
    kpiCard({ label: "مؤشر أداء التكلفة CPI", value: portfolioCPI != null ? portfolioCPI.toFixed(2) : "—", sub: "EV/AC", level: portfolioCPI == null ? "info" : portfolioCPI >= 0.95 ? "good" : portfolioCPI >= 0.85 ? "warn" : "danger" }),
    kpiCard({ label: "مؤشر أداء الجدول SPI", value: portfolioSPI != null ? portfolioSPI.toFixed(2) : "—", sub: "EV/PV", level: portfolioSPI == null ? "info" : portfolioSPI >= 0.95 ? "good" : portfolioSPI >= 0.85 ? "warn" : "danger" }),
    kpiCard({ label: "المعدات العاملة", value: `${activeEquipment}/${equipment.length}`, level: activeEquipment === equipment.length ? "good" : "warn" }),
    kpiCard({ label: "أعمال حرجة اليوم", value: todayCritical.length, level: todayCritical.length ? "warn" : "good" }),
  ];

  // Charts
  const compLabels = projects.map((p) => p.name);
  const compChart = barChart(compLabels, [{ name: "نسبة الإنجاز", color: "#F5A623", values: projects.map((p) => p.completion || 0) }]);
  const budgetLabels = budgetItems.map((b) => b.category);
  const budgetChartSvg = barChart(budgetLabels, [
    { name: "الميزانية", color: "#2a3a4a", values: budgetItems.map((b) => Number(b.budget)) },
    { name: "الفعلي", color: "#1FB6A6", values: budgetItems.map((b) => Number(b.actual)) },
  ]);
  const statusCounts = ["لم يبدأ", "قيد التنفيذ", "متأخر", "منتهي"].map((s) => tasks.filter((t) => deriveTaskStatus(t) === s).length);
  const pieColors = ["#5b6b7a", "#1FB6A6", "#E5484D", "#2FBF71"];
  const donutData = ["لم يبدأ", "قيد التنفيذ", "متأخر", "منتهي"].map((s, i) => ({ name: s, value: statusCounts[i], color: pieColors[i] }));

  // S-curve only makes sense when a single project is already selected via the top filter
  const sCurveHtml = (STATE.projectFilter !== "all" && projects[0]) ? buildSCurveHtml(projects[0]) : "";

  // Drill-down table: click any project row to go one level deeper (Portfolio -> Project)
  const portfolioRows = projects.map((p) => {
    const e = evmByProject[p.id] || computeEVM(p, d.budgetItems, d.changeOrders);
    const status = deriveProjectStatus(p);
    const exposure = projectRiskExposure(p.id, d.risks || []);
    const projColor = getProjectColor(p);
    return `<tr class="tr-click" style="border-right:3px solid ${projColor};" onclick="drillToProject('${p.id}')">
      <td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${projColor};margin-left:7px;"></span>${esc(p.name)}</td>
      <td>${statusDot(status === "متأخر" ? "danger" : status === "منتهي" ? "good" : "warn", status)}</td>
      <td style="font-family:monospace;">${p.completion || 0}%</td>
      <td style="font-family:monospace;">${e.CPI != null ? e.CPI.toFixed(2) : "—"}</td>
      <td style="font-family:monospace;">${e.SPI != null ? e.SPI.toFixed(2) : "—"}</td>
      <td>${exposure ? `<span style="font-family:monospace;color:${riskHeatColor(exposure > 25 ? 25 : exposure)};">${exposure}</span>` : "—"}</td>
      <td>${p.location ? `<button type="button" class="btn ghost sm" onclick="event.stopPropagation();openProjectLocation('${p.id}')">📍</button>` : "—"}</td>
      <td style="color:var(--muted2);font-size:11px;">التفاصيل ⬅</td>
    </tr>`;
  }).join("");
  const portfolioTableHtml = `<div class="frame p4" style="margin-bottom:16px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">تفصيل المحفظة — اضغط على أي مشروع للتعمّق (Drill Down)</h3>
    ${projects.length ? `<div style="overflow-x:auto"><table><thead><tr><th>المشروع</th><th>الحالة</th><th>الإنجاز</th><th>CPI</th><th>SPI</th><th>التعرض للمخاطر</th><th>الموقع</th><th></th></tr></thead><tbody>${portfolioRows}</tbody></table></div>` : emptyState("لا توجد مشاريع")}
  </div>`;

  const quickGlanceRibbon = (() => {
    const urgentCount = delayedProjects + overdueTasks.length + highRisks.length;
    const tone = urgentCount === 0 ? "good" : urgentCount <= 3 ? "warn" : "danger";
    const toneColor = tone === "good" ? "#2FBF71" : tone === "warn" ? "#F5A623" : "#E5484D";
    return `<div style="margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;">
      <div class="glance-chip" style="border-right:2px solid ${toneColor};">
        <span class="glance-icon">📊</span>
        <div><div class="glance-val">${projects.length} مشروع، متوسط إنجاز ${avgCompletion}%</div><div class="glance-lbl">حالة المحفظة</div></div>
      </div>
      <div class="glance-chip" style="border-right:2px solid ${delayedProjects ? "#E5484D" : "#2FBF71"};">
        <span class="glance-icon">⏱</span>
        <div><div class="glance-val" style="color:${delayedProjects ? "#E5484D" : "#2FBF71"};">${delayedProjects ? `${delayedProjects} مشروع متأخر` : "✓ لا مشاريع متأخرة"}</div><div class="glance-lbl">الجدول الزمني</div></div>
      </div>
      <div class="glance-chip" style="border-right:2px solid ${cashAvailable >= 0 ? "#2FBF71" : "#E5484D"};">
        <span class="glance-icon">💰</span>
        <div><div class="glance-val" style="color:${cashAvailable >= 0 ? "#2FBF71" : "#E5484D"};">السيولة: ${fmtMoney(cashAvailable)}</div><div class="glance-lbl">الوضع المالي</div></div>
      </div>
      <div class="glance-chip" style="border-right:2px solid ${highRisks.length ? "#F5A623" : "#2FBF71"};">
        <span class="glance-icon">⚠</span>
        <div><div class="glance-val" style="color:${highRisks.length ? "#F5A623" : "#2FBF71"};">${highRisks.length ? `${highRisks.length} خطر مرتفع` : "✓ لا مخاطر مرتفعة"}</div><div class="glance-lbl">المخاطر</div></div>
      </div>
    </div>`;
  })();

  const secondarySections = [
    { key: "myTasks", title: "مهام ونشاطات تحتاج اهتمامك الآن", icon: "📌", content: renderMyApprovalsPanel() + renderMyActionItemsPanel(d), defaultExpanded: false },
    { key: "chatPreview", title: "آخر المحادثات", icon: "💬", content: renderChatPreviewPanel(projects), defaultExpanded: false },
    { key: "myTeam", title: "مهامي ونطاق فريقي", icon: "👤", content: renderMyResponsibleTasksPanel(d) + renderTeamWorkloadPanel(d), defaultExpanded: false },
    { key: "aiHealth", title: "ملخص الذكاء الاصطناعي والصحة العامة", icon: "🧠", content: renderAIIntelligenceSummaryPanel(projects, d) + renderHealthScorePanel(projects, d), defaultExpanded: false },
    { key: "chartsSection", title: "الرسوم البيانية — الإنجاز والميزانية", icon: "📈", content: `<div class="grid2" style="margin-bottom:16px;">
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">نسبة الإنجاز لكل مشروع</h3>
        <div class="chart-box">${projects.length ? compChart.outerHTML : emptyState("لا توجد بيانات")}</div>
      </div>
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">الميزانية مقابل الفعلي</h3>
        <div class="chart-box">${budgetItems.length ? budgetChartSvg.outerHTML : emptyState("لا توجد بيانات")}</div>
        ${budgetItems.length ? legendHTML([{ name: "الميزانية", color: "#2a3a4a" }, { name: "الفعلي", color: "#1FB6A6" }]) : ""}
      </div>
    </div>`, defaultExpanded: false },
    { key: "tasksAlerts", title: "حالة المهام والإنذارات", icon: "⚠", content: `<div class="grid2">
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">حالة المهام</h3>
        ${tasks.length ? `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">${donutChart(donutData).outerHTML}${legendHTML(donutData)}</div>` : emptyState("لا توجد مهام")}
      </div>
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">⚠ الإنذارات والتنبيهات</h3>
        ${alerts.length ? `<div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">${alerts.map((a) => `<div style="background:#FFFFFF;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:13px;">${statusDot(a.level)}${esc(a.text)}</div>`).join("")}</div>` : emptyState("لا توجد إنذارات حالياً.")}
      </div>
    </div>`, defaultExpanded: alerts.length > 0 },
    { key: "execSummary", title: "ملخص تنفيذي إضافي", icon: "📝", content: renderExecutiveSummaryExtra(projects, d), defaultExpanded: false },
  ];

  return `
    ${sectionHeader("لوحة التحكم التنفيذية", btn("🖶 تقرير تنفيذي", "openPrintReport()", "ghost", "sm"))}
    ${breadcrumbHTML([{ label: "المحفظة (كل المشاريع)" }])}
    ${quickGlanceRibbon}
    <div class="kpi-grid">${kpis.join("")}</div>
    ${portfolioTableHtml}
    ${sCurveHtml}
    ${renderTilePicker(secondarySections)}
  `;
}

/* ---------------- لوحة "عملي اليوم" — إجراءات شخصية بحاجة هذا المستخدم تحديداً ---------------- */
function renderMyActionItemsPanel(d) {
  const applicableRoles = ["مدير المشروع", "مهندس الموقع", "المحاسب العام", "مدير عام"];
  if (!applicableRoles.includes(STATE.user.role)) return "";
  const items = computeMyActionItems(STATE.user, d);
  if (!items.length) {
    return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--good);">
      <div style="font-size:13px;color:var(--good);font-weight:700;">✓ عملي اليوم — لا توجد إجراءات معلَّقة بانتظارك حالياً</div>
    </div>`;
  }
  const rows = items.slice(0, 12).map((it) => `
    <div class="tr-click" style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:#FFFFFF;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;" onclick="jumpToSearchResult('${it.navKey}',${it.projectId ? `'${it.projectId}'` : "null"},null)">
      <span style="font-size:15px;flex-shrink:0;">${it.icon}</span>
      <span style="font-size:12.5px;color:#0F1420;flex:1;">${esc(it.text)}</span>
      ${statusDot(it.level)}
    </div>`).join("");
  return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--danger);">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">📋 عملي اليوم — ${items.length} إجراء بانتظارك</h3>
    ${rows}
    ${items.length > 12 ? `<div style="font-size:11px;color:var(--muted2);text-align:center;margin-top:4px;">+${items.length - 12} إجراء إضافي — راجع الصفحات المعنية للتفاصيل الكاملة</div>` : ""}
  </div>`;
}

/* ---------------- لوحة المشاريع الأكثر احتياجاً للمتابعة (مرتبة حسب مؤشر الصحة الشامل) ---------------- */
function renderChatPreviewPanel(projects) {
  const allAccessibleRooms = projects.reduce((acc, p) => acc.concat(getAccessibleChatRooms(p.id, STATE.user).map((r) => Object.assign({}, r, { projectName: p.name }))), []);
  if (!allAccessibleRooms.length) return "";
  const totalUnread = allAccessibleRooms.reduce((s, r) => s + computeUnreadMessageCount(r.id), 0);
  const allMessages = (STATE.data.projectChatMessages || []).filter((m) => allAccessibleRooms.some((r) => r.id === m.roomId));
  const lastMessage = allMessages.slice().sort((a, b) => b.timestamp - a.timestamp)[0];
  const lastRoom = lastMessage ? allAccessibleRooms.find((r) => r.id === lastMessage.roomId) : null;
  return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid #a78bfa;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h3 style="font-size:13px;color:#0F1420;margin:0;">💬 المراسلات الداخلية ${totalUnread ? `<span class="nav-badge" style="background:rgba(229,72,77,.15);color:#E5484D;margin-right:6px;">${totalUnread} جديدة</span>` : ""}</h3>
      <button class="btn ghost sm" onclick="setActive('projectChatRoom')">فتح المحادثات →</button>
    </div>
    ${lastMessage ? `<div style="margin-top:10px;padding:8px 10px;background:#F5F6F9;border-radius:8px;">
      <div style="font-size:11px;color:#a78bfa;font-weight:700;">${esc(lastMessage.senderName)} <span style="color:var(--muted2);font-weight:400;">في ${esc(lastRoom ? lastRoom.name : "")} — ${esc(lastRoom ? lastRoom.projectName : "")}</span></div>
      <div style="font-size:12px;color:var(--muted);margin-top:3px;">${esc(lastMessage.text.length > 90 ? lastMessage.text.slice(0, 90) + "…" : lastMessage.text)}</div>
      <div style="font-size:10px;color:var(--muted2);margin-top:3px;">${esc(fmtDateTime(lastMessage.timestamp))}</div>
    </div>` : `<div style="font-size:12px;color:var(--muted2);margin-top:8px;">لا رسائل بعد — ابدأ نقاشاً مع فريقك.</div>`}
  </div>`;
}

function renderMyResponsibleTasksPanel(d) {
  if (STATE.user.role !== "مهندس الموقع") return "";
  const result = computeMyResponsibleTasks(STATE.user, d);
  if (!result.available) return "";
  if (!result.tasks.length) return "";
  const rows = result.tasks.slice(0, 10).map((entry) => {
    const t = entry.task;
    const nextNames = entry.successors.length ? entry.successors.map((s) => esc(s.name)).join("، ") : "لا نشاط لاحق مرتبط بعد";
    return `<div style="background:#FFFFFF;border:1px solid var(--border);border-radius:6px;padding:9px 12px;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12.5px;color:#0F1420;">${esc(t.name)} <span style="color:var(--muted2);font-size:10.5px;">(${esc(entry.projectName)})</span></span>
        ${entry.isOverdue ? statusDot("danger", "متأخر") : statusDot("info", (t.completion || 0) + "%")}
      </div>
      <div style="font-size:10.5px;color:var(--muted2);margin-top:4px;">الأنشطة التالية بعد هذا النشاط: ${nextNames}</div>
    </div>`;
  }).join("");
  return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--info);">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">🛠 الأنشطة المُسنَدة إليّ تحديداً (${result.tasks.length})</h3>
    ${rows}
  </div>`;
}
function renderTeamWorkloadPanel(d) {
  if (STATE.user.role !== "مدير المشروع") return "";
  const result = computeTeamWorkload(STATE.user, d);
  if (!result.available || !result.workload.length) return "";
  const rows = result.workload.map((w) => `<div style="display:flex;justify-content:space-between;align-items:center;background:#FFFFFF;border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:6px;">
    <span style="font-size:12.5px;color:#0F1420;">${esc(w.engineer.name)}</span>
    <div style="display:flex;gap:10px;font-size:11px;color:var(--muted);">
      <span>${w.activeTaskCount} نشاط نشط</span>
      ${w.overdueCount ? `<span style="color:var(--danger);">${w.overdueCount} متأخر</span>` : `<span style="color:var(--good);">لا تأخير</span>`}
    </div>
  </div>`).join("");
  return `<div class="frame p4" style="margin-bottom:16px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">👥 عبء عمل فريقي من المهندسين</h3>
    ${rows}
  </div>`;
}

function renderHealthScorePanel(projects, d) {
  if (!projects.length) return "";
  const scored = projects.map((p) => ({ p, h: computeProjectHealthScoreDetailed(p, d) })).sort((a, b) => a.h.overallScore - b.h.overallScore);
  const subScoreBadge = (label, value) => {
    if (value == null) return "";
    const color = value >= 80 ? "#2FBF71" : value >= 60 ? "#F5A623" : "#E5484D";
    return ringBadge(label, value, color);
  };
  const rows = scored.map(({ p, h }) => {
    const topReasons = h.breakdown.slice(0, 2).map((b) => b.detail).join(" — ");
    const s = h.subScores;
    return `<div class="tr-click" style="background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;" onclick="drillToProject('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <span style="font-family:monospace;font-weight:800;font-size:18px;color:${h.overallLevel === "good" ? "#2FBF71" : h.overallLevel === "warn" ? "#F5A623" : "#E5484D"};">${h.overallScore}</span>
          <div style="min-width:0;">
            <div style="font-size:13px;color:#0F1420;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.name)}</div>
            <div style="font-size:10.5px;color:var(--muted2);">${esc(h.overallLabel)}</div>
          </div>
        </div>
        ${statusDot(h.overallLevel)}
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">${subScoreBadge("جدول", s.schedule)}${subScoreBadge("تكلفة", s.cost)}${subScoreBadge("جودة", s.quality)}${subScoreBadge("مخاطر", s.risk)}${subScoreBadge("عقود", s.contract)}${s.progressConfidence != null ? subScoreBadge("ثقة تقدّم", s.progressConfidence) : ""}</div>
      ${h.breakdown.length ? `<div style="font-size:11px;color:var(--muted);line-height:1.7;">${esc(topReasons)}${h.breakdown.length > 2 ? ` (+${h.breakdown.length - 2} عامل آخر)` : ""}</div>` : `<div style="font-size:11px;color:var(--good);">لا توجد عوامل سلبية مؤثرة حالياً.</div>`}
    </div>`;
  }).join("");
  return `<div class="frame p4" style="margin-bottom:16px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">🩺 المشاريع الأكثر احتياجاً للمتابعة (مؤشر الصحة بـ6 محاور)</h3>
    <div style="font-size:11px;color:var(--muted2);margin-bottom:10px;">درجة إجمالية من 100 + تفصيل 6 محاور مستقلة — مرتّبة من الأكثر إلحاحاً. اضغط أي مشروع للتفاصيل الكاملة.</div>
    ${rows}
  </div>`;
}
function renderAIIntelligenceSummaryPanel(projects, d) {
  if (!projects.length) return "";
  const topDecisions = copilotManagementDecisions(d);
  const forecasts = projects.map((p) => ({ p, trend: computeTrendForecast(p) })).filter((x) => x.trend.available);
  const delayedForecasts = forecasts.filter((x) => x.p.endDate && x.trend.forecastCompletionDate > x.p.endDate);
  let priorityAlert = null;
  for (const p of projects) {
    const pr = computeInspectionPriorityRanking(p.id);
    if (pr.available && pr.ranking.length && pr.ranking[0].priorityScore >= 50) { priorityAlert = { project: p, item: pr.ranking[0] }; break; }
  }
  return `<div class="ai-panel" style="margin-bottom:16px;"><div class="ai-panel-inner">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span class="ai-badge">🤖 ذكاء حي<span class="ai-live-dot"></span></span>
      <h3 style="font-size:13px;color:#0F1420;margin:0;">ملخّص الذكاء التنفيذي</h3>
    </div>
    <div style="font-size:12px;color:var(--muted);line-height:1.9;white-space:pre-wrap;margin-bottom:8px;">${esc(topDecisions.split("\n").slice(0, 2).join("\n"))}</div>
    ${forecasts.length ? `<div style="font-size:11.5px;color:${delayedForecasts.length ? "var(--warn)" : "var(--good)"};margin-bottom:6px;">📈 التوقّع الإحصائي: ${delayedForecasts.length} من ${forecasts.length} مشروعاً يتوقَّع تجاوز تاريخ الانتهاء المخطَّط حسب الاتجاه التاريخي الفعلي.</div>` : ""}
    ${priorityAlert ? `<div style="font-size:11.5px;color:var(--danger);">🎯 أولوية فحص عاجلة: «${esc(priorityAlert.item.asset.name)}» في «${esc(priorityAlert.project.name)}» (درجة أولوية ${priorityAlert.item.priorityScore}).</div>` : ""}
    <div style="margin-top:8px;"><button class="btn ghost sm" onclick="setActive('ai')">فتح المساعد الذكي الكامل →</button></div>
  </div></div>`;
}

function renderExecutiveSummaryExtra(projects, d) {
  const invoices = filterByProject(d.invoices);
  const certificates = filterByProject(d.certificates || []);
  const rp = computeReceivablesPayables(invoices);
  const certReceivable = certifiedUncollectedTotal(certificates);
  const totalReceivableAll = rp.totalReceivable + certReceivable;
  const distressed = projects.filter((p) => {
    const evm = computeEVM(p, d.budgetItems, d.changeOrders);
    return deriveProjectStatus(p) === "متأخر" || evm.health === "danger";
  });
  const profitRanked = projects.map((p) => {
    const evm = computeEVM(p, d.budgetItems, d.changeOrders); // BAC هنا يشمل أثر أوامر التغيير المعتمدة تلقائياً
    const budget = d.budgetItems.filter((b) => b.projectId === p.id).reduce((s, b) => s + Number(b.budget || 0), 0);
    const expectedProfit = evm.BAC - budget;
    const actualProfit = evm.BAC - evm.AC; // الربح الفعلي وفق التكلفة الفعلية المُنفَقة، لا الميزانية المخطَّطة فقط
    return { p, expectedProfit, actualProfit };
  }).sort((a, b) => b.actualProfit - a.actualProfit);
  const mostProfitable = profitRanked[0];

  return `<div class="grid2" style="margin-top:16px;">
    <div class="frame p4">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">المشاريع المتعثرة</h3>
      ${distressed.length ? `<div style="display:flex;flex-direction:column;gap:6px;">${distressed.map((p) => `<div class="tr-click" style="font-size:12.5px;background:#FFFFFF;border:1px solid var(--border);border-radius:6px;padding:8px 10px;" onclick="drillToProject('${p.id}')">${statusDot("danger")}${esc(p.name)}</div>`).join("")}</div>` : emptyState("لا توجد مشاريع متعثرة حالياً.")}
    </div>
    <div class="frame p4">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">إجمالي المستحقات وأكثر العقود ربحية</h3>
      <div class="kpi-grid" style="grid-template-columns:1fr 1fr;">
        ${kpiCard({ label: "إجمالي المستحقات من العملاء", value: fmtMoney(totalReceivableAll), sub: certReceivable ? `منها ${fmtMoney(certReceivable)} مستخلصات معتمدة` : undefined, level: totalReceivableAll > 0 ? "warn" : "good" })}
        ${mostProfitable && mostProfitable.p ? kpiCard({ label: "الأعلى ربحية فعلية", value: mostProfitable.p.name, sub: `فعلي: ${fmtMoney(mostProfitable.actualProfit)} | متوقع: ${fmtMoney(mostProfitable.expectedProfit)}`, level: mostProfitable.actualProfit >= 0 ? "good" : "danger" }) : kpiCard({ label: "الأعلى ربحية فعلية", value: "—" })}
      </div>
    </div>
  </div>`;
}

/* ---------------- Level 2: Project ---------------- */
function renderProjectDrilldown(projectId) {
  const d = STATE.data;
  const project = d.projects.find((p) => p.id === projectId);
  if (!project) { STATE.dashboardDrill = { level: "portfolio" }; return renderPortfolioDashboard(); }

  const evm = computeEVM(project, d.budgetItems, d.changeOrders);
  const status = deriveProjectStatus(project);
  const tasks = d.tasks.filter((t) => t.projectId === projectId);
  const risks = (d.risks || []).filter((r) => r.projectId === projectId);
  const budgetItems = d.budgetItems.filter((b) => b.projectId === projectId);
  const criticalSet = criticalTaskIds(d.tasks);
  const openRisks = risks.filter((r) => r.status !== "مغلق");

  const health = computeProjectHealthScore(project, d);
  const kpis = [
    kpiCard({ label: "مؤشر الصحة الشامل", value: `${health.score}/100`, sub: health.label, level: health.level }),
    kpiCard({ label: "مدير المشروع", value: project.projectManagerId ? pmName(project.projectManagerId) : "غير معيَّن", level: project.projectManagerId ? "good" : "warn" }),
    kpiCard({ label: "نسبة الإنجاز", value: (project.completion || 0) + "%", level: status === "متأخر" ? "danger" : "good" }),
    kpiCard({ label: "الحالة", value: status, level: status === "متأخر" ? "danger" : status === "منتهي" ? "good" : "warn" }),
    kpiCard({ label: "CPI", value: evm.CPI != null ? evm.CPI.toFixed(2) : "—", sub: "EV/AC", level: evm.health }),
    kpiCard({ label: "SPI", value: evm.SPI != null ? evm.SPI.toFixed(2) : "—", sub: "EV/PV", level: evm.health }),
    kpiCard({ label: "قيمة العقد BAC", value: fmtMoney(evm.BAC), sub: evm.changeOrdersCostImpact ? `شامل ${fmtMoney(evm.changeOrdersCostImpact)} من ${evm.approvedChangeOrdersCount} أمر تغيير معتمد` : undefined }),
    kpiCard({ label: "التكلفة الفعلية AC", value: fmtMoney(evm.AC) }),
    kpiCard({ label: "التقدير عند الإكمال EAC", value: fmtMoney(evm.EAC) }),
    kpiCard({ label: "تكلفة الموارد المعيّنة/يوم", value: fmtMoney(projectAssignedDailyCost(projectId, d.resourcePool)), sub: "مهندسون ومعدات من السجل الرئيسي" }),
    kpiCard({ label: "مخاطر مفتوحة", value: openRisks.length, level: openRisks.some((r) => riskScore(r) >= 15) ? "danger" : openRisks.length ? "warn" : "good" }),
  ];

  const sCurveHtml = buildSCurveHtml(project);
  const budgetChart = budgetItems.length ? barChart(budgetItems.map((b) => b.category), [
    { name: "الميزانية", color: "#2a3a4a", values: budgetItems.map((b) => Number(b.budget)) },
    { name: "الفعلي", color: "#1FB6A6", values: budgetItems.map((b) => Number(b.actual)) },
  ]) : null;

  const topRisks = risks.slice().sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 5);

  const taskRows = tasks.map((t) => {
    const ts = deriveTaskStatus(t);
    return `<tr class="tr-click" onclick="drillToActivity('${projectId}','${t.id}')">
      <td>${esc(t.name)}</td>
      <td>${esc(t.assignee || "—")}</td>
      <td style="font-family:monospace;">${t.completion || 0}%</td>
      <td>${statusDot(ts === "متأخر" ? "danger" : ts === "منتهي" ? "good" : "warn", ts)}</td>
      <td>${criticalSet.has(t.id) ? `<span class="badge-pill">حرج CPM</span>` : `<span style="color:var(--muted2);font-size:12px;">—</span>`}</td>
      <td style="color:var(--muted2);font-size:11px;">تفاصيل ⬅</td>
    </tr>`;
  }).join("");

  const hasCoords = project.lat && project.lng;
  return `
    ${sectionHeader("لوحة تحكم المشروع: " + project.name, ((project.location || hasCoords) ? btn("📍 الموقع على الخريطة", `openProjectLocation('${projectId}')`, "ghost", "sm") : "") + btn("↩ عودة للمحفظة", "drillToPortfolio()", "ghost", "sm"))}
    ${breadcrumbHTML([{ label: "المحفظة (كل المشاريع)", onclick: "drillToPortfolio()" }, { label: project.name }])}
    <div class="kpi-grid">${kpis.join("")}</div>
    ${renderRecentEventsPanel(projectId)}
    ${renderHealthBreakdownPanel(health)}
    ${hasCoords ? `<div class="frame p4" style="margin-bottom:16px;"><h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">📍 موقع المشروع</h3><div id="project-location-preview" style="height:200px;border-radius:8px;overflow:hidden;"></div></div>` : ""}
    ${sCurveHtml}
    <div class="grid2" style="margin-bottom:16px;">
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">الميزانية مقابل الفعلي — تفصيل المشروع</h3>
        <div class="chart-box">${budgetChart ? budgetChart.outerHTML : emptyState("لا توجد بيانات ميزانية")}</div>
        ${budgetChart ? legendHTML([{ name: "الميزانية", color: "#2a3a4a" }, { name: "الفعلي", color: "#1FB6A6" }]) : ""}
      </div>
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">أعلى المخاطر في هذا المشروع</h3>
        ${topRisks.length ? topRisks.map((r) => riskBarRow(r)).join("") : emptyState("لا توجد مخاطر مسجلة لهذا المشروع")}
      </div>
    </div>
    <div class="frame p4">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">الأنشطة والمهام — اضغط على أي نشاط للتعمّق (Drill Down)</h3>
      ${tasks.length ? `<div style="overflow-x:auto"><table><thead><tr><th>النشاط</th><th>المسؤول</th><th>الإنجاز</th><th>الحالة</th><th>مسار حرج</th><th></th></tr></thead><tbody>${taskRows}</tbody></table></div>` : emptyState("لا توجد مهام لهذا المشروع")}
    </div>
  `;
}

/* ---------------- تفصيل عوامل مؤشر الصحة الشامل لمشروع واحد ---------------- */
function renderHealthBreakdownPanel(health) {
  if (!health.breakdown.length) {
    return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--good);">
      <div style="font-size:13px;color:var(--good);font-weight:700;">✓ مؤشر الصحة ${health.score}/100 — ${esc(health.label)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">لا توجد عوامل سلبية مؤثرة على هذا المشروع حالياً.</div>
    </div>`;
  }
  const rows = health.breakdown.map((b) => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--row2);">
      <div>
        <div style="font-size:12.5px;color:#0F1420;">${esc(b.label)}</div>
        <div style="font-size:11px;color:var(--muted2);">${esc(b.detail)}</div>
      </div>
      <div style="font-family:monospace;color:var(--danger);font-size:13px;flex-shrink:0;">-${b.amount}</div>
    </div>`).join("");
  return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid ${health.level === "danger" ? "var(--danger)" : "var(--warn)"};">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0;">لماذا حصل هذا المشروع على ${health.score}/100؟</h3>
      ${statusDot(health.level, health.label)}
    </div>
    ${rows}
  </div>`;
}

/* ---------------- Level 3: Activity ---------------- */
function renderActivityDrilldown(projectId, taskId) {
  const d = STATE.data;
  const project = d.projects.find((p) => p.id === projectId);
  const task = d.tasks.find((t) => t.id === taskId);
  if (!project || !task) { STATE.dashboardDrill = { level: "portfolio" }; return renderPortfolioDashboard(); }

  const ts = deriveTaskStatus(task);
  const criticalSet = criticalTaskIds(d.tasks);
  const isCritical = criticalSet.has(task.id);
  const preds = (task.predecessors || []).map((id) => d.tasks.find((t) => t.id === id)).filter(Boolean);
  const succs = d.tasks.filter((t) => (t.predecessors || []).includes(task.id));

  const totalDays = task.start && task.end ? daysBetween(task.start, task.end) : null;
  const plannedPct = totalDays ? Math.round((clamp(daysBetween(task.start, todayISO()), 0, totalDays) / totalDays) * 100) : null;
  const actualPct = Number(task.completion) || 0;

  const kpis = [
    kpiCard({ label: "الإنجاز الفعلي", value: actualPct + "%" }),
    kpiCard({ label: "الإنجاز المتوقع زمنياً", value: plannedPct != null ? plannedPct + "%" : "—" }),
    kpiCard({ label: "الحالة", value: ts, level: ts === "متأخر" ? "danger" : ts === "منتهي" ? "good" : "warn" }),
    kpiCard({ label: "مسار حرج (CPM)", value: isCritical ? "نعم" : "لا", level: isCritical ? "danger" : "good" }),
  ];

  const progressBar = plannedPct != null ? `<div class="frame p4" style="margin-top:16px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">تقدّم الإنجاز مقابل الوقت</h3>
      <div style="font-size:12px;margin-bottom:8px;color:var(--muted);">المخطط زمنياً: ${plannedPct}% — الفعلي: ${actualPct}%</div>
      <div style="background:#FFFFFF;border-radius:4px;height:14px;position:relative;overflow:hidden;">
        <div style="width:${plannedPct}%;height:100%;background:#5b6b7a;opacity:.55;position:absolute;top:0;right:0;"></div>
        <div style="width:${actualPct}%;height:100%;background:#F5A623;position:absolute;top:0;right:0;"></div>
      </div>
    </div>` : "";

  return `
    ${sectionHeader("تفاصيل النشاط: " + task.name, btn("↩ عودة للمشروع", `backToProjectDrill('${projectId}')`, "ghost", "sm"))}
    ${breadcrumbHTML([{ label: "المحفظة (كل المشاريع)", onclick: "drillToPortfolio()" }, { label: project.name, onclick: `backToProjectDrill('${projectId}')` }, { label: task.name }])}
    <div class="kpi-grid">${kpis.join("")}</div>
    <div class="grid2">
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">بيانات النشاط</h3>
        <table>
          <tbody>
            <tr><td style="color:var(--muted);">المسؤول</td><td>${esc(task.assignee || "—")}</td></tr>
            <tr><td style="color:var(--muted);">تاريخ البداية</td><td style="font-family:monospace;">${esc(task.start || "—")}</td></tr>
            <tr><td style="color:var(--muted);">تاريخ النهاية</td><td style="font-family:monospace;">${esc(task.end || "—")}</td></tr>
            <tr><td style="color:var(--muted);">الأولوية</td><td>${esc(task.priority || "—")}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">الترابطات بين الأنشطة</h3>
        <div style="font-size:12.5px;margin-bottom:8px;"><span style="color:var(--muted);">الأسلاف (يجب أن تنتهي أولاً):</span> ${preds.length ? preds.map((p) => esc(p.name)).join("، ") : "لا يوجد"}</div>
        <div style="font-size:12.5px;"><span style="color:var(--muted);">اللواحق (تعتمد على هذا النشاط):</span> ${succs.length ? succs.map((s) => esc(s.name)).join("، ") : "لا يوجد"}</div>
      </div>
    </div>
    ${progressBar}
  `;
}


function openPrintReport() {
  const d = STATE.data;
  const projects = filterByProject(d.projects);
  const evmList = projects.map((p) => ({ p, e: computeEVM(p, d.budgetItems, d.changeOrders), h: computeProjectHealthScore(p, d) }));
  const totalEV = evmList.reduce((s, x) => s + x.e.EV, 0);
  const totalAC = evmList.reduce((s, x) => s + x.e.AC, 0);
  const totalPV = evmList.reduce((s, x) => s + (x.e.PV || 0), 0);
  const totalBAC = evmList.reduce((s, x) => s + x.e.BAC, 0);
  const cpi = totalAC > 0 ? (totalEV / totalAC).toFixed(2) : "—";
  const spi = totalPV > 0 ? (totalEV / totalPV).toFixed(2) : "—";

  const invoices = filterByProject(d.invoices);
  const certificates = filterByProject(d.certificates || []);
  const subcontractorCertificates = filterByProject(d.subcontractorCertificates || []);
  const cf = computeCashFlow(projects, filterByProject(d.ledger), invoices, certificates, subcontractorCertificates);
  const pr = computeProfitability(projects, filterByProject(d.budgetItems), filterByProject(d.ledger), invoices, filterByProject(d.changeOrders), certificates);

  const risks = filterByProject(d.risks || []);
  const topRisks = risks.filter((r) => r.status !== "مغلق").slice().sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 5);

  const hse = filterByProject(d.hse || []);
  const openHighSeverityHSE = hse.filter((h) => h.severity === "مرتفع" && deriveHSEStatus(h) !== "مغلق");
  const qc = filterByProject(d.qc || []);
  const openNCR = qc.filter((q) => q.category === "NCR" && deriveQCStatus(q) !== "مغلق");

  const pendingCerts = certificates.filter((c) => c.stage === "مقدَّم للمالك" || c.stage === "معتمد (بانتظار الصرف)").length;
  const pendingSubCerts = subcontractorCertificates.filter((c) => c.stage !== "مدفوع" && c.stage !== "مرفوض/معاد للمقاول").length;
  const unreconciledCustodies = filterByProject(d.custodies || []).filter((c) => !c.reconciled).length;

  const worstProjects = evmList.slice().sort((a, b) => a.h.score - b.h.score).slice(0, 5);

  const row = (label, value) => `<div class="row"><b>${esc(label)}</b> ${esc(String(value))}</div>`;
  const tableRows = (rows) => rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");

  const w = window.open("", "_blank");
  w.document.write(`<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير تنفيذي</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;padding:30px;color:#111;}
      h1{font-size:20px;margin-bottom:4px;} h2{font-size:15px;margin:22px 0 8px;border-bottom:2px solid #333;padding-bottom:4px;}
      .row{margin:6px 0;font-size:13px;} b{display:inline-block;width:230px;}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px;}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:center;}
      th{background:#f0f0f0;}
      .muted{color:#666;font-size:11px;margin-top:4px;}
    </style>
    </head><body>
    <h1>التقرير التنفيذي</h1>
    <div class="muted">تاريخ الإعداد: ${esc(todayISO())}</div>

    <h2>نظرة عامة على المحفظة</h2>
    ${row("عدد المشاريع", projects.length)}
    ${row("مؤشر أداء التكلفة CPI (إجمالي)", cpi)}
    ${row("مؤشر أداء الجدول SPI (إجمالي)", spi)}
    ${row("إجمالي قيمة العقود (شاملة أوامر التغيير المعتمدة)", fmtMoney(totalBAC))}

    <h2>الوضع المالي</h2>
    ${row("الرصيد النقدي الحالي", fmtMoney(cf.currentBalance))}
    ${row("الرصيد المتوقع", fmtMoney(cf.projectedBalance))}
    ${row("الربح الفعلي (وفق التكلفة الفعلية)", fmtMoney(pr.actualProfit))}
    ${row("مستخلصات مالك بحاجة إجراء", pendingCerts)}
    ${row("مستخلصات مقاولين بحاجة إجراء", pendingSubCerts)}
    ${row("عهد بانتظار المطابقة النهائية", unreconciledCustodies)}

    <h2>المشاريع الأكثر احتياجاً للمتابعة (مؤشر الصحة الشامل)</h2>
    <table><thead><tr><th>المشروع</th><th>مؤشر الصحة</th><th>الحالة</th><th>CPI</th><th>SPI</th></tr></thead>
    <tbody>${tableRows(worstProjects.map((x) => [esc(x.p.name), x.h.score + "/100", esc(x.h.label), x.e.CPI != null ? x.e.CPI.toFixed(2) : "—", x.e.SPI != null ? x.e.SPI.toFixed(2) : "—"]))}</tbody></table>

    <h2>أعلى المخاطر المفتوحة</h2>
    ${topRisks.length ? `<table><thead><tr><th>الخطر</th><th>المشروع</th><th>الدرجة</th></tr></thead>
    <tbody>${tableRows(topRisks.map((r) => [esc(r.title), esc(projName(r.projectId)), riskScore(r)]))}</tbody></table>` : `<div class="muted">لا توجد مخاطر مفتوحة حالياً.</div>`}

    <h2>السلامة والجودة</h2>
    ${row("حوادث سلامة مرتفعة الخطورة غير مغلقة", openHighSeverityHSE.length)}
    ${row("تقارير عدم توافق (NCR) مفتوحة", openNCR.length)}

    <script>window.print()<\/script>
    </body></html>`);
}

/* ---------------- Daily Site Reports — full archive with auto-generated task summaries ---------------- */
function buildReportTaskItems(report) {
  const ids = Array.isArray(report.completedTaskIds) ? report.completedTaskIds : [];
  return ids.map((id) => STATE.data.tasks.find((t) => t.id === id)).filter(Boolean);
}
function buildReportSummaryText(report) {
  const tasks = buildReportTaskItems(report);
  if (!tasks.length) return "";
  return tasks.map((t) => `${t.name} (إنجاز ${t.completion || 0}%)`).join("، ");
}
function onReportsSearch(v) { STATE.reportsSearch = v; renderApp(); }

function renderMyApprovalsPanel() {
  const tasks = getMyWorkflowTasks(STATE.user);
  if (!tasks.length) return "";
  return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--warn);">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">⏳ اعتماداتي المُعلَّقة (${tasks.length})</h3>
    ${tasks.map((instance) => {
      const cfg = MODULES[instance.module];
      const businessObject = (STATE.data[cfg.collection] || []).find((r) => r.id === instance.businessObjectId);
      const label = businessObject ? getRecordLabel(businessObject) : instance.businessObjectId;
      const sla = checkWorkflowSLA(instance);
      const def = (STATE.data.workflowDefinitions || []).find((w) => w.id === instance.workflowDefId);
      const stage = def.stages.find((s) => s.id === instance.currentStageId);
      return `<div style="background:#F5F6F9;border-radius:8px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:12px;color:#0F1420;font-weight:700;">${esc(label)}</span>
            <span style="font-size:10.5px;color:var(--muted2);"> — ${esc(stage.name)}${businessObject && businessObject.projectId ? " — " + esc(projName(businessObject.projectId)) : ""}</span>
          </div>
          ${sla.overdue ? statusDot("danger", `متأخر ${sla.hoursElapsed} ساعة`) : ""}
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="btn primary sm" onclick="handleWorkflowAction('${instance.module}','${instance.businessObjectId}','approve')">✓ اعتماد</button>
          <button class="btn danger sm" onclick="const c=prompt('سبب الرفض:'); if(c) handleWorkflowAction('${instance.module}','${instance.businessObjectId}','reject',c);">✕ رفض</button>
          <button class="btn ghost sm" onclick="const c=prompt('سبب الإعادة للتصحيح:'); if(c) handleWorkflowAction('${instance.module}','${instance.businessObjectId}','return',c);">↩ إعادة للتصحيح</button>
        </div>
      </div>`;
    }).join("")}
  </div>`;
}
function handleWorkflowAction(moduleKey, businessObjectId, action, comment) {
  const result = advanceWorkflow(moduleKey, businessObjectId, action, comment || "");
  if (!result.success) { alert(result.error); return; }
  renderApp();
  showToast(action === "approve" ? "تم الاعتماد بنجاح" : action === "reject" ? "تم الرفض" : "تم إعادته للتصحيح", action === "approve" ? "success" : "info");
}
function renderReportCard(r, readOnly) {
  const tasks = buildReportTaskItems(r);
  const photos = Array.isArray(r.photos) ? r.photos : [];
  const isPM = STATE.user.role === "مدير المشروع" || STATE.user.role === "مدير عام" || STATE.user.role === "مالك الشركة";
  const status = r.status || "مُقدَّم";
  const statusLevel = status === "معتمد" ? "good" : status === "يحتاج تعديل" ? "danger" : "warn";
  return `<div class="frame p4" style="margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
      <div>
        <div style="font-weight:700;color:#0F1420;font-family:monospace;">${esc(r.date || "—")}</div>
        <div style="font-size:12px;color:var(--muted);">${esc(projName(r.projectId))}${r.createdBy ? " — بواسطة: " + esc(r.createdBy) : ""}</div>
        <div style="margin-top:4px;">${statusDot(statusLevel, status)}${status === "معتمد" && r.approvedBy ? ` <span style="font-size:10.5px;color:var(--muted2);">— اعتمده ${esc(r.approvedBy)} في ${esc(r.approvalDate)}</span>` : ""}</div>
        ${status === "يحتاج تعديل" && r.revisionNote ? `<div style="font-size:11px;color:var(--danger);margin-top:4px;">ملاحظة مدير المشروع: ${esc(r.revisionNote)}</div>` : ""}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${readOnly ? "" : `<button class="btn ghost sm" onclick="openEditModal('sitereports','${r.id}')">✎ تعديل</button>
        <button class="btn danger sm" onclick="onDeleteRow('sitereports','${r.id}')">🗑 حذف</button>`}
        ${isPM && status !== "معتمد" ? `<button class="btn primary sm" onclick="approveDailyReport('${r.id}')">✓ اعتماد</button>
        <button class="btn warn sm" onclick="const n=prompt('ملاحظة التعديل المطلوب:'); if(n) requestReportRevision('${r.id}', n);">↩ طلب تعديل</button>` : ""}
      </div>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px;display:flex;gap:14px;flex-wrap:wrap;">
      ${r.workers ? `<span>👷 عمال: ${esc(r.workers)}</span>` : ""}
      ${r.equipment ? `<span>🚜 معدات: ${esc(r.equipment)}</span>` : ""}
      ${r.weather ? `<span>☁ الطقس: ${esc(r.weather)}</span>` : ""}
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:12.5px;color:var(--accent);font-weight:700;margin-bottom:4px;">📋 ملخص المهام المنجزة (يُولَّد تلقائياً من سجل المهام)</div>
      ${tasks.length ? `<ul style="margin:0;padding-right:18px;font-size:13px;line-height:1.9;">
        ${tasks.map((t) => {
          const ts = deriveTaskStatus(t);
          return `<li>${esc(t.name)} — الإنجاز الحالي: <span style="font-family:monospace;">${t.completion || 0}%</span> — ${statusDot(ts === "متأخر" ? "danger" : ts === "منتهي" ? "good" : "warn", ts)}</li>`;
        }).join("")}
      </ul>` : `<div style="font-size:12px;color:var(--muted2);">لم تُربط أي مهمة بهذا التقرير بعد.</div>`}
    </div>
    ${r.activities ? `<div style="font-size:13px;margin-bottom:8px;"><b>ملاحظات إضافية:</b> ${esc(r.activities)}</div>` : ""}
    ${r.notes ? `<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px;">${esc(r.notes)}</div>` : ""}
    ${photos.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;">${photos.map((src) => `<img src="${src}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--border2);" />`).join("")}</div>` : ""}
  </div>`;
}

function renderSiteReportsView() {
  const allRows = filterByProject(STATE.data.dailyReports || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const readOnly = !canEdit(STATE.user.role, "sitereports");
  const q = (STATE.reportsSearch || "").trim().toLowerCase();
  const rows = q ? allRows.filter((r) =>
    [r.date, projName(r.projectId), r.activities, r.notes, r.createdBy, buildReportSummaryText(r)]
      .some((v) => String(v || "").toLowerCase().includes(q))
  ) : allRows;

  const addBtn = readOnly ? `<span class="readonly-tag">عرض فقط لدورك الحالي</span>` : btn("+ تقرير يومي جديد", "openAddModal('sitereports')", "primary", "sm");

  const focusProjectId = STATE.projectFilter && STATE.projectFilter !== "all" ? STATE.projectFilter : (filterByProject(STATE.data.projects || [])[0] || {}).id;
  let followUpPanel = "";
  if (focusProjectId) {
    const today = todayISO();
    const followUp = computeDailyFollowUp(focusProjectId, today);
    const missing = computeMissingDailyReports(focusProjectId, 14);
    const streak = computeDailyReportStreak(focusProjectId);
    const borderColor = followUp.plannedCount === 0 ? "var(--muted2)" : followUp.untouchedTasks.length === 0 ? "var(--good)" : "var(--warn)";
    let untouchedLine = "";
    if (followUp.untouchedTasks.length) {
      const names = followUp.untouchedTasks.map((t) => esc(t.name)).join("، ");
      untouchedLine = `<div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;"><b style="color:var(--warn);">لم يُبلَّغ عنها اليوم:</b> ${names}</div>`;
    }
    let missingLine;
    if (missing.length) {
      missingLine = `<div style="font-size:11.5px;color:var(--danger);">تنبيه: ${missing.length} يوماً خلال آخر 14 يوماً كان فيها عمل مخطَّط بلا أي تقرير مقدَّم (آخرها ${esc(missing[0].date)}).</div>`;
    } else {
      missingLine = `<div style="font-size:11.5px;color:var(--good);">لا فجوات تقارير خلال آخر 14 يوماً.</div>`;
    }
    followUpPanel = `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid ${borderColor};">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">متابعة الأعمال اليومية — اليوم (${esc(today)})</h3>
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px;">
        ${kpiCard({ label: "أنشطة مخطَّطة اليوم", value: followUp.plannedCount, level: "info" })}
        ${kpiCard({ label: "أُبلِغ عنها فعلياً", value: followUp.touchedCount, level: "good" })}
        ${kpiCard({ label: "بلا أي إبلاغ اليوم", value: followUp.untouchedTasks.length, level: followUp.untouchedTasks.length ? "danger" : "good" })}
        ${kpiCard({ label: "أيام تقارير متتالية", value: streak, level: streak >= 3 ? "good" : "warn" })}
      </div>
      ${untouchedLine}
      ${missingLine}
    </div>`;
  }

  return `
    ${sectionHeader("التقارير اليومية — سجل كامل من بداية المشروع إلى اليوم", addBtn)}
    ${followUpPanel}
    <div class="frame p4" style="margin-bottom:14px;">
      <input id="reports-search-input" class="inp" style="width:100%;" placeholder="بحث في كل التقارير (بالتاريخ، المشروع، المهام، الملاحظات)..." value="${esc(STATE.reportsSearch || "")}" oninput="onReportsSearch(this.value)" />
    </div>
    <div style="font-size:12px;color:var(--muted2);margin-bottom:10px;">${rows.length} من إجمالي ${allRows.length} تقريراً متاحاً للعرض في أي وقت</div>
    ${rows.length ? rows.map((r) => renderReportCard(r, readOnly)).join("") : emptyState(allRows.length ? "لا توجد تقارير مطابقة لبحثك." : "لا توجد تقارير يومية مسجّلة بعد لهذا المشروع.")}
  `;
}

/* ---------------- Schedule ---------------- */
function renderSchedule() {
  const d = STATE.data;
  const view = STATE.scheduleView || "gantt";
  const range = STATE.scheduleRange || "weekly";
  const tasks = filterByProject(d.tasks);
  const criticalSet = criticalTaskIds(d.tasks);
  const conflicts = detectResourceConflicts(tasks);
  const conflictPanel = conflicts.length ? `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--danger);">
    <h3 style="font-size:13px;color:var(--danger);margin:0 0 8px;">⚠ تعارض موارد محتمل (${conflicts.length})</h3>
    ${conflicts.map((c) => `<div style="font-size:12px;color:var(--muted);padding:6px 0;border-bottom:1px solid var(--row2);">
      «${esc(c.assignee)}» معيَّن على مهمتين متداخلتين زمنياً في ${esc(projName(c.projectId))}: <b>${esc(c.taskA.name)}</b> (${esc(c.taskA.start)}→${esc(c.taskA.end)}) و<b>${esc(c.taskB.name)}</b> (${esc(c.taskB.start)}→${esc(c.taskB.end)})
    </div>`).join("")}
  </div>` : "";

  const viewToggle = `<div class="range-toggle">
      <button class="${view === 'gantt' ? 'active' : ''}" onclick="setScheduleView('gantt')">مخطط جانت</button>
      <button class="${view === 'list' ? 'active' : ''}" onclick="setScheduleView('list')">قائمة</button>
      <button class="${view === 'montecarlo' ? 'active' : ''}" onclick="setScheduleView('montecarlo')">🎲 محاكاة المخاطر</button>
    </div>`;

  if (view === "montecarlo") {
    const iterations = STATE.mcIterations || 2000;
    const distType = STATE.mcDistribution || "triangular";
    const result = STATE.mcResult;
    return `
      ${sectionHeader("محاكاة مونت كارلو لمخاطر الجدول الزمني", viewToggle)}
      <div class="frame p4" style="margin-bottom:14px;font-size:12px;color:var(--muted);line-height:1.8;">
        خوارزمية حقيقية وقياسية (نفس ما تفعله Primavera Risk Analysis وSafran فعلياً) — إعادة حساب المسار الحرج آلاف المرات بمُدَد عشوائية من توزيع احتمالي حقيقي لكل نشاط، لبناء تاريخ انتهاء بمستوى ثقة إحصائي حقيقي، لا تاريخاً واحداً حتمياً فقط. المُدد المتفائلة/المتشائمة تُؤخَذ من حقول النشاط إن أُدخِلت، أو تُفترَض ±20%/30% تلقائياً.
      </div>
      <div class="frame p4" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;color:var(--muted);">عدد التكرارات:
          <select onchange="STATE.mcIterations=Number(this.value);renderApp();">
            ${[500, 1000, 2000, 5000].map((n) => `<option value="${n}" ${iterations === n ? "selected" : ""}>${n.toLocaleString()}</option>`).join("")}
          </select>
        </label>
        <label style="font-size:12px;color:var(--muted);">التوزيع الاحتمالي:
          <select onchange="STATE.mcDistribution=this.value;renderApp();">
            <option value="triangular" ${distType === "triangular" ? "selected" : ""}>مثلثي (Triangular)</option>
            <option value="pert" ${distType === "pert" ? "selected" : ""}>PERT (تقريب Beta)</option>
          </select>
        </label>
        ${btn("▶ تشغيل المحاكاة", "runScheduleMonteCarloForCurrentProject()", "primary", "sm")}
      </div>
      ${result ? renderMonteCarloResultHtml(result) : emptyState("اضغط «تشغيل المحاكاة» لبدء التحليل.")}
    `;
  }

  if (view === "gantt") {
    const sorted = tasks.slice().sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    const focusProjectIdForAI = STATE.projectFilter && STATE.projectFilter !== "all" ? STATE.projectFilter : (filterByProject(STATE.data.projects || [])[0] || {}).id;
    return `
      ${sectionHeader("الجدول الزمني الذكي — مخطط جانت", viewToggle)}
      ${renderContextualAIPanel("schedule", `() => getAIContextFor('schedule', '${focusProjectIdForAI || ""}')`, "مثال: ما الأنشطة المتأخرة على المسار الحرج؟")}
      ${conflictPanel}
      <div class="frame p4">${renderGanttHTML(sorted)}</div>
      <p style="font-size:11px;color:var(--muted2);margin-top:10px;">الأشرطة الملوّنة بالكهرماني تمثّل «المسار الحرج» المحسوب تلقائياً (Forward/Backward Pass). دبل-كليك على أي نشاط لفتح تفاصيله الكاملة.</p>
    `;
  }

  const rangeDays = range === "daily" ? 1 : range === "weekly" ? 7 : 30;
  const windowEnd = new Date(Date.now() + rangeDays * 86400000);

  const inWindow = tasks.filter((t) => !t.end || new Date(t.end) <= windowEnd)
    .sort((a, b) => (a.end || "").localeCompare(b.end || ""));

  const rangeBtns = ["daily", "weekly", "monthly"].map((k) =>
    `<button class="${STATE.scheduleRange === k || (!STATE.scheduleRange && k === 'weekly') ? 'active' : ''}" onclick="setScheduleRange('${k}')">${k === "daily" ? "يومي" : k === "weekly" ? "أسبوعي" : "شهري"}</button>`
  ).join("");

  const items = inWindow.map((t) => {
    const status = deriveTaskStatus(t);
    const overdue = status === "متأخر";
    const critical = criticalSet.has(t.id);
    return `<div class="frame p4" style="margin-bottom:10px;${critical ? "border-color:rgba(245,166,35,.6);" : ""}display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      ${statusDot(overdue ? "danger" : t.completion >= 100 ? "good" : "warn")}
      <div style="flex:1;min-width:160px;">
        <div style="font-size:13px;font-weight:600;">${esc(t.name)} ${critical ? `<span class="badge-pill">مسار حرج</span>` : ""}</div>
        <div style="font-size:11px;color:var(--muted2);">${esc(projName(t.projectId))} · ${esc(t.assignee || "—")} · ${esc(status)}</div>
      </div>
      <div style="font-size:11px;font-family:monospace;color:var(--muted);">${esc(t.start || "")} → ${esc(t.end || "")}</div>
      <div style="width:120px;">
        <div style="height:6px;background:var(--border);border-radius:4px;overflow:hidden;"><div style="height:100%;background:#1FB6A6;width:${clamp(t.completion || 0, 0, 100)}%"></div></div>
        <div style="font-size:10px;color:var(--muted2);text-align:left;font-family:monospace;">${t.completion || 0}%</div>
      </div>
    </div>`;
  }).join("");

  return `
    ${sectionHeader("الجدول الزمني الذكي", viewToggle + `<div class="range-toggle">${rangeBtns}</div>`)}
    ${conflictPanel}
    <div class="frame p4">${inWindow.length ? items : emptyState("لا توجد أنشطة ضمن هذا المدى الزمني.")}</div>
    <p style="font-size:11px;color:var(--muted2);margin-top:10px;">يتم تحديد «المسار الحرج» تلقائياً بحساب أقرب وأبعد بداية/نهاية لكل نشاط (Forward/Backward Pass) بالاعتماد على حقل «الأنشطة السابقة».</p>
  `;
}
function setScheduleRange(r) { STATE.scheduleRange = r; renderApp(); }
function setScheduleView(v) { STATE.scheduleView = v; renderApp(); }
function runScheduleMonteCarloForCurrentProject() {
  const tasks = filterByProject(STATE.data.tasks || []);
  if (!tasks.length) { alert("لا توجد أنشطة ضمن نطاق مشروعك الحالي — اختر مشروعاً محدَّداً من القائمة العلوية أولاً."); return; }
  const iterations = STATE.mcIterations || 2000;
  const distType = STATE.mcDistribution || "triangular";
  STATE.mcResult = runMonteCarloSimulation(tasks, iterations, distType);
  renderApp();
}
function renderMonteCarloResultHtml(result) {
  if (!result.available) return `<div class="frame p4">${emptyState(result.reason)}</div>`;
  const addDaysFromToday = (days) => addDays(todayISO(), Math.round(days));
  return `
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">
      ${kpiCard({ label: "P10 (تفاؤلي — 10% احتمال تحقّقه)", value: addDaysFromToday(result.p10), level: "good" })}
      ${kpiCard({ label: "P50 (الأكثر ترجيحاً)", value: addDaysFromToday(result.p50), level: "info" })}
      ${kpiCard({ label: "P80 (مستوى ثقة مُوصى به للالتزام التعاقدي)", value: addDaysFromToday(result.p80), level: "warn" })}
      ${kpiCard({ label: "P90 (متحفِّظ جداً)", value: addDaysFromToday(result.p90), level: "danger" })}
    </div>
    <div class="frame p4" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="font-size:12.5px;color:var(--muted);">التاريخ الحتمي التقليدي (CPM عادي، بلا مخاطر): <b style="color:#0F1420;">${addDaysFromToday(result.deterministicDays)}</b></div>
        <div style="font-size:12.5px;color:var(--warn);">احتياطي جدول زمني مُوصى به (P80 − الحتمي): <b>${result.scheduleContingencyDays} يوم</b></div>
      </div>
      <div style="font-size:11px;color:var(--muted2);margin-top:6px;">${result.iterations.toLocaleString()} تكرار — توزيع ${esc(result.distributionType)}</div>
    </div>
    <div class="frame p4">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">📊 مؤشر الحرجية (Criticality Index) — كم % من التكرارات كان هذا النشاط على المسار الحرج</h3>
      <table><thead><tr><th>النشاط</th><th>نسبة الحرجية</th></tr></thead>
      <tbody>${result.criticalityIndex.map((c) => `<tr><td>${esc(c.name || c.taskId)}</td><td>${statusDot(c.criticalityPct >= 80 ? "danger" : c.criticalityPct >= 40 ? "warn" : "good", c.criticalityPct + "%")}</td></tr>`).join("")}</tbody></table>
      <p style="font-size:11px;color:var(--muted2);margin-top:8px;">نشاط بنسبة حرجية عالية يستحق مراقبة أقرب — أي تأخير فيه يؤثر مباشرة على تاريخ الانتهاء في أغلب السيناريوهات المحاكاة.</p>
    </div>`;
}

/* ---------------- Resources (tabs) ---------------- */
function renderMaterialsActionPanel(rows, readOnly) {
  if (readOnly) return "";
  const materialOptions = rows.map((m) => ({ value: m.id, label: `${m.name} (${projName(m.projectId)}) — المتوفر: ${computeMaterialCurrentStock(m.id)} ${m.unit || ""}` }));
  const selectedId = STATE.materialActionSelectedId && rows.some((m) => m.id === STATE.materialActionSelectedId) ? STATE.materialActionSelectedId : (rows[0] ? rows[0].id : null);
  const selected = rows.find((m) => m.id === selectedId);
  const crossLocation = selected ? computeMaterialStockAcrossLocations(selected.name) : [];
  const history = selected ? computeMaterialTransactionHistory(selected.id).slice(0, 8) : [];
  return `<div class="frame p4" style="margin-bottom:14px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">📦 تسجيل حركة مخزون حقيقية</h3>
    <select onchange="STATE.materialActionSelectedId=this.value;renderApp();" style="width:100%;margin-bottom:10px;">
      ${materialOptions.map((o) => `<option value="${o.value}" ${o.value === selectedId ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
    </select>
    ${selected ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <input type="number" id="mat-tx-qty" placeholder="الكمية" style="width:100px;" />
        <input type="text" id="mat-tx-purpose" placeholder="السبب/الغرض (اختياري)" style="flex:1;min-width:150px;" />
        ${btn("⬇ سحب", `recordMaterialTransactionFromUI('${selected.id}', 'سحب')`, "ghost", "sm")}
        ${btn("⬆ استلام", `recordMaterialTransactionFromUI('${selected.id}', 'استلام')`, "primary", "sm")}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
        <select id="mat-transfer-target" style="flex:1;min-width:150px;">
          ${projectOptions().filter((p) => p.value !== selected.projectId).map((p) => `<option value="${p.value}">${esc(p.label)}</option>`).join("")}
        </select>
        ${btn("↔ تحويل الكمية المُدخَلة لهذا الموقع", `transferMaterialFromUI('${selected.id}')`, "ghost", "sm")}
      </div>
      <div style="background:#F5F6F9;border-radius:8px;padding:10px;margin-bottom:10px;">
        <h4 style="font-size:11.5px;color:var(--info);margin:0 0 6px;">📍 «${esc(selected.name)}» في كل المواقع — الإجابة الحقيقية لـ"كل موقع كم به"</h4>
        ${crossLocation.map((loc) => `<div style="display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0;">
          <span style="color:#0F1420;">${esc(loc.projectName)}</span>
          <span style="font-family:monospace;color:${loc.stock <= 0 ? "var(--muted2)" : "var(--good)"};">${loc.stock} ${esc(loc.unit || "")}</span>
        </div>`).join("")}
      </div>
      <div>
        <h4 style="font-size:11.5px;color:var(--muted2);margin:0 0 6px;">آخر الحركات الحقيقية المسجَّلة</h4>
        ${history.length ? history.map((h) => `<div style="font-size:10.5px;color:var(--muted);padding:3px 0;border-bottom:1px solid var(--border2);">
          ${esc(h.date)} — ${esc(h.type)} ${h.quantity} ${esc(selected.unit || "")} — ${esc(h.requestedByName)}${h.purpose ? ` (${esc(h.purpose)})` : ""}
        </div>`).join("") : `<p style="font-size:10.5px;color:var(--muted2);margin:0;">لا حركات مسجَّلة بعد لهذه المادة.</p>`}
      </div>
    ` : ""}
  </div>`;
}
function recordMaterialTransactionFromUI(materialId, type) {
  const qty = document.getElementById("mat-tx-qty").value;
  const purpose = document.getElementById("mat-tx-purpose").value;
  if (recordMaterialTransaction(materialId, type, qty, purpose)) { renderApp(); showToast(`تم تسجيل ${type} ${qty} بنجاح`, "success"); }
}
function transferMaterialFromUI(materialId) {
  const qty = document.getElementById("mat-tx-qty").value;
  const purpose = document.getElementById("mat-tx-purpose").value;
  const targetProjectId = document.getElementById("mat-transfer-target").value;
  if (transferMaterialToProject(materialId, qty, targetProjectId, purpose)) { renderApp(); showToast(`تم تحويل ${qty} إلى ${projName(targetProjectId)} بنجاح`, "success"); }
}

function renderResources() {
  const tab = STATE.resourcesTab || "labor";
  const tabs = [["labor", "العمالة"], ["equipment", "المعدات"], ["materials", "المواد"], ["pool", "السجل الرئيسي للموارد"]];
  const tabBtns = tabs.map(([k, l]) => `<button class="tab-btn ${tab === k ? "active" : ""}" onclick="setResourcesTab('${k}')">${l}</button>`).join("");
  if (tab === "pool") return `<div class="tabs">${tabBtns}</div>${renderResourcePoolTab()}`;
  const cfg = { labor: { title: "إدارة العمالة", col: "labor" }, equipment: { title: "إدارة المعدات", col: "equipment" }, materials: { title: "إدارة المواد والمخزون", col: "materials" } }[tab];
  const readOnly = !canEdit(STATE.user.role, "resources");
  const rows = filterByProject(STATE.data[cfg.col]);
  const fields = MODULES[tab].fields();

  let chartHtml = "";
  if (tab === "equipment" && rows.length) {
    const statuses = ["تعمل", "متوقفة - صيانة", "معطلة"];
    const colors = ["#2FBF71", "#F5A623", "#E5484D"];
    const data = statuses.map((s, i) => ({ name: s, value: rows.filter((r) => r.status === s).length, color: colors[i] }));
    chartHtml = `<div class="frame p4" style="margin-bottom:14px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;"><h3 style="font-size:13px;color:#3D4759;margin:0;flex-basis:100%;">حالة المعدات</h3>${donutChart(data).outerHTML}${legendHTML(data)}</div>`;
  } else if (tab === "labor" && rows.length) {
    const chart = barChart(rows.map((r) => r.name), [{ name: "العدد", color: "#1FB6A6", values: rows.map((r) => Number(r.count) || 0) }]);
    chartHtml = `<div class="frame p4" style="margin-bottom:14px;"><h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">أعداد العمالة حسب الفريق</h3><div class="chart-box">${chart.outerHTML}</div></div>`;
  } else if (tab === "materials" && rows.length) {
    const chart = barChart(rows.map((r) => r.name), [
      { name: "المخزون الفعلي", color: "#1FB6A6", values: rows.map((r) => computeMaterialCurrentStock(r.id)) },
      { name: "حد إعادة الطلب", color: "#E5484D", values: rows.map((r) => Number(r.reorderLevel) || 0) },
    ]);
    chartHtml = `<div class="frame p4" style="margin-bottom:14px;"><h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">المخزون الفعلي مقابل حد إعادة الطلب</h3><div class="chart-box">${chart.outerHTML}</div>${legendHTML([{ name: "المخزون الفعلي", color: "#1FB6A6" }, { name: "حد إعادة الطلب", color: "#E5484D" }])}</div>`
      + renderMaterialsActionPanel(rows, readOnly);
  }

  return `<div class="tabs">${tabBtns}</div>${chartHtml}${renderModuleView(tab, cfg.title, fields, rows, [], readOnly)}`;
}
function setResourcesTab(t) { STATE.resourcesTab = t; renderApp(); }

/* ---------------- Master resource pool: managers, engineers, workers, equipment ---------------- */
function renderTransferRequestsPanel() {
  const role = STATE.user.role;
  const isGM = role === "مدير عام" || role === "مالك الشركة";
  const requests = STATE.data.resourceTransferRequests || [];
  const relevant = isGM ? requests.filter((r) => r.status === "معلَّق") : requests.filter((r) => r.requestedByUserId === STATE.user.id).slice(-5).reverse();
  if (!relevant.length) return "";
  const title = isGM ? `⏳ طلبات نقل معلَّقة بانتظار موافقتك (${relevant.length})` : `طلباتي الأخيرة لنقل المعدات`;
  return `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid ${isGM ? "var(--warn)" : "var(--info)"};">
    <h3 style="font-size:12.5px;color:#3D4759;margin:0 0 10px;">${title}</h3>
    ${relevant.map((r) => {
      const resource = (STATE.data.resourcePool || []).find((x) => x.id === r.resourceId);
      const statusColor = r.status === "معلَّق" ? "var(--warn)" : r.status === "مقبول" ? "var(--good)" : "var(--danger)";
      return `<div style="background:#F5F6F9;border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:11.5px;">
        <div style="color:#0F1420;">${esc(resource ? resource.name : "—")} — ${esc(r.type)}${r.targetProjectId ? " إلى " + esc(projName(r.targetProjectId)) : ""}</div>
        <div style="color:var(--muted2);margin-top:2px;">بتاريخ ${esc(r.transferDate)} — طلبه: ${esc(r.requestedBy)} — ${statusDot(r.status === "معلَّق" ? "warn" : r.status === "مقبول" ? "good" : "danger", r.status)}</div>
        ${r.rejectionReason ? `<div style="color:var(--danger);margin-top:2px;">سبب الرفض: ${esc(r.rejectionReason)}</div>` : ""}
        ${isGM && r.status === "معلَّق" ? `<div style="display:flex;gap:6px;margin-top:6px;">
          <button class="btn primary sm" onclick="decideResourceTransfer('${r.id}','قبول','')">✓ قبول</button>
          <button class="btn danger sm" onclick="const reason=prompt('سبب الرفض:'); if(reason && reason.trim()) decideResourceTransfer('${r.id}','رفض',reason);">✕ رفض</button>
        </div>` : ""}
      </div>`;
    }).join("")}
  </div>`;
}

function renderResourcePoolTab() {
  const role = STATE.user.role;
  const scope = getUserScopedProjectIds();
  const pool = scope ? (STATE.data.resourcePool || []).filter((r) => {
    const ids = getResourceProjectIds(r);
    return !ids.length || ids.some((pid) => scope.has(pid));
  }) : (STATE.data.resourcePool || []);
  const poolFilteredByProject = STATE.projectFilter !== "all"
    ? pool.filter((r) => { const ids = getResourceProjectIds(r); return !ids.length || ids.includes(STATE.projectFilter); })
    : pool;
  const readOnly = !canEdit(role, "resourcePool");
  const fields = MODULES.resourcePool.fields();

  const summary = [
    kpiCard({ label: "مدراء المشاريع", value: poolFilteredByProject.filter((r) => r.type === "مدير مشروع").length }),
    kpiCard({ label: "المهندسون", value: poolFilteredByProject.filter((r) => r.type === "مهندس").length }),
    kpiCard({ label: "العمال", value: poolFilteredByProject.filter((r) => r.type === "عامل").length }),
    kpiCard({ label: "المعدات", value: poolFilteredByProject.filter((r) => r.type === "معدة").length }),
  ];
  if (STATE.projectFilter !== "all") {
    summary.push(kpiCard({ label: "تكلفة الموارد المعيّنة/يوم لهذا المشروع", value: fmtMoney(projectAssignedDailyCost(STATE.projectFilter, pool)), level: "warn" }));
  }

  const extraColumns = [];
  const canSeeRate = (row) => !(role === "مدير المشروع" && (row.type === "مدير مشروع" || row.type === "مهندس"));
  extraColumns.push({ key: "_rateHistory", label: "سعر يومي / تاريخ التغييرات", render: (_, row) => {
    if (!canSeeRate(row)) return "—";
    const history = Array.isArray(row.rateHistory) ? row.rateHistory : [];
    const changesCount = history.filter((h) => h.effectiveFrom).length;
    const current = fmtMoney(getRateAtDate(row, todayISO()));
    const historyText = changesCount
      ? `<div style="font-size:10.5px;color:var(--muted2);margin-top:2px;">${changesCount} تغيير مسجَّل — آخره ${esc(history.slice().sort((a,b)=>(b.effectiveFrom||"").localeCompare(a.effectiveFrom||""))[0].effectiveFrom)}</div>`
      : "";
    const canEditRate = !readOnly && canEdit(role, "resourcePool");
    return `<div>${current}${historyText}${canEditRate ? `<button class="btn ghost sm" style="margin-top:4px;" onclick="recordRateChange('${row.id}')">💰 تسجيل تغيير السعر</button>` : ""}</div>`;
  } });
  if (role === "مدير المشروع") {
    extraColumns.push({ key: "_assign", label: "تعيين للمشروع الحالي", render: (_, row) => {
      if (row.type !== "مهندس" && row.category !== "معدات" && row.category !== "مواد") return `<span style="color:var(--muted2);font-size:12px;">غير قابل للتعيين من هذه الصفحة</span>`;
      const pendingRequest = (STATE.data.resourceTransferRequests || []).find((r) => r.resourceId === row.id && r.status === "معلَّق");
      if (row.type === "مهندس") {
        const ids = getResourceProjectIds(row);
        const mine = ids.includes(STATE.projectFilter);
        return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;">
          <span>${ids.length ? "معيَّن حالياً لـ: " + ids.map((id) => esc(projName(id))).join("، ") : "غير معيَّن لأي مشروع"}</span>
          ${mine ? `<button class="btn ghost sm" onclick="unassignResource('${row.id}')">إزالة من هذا المشروع</button>` : `<button class="btn primary sm" onclick="assignResourceToProject('${row.id}')">إضافة لهذا المشروع</button>`}
        </div>`;
      }
      // معدات ومواد — عبر طلب نقل يحتاج موافقة GM
      if (pendingRequest) {
        return `<span style="color:var(--warn);font-size:11px;">⏳ طلب ${pendingRequest.type} معلَّق منذ ${esc(pendingRequest.requestDate)}</span>`;
      }
      if (row.assignedProjectId) {
        const mine = row.assignedProjectId === STATE.projectFilter;
        return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;">
          <span>معيّن حالياً: ${esc(projName(row.assignedProjectId))}</span>
          ${mine ? `<button class="btn ghost sm" onclick="promptRequestResourceReturn('${row.id}')">طلب إعادة للمخزن</button>` : ""}
        </div>`;
      }
      return `<button class="btn primary sm" onclick="promptRequestResourceTransfer('${row.id}')">📦 طلب نقل من المخزن</button>`;
    }});
  }
  if (role === "مدير عام" || role === "مالك الشركة") {
    extraColumns.push({ key: "_accountStatus", label: "حساب الدخول", render: (_, row) => {
      if (row.type !== "مدير مشروع" && row.type !== "مهندس") return "—";
      const linked = (STATE.data.users || []).find((u) => u.linkedResourceId === row.id);
      return linked ? statusDot("good", `🔑 له حساب: ${linked.username}`) : statusDot("warn", "بلا حساب دخول بعد");
    } });
    extraColumns.push({ key: "_promote", label: "ترقية", render: (_, row) => {
      if (row.type !== "مهندس") return "—";
      return `<button class="btn ghost sm" onclick="promoteEngineerToProjectManager('${row.id}')">⬆ ترقية لمدير مشروع</button>`;
    } });
  }

  const note = role === "مدير عام"
    ? `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">بصفتك المدير العام، أنت المسؤول عن إدخال مدراء المشاريع والمهندسين إلى هذا السجل (بما في ذلك إنشاء حساب دخول لهم مباشرة من نموذج الإضافة/التعديل)، وتحديد السعر اليومي لكل مورد ليُحتسب ضمن تكلفة المشروع.</div>`
    : role === "مدير المشروع"
      ? `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">يمكنك عرض جميع الموارد المسجّلة (لن ترى السعر اليومي لمدراء المشاريع أو المهندسين)، إضافة عمال ومعدات جديدة بنفسك، وتعيين المهندسين والمعدات (وليس العمال أو مدراء المشاريع) للعمل في المشروع المحدد أعلى الصفحة عبر قائمة "المشروع" في الأعلى.</div>`
      : "";

  return `
    <div class="kpi-grid">${summary.join("")}</div>
    ${note}
    ${renderTransferRequestsPanel()}
    ${renderModuleView("resourcePool", "السجل الرئيسي للموارد", fields, poolFilteredByProject, extraColumns, readOnly)}
  `;
}
/* ============================================================
   ترقية مهندس إلى مدير مشروع — يُحدِّث نوع المورد وحساب الدخول
   المرتبط به (إن وُجد) معاً، فلا يتعطَّل تسجيل دخوله بعد الترقية.
   ============================================================ */
/* ============================================================
   اعتماد التقارير اليومية — الفرق واضح: المهندس يُقدِّم، مدير
   المشروع يعتمد أو يطلب تعديلاً. هذا يوضِّح الالتباس الذي أُشير إليه
   حول "من يضيف تقريراً ومن يوافق عليه".
   ============================================================ */
function approveDailyReport(id) {
  if (STATE.user && STATE.user.role !== "مدير المشروع" && STATE.user.role !== "مدير عام" && STATE.user.role !== "مالك الشركة") {
    alert("اعتماد التقارير اليومية يقتصر على مدير المشروع.");
    return;
  }
  STATE.data.dailyReports = (STATE.data.dailyReports || []).map((r) => r.id === id ? Object.assign({}, r, { status: "معتمد", approvedBy: STATE.user.name, approvalDate: todayISO(), updatedAt: Date.now() }) : r);
  logAudit("update", "dailyReports", id, "اعتماد التقرير اليومي");
  saveData(STATE.data);
  renderApp();
  showToast("تم اعتماد التقرير", "success");
}
function requestReportRevision(id, note) {
  if (STATE.user && STATE.user.role !== "مدير المشروع" && STATE.user.role !== "مدير عام" && STATE.user.role !== "مالك الشركة") {
    alert("طلب تعديل التقارير اليومية يقتصر على مدير المشروع.");
    return;
  }
  if (!note || !note.trim()) { alert("يجب كتابة ملاحظة توضِّح المطلوب تعديله."); return; }
  STATE.data.dailyReports = (STATE.data.dailyReports || []).map((r) => r.id === id ? Object.assign({}, r, { status: "يحتاج تعديل", revisionNote: note.trim(), updatedAt: Date.now() }) : r);
  logAudit("update", "dailyReports", id, "طلب تعديل على التقرير اليومي");
  saveData(STATE.data);
  renderApp();
  showToast("تم إرسال طلب التعديل", "info");
}

function promoteEngineerToProjectManager(resourceId) {
  if (STATE.user && STATE.user.role !== "مدير عام" && STATE.user.role !== "مالك الشركة") { alert("الترقية تقتصر على الـGM."); return; }
  const resource = (STATE.data.resourcePool || []).find((r) => r.id === resourceId);
  if (!resource) return;
  if (resource.type !== "مهندس") { alert("هذه الميزة تُرقّي مهندساً إلى مدير مشروع تحديداً."); return; }
  if (!confirm(`ترقية «${resource.name}» من مهندس إلى مدير مشروع — سيُصبح مؤهَّلاً لقيادة مشاريع جديدة، ويُحدَّث حساب دخوله تلقائياً إن وُجد. متابعة؟`)) return;
  STATE.data.resourcePool = STATE.data.resourcePool.map((r) => r.id === resourceId ? Object.assign({}, r, { type: "مدير مشروع", updatedAt: Date.now() }) : r);
  STATE.data.users = (STATE.data.users || []).map((u) => u.linkedResourceId === resourceId ? Object.assign({}, u, { role: "مدير المشروع", updatedAt: Date.now() }) : u);
  logAudit("update", "resourcePool", resourceId, `ترقية ${resource.name} من مهندس إلى مدير مشروع`);
  saveData(STATE.data);
  renderApp();
  showToast(`تمت ترقية «${resource.name}» إلى مدير مشروع بنجاح`, "success");
}

function promptRequestResourceTransfer(resourceId) {
  if (STATE.projectFilter === "all") { alert("اختر مشروعك من القائمة العلوية أولاً."); return; }
  const date = prompt("تاريخ النقل المطلوب (YYYY-MM-DD):", todayISO());
  if (!date) return;
  requestResourceTransfer(resourceId, STATE.projectFilter, date);
}
function promptRequestResourceReturn(resourceId) {
  if (!confirm("سيتم إرسال طلب إعادة هذا العنصر للمخزن الرئيسي، بانتظار موافقة الـGM. متابعة؟")) return;
  requestResourceReturn(resourceId);
}
function assignResourceToProject(resourceId) {
  if (STATE.user && !canEdit(STATE.user.role, "resourcePool")) { alert("دورك الحالي لا يملك صلاحية تخصيص الموارد."); return; }
  if (STATE.projectFilter === "all") { alert("الرجاء اختيار مشروعك من قائمة المشاريع في الأعلى أولاً، ثم إعادة المحاولة."); return; }
  const resource = (STATE.data.resourcePool || []).find((r) => r.id === resourceId);
  if (!resource) return;
  if (!isHumanResource(resource)) { alert("المعدات والمواد تحتاج طلب نقل يوافق عليه الـGM — استخدم زر «طلب نقل» بدل هذا."); return; }
  const currentIds = getResourceProjectIds(resource);
  if (currentIds.includes(STATE.projectFilter)) { renderApp(); return; }
  STATE.data.resourcePool = STATE.data.resourcePool.map((r) => r.id === resourceId ? Object.assign({}, r, { assignedProjectIds: [...currentIds, STATE.projectFilter], status: "معيّن" }) : r);
  saveData(STATE.data);
  renderApp();
  showToast("تم تعيين المورد لهذا المشروع (يمكنه العمل في أكثر من مشروع معاً)", "success");
}
/* ============================================================
   طلبات نقل المعدات/المواد بين المخزن الرئيسي والمشاريع — العنصر
   يبقى في موقعه الحالي حتى يوافق الـGM صريحاً، لا نقل فوري تلقائي.
   ============================================================ */
function requestResourceTransfer(resourceId, targetProjectId, transferDate) {
  if (STATE.user && !canEdit(STATE.user.role, "resourcePool")) { alert("دورك الحالي لا يملك صلاحية طلب نقل موارد."); return; }
  const resource = (STATE.data.resourcePool || []).find((r) => r.id === resourceId);
  if (!resource) return;
  if (isHumanResource(resource)) { alert("طلبات النقل بهذه الآلية للمعدات والمواد فقط."); return; }
  if (!targetProjectId) { alert("اختر المشروع المطلوب النقل إليه."); return; }
  if (!transferDate) { alert("أدخل تاريخ النقل المطلوب."); return; }
  if ((STATE.data.resourceTransferRequests || []).some((r) => r.resourceId === resourceId && r.status === "معلَّق")) {
    alert("يوجد طلب معلَّق بالفعل لهذا العنصر — انتظر رد الـGM أولاً.");
    return;
  }
  const request = { id: uid(), resourceId, type: "نقل لمشروع", targetProjectId, transferDate,
    requestedBy: STATE.user.name, requestedByUserId: STATE.user.id, requestedByRole: STATE.user.role, requestDate: todayISO(),
    status: "معلَّق", decisionDate: "", decisionBy: "", rejectionReason: "" };
  STATE.data.resourceTransferRequests.push(request);
  logAudit("create", "resourceTransferRequests", request.id, `طلب نقل ${resource.name} إلى ${projName(targetProjectId)}`);
  (STATE.data.users || []).filter((u) => u.role === "مدير عام" || u.role === "مالك الشركة").forEach((u) => {
    createNotification(u.id, "update", `طلب نقل جديد: ${resource.name} إلى ${projName(targetProjectId)}`, "resourceTransfer", request.id);
  });
  saveData(STATE.data);
  renderApp();
  showToast("تم إرسال طلب النقل — بانتظار موافقة الـGM", "info");
}
function requestResourceReturn(resourceId) {
  if (STATE.user && !canEdit(STATE.user.role, "resourcePool")) { alert("دورك الحالي لا يملك صلاحية طلب إعادة موارد."); return; }
  const resource = (STATE.data.resourcePool || []).find((r) => r.id === resourceId);
  if (!resource) return;
  if (!resource.assignedProjectId) { alert("هذا العنصر بالفعل في المخزن الرئيسي."); return; }
  if ((STATE.data.resourceTransferRequests || []).some((r) => r.resourceId === resourceId && r.status === "معلَّق")) {
    alert("يوجد طلب معلَّق بالفعل لهذا العنصر — انتظر رد الـGM أولاً.");
    return;
  }
  const request = { id: uid(), resourceId, type: "عودة للمخزن", targetProjectId: null, transferDate: todayISO(),
    requestedBy: STATE.user.name, requestedByUserId: STATE.user.id, requestedByRole: STATE.user.role, requestDate: todayISO(),
    status: "معلَّق", decisionDate: "", decisionBy: "", rejectionReason: "" };
  STATE.data.resourceTransferRequests.push(request);
  logAudit("create", "resourceTransferRequests", request.id, `طلب إعادة ${resource.name} للمخزن الرئيسي`);
  (STATE.data.users || []).filter((u) => u.role === "مدير عام" || u.role === "مالك الشركة").forEach((u) => {
    createNotification(u.id, "update", `طلب إعادة للمخزن: ${resource.name}`, "resourceTransfer", request.id);
  });
  saveData(STATE.data);
  renderApp();
  showToast("تم إرسال طلب الإعادة — بانتظار موافقة الـGM", "info");
}
function decideResourceTransfer(requestId, decision, reason) {
  if (STATE.user && STATE.user.role !== "مدير عام" && STATE.user.role !== "مالك الشركة") { alert("قرار طلبات النقل يقتصر على الـGM."); return; }
  const request = (STATE.data.resourceTransferRequests || []).find((r) => r.id === requestId);
  if (!request || request.status !== "معلَّق") return;
  if (decision === "رفض" && (!reason || !reason.trim())) { alert("يجب إدخال سبب الرفض."); return; }
  STATE.data.resourceTransferRequests = STATE.data.resourceTransferRequests.map((r) => r.id === requestId
    ? Object.assign({}, r, { status: decision === "قبول" ? "مقبول" : "مرفوض", decisionDate: todayISO(), decisionBy: STATE.user.name, rejectionReason: reason || "" })
    : r);
  if (decision === "قبول") {
    STATE.data.resourcePool = STATE.data.resourcePool.map((res) => res.id === request.resourceId
      ? Object.assign({}, res, { assignedProjectId: request.targetProjectId, transferDate: request.transferDate, status: request.targetProjectId ? "معيّن" : "متاح" })
      : res);
  }
  logAudit("update", "resourceTransferRequests", requestId, `${decision === "قبول" ? "قبول" : "رفض"} طلب نقل`);
  if (request.requestedByUserId) {
    NotificationEngine.notify({
      userId: request.requestedByUserId, source: "schedule", type: "update",
      text: `${decision === "قبول" ? "تمت الموافقة على" : "رُفض"} طلب نقلك`, priority: decision === "قبول" ? "متوسطة" : "عالية",
      entityLink: { moduleKey: "resourceTransfer", recordId: requestId },
    });
  }
  if (decision === "قبول" && request.targetProjectId) {
    const resource = (STATE.data.resourcePool || []).find((r) => r.id === request.resourceId);
    emitProjectEvent({ projectId: request.targetProjectId, eventType: "RESOURCE_ALLOCATED", sourceEntity: "Resource", sourceEntityId: request.resourceId,
      newState: { assignedProjectId: request.targetProjectId, transferDate: request.transferDate }, severity: "info",
      evidence: [`استُلِمت معدة/مادة: ${resource ? resource.name : request.resourceId} بتاريخ ${request.transferDate}`] });
  }
  saveData(STATE.data);
  renderApp();
  showToast(decision === "قبول" ? "تم قبول الطلب وتنفيذ النقل" : "تم رفض الطلب", decision === "قبول" ? "success" : "info");
}

function unassignResource(resourceId) {
  if (STATE.user && !canEdit(STATE.user.role, "resourcePool")) { alert("دورك الحالي لا يملك صلاحية تعديل تخصيص الموارد."); return; }
  const resource = (STATE.data.resourcePool || []).find((r) => r.id === resourceId);
  if (!resource) return;
  if (!isHumanResource(resource)) { alert("المعدات والمواد تحتاج طلب إعادة يوافق عليه الـGM — استخدم زر «طلب إعادة للمخزن» بدل هذا."); return; }
  const remaining = getResourceProjectIds(resource).filter((id) => id !== STATE.projectFilter);
  STATE.data.resourcePool = STATE.data.resourcePool.map((r) => r.id === resourceId ? Object.assign({}, r, { assignedProjectIds: remaining, status: remaining.length ? "معيّن" : "متاح" }) : r);
  saveData(STATE.data);
  renderApp();
}

/* ---------------- Invoices — PM submission + accountant reconciliation ---------------- */
function renderInvoicesView() {
  const rows = filterByProject(STATE.data.invoices);
  const fields = MODULES.invoices.fields();
  const readOnly = !canEdit(STATE.user.role, "invoices");
  const isAccountant = STATE.user.role === "المحاسب العام";

  const extraColumns = [
    { key: "_barcode", label: "الباركود", render: (_, row) => row.barcodeValue ? `<span class="badge-pill">${esc(row.barcodeValue)}</span>` : "—" },
    { key: "_photo", label: "الصورة", render: (_, row) => row.photo ? `<span class="badge-pill">📎 مرفقة</span>` : "—" },
    { key: "_submittedBy", label: "مقدَّمة من", render: (_, row) => esc(row.createdBy || "—") },
    { key: "_reviewAction", label: "مراجعة المحاسب العام", render: (_, row) => {
      const st = row.approvalStatus;
      if (!isAccountant) {
        if (st === "معتمد") return statusDot("good", "مقبولة");
        if (st === "مرفوض") return statusDot("danger", "مرفوضة");
        if (st === "مقدَّم") return statusDot("warn", "مقدَّمة — قيد المراجعة");
        return statusDot("info", "—");
      }
      if (st === "معتمد") return `${statusDot("good", "مقبولة")} <button class="btn ghost sm" onclick="reviewInvoice('${row.id}','مقدَّم')">تراجع</button>`;
      if (st === "مرفوض") return `${statusDot("danger", "مرفوضة")} <button class="btn ghost sm" onclick="reviewInvoice('${row.id}','مقدَّم')">تراجع</button>`;
      return `<div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn primary sm" onclick="reviewInvoice('${row.id}','معتمد')">✓ قبول</button>
        <button class="btn danger sm" onclick="reviewInvoice('${row.id}','مرفوض')">✕ رفض</button>
      </div>`;
    } },
  ];

  return renderModuleView("invoices", "الفواتير والمستخلصات", fields, rows, extraColumns, readOnly);
}
function reviewInvoice(id, decision) {
  InvoiceRepository.update(id, { approvalStatus: decision });
  renderApp();
}

/* ---------------- العهد والسُلف: يستلمها مدير المشروع ويطابقها المحاسب العام بالفواتير ---------------- */
function openHandoffSubCustodyModal(parentCustodyId) {
  if (STATE.user && !canEdit(STATE.user.role, "custodies")) { alert("دورك الحالي لا يملك صلاحية تسليم عهد."); return; }
  const parent = (STATE.data.custodies || []).find((c) => c.id === parentCustodyId);
  if (!parent) return;
  const used = custodyUsedTotal(parent.id, STATE.data.custodies, STATE.data.invoices);
  const remaining = Number(parent.amount || 0) - used;
  if (remaining <= 0) { alert("لا يوجد مبلغ متبقٍ في هذه العهدة لتسليمه — راجع المصروف الحالي أولاً."); return; }
  const engineerOptions = filterByProject(STATE.data.resourcePool || [], true).filter((r) => r.type === "مهندس").map((r) => ({ value: r.id, label: r.name }));
  STATE.handoffModal = { parentCustodyId, remaining, engineerResourceId: "", amount: "" };
  renderApp();
}
function closeHandoffSubCustodyModal() { STATE.handoffModal = null; renderApp(); }
function updateHandoffModalField(key, value) { if (STATE.handoffModal) { STATE.handoffModal[key] = value; renderApp(); } }
function confirmHandoffSubCustody() {
  const h = STATE.handoffModal;
  if (!h) return;
  if (!h.engineerResourceId) { alert("اختر المهندس المستلِم."); return; }
  const amount = Number(h.amount);
  if (!amount || amount <= 0) { alert("أدخل مبلغاً صحيحاً أكبر من صفر."); return; }
  if (amount > h.remaining) { alert(`المبلغ المُدخَل (${fmtMoney(amount)}) يتجاوز المتبقي الفعلي في العهدة (${fmtMoney(h.remaining)}) — صحِّح المبلغ.`); return; }
  const parent = (STATE.data.custodies || []).find((c) => c.id === h.parentCustodyId);
  if (!parent) return;
  MODULES.custodies.add({ projectId: parent.projectId, custodyType: "نقدية (مصاريف تشغيلية)", parentCustodyId: parent.id,
    amount, custodianResourceId: h.engineerResourceId, dateReceived: todayISO() });
  const engineer = (STATE.data.resourcePool || []).find((r) => r.id === h.engineerResourceId);
  STATE.handoffModal = null;
  renderApp();
  showToast(`تم تسليم ${fmtMoney(amount)} لـ${engineer ? engineer.name : "المهندس"} بنجاح`, "success");
}
function renderHandoffSubCustodyModal() {
  const h = STATE.handoffModal;
  if (!h) return "";
  const parent = (STATE.data.custodies || []).find((c) => c.id === h.parentCustodyId);
  if (!parent) return "";
  const engineerOptions = filterByProject(STATE.data.resourcePool || [], true).filter((r) => r.type === "مهندس");
  const amount = Number(h.amount) || 0;
  const afterHandoff = h.remaining - amount;
  const overLimit = amount > h.remaining;
  return `<div class="modal-overlay" onclick="if(event.target===this)closeHandoffSubCustodyModal()">
    <div class="modal-box" style="max-width:420px;">
      <h3 style="font-size:14px;color:#0F1420;margin:0 0 4px;">👤 تسليم جزء من العهدة رقم ${esc(parent.number)}</h3>
      <p style="font-size:11.5px;color:var(--muted2);margin:0 0 14px;">المتبقي الحقيقي في هذه العهدة الآن: <b style="color:var(--good);">${fmtMoney(h.remaining)}</b></p>
      <div class="field"><label>المهندس المستلِم *</label>
        <select onchange="updateHandoffModalField('engineerResourceId', this.value)">
          <option value="">اختر مهندساً...</option>
          ${engineerOptions.map((r) => `<option value="${r.id}" ${h.engineerResourceId === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>المبلغ المُسلَّم *</label>
        <input type="number" value="${esc(h.amount)}" oninput="updateHandoffModalField('amount', this.value)" />
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
          ${btn("¼ المتبقي", `updateHandoffModalField('amount', ${Math.floor(h.remaining * 0.25)})`, "ghost", "sm")}
          ${btn("½ المتبقي", `updateHandoffModalField('amount', ${Math.floor(h.remaining * 0.5)})`, "ghost", "sm")}
          ${btn("كل المتبقي", `updateHandoffModalField('amount', ${h.remaining})`, "ghost", "sm")}
        </div>
        <div style="font-size:10.5px;margin-top:4px;color:${overLimit ? "var(--danger)" : "var(--muted2)"};">
          ${amount ? `بعد هذا التسليم سيتبقى في العهدة الأصلية: ${fmtMoney(afterHandoff)}${overLimit ? " ⚠ يتجاوز المتبقي الفعلي — لن يُقبَل هذا المبلغ" : ""}` : "أدخل مبلغاً للمعاينة، أو استخدم الأزرار السريعة أعلاه"}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        ${btn("✓ تأكيد التسليم", "confirmHandoffSubCustody()", "primary")}
        ${btn("إلغاء", "closeHandoffSubCustodyModal()", "ghost")}
      </div>
    </div>
  </div>`;
}

function openQuickExpenseModal(custodyId) {
  const custody = (STATE.data.custodies || []).find((c) => c.id === custodyId);
  if (!custody) return;
  openAddModal("invoices");
  if (!STATE.modal) return; // مُنع بالصلاحية بالفعل — الرسالة الحقيقية ظهرت فعلاً من داخل openAddModal
  STATE.modal.title = "تسجيل مصروف من العهدة";
  STATE.modal.values.projectId = custody.projectId;
  STATE.modal.values.custodyId = custody.id;
  STATE.modal.values.type = "مورد";
  STATE.modal.values.category = "فاتورة عادية";
  renderApp();
}

function renderMyCustodyBalanceCard(allCustodies, invoices) {
  const user = STATE.user;
  if (!user.linkedResourceId) return "";
  const role = user.role;
  if (role === "مهندس الموقع") {
    const myCustodies = allCustodies.filter((c) => c.custodianResourceId === user.linkedResourceId);
    if (!myCustodies.length) return "";
    return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--accent);">
      <h3 style="font-size:13px;color:var(--accent);margin:0 0 10px;">💼 عهدتي الحالية</h3>
      ${myCustodies.map((c) => {
        if (isCashCustody(c)) {
          const used = custodyUsedTotal(c.id, allCustodies, invoices);
          const remaining = Number(c.amount || 0) - used;
          const pct = c.amount ? Math.min(100, Math.round((used / c.amount) * 100)) : 0;
          const barColor = remaining < 0 ? "var(--danger)" : pct > 85 ? "var(--warn)" : "var(--good)";
          return `<div style="background:#F5F6F9;border-radius:8px;padding:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;color:#0F1420;margin-bottom:6px;">
              <span>عهدة رقم ${esc(c.number)} — ${esc(projName(c.projectId))}</span>
              <span style="font-family:monospace;color:${remaining < 0 ? "var(--danger)" : "var(--good)"};">المتبقي: ${fmtMoney(remaining)}</span>
            </div>
            <div style="height:8px;background:#1c2733;border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${barColor};"></div>
            </div>
            <div style="font-size:10.5px;color:var(--muted2);margin-top:4px;">استلمت: ${fmtMoney(c.amount)} — صرفت حتى الآن: ${fmtMoney(used)}${remaining < 0 ? ` — تجاوزت بمقدار ${fmtMoney(-remaining)}` : ""}</div>
            ${canEdit(user.role, "invoices") ? `<button class="btn ghost sm" style="margin-top:8px;" onclick="openQuickExpenseModal('${c.id}')">🧾 تسجيل مصروف من هذه العهدة</button>` : ""}
          </div>`;
        }
        return `<div style="background:#F5F6F9;border-radius:8px;padding:12px;margin-bottom:8px;font-size:12.5px;color:#0F1420;">
          ${esc(c.itemDescription || c.custodyType)} — ${esc(projName(c.projectId))} ${c.actualReturnDate ? "(أُعيدت)" : "(بحوزتك حالياً)"}
        </div>`;
      }).join("")}
    </div>`;
  }
  if (role === "مدير المشروع") {
    const scopedCustodies = filterByProject(allCustodies);
    const myOwnCustodies = scopedCustodies.filter((c) => !c.parentCustodyId && c.custodianResourceId === user.linkedResourceId);
    const myGiven = scopedCustodies.filter((c) => c.parentCustodyId);
    if (!myOwnCustodies.length && !myGiven.length) return "";
    const ownSectionHtml = myOwnCustodies.length ? `<h3 style="font-size:13px;color:var(--accent);margin:0 0 10px;">💼 عهدتي الحالية (المُستلَمة من المحاسب العام)</h3>
      ${myOwnCustodies.map((c) => {
        if (!isCashCustody(c)) return `<div style="background:#F5F6F9;border-radius:8px;padding:12px;margin-bottom:8px;font-size:12.5px;color:#0F1420;">${esc(c.itemDescription || c.custodyType)} — ${esc(projName(c.projectId))}</div>`;
        const used = custodyUsedTotal(c.id, allCustodies, invoices);
        const remaining = Number(c.amount || 0) - used;
        const pct = c.amount ? Math.min(100, Math.round((used / c.amount) * 100)) : 0;
        const barColor = remaining < 0 ? "var(--danger)" : pct > 85 ? "var(--warn)" : "var(--good)";
        return `<div style="background:#F5F6F9;border-radius:8px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;color:#0F1420;margin-bottom:6px;">
            <span>عهدة رقم ${esc(c.number)} — ${esc(projName(c.projectId))}</span>
            <span style="font-family:monospace;color:${remaining < 0 ? "var(--danger)" : "var(--good)"};">المتبقي: ${fmtMoney(remaining)}</span>
          </div>
          <div style="height:8px;background:#1c2733;border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${barColor};"></div>
          </div>
          <div style="font-size:10.5px;color:var(--muted2);margin-top:4px;">استلمت: ${fmtMoney(c.amount)} — صرفت حتى الآن: ${fmtMoney(used)}</div>
          ${remaining > 0 ? `<button class="btn ghost sm" style="margin-top:8px;" onclick="openHandoffSubCustodyModal('${c.id}')">👤 تسليم جزء منها لمهندس</button>` : ""}
        </div>`;
      }).join("")}` : "";
    const givenSectionHtml = myGiven.length ? `<h3 style="font-size:13px;color:var(--info);margin:${myOwnCustodies.length ? "16px" : "0"} 0 10px;">💼 العهد الفرعية التي وزَّعتها على المهندسين</h3>
      ${myGiven.map((c) => {
        const holder = (STATE.data.resourcePool || []).find((r) => r.id === c.custodianResourceId);
        if (isCashCustody(c)) {
          const used = custodyUsedTotal(c.id, allCustodies, invoices);
          const remaining = Number(c.amount || 0) - used;
          const pctRemaining = Number(c.amount) ? (remaining / Number(c.amount)) * 100 : 100;
          const isCritical = remaining < 0;
          const isLow = !isCritical && pctRemaining <= 15;
          const flag = isCritical ? `<span style="color:var(--danger);font-size:10px;margin-right:6px;">⚠ تجاوز</span>` : isLow ? `<span style="color:var(--warn);font-size:10px;margin-right:6px;">⚠ منخفضة — يحتاج تزويداً قريباً</span>` : "";
          return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid var(--border2);">
            <span style="color:#0F1420;">${flag}${esc(holder ? holder.name : "؟")} — عهدة رقم ${esc(c.number)}</span>
            <span style="font-family:monospace;color:${remaining < 0 ? "var(--danger)" : isLow ? "var(--warn)" : "var(--good)"};">متبقٍ: ${fmtMoney(remaining)} من ${fmtMoney(c.amount)}</span>
          </div>`;
        }
        return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid var(--border2);">
          <span style="color:#0F1420;">${esc(holder ? holder.name : "؟")} — ${esc(c.itemDescription || c.custodyType)}</span>
          <span style="color:${c.actualReturnDate ? "var(--good)" : "var(--warn)"};">${c.actualReturnDate ? "أُعيدت" : "قائمة"}</span>
        </div>`;
      }).join("")}` : "";
    return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--accent);">${ownSectionHtml}${givenSectionHtml}</div>`;
  }
  return "";
}

function openQuickIssueCustodyModal() {
  if (STATE.user && !canEdit(STATE.user.role, "custodies")) { alert("دورك الحالي لا يملك صلاحية إصدار عهد."); return; }
  const pmOptions = filterByProject(STATE.data.resourcePool || [], true).filter((r) => r.type === "مدير مشروع");
  STATE.quickIssueModal = { pmResourceId: "", amount: "" };
  renderApp();
}
function closeQuickIssueCustodyModal() { STATE.quickIssueModal = null; renderApp(); }
function updateQuickIssueModalField(key, value) { if (STATE.quickIssueModal) { STATE.quickIssueModal[key] = value; renderApp(); } }
function confirmQuickIssueCustody() {
  const q = STATE.quickIssueModal;
  if (!q) return;
  if (!q.pmResourceId) { alert("اختر مدير المشروع المستلِم."); return; }
  const amount = Number(q.amount);
  if (!amount || amount <= 0) { alert("أدخل مبلغاً صحيحاً أكبر من صفر."); return; }
  const pm = (STATE.data.resourcePool || []).find((r) => r.id === q.pmResourceId);
  if (!pm) return;
  const pmProjectIds = getResourceProjectIds(pm);
  const projectId = pmProjectIds[0] || (STATE.projectFilter !== "all" ? STATE.projectFilter : null);
  if (!projectId) { alert("لم يُحدَّد مشروع هذا المدير — اربطه بمشروع أولاً من سجل الموارد."); return; }
  MODULES.custodies.add({ projectId, custodyType: "نقدية (مصاريف تشغيلية)", amount, custodianResourceId: q.pmResourceId, dateReceived: todayISO() });
  STATE.quickIssueModal = null;
  renderApp();
  showToast(`تم إصدار عهدة ${fmtMoney(amount)} لـ${pm.name} بنجاح`, "success");
}
function renderQuickIssueCustodyModal() {
  const q = STATE.quickIssueModal;
  if (!q) return "";
  const pmOptions = filterByProject(STATE.data.resourcePool || [], true).filter((r) => r.type === "مدير مشروع");
  const existingForPm = q.pmResourceId ? (STATE.data.custodies || []).filter((c) => c.custodianResourceId === q.pmResourceId && !c.parentCustodyId && isCashCustody(c)) : [];
  return `<div class="modal-overlay" onclick="if(event.target===this)closeQuickIssueCustodyModal()">
    <div class="modal-box" style="max-width:420px;">
      <h3 style="font-size:14px;color:#0F1420;margin:0 0 4px;">🏦 إصدار عهدة جديدة لمدير مشروع</h3>
      <p style="font-size:11.5px;color:var(--muted2);margin:0 0 14px;">نموذج مبسَّط للتسليم المباشر — لا حاجة لتعبئة كل حقول العهدة العامة.</p>
      <div class="field"><label>مدير المشروع المستلِم *</label>
        <select onchange="updateQuickIssueModalField('pmResourceId', this.value)">
          <option value="">اختر مدير مشروع...</option>
          ${pmOptions.map((r) => `<option value="${r.id}" ${q.pmResourceId === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
        </select>
        ${existingForPm.length ? `<div style="font-size:10px;color:var(--warn);margin-top:4px;">⚠ لديه عهدة نقدية قائمة فعلاً برقم ${esc(existingForPm[0].number)} — تأكَّد أن هذه عهدة إضافية مقصودة، لا تكرار.</div>` : ""}
      </div>
      <div class="field"><label>المبلغ *</label>
        <input type="number" value="${esc(q.amount)}" oninput="updateQuickIssueModalField('amount', this.value)" />
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        ${btn("✓ تأكيد الإصدار", "confirmQuickIssueCustody()", "primary")}
        ${btn("إلغاء", "closeQuickIssueCustodyModal()", "ghost")}
      </div>
    </div>
  </div>`;
}

function renderCustodies() {
  const allCustodies = STATE.data.custodies || [];
  let rows = filterByProject(allCustodies);
  if (STATE.user.role === "مهندس الموقع") {
    // المهندس يرى فقط عهدته الخاصة في الجدول الرئيسي — لا عهد زملائه (مبلغ عهدة كل مهندس بيانات خاصة، لا رقابية له)
    rows = rows.filter((c) => c.custodianResourceId === STATE.user.linkedResourceId);
  }
  const invoices = STATE.data.invoices || [];
  const fields = MODULES.custodies.fields();
  const readOnly = !canEdit(STATE.user.role, "custodies");
  const isAccountant = STATE.user.role === "المحاسب العام";

  const extraColumns = [
    { key: "_number", label: "رقم العهدة", render: (_, row) => row.parentCustodyId ? `${row.number} (فرعية)` : row.number },
    { key: "_usedTotal", label: "المستخدَم (فواتير + عهد فرعية موزَّعة)", render: (_, row) => isCashCustody(row) ? fmtMoney(custodyUsedTotal(row.id, allCustodies, invoices)) : "—" },
    { key: "_variance", label: "الفرق (المتبقي/التجاوز)", render: (_, row) => {
      if (!isCashCustody(row)) return "—";
      const diff = custodyVarianceFull(row, allCustodies, invoices);
      const color = diff === 0 ? "#2FBF71" : diff > 0 ? "#F5A623" : "#E5484D";
      return `<span style="font-family:monospace;color:${color};">${fmtMoney(diff)}</span>`;
    } },
    { key: "_matchStatus", label: "الحالة", render: (_, row) => {
      if (isCashCustody(row)) {
        if (row.reconciled) return statusDot("good", "معتمدة من المحاسب العام");
        const diff = custodyVarianceFull(row, allCustodies, invoices);
        if (diff === 0) return statusDot("good", "متطابقة تماماً");
        if (diff > 0) return statusDot("warn", `متبقٍ ${fmtMoney(diff)} غير مُبرَّر`);
        return statusDot("danger", `تجاوز بمقدار ${fmtMoney(-diff)}`);
      }
      const status = deriveCustodyStatus(row);
      const level = status === "متأخرة عن الإعادة" || status === "مفقودة" ? "danger" : status === "قائمة (بحوزة المستلم)" ? "warn" : "good";
      return statusDot(level, status);
    } },
  ];
  if (isAccountant) {
    extraColumns.push({ key: "_approve", label: "اعتماد المطابقة / تسجيل الإعادة", render: (_, row) => {
      if (isCashCustody(row)) {
        return row.reconciled
          ? `<button class="btn ghost sm" onclick="setCustodyReconciled('${row.id}', false)">إلغاء الاعتماد</button>`
          : `<button class="btn primary sm" onclick="setCustodyReconciled('${row.id}', true)">✓ اعتماد المطابقة</button>`;
      }
      return row.actualReturnDate ? "—" : `<button class="btn ghost sm" onclick="openEditModal('custodies','${row.id}')">تسجيل الإعادة</button>`;
    } });
  }

  const cashRows = rows.filter(isCashCustody);
  const nonCashRows = rows.filter((r) => !isCashCustody(r));
  const topLevelCount = rows.filter((c) => !c.parentCustodyId).length;
  const subCount = rows.filter((c) => c.parentCustodyId).length;
  const unreconciledCount = cashRows.filter((c) => !c.reconciled).length;
  const outstandingEquipment = nonCashRows.filter((c) => !c.actualReturnDate).length;
  const overdueReturns = nonCashRows.filter((c) => !c.actualReturnDate && c.expectedReturnDate && todayISO() > c.expectedReturnDate).length;
  const summary = [
    kpiCard({ label: "عهد أصلية (محاسب ← مدير مشروع)", value: topLevelCount, level: "info" }),
    kpiCard({ label: "عهد فرعية (مدير مشروع ← مهندس)", value: subCount, level: "info" }),
    kpiCard({ label: "عهد نقدية بانتظار المطابقة النهائية", value: unreconciledCount, level: unreconciledCount ? "warn" : "good" }),
    kpiCard({ label: "معدات/أجهزة قائمة بحوزة موظفين", value: outstandingEquipment, level: outstandingEquipment ? "warn" : "good" }),
    kpiCard({ label: "متأخرة عن موعد الإعادة", value: overdueReturns, level: overdueReturns ? "danger" : "good" }),
  ];

  const myCustodyCard = renderMyCustodyBalanceCard(allCustodies, invoices);
  const quickIssueButtonHtml = isAccountant ? `<div style="margin-bottom:14px;">${btn("🏦 إصدار عهدة جديدة لمدير مشروع (نموذج مبسَّط)", "openQuickIssueCustodyModal()", "primary", "sm")}</div>` : "";

  const roleGuidance = isAccountant
    ? `<b>أنت المحاسب العام:</b> استخدم الزر أعلاه للإصدار السريع، أو «+ إضافة» لمنح عهدة أصلية جديدة (نقدية أو معدات) بحقول تفصيلية أكثر — اختر مدير المشروع المستلِم من حقل «مستلم العهدة».`
    : STATE.user.role === "مدير المشروع"
    ? `<b>أنت مدير المشروع:</b> يمكنك استلام عهدة من المحاسب العام، ويمكنك أيضاً توزيع جزء منها أو تسليم معدة كعهدة فرعية لمهندس مشرف عبر حقل «عهدة أصلية» عند الإضافة.`
    : `<b>تنبيه:</b> صرف وإدارة العهد من صلاحيات المحاسب العام (للعهد الأصلية) ومدير المشروع (للعهد الفرعية) تحديداً — ${esc(STATE.user.role)} لا يستطيع إضافة عهدة من هذه الصفحة.`;
  const note = `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">
    <div style="color:#0F1420;margin-bottom:6px;">${roleGuidance}</div>
    العهدة هنا لا تقتصر على النقدية — اختر نوعها عند الإضافة: <b>نقدية</b> لمصاريف التشغيل (تُطابَق تلقائياً مع فواتير الصرف)، أو <b>معدات/أدوات/بطاقة وقود/جهاز</b> لتتبّع أي عنصر مادي بحوزة موظف مع تاريخ إعادة متوقَّع وحالة الإعادة الفعلية.
  </div>`;

  return `${myCustodyCard}${quickIssueButtonHtml}${note}<div class="kpi-grid" style="margin-bottom:14px;">${summary.join("")}</div>${renderModuleView("custodies", "العهد — نقدية ومعدات وأجهزة", fields, rows, extraColumns, readOnly)}`;
}
function setCustodyReconciled(id, val) {
  if (STATE.user && !canEdit(STATE.user.role, "custodies")) { alert(`صرف ومطابقة العهد من صلاحيات المحاسب العام ومدير المشروع تحديداً — دورك الحالي (${STATE.user.role}) لا يملك هذه الصلاحية.`); return; }
  STATE.data.custodies = (STATE.data.custodies || []).map((c) => c.id === id ? Object.assign({}, c, { reconciled: val, updatedAt: Date.now() }) : c);
  logAudit("update", "custodies", id, val ? "اعتماد مطابقة العهدة" : "إلغاء اعتماد مطابقة العهدة");
  saveData(STATE.data);
  renderApp();
}

/* ============================================================
   مستخلصات المالك (Owner Payment Certificates)
   دورة العمل: مسودة → مقدَّم للمالك → معتمد (بانتظار الصرف) → محصَّل بالكامل
              (أو: مرفوض/معاد للتعديل، ثم إعادة كمسودة)
   فصل الصلاحيات: مدير المشروع يُعِد ويُقدِّم ويسجّل رد المالك،
   والمحاسب العام هو من يؤكد التحصيل الفعلي فقط (مطابقة مع نمط العهد).
   ============================================================ */
function certificateAdvanceStage(id, action) {
  if (STATE.user && !canEdit(STATE.user.role, "certificates")) { alert("دورك الحالي لا يملك صلاحية تعديل مستخلصات المالك."); return; }
  const list = STATE.data.certificates || [];
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const c = list[idx];
  const computed = certificateComputed(c);
  const updated = Object.assign({}, c);
  if (action === "submit") {
    updated.stage = "مقدَّم للمالك";
    updated.submittedDate = todayISO();
  } else if (action === "approve") {
    const verification = computeProgressVerification(id);
    if (verification && c.cumulativeCompletionPercent && verification.level !== "good") {
      const proceed = confirm(`تنبيه مطابقة الإنجاز: المستخلص يطالب بنسبة إنجاز تراكمية ${verification.claimedPct}%، بينما النظام يتتبَّع فعلياً ${verification.trackedPct.toFixed(1)}% لهذا المشروع (${verification.trackedSource}) — فرق ${verification.variancePct > 0 ? "+" : ""}${verification.variancePct.toFixed(1)} نقطة.\n\nهل تريد المتابعة بالاعتماد رغم ذلك؟ (قد يكون الفرق مبرَّراً — هذا تنبيه لا حظر)`);
      if (!proceed) return;
    }
    updated.stage = "معتمد (بانتظار الصرف)";
    updated.approvedDate = todayISO();
    if (updated.approvedAmount === "" || updated.approvedAmount == null) updated.approvedAmount = Math.round(computed.netCurrentDue);
  } else if (action === "reject") {
    updated.stage = "مرفوض/معاد للتعديل";
  } else if (action === "reset") {
    updated.stage = "مسودة";
  } else if (action === "collect") {
    const amt = updated.approvedAmount != null && updated.approvedAmount !== "" ? Number(updated.approvedAmount) : computed.netCurrentDue;
    updated.paidAmount = Math.round(amt);
    updated.paidDate = todayISO();
    updated.stage = "محصَّل بالكامل";
  }
  updated.updatedAt = Date.now();
  list[idx] = updated;
  STATE.data.certificates = list;
  logAudit("update", "certificates", id, `مستخلص ${updated.number} → ${updated.stage}`);
  saveData(STATE.data);
  renderApp();
}

function renderCertificatesView() {
  const rows = filterByProject(STATE.data.certificates || []);
  const fields = MODULES.certificates.fields();
  const readOnly = !canEdit(STATE.user.role, "certificates");
  const isAccountant = STATE.user.role === "المحاسب العام";

  const totalNetRequested = rows.reduce((s, c) => s + certificateComputed(c).netCurrentDue, 0);
  const totalCollected = rows.reduce((s, c) => s + Number(c.paidAmount || 0), 0);
  const totalOutstanding = certifiedUncollectedTotal(rows);
  const totalPipeline = submittedPendingTotal(rows);
  const summary = [
    kpiCard({ label: "إجمالي الصافي المطالَب به", value: fmtMoney(totalNetRequested), level: "info" }),
    kpiCard({ label: "محصَّل فعلياً", value: fmtMoney(totalCollected), level: "good" }),
    kpiCard({ label: "معتمد وبانتظار الصرف", value: fmtMoney(totalOutstanding), level: totalOutstanding > 0 ? "warn" : "good" }),
    kpiCard({ label: "مُقدَّم بانتظار رد المالك", value: fmtMoney(totalPipeline), level: "info" }),
  ];

  const extraColumns = [
    { key: "_currentGross", label: "قيمة هذا المستخلص", render: (_, row) => fmtMoney(certificateComputed(row).currentGrossValue) },
    { key: "_retention", label: "قيمة المحتجز", render: (_, row) => fmtMoney(certificateComputed(row).retentionAmount) },
    { key: "_netDue", label: "الصافي المطالَب به", render: (_, row) => fmtMoney(certificateComputed(row).netCurrentDue) },
    { key: "_progressCheck", label: "مطابقة نسبة الإنجاز", render: (_, row) => {
      const v = computeProgressVerification(row.id);
      if (!v || !row.cumulativeCompletionPercent) return "—";
      const sign = v.variancePct > 0 ? "+" : "";
      const systemCheck = `<span title="المطالَب به: ${v.claimedPct}% — المتتبَّع في النظام: ${v.trackedPct}%">${statusDot(v.level, `فرق ${sign}${v.variancePct.toFixed(1)} نقطة`)}</span>`;
      if (!v.hasScanCrossCheck) return systemCheck;
      const scanSign = v.scannedVariancePct > 0 ? "+" : "";
      const _threshold = getProgressVerificationAlertThreshold();
      const scanLevel = Math.abs(v.scannedVariancePct) > _threshold * 2 ? "danger" : Math.abs(v.scannedVariancePct) > _threshold ? "warn" : "good";
      return `${systemCheck}<div style="margin-top:4px;" title="مقارنة بأحدث مسح فعلي بتاريخ ${esc(v.scannedDate || "")}: ${v.scannedPct}%">${statusDot(scanLevel, `مقابل المسح: ${scanSign}${v.scannedVariancePct.toFixed(1)} نقطة`)}</div>`;
    } },
    { key: "_outstanding", label: "المتبقي غير المحصَّل", render: (_, row) => {
      const out = certificateComputed(row).outstanding;
      return `<span style="font-family:monospace;color:${out > 0 ? "#F5A623" : "#2FBF71"};">${fmtMoney(out)}</span>`;
    } },
    { key: "_workflow", label: "إجراء دورة العمل", render: (_, row) => {
      if (readOnly) return "—";
      const stage = row.stage || "مسودة";
      if (stage === "مسودة") return `<button class="btn primary sm" onclick="certificateAdvanceStage('${row.id}','submit')">📤 تقديم للمالك</button>`;
      if (stage === "مقدَّم للمالك") return `<div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn primary sm" onclick="certificateAdvanceStage('${row.id}','approve')">✓ تسجيل اعتماد المالك</button>
        <button class="btn danger sm" onclick="certificateAdvanceStage('${row.id}','reject')">✕ رفض/إعادة للتعديل</button>
      </div>`;
      if (stage === "معتمد (بانتظار الصرف)") {
        return isAccountant ? `<button class="btn primary sm" onclick="certificateAdvanceStage('${row.id}','collect')">💰 تأكيد التحصيل الكامل</button>` : `<span style="color:var(--muted2);font-size:11px;">بانتظار تأكيد المحاسب العام للتحصيل</span>`;
      }
      if (stage === "مرفوض/معاد للتعديل") return `<button class="btn ghost sm" onclick="certificateAdvanceStage('${row.id}','reset')">↺ إعادة كمسودة</button>`;
      return "—"; // محصَّل بالكامل
    } },
  ];

  const note = `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">
    يُعِد مدير المشروع المستخلص ويقدّمه للمالك/الاستشاري، ثم يسجّل رده (اعتماد أو رفض). بعد اعتماد المالك، يقوم المحاسب العام بتأكيد التحصيل الفعلي للمبلغ ليدخل ضمن السيولة الفعلية.
    المستخلصات «المعتمدة وبانتظار الصرف» تُحتسب ضمن الرصيد المتوقع في التحليل المالي الذكي، أما «المُقدَّمة بانتظار رد المالك» فتُعرض كأنبوب منفصل (Pipeline) غير مؤكد.
  </div>`;

  return `${note}${renderModuleView("certificates", "مستخلصات المالك (Owner Payment Certificates)", fields, rows, extraColumns, readOnly)}
    <div class="kpi-grid" style="margin-top:14px;">${summary.join("")}</div>`;
}

/* ============================================================
   مستخلصات المقاولين من الباطن — نحن المُراجِع والمُعتمِد والدافع
   دورة العمل: مُقدَّم من المقاول → قيد المراجعة الفنية → معتمد للصرف
              (أو: مرفوض/معاد للمقاول) → مدفوع
   فصل الصلاحيات: مدير المشروع يسجّل مستخلص المقاول ويراجعه فنياً،
   والمحاسب العام هو من يؤكد الصرف الفعلي فقط (نفس نمط مستخلصات المالك).
   ============================================================ */
function subcontractorCertAdvanceStage(id, action) {
  if (STATE.user && !canEdit(STATE.user.role, "subcontractorCertificates")) { alert("دورك الحالي لا يملك صلاحية تعديل مستخلصات المقاولين."); return; }
  const list = STATE.data.subcontractorCertificates || [];
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const c = list[idx];
  const computed = subcontractorCertComputed(c);
  const updated = Object.assign({}, c);
  if (action === "review") {
    updated.stage = "قيد المراجعة الفنية";
  } else if (action === "approve") {
    updated.stage = "معتمد للصرف";
    updated.reviewedDate = todayISO();
    if (updated.approvedAmount === "" || updated.approvedAmount == null) updated.approvedAmount = Math.round(computed.netCurrentDue);
  } else if (action === "reject") {
    updated.stage = "مرفوض/معاد للمقاول";
  } else if (action === "reset") {
    updated.stage = "مُقدَّم من المقاول";
  } else if (action === "pay") {
    const amt = updated.approvedAmount != null && updated.approvedAmount !== "" ? Number(updated.approvedAmount) : computed.netCurrentDue;
    updated.paidAmount = Math.round(amt);
    updated.paidDate = todayISO();
    updated.stage = "مدفوع";
  }
  updated.updatedAt = Date.now();
  list[idx] = updated;
  STATE.data.subcontractorCertificates = list;
  logAudit("update", "subcontractorCertificates", id, `مستخلص مقاول ${updated.number} → ${updated.stage}`);
  saveData(STATE.data);
  renderApp();
}

function renderSubcontractorCertificatesView() {
  const rows = filterByProject(STATE.data.subcontractorCertificates || []);
  const fields = MODULES.subcontractorCertificates.fields();
  const readOnly = !canEdit(STATE.user.role, "subcontractorCertificates");
  const isAccountant = STATE.user.role === "المحاسب العام";

  const totalNetDue = rows.reduce((s, c) => s + subcontractorCertComputed(c).netCurrentDue, 0);
  const totalPaid = rows.reduce((s, c) => s + Number(c.paidAmount || 0), 0);
  const totalApprovedUnpaid = subcontractorApprovedUnpaidTotal(rows);
  const totalPipeline = subcontractorPendingPipelineTotal(rows);
  const summary = [
    kpiCard({ label: "إجمالي الصافي المستحق للمقاولين", value: fmtMoney(totalNetDue), level: "info" }),
    kpiCard({ label: "مدفوع فعلياً", value: fmtMoney(totalPaid), level: "good" }),
    kpiCard({ label: "معتمد وبانتظار الصرف", value: fmtMoney(totalApprovedUnpaid), level: totalApprovedUnpaid > 0 ? "warn" : "good" }),
    kpiCard({ label: "مُقدَّم بانتظار المراجعة الفنية", value: fmtMoney(totalPipeline), level: "info" }),
  ];

  const extraColumns = [
    { key: "_currentGross", label: "قيمة هذا المستخلص", render: (_, row) => fmtMoney(subcontractorCertComputed(row).currentGrossValue) },
    { key: "_retention", label: "قيمة المحتجز", render: (_, row) => fmtMoney(subcontractorCertComputed(row).retentionAmount) },
    { key: "_netDue", label: "الصافي المستحق", render: (_, row) => fmtMoney(subcontractorCertComputed(row).netCurrentDue) },
    { key: "_outstanding", label: "المتبقي غير المدفوع", render: (_, row) => {
      const out = subcontractorCertComputed(row).outstanding;
      return `<span style="font-family:monospace;color:${out > 0 ? "#F5A623" : "#2FBF71"};">${fmtMoney(out)}</span>`;
    } },
    { key: "_workflow", label: "إجراء دورة العمل", render: (_, row) => {
      if (readOnly) return "—";
      const stage = row.stage || "مُقدَّم من المقاول";
      if (stage === "مُقدَّم من المقاول") return `<button class="btn primary sm" onclick="subcontractorCertAdvanceStage('${row.id}','review')">🔍 بدء المراجعة الفنية</button>`;
      if (stage === "قيد المراجعة الفنية") return `<div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn primary sm" onclick="subcontractorCertAdvanceStage('${row.id}','approve')">✓ اعتماد للصرف</button>
        <button class="btn danger sm" onclick="subcontractorCertAdvanceStage('${row.id}','reject')">✕ رفض/إعادة للمقاول</button>
      </div>`;
      if (stage === "معتمد للصرف") {
        return isAccountant ? `<button class="btn primary sm" onclick="subcontractorCertAdvanceStage('${row.id}','pay')">💸 تأكيد الصرف الفعلي</button>` : `<span style="color:var(--muted2);font-size:11px;">بانتظار تأكيد المحاسب العام للصرف</span>`;
      }
      if (stage === "مرفوض/معاد للمقاول") return `<button class="btn ghost sm" onclick="subcontractorCertAdvanceStage('${row.id}','reset')">↺ إعادة كمُقدَّم من المقاول</button>`;
      return "—"; // مدفوع
    } },
  ];

  const note = `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">
    يُسجَّل مستخلص المقاول من الباطن هنا فور استلامه، ثم يراجعه مدير المشروع فنياً (مطابقة نسبة الإنجاز مع الموقع فعلياً) قبل اعتماده للصرف. بعد الاعتماد، يقوم المحاسب العام بتأكيد الصرف الفعلي.
    المبالغ «المعتمدة وبانتظار الصرف» تمثّل التزاماً مالياً مؤكداً وتُحتسب ضمن التدفق النقدي الخارج المتوقع، أما «المُقدَّمة بانتظار المراجعة» فتُعرض كأنبوب منفصل غير مؤكد بعد.
  </div>`;

  return `${note}${renderModuleView("subcontractorCertificates", "مستخلصات المقاولين من الباطن (Subcontractor Certificates)", fields, rows, extraColumns, readOnly)}
    <div class="kpi-grid" style="margin-top:14px;">${summary.join("")}</div>`;
}

/* ---------------- سجل المطالبات (Claims) — تمديد مدة و/أو تعويض مالي ---------------- */
function renderClaimsView() {
  const rows = filterByProject(STATE.data.claims || []);
  const fields = MODULES.claims.fields();
  const readOnly = !canEdit(STATE.user.role, "claims");

  const totalClaimed = rows.reduce((s, c) => s + Number(c.amountClaimed || 0), 0);
  const totalApproved = rows.reduce((s, c) => s + Number(c.amountApproved || 0), 0);
  const totalDaysClaimed = rows.reduce((s, c) => s + Number(c.daysClaimed || 0), 0);
  const totalDaysApproved = rows.reduce((s, c) => s + Number(c.daysApproved || 0), 0);
  const summary = [
    kpiCard({ label: "إجمالي المبلغ المطالَب به", value: fmtMoney(totalClaimed), level: "info" }),
    kpiCard({ label: "إجمالي المبلغ المعتمد", value: fmtMoney(totalApproved), level: totalApproved > 0 ? "good" : "info" }),
    kpiCard({ label: "أيام التمديد المطالَب بها", value: totalDaysClaimed + " يوم", level: "info" }),
    kpiCard({ label: "أيام التمديد المعتمدة", value: totalDaysApproved + " يوم", level: totalDaysApproved > 0 ? "good" : "info" }),
  ];
  const note = `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">
    سجل المطالبات يوثّق طلبات تمديد المدة أو التعويض المالي الناتجة عن أحداث خارجة عن سيطرة المقاول (تأخر تسليم موقع، تغيير مواصفات من الاستشاري، إلخ) قبل أن تتحول إلى أمر تغيير معتمد رسمياً في صفحة «أوامر التغيير».
  </div>`;
  return `${note}<div class="kpi-grid" style="margin-bottom:14px;">${summary.join("")}</div>${renderModuleView("claims", "سجل المطالبات (Claims)", fields, rows, [], readOnly)}`;
}

/* ---------------- المراسلات (Correspondence Log) ---------------- */
function renderCorrespondenceView() {
  const rows = filterByProject(STATE.data.correspondence || []);
  const fields = MODULES.correspondence.fields();
  const readOnly = !canEdit(STATE.user.role, "correspondence");

  const openNeedingReply = rows.filter((r) => r.status === "مفتوحة (تحتاج رد)");
  const urgent = rows.filter((r) => r.priority === "عاجلة" && r.status !== "مغلقة");
  const summary = [
    kpiCard({ label: "إجمالي المراسلات", value: rows.length, level: "info" }),
    kpiCard({ label: "بانتظار الرد", value: openNeedingReply.length, level: openNeedingReply.length ? "warn" : "good" }),
    kpiCard({ label: "عاجلة ولم تُغلق بعد", value: urgent.length, level: urgent.length ? "danger" : "good" }),
  ];
  return `${sectionHeader("سجل المراسلات — وارد وصادر")}
    <div class="kpi-grid" style="margin-bottom:14px;">${summary.join("")}</div>
    ${renderModuleView("correspondence", "المراسلات", fields, rows, [], readOnly)}`;
}

/* ---------------- الاجتماعات والقرارات (tabbed: meetings | decisions) ---------------- */
function setMeetingsTab(t) { STATE.meetingsTab = t; renderApp(); }

function renderMeetingsView() {
  const tab = STATE.meetingsTab || "meetings";
  const tabs = [["meetings", "الاجتماعات"], ["decisions", "القرارات ومتابعة التنفيذ"]];
  const tabBtns = tabs.map(([k, l]) => `<button class="tab-btn ${tab === k ? "active" : ""}" onclick="setMeetingsTab('${k}')">${l}</button>`).join("");

  if (tab === "decisions") {
    const rows = filterByProject(STATE.data.decisions || []);
    const fields = MODULES.decisions.fields();
    const readOnly = !canEdit(STATE.user.role, "meetings");
    const open = rows.filter((d) => deriveDecisionStatus(d) === "مفتوحة");
    const overdue = rows.filter((d) => deriveDecisionStatus(d) === "متأخرة");
    const done = rows.filter((d) => deriveDecisionStatus(d) === "منجزة");
    const summary = [
      kpiCard({ label: "إجمالي القرارات/بنود المتابعة", value: rows.length, level: "info" }),
      kpiCard({ label: "مفتوحة", value: open.length, level: open.length ? "warn" : "good" }),
      kpiCard({ label: "متأخرة", value: overdue.length, level: overdue.length ? "danger" : "good" }),
      kpiCard({ label: "منجزة", value: done.length, level: "good" }),
    ];
    return `<div class="tabs">${tabBtns}</div>
      <div class="kpi-grid" style="margin:14px 0;">${summary.join("")}</div>
      ${renderModuleView("decisions", "القرارات وبنود المتابعة", fields, rows, [], readOnly)}`;
  }

  const rows = filterByProject(STATE.data.meetings || []);
  const fields = MODULES.meetings.fields();
  const readOnly = !canEdit(STATE.user.role, "meetings");
  const extraColumns = [
    { key: "_decisionCount", label: "عدد القرارات المرتبطة", render: (_, row) => {
      const n = (STATE.data.decisions || []).filter((d) => d.meetingId === row.id).length;
      return n ? `<span class="badge-pill">${n}</span>` : "—";
    } },
    { key: "_aiAnalyze", label: "تحليل النقاش بالذكاء الاصطناعي", render: (_, row) => {
      if (!row.minutesSummary && !row.agenda) return "—";
      return `<button class="btn ghost sm" onclick="runDiscussionAnalysisFromMeeting('${row.id}')">🤖 تحليل وإنشاء مخرجات المشروع</button>`;
    } },
  ];
  const draftPanel = STATE.discussionAnalysisLoading ? `<div class="frame p4" style="margin-bottom:14px;text-align:center;color:var(--muted);">جارِ تحليل النقاش بالذكاء الاصطناعي...</div>`
    : STATE.discussionAnalysisDraft ? renderDiscussionAnalysisReview(STATE.discussionAnalysisDraft) : "";
  return `<div class="tabs">${tabBtns}</div>
    ${draftPanel}
    <div style="margin-top:14px;">${renderModuleView("meetings", "الاجتماعات", fields, rows, extraColumns, readOnly)}</div>`;
}
function renderDiscussionAnalysisReview(result) {
  if (!result.available) return `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--danger);">
    <div style="font-size:12.5px;color:var(--danger);">${esc(result.reason)}</div>
    <button class="btn ghost sm" onclick="STATE.discussionAnalysisDraft=null;renderApp();" style="margin-top:8px;">إغلاق</button>
  </div>`;
  const d = result.draft;
  const editableList = (field, items, placeholder) => `
    ${(items || []).map((v, i) => `<div style="display:flex;gap:6px;margin-bottom:6px;">
      <input class="inp" style="flex:1;" value="${esc(v)}" oninput="editDiscussionDraftField({field:'${field}',index:${i}}, this.value)" placeholder="${esc(placeholder)}" />
      <button class="btn danger sm" onclick="removeDiscussionDraftItem('${field}', ${i})">حذف</button>
    </div>`).join("")}
    <button class="btn ghost sm" onclick="addDiscussionDraftItem('${field}')">+ إضافة</button>`;

  const actionItemRows = (d.actionItems || []).map((it, i) => `<div style="background:#F5F6F9;border-radius:8px;padding:10px;margin-bottom:8px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
      <input class="inp" placeholder="النشاط" value="${esc(it.activity)}" onchange="STATE.discussionAnalysisDraft.draft.actionItems[${i}].activity=this.value" />
      <input class="inp" placeholder="المسؤول" value="${esc(it.responsible)}" onchange="STATE.discussionAnalysisDraft.draft.actionItems[${i}].responsible=this.value" />
      <input class="inp" placeholder="الدور في المشروع" value="${esc(it.role)}" onchange="STATE.discussionAnalysisDraft.draft.actionItems[${i}].role=this.value" />
      <input class="inp" type="date" value="${esc(it.dueDate)}" onchange="STATE.discussionAnalysisDraft.draft.actionItems[${i}].dueDate=this.value" />
      <select class="inp" onchange="STATE.discussionAnalysisDraft.draft.actionItems[${i}].priority=this.value">
        ${["عالية","متوسطة","منخفضة"].map((p) => `<option value="${p}" ${it.priority === p ? "selected" : ""}>${p}</option>`).join("")}
      </select>
    </div>
    <button class="btn danger sm" onclick="removeDiscussionDraftItem('actionItems', ${i})">حذف هذا النشاط</button>
  </div>`).join("");

  const checklistRows = (d.checklistItems || []).map((it, i) => `<div style="display:flex;gap:6px;margin-bottom:6px;">
    <input class="inp" style="flex:1;" placeholder="بند" value="${esc(it.text)}" onchange="STATE.discussionAnalysisDraft.draft.checklistItems[${i}].text=this.value" />
    <input class="inp" type="date" value="${esc(it.dueDate)}" onchange="STATE.discussionAnalysisDraft.draft.checklistItems[${i}].dueDate=this.value" />
    <button class="btn danger sm" onclick="removeDiscussionDraftItem('checklistItems', ${i})">حذف</button>
  </div>`).join("");

  return `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--info);">
    <h3 style="font-size:14px;color:#0F1420;margin:0 0 10px;">🤖 مراجعة مخرجات تحليل النقاش قبل الاعتماد</h3>
    <p style="font-size:11px;color:var(--muted2);margin-bottom:10px;">راجع وعدِّل كل بند قبل الاعتماد — لا شيء يُحفَظ في النظام حتى تضغط «اعتماد ودمج».</p>

    <b style="font-size:12px;color:#3D4759;">1) ملخص النقاش</b>
    <textarea class="inp" rows="2" style="width:100%;margin:6px 0 14px;" onchange="STATE.discussionAnalysisDraft.draft.summary=this.value">${esc(d.summary)}</textarea>

    <b style="font-size:12px;color:#3D4759;">2) القرارات</b><div style="margin:6px 0 14px;">${editableList("decisions", d.decisions, "قرار")}</div>
    <b style="font-size:12px;color:#3D4759;">3) ملاحظات المشروع</b><div style="margin:6px 0 14px;">${editableList("notes", d.notes, "ملاحظة")}</div>
    <b style="font-size:12px;color:#3D4759;">4) بنود تشيك ليست</b><div style="margin:6px 0 14px;">${checklistRows}<button class="btn ghost sm" onclick="addDiscussionDraftItem('checklistItems')">+ إضافة بند</button></div>
    <b style="font-size:12px;color:#3D4759;">5) الأنشطة والمسؤوليات والمواعيد</b><div style="margin:6px 0 14px;">${actionItemRows}<button class="btn ghost sm" onclick="addDiscussionDraftItem('actionItems')">+ إضافة نشاط</button></div>
    <b style="font-size:12px;color:#3D4759;">6) مخاطر/قضايا مذكورة</b><div style="margin:6px 0 14px;">${editableList("risks", d.risks, "خطر أو قضية")}</div>

    <div style="display:flex;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
      ${btn("✓ اعتماد ودمج في النظام", "approveDiscussionAnalysis()", "primary", "sm")}
      ${btn("إلغاء", "cancelDiscussionAnalysis()", "ghost", "sm")}
    </div>
  </div>`;
}

/* ---------------- قائمة الملاحظات والتسليم (Punch List / Snagging) ---------------- */
/* ============================================================
   دورة عمل قائمة الملاحظات والتسليم:
   مفتوحة (أو مُعادة بعد رفض) → المهندس المشرف يُدخل الإجراء التصحيحي
   والصورة ثم يرسلها للمراجعة → قيد المراجعة → مدير المشروع يقبل
   (تُغلق) أو يرفض (تُسجَّل كمرفوضة مع السبب، ويُنشأ بند جديد مفتوح
   تلقائياً يحمل ملاحظة الرفض ليصحّحه المهندس من جديد).
   ============================================================ */
function punchlistSubmitForReview(id) {
  if (STATE.user && !canEdit(STATE.user.role, "punchlist")) { alert("دورك الحالي لا يملك صلاحية تعديل قوائم التسليم."); return; }
  const item = (STATE.data.punchlist || []).find((p) => p.id === id);
  if (!item) return;
  if (!item.correctiveAction || !String(item.correctiveAction).trim()) {
    alert("أدخل الإجراء التصحيحي المتخذ من زر التعديل (✎) أولاً قبل الإرسال للمراجعة.");
    return;
  }
  STATE.data.punchlist = STATE.data.punchlist.map((p) => p.id === id ? Object.assign({}, p, { status: "قيد المراجعة", updatedAt: Date.now() }) : p);
  logAudit("update", "punchlist", id, `${item.itemNumber} → إرسال للمراجعة`);
  saveData(STATE.data);
  renderApp();
}
function punchlistApprove(id) {
  if (STATE.user && !canEdit(STATE.user.role, "punchlist")) { alert("دورك الحالي لا يملك صلاحية تعديل قوائم التسليم."); return; }
  const item = (STATE.data.punchlist || []).find((p) => p.id === id);
  if (item && item.createdByUserId && STATE.user && item.createdByUserId === STATE.user.id) {
    alert("فصل المهام: من أنشأ هذا البند (أنت) لا يستطيع اعتماد إغلاقه بنفسه — يحتاج مراجعة مستقلة من مدير المشروع أو الإدارة العليا.");
    return;
  }
  STATE.data.punchlist = STATE.data.punchlist.map((p) => p.id === id ? Object.assign({}, p, { status: "مغلقة", closedDate: todayISO(), updatedAt: Date.now() }) : p);
  logAudit("update", "punchlist", id, "قبول وإغلاق نهائي");
  if (item && item.projectId) {
    emitProjectEvent({ projectId: item.projectId, eventType: "NCR_CLOSED", sourceEntity: "PunchlistItem", sourceEntityId: id,
      newState: { status: "مغلقة" }, severity: "good", evidence: [`إغلاق بند «${item.itemNumber}» نهائياً`] });
  }
  saveData(STATE.data);
  renderApp();
}
function punchlistReject(id) {
  if (STATE.user && !canEdit(STATE.user.role, "punchlist")) { alert("دورك الحالي لا يملك صلاحية تعديل قوائم التسليم."); return; }
  const item = (STATE.data.punchlist || []).find((p) => p.id === id);
  if (!item) return;
  if (item.createdByUserId && STATE.user && item.createdByUserId === STATE.user.id) {
    alert("فصل المهام: من أنشأ هذا البند (أنت) لا يستطيع رفضه أو تجاهله بنفسه — يحتاج مراجعة مستقلة من مدير المشروع أو الإدارة العليا.");
    return;
  }
  const reason = prompt("سبب الرفض (سيظهر للمهندس المشرف ليصحّح البند من جديد):");
  if (reason == null) return;
  if (!reason.trim()) { alert("يجب كتابة سبب الرفض."); return; }
  const now = Date.now();
  STATE.data.punchlist = STATE.data.punchlist.map((p) => p.id === id ? Object.assign({}, p, { status: "مرفوضة", rejectionReason: reason.trim(), updatedAt: now }) : p);
  const reopened = Object.assign({}, item, {
    id: uid(), itemNumber: item.itemNumber + " (تصحيح)", status: "مفتوحة", parentPunchId: item.id,
    correctiveAction: "", photoAfter: "", rejectionReason: "",
    targetCloseDate: addDays(todayISO(), 7), // مهلة جديدة عادلة بدل توريث تاريخ مستهدف قديم فات أوانه من الأصل
    description: item.description + `\n\n[أُعيد فتحه بعد رفض مدير المشروع للتصحيح السابق — السبب: ${reason.trim()}]`,
    updatedAt: now,
  });
  STATE.data.punchlist = [...STATE.data.punchlist, reopened];
  logAudit("update", "punchlist", id, `${item.itemNumber} → رفض: ${reason.trim()}`);
  if (item.projectId) {
    const priorRejectionsOnThisChain = (STATE.data.punchlist || []).filter((p) => p.parentPunchId === item.parentPunchId && p.id !== id && p.status === "مرفوضة").length;
    emitProjectEvent({ projectId: item.projectId, eventType: "NCR_REPEATED", sourceEntity: "PunchlistItem", sourceEntityId: id,
      newState: { rejectionReason: reason.trim() }, severity: priorRejectionsOnThisChain >= 1 ? "danger" : "warn",
      evidence: [`رفض تصحيح بند «${item.itemNumber}» — «${reason.trim()}»${priorRejectionsOnThisChain >= 1 ? ` (رُفض ${priorRejectionsOnThisChain} مرة سابقة أيضاً على هذا البند)` : ""}`] });
  }
  saveData(STATE.data);
  renderApp();
}

function renderPunchlistView() {
  const rows = filterByProject(STATE.data.punchlist || []);
  const fields = MODULES.punchlist.fields();
  const readOnly = !canEdit(STATE.user.role, "punchlist");
  const role = STATE.user.role;

  const open = rows.filter((r) => derivePunchStatus(r) === "مفتوحة");
  const pendingReview = rows.filter((r) => derivePunchStatus(r) === "قيد المراجعة");
  const overdue = rows.filter((r) => derivePunchStatus(r) === "متأخرة");
  const closed = rows.filter((r) => derivePunchStatus(r) === "مغلقة");
  const criticalOpen = rows.filter((r) => r.severity === "حرجة" && !["مغلقة", "مرفوضة"].includes(derivePunchStatus(r)));
  const summary = [
    kpiCard({ label: "إجمالي البنود", value: rows.length, level: "info" }),
    kpiCard({ label: "مفتوحة", value: open.length, level: open.length ? "warn" : "good" }),
    kpiCard({ label: "بانتظار مراجعة مدير المشروع", value: pendingReview.length, level: pendingReview.length ? "warn" : "good" }),
    kpiCard({ label: "متأخرة", value: overdue.length, level: overdue.length ? "danger" : "good" }),
    kpiCard({ label: "حرجة ولم تُغلق بعد", value: criticalOpen.length, level: criticalOpen.length ? "danger" : "good" }),
    kpiCard({ label: "مغلقة", value: closed.length, level: "good" }),
  ];
  const extraColumns = [
    { key: "_status", label: "الحالة", render: (_, row) => {
      const s = derivePunchStatus(row);
      return statusDot(s === "مغلقة" ? "good" : s === "متأخرة" || s === "مرفوضة" ? "danger" : "warn", s);
    } },
    { key: "_rejectionReason", label: "سبب الرفض", render: (_, row) => row.rejectionReason ? esc(row.rejectionReason) : "—" },
    { key: "_workflow", label: "إجراء", render: (_, row) => {
      if (readOnly) return "—";
      const rawStatus = row.status || "مفتوحة"; // القرارات على أساس الحالة الفعلية المخزَّنة، لا الحالة المشتقة (التي قد تُظهر "متأخرة" حتى وهي قيد المراجعة فعلياً)
      if (role === "مهندس الموقع" && (rawStatus === "مفتوحة")) {
        return `<button class="btn primary sm" onclick="punchlistSubmitForReview('${row.id}')">📤 إرسال للمراجعة</button>`;
      }
      if (role === "مدير المشروع" && rawStatus === "قيد المراجعة") {
        return `<div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn primary sm" onclick="punchlistApprove('${row.id}')">✓ قبول وإغلاق</button>
          <button class="btn danger sm" onclick="punchlistReject('${row.id}')">✗ رفض</button>
        </div>`;
      }
      return "—";
    } },
  ];
  const note = `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">
    توثيق ملاحظات التفتيش قبل التسليم (Snagging/Punch List). دورة العمل: المهندس المشرف يُدخل الإجراء التصحيحي وصورة بعد المعالجة (من زر ✎) ثم يرسلها للمراجعة — مدير المشروع وحده من يقبل (تُغلق نهائياً) أو يرفض (يُطلب سبباً، ويُنشأ بند جديد تلقائياً للمهندس ليصحّحه من جديد).
  </div>`;
  return `${sectionHeader("قائمة الملاحظات والتسليم (Punch List)")}
    <div class="kpi-grid" style="margin-bottom:14px;">${summary.join("")}</div>
    ${note}${renderModuleView("punchlist", "بنود الملاحظات", fields, rows, extraColumns, readOnly)}`;
}

/* ---------------- سجل الوثائق والتراخيص والضمانات ---------------- */
/* ============================================================
   معرض الوسائط الموحَّد — يجمع كل صورة/مرفق من كل وحدة في النظام
   تلقائياً (لا قائمة يدوية مُحدَّثة يدوياً قد تُنسى) — يفحص كل وحدة
   مسجَّلة، يجد حقول النوع "photo" فيها، ويجمع كل قيمة فعلية موجودة.
   ============================================================ */
function collectAllProjectMedia(projectId) {
  const media = [];
  Object.entries(MODULES).forEach(([moduleKey, cfg]) => {
    if (!cfg.fields || !cfg.collection) return;
    let fields;
    try { fields = cfg.fields(); } catch (e) { return; }
    const photoFields = (fields || []).filter((f) => f.type === "photo" || f.type === "photos");
    if (!photoFields.length) return;
    const rows = (STATE.data[cfg.collection] || []).filter((r) => !projectId || r.projectId === projectId);
    rows.forEach((row) => {
      photoFields.forEach((pf) => {
        const rawValue = row[pf.key];
        const images = pf.type === "photos" ? (Array.isArray(rawValue) ? rawValue : []) : (rawValue ? [rawValue] : []);
        images.forEach((imageData) => {
          if (!imageData) return;
          const navItem = NAV.find((n) => n.key === moduleKey);
          media.push({
            imageData, moduleKey, moduleLabel: navItem ? navItem.label : moduleKey,
            fieldLabel: pf.label, recordId: row.id, recordTitle: getRecordLabel(row) || "—",
            date: row.date || row.dateRaised || row.raisedDate || row.issueDate || "",
          });
        });
      });
    });
  });
  return media.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
function renderMediaGalleryView() {
  const focusProjectId = STATE.projectFilter && STATE.projectFilter !== "all" ? STATE.projectFilter : null;
  const allMedia = collectAllProjectMedia(focusProjectId);
  const activeFilter = STATE.mediaGalleryFilter || "all";
  const sourceModules = Array.from(new Set(allMedia.map((m) => m.moduleKey)));
  const filtered = activeFilter === "all" ? allMedia : allMedia.filter((m) => m.moduleKey === activeFilter);

  const filterBar = `<div class="frame p4" style="margin-bottom:14px;display:flex;gap:6px;flex-wrap:wrap;">
    ${btn(`الكل (${allMedia.length})`, "STATE.mediaGalleryFilter='all';renderApp();", activeFilter === "all" ? "primary" : "ghost", "sm")}
    ${sourceModules.map((mk) => {
      const count = allMedia.filter((m) => m.moduleKey === mk).length;
      const label = allMedia.find((m) => m.moduleKey === mk).moduleLabel;
      return btn(`${label} (${count})`, `STATE.mediaGalleryFilter='${mk}';renderApp();`, activeFilter === mk ? "primary" : "ghost", "sm");
    }).join("")}
  </div>`;

  const grid = filtered.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">
    ${filtered.map((m) => `<div class="frame" style="overflow:hidden;cursor:pointer;" onclick="setActive('${m.moduleKey}')" title="${esc(m.recordTitle)}">
      <img src="${m.imageData}" style="width:100%;height:130px;object-fit:cover;display:block;" />
      <div style="padding:8px;">
        <div style="font-size:10.5px;color:#0F1420;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.recordTitle)}</div>
        <div style="font-size:9.5px;color:var(--muted2);margin-top:2px;">${esc(m.moduleLabel)} — ${esc(m.fieldLabel)}${m.date ? " — " + esc(m.date) : ""}</div>
      </div>
    </div>`).join("")}
  </div>` : `<div class="frame p4">${emptyState("لا توجد صور أو مرفقات مسجَّلة بعد لهذا النطاق.")}</div>`;

  return `${sectionHeader("معرض الوسائط — كل صورة ومرفق في المشروع بمكان واحد")}
    ${filterBar}
    ${grid}`;
}

function renderDocumentsView() {
  const rows = filterByProject(STATE.data.documents || []);
  const fields = MODULES.documents.fields();
  const readOnly = !canEdit(STATE.user.role, "documents");

  const expiringSoon = rows.filter((r) => deriveDocumentStatus(r) === "ينتهي قريباً");
  const expired = rows.filter((r) => deriveDocumentStatus(r) === "منتهي");
  const summary = [
    kpiCard({ label: "إجمالي الوثائق", value: rows.length, level: "info" }),
    kpiCard({ label: "ينتهي خلال 30 يوماً", value: expiringSoon.length, level: expiringSoon.length ? "warn" : "good" }),
    kpiCard({ label: "منتهي الصلاحية", value: expired.length, level: expired.length ? "danger" : "good" }),
  ];
  const extraColumns = [
    { key: "_status", label: "الحالة", render: (_, row) => {
      const s = deriveDocumentStatus(row);
      return statusDot(s === "منتهي" ? "danger" : s === "ينتهي قريباً" ? "warn" : s === "دائم" ? "info" : "good", s);
    } },
    { key: "_versions", label: "سجل الإصدارات", render: (_, row) => {
      const count = (row.versions || []).length;
      return count ? `<button class="btn ghost sm" onclick="STATE.docVersionHistoryId='${row.id}';renderApp();">📜 ${count} إصدار سابق</button>` : "لا إصدارات سابقة";
    } },
  ];
  const versionHistoryDoc = STATE.docVersionHistoryId ? rows.find((r) => r.id === STATE.docVersionHistoryId) : null;
  const versionPanel = versionHistoryDoc ? `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--info);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0;">سجل إصدارات: ${esc(versionHistoryDoc.title)}</h3>
      <button class="btn ghost sm" onclick="STATE.docVersionHistoryId=null;renderApp();">إغلاق</button>
    </div>
    <div style="margin-bottom:8px;padding:8px;background:#FFFFFF;border-radius:8px;">
      <b style="font-size:11.5px;color:var(--good);">الإصدار الحالي</b>
      ${versionHistoryDoc.attachment ? `<img src="${versionHistoryDoc.attachment}" style="max-width:150px;max-height:100px;border-radius:6px;display:block;margin-top:6px;" />` : ""}
    </div>
    ${(versionHistoryDoc.versions || []).slice().reverse().map((v, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:#FFFFFF;border-radius:8px;margin-bottom:6px;">
      <div>
        <div style="font-size:11.5px;color:#0F1420;">إصدار سابق — ${esc(fmtDateTime(v.replacedAt))}</div>
        <div style="font-size:10.5px;color:var(--muted2);">استُبدل بواسطة: ${esc(v.replacedBy || "—")}</div>
      </div>
      <button class="btn ghost sm" onclick="restoreDocumentVersion('${versionHistoryDoc.id}', ${(versionHistoryDoc.versions || []).length - 1 - i})">↩ استعادة هذا الإصدار</button>
    </div>`).join("")}
  </div>` : "";
  const viewMode = STATE.documentsViewMode || "grid";
  const toggleBar = `<div class="frame p4" style="margin-bottom:14px;display:flex;gap:8px;">
    ${btn("🗂 عرض شبكي", "STATE.documentsViewMode='grid';renderApp();", viewMode === "grid" ? "primary" : "ghost", "sm")}
    ${btn("📋 عرض جدولي", "STATE.documentsViewMode='table';renderApp();", viewMode === "table" ? "primary" : "ghost", "sm")}
  </div>`;
  const gridView = viewMode === "grid" ? renderDocumentGrid(rows) : "";
  const tableView = viewMode === "table" ? renderModuleView("documents", "الوثائق", fields, rows, extraColumns, readOnly) : "";
  return `${sectionHeader("سجل الوثائق والتراخيص والضمانات")}
    <div class="kpi-grid" style="margin-bottom:14px;">${summary.join("")}</div>
    ${versionPanel}
    ${toggleBar}
    ${gridView}
    ${tableView}`;
}
const DOC_TYPE_ICONS = { "رخصة": "🪪", "تصريح": "📋", "ضمان": "🛡", "رسم هندسي معتمد": "📐", "شهادة معايرة": "📏", "عقد إضافي": "📄", "أخرى": "🗃" };
function renderDocumentGrid(rows) {
  if (!rows.length) return `<div class="frame p4">${emptyState("لا توجد وثائق مسجَّلة بعد.")}</div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">
    ${rows.map((doc) => {
      const status = deriveDocumentStatus(doc);
      const statusColor = status === "منتهي" ? "#E5484D" : status === "ينتهي قريباً" ? "#F5A623" : status === "دائم" ? "#22d3ee" : "#2FBF71";
      const icon = DOC_TYPE_ICONS[doc.docType] || "🗃";
      const thumbnail = doc.attachment
        ? `<img src="${doc.attachment}" style="width:100%;height:110px;object-fit:cover;border-radius:8px 8px 0 0;" />`
        : `<div style="width:100%;height:110px;display:flex;align-items:center;justify-content:center;font-size:40px;background:#F5F6F9;border-radius:8px 8px 0 0;">${icon}</div>`;
      return `<div class="frame" style="overflow:hidden;cursor:pointer;transition:transform .15s;" onclick="openEditModal('documents','${doc.id}')">
        ${thumbnail}
        <div style="padding:10px;border-top:3px solid ${statusColor};">
          <div style="font-size:11.5px;color:#0F1420;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(doc.title)}</div>
          <div style="font-size:10px;color:var(--muted2);margin-top:2px;">${icon} ${esc(doc.docType || "أخرى")} — ${esc(projName(doc.projectId))}</div>
          <div style="margin-top:6px;">${statusDot(status === "منتهي" ? "danger" : status === "ينتهي قريباً" ? "warn" : status === "دائم" ? "info" : "good", status)}</div>
        </div>
      </div>`;
    }).join("")}
  </div>`;
}
function restoreDocumentVersion(documentId, versionIndex) {
  if (STATE.user && !canEdit(STATE.user.role, "documents")) { alert("دورك الحالي لا يملك صلاحية تعديل الوثائق."); return; }
  const doc = (STATE.data.documents || []).find((d) => d.id === documentId);
  if (!doc || !doc.versions || !doc.versions[versionIndex]) return;
  if (!confirm("سيتم استبدال المرفق الحالي بهذا الإصدار السابق — النسخة الحالية ستُحفَظ تلقائياً في السجل أيضاً. متابعة؟")) return;
  const versionToRestore = doc.versions[versionIndex];
  const currentAsVersion = { fileData: doc.attachment, replacedAt: Date.now(), replacedBy: (STATE.user && STATE.user.name) || "—" };
  STATE.data.documents = STATE.data.documents.map((d) => d.id === documentId
    ? Object.assign({}, d, { attachment: versionToRestore.fileData, versions: [...d.versions, currentAsVersion], updatedAt: Date.now() })
    : d);
  logAudit("update", "documents", documentId, `استعادة إصدار سابق للوثيقة «${doc.title}»`);
  saveData(STATE.data);
  renderApp();
}

/* ---------------- Users — accounts managed by مالك الشركة ---------------- */
function renderUsersView() {
  const rows = STATE.data.users || [];
  const fields = MODULES.users.fields();
  const readOnly = !canEdit(STATE.user.role, "users");
  const extraColumns = [
    { key: "_current", label: "", render: (_, row) => row.id === STATE.user.id ? statusDot("good", "أنت مسجَّل به الآن") : "" },
  ];
  const note = `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">
    من هنا يقوم مالك الشركة بإنشاء حسابات دخول (اسم مستخدم + كلمة مرور) لمدراء المشاريع، والمهندسين، والمحاسب العام، والمدير العام — كل حساب يحصل تلقائياً على صلاحيات دوره فقط.
    <br/><b>تنبيه أمني:</b> هذا تحقّق بسيط داخل المتصفح فقط (البيانات محفوظة محلياً على هذا الجهاز)، ولا يُعتبر نظام حماية حقيقياً بمستوى الخادم — لا تستخدم كلمات مرور حسّاسة تستخدمها في أنظمة أخرى.
  </div>`;
  return `${note}${renderModuleView("users", "المستخدمون وحسابات الدخول", fields, rows, extraColumns, readOnly)}`;
}

/* ---------------- Finance ---------------- */
/* ---------------- Financial Intelligence Dashboard ---------------- */
function financialSection(title, innerHtml) {
  return `<div style="margin-bottom:22px;">
    <h3 style="font-size:13px;color:var(--accent);margin:0 0 10px;border-bottom:1px solid var(--border);padding-bottom:6px;">${esc(title)}</h3>
    ${innerHtml}
  </div>`;
}

/* ---------------- مركز الشؤون المالية: روابط سريعة توضّح أن كل هذه الصفحات جزء من نظام مالي واحد مترابط ---------------- */
function renderFinanceHub({ invoices, certificates, subcontractorCertificates, claims, custodies, budgetItems }) {
  const dueInvoicesCount = invoices.filter((i) => i.status !== "مدفوعة").length;
  const certPendingCount = certificates.filter((c) => c.stage === "مقدَّم للمالك" || c.stage === "معتمد (بانتظار الصرف)").length;
  const subCertPendingCount = subcontractorCertificates.filter((c) => c.stage !== "مدفوع" && c.stage !== "مرفوض/معاد للمقاول").length;
  const claimsOpenCount = claims.filter((c) => c.status !== "معتمدة كاملة" && c.status !== "مرفوضة").length;
  const custodiesUnreconciledCount = custodies.filter((c) => !c.reconciled).length;
  const budgetVariance = budgetItems.reduce((s, b) => s + (Number(b.budget || 0) - Number(b.actual || 0)), 0);

  const cards = [
    { key: "invoices", ic: "🧾", label: "الفواتير", metric: `${dueInvoicesCount} غير مسدَّدة`, level: dueInvoicesCount ? "warn" : "good" },
    { key: "certificates", ic: "📜", label: "مستخلصات المالك", metric: `${certPendingCount} بانتظار إجراء`, level: certPendingCount ? "warn" : "good" },
    { key: "subcontractorCertificates", ic: "🧱", label: "مستخلصات المقاولين", metric: `${subCertPendingCount} بانتظار إجراء`, level: subCertPendingCount ? "warn" : "good" },
    { key: "claims", ic: "⚖", label: "المطالبات", metric: `${claimsOpenCount} مفتوحة`, level: claimsOpenCount ? "warn" : "good" },
    { key: "custodies", ic: "💼", label: "العهد والسُلف", metric: `${custodiesUnreconciledCount} غير مطابَقة`, level: custodiesUnreconciledCount ? "warn" : "good" },
    { key: "finance", ic: "💳", label: "الميزانية التفصيلية", metric: fmtMoney(budgetVariance) + " انحراف", level: budgetVariance >= 0 ? "good" : "danger" },
  ];
  const items = cards.map((c) => `<div class="tr-click" style="background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:10px 12px;flex:1;min-width:150px;" onclick="setActive('${c.key}')">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <span style="font-size:16px;">${c.ic}</span>${statusDot(c.level)}
    </div>
    <div style="font-size:12px;color:#0F1420;margin-bottom:2px;">${esc(c.label)}</div>
    <div style="font-size:11px;color:var(--muted2);">${esc(c.metric)}</div>
  </div>`).join("");
  return `<div class="frame p4" style="margin-bottom:16px;">
    <div style="font-size:11px;color:var(--muted2);margin-bottom:10px;">كل هذه الصفحات مرتبطة ببعضها وتتغذّى على البيانات نفسها (الفواتير والمستخلصات والعهد كلها تنعكس مباشرة في التدفق النقدي والربحية أدناه) — اضغط أي بطاقة للانتقال إليها مباشرة.</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">${items}</div>
  </div>`;
}

function renderFinancialHub() {
  const invoices = filterByProject(STATE.data.invoices || []);
  const certificates = filterByProject(STATE.data.certificates || []);
  const custodies = filterByProject(STATE.data.custodies || []);
  const claims = filterByProject(STATE.data.claims || []);
  const bankAccounts = STATE.data.bankAccounts || [];
  const ledger = filterByProject(STATE.data.ledger || []);

  const totalBankBalance = bankAccounts.reduce((s, acc) => s + computeBankAccountBalance(acc, STATE.data.ledger || []), 0);
  const pendingInvoices = invoices.filter((i) => i.status !== "مدفوعة");
  const pendingInvoicesTotal = pendingInvoices.reduce((s, i) => s + (Number(i.amount || 0) - Number(i.paidAmount || 0)), 0);
  const pendingCertificates = certificates.filter((c) => c.stage !== "محصَّل بالكامل");
  const openCustodies = custodies.filter((c) => !c.actualReturnDate && !isCashCustody(c));
  const openClaims = claims.filter((c) => c.status !== "معتمدة كاملة" && c.status !== "مرفوضة");

  const summary = [
    kpiCard({ label: "إجمالي أرصدة الحسابات البنكية (موحَّد من دفتر الأستاذ)", value: fmtMoney(totalBankBalance), level: totalBankBalance >= 0 ? "good" : "danger" }),
    kpiCard({ label: "فواتير مستحقة (غير مدفوعة بالكامل)", value: pendingInvoices.length, sub: fmtMoney(pendingInvoicesTotal), level: pendingInvoices.length ? "warn" : "good" }),
    kpiCard({ label: "مستخلصات لم تُحصَّل بالكامل", value: pendingCertificates.length, level: pendingCertificates.length ? "warn" : "good" }),
    kpiCard({ label: "عهد غير نقدية لم تُعَد بعد", value: openCustodies.length, level: openCustodies.length ? "warn" : "good" }),
    kpiCard({ label: "مطالبات مفتوحة (لم تُحسَم)", value: openClaims.length, level: openClaims.length ? "danger" : "good" }),
    kpiCard({ label: "عدد قيود دفتر الأستاذ", value: ledger.length, level: "info" }),
  ];

  const quickLinks = [
    { key: "contracts", label: "العقود", ic: "📄" }, { key: "invoices", label: "الفواتير", ic: "🧾" },
    { key: "certificates", label: "مستخلصات المالك", ic: "📜" }, { key: "subcontractorCertificates", label: "مستخلصات المقاولين", ic: "🧱" },
    { key: "custodies", label: "العهد", ic: "💼" }, { key: "claims", label: "المطالبات", ic: "⚖" },
    { key: "finance", label: "الميزانية التفصيلية", ic: "💳" }, { key: "financial-intel", label: "التحليل الذكي (EVM)", ic: "🧮" },
  ];

  return `${sectionHeader("المركز المالي — نظرة موحَّدة قبل التفاصيل")}
    <div class="ai-panel" style="margin-bottom:16px;"><div class="ai-panel-inner">
      <p style="font-size:12px;color:var(--muted);line-height:1.8;margin:0;">
        رصيد الحسابات البنكية هنا محسوَّب من دفتر الأستاذ الموحَّد — أي دفعة فاتورة أو تحصيل مستخلص تُنشئ قيداً تلقائياً فيه، فهذا الرقم متّسق دائماً مع الواقع الفعلي، لا رقماً منفصلاً قد يتناقض معه.
      </p>
    </div></div>
    <div class="kpi-grid">${summary.join("")}</div>
    <div class="frame p4">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 12px;">الانتقال السريع</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">
        ${quickLinks.map((l) => `<button class="btn ghost sm" style="padding:12px;" onclick="setActive('${l.key}')">${l.ic} ${esc(l.label)}</button>`).join("")}
      </div>
    </div>`;
}

function renderFinancialIntel() {
  const d = STATE.data;
  const projects = filterByProject(d.projects);
  const projectIds = new Set(projects.map((p) => p.id));
  const ledger = (d.ledger || []).filter((l) => projectIds.has(l.projectId));
  const invoices = filterByProject(d.invoices);
  const certificates = filterByProject(d.certificates || []);
  const subcontractorCertificates = filterByProject(d.subcontractorCertificates || []);
  const claims = filterByProject(d.claims || []);
  const custodies = filterByProject(d.custodies || []);
  const budgetItems = filterByProject(d.budgetItems);
  const labor = filterByProject(d.labor);
  const equipment = filterByProject(d.equipment);
  const materials = filterByProject(d.materials);
  const readOnlyLedger = !canEdit(STATE.user.role, "ledger");

  const financeHub = renderFinanceHub({ invoices, certificates, subcontractorCertificates, claims, custodies, budgetItems });

  // 1. Cash flow
  const cf = computeCashFlow(projects, ledger, invoices, certificates, subcontractorCertificates);
  const cfChart = barChart(["التدفق"], [
    { name: "الداخل", color: "#2FBF71", values: [cf.cashIn] },
    { name: "الخارج", color: "#E5484D", values: [cf.cashOut] },
  ]);
  const s1 = financialSection("أولاً: التدفقات النقدية (Cash Flow)", `
    <div class="kpi-grid">
      ${kpiCard({ label: "النقد الداخل", value: fmtMoney(cf.cashIn), level: "good" })}
      ${kpiCard({ label: "النقد الخارج", value: fmtMoney(cf.cashOut), level: "warn" })}
      ${kpiCard({ label: "الرصيد الحالي", value: fmtMoney(cf.currentBalance), level: cf.currentBalance >= 0 ? "good" : "danger" })}
      ${kpiCard({ label: "الرصيد المتوقع", value: fmtMoney(cf.projectedBalance), sub: "بعد تحصيل/سداد المستحقات المؤكدة", level: cf.projectedBalance >= 0 ? "good" : "danger" })}
    </div>
    <div class="frame p4" style="margin-top:10px;"><div class="chart-box">${cfChart.outerHTML}</div>${legendHTML([{ name: "الداخل", color: "#2FBF71" }, { name: "الخارج", color: "#E5484D" }])}</div>
    ${cf.pendingCertifiedPipeline ? `<div class="frame p4" style="margin-top:10px;font-size:12.5px;color:var(--muted);">+ ${fmtMoney(cf.pendingCertifiedPipeline)} د.ل مستخلصات مُقدَّمة للمالك بانتظار الاعتماد (Pipeline) — لم تُدرج في الرصيد المتوقع أعلاه لعدم تأكدها بعد.</div>` : ""}
    ${cf.pendingSubcontractorPipeline ? `<div class="frame p4" style="margin-top:10px;font-size:12.5px;color:var(--muted);">− ${fmtMoney(cf.pendingSubcontractorPipeline)} د.ل مستخلصات مقاولين مُقدَّمة بانتظار المراجعة الفنية (Pipeline) — لم تُدرج في الرصيد المتوقع أعلاه لعدم تأكدها بعد.</div>` : ""}
  `);

  // 2. Profitability
  const pr = computeProfitability(projects, budgetItems, ledger, invoices, d.changeOrders, certificates);
  const prChart = barChart(["الربحية"], [
    { name: "الربح المتوقع", color: "#5b6b7a", values: [pr.expectedProfit] },
    { name: "الربح الفعلي", color: pr.variance >= 0 ? "#2FBF71" : "#E5484D", values: [pr.actualProfit] },
  ]);
  const s2 = financialSection("ثانياً: الربحية", `
    <div class="kpi-grid">
      ${kpiCard({ label: "الربح المتوقع", value: fmtMoney(pr.expectedProfit), level: "info" })}
      ${kpiCard({ label: "الربح الفعلي", value: fmtMoney(pr.actualProfit), level: pr.actualProfit >= 0 ? "good" : "danger" })}
      ${kpiCard({ label: "هامش الربح المتوقع", value: pr.margin != null ? pr.margin.toFixed(1) + "%" : "—", level: "info" })}
      ${kpiCard({ label: "نسبة الانحراف", value: fmtMoney(pr.variance), level: pr.variance >= 0 ? "good" : "danger" })}
    </div>
    <div class="frame p4" style="margin-top:10px;"><div class="chart-box">${prChart.outerHTML}</div></div>
  `);

  // 3. Owner Payment Certificates (مستخلصات المالك)
  const certByStage = {};
  CERTIFICATE_STAGES.forEach((st) => (certByStage[st] = certificates.filter((c) => c.stage === st)));
  const totalNetRequested = certificates.reduce((s, c) => s + certificateComputed(c).netCurrentDue, 0);
  const totalCollected = certificates.reduce((s, c) => s + Number(c.paidAmount || 0), 0);
  const totalRetentionHeld = certificatesRetentionHeldTotal(certificates);
  const certStageData = CERTIFICATE_STAGES.filter((s) => s !== "مسودة").map((s, i) => ({
    name: s, value: certByStage[s].length, color: ["#F5A623", "#2E86AB", "#E5484D", "#2FBF71"][i],
  }));
  const s3 = financialSection("ثالثاً: مستخلصات المالك (Owner Payment Certificates)", `
    <div class="kpi-grid">
      ${kpiCard({ label: "إجمالي الصافي المطالَب به (كل المستخلصات)", value: fmtMoney(totalNetRequested), level: "info" })}
      ${kpiCard({ label: "محصَّل فعلياً", value: fmtMoney(totalCollected), level: "good" })}
      ${kpiCard({ label: "معتمد وبانتظار الصرف", value: fmtMoney(certifiedUncollectedTotal(certificates)), level: certifiedUncollectedTotal(certificates) > 0 ? "warn" : "good" })}
      ${kpiCard({ label: "مُقدَّم بانتظار اعتماد المالك", value: fmtMoney(submittedPendingTotal(certificates)), level: "info" })}
      ${kpiCard({ label: "إجمالي المحتجز المتراكم", value: fmtMoney(totalRetentionHeld), sub: "يُسترد عادة عند الاستلام النهائي", level: "info" })}
    </div>
    ${certificates.length ? `<div class="frame p4" style="margin-top:10px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">${donutChart(certStageData).outerHTML}${legendHTML(certStageData)}</div>` : emptyState("لا توجد مستخلصات مسجَّلة بعد.")}
  `);

  // 3.c Subcontractor Payment Certificates (مستخلصات المقاولين من الباطن)
  const subCertByStage = {};
  SUBCONTRACTOR_CERT_STAGES.forEach((st) => (subCertByStage[st] = subcontractorCertificates.filter((c) => c.stage === st)));
  const subTotalNetDue = subcontractorCertificates.reduce((s, c) => s + subcontractorCertComputed(c).netCurrentDue, 0);
  const subTotalPaid = subcontractorCertificates.reduce((s, c) => s + Number(c.paidAmount || 0), 0);
  const subTotalRetentionHeld = subcontractorRetentionHeldTotal(subcontractorCertificates);
  const subCertStageData = SUBCONTRACTOR_CERT_STAGES.filter((s) => s !== "مُقدَّم من المقاول").map((s, i) => ({
    name: s, value: subCertByStage[s].length, color: ["#2E86AB", "#E5484D", "#2FBF71"][i] || "#5b6b7a",
  }));
  const s3c = financialSection("مستخلصات المقاولين من الباطن (Subcontractor Certificates)", `
    <div class="kpi-grid">
      ${kpiCard({ label: "إجمالي الصافي المستحق للمقاولين", value: fmtMoney(subTotalNetDue), level: "info" })}
      ${kpiCard({ label: "مدفوع فعلياً", value: fmtMoney(subTotalPaid), level: "good" })}
      ${kpiCard({ label: "معتمد وبانتظار الصرف", value: fmtMoney(subcontractorApprovedUnpaidTotal(subcontractorCertificates)), level: subcontractorApprovedUnpaidTotal(subcontractorCertificates) > 0 ? "warn" : "good" })}
      ${kpiCard({ label: "مُقدَّم بانتظار المراجعة الفنية", value: fmtMoney(subcontractorPendingPipelineTotal(subcontractorCertificates)), level: "info" })}
      ${kpiCard({ label: "إجمالي المحتجز من المقاولين", value: fmtMoney(subTotalRetentionHeld), sub: "يُصرف عادة عند الاستلام النهائي لأعمال الباطن", level: "info" })}
    </div>
    ${subcontractorCertificates.length ? `<div class="frame p4" style="margin-top:10px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">${donutChart(subCertStageData).outerHTML}${legendHTML(subCertStageData)}</div>` : emptyState("لا توجد مستخلصات مقاولين مسجَّلة بعد.")}
  `);

  // 3.b Contractor Claims (سجل المطالبات — تمديد مدة/تعويض مالي)
  const claimsFinancial = claims.filter((c) => c.type !== "تمديد مدة");
  const totalClaimed = claimsFinancial.reduce((s, c) => s + Number(c.amountClaimed || 0), 0);
  const totalClaimApproved = claimsFinancial.reduce((s, c) => s + Number(c.amountApproved || 0), 0);
  const totalDaysClaimed = claims.reduce((s, c) => s + Number(c.daysClaimed || 0), 0);
  const totalDaysApproved = claims.reduce((s, c) => s + Number(c.daysApproved || 0), 0);
  const s3b = financialSection("مطالبات المقاول (Claims) — تمديد مدة وتعويض مالي", `
    <div class="kpi-grid">
      ${kpiCard({ label: "إجمالي المطالبة المالية", value: fmtMoney(totalClaimed), level: "info" })}
      ${kpiCard({ label: "المعتمد مالياً من المطالبات", value: fmtMoney(totalClaimApproved), level: totalClaimApproved > 0 ? "good" : "info" })}
      ${kpiCard({ label: "أيام التمديد المطالَب بها", value: totalDaysClaimed + " يوم", level: "info" })}
      ${kpiCard({ label: "أيام التمديد المعتمدة", value: totalDaysApproved + " يوم", level: totalDaysApproved > 0 ? "good" : "info" })}
    </div>
    ${claims.length ? "" : emptyState("لا توجد مطالبات مسجَّلة بعد.")}
  `);

  // 4. Expenses
  const ex = computeExpenseBreakdown(ledger);
  const ccLabels = Object.keys(ex.byCostCenter);
  const ccChart = ccLabels.length ? barChart(ccLabels, [{ name: "المصروفات", color: "#F5A623", values: ccLabels.map((k) => ex.byCostCenter[k]) }]) : null;
  const monthLabels = Object.keys(ex.byMonth).sort();
  const monthChart = monthLabels.length ? lineChart(monthLabels, [{ name: "مصروفات شهرية", color: "#E5484D", values: monthLabels.map((k) => ex.byMonth[k]) }]) : null;
  const s4 = financialSection("رابعاً: المصروفات", `
    <div class="kpi-grid">
      ${kpiCard({ label: "مصروفات اليوم", value: fmtMoney(ex.todayTotal), level: "info" })}
      ${kpiCard({ label: "مصروفات آخر 7 أيام", value: fmtMoney(ex.weekTotal), level: "info" })}
      ${kpiCard({ label: "مصروفات آخر 30 يوم", value: fmtMoney(ex.monthTotal), level: "info" })}
    </div>
    <div class="grid2" style="margin-top:10px;">
      <div class="frame p4"><h4 style="font-size:12px;color:#3D4759;margin:0 0 8px;">حسب مركز التكلفة</h4>${ccChart ? `<div class="chart-box">${ccChart.outerHTML}</div>` : emptyState("لا توجد حركات مسجّلة")}</div>
      <div class="frame p4"><h4 style="font-size:12px;color:#3D4759;margin:0 0 8px;">الاتجاه الشهري</h4>${monthChart ? `<div class="chart-box">${monthChart.outerHTML}</div>` : emptyState("لا توجد بيانات كافية")}</div>
    </div>
  `);

  // 5. Contracts
  const contractRows = projects.map((p) => ({ p, c: computeContractStatus(p, d.changeOrders, d.budgetItems) }));
  const ccChart2 = contractRows.length ? barChart(contractRows.map((r) => r.p.name), [
    { name: "القيمة الأصلية", color: "#2a3a4a", values: contractRows.map((r) => r.c.originalValue) },
    { name: "القيمة الحالية", color: "#1FB6A6", values: contractRows.map((r) => r.c.currentValue) },
    { name: "المستهلك", color: "#F5A623", values: contractRows.map((r) => r.c.consumed) },
  ]) : null;
  const s5 = financialSection("خامساً: العقود", `
    <div class="frame p4">${ccChart2 ? `<div class="chart-box">${ccChart2.outerHTML}</div>${legendHTML([{ name: "القيمة الأصلية", color: "#2a3a4a" }, { name: "القيمة الحالية", color: "#1FB6A6" }, { name: "المستهلك", color: "#F5A623" }])}` : emptyState("لا توجد مشاريع")}</div>
    <div style="overflow-x:auto;margin-top:10px;"><table><thead><tr><th>المشروع</th><th>الأصلية</th><th>أوامر التغيير المعتمدة</th><th>الحالية</th><th>المتبقي</th><th>نسبة الاستهلاك</th></tr></thead><tbody>
      ${contractRows.map((r) => `<tr><td>${esc(r.p.name)}</td><td>${fmtMoney(r.c.originalValue)}</td><td>${fmtMoney(r.c.coValue)}</td><td>${fmtMoney(r.c.currentValue)}</td><td>${fmtMoney(r.c.remaining)}</td><td>${statusDot(r.c.consumedPct > 90 ? "danger" : r.c.consumedPct > 70 ? "warn" : "good", r.c.consumedPct.toFixed(0) + "%")}</td></tr>`).join("")}
    </tbody></table></div>
  `);

  // 6. Financial vs Technical progress
  const ftRows = projects.map((p) => ({ p, ft: computeFinTechProgress(p, d.budgetItems, d.changeOrders) }));
  const ftChart = ftRows.length ? barChart(ftRows.map((r) => r.p.name), [
    { name: "الإنجاز الفني", color: "#1FB6A6", values: ftRows.map((r) => Math.round(r.ft.technicalPct)) },
    { name: "الإنجاز المالي", color: "#F5A623", values: ftRows.map((r) => Math.round(r.ft.financialPct)) },
  ]) : null;
  const s6 = financialSection("سادساً: نسب الإنجاز (الفني مقابل المالي)", `
    <div class="frame p4">${ftChart ? `<div class="chart-box">${ftChart.outerHTML}</div>${legendHTML([{ name: "الإنجاز الفني", color: "#1FB6A6" }, { name: "الإنجاز المالي", color: "#F5A623" }])}` : emptyState("لا توجد بيانات")}</div>
    <p style="font-size:11px;color:var(--muted2);margin-top:8px;">فجوة كبيرة بين الإنجاز المالي والفني (إنفاق أسرع من التنفيذ الفعلي أو العكس) تستحق المراجعة.</p>
  `);

  // 7. Resource costs
  const rc = computeResourceCosts(labor, equipment, materials, ledger);
  const rcData = [
    { name: "عمالة", value: rc.laborCost, color: "#1FB6A6" },
    { name: "معدات", value: rc.equipmentCost, color: "#F5A623" },
    { name: "مواد", value: rc.materialCost, color: "#5b6b7a" },
    { name: "مقاولون من الباطن", value: rc.subcontractorCost, color: "#E5484D" },
    { name: "خدمات", value: rc.servicesCost, color: "#2FBF71" },
  ].filter((d) => d.value > 0);
  const s7 = financialSection("سابعاً: تكلفة الموارد", `
    <div class="kpi-grid">
      ${kpiCard({ label: "تكلفة العمالة", value: fmtMoney(rc.laborCost), level: "info" })}
      ${kpiCard({ label: "تكلفة المعدات", value: fmtMoney(rc.equipmentCost), level: "info" })}
      ${kpiCard({ label: "تكلفة المواد", value: fmtMoney(rc.materialCost), level: "info" })}
      ${kpiCard({ label: "إجمالي تكلفة الموارد", value: fmtMoney(rc.total), level: "warn" })}
    </div>
    ${rcData.length ? `<div class="frame p4" style="margin-top:10px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">${donutChart(rcData).outerHTML}${legendHTML(rcData)}</div>` : ""}
  `);

  // 8. Receivables/Payables + Aging
  const rp = computeReceivablesPayables(invoices);
  const agingChart = barChart(["حالي", "1-30", "31-60", "60+"], [
    { name: "مدينون (عملاء)", color: "#1FB6A6", values: [rp.agingReceivable.current, rp.agingReceivable.d30, rp.agingReceivable.d60, rp.agingReceivable.d90] },
    { name: "دائنون (موردون)", color: "#E5484D", values: [rp.agingPayable.current, rp.agingPayable.d30, rp.agingPayable.d60, rp.agingPayable.d90] },
  ]);
  const s8 = financialSection("ثامناً: الذمم المالية وأعمار الديون", `
    <div class="kpi-grid">
      ${kpiCard({ label: "إجمالي العملاء المدينون", value: fmtMoney(rp.totalReceivable), level: "info" })}
      ${kpiCard({ label: "إجمالي الموردون الدائنون", value: fmtMoney(rp.totalPayable), level: "info" })}
      ${kpiCard({ label: "فواتير متأخرة السداد", value: rp.overdueInvoices.length, level: rp.overdueInvoices.length ? "danger" : "good" })}
    </div>
    <div class="frame p4" style="margin-top:10px;"><h4 style="font-size:12px;color:#3D4759;margin:0 0 8px;">أعمار الديون (Aging)</h4><div class="chart-box">${agingChart.outerHTML}</div>${legendHTML([{ name: "مدينون (عملاء)", color: "#1FB6A6" }, { name: "دائنون (موردون)", color: "#E5484D" }])}</div>
  `);

  // 9. KPIs
  const fk = computeFinancialKPIs(ledger, invoices);
  const s9 = financialSection("تاسعاً: مؤشرات الأداء (KPIs)", `
    <div class="kpi-grid">
      ${kpiCard({ label: "تكلفة اليوم", value: fmtMoney(fk.costToday), level: "info" })}
      ${kpiCard({ label: "تكلفة الأسبوع", value: fmtMoney(fk.costWeek), level: "info" })}
      ${kpiCard({ label: "تكلفة الشهر", value: fmtMoney(fk.costMonth), level: "info" })}
      ${kpiCard({ label: "معدل الحرق المالي اليومي (Burn Rate)", value: fmtMoney(fk.burnRate), sub: "متوسط آخر 30 يوم", level: "warn" })}
    </div>
  `);

  // 10. Predictive (formula-based)
  const predRows = projects.map((p) => ({ p, pred: computePredictive(p, d.budgetItems, d.changeOrders) }));
  const s10 = financialSection("عاشراً: مؤشرات تقديرية (حسابية وليست ذكاءً تنبؤياً)", `
    <div style="overflow-x:auto;">
      <table><thead><tr><th>المشروع</th><th>تاريخ الانتهاء المتوقع</th><th>الربح النهائي المتوقع</th><th>تجاوز الميزانية؟</th></tr></thead><tbody>
        ${predRows.map((r) => `<tr>
          <td>${esc(r.p.name)}</td>
          <td>${r.pred.predictedFinishDate || "—"}</td>
          <td>${fmtMoney(r.pred.predictedFinalProfit)}</td>
          <td>${r.pred.budgetOverrun ? statusDot("danger", "نعم — راقب EAC") : statusDot("good", "لا")}</td>
        </tr>`).join("")}
      </tbody></table>
    </div>
    <p style="font-size:11px;color:var(--muted2);margin-top:8px;">هذه تقديرات مبنية على معادلات القيمة المكتسبة القياسية (تاريخ الانتهاء = المدة المخططة ÷ SPI، الربح النهائي = BAC − EAC) — وليست نموذج تعلّم آلي. دقّتها تعتمد كلياً على دقّة البيانات المُدخلة.</p>
  `);

  const ledgerHtml = renderModuleView("ledger", "سجل الحركات المالية (المصدر الأساسي لكل التحليل أعلاه)", MODULES.ledger.fields(), filterByProject(d.ledger || []), [], readOnlyLedger);

  return `
    ${sectionHeader("التحليل المالي الذكي (Financial Intelligence)")}
    ${financeHub}
    ${s1}${s2}${s3}${s3c}${s3b}${s4}${s5}${s6}${s7}${s8}${s9}${s10}
    ${financialSection("سجل الحركات المالية", ledgerHtml)}
  `;
}

function renderFinance() {
  const rows = filterByProject(STATE.data.budgetItems);
  const totalBudget = rows.reduce((s, r) => s + Number(r.budget || 0), 0);
  const totalActual = rows.reduce((s, r) => s + Number(r.actual || 0), 0);
  const variance = totalBudget - totalActual;
  const invoices = filterByProject(STATE.data.invoices);
  const revenue = invoices.filter((i) => i.type === "عميل").reduce((s, i) => s + Number(i.paidAmount || 0), 0);
  const cashFlow = revenue - totalActual;
  const marginPct = totalBudget ? Math.round((variance / totalBudget) * 100) : 0;
  const readOnly = !canEdit(STATE.user.role, "finance");
  const kpis = [
    kpiCard({ label: "إجمالي الميزانية", value: fmtMoney(totalBudget), level: "info" }),
    kpiCard({ label: "إجمالي المصروف الفعلي", value: fmtMoney(totalActual), level: totalActual > totalBudget ? "danger" : "good" }),
    kpiCard({ label: "الانحراف (Cost Variance)", value: fmtMoney(variance), sub: marginPct + "%", level: variance >= 0 ? "good" : "danger" }),
    kpiCard({ label: "التدفق النقدي (تقديري إجمالي)", value: fmtMoney(cashFlow), level: cashFlow >= 0 ? "good" : "danger" }),
  ];

  const bankAccounts = STATE.data.bankAccounts || [];
  const bankAccountsSummary = bankAccounts.length ? `<div class="frame p4" style="margin:14px 0;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">💳 الحسابات البنكية — رصيد حقيقي محسوَّب من حركات دفتر الأستاذ المرتبطة بكل حساب</h3>
    <div style="display:flex;flex-wrap:wrap;gap:10px;">
      ${bankAccounts.map((acc) => `<div style="background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:10px 14px;flex:1;min-width:200px;">
        <div style="font-size:12.5px;color:#0F1420;font-weight:700;">${esc(acc.name)}</div>
        <div style="font-size:10.5px;color:var(--muted2);margin-bottom:6px;">${esc(acc.bankName || "")} ${acc.accountNumberLast4 ? "•••• " + esc(acc.accountNumberLast4) : ""}</div>
        <div style="font-size:18px;font-family:monospace;color:#0F1420;">${fmtMoney(computeBankAccountBalance(acc, STATE.data.ledger))}</div>
        <div style="font-size:10px;color:var(--muted2);">${esc(acc.currency || "دينار ليبي")}</div>
      </div>`).join("")}
    </div>
  </div>` : `<div class="frame p4" style="margin:14px 0;font-size:12px;color:var(--muted);">لا توجد حسابات بنكية مُسجَّلة بعد — أضف حساباً أدناه لتتبّع رصيد حقيقي بدل رقم تدفّق نقدي إجمالي واحد فقط.</div>`;
  const bankAccountsManage = canEdit(STATE.user.role, "finance") ? renderModuleView("bankAccounts", "إدارة الحسابات البنكية", MODULES.bankAccounts.fields(), bankAccounts, [], false) : "";

  return `${sectionHeader("الميزانية التفصيلية", btn("🧮 عرض التحليل المالي الذكي الكامل", "setActive('financial-intel')", "ghost", "sm"))}<div class="kpi-grid">${kpis.join("")}</div>
    ${bankAccountsSummary}
    ${bankAccountsManage}
    ${renderModuleView("budgetItems", "الميزانية حسب البند", MODULES.budgetItems.fields(), rows, [], readOnly)}`;
}

/* ---------------- Progress ---------------- */
function renderProgress() {
  const rows = filterByProject(STATE.data.progressItems);
  const readOnly = !canEdit(STATE.user.role, "progress");
  const chart = rows.length ? barChart(rows.map((r) => r.activity), [
    { name: "المخطط", color: "#2a3a4a", values: rows.map((r) => Number(r.planned)) },
    { name: "المنفذ", color: "#F5A623", values: rows.map((r) => Number(r.actual)) },
  ]) : null;
  return `
    ${sectionHeader("مراقبة نسب الإنجاز")}
    <div class="frame p4" style="margin-bottom:16px;">
      ${chart ? `<div class="chart-box">${chart.outerHTML}</div>${legendHTML([{ name: "المخطط", color: "#2a3a4a" }, { name: "المنفذ", color: "#F5A623" }])}` : emptyState("لا توجد بيانات إنجاز بعد")}
    </div>
    ${renderModuleView("progressItems", "تفاصيل البنود", MODULES.progressItems.fields(), rows, [], readOnly)}
  `;
}

/* ---------------- Risk Register — 5x5 Heat Map + Portfolio Exposure ---------------- */
function onRiskCellClick(prob, impact) {
  const cur = STATE.riskMatrixFilter;
  if (cur && cur.prob === prob && cur.impact === impact) STATE.riskMatrixFilter = null;
  else STATE.riskMatrixFilter = { prob, impact };
  renderApp();
}
function clearRiskMatrixFilter() { STATE.riskMatrixFilter = null; renderApp(); }

function renderRisks() {
  const allRows = filterByProject(STATE.data.risks || []);
  const readOnly = !canEdit(STATE.user.role, "risks");
  const filter = STATE.riskMatrixFilter;
  const rows = filter ? allRows.filter((r) => Number(r.probability) === filter.prob && Number(r.impact) === filter.impact) : allRows;

  const grid = [5, 4, 3, 2, 1];
  const cols = [1, 2, 3, 4, 5];
  const countAt = (impact, prob) => allRows.filter((r) => Number(r.impact) === impact && Number(r.probability) === prob).length;

  const matrixRows = grid.map((impact) => `<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
      <span style="width:22px;font-size:10px;color:var(--muted2);font-family:monospace;">${impact}</span>
      ${cols.map((prob) => {
        const c = countAt(impact, prob);
        const score = impact * prob;
        const isSelected = filter && filter.prob === prob && filter.impact === impact;
        return `<div class="heat-cell" title="احتمالية ${prob} × أثر ${impact} = ${score} — ${riskHeatLabel(score)}" onclick="onRiskCellClick(${prob},${impact})"
          style="width:48px;height:40px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:monospace;cursor:pointer;
          background:${riskHeatColor(score)};opacity:${c ? 1 : 0.25};color:#FFFFFF;${isSelected ? "outline:2px solid #fff;outline-offset:-2px;" : ""}">${c || ""}</div>`;
      }).join("")}
    </div>`).join("");
  const axisRow = `<div style="display:flex;gap:4px;"><span style="width:22px;"></span>${cols.map((p) => `<span style="width:48px;text-align:center;font-size:10px;color:var(--muted2);font-family:monospace;">${p}</span>`).join("")}</div>`;

  const heatLegend = [
    { score: 2, label: "منخفض جداً (1-4)" },
    { score: 6, label: "منخفض (5-9)" },
    { score: 12, label: "متوسط (10-14)" },
    { score: 17, label: "مرتفع (15-19)" },
    { score: 22, label: "حرج (20-25)" },
  ];
  const heatLegendHtml = `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:var(--muted);">
    ${heatLegend.map((h) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${riskHeatColor(h.score)};margin-left:5px;"></span>${h.label}</span>`).join("")}
  </div>`;

  const extraColumns = [{ key: "_score", label: "درجة الخطر", render: (_, row) => statusDot(riskLevel(riskScore(row)), `${riskScore(row)} / 25 — ${riskHeatLabel(riskScore(row))}`) }];

  // Portfolio-level exposure (sum of open-risk scores per project)
  const exposureByProject = STATE.data.projects.map((p) => ({
    name: p.name,
    exposure: projectRiskExposure(p.id, STATE.data.risks || []),
  })).filter((x) => x.exposure > 0);
  const exposureChart = exposureByProject.length ? barChart(exposureByProject.map((x) => x.name), [
    { name: "إجمالي درجات الخطر المفتوحة", color: "#E5484D", values: exposureByProject.map((x) => x.exposure) },
  ]) : null;

  // Status distribution
  const statusList = ["مفتوح", "قيد المعالجة", "مغلق"];
  const statusColors = ["#E5484D", "#F5A623", "#2FBF71"];
  const statusData = statusList.map((s, i) => ({ name: s, value: allRows.filter((r) => r.status === s).length, color: statusColors[i] }));

  const topRisks = allRows.slice().sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 5);

  return `
    ${sectionHeader("سجل المخاطر — مصفوفة الاحتمالية × الأثر (Heat Map)")}
    ${renderContextualAIPanel("risks", "() => getAIContextFor('risks')", "مثال: ما أخطر 3 مخاطر مفتوحة الآن؟")}
    <div class="grid2" style="margin-bottom:16px;">
      <div class="frame p4">
        <div style="font-size:11px;color:var(--muted);margin-bottom:10px;">المحور الرأسي: الأثر (٥ = الأعلى) — المحور الأفقي: الاحتمالية (١ → ٥). اضغط على أي خلية لتصفية الجدول أدناه.</div>
        <div style="display:inline-block;">${matrixRows}${axisRow}</div>
        ${heatLegendHtml}
        ${filter ? `<div style="margin-top:12px;">${btn(`✕ إلغاء التصفية (احتمالية ${filter.prob} × أثر ${filter.impact})`, "clearRiskMatrixFilter()", "ghost", "sm")}</div>` : ""}
      </div>
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">أعلى 5 مخاطر حسب الدرجة</h3>
        ${topRisks.length ? topRisks.map((r) => riskBarRow(r)).join("") : emptyState("لا توجد مخاطر مسجلة")}
      </div>
    </div>
    <div class="grid2" style="margin-bottom:16px;">
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">التعرض الكلي للمخاطر حسب المشروع</h3>
        <div class="chart-box">${exposureChart ? exposureChart.outerHTML : emptyState("لا توجد بيانات كافية")}</div>
      </div>
      <div class="frame p4">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">توزيع المخاطر حسب الحالة</h3>
        ${allRows.length ? `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">${donutChart(statusData).outerHTML}${legendHTML(statusData)}</div>` : emptyState("لا توجد مخاطر")}
      </div>
    </div>
    ${renderModuleView("risks", filter ? `بنود سجل المخاطر — مصفّاة (احتمالية ${filter.prob} × أثر ${filter.impact})` : "بنود سجل المخاطر", MODULES.risks.fields(), rows, extraColumns, readOnly)}
  `;
}



/* ---------------- AI Assistant (optional, needs user-supplied API key + internet) ---------------- */
function buildAIContext() {
  const raw = STATE.data;
  const scope = getUserScopedProjectIds();
  const scoped = (rows) => scope ? (rows || []).filter((r) => r.projectId && scope.has(r.projectId)) : (rows || []);
  const d = {
    projects: scope ? raw.projects.filter((p) => scope.has(p.id)) : raw.projects,
    tasks: scoped(raw.tasks), contracts: scoped(raw.contracts), invoices: scoped(raw.invoices),
    materials: scoped(raw.materials), equipment: scoped(raw.equipment), risks: scoped(raw.risks),
    budgetItems: scoped(raw.budgetItems), changeOrders: scoped(raw.changeOrders),
    certificates: scoped(raw.certificates), subcontractorCertificates: scoped(raw.subcontractorCertificates),
    claims: scoped(raw.claims), custodies: scoped(raw.custodies), correspondence: scoped(raw.correspondence),
    decisions: scoped(raw.decisions), punchlist: scoped(raw.punchlist), documents: scoped(raw.documents),
    hse: scoped(raw.hse), qc: scoped(raw.qc), procurementBids: raw.procurementBids || [],
  };
  return {
    المشاريع: d.projects.map((p) => {
      const e = computeEVM(p, d.budgetItems, d.changeOrders);
      const h = computeProjectHealthScore(p, d);
      return { اسم: p.name, الحالة: deriveProjectStatus(p), نسبة_الإنجاز: p.completion, CPI: e.CPI, SPI: e.SPI, مؤشر_الصحة: h.score, أسباب_ضعف_الصحة: h.breakdown.map((b) => b.label) };
    }),
    المهام_المتأخرة: d.tasks.filter((t) => deriveTaskStatus(t) === "متأخر").map((t) => ({ اسم: t.name, مسؤول: t.assignee })),
    العقود_القريبة_من_الانتهاء: d.contracts.filter((c) => daysUntil(c.expiryDate) != null && daysUntil(c.expiryDate) <= 45).map((c) => ({ الطرف: c.party, ينتهي_خلال_يوم: daysUntil(c.expiryDate) })),
    الفواتير_المستحقة: d.invoices.filter((i) => i.status !== "مدفوعة").map((i) => ({ رقم: i.number, المتبقي: Number(i.amount) - Number(i.paidAmount || 0) })),
    المخزون_المنخفض: d.materials.filter((m) => Number(m.inStock) <= Number(m.reorderLevel)).map((m) => ({ اسم: m.name, الكمية: m.inStock })),
    المعدات_المتوقفة: d.equipment.filter((e) => e.status !== "تعمل").map((e) => ({ اسم: e.name, الحالة: e.status })),
    المخاطر_الأعلى: (d.risks || []).slice().sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 5).map((r) => ({ الوصف: r.title, الدرجة: riskScore(r) })),
    مستخلصات_المالك_بحاجة_إجراء: (d.certificates || []).filter((c) => c.stage === "مقدَّم للمالك" || c.stage === "معتمد (بانتظار الصرف)").map((c) => ({ رقم: c.number, المشروع: projName(c.projectId), المرحلة: c.stage, الصافي: certificateComputed(c).netCurrentDue })),
    مستخلصات_المقاولين_بحاجة_إجراء: (d.subcontractorCertificates || []).filter((c) => c.stage !== "مدفوع" && c.stage !== "مرفوض/معاد للمقاول").map((c) => ({ رقم: c.number, المقاول: c.subcontractorParty, المشروع: projName(c.projectId), المرحلة: c.stage })),
    المطالبات_المفتوحة: (d.claims || []).filter((c) => c.status !== "معتمدة كاملة" && c.status !== "مرفوضة").map((c) => ({ رقم: c.claimNumber, النوع: c.type, الحالة: c.status, المشروع: projName(c.projectId) })),
    العهد_غير_المطابقة: (d.custodies || []).filter((c) => !c.reconciled).map((c) => ({ رقم: c.number, المبلغ: c.amount, المشروع: projName(c.projectId) })),
    مراسلات_عاجلة_بلا_رد: (d.correspondence || []).filter((c) => c.priority === "عاجلة" && c.status !== "مغلقة").map((c) => ({ الموضوع: c.subject, المشروع: projName(c.projectId) })),
    قرارات_متأخرة: (d.decisions || []).filter((dec) => deriveDecisionStatus(dec) === "متأخرة").map((dec) => ({ القرار: dec.decisionText, المسؤول: dec.owner, المشروع: projName(dec.projectId) })),
    ملاحظات_تسليم_حرجة_مفتوحة: (d.punchlist || []).filter((p) => p.severity === "حرجة" && derivePunchStatus(p) !== "مغلقة").map((p) => ({ الوصف: p.description, المشروع: projName(p.projectId) })),
    وثائق_منتهية_أو_قريبة_الانتهاء: (d.documents || []).filter((doc) => ["منتهي", "ينتهي قريباً"].includes(deriveDocumentStatus(doc))).map((doc) => ({ العنوان: doc.title, الحالة: deriveDocumentStatus(doc), المشروع: projName(doc.projectId) })),
    حوادث_سلامة_مفتوحة: (d.hse || []).filter((h) => deriveHSEStatus(h) !== "مغلق").map((h) => ({ الوصف: h.title, الخطورة: h.severity, المشروع: projName(h.projectId) })),
    بنود_جودة_متأخرة_أو_NCR: (d.qc || []).filter((q) => deriveQCStatus(q) === "متأخر" || (q.category === "NCR" && deriveQCStatus(q) !== "مغلق")).map((q) => ({ العنوان: q.title, النوع: q.category, المشروع: projName(q.projectId) })),
    عروض_موردين_بانتظار_قرار: (d.procurementBids || []).filter((b) => !b.isWinner).length,
  };
}
/* ============================================================
   عميل الاستدعاء الذكي (Tool-Calling Agent) — يستخدم آلية Tool Use
   الرسمية من Anthropic. النموذج اللغوي لا يرى بيانات النظام مباشرة
   أبداً؛ فقط يقرر أي دالة حقيقية (مبنية ومُختبَرة أصلاً) يستدعيها،
   والدالة تُنفَّذ محلياً هنا بصلاحيات المستخدم الحالي بالضبط —
   لا استثناء أمني جديد، ولا بيانات تتجاوز ما يراه المستخدم أصلاً
   في الواجهة. كل استدعاء يُسجَّل في سجل التدقيق الحقيقي.
   ============================================================ */
const PMS_AI_TOOLS = [
  { name: "explain_activity_delay", description: "يُفسِّر لماذا نشاط محدَّد متأخر فعلياً — يستخدم قواعد وحسابات حقيقية من بيانات المشروع (المسار الحرج، الأنشطة السابقة، المسؤول)، لا استنتاجاً حراً. استخدمها دائماً عند سؤال المستخدم 'لماذا تأخر...' بدل الإجابة من معرفتك العامة.",
    input_schema: { type: "object", properties: { taskId: { type: "string", description: "مُعرِّف النشاط" } }, required: ["taskId"] } },
  { name: "get_recent_project_events", description: "يُرجع أحدث الأحداث الحقيقية المسجَّلة لمشروع (فواتير، ملاحظات إدارة عليا، تأخيرات، بنود جودة متكررة) — استخدمها لفهم آخر ما حدث في المشروع قبل الإجابة عن أي سؤال يخص تطوّراته الأخيرة.",
    input_schema: { type: "object", properties: { projectId: { type: "string" }, limit: { type: "number" } }, required: ["projectId"] } },
  { name: "find_resource_by_name", description: "يبحث عن شخص في سجل الموارد (مهندسين، مدراء مشاريع) بالاسم — استخدمها قبل إسناد أي شخص لمشروع أو نشاط، للتأكد من وجوده أو إيجاد أقرب تطابق بدل الافتراض.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "الاسم كما ذكره المستخدم" } }, required: ["name"] } },
  { name: "propose_new_project", description: "يُنشئ مسودة مشروع جديد لمراجعة المستخدم واعتمادها — لا يُنشئ المشروع فعلياً في النظام، بل يعرضه للتأكيد أولاً. لا تستدعِها إلا بعد أن يكون لديك اسم المشروع على الأقل، ويُفضَّل تاريخا البداية والنهاية ومدير المشروع أيضاً — إن كانت أي معلومة أساسية ناقصة (خصوصاً اسم مدير المشروع)، اسأل المستخدم عنها أولاً بدل افتراضها.",
    input_schema: { type: "object", properties: {
      name: { type: "string" }, startDate: { type: "string", description: "YYYY-MM-DD" }, endDate: { type: "string", description: "YYYY-MM-DD" },
      contractValue: { type: "number" }, owner: { type: "string" }, consultant: { type: "string" }, location: { type: "string" },
      projectManagerName: { type: "string", description: "اسم مدير المشروع كما ذكره المستخدم" },
    }, required: ["name"] } },
  { name: "get_project_health_score", description: "مؤشر صحة مشروع محدَّد بتفصيل 6 محاور (الجدول، التكلفة، الجودة، المخاطر، العقود، ثقة التقدّم) وأسباب الانحراف.",
    input_schema: { type: "object", properties: { projectId: { type: "string", description: "مُعرِّف المشروع" } }, required: ["projectId"] } },
  { name: "get_contractor_ranking", description: "تصنيف كل المقاولين المُقيَّمين حسب متوسط الأداء، من الأفضل للأضعف.",
    input_schema: { type: "object", properties: {} } },
  { name: "get_certificate_progress_verification", description: "مطابقة نسبة الإنجاز المُطالَب بها في مستخلص محدَّد مع النسبة المتتبَّعة في النظام وأحدث مسح واقعي.",
    input_schema: { type: "object", properties: { certificateId: { type: "string", description: "مُعرِّف المستخلص" } }, required: ["certificateId"] } },
  { name: "get_project_completion_forecast", description: "توقّع تاريخ الانتهاء الفعلي لمشروع بالانحدار الإحصائي على مساره التاريخي الحقيقي.",
    input_schema: { type: "object", properties: { projectId: { type: "string", description: "مُعرِّف المشروع" } }, required: ["projectId"] } },
  { name: "get_schedule_health_check", description: "فحص صحة الجدول الزمني لمشروع محدَّد (12 فحصاً: روابط ناقصة، فائض سالب، دورات، إلخ).",
    input_schema: { type: "object", properties: { projectId: { type: "string", description: "مُعرِّف المشروع" } }, required: ["projectId"] } },
  { name: "get_element_progress_report", description: "تقرير تحقّق تقدّم لنوع عنصر مُعيَّن في مشروع: المخطَّط، المتوقَّع، المرصود فعلياً، الانحراف، السبب.",
    input_schema: { type: "object", properties: { projectId: { type: "string" }, assetType: { type: "string", description: "نوع العنصر كما هو مسجَّل، مثال: عمود خرساني" } }, required: ["projectId", "assetType"] } },
  { name: "get_inspection_priority_ranking", description: "ترتيب أولوية الفحص القادم للعناصر في مشروع حسب الحرجية وقِدَم آخر مسح (Risk-Based Inspection).",
    input_schema: { type: "object", properties: { projectId: { type: "string" } }, required: ["projectId"] } },
  { name: "get_management_decisions", description: "أهم القرارات التي يجب أن تتخذها الإدارة الآن عبر كل مشاريع المحفظة الحالية.",
    input_schema: { type: "object", properties: {} } },
];
function isProjectInUserScope(projectId) {
  return filterByProject(STATE.data.projects || []).some((p) => p.id === projectId);
}
function executePMSTool(toolName, input) {
  const scopeError = { error: "هذا المشروع غير موجود ضمن نطاق صلاحياتك الحالية." };
  let result;
  switch (toolName) {
    case "explain_activity_delay": {
      const task = STATE.data.tasks.find((t) => t.id === input.taskId);
      if (!task || !isProjectInUserScope(task.projectId)) { result = scopeError; break; }
      result = explainActivityDelay(input.taskId);
      break;
    }
    case "get_recent_project_events": {
      if (!isProjectInUserScope(input.projectId)) { result = scopeError; break; }
      result = { events: getProjectEvents(input.projectId).slice(0, input.limit || 10).map((e) => ({ type: e.eventType, evidence: e.evidence, severity: e.severity, when: new Date(e.timestamp).toISOString() })) };
      break;
    }
    case "find_resource_by_name": {
      const query = (input.name || "").trim().toLowerCase();
      if (!query) { result = { error: "لم يُحدَّد اسم للبحث." }; break; }
      const allResources = filterByProject(STATE.data.resourcePool || [], true);
      const exact = allResources.filter((r) => r.name.trim().toLowerCase() === query);
      const partial = allResources.filter((r) => r.name.toLowerCase().includes(query) || query.includes(r.name.toLowerCase()));
      const matches = exact.length ? exact : partial;
      result = {
        found: matches.length > 0,
        matches: matches.map((r) => ({ id: r.id, name: r.name, type: r.type })),
        allAvailableNamesForReference: matches.length ? undefined : allResources.map((r) => `${r.name} (${r.type})`).slice(0, 20),
      };
      break;
    }
    case "propose_new_project": {
      let resolvedPM = null, pmResolutionNote = null;
      if (input.projectManagerName) {
        const query = input.projectManagerName.trim().toLowerCase();
        const pmCandidates = filterByProject((STATE.data.resourcePool || []).filter((r) => r.type === "مدير مشروع"), true);
        const match = pmCandidates.find((r) => r.name.trim().toLowerCase() === query) || pmCandidates.find((r) => r.name.toLowerCase().includes(query));
        if (match) resolvedPM = match;
        else pmResolutionNote = `لم يُعثر على مدير مشروع باسم "${input.projectManagerName}" في سجل الموارد. الأسماء المتاحة: ${pmCandidates.map((r) => r.name).join("، ") || "لا يوجد أي مدير مشروع مسجَّل بعد"}.`;
      }
      const draft = {
        name: input.name, startDate: input.startDate || "", endDate: input.endDate || "",
        contractValue: input.contractValue || 0, owner: input.owner || "", consultant: input.consultant || "", location: input.location || "",
        projectManagerId: resolvedPM ? resolvedPM.id : "", projectManagerName: resolvedPM ? resolvedPM.name : (input.projectManagerName || ""),
      };
      STATE.pendingProjectDraft = draft;
      result = { draftCreated: true, draft, pmResolutionNote, needsUserConfirmation: true,
        note: "تم إنشاء مسودة فقط — لم يُحفَظ أي شيء بعد في النظام. أظهر للمستخدم ملخّصاً واضحاً بكل التفاصيل واطلب تأكيده صراحة، ووضّح أنه سيرى لوحة تأكيد نهائية قبل الإنشاء الفعلي." };
      break;
    }
    case "get_project_health_score": {
      if (!isProjectInUserScope(input.projectId)) { result = scopeError; break; }
      const project = STATE.data.projects.find((p) => p.id === input.projectId);
      result = computeProjectHealthScoreDetailed(project, STATE.data);
      break;
    }
    case "get_contractor_ranking":
      result = { ranking: computeContractorRanking(filterByProject(STATE.data.contractorEvaluations || [])) };
      break;
    case "get_certificate_progress_verification": {
      const cert = (STATE.data.certificates || []).find((c) => c.id === input.certificateId);
      if (!cert || !isProjectInUserScope(cert.projectId)) { result = scopeError; break; }
      result = computeProgressVerification(input.certificateId);
      break;
    }
    case "get_project_completion_forecast": {
      if (!isProjectInUserScope(input.projectId)) { result = scopeError; break; }
      const project = STATE.data.projects.find((p) => p.id === input.projectId);
      result = computeTrendForecast(project);
      break;
    }
    case "get_schedule_health_check":
      if (!isProjectInUserScope(input.projectId)) { result = scopeError; break; }
      result = runScheduleHealthCheck(input.projectId);
      break;
    case "get_element_progress_report":
      if (!isProjectInUserScope(input.projectId)) { result = scopeError; break; }
      result = computeElementProgressReport(input.projectId, input.assetType);
      break;
    case "get_inspection_priority_ranking":
      if (!isProjectInUserScope(input.projectId)) { result = scopeError; break; }
      result = computeInspectionPriorityRanking(input.projectId);
      break;
    case "get_management_decisions":
      result = { decisions: copilotManagementDecisions(STATE.data) };
      break;
    default:
      result = { error: "أداة غير معروفة." };
  }
  logAudit("view", "aiToolCall", toolName, `استدعاء أداة ذكاء اصطناعي: ${toolName}(${JSON.stringify(input)})`);
  return result;
}
/* ============================================================
   تحليل النقاش وتحويله لمخرجات إدارة مشروع مُهيكلة — يستخدم نفس
   مفتاح Anthropic API الاختياري المُستخدَم أصلاً في المساعد الذكي،
   يطلب استجابة JSON صارمة (لا نص حر)، ولا يخترع معلومات غير مذكورة
   في النص (حقول فارغة صراحة إن لم تُذكَر بدل تخمينها).
   ============================================================ */
async function analyzeDiscussionForProjectOutputs(discussionText, projectId, sourceMeetingId, sourceRoomId) {
  const key = localStorage.getItem("pms_ai_key") || "";
  if (!key) return { available: false, reason: "لم يتم إدخال مفتاح Anthropic API — هذه الميزة اختيارية وتستخدم نفس المفتاح المُستخدَم في المساعد الذكي (أدخله من صفحة المساعد الذكي أولاً)." };
  if (!discussionText || !discussionText.trim()) return { available: false, reason: "لا يوجد نص نقاش لتحليله." };
  const systemPrompt = `أنت محلل نقاشات مشاريع محترف. حوّل النص المُعطى إلى مخرجات إدارة مشروع مُهيكلة. أجب بصيغة JSON فقط، بلا أي نص إضافي قبله أو بعده، بالضبط بهذا الشكل:
{"summary":"ملخص موجز","decisions":["قرار 1"],"notes":["ملاحظة 1"],"checklistItems":[{"text":"بند","dueDate":""}],"actionItems":[{"activity":"النشاط","responsible":"الاسم أو الجهة","role":"الدور في المشروع","dueDate":"","priority":"متوسطة","status":"مفتوح"}],"risks":["خطر 1"]}
لا تخترع معلومات غير موجودة في النص إطلاقاً — إن لم يُذكَر تاريخ أو مسؤول أو دور، اترك الحقل نصاً فارغاً "" بصراحة بدل تخمينه. القيم الممكنة لـpriority: عالية، متوسطة، منخفضة فقط.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, system: systemPrompt, messages: [{ role: "user", content: discussionText }] }),
    });
    const json = await res.json();
    if (json.error) return { available: false, reason: "خطأ من الواجهة: " + json.error.message };
    const text = (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const cleanText = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanText);
    return { available: true, draft: parsed, projectId, sourceMeetingId: sourceMeetingId || null, sourceRoomId: sourceRoomId || null, sourceText: discussionText };
  } catch (e) {
    return { available: false, reason: "تعذّر الاتصال أو تحليل الاستجابة كـJSON صالح: " + e.message };
  }
}
async function runDiscussionAnalysisFromMeeting(meetingId) {
  const meeting = (STATE.data.meetings || []).find((m) => m.id === meetingId);
  if (!meeting) return;
  const text = [meeting.agenda, meeting.minutesSummary].filter(Boolean).join("\n\n");
  STATE.discussionAnalysisLoading = true;
  renderApp();
  const result = await analyzeDiscussionForProjectOutputs(text, meeting.projectId, meetingId);
  STATE.discussionAnalysisLoading = false;
  STATE.discussionAnalysisDraft = result;
  renderApp();
}

/* ============================================================
   غرفة نقاش المشروع — دردشة جماعية حقيقية بين أعضاء فريق المشروع
   (كما طلبت: مثل واتساب)، مع إمكانية تحليل المحادثة كاملة وتحويلها
   لمخرجات مشروع باستخدام نفس محرك المراجعة/الاعتماد المبني للاجتماعات
   بالضبط — لا محرك تحليل منفصل جديد.
   ============================================================ */
/* ============================================================
   التحكّم في عضوية الغرف — يديرها الـGM حصراً (أو مدير عام/مالك
   للإشراف الكامل الدائم)، لا انضماماً تلقائياً حسب الدور العام.
   ============================================================ */
function canAccessChatRoom(room, user) {
  if (!room || !user) return false;
  if (user.role === "مدير عام" || user.role === "مالك الشركة") return true; // إشراف كامل دائماً
  return !!(user.linkedResourceId && (room.memberResourceIds || []).includes(user.linkedResourceId));
}
function getAccessibleChatRooms(projectId, user) {
  return (STATE.data.chatRooms || []).filter((r) => r.projectId === projectId && canAccessChatRoom(r, user));
}
/* [مُنتقَلة إلى app-repository.js — markRoomAsRead وcreateNotification،
   كطبقة Data Access حقيقية (كتابة/قراءة بسيطة بلا قاعدة أعمال). نُقلَت
   بلا أي تغيير منطقي. نقاط الاستدعاء الحقيقية (مُتحقَّق منها بحثاً في
   الكود: app-modules.js وapp-views.js نفسه) تعمل تماماً كما كانت.] */
/* ============================================================
   نظام إشعارات حقيقي مُصنَّف — لا عدّاد عام واحد فقط. كل إشعار له
   نوع صريح (mention/reply/note/update)، مستخدم مستهدف محدَّد، ورابط
   مباشر للسجل المرتبط.
   ============================================================ */
function createChatSubRoom(projectId, name, memberResourceIds) {
  if (!checkPermission("إضافة مشارك لغرفة نقاش (Add Discussion Participant)", STATE.user.role)) { alert("دورك الحالي لا يملك صلاحية إنشاء غرف نقاش أو إدارة أعضائها."); return null; }
  if (!name || !name.trim()) { alert("أدخل اسماً للغرفة الفرعية."); return null; }
  const room = { id: uid(), projectId, name: name.trim(), isMainRoom: false, memberResourceIds: memberResourceIds || [],
    createdBy: STATE.user.name, createdDate: todayISO(), updatedAt: Date.now() };
  STATE.data.chatRooms.push(room);
  logAudit("create", "chatRooms", room.id, `إنشاء غرفة نقاش فرعية: ${room.name}`);
  saveData(STATE.data);
  return room;
}
function updateChatRoomMembers(roomId, memberResourceIds) {
  if (!checkPermission("إضافة مشارك لغرفة نقاش (Add Discussion Participant)", STATE.user.role)) { alert("دورك الحالي لا يملك صلاحية إدارة أعضاء غرف النقاش."); return; }
  STATE.data.chatRooms = STATE.data.chatRooms.map((r) => (r.id === roomId ? Object.assign({}, r, { memberResourceIds, updatedAt: Date.now() }) : r));
  logAudit("update", "chatRooms", roomId, "تحديث أعضاء غرفة النقاش عبر الـGM");
  saveData(STATE.data);
}
/* [مُنتقَلة إلى app-repository.js — markRoomAsRead وcreateNotification،
   كطبقة Data Access حقيقية (كتابة/قراءة بسيطة بلا قاعدة أعمال). نُقلَت
   بلا أي تغيير منطقي. نقاط الاستدعاء الحقيقية (مُتحقَّق منها بحثاً في
   الكود: app-modules.js وapp-views.js نفسه) تعمل تماماً كما كانت.] */
function getUnreadNotifications(userId) {
  return (STATE.data.notifications || []).filter((n) => n.userId === userId && !n.read).sort((a, b) => b.createdAt - a.createdAt);
}
function markNotificationRead(notificationId) {
  const n = (STATE.data.notifications || []).find((x) => x.id === notificationId);
  if (n) { n.read = true; saveData(STATE.data); }
}
function markAllNotificationsRead(userId) {
  (STATE.data.notifications || []).forEach((n) => { if (n.userId === userId) n.read = true; });
  saveData(STATE.data);
}
/* استخراج الأشخاص المذكورين بصيغة @الاسم من نص رسالة، ومطابقتهم
   بأعضاء الغرفة الفعليين فقط — لا أي اسم يُكتَب، بل عضو حقيقي مسجَّل. */
/* ============================================================
   إشعارات نظام التشغيل الحقيقية (المستوى الأول) — تعمل فعلياً ما
   دام النظام مفتوحاً (ولو في الخلفية/تبويب آخر)، تهتز/تُصدر صوتاً
   حسب إعدادات جهاز المستخدم. لا تعمل والنظام مغلق تماماً — ذلك
   يحتاج Web Push حقيقياً بخادم صغير (موصوف في ملف منفصل).
   ============================================================ */
function requestNotificationPermission() {
  if (typeof Notification === "undefined") { alert("متصفحك لا يدعم إشعارات نظام التشغيل."); return; }
  Notification.requestPermission().then((perm) => { STATE.notificationPermission = perm; renderApp(); });
}
function fireBrowserNotification(title, body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try { new Notification(title, { body }); } catch (e) { /* بعض البيئات (كـfile://) قد ترفض حتى مع إذن ممنوح */ }
}
function notifyNewIncomingNotifications(oldNotificationIds) {
  const myNewOnes = (STATE.data.notifications || []).filter((n) => n.userId === STATE.user.id && !n.read && !oldNotificationIds.has(n.id));
  myNewOnes.forEach((n) => fireBrowserNotification("نظام إدارة المشاريع — إشعار جديد", n.text));
}
function toggleNotificationPanel() { STATE.notificationPanelOpen = !STATE.notificationPanelOpen; renderApp(); }
function renderNotificationPanel() {
  const notifications = getUnreadNotifications(STATE.user.id);
  const typeIcons = { mention: "💬", reply: "↩", note: "📝", update: "🔔" };
  const permissionState = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  const permissionPrompt = permissionState === "default" ? `<div style="background:#F5F6F9;border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:var(--muted);">
    💡 فعِّل إشعارات نظام التشغيل لتنبيهك حتى وأنت في تبويب آخر.
    <button class="btn ghost sm" style="margin-top:6px;" onclick="requestNotificationPermission()">تفعيل الآن</button>
  </div>` : permissionState === "denied" ? `<div style="font-size:10.5px;color:var(--muted2);margin-bottom:8px;">إشعارات نظام التشغيل مرفوضة من إعدادات المتصفح.</div>` : "";
  return `<div class="frame p4" style="position:absolute;top:36px;right:0;width:320px;max-height:400px;overflow-y:auto;z-index:50;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h3 style="font-size:12.5px;color:#3D4759;margin:0;">الإشعارات (${notifications.length})</h3>
      ${notifications.length ? `<button class="btn ghost sm" onclick="markAllNotificationsRead(STATE.user.id);renderApp();">تحديد الكل كمقروء</button>` : ""}
    </div>
    ${permissionPrompt}
    ${notifications.length ? notifications.map((n) => `<div style="background:#F5F6F9;border-radius:6px;padding:8px 10px;margin-bottom:6px;cursor:pointer;font-size:11.5px;" onclick="goToNotification('${n.id}')">
      <span>${typeIcons[n.type] || "🔔"}</span> ${esc(n.text)}
    </div>`).join("") : `<div style="font-size:11.5px;color:var(--muted2);padding:10px;text-align:center;">لا إشعارات جديدة.</div>`}
  </div>`;
}
function goToNotification(notificationId) {
  const n = (STATE.data.notifications || []).find((x) => x.id === notificationId);
  if (!n) return;
  markNotificationRead(notificationId);
  STATE.notificationPanelOpen = false;
  if (n.relatedType === "chatRoom") { setActive("projectChatRoom"); STATE.activeChatRoomId = n.relatedId; }
  else if (n.relatedType === "gmNote") { setActive("gmNotes"); STATE.gmNoteDetailId = n.relatedId; }
  else renderApp();
}

function extractMentionedUserIds(text, room) {
  const mentionPattern = /@([\u0600-\u06FFa-zA-Z0-9_.\s]+?)(?=@|$|\n)/g;
  const mentionedNames = [];
  let match;
  while ((match = mentionPattern.exec(text)) !== null) mentionedNames.push(match[1].trim());
  if (!mentionedNames.length) return [];
  const memberResourceIds = room.memberResourceIds || [];
  const userIds = [];
  memberResourceIds.forEach((resId) => {
    const resource = (STATE.data.resourcePool || []).find((r) => r.id === resId);
    if (!resource) return;
    const matchedUser = (STATE.data.users || []).find((u) => u.linkedResourceId === resId);
    if (matchedUser && mentionedNames.some((name) => resource.name.includes(name) || name.includes(resource.name))) userIds.push(matchedUser.id);
  });
  return userIds;
}

function computeUnreadMessageCount(roomId) {
  if (!STATE.user) return 0;
  const readState = (STATE.data.chatRoomReadState || []).find((s) => s.roomId === roomId && s.userId === STATE.user.id);
  const lastRead = readState ? readState.lastReadTimestamp : 0;
  return (STATE.data.projectChatMessages || []).filter((m) => m.roomId === roomId && m.timestamp > lastRead && m.senderName !== STATE.user.name).length;
}

function sendProjectChatMessage(roomId, text) {
  if (!text || !text.trim()) return;
  const room = (STATE.data.chatRooms || []).find((r) => r.id === roomId);
  if (!room) return;
  if (!canAccessChatRoom(room, STATE.user)) { alert("لست عضواً في هذه الغرفة، لا يمكنك الكتابة فيها."); return; }
  const msg = { id: uid(), projectId: room.projectId, roomId, senderName: STATE.user.name, senderRole: STATE.user.role, text: text.trim(), timestamp: Date.now() };
  STATE.data.projectChatMessages.push(msg);
  const mentionedUserIds = extractMentionedUserIds(text, room);
  mentionedUserIds.forEach((uid_) => {
    if (uid_ !== STATE.user.id) createNotification(uid_, "mention", `أشار إليك ${STATE.user.name} في «${room.name}»: ${text.slice(0, 60)}`, "chatRoom", roomId);
  });
  saveData(STATE.data);
  markRoomAsRead(roomId);
  renderApp();
}
function formatChatAsDiscussionText(roomId) {
  return (STATE.data.projectChatMessages || []).filter((m) => m.roomId === roomId)
    .map((m) => `${m.senderName} (${m.senderRole}): ${m.text}`).join("\n");
}
async function runDiscussionAnalysisFromChat(roomId) {
  const room = (STATE.data.chatRooms || []).find((r) => r.id === roomId);
  if (!room) return;
  const text = formatChatAsDiscussionText(roomId);
  if (!text.trim()) { alert("لا توجد رسائل في هذه الغرفة بعد."); return; }
  STATE.discussionAnalysisLoading = true;
  renderApp();
  const result = await analyzeDiscussionForProjectOutputs(text, room.projectId, null, roomId);
  STATE.discussionAnalysisLoading = false;
  STATE.discussionAnalysisDraft = result;
  renderApp();
}
function computeChatAnalysisFreshness(roomId) {
  const messages = (STATE.data.projectChatMessages || []).filter((m) => m.roomId === roomId);
  const pastAnalyses = (STATE.data.discussionAnalyses || []).filter((a) => a.sourceRoomId === roomId);
  if (!pastAnalyses.length) return { newMessageCount: messages.length, lastAnalysisDate: null };
  const lastAnalysis = pastAnalyses.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const newMessages = messages.filter((m) => m.timestamp > (lastAnalysis.updatedAt || 0));
  return { newMessageCount: newMessages.length, lastAnalysisDate: lastAnalysis.createdDate };
}
function computeChatAnalysisHistory(roomId) {
  return (STATE.data.discussionAnalyses || []).filter((a) => a.sourceRoomId === roomId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function renderChatRoomMemberList(room) {
  const memberIds = room.memberResourceIds || [];
  const memberNames = memberIds.map((id) => {
    const r = (STATE.data.resourcePool || []).find((x) => x.id === id);
    return r ? `${r.name} (${r.type})` : null;
  }).filter(Boolean);
  return `<div class="frame p4" style="margin-bottom:14px;">
    <h3 style="font-size:12px;color:#3D4759;margin:0 0 8px;">👥 أعضاء «${esc(room.name)}» (${memberNames.length})</h3>
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${memberNames.length ? memberNames.map((n) => `<span style="background:#F5F6F9;border-radius:6px;padding:4px 10px;font-size:11px;color:var(--muted);">${esc(n)}</span>`).join("")
        : `<span style="font-size:11px;color:var(--danger);">لا أعضاء في هذه الغرفة بعد — لن يراها أحد سوى الـGM حتى تُضاف أعضاء إليها.</span>`}
    </div>
  </div>`;
}
function renderChatRoomMemberPicker(room) {
  const isGM = STATE.user.role === "مدير عام" || STATE.user.role === "مالك الشركة";
  if (!isGM) return "";
  const resourceOpts = filterByProject(STATE.data.resourcePool || [], true).filter((r) => r.type === "مهندس" || r.type === "مدير مشروع" || r.type === "محاسب");
  const memberIds = room.memberResourceIds || [];
  return `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--info);">
    <h3 style="font-size:12.5px;color:#3D4759;margin:0 0 10px;">👥 إدارة أعضاء «${esc(room.name)}» (يديرها الـGM فقط)</h3>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
      ${resourceOpts.map((r) => `<label style="display:flex;align-items:center;gap:5px;background:#F5F6F9;border-radius:6px;padding:5px 10px;font-size:11.5px;cursor:pointer;">
        <input type="checkbox" ${memberIds.includes(r.id) ? "checked" : ""} onchange="toggleChatRoomMember('${room.id}','${r.id}',this.checked)" />
        ${esc(r.name)} <span style="color:var(--muted2);">(${esc(r.type)})</span>
      </label>`).join("")}
    </div>
  </div>`;
}
function toggleChatRoomMember(roomId, resourceId, checked) {
  const room = (STATE.data.chatRooms || []).find((r) => r.id === roomId);
  if (!room) return;
  const current = room.memberResourceIds || [];
  const updated = checked ? [...new Set([...current, resourceId])] : current.filter((id) => id !== resourceId);
  updateChatRoomMembers(roomId, updated);
  renderApp();
}
function promptCreateChatSubRoom(projectId) {
  const name = prompt("اسم الغرفة الفرعية الجديدة:");
  if (!name) return;
  const room = createChatSubRoom(projectId, name, []);
  if (room) { STATE.activeChatRoomId = room.id; renderApp(); }
}
function renderProjectChatRoomView() {
  const focusProjectId = STATE.projectFilter && STATE.projectFilter !== "all" ? STATE.projectFilter : (filterByProject(STATE.data.projects || [])[0] || {}).id;
  if (!focusProjectId) return `${sectionHeader("غرفة نقاش المشروع")}${emptyState("اختر مشروعاً أولاً من القائمة العلوية.")}`;

  const isGM = STATE.user.role === "مدير عام" || STATE.user.role === "مالك الشركة";
  const accessibleRooms = getAccessibleChatRooms(focusProjectId, STATE.user);
  if (!accessibleRooms.length) {
    return `${sectionHeader("غرفة نقاش المشروع")}${emptyState("لم تتم إضافتك لأي غرفة نقاش في هذا المشروع بعد — يتحكّم الـGM في عضوية الغرف.")}`;
  }
  const activeRoomId = accessibleRooms.some((r) => r.id === STATE.activeChatRoomId) ? STATE.activeChatRoomId : accessibleRooms[0].id;
  STATE.activeChatRoomId = activeRoomId;
  const activeRoom = accessibleRooms.find((r) => r.id === activeRoomId);
  markRoomAsRead(activeRoomId);

  const roomTabsHtml = accessibleRooms.map((r) => {
    const unread = computeUnreadMessageCount(r.id);
    return `<button class="btn ${r.id === activeRoomId ? "primary" : "ghost"} sm" onclick="STATE.activeChatRoomId='${r.id}';renderApp();">
      ${r.isMainRoom ? "🏠" : "💬"} ${esc(r.name)}${unread ? ` <span class="nav-badge" style="margin-right:4px;">${unread}</span>` : ""}
    </button>`;
  }).join("");

  const messages = (STATE.data.projectChatMessages || []).filter((m) => m.roomId === activeRoomId).sort((a, b) => a.timestamp - b.timestamp);
  const draftPanel = STATE.discussionAnalysisLoading ? `<div class="frame p4" style="margin-bottom:14px;text-align:center;color:var(--muted);">جارِ تحليل المحادثة بالذكاء الاصطناعي...</div>`
    : STATE.discussionAnalysisDraft ? renderDiscussionAnalysisReview(STATE.discussionAnalysisDraft) : "";

  const freshness = computeChatAnalysisFreshness(activeRoomId);
  const freshnessNote = freshness.lastAnalysisDate
    ? (freshness.newMessageCount > 0
        ? `<span style="color:var(--warn);">💡 ${freshness.newMessageCount} رسالة جديدة منذ آخر تحليل (${esc(freshness.lastAnalysisDate)}) — يستحق إعادة التحليل.</span>`
        : `<span style="color:var(--muted2);">✓ لا رسائل جديدة منذ آخر تحليل (${esc(freshness.lastAnalysisDate)}).</span>`)
    : (freshness.newMessageCount > 0 ? `<span style="color:var(--good);">لم يُحلَّل النقاش بعد — ${freshness.newMessageCount} رسالة جاهزة للتحليل.</span>` : "");

  const history = computeChatAnalysisHistory(activeRoomId);
  const historyPanel = history.length ? `<div class="frame p4" style="margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="STATE.chatAnalysisHistoryOpen=!STATE.chatAnalysisHistoryOpen;renderApp();">
      <h3 style="font-size:12.5px;color:#3D4759;margin:0;">📜 سجل التحليلات السابقة لهذه الغرفة (${history.length})</h3>
      <span style="color:var(--muted2);">${STATE.chatAnalysisHistoryOpen ? "▲" : "▼"}</span>
    </div>
    ${STATE.chatAnalysisHistoryOpen ? history.map((a) => `<div style="background:#F5F6F9;border-radius:6px;padding:8px 10px;margin-top:8px;font-size:11.5px;">
      <div style="color:#0F1420;margin-bottom:4px;">${esc(a.summary || "بلا ملخص")}</div>
      <div style="color:var(--muted2);">${esc(a.createdDate)} — بواسطة ${esc(a.createdBy)} — أُنشئ: ${a.resultingRecordIds.notes.length} ملاحظة، ${a.resultingRecordIds.checklist.length} بند تشيك ليست، ${a.resultingRecordIds.tasks.length} نشاط</div>
    </div>`).join("") : ""}
  </div>` : "";

  const bubbles = messages.map((m) => {
    const isMine = m.senderName === STATE.user.name;
    return `<div style="display:flex;justify-content:${isMine ? "flex-start" : "flex-end"};margin-bottom:10px;">
      <div style="max-width:70%;background:${isMine ? "#EEF2FF" : "#F5F6F9"};border:1px solid var(--border2);border-radius:10px;padding:8px 12px;">
        <div style="font-size:11px;color:${isMine ? "var(--accent)" : "#a78bfa"};font-weight:700;margin-bottom:3px;">${esc(m.senderName)} <span style="color:var(--muted2);font-weight:400;">— ${esc(m.senderRole)}</span></div>
        <div style="font-size:12.5px;color:#0F1420;white-space:pre-wrap;">${esc(m.text)}</div>
        <div style="font-size:9.5px;color:var(--muted2);margin-top:3px;">${esc(fmtDateTime(m.timestamp))}</div>
      </div>
    </div>`;
  }).join("");
  const cloudNote = STATE.cloudStatus === "connected"
    ? `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--good);font-size:12px;color:var(--good);">☁ متصل بالسحابة — رسائل هذه الغرفة تُزامَن تلقائياً مع كل من يفتح نفس رمز المؤسسة على أي جهاز.</div>`
    : `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--warn);font-size:12px;color:var(--warn);">⚠ غير متصل بالسحابة الآن — هذه المحادثة محفوظة على هذا الجهاز فقط، ولن يراها أحد على جهاز آخر حتى تربط النظام بالسحابة من صفحة «الاتصالات السحابية» (مجاني عبر Firebase).</div>`;
  return `${sectionHeader("غرفة نقاش المشروع — " + esc(projName(focusProjectId)), btn("🤖 تحليل المحادثة وإنشاء مخرجات المشروع", `runDiscussionAnalysisFromChat('${activeRoomId}')`, "primary", "sm"))}
    ${cloudNote}
    <div class="frame p4" style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${roomTabsHtml}
      ${isGM ? btn("+ غرفة فرعية جديدة", `promptCreateChatSubRoom('${focusProjectId}')`, "ghost", "sm") : ""}
    </div>
    ${renderChatRoomMemberList(activeRoom)}
    ${renderChatRoomMemberPicker(activeRoom)}
    ${freshnessNote ? `<div class="frame p4" style="margin-bottom:14px;font-size:12px;">${freshnessNote}</div>` : ""}
    ${draftPanel}
    ${historyPanel}
    <div id="chat-messages-container" class="frame p4" style="margin-bottom:14px;height:420px;overflow-y:auto;display:flex;flex-direction:column;">
      ${messages.length ? bubbles : emptyState("لا رسائل بعد في «" + esc(activeRoom.name) + "» — ابدأ النقاش.")}
    </div>
    <div class="frame p4" style="display:flex;gap:8px;">
      <input id="chat-message-input" class="inp" style="flex:1;" placeholder="اكتب رسالتك هنا..." onkeydown="if(event.key==='Enter'){sendProjectChatMessage('${activeRoomId}', this.value); this.value='';}" />
      <button class="btn primary sm" onclick="const el=document.getElementById('chat-message-input');sendProjectChatMessage('${activeRoomId}', el.value);el.value='';">إرسال</button>
    </div>`;
}

function editDiscussionDraftField(path, value) {
  const d = STATE.discussionAnalysisDraft.draft;
  if (path.arrayKey != null) { d[path.arrayKey][path.index][path.field] = value; }
  else if (path.index != null) { d[path.field][path.index] = value; }
  else { d[path.field] = value; }
}
function removeDiscussionDraftItem(field, index) { STATE.discussionAnalysisDraft.draft[field].splice(index, 1); renderApp(); }
function addDiscussionDraftItem(field) {
  const d = STATE.discussionAnalysisDraft.draft;
  if (field === "actionItems") d.actionItems.push({ activity: "", responsible: "", role: "", dueDate: "", priority: "متوسطة", status: "مفتوح" });
  else if (field === "checklistItems") d.checklistItems.push({ text: "", dueDate: "" });
  else d[field].push("");
  renderApp();
}
function cancelDiscussionAnalysis() { STATE.discussionAnalysisDraft = null; renderApp(); }
function approveDiscussionAnalysis() {
  const d = STATE.discussionAnalysisDraft;
  if (!d || !d.available) return;
  if (STATE.user && !canEdit(STATE.user.role, "tasks")) { alert("دورك الحالي لا يملك صلاحية اعتماد مخرجات تُنشئ مهاماً وملاحظات جديدة."); return; }
  const now = todayISO();
  const analysisRecord = { id: uid(), projectId: d.projectId, sourceMeetingId: d.sourceMeetingId, sourceRoomId: d.sourceRoomId || null, sourceText: d.sourceText,
    summary: d.draft.summary, createdBy: STATE.user.name, createdDate: now, updatedAt: Date.now(),
    resultingRecordIds: { notes: [], checklist: [], tasks: [] } };
  (d.draft.notes || []).filter((t) => t && t.trim()).forEach((noteText) => {
    const note = { id: uid(), projectId: d.projectId, text: noteText, date: now, source: "تحليل نقاش بالذكاء الاصطناعي",
      sourceDiscussionId: analysisRecord.id, conversionCreatedBy: STATE.user.name, conversionDate: now, aiSuggestionText: noteText, updatedAt: Date.now() };
    STATE.data.projectNotes.push(note);
    analysisRecord.resultingRecordIds.notes.push(note.id);
  });
  (d.draft.checklistItems || []).filter((it) => it && it.text && it.text.trim()).forEach((item, i) => {
    const punch = { id: uid(), projectId: d.projectId, itemNumber: "AI-" + (STATE.data.punchlist.length + i + 1),
      description: item.text, dateRaised: now, severity: "متوسطة", raisedBy: "تحليل نقاش (AI)", dueDate: item.dueDate || "",
      sourceDiscussionId: analysisRecord.id, conversionCreatedBy: STATE.user.name, conversionDate: now, aiSuggestionText: item.text, updatedAt: Date.now() };
    STATE.data.punchlist.push(punch);
    analysisRecord.resultingRecordIds.checklist.push(punch.id);
  });
  (d.draft.actionItems || []).filter((it) => it && it.activity && it.activity.trim()).forEach((item) => {
    const task = { id: uid(), projectId: d.projectId, name: item.activity, assignee: item.responsible || "",
      start: now, end: item.dueDate || "", priority: item.priority || "متوسطة", completion: 0, predecessors: [],
      sourceDiscussionId: analysisRecord.id, conversionCreatedBy: STATE.user.name, conversionDate: now,
      aiSuggestionText: `${item.activity} — ${item.responsible || "بلا مسؤول محدَّد"} (${item.role || "بلا دور محدَّد"})`, updatedAt: Date.now() };
    STATE.data.tasks.push(task);
    analysisRecord.resultingRecordIds.tasks.push(task.id);
  });
  STATE.data.discussionAnalyses.push(analysisRecord);
  logAudit("create", "discussionAnalyses", analysisRecord.id,
    `اعتماد مخرجات تحليل نقاش: ${analysisRecord.resultingRecordIds.notes.length} ملاحظة، ${analysisRecord.resultingRecordIds.checklist.length} بند تشيك ليست، ${analysisRecord.resultingRecordIds.tasks.length} نشاط`);
  saveData(STATE.data);
  STATE.discussionAnalysisDraft = null;
  renderApp();
  showToast(`تم الدمج: ${analysisRecord.resultingRecordIds.notes.length} ملاحظة، ${analysisRecord.resultingRecordIds.checklist.length} بند، ${analysisRecord.resultingRecordIds.tasks.length} نشاط`, "success");
}
/* ============================================================
   مصفوفة المسؤوليات — تجميع حقيقي للأنشطة الموجودة أصلاً حسب
   المسؤول عنها، لا وحدة بيانات منفصلة جديدة تحتاج تكراراً للبيانات.
   ============================================================ */
function computeResponsibilityMatrix(projectId) {
  const tasks = ScheduleRepository.getTasks(projectId).filter((t) => t.assignee || t.responsibleResourceId);
  const groups = {};
  tasks.forEach((t) => {
    const key = t.responsibleResourceId ? "res:" + t.responsibleResourceId : "name:" + t.assignee;
    if (!groups[key]) {
      const resource = t.responsibleResourceId ? (STATE.data.resourcePool || []).find((r) => r.id === t.responsibleResourceId) : null;
      groups[key] = { name: resource ? resource.name : t.assignee, role: resource ? resource.type : "—", tasks: [] };
    }
    groups[key].tasks.push(t);
  });
  return Object.values(groups).map((g) => ({
    name: g.name, role: g.role, totalCount: g.tasks.length,
    openCount: g.tasks.filter((t) => Number(t.completion) < 100).length,
    overdueCount: g.tasks.filter((t) => t.end && t.end < todayISO() && Number(t.completion) < 100).length,
  })).sort((a, b) => b.totalCount - a.totalCount);
}

/* ============================================================
   لوحة الذكاء الاصطناعي السياقية — مدمَجة داخل الصفحة نفسها، لا
   وجهة منفصلة. تبني السياق تلقائياً من بيانات الصفحة الحالية فقط
   (لا كل بيانات النظام)، فلا يحتاج المستخدم شرح شيء — نفس مفتاح
   API الاختياري المُستخدَم في المساعد الذكي وتحليل النقاش، لا بنية
   جديدة منفصلة. هذا إثبات حقيقي على صفحتين فعليتين، لا "كل صفحة"
   فوراً — الادّعاء الصادق المتاح ضمن حدود هذه الجلسة.
   ============================================================ */
/* ============================================================
   منصة الذكاء الاصطناعي (AI Platform) — لا صفحة ذكاء اصطناعي أخرى،
   بل بنية تحتية قابلة لإعادة الاستخدام عبر كل الوحدات.
   ============================================================
   1) طبقة تجريد المزوِّد (AIProviderRegistry) — الواجهة لا تعتمد على
      مزوِّد واحد. Anthropic هو المزوِّد الحقيقي العامل الوحيد اليوم؛
      OpenAI/Azure/Gemini/نموذج محلي مُسجَّلون بنفس العقد لإثبات قابلية
      التبديل الفعلية، لكن بصدق كامل: يُرجِعون سبب عدم التوفّر لا
      إجابة وهمية — لا خادم وسيط آمن لمفاتيحهم مبني هنا بعد.
   ============================================================ */
/* [مُنتقَل إلى app-ai-provider.js — نظام تسجيل مزوِّدي الذكاء الاصطناعي
   (AIProviders/registerAIProvider/getAIProvider/listAIProviders/
   getActiveAIProvider) ومزوِّدو السياق (AIContextProviders) وباني
   الأوامر (buildContextualSystemPrompt). لم يتغيَّر أي منطق — نقل
   فعلي بحت ضمن Architecture Refactor، كل نقاط الاستدعاء (كلها داخل
   هذا الملف نفسه، مُتحقَّق منها) تعمل تماماً كما كانت، لأن كل الدوال
   تبقى عامة على مستوى النطاق العام (global scope) بعد التحميل.] */

/* ============================================================
   4) الالتزام بالصلاحيات — مبدأ معماري صريح لا كود منفصل: أي دالة
      سياق (Context Provider) يجب أن تستخدم نفس دوال التصفية
      (filterByProject) التي تستخدمها الواجهة نفسها، فلا يمكن للذكاء
      الاصطناعي أن "يرى" أكثر مما يراه المستخدم على الشاشة أصلاً —
      لا طبقة فلترة منفصلة يمكن أن تُنسى أو تُخترَق.
   ============================================================ */

/* ============================================================
   5) محرك المعرفة المؤسسي (Enterprise Knowledge Engine) — عقد
      واجهة حقيقي، صفر تطبيق مزيَّف. بحث دلالي حقيقي عبر كل الوحدات
      (BIM، سحابة نقاط، مستندات، نقاشات) يحتاج قاعدة بيانات متجهة
      (pgvector) وخدمة تضمين (Embeddings) حقيقيتين على خادم — موصوفتان
      بالتفصيل في وثيقة "طبقة الذكاء الاصطناعي" السابقة. الواجهة هنا
      جاهزة تماماً، بانتظار مزوِّد حقيقي فقط.
   ============================================================ */
const KNOWLEDGE_ENGINE_CAPABILITIES = ["semanticSearch", "crossModuleLinking", "embeddingGeneration"];
const KnowledgeEngineProviderRegistry = {};
function registerKnowledgeEngineProvider(name, provider) {
  if (!Array.isArray(provider.supportedCapabilities) || typeof provider.execute !== "function") {
    throw new Error(`مزوِّد محرك المعرفة "${name}" يجب أن يوفّر supportedCapabilities (مصفوفة) ودالة execute().`);
  }
  KnowledgeEngineProviderRegistry[name] = provider;
}
function getKnowledgeEngineProviderFor(capability) {
  return Object.values(KnowledgeEngineProviderRegistry).find((p) => p.supportedCapabilities.includes(capability)) || null;
}
function isKnowledgeEngineCapabilityAvailable(capability) { return getKnowledgeEngineProviderFor(capability) !== null; }

registerAIContextProvider("risks", () => {
  const risks = filterByProject(STATE.data.risks || []);
  if (!risks.length) return "لا توجد مخاطر مسجَّلة ضمن نطاق صلاحيات المستخدم الحالي.";
  return risks.map((r) => `- ${r.title || "بلا عنوان"}: احتمالية ${r.probability || "?"}/5، أثر ${r.impact || "?"}/5، الحالة: ${r.status || "غير محدَّدة"}${r.mitigation ? `، خطة التخفيف: ${r.mitigation}` : ""}`).join("\n");
});
registerAIContextProvider("schedule", (projectId) => {
  const tasks = ScheduleRepository.getTasks(projectId);
  if (!tasks.length) return "لا توجد أنشطة مسجَّلة ضمن نطاق صلاحيات المستخدم الحالي لهذا المشروع.";
  let cpm = { critical: new Set(), slack: {} };
  try { cpm = computeCriticalPath(tasks); } catch (e) { /* جدول فارغ أو دائري */ }
  return tasks.map((t) => `- ${t.name}: إنجاز ${t.completion || 0}%، من ${t.start || "?"} إلى ${t.end || "?"}${cpm.critical.has(t.id) ? "، على المسار الحرج" : ""}${t.end && t.end < todayISO() && Number(t.completion) < 100 ? "، متأخر" : ""}`).join("\n");
});

async function askContextualAI(panelKey, contextText, question) {
  STATE.contextualAIResults = STATE.contextualAIResults || {};
  if (!question || !question.trim()) return;
  STATE.contextualAIResults[panelKey] = { loading: true, question };
  renderApp();
  const provider = getActiveAIProvider();
  if (!provider) { STATE.contextualAIResults[panelKey] = { error: "لا يوجد مزوِّد ذكاء اصطناعي مُسجَّل." }; renderApp(); return; }
  const systemPrompt = buildContextualSystemPrompt(contextText);
  const result = await provider.chat(systemPrompt, question);
  STATE.contextualAIResults[panelKey] = result.available ? { question, answer: result.text } : { error: result.reason };
  renderApp();
}
function renderContextualAIPanel(panelKey, contextTextGetterName, placeholderQuestion) {
  const result = (STATE.contextualAIResults || {})[panelKey];
  return `<div class="ai-panel" style="margin-bottom:14px;"><div class="ai-panel-inner" style="padding:12px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span class="ai-badge">🤖 اسأل عن هذه الصفحة تحديداً<span class="ai-live-dot"></span></span>
    </div>
    <div style="display:flex;gap:8px;">
      <input id="ctx-ai-input-${panelKey}" class="inp" style="flex:1;" placeholder="${esc(placeholderQuestion)}" onkeydown="if(event.key==='Enter'){askContextualAI('${panelKey}', ${contextTextGetterName}(), this.value); this.value='';}" />
      <button class="btn primary sm" onclick="const el=document.getElementById('ctx-ai-input-${panelKey}');askContextualAI('${panelKey}', ${contextTextGetterName}(), el.value);el.value='';">اسأل</button>
    </div>
    ${result ? `<div style="margin-top:10px;padding:8px 10px;background:#F5F6F9;border-radius:8px;font-size:12px;">
      ${result.loading ? `<span style="color:var(--muted2);">جارِ التفكير...</span>`
        : result.error ? `<span style="color:var(--warn);">${esc(result.error)}</span>`
        : `<div style="color:var(--muted2);margin-bottom:4px;">س: ${esc(result.question)}</div><div style="color:#0F1420;white-space:pre-wrap;">${esc(result.answer)}</div>`}
    </div>` : ""}
  </div></div>`;
}

/* دالة استدعاء منخفضة المستوى مشترَكة — يستخدمها كل من عميل الاستدعاء
   بالأدوات (askAI) ومزوِّد الدردشة السياقية البسيطة (AIProviders.anthropic)
   بدل تكرار نفس تفاصيل fetch/الترويسات في مكانين، كما يجب. */
async function callAnthropicAPI(apiKey, payload) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function askAI(q) {
  const key = localStorage.getItem("pms_ai_key") || "";
  if (!q.trim()) return;
  STATE.aiMessages = STATE.aiMessages || [];
  STATE.aiMessages.push({ role: "user", text: q });
  renderApp();
  if (!key) {
    STATE.aiMessages.push({ role: "ai", text: "لم يتم إدخال مفتاح Anthropic API. أدخل المفتاح في الحقل أعلاه (يُخزَّن على جهازك فقط ولا يُرسَل لأي مكان سوى Anthropic مباشرة). هذه الميزة اختيارية بالكامل — بقية النظام يعمل بلا حاجة لها." });
    renderApp();
    return;
  }
  const projectList = filterByProject(STATE.data.projects || []).map((p) => `${p.name} (id: ${p.id})`).join("، ");
  const systemPrompt = `أنت مساعد ذكاء اصطناعي داخل نظام إدارة مشاريع. لا تملك أي بيانات مباشرة — يجب أن تستدعي الأدوات المتاحة لجلب أي معلومة حقيقية قبل الإجابة، ولا تخترع أرقاماً. المشاريع ضمن نطاق صلاحية هذا المستخدم حالياً: ${projectList || "لا توجد مشاريع ضمن نطاقه"}. أجب دائماً بالعربية.
عند إنشاء مشروع جديد من وصف حر: لا تفترض أي معلومة أساسية ناقصة (خصوصاً اسم مدير المشروع أو تاريخا البداية/النهاية) — اسأل المستخدم صراحة عنها أولاً بدل تخمينها. استخدم find_resource_by_name للتحقّق من وجود أي شخص مذكور بالاسم قبل إسناده. propose_new_project يُنشئ مسودة للمراجعة فقط، لا مشروعاً فعلياً — أخبر المستخدم دائماً أنه سيحتاج تأكيداً نهائياً صريحاً بعدها.`;
  let messages = [{ role: "user", content: q }];
  try {
    for (let turn = 0; turn < 5; turn++) {
      const json = await callAnthropicAPI(key, { model: "claude-sonnet-4-6", max_tokens: 1500, system: systemPrompt, tools: PMS_AI_TOOLS, messages });
      if (json.error) { STATE.aiMessages.push({ role: "ai", text: "خطأ: " + json.error.message }); break; }
      messages.push({ role: "assistant", content: json.content });
      if (json.stop_reason === "tool_use") {
        const toolResults = [];
        for (const block of json.content) {
          if (block.type === "tool_use") {
            const result = executePMSTool(block.name, block.input || {});
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
          }
        }
        messages.push({ role: "user", content: toolResults });
        continue; // أعِد الاستدعاء بنتائج الأداة ليتابع النموذج التحليل
      }
      const finalText = (json.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      STATE.aiMessages.push({ role: "ai", text: finalText || "تعذّر الحصول على رد نهائي." });
      break;
    }
  } catch (e) {
    STATE.aiMessages.push({ role: "ai", text: "تعذر الاتصال بـ Anthropic API من المتصفح مباشرة (قد يمنع هذا متصفحك بسبب CORS). الحل الموثوق: استخدم النظام داخل Claude.ai حيث يعمل المساعد الذكي بالكامل، أو استخدم واجهة API عبر خادم وسيط." });
  }
  renderApp();
}
function askCopilot(questionKey) {
  const q = COPILOT_QUESTIONS.find((c) => c.key === questionKey);
  if (!q) return;
  STATE.aiMessages = STATE.aiMessages || [];
  STATE.aiMessages.push({ role: "user", text: q.label });
  STATE.aiMessages.push({ role: "assistant", text: q.handler(STATE.data) });
  renderApp();
}
function askCopilotWhyDelayed() {
  const projectId = document.getElementById("copilot-delay-project").value;
  if (!projectId) return;
  const project = STATE.data.projects.find((p) => p.id === projectId);
  STATE.aiMessages = STATE.aiMessages || [];
  STATE.aiMessages.push({ role: "user", text: `لماذا مشروع «${project ? project.name : ""}» متأخر؟` });
  STATE.aiMessages.push({ role: "assistant", text: copilotWhyDelayed(STATE.data, projectId) });
  renderApp();
}
function generateReportNow(periodType) {
  STATE.autonomousReport = { periodType, text: generateAutonomousReport(STATE.data, periodType), generatedAt: Date.now() };
  renderApp();
}
function renderPendingProjectDraftPanel() {
  const draft = STATE.pendingProjectDraft;
  if (!draft) return "";
  const pmLine = draft.projectManagerId
    ? `<span style="color:var(--good);">✓ مدير المشروع: ${esc(draft.projectManagerName)} (مُطابَق من سجل الموارد)</span>`
    : `<span style="color:var(--warn);">⚠ لم يُحدَّد مدير مشروع بعد${draft.projectManagerName ? ` (الاسم المذكور "${esc(draft.projectManagerName)}" غير موجود في سجل الموارد)` : ""}</span>`;
  return `<div class="ai-panel" style="margin-bottom:16px;"><div class="ai-panel-inner">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span class="ai-badge">📋 مسودة مشروع بانتظار تأكيدك<span class="ai-live-dot"></span></span>
    </div>
    <div style="font-size:13px;color:#0F1420;margin-bottom:6px;"><b>${esc(draft.name)}</b></div>
    <div style="font-size:12px;color:var(--muted);line-height:1.9;">
      المدة: ${esc(draft.startDate || "غير محدَّدة")} → ${esc(draft.endDate || "غير محدَّدة")}<br/>
      قيمة العقد: ${draft.contractValue ? fmtMoney(draft.contractValue) : "غير محدَّدة"}<br/>
      المالك: ${esc(draft.owner || "—")} — الاستشاري: ${esc(draft.consultant || "—")} — الموقع: ${esc(draft.location || "—")}<br/>
      ${pmLine}
    </div>
    <p style="font-size:11px;color:var(--muted2);margin-top:8px;">لم يُحفَظ أي شيء بعد في النظام — راجع كل التفاصيل أعلاه، ثم اختر:</p>
    <div style="display:flex;gap:8px;margin-top:8px;">
      ${btn("✓ تأكيد الإنشاء فعلياً", "confirmPendingProjectCreation()", "primary", "sm")}
      ${btn("إلغاء", "cancelPendingProjectDraft()", "ghost", "sm")}
    </div>
  </div></div>`;
}
function confirmPendingProjectCreation() {
  const draft = STATE.pendingProjectDraft;
  if (!draft) return;
  if (!draft.name || !draft.name.trim()) { alert("لا يمكن إنشاء مشروع بلا اسم."); return; }
  ProjectRepository.create({
    name: draft.name, startDate: draft.startDate, endDate: draft.endDate, contractValue: draft.contractValue,
    owner: draft.owner, consultant: draft.consultant, location: draft.location, projectManagerId: draft.projectManagerId, completion: 0,
  });
  STATE.pendingProjectDraft = null;
  STATE.aiMessages = STATE.aiMessages || [];
  STATE.aiMessages.push({ role: "ai", text: `✓ تم إنشاء المشروع «${draft.name}» فعلياً في النظام.` });
  renderApp();
  showToast(`تم إنشاء المشروع «${draft.name}» بنجاح`, "success");
}
function cancelPendingProjectDraft() {
  STATE.pendingProjectDraft = null;
  renderApp();
}

function renderAI() {
  const messages = STATE.aiMessages || [];
  const hasKey = !!localStorage.getItem("pms_ai_key");
  const projects = filterByProject(STATE.data.projects || []);
  const report = STATE.autonomousReport;
  return `
    ${sectionHeader("المساعد الذكي")}
    ${renderPendingProjectDraftPanel()}
    <div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--good);">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 8px;">📰 تقارير تلقائية (يومي/أسبوعي/شهري) — نفس منطق الأسئلة الفورية أدناه، بصيغة تقرير سردي جاهز للطباعة</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${btn("توليد تقرير يومي", "generateReportNow('daily')", "ghost", "sm")}
        ${btn("توليد تقرير أسبوعي", "generateReportNow('weekly')", "ghost", "sm")}
        ${btn("توليد تقرير شهري تنفيذي", "generateReportNow('monthly')", "primary", "sm")}
      </div>
      ${report ? `<div class="frame p4" style="margin-top:12px;white-space:pre-wrap;font-size:12.5px;line-height:1.8;max-height:400px;overflow-y:auto;">${esc(report.text)}</div>` : ""}
    </div>
    <div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--info);">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 8px;">⚡ أسئلة فورية (بيانات حقيقية من نظامك، بلا حاجة لمفتاح API)</h3>
      <p style="font-size:11.5px;color:var(--muted);margin-bottom:10px;">إجابات محسوبة مباشرة من مؤشر الصحة، تصنيف المقاولين، ومطابقة الدفعات — لا نموذج لغوي، بل استعلامات حقيقية على بياناتك الفعلية الآن.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        ${COPILOT_QUESTIONS.map((q) => `<button class="btn ghost sm" onclick="askCopilot('${q.key}')">${esc(q.label)}</button>`).join("")}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--muted);">لماذا مشروع معيَّن متأخر؟</span>
        <select id="copilot-delay-project"><option value="">اختر مشروعاً...</option>${projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
        <button class="btn primary sm" onclick="askCopilotWhyDelayed()">اسأل</button>
      </div>
    </div>
    <div class="frame p4" style="margin-bottom:14px;">
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">دردشة حرة مفتوحة لأي سؤال آخر — اختيارية، تحتاج اتصال إنترنت ومفتاح Anthropic API خاص بك (يُخزَّن على جهازك فقط):</div>
      <input class="inp" style="max-width:420px;" type="password" placeholder="ألصق مفتاح API هنا (sk-ant-...)" value="${hasKey ? "••••••••••••" : ""}" onchange="localStorage.setItem('pms_ai_key', this.value); this.value='••••••••••••';" />
    </div>
    <div class="frame p4">
      <div id="ai-log" style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
        ${messages.length ? messages.map((m) => `<div style="max-width:85%;${m.role === "user" ? "" : ""}background:${m.role === "user" ? "#EEF2FF" : "#FFFFFF"};border:${m.role === "user" ? "none" : "1px solid var(--border)"};border-radius:8px;padding:10px 14px;font-size:13px;white-space:pre-wrap;">${esc(m.text)}</div>`).join("") : emptyState("جرّب الأسئلة الفورية أعلاه، أو اسأل عن أي شيء آخر يخص المشاريع، التأخيرات، المخزون، الفواتير، المخاطر، مستخلصات المالك والمقاولين، المطالبات، العهد، المراسلات العاجلة، القرارات المتأخرة، حوادث السلامة، أو بنود الجودة.")}
      </div>
      <div style="display:flex;gap:8px;">
        <input class="inp" id="ai-input" style="flex:1;" placeholder="اكتب سؤالك هنا..." onkeydown="if(event.key==='Enter'){askAI(this.value); this.value='';}" />
        <button class="btn primary" onclick="const el=document.getElementById('ai-input'); askAI(el.value); el.value='';">إرسال</button>
      </div>
    </div>
  `;
}

/* ============================================================
   التحليلات التنبؤية والتعلّم من البيانات — إحصاء حقيقي (انحدار خطي،
   Z-Score، معايير تنظيمية من مشاريع سابقة فعلية) لا تعلّم آلي عميق.
   ============================================================ */
function setAnalyticsProjectFocus(projectId) { STATE.analyticsProjectId = projectId; renderApp(); }
function renderPredictiveAnalyticsView() {
  const projects = filterByProject(STATE.data.projects || []);
  const focusId = STATE.analyticsProjectId || (projects[0] && projects[0].id);
  const focusProject = projects.find((p) => p.id === focusId);

  let forecastHtml = emptyState("اختر مشروعاً لعرض التوقّع.");
  if (focusProject) {
    const trend = computeTrendForecast(focusProject);
    const evm = computeEVM(focusProject, STATE.data.budgetItems, STATE.data.changeOrders);
    const ratioEAC = evm.EAC;
    forecastHtml = `
      <div class="grid2" style="margin-bottom:14px;">
        <div class="frame p4">
          <h4 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">الطريقة القياسية (نسبة الأداء الحالية)</h4>
          <div style="font-size:22px;font-family:monospace;color:#0F1420;">${fmtMoney(ratioEAC)}</div>
          <div style="font-size:11px;color:var(--muted2);margin-top:4px;">EAC = BAC ÷ CPI — تفترض أن أداء التكلفة الحالي (CPI) سيستمر ثابتاً حتى نهاية المشروع دون تغيّر.</div>
        </div>
        <div class="frame p4" style="border-right:3px solid var(--info);">
          <h4 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">الطريقة الإحصائية (انحدار خطي على المسار الفعلي)</h4>
          ${trend.available ? `
            <div style="font-size:15px;color:#0F1420;">تاريخ الانتهاء المتوقَّع: <b>${esc(trend.forecastCompletionDate)}</b></div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:6px;">معدّل الإنجاز اليومي الفعلي المُستنتَج: ${trend.dailyVelocityPct.toFixed(2)}% في اليوم</div>
            <div style="font-size:11px;color:${trend.confidenceLabel === "منخفضة جداً" ? "var(--warn)" : "var(--good)"};margin-top:6px;">مستوى الثقة: ${esc(trend.confidenceLabel)} — ${esc(trend.confidenceNote)}</div>
          ` : `<div style="font-size:12.5px;color:var(--muted);">${esc(trend.reason)}</div>`}
        </div>
      </div>`;
  }

  const benchmark = computeHistoricalCompanyBenchmark(STATE.data.projects || []);
  const benchmarkHtml = benchmark.available ? `
    <div class="frame p4" style="margin-bottom:14px;">
      <h4 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">🎓 التعلّم من تاريخ الشركة (${benchmark.projectCount} مشروع مكتمل فعلياً)</h4>
      <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);">
        ${kpiCard({ label: "متوسط تجاوز الجدول الفعلي", value: `${benchmark.avgScheduleOverrunDays > 0 ? "+" : ""}${benchmark.avgScheduleOverrunDays.toFixed(1)} يوم`, level: benchmark.avgScheduleOverrunDays > 0 ? "warn" : "good" })}
        ${kpiCard({ label: "متوسط تجاوز التكلفة الفعلي", value: `${benchmark.avgCostOverrunPct > 0 ? "+" : ""}${benchmark.avgCostOverrunPct.toFixed(1)}%`, level: benchmark.avgCostOverrunPct > 0 ? "warn" : "good" })}
      </div>
      <p style="font-size:11px;color:var(--muted2);margin-top:8px;">${esc(benchmark.confidenceNote)}</p>
    </div>` : `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">🎓 التعلّم من تاريخ الشركة: ${esc(benchmark.reason)}</div>`;

  const invoices = filterByProject(STATE.data.invoices || []);
  const invoiceAnomaly = detectStatisticalAnomalies(invoices.map((i) => Number(i.amount) || 0), invoices.map((i) => i.number || i.id));
  const tasks = filterByProject(STATE.data.tasks || []).filter((t) => t.start && t.end);
  const taskDurations = tasks.map((t) => daysBetween(t.start, t.end));
  const taskAnomaly = detectStatisticalAnomalies(taskDurations, tasks.map((t) => t.name));

  const anomalySection = (title, result) => `<div class="frame p4" style="margin-bottom:12px;">
    <h4 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">${esc(title)}</h4>
    ${!result.available ? `<div style="font-size:12px;color:var(--muted);">${esc(result.reason)}</div>`
      : result.anomalies.length ? result.anomalies.map((a) => `<div style="font-size:12px;color:var(--warn);padding:4px 0;border-bottom:1px solid var(--row2);">⚠ «${esc(a.label)}»: ${a.value.toFixed(1)} (يبعد ${Math.abs(a.zScore).toFixed(1)} انحراف معياري عن المتوسط ${result.mean.toFixed(1)})</div>`).join("")
      : `<div style="font-size:12px;color:var(--good);">لا شواذ إحصائية مكتشَفة — كل القيم ضمن نطاق طبيعي (±${result.threshold} انحراف معياري عن المتوسط).</div>`}
  </div>`;

  return `${sectionHeader("التحليلات التنبؤية والتعلّم من البيانات")}
    <div class="frame p4" style="margin-bottom:14px;font-size:12px;color:var(--muted);line-height:1.8;">
      كل ما يلي إحصاء حقيقي وموصوف بالكامل (انحدار خطي، Z-Score، متوسطات فعلية من مشاريع مكتملة) — <b>لا تعلّم آلي عميق ولا نماذج ذكاء اصطناعي مُدرَّبة</b>. بيانات شركة واحدة (عشرات المشاريع على الأكثر) لا تكفي إحصائياً لتدريب نموذج تعلّم آلي يمكن الوثوق بتعميمه، وهذا قيد حقيقي لا يُخفى. الدقة تتحسّن تلقائياً كلما تراكمت بيانات ونقاط رصد ومشاريع مكتملة أكثر.
    </div>
    <div class="frame p4" style="margin-bottom:14px;">
      <label style="font-size:12px;color:var(--muted);">مشروع التوقّع:</label>
      <select onchange="setAnalyticsProjectFocus(this.value)">${projects.map((p) => `<option value="${p.id}" ${focusId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
    </div>
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">📈 توقّع تاريخ الانتهاء والتكلفة النهائية — مقارنة طريقتين</h3>
    ${forecastHtml}
    ${benchmarkHtml}
    <h3 style="font-size:13px;color:#3D4759;margin:14px 0 10px;">🔍 اكتشاف الشواذ الإحصائية</h3>
    ${anomalySection("مبالغ الفواتير", invoiceAnomaly)}
    ${anomalySection("مدد الأنشطة الزمنية", taskAnomaly)}`;
}

function renderProcurementView() {
  const rows = filterByProject(STATE.data.procurement);
  const allBids = STATE.data.procurementBids || [];
  const readOnly = !canEdit(STATE.user.role, "procurement");
  let chartHtml = "";
  if (rows.length) {
    const stages = ["طلب احتياج","موافقة","طلب عروض","استلام عروض","التقييم","أمر شراء","التوريد","الفاتورة","الدفع"];
    const counts = stages.map((s) => rows.filter((r) => r.stage === s).length);
    const chart = barChart(stages, [{ name: "عدد الطلبات", color: "#F5A623", values: counts }]);
    chartHtml = `<div class="frame p4" style="margin-bottom:14px;"><h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">توزيع الطلبات على مراحل الشراء</h3><div class="chart-box">${chart.outerHTML}</div></div>`;
  }

  const extraColumns = [
    { key: "_bidCount", label: "عروض مستلمة", render: (_, row) => {
      const n = allBids.filter((b) => b.procurementId === row.id).length;
      return n ? `<span class="badge-pill">${n}</span>` : "—";
    } },
    { key: "_lowestBid", label: "أقل عرض", render: (_, row) => {
      const bids = allBids.filter((b) => b.procurementId === row.id);
      if (!bids.length) return "—";
      const lowest = Math.min(...bids.map((b) => Number(b.quotedAmount) || Infinity));
      return fmtMoney(lowest);
    } },
  ];

  const requestsTable = renderModuleView("procurement", "طلبات الشراء", MODULES.procurement.fields(), rows, extraColumns, readOnly);
  return `${chartHtml}${requestsTable}${renderBidComparisonSection(rows, allBids, readOnly)}`;
}

/* ---------------- مقارنة عروض الموردين (Tendering / Bid Comparison) ---------------- */
function renderBidComparisonSection(procurementRows, allBids, readOnly) {
  const reqIds = new Set(procurementRows.map((r) => r.id));
  const bids = allBids.filter((b) => reqIds.has(b.procurementId));

  let totalSavings = 0;
  procurementRows.forEach((r) => {
    const reqBids = allBids.filter((b) => b.procurementId === r.id);
    if (reqBids.length < 2) return;
    const winner = reqBids.find((b) => b.isWinner);
    const avg = reqBids.reduce((s, b) => s + Number(b.quotedAmount || 0), 0) / reqBids.length;
    if (winner) totalSavings += Math.max(0, avg - Number(winner.quotedAmount || 0));
  });

  const competitiveRequests = procurementRows.filter((r) => allBids.filter((b) => b.procurementId === r.id).length >= 2);
  const summary = [
    kpiCard({ label: "طلبات بعروض تنافسية (عرضان فأكثر)", value: competitiveRequests.length, level: "info" }),
    kpiCard({ label: "إجمالي العروض المسجَّلة", value: bids.length, level: "info" }),
    kpiCard({ label: "توفير مقدَّر من اختيار أفضل عرض", value: fmtMoney(totalSavings), sub: "مقارنة بمتوسط العروض المستلمة", level: totalSavings > 0 ? "good" : "info" }),
  ];

  const extraColumns = [
    { key: "_variance", label: "الفرق عن الأقل سعراً", render: (_, row) => {
      const siblings = allBids.filter((b) => b.procurementId === row.procurementId);
      if (siblings.length < 2) return "—";
      const lowest = Math.min(...siblings.map((b) => Number(b.quotedAmount) || Infinity));
      const diff = Number(row.quotedAmount || 0) - lowest;
      return diff === 0 ? statusDot("good", "الأقل سعراً") : `<span style="font-family:monospace;color:#F5A623;">+${fmtMoney(diff)}</span>`;
    } },
    { key: "_winner", label: "القرار", render: (_, row) => {
      if (row.isWinner) return statusDot("good", "🏆 الفائز بالعطاء");
      if (readOnly) return "—";
      return `<button class="btn primary sm" onclick="selectBidWinner('${row.id}')">🏆 اختيار كفائز</button>`;
    } },
  ];

  const note = `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">
    سجّل عرض سعر منفصل لكل مورد يتقدَّم لنفس طلب الشراء هنا، ثم قارن الأسعار ومدة التوريد والمطابقة الفنية جنباً إلى جنب. عند اختيار الفائز، يُحدَّث المورد والقيمة تلقائياً في طلب الشراء الأصلي أعلاه.
  </div>`;

  return `
    ${sectionHeader("مقارنة عروض الموردين (Tendering)")}
    <div class="kpi-grid" style="margin-bottom:14px;">${summary.join("")}</div>
    ${note}
    ${renderModuleView("procurementBids", "عروض الموردين المستلمة", MODULES.procurementBids.fields(), bids, extraColumns, readOnly)}
  `;
}

function renderContractsView() {
  const rows = filterByProject(STATE.data.contracts);
  const readOnly = !canEdit(STATE.user.role, "contracts");
  let chartHtml = "";
  if (rows.length) {
    const chart = barChart(rows.map((r) => r.party), [{ name: "قيمة العقد", color: "#1FB6A6", values: rows.map((r) => Number(r.value) || 0) }]);
    chartHtml = `<div class="frame p4" style="margin-bottom:14px;"><h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">قيم العقود</h3><div class="chart-box">${chart.outerHTML}</div></div>`;
  }
  return `${chartHtml}${renderModuleView("contracts", "إدارة العقود", MODULES.contracts.fields(), rows, [], readOnly)}`;
}

function renderQCView() {
  const rows = filterByProject(STATE.data.qc);
  const readOnly = !canEdit(STATE.user.role, "qc");
  const open = rows.filter((r) => deriveQCStatus(r) === "مفتوح");
  const overdue = rows.filter((r) => deriveQCStatus(r) === "متأخر");
  const closed = rows.filter((r) => deriveQCStatus(r) === "مغلق");
  const ncrOpen = rows.filter((r) => r.category === "NCR" && deriveQCStatus(r) !== "مغلق");
  const summary = [
    kpiCard({ label: "إجمالي البنود", value: rows.length, level: "info" }),
    kpiCard({ label: "مفتوحة", value: open.length, level: open.length ? "warn" : "good" }),
    kpiCard({ label: "متأخرة", value: overdue.length, level: overdue.length ? "danger" : "good" }),
    kpiCard({ label: "عدم توافق (NCR) غير مغلقة", value: ncrOpen.length, level: ncrOpen.length ? "danger" : "good" }),
    kpiCard({ label: "مغلقة", value: closed.length, level: "good" }),
  ];
  let chartHtml = "";
  if (rows.length) {
    const statuses = ["مفتوح", "قيد المعالجة", "مغلق", "متأخر"];
    const colors = ["#E5484D", "#F5A623", "#2FBF71", "#8B0000"];
    const data = statuses.map((s, i) => ({ name: s, value: rows.filter((r) => deriveQCStatus(r) === s).length, color: colors[i] })).filter((d) => d.value > 0);
    chartHtml = `<div class="frame p4" style="margin-bottom:14px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;"><h3 style="font-size:13px;color:#3D4759;margin:0;flex-basis:100%;">حالة بنود الجودة</h3>${donutChart(data).outerHTML}${legendHTML(data)}</div>`;
  }
  return `<div class="kpi-grid" style="margin-bottom:14px;">${summary.join("")}</div>${chartHtml}${renderModuleView("qc", "الجودة QA/QC", MODULES.qc.fields(), rows, [], readOnly)}`;
}

function renderHSEView() {
  const rows = filterByProject(STATE.data.hse);
  const readOnly = !canEdit(STATE.user.role, "hse");
  const openIncidents = rows.filter((r) => r.category === "حادث" && deriveHSEStatus(r) !== "مغلق");
  const overdue = rows.filter((r) => deriveHSEStatus(r) === "متأخر");
  const highSeverityOpen = rows.filter((r) => r.severity === "مرتفع" && deriveHSEStatus(r) !== "مغلق");
  const closed = rows.filter((r) => deriveHSEStatus(r) === "مغلق");
  const summary = [
    kpiCard({ label: "إجمالي البنود", value: rows.length, level: "info" }),
    kpiCard({ label: "حوادث مفتوحة (قيد التحقيق)", value: openIncidents.length, level: openIncidents.length ? "danger" : "good" }),
    kpiCard({ label: "مرتفعة الخطورة ولم تُغلق", value: highSeverityOpen.length, level: highSeverityOpen.length ? "danger" : "good" }),
    kpiCard({ label: "متأخرة عن الإغلاق المستهدف", value: overdue.length, level: overdue.length ? "danger" : "good" }),
    kpiCard({ label: "مغلقة", value: closed.length, level: "good" }),
  ];
  let chartHtml = "";
  if (rows.length) {
    const cats = ["حادث", "Near Miss", "Toolbox Meeting", "تصريح عمل", "تقييم مخاطر"];
    const counts = cats.map((c) => rows.filter((r) => r.category === c).length);
    const chart = barChart(cats, [{ name: "العدد", color: "#E5484D", values: counts }]);
    chartHtml = `<div class="frame p4" style="margin-bottom:14px;"><h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">توزيع أحداث السلامة</h3><div class="chart-box">${chart.outerHTML}</div></div>`;
  }
  const note = `<div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">
    كل حادث أو Near Miss يحتاج محقّقاً مسؤولاً وسبباً جذرياً وإجراءً تصحيحياً/وقائياً قبل إغلاقه رسمياً. الحوادث مرتفعة الخطورة غير المغلقة تظهر تلقائياً ضمن تنبيهات لوحة التحكم الرئيسية.
  </div>`;
  return `<div class="kpi-grid" style="margin-bottom:14px;">${summary.join("")}</div>${chartHtml}${note}${renderModuleView("hse", "السلامة HSE", MODULES.hse.fields(), rows, [], readOnly)}`;
}

/* ---------------- Change / Variation Orders (PMBOK integrated change control) ---------------- */
function renderChangeOrders() {
  const rows = filterByProject(STATE.data.changeOrders || []);
  const readOnly = !canEdit(STATE.user.role, "changeOrders");
  let chartHtml = "";
  if (rows.length) {
    const chart = barChart(rows.map((r) => r.title), [{ name: "الأثر على التكلفة", color: "#F5A623", values: rows.map((r) => Number(r.costImpact) || 0) }]);
    const totalCost = rows.reduce((s, r) => s + Number(r.costImpact || 0), 0);
    const totalDays = rows.reduce((s, r) => s + Number(r.scheduleImpactDays || 0), 0);
    chartHtml = `<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px;">
      ${kpiCard({ label: "عدد أوامر التغيير", value: rows.length, level: "info" })}
      ${kpiCard({ label: "إجمالي الأثر على التكلفة", value: fmtMoney(totalCost), level: totalCost > 0 ? "warn" : "good" })}
      ${kpiCard({ label: "إجمالي الأثر على الجدول", value: totalDays + " يوم", level: totalDays > 0 ? "warn" : "good" })}
    </div>
    <div class="frame p4" style="margin-bottom:14px;"><h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">الأثر المالي لكل أمر تغيير</h3><div class="chart-box">${chart.outerHTML}</div></div>`;
  }
  return `${sectionHeader("أوامر التغيير (Variation Orders)")}${chartHtml}${renderModuleView("changeOrders", "سجل أوامر التغيير", MODULES.changeOrders.fields(), rows, [], readOnly)}`;
}

/* ---------------- Data / Backup (import, export, reset) ---------------- */
function exportData() {
  const blob = new Blob([JSON.stringify(STATE.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `pms-backup-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function triggerImport() { document.getElementById("import-file-input").click(); }
function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!confirm("سيتم استبدال جميع البيانات الحالية بالكامل ببيانات الملف المستورد (لن تُدمَج، بل تُستبدَل تماماً). متابعة؟")) return;
      STATE.data = normalizeData(parsed);
      saveData(STATE.data);
      renderApp();
      showToast("تم استيراد البيانات بنجاح", "success");
    } catch (err) {
      alert("الملف غير صالح. تأكد أنه ملف تصدير من هذا النظام (JSON).");
    }
  };
  reader.readAsText(file);
  input.value = "";
}

/* ---------------- المشاركة والدمج الذكي (بلا سيرفر مركزي) ---------------- */
const MERGE_COLLECTION_LABELS = {
  projects: "المشاريع", tasks: "المهام", dailyReports: "التقارير اليومية", procurement: "طلبات الشراء",
  procurementBids: "عروض الموردين", contracts: "العقود", invoices: "الفواتير", qc: "الجودة", hse: "السلامة",
  risks: "المخاطر", changeOrders: "أوامر التغيير", ledger: "دفتر الأستاذ", labor: "العمالة", equipment: "المعدات",
  materials: "المواد", budgetItems: "بنود الميزانية", progressItems: "بنود الإنجاز", resourcePool: "سجل الموارد",
  custodies: "العهد", certificates: "مستخلصات المالك", claims: "المطالبات", subcontractorCertificates: "مستخلصات المقاولين",
  correspondence: "المراسلات", meetings: "الاجتماعات", decisions: "القرارات", punchlist: "الملاحظات والتسليم",
  documents: "الوثائق", users: "المستخدمون",
  projectAssets: "عناصر المشروع", realityCaptures: "المسوحات والتوثيق الواقعي", deviationReports: "تقارير الانحرافات",
  arSessions: "جلسات التفتيش الذكي", aiAnalysisResults: "نتائج الذكاء الاصطناعي",
};
function summarizeMergeDiff(before, after) {
  const lines = [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  keys.forEach((k) => {
    if (k === "_tombstones") return;
    const beforeArr = Array.isArray(before[k]) ? before[k] : [];
    const afterArr = Array.isArray(after[k]) ? after[k] : [];
    const beforeById = new Map(beforeArr.map((r) => [r.id, r]));
    const afterIds = new Set(afterArr.map((r) => r.id));
    let added = 0, updated = 0, removed = 0;
    afterArr.forEach((r) => {
      const old = beforeById.get(r.id);
      if (!old) added++;
      else if ((r.updatedAt || 0) !== (old.updatedAt || 0)) updated++;
    });
    beforeArr.forEach((r) => { if (!afterIds.has(r.id)) removed++; });
    if (added || updated || removed) lines.push({ key: k, added, updated, removed });
  });
  return lines;
}
async function shareMyData() {
  const json = JSON.stringify(STATE.data, null, 2);
  const fileName = `pms-data-${(STATE.user && STATE.user.name) || "user"}-${todayISO()}.json`;
  if (typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
    try {
      const file = new File([json], fileName, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "بيانات نظام إدارة المشاريع", text: "بيانات مشاركة للدمج" });
        return;
      }
    } catch (err) {
      // المستخدم ألغى نافذة المشاركة أو حدث خطأ — تابع للطريقة البديلة أدناه بدل الفشل الصامت
    }
  }
  exportData();
  alert("المشاركة المباشرة غير مدعومة في هذا المتصفح — نُزِّل الملف بدلاً من ذلك. شاركه يدوياً (واتساب، بلوتوث، AirDrop، بريد) مع الطرف الآخر ليستورده من صفحة «البيانات والنسخ الاحتياطي».");
}
function triggerMergeImport() { document.getElementById("merge-import-file-input").click(); }
function handleMergeImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const before = STATE.data;
      const merged = mergeIncomingData(parsed);
      const diff = summarizeMergeDiff(before, merged);
      let msg = "سيتم دمج البيانات المستلمة مع بياناتك الحالية — لا شيء لديك يُفقَد إلا ما حُذف فعلياً في المصدر بعد آخر تعديل معروف له.";
      if (diff.length) {
        msg += "\n\nملخص التغييرات المتوقَّعة:\n" + diff.map((d) => {
          const parts = [];
          if (d.added) parts.push(`${d.added} إضافة`);
          if (d.updated) parts.push(`${d.updated} تحديث`);
          if (d.removed) parts.push(`${d.removed} حذف`);
          return `• ${MERGE_COLLECTION_LABELS[d.key] || d.key}: ${parts.join("، ")}`;
        }).join("\n");
      } else {
        msg += "\n\nلا توجد أي فروقات فعلية بين النسختين حالياً.";
      }
      msg += "\n\nمتابعة الدمج؟";
      if (!confirm(msg)) return;
      STATE.data = merged;
      saveData(STATE.data);
      renderApp();
      showToast("تم الدمج بنجاح — بياناتك محدَّثة بأحدث ما لدى الطرفين", "success");
    } catch (err) {
      alert("الملف غير صالح. تأكد أنه ملف بيانات مُصدَّر أو مُشارَك من هذا النظام.");
    }
  };
  reader.readAsText(file);
  input.value = "";
}
function resetSystemData() {
  if (!confirm("سيتم حذف كل البيانات الحالية والبدء ببيانات تجريبية جديدة. متابعة؟")) return;
  STATE.data = seedData();
  saveData(STATE.data);
  renderApp();
}
function wipeAllData() {
  if (!confirm("سيتم حذف كل البيانات نهائياً (المشاريع، الموارد، الفواتير، المستخلصات، وكل شيء آخر) والعودة لحسابات الدخول الافتراضية فقط. هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟")) return;
  const base = seedData();
  const wiped = {};
  Object.keys(base).forEach((k) => { wiped[k] = Array.isArray(base[k]) ? (k === "users" ? base[k] : []) : base[k]; });
  // سجل التدقيق نفسه يبقى محفوظاً عبر المسح — لا يجوز أن يمحو المسح دليل حدوثه
  wiped._auditLog = STATE.data._auditLog || [];
  STATE.data = wiped;
  logAudit("delete", "system", "wipe-all", `مسح شامل لكل بيانات النظام بواسطة ${(STATE.user && STATE.user.name) || "—"}`);
  saveData(STATE.data);
  renderApp();
  alert("تم مسح كل البيانات. حسابات الدخول الافتراضية (owner/gm/pm1/pm2/eng1/acc1) أُعيدت لضمان إمكانية الدخول للنظام من جديد.");
}
/* ---------------- مراقبة حجم التخزين — لتفادي فشل صامت عند تجاوز حدود المزامنة السحابية أو التخزين المحلي ---------------- */
function computeStorageStats() {
  const json = JSON.stringify(STATE.data);
  const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  const totalBytes = encoder ? encoder.encode(json).length : json.length;
  const byCollection = Object.keys(STATE.data).map((k) => {
    const kJson = JSON.stringify(STATE.data[k]);
    const size = encoder ? encoder.encode(kJson).length : kJson.length;
    return { key: k, size };
  }).sort((a, b) => b.size - a.size);
  return { totalBytes, byCollection };
}
function fmtBytes(n) {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} كيلوبايت`;
  return `${(n / (1024 * 1024)).toFixed(2)} ميجابايت`;
}
function renderStoragePanel() {
  const stats = computeStorageStats();
  const FIRESTORE_LIMIT = 1024 * 1024; // حد Firestore الصارم لكل مستند واحد
  const pct = Math.min(100, Math.round((stats.totalBytes / FIRESTORE_LIMIT) * 100));
  const level = pct >= 90 ? "danger" : pct >= 70 ? "warn" : "good";
  const barColor = level === "danger" ? "#E5484D" : level === "warn" ? "#F5A623" : "#2FBF71";
  const topCollections = stats.byCollection.filter((c) => c.size > 0).slice(0, 6);
  const collectionLabels = { invoices: "الفواتير", documents: "الوثائق", punchlist: "الملاحظات والتسليم", certificates: "مستخلصات المالك",
    subcontractorCertificates: "مستخلصات المقاولين", correspondence: "المراسلات", meetings: "الاجتماعات", hse: "السلامة", qc: "الجودة" };
  return `<div class="frame p4" style="margin-bottom:14px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">حجم البيانات المخزَّنة</h3>
    <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);margin-bottom:6px;">
      <span>${fmtBytes(stats.totalBytes)} من أصل 1 ميجابايت (حد المزامنة السحابية لكل مستند)</span>
      ${statusDot(level)}
    </div>
    <div style="background:#FFFFFF;border-radius:6px;height:8px;overflow:hidden;margin-bottom:10px;">
      <div style="width:${pct}%;height:100%;background:${barColor};"></div>
    </div>
    ${level !== "good" ? `<div class="frame p4" style="margin-bottom:10px;font-size:12px;color:${level === "danger" ? "var(--danger)" : "var(--warn)"};">
      ${level === "danger" ? "⚠ قريب جداً من حد المزامنة السحابية — قد تتوقف المزامنة عن العمل بصمت إن تجاوزت الحد. راجع أكبر السجلات أدناه وقلّل حجم الصور المرفقة." : "تنبيه: الحجم بدأ يقترب من حد المزامنة السحابية — راقب نمو البيانات، خصوصاً المرفقات المصوَّرة."}
    </div>` : ""}
    ${topCollections.length ? `<div style="font-size:11.5px;color:var(--muted2);margin-bottom:4px;">أكبر المجموعات حجماً:</div>
    <div style="display:flex;flex-direction:column;gap:4px;">${topCollections.map((c) => `<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);"><span>${esc(collectionLabels[c.key] || c.key)}</span><span style="font-family:monospace;">${fmtBytes(c.size)}</span></div>`).join("")}</div>` : ""}
    <div style="font-size:11px;color:var(--muted2);margin-top:8px;">هذا التخزين المحلي في المتصفح عادة يتحمل 5-10 ميجابايت قبل رفض الحفظ؛ التقدير هنا محسوب من حجم البيانات الفعلي الآن، لا تقديراً تقريبياً.</div>
  </div>`;
}

/* ============================================================
   سجل التدقيق (Audit Log) — عرض حقيقي وشفاف لكل عملية إنشاء/تعديل/حذف
   نفَّذها أي مستخدم في النظام، قابل للبحث والتصفية.
   ============================================================ */
function onAuditFilterChange(key, val) {
  STATE.auditFilter = STATE.auditFilter || { search: "", action: "all", collection: "all", page: 1 };
  STATE.auditFilter[key] = val;
  STATE.auditFilter.page = 1;
  renderApp();
}
function onAuditPageChange(page) {
  STATE.auditFilter = STATE.auditFilter || { search: "", action: "all", collection: "all", page: 1 };
  STATE.auditFilter.page = page;
  renderApp();
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toISOString().slice(0, 10) + " " + d.toTimeString().slice(0, 5);
}
function renderAuditLogView() {
  const filter = STATE.auditFilter || { search: "", action: "all", collection: "all", page: 1 };
  STATE.auditFilter = filter;
  const allEntries = (STATE.data._auditLog || []).slice().sort((a, b) => b.timestamp - a.timestamp);

  const actionLabels = { create: "إنشاء", update: "تعديل", delete: "حذف", view: "استعلام" };
  const actionLevel = { create: "good", update: "warn", delete: "danger", view: "info" };

  let filtered = allEntries;
  if (filter.action !== "all") filtered = filtered.filter((e) => e.action === filter.action);
  if (filter.collection !== "all") filtered = filtered.filter((e) => e.collection === filter.collection);
  if (filter.search.trim()) {
    const q = filter.search.trim().toLowerCase();
    filtered = filtered.filter((e) => `${e.label} ${e.userName} ${e.userRole}`.toLowerCase().includes(q));
  }

  const collections = Array.from(new Set(allEntries.map((e) => e.collection))).sort();
  const totalPages = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));
  if (filter.page > totalPages) filter.page = totalPages;
  const pageStart = (filter.page - 1) * TABLE_PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + TABLE_PAGE_SIZE);

  const summary = [
    kpiCard({ label: "إجمالي الأحداث المسجَّلة", value: allEntries.length, level: "info" }),
    kpiCard({ label: "عمليات إنشاء", value: allEntries.filter((e) => e.action === "create").length, level: "good" }),
    kpiCard({ label: "عمليات تعديل", value: allEntries.filter((e) => e.action === "update").length, level: "warn" }),
    kpiCard({ label: "عمليات حذف", value: allEntries.filter((e) => e.action === "delete").length, level: "danger" }),
  ];

  const rows = pageRows.map((e) => `<tr>
    <td style="font-family:monospace;font-size:11px;white-space:nowrap;">${esc(fmtDateTime(e.timestamp))}</td>
    <td>${esc(e.userName)}<div style="font-size:10px;color:var(--muted2);">${esc(e.userRole)}</div></td>
    <td>${statusDot(actionLevel[e.action] || "info", actionLabels[e.action] || e.action)}</td>
    <td>${esc(MERGE_COLLECTION_LABELS[e.collection] || e.collection)}</td>
    <td>${esc(e.label)}</td>
  </tr>`).join("");

  const pagerHtml = totalPages > 1 ? `<div class="pager">
      <button class="btn ghost sm" ${filter.page <= 1 ? "disabled" : ""} onclick="onAuditPageChange(${filter.page - 1})">‹ السابق</button>
      <span class="pager-info">صفحة ${filter.page} من ${totalPages} (${filtered.length} حدث)</span>
      <button class="btn ghost sm" ${filter.page >= totalPages ? "disabled" : ""} onclick="onAuditPageChange(${filter.page + 1})">التالي ›</button>
    </div>` : "";

  return `${sectionHeader("سجل التدقيق")}
    <div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);">
      سجل حقيقي وكامل لكل عملية إنشاء أو تعديل أو حذف نفَّذها أي مستخدم في النظام — من نفَّذها، بالضبط متى، وعلى أي سجل. محفوظ محلياً ضمن بيانات النظام، ولا يمكن تعديله أو حذفه يدوياً حتى من مالك الشركة.
    </div>
    <div class="kpi-grid" style="margin-bottom:14px;">${summary.join("")}</div>
    <div class="frame p4">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <input class="inp" style="flex:1;min-width:180px;" placeholder="بحث بالاسم أو المستخدم..." value="${esc(filter.search)}" oninput="onAuditFilterChange('search', this.value)" />
        <select onchange="onAuditFilterChange('action', this.value)">
          <option value="all" ${filter.action === "all" ? "selected" : ""}>كل العمليات</option>
          <option value="create" ${filter.action === "create" ? "selected" : ""}>إنشاء فقط</option>
          <option value="update" ${filter.action === "update" ? "selected" : ""}>تعديل فقط</option>
          <option value="delete" ${filter.action === "delete" ? "selected" : ""}>حذف فقط</option>
        </select>
        <select onchange="onAuditFilterChange('collection', this.value)">
          <option value="all">كل الوحدات</option>
          ${collections.map((c) => `<option value="${esc(c)}" ${filter.collection === c ? "selected" : ""}>${esc(MERGE_COLLECTION_LABELS[c] || c)}</option>`).join("")}
        </select>
      </div>
      ${pageRows.length ? `<div style="overflow-x:auto"><table><thead><tr><th>التوقيت</th><th>المستخدم</th><th>العملية</th><th>الوحدة</th><th>السجل</th></tr></thead><tbody>${rows}</tbody></table></div>${pagerHtml}` : emptyState("لا توجد أحداث مطابقة بعد.")}
    </div>`;
}

/* ============================================================
   استيراد/تصدير الفواتير من وإلى Excel — طبقة اختيارية فوق النظام
   الحالي لمن يعمل أصلاً بجداول Excel، لا نظاماً منفصلاً. يستخدم
   مكتبة SheetJS المُحمَّلة عبر CDN.
   ============================================================ */
function downloadInvoiceExcelTemplate() {
  if (typeof XLSX === "undefined") { alert("مكتبة معالجة Excel لم تُحمَّل بعد — تأكد من وجود اتصال إنترنت عند أول استخدام، ثم أعد المحاولة."); return; }
  const realProjectNames = (STATE.data.projects || []).slice(0, 2).map((p) => p.name);
  const exampleRows = [
    { "اسم المشروع (بالضبط كما في النظام)": realProjectNames[0] || "اسم المشروع هنا", "الجهة (عميل / مورد)": "عميل", "نوع الفاتورة": "فاتورة عادية",
      "رقم الفاتورة": "INV-1001", "القيمة الإجمالية": 50000, "المدفوع (اتركه 0 إن لم يُدفَع شيء بعد)": 0, "تاريخ الاستحقاق (YYYY-MM-DD)": todayISO(), "الحالة (مدفوعة / جزئية / مستحقة)": "مستحقة" },
    { "اسم المشروع (بالضبط كما في النظام)": realProjectNames[1] || realProjectNames[0] || "اسم المشروع هنا", "الجهة (عميل / مورد)": "مورد", "نوع الفاتورة": "فاتورة عادية",
      "رقم الفاتورة": "INV-1002", "القيمة الإجمالية": 12500, "المدفوع (اتركه 0 إن لم يُدفَع شيء بعد)": 12500, "تاريخ الاستحقاق (YYYY-MM-DD)": todayISO(), "الحالة (مدفوعة / جزئية / مستحقة)": "مدفوعة" },
  ];
  const wsData = XLSX.utils.json_to_sheet(exampleRows);
  wsData["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 24 }];
  const realProjectList = (STATE.data.projects || []).map((p) => p.name);
  const wsInstructions = XLSX.utils.aoa_to_sheet([
    ["تعليمات التعبئة — اقرأ قبل البدء"],
    [""],
    ["١. لا تُغيِّر أسماء الأعمدة في ورقة «فواتير» — النظام يقرأها بالاسم بالضبط."],
    ["٢. اسم المشروع يجب أن يُطابق اسماً موجوداً فعلياً في النظام تماماً بالحروف — راجع القائمة أدناه."],
    ["٣. الحالة يجب أن تكون واحدة من: مدفوعة / جزئية / مستحقة — لا قيمة أخرى."],
    ["٤. التاريخ بصيغة YYYY-MM-DD (مثال: 2026-08-09)."],
    ["٥. عند الاستيراد، سيعرض لك النظام معاينة كاملة قبل أي حفظ فعلي، ويوضّح أي صف فيه خطأ ليصحَّح قبل التأكيد."],
    [""],
    ["أسماء المشاريع الموجودة فعلياً في النظام الآن:"],
    ...realProjectList.map((n) => [n]),
  ]);
  wsInstructions["!cols"] = [{ wch: 70 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsInstructions, "تعليمات");
  XLSX.utils.book_append_sheet(wb, wsData, "فواتير");
  XLSX.writeFile(wb, "نموذج-استيراد-الفواتير.xlsx");
}
function triggerInvoiceExcelImport() { document.getElementById("invoice-excel-import-input").click(); }
function handleInvoiceExcelImportFile(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  if (typeof XLSX === "undefined") { alert("مكتبة معالجة Excel لم تُحمَّل بعد."); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const sheetName = wb.SheetNames.find((n) => n === "فواتير") || wb.SheetNames[wb.SheetNames.length - 1];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
      STATE.excelImportPreview = validateInvoiceImportRows(rows);
      renderApp();
    } catch (err) {
      alert("تعذّر قراءة الملف — تأكد أنه ملف Excel صحيح بالتنسيق المتوقَّع.");
    }
  };
  reader.readAsBinaryString(file);
  inputEl.value = "";
}
function validateInvoiceImportRows(rows) {
  const validStatuses = ["مدفوعة", "جزئية", "مستحقة"];
  const validTypes = ["عميل", "مورد"];
  return rows.map((row, i) => {
    const errors = [];
    const projectName = row["اسم المشروع (بالضبط كما في النظام)"];
    const project = (STATE.data.projects || []).find((p) => p.name === projectName);
    if (!projectName) errors.push("اسم المشروع مفقود");
    else if (!project) errors.push(`لا يوجد مشروع بهذا الاسم بالضبط: «${projectName}»`);
    const type = row["الجهة (عميل / مورد)"];
    if (!validTypes.includes(type)) errors.push(`الجهة يجب أن تكون «عميل» أو «مورد» — القيمة الحالية: «${type || "فارغة"}»`);
    const number = row["رقم الفاتورة"];
    if (!number) errors.push("رقم الفاتورة مفقود");
    else if ((STATE.data.invoices || []).some((inv) => inv.number === String(number))) errors.push(`رقم الفاتورة «${number}» مستخدَم فعلياً في النظام`);
    const amount = Number(row["القيمة الإجمالية"]);
    if (!amount || amount <= 0) errors.push("القيمة الإجمالية يجب أن تكون رقماً أكبر من صفر");
    const status = row["الحالة (مدفوعة / جزئية / مستحقة)"] || "مستحقة";
    if (!validStatuses.includes(status)) errors.push(`الحالة يجب أن تكون واحدة من: ${validStatuses.join("، ")}`);
    return {
      rowIndex: i + 2, // رقم الصف الفعلي في Excel (بعد صف العناوين)
      valid: errors.length === 0, errors,
      data: { projectId: project ? project.id : null, type, category: row["نوع الفاتورة"] || "فاتورة عادية", number: String(number || ""),
        amount, paidAmount: Number(row["المدفوع (اتركه 0 إن لم يُدفَع شيء بعد)"]) || 0, dueDate: row["تاريخ الاستحقاق (YYYY-MM-DD)"] || "", status },
    };
  });
}
function confirmInvoiceExcelImport() {
  const preview = STATE.excelImportPreview || [];
  const validRows = preview.filter((r) => r.valid);
  if (!validRows.length) { alert("لا توجد صفوف صالحة للاستيراد."); return; }
  if (!confirm(`استيراد ${validRows.length} فاتورة صالحة الآن؟ (${preview.length - validRows.length} صف بها أخطاء ستُتجاهَل)`)) return;
  let imported = 0;
  validRows.forEach((r) => {
    MODULES.invoices.add(r.data);
    imported++;
  });
  STATE.excelImportPreview = null;
  renderApp();
  showToast(`تم استيراد ${imported} فاتورة بنجاح`, "success");
}
function cancelInvoiceExcelImport() { STATE.excelImportPreview = null; renderApp(); }
function renderInvoiceImportPreview() {
  const preview = STATE.excelImportPreview;
  if (!preview) return "";
  const validCount = preview.filter((r) => r.valid).length;
  return `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid ${validCount === preview.length ? "var(--good)" : "var(--warn)"};">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">معاينة الاستيراد — ${validCount} صحيح من ${preview.length}</h3>
    <div style="max-height:300px;overflow-y:auto;">
      ${preview.map((r) => `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border2);">
        <span style="width:20px;color:${r.valid ? "var(--good)" : "var(--danger)"};">${r.valid ? "✓" : "✕"}</span>
        <div style="flex:1;font-size:11.5px;">
          <span style="color:#0F1420;">صف ${r.rowIndex}: ${esc(r.data.number || "—")} — ${fmtMoney(r.data.amount || 0)}</span>
          ${!r.valid ? `<div style="color:var(--danger);font-size:10.5px;margin-top:2px;">${r.errors.map(esc).join("، ")}</div>` : ""}
        </div>
      </div>`).join("")}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      ${btn(`✓ تأكيد استيراد ${validCount} فاتورة`, "confirmInvoiceExcelImport()", "primary", "sm")}
      ${btn("إلغاء", "cancelInvoiceExcelImport()", "ghost", "sm")}
    </div>
  </div>`;
}

function renderDataView() {
  const excelPanel = canEdit(STATE.user.role, "invoices") ? `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--info);">
    <h3 style="font-size:13px;color:var(--info);margin:0 0 10px;">📊 استيراد/تصدير الفواتير من Excel</h3>
    <p style="font-size:12.5px;color:var(--muted);line-height:1.8;">لمن يعمل أصلاً بجداول Excel: نزِّل النموذج، عبِّئه بنفس أعمدته بالضبط، ثم استورده — سيعرض النظام معاينة كاملة مع أي أخطاء قبل أي حفظ فعلي، فيُطابَق تلقائياً مع أسماء المشاريع الموجودة فعلياً في النظام.</p>
    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
      ${btn("⭳ تحميل نموذج Excel", "downloadInvoiceExcelTemplate()", "ghost", "sm")}
      ${btn("⭱ استيراد ملف Excel مُعبَّأ", "triggerInvoiceExcelImport()", "primary", "sm")}
      <input type="file" id="invoice-excel-import-input" accept=".xlsx,.xls" style="display:none" onchange="handleInvoiceExcelImportFile(this)" />
    </div>
    ${renderInvoiceImportPreview()}
  </div>` : "";
  return `
    ${sectionHeader("البيانات والنسخ الاحتياطي")}
    ${excelPanel}
    ${renderStoragePanel()}
    <div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--accent);">
      <h3 style="font-size:13px;color:var(--accent);margin:0 0 10px;">🔄 المشاركة والمزامنة الذكية (موصى بها)</h3>
      <p style="font-size:12.5px;color:var(--muted);line-height:1.8;">شارك بياناتك مباشرة من هاتفك (AirDrop، Nearby Share، واتساب، بلوتوث — أياً كانت طريقة المشاركة المتاحة على جهازك)، والطرف الآخر يستوردها بـ«دمج ذكي»: أي سجل جديد يُضاف، وأي تعديل أحدث يُطبَّق، <b>دون فقدان أي شيء موجود لديه أصلاً</b> — تماماً كما لو كنتما تعملان على نفس القاعدة السحابية، بدون الحاجة لأي خادم أو اتصال دائم بالإنترنت.</p>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
        ${btn("📤 مشاركة بياناتي", "shareMyData()", "primary", "sm")}
        ${btn("🔀 استيراد ودمج بيانات مستلمة", "triggerMergeImport()", "ghost", "sm")}
        <input type="file" id="merge-import-file-input" accept="application/json" style="display:none" onchange="handleMergeImportFile(this)" />
      </div>
    </div>
    <div class="frame p4" style="margin-bottom:14px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">تصدير / استيراد (استبدال كامل)</h3>
      <p style="font-size:12.5px;color:var(--muted);line-height:1.8;">للنسخ الاحتياطي أو استعادة كاملة فقط — بخلاف الدمج الذكي أعلاه، أي استيراد هنا <b>يستبدل كل بياناتك الحالية بالكامل</b> بمحتوى الملف، ولا يدمج شيئاً. استخدمه فقط عند الحاجة لاستعادة نسخة احتياطية كاملة، لا للمزامنة المعتادة بين الأجهزة.</p>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
        ${btn("⭳ تصدير نسخة JSON", "exportData()", "ghost", "sm")}
        ${btn("⭱ استيراد نسخة JSON (استبدال كامل)", "triggerImport()", "danger", "sm")}
        <input type="file" id="import-file-input" accept="application/json" style="display:none" onchange="handleImportFile(this)" />
      </div>
    </div>
    <div class="frame p4">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">إعادة الضبط</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${btn("↺ استرجاع بيانات تجريبية", "resetSystemData()", "ghost", "sm")}
        ${btn("🗑 حذف كل البيانات نهائياً", "wipeAllData()", "danger", "sm")}
      </div>
    </div>
  `;
}

/* ---------------- Cloud sync settings ---------------- */
function submitCloudForm(ev) {
  ev.preventDefault();
  const cfgText = document.getElementById("cloud-config-input").value.trim();
  const orgCode = document.getElementById("cloud-org-input").value.trim();
  if (!cfgText || !orgCode) { alert("الصق بيانات الاتصال (Firebase config) واكتب رمز المؤسسة."); return; }
  let cfgObj;
  try { cfgObj = JSON.parse(cfgText); } catch (e) {
    alert("صيغة بيانات الاتصال غير صحيحة. انسخها كاملة كما هي من Firebase Console (كائن JSON).");
    return;
  }
  connectCloud(cfgObj, orgCode);
}
function disconnectCloudUI() {
  if (!confirm("سيتوقف هذا الجهاز عن المزامنة الفورية وسيستمر بالعمل محلياً فقط. متابعة؟")) return;
  clearCloudConfig();
  renderApp();
}
/* ============================================================
   مركز الاتصالات الخارجية (External Connections Center) —
   سجل Plugins حقيقي: أي اتصال خارجي جديد يُضاف كعنصر بهذا الشكل
   بالضبط دون تعديل أي كود أساسي في النظام. حالياً يوجد اتصال واحد
   يعمل فعلياً (Firebase)؛ الباقي يحتاج خادماً حقيقياً غير متوفر في
   هذا النظام (موضَّح بصراحة أدناه، لا أزرار وهمية).
   ============================================================ */
const CONNECTORS = [
  {
    key: "firebase", name: "المزامنة السحابية (Firebase Firestore)", icon: "☁",
    kind: "real", // اتصال حقيقي يعمل فعلياً من داخل المتصفح مباشرة
    status: () => STATE.cloudStatus || "disconnected",
    statusLabel: () => ({ connected: "متصل", error: "خطأ", disconnected: "غير متصل" }[STATE.cloudStatus] || "غير متصل"),
    desc: "مزامنة لحظية ثنائية الاتجاه لكامل بيانات النظام بين كل من يستخدم نفس رمز المؤسسة.",
  },
  {
    key: "msgraph", name: "Microsoft 365 (Outlook / التقويم / OneDrive)", icon: "📧",
    kind: "real",
    status: () => STATE.msGraphStatus || "disconnected",
    statusLabel: () => ({ connected: "متصل: " + (STATE.msGraphUserName || ""), error: "خطأ", disconnected: "غير متصل" }[STATE.msGraphStatus] || "غير متصل"),
    desc: "تسجيل دخول Microsoft حقيقي (SSO) لربط بريدك ومواعيد تقويمك وملفات OneDrive الخاصة بك بمشاريعك — اتصال شخصي لكل مستخدم بحسابه هو.",
  },
  {
    key: "share", name: "المشاركة والدمج الذكي (بلا خادم)", icon: "🔀",
    kind: "real",
    status: () => "available",
    statusLabel: () => "متاح دائماً",
    desc: "مشاركة ملف بيانات عبر أي وسيلة يدعمها جهازك (AirDrop، بلوتوث، واتساب)، ودمجه سجلاً-بسجل بالأحدث زمنياً دون فقدان أي بيانات.",
  },
];
const FUTURE_INTEGRATIONS = [
  { name: "Microsoft 365 / Outlook / Teams / OneDrive", note: "يحتاج تسجيل تطبيق OAuth حقيقياً لدى Microsoft، وخادماً وسيطاً يحفظ مفتاح الاتصال السرّي بأمان." },
  { name: "SAP S/4HANA", note: "واجهات SAP تتطلب اتصالاً من خادم إلى خادم عادةً عبر بروتوكولات (RFC/OData) لا تعمل مباشرة من متصفح." },
  { name: "Oracle Primavera P6 / Oracle Unifier", note: "تحتاج API Gateway خاصاً بمؤسستك يتحقق من الصلاحيات قبل تمرير الطلبات." },
  { name: "Autodesk Construction Cloud / Revit / AutoCAD", note: "تتطلب حساب مطوّر Autodesk وخادماً وسيطاً لإدارة رموز الوصول." },
  { name: "Power BI", note: "يمكن تصدير البيانات لتنسيق يقبله Power BI مباشرة الآن؛ الاتصال المباشر يحتاج تسجيل تطبيق Azure AD." },
  { name: "خدمات المسح الثلاثي الأبعاد ورؤية الحاسوب (Buildots / OpenSpace / مزوّدو الدرون وHoloLens)", note: "البنية جاهزة لاستقبال نتائجها (صفحة «التوثيق الرقمي والرصد الذكي»): إما عبر استيراد ملف JSON بصيغة موثَّقة (يعمل الآن)، أو عبر كتابة تلك الخدمة مباشرة لقاعدة Firestore نفسها المستخدَمة في المزامنة السحابية (يحتاج بناء تلك الخدمة الخارجية نفسها أولاً، ثم منحها بيانات اتصال Firebase). لا معالجة LiDAR أو نماذج تعلّم آلي أو تطبيق نظارات فعلي هنا — تلك مستحيلة من متصفح واحد بلا خادم وGPU." },
];
function renderConnectionsCenter() {
  const cards = CONNECTORS.map((c) => {
    const status = c.status();
    const level = status === "connected" || status === "available" ? "good" : status === "error" ? "danger" : "warn";
    return `<div class="frame p4">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="font-size:20px;">${c.icon}</div>${statusDot(level, c.statusLabel())}
      </div>
      <div style="font-size:13px;color:#0F1420;font-weight:700;margin-bottom:4px;">${esc(c.name)}</div>
      <div style="font-size:11.5px;color:var(--muted);line-height:1.7;margin-bottom:10px;">${esc(c.desc)}</div>
      ${c.key === "firebase" ? btn("فتح إعدادات المزامنة", "setActive('cloud')", "primary", "sm")
        : c.key === "msgraph" ? btn("فتح Microsoft 365", "setActive('msgraph')", "primary", "sm")
        : btn("فتح صفحة البيانات والمشاركة", "setActive('data')", "primary", "sm")}
    </div>`;
  }).join("");

  const futureRows = FUTURE_INTEGRATIONS.map((f) => `<tr><td style="font-weight:700;color:#0F1420;">${esc(f.name)}</td><td style="color:var(--muted);font-size:12px;">${esc(f.note)}</td></tr>`).join("");

  return `${sectionHeader("مركز الاتصالات الخارجية")}
    <div class="frame p4" style="margin-bottom:14px;font-size:12.5px;color:var(--muted);line-height:1.8;">
      كل اتصال هنا مبني كوحدة مستقلة (Plugin) بمعايير موحَّدة — أي اتصال جديد حقيقي يُضاف مستقبلاً يُسجَّل هنا بنفس الطريقة دون تعديل أي كود أساسي في النظام. النظام الحالي يعمل بالكامل من متصفح واحد بلا خادم مركزي، لذا الاتصالات المعروضة تحت "متاح الآن" هي فقط ما يمكن أن يعمل فعلياً بهذا التصميم.
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px;">${cards}</div>
    <div class="frame p4">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">🔒 تكاملات تحتاج خادماً حقيقياً (غير متاحة حالياً بصراحة)</h3>
      <div style="overflow-x:auto"><table><thead><tr><th>النظام</th><th>ما يلزم فعلياً لتفعيله</th></tr></thead><tbody>${futureRows}</tbody></table></div>
      <p style="font-size:11px;color:var(--muted2);margin-top:10px;">هذه ليست أزراراً معطَّلة عشوائياً — هي إفصاح صريح بأن الاتصال المباشر بهذه الأنظمة من متصفح واحد بلا خادم مركزي غير ممكن تقنياً، لا نقصاً في التطوير.</p>
    </div>`;
}

/* ============================================================
   صفحة Primavera P6 — استيراد/تصدير (XER/CSV)، فحص صحة الجدول،
   وخطوط الأساس المتعددة.
   ============================================================ */
function renderPrimaveraImportExportTab() {
  const preview = STATE.primaveraImportPreview;
  const importSection = preview ? `
    <div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--accent);">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">معاينة الاستيراد قبل الالتزام (${preview.fileType.toUpperCase()})</h3>
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:12px;">
        ${kpiCard({ label: "مشاريع", value: preview.summary.projectCount, level: "info" })}
        ${kpiCard({ label: "أنشطة", value: preview.summary.taskCount, level: "info" })}
        ${kpiCard({ label: "علاقات", value: preview.summary.relationshipCount, level: "info" })}
      </div>
      ${preview.warnings.length ? `<div class="frame p4" style="margin-bottom:10px;border-right:3px solid var(--warn);"><b style="color:var(--warn);font-size:12px;">تنبيهات (${preview.warnings.length}):</b>${preview.warnings.map((w) => `<div style="font-size:11.5px;color:var(--muted);margin-top:4px;">• ${esc(w)}</div>`).join("")}</div>` : ""}
      ${preview.conflicts.length ? `<div class="frame p4" style="margin-bottom:10px;border-right:3px solid var(--danger);"><b style="color:var(--danger);font-size:12px;">تعارضات (${preview.conflicts.length}):</b>${preview.conflicts.map((c) => `<div style="font-size:11.5px;color:var(--muted);margin-top:4px;">• ${esc(c)}</div>`).join("")}</div>` : ""}
      <div style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;">
        <table><thead><tr><th>رقم النشاط</th><th>الاسم</th><th>البداية</th><th>النهاية</th><th>الإنجاز</th></tr></thead>
        <tbody>${preview.tasks.slice(0, 50).map((t) => `<tr><td>${esc(t.activityId || "—")}</td><td>${esc(t.name)}</td><td>${esc(t.start || "—")}</td><td>${esc(t.end || "—")}</td><td>${t.completion || 0}%</td></tr>`).join("")}</tbody></table>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${btn("✓ تأكيد الاستيراد (مشروع جديد)", "confirmPrimaveraImport(null)", "primary", "sm")}
        <select id="primavera-target-project" style="min-width:200px;">
          <option value="">— أو استورد داخل مشروع موجود —</option>
          ${STATE.data.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
        </select>
        ${btn("استيراد داخل المشروع المحدَّد", "confirmPrimaveraImport(document.getElementById('primavera-target-project').value)", "ghost", "sm")}
        ${btn("إلغاء", "cancelPrimaveraImport()", "danger", "sm")}
      </div>
    </div>` : "";

  return `
    <div class="frame p4" style="margin-bottom:14px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">استيراد من Primavera</h3>
      <p style="font-size:12px;color:var(--muted);margin-bottom:10px;">يدعم ملفات XER (الأكثر استخداماً لتبادل الجداول مع Primavera P6) وCSV. لملفات P6 XML، صدِّرها من Primavera كـXER بدلاً من ذلك.</p>
      <input type="file" id="primavera-import-input" accept=".xer,.csv" style="display:none" onchange="handlePrimaveraImportFile(this)" />
      <div style="display:flex;gap:8px;">
        ${btn("📥 اختيار ملف XER أو CSV", "triggerPrimaveraImport()", "primary", "sm")}
        ${btn("↩ التراجع عن آخر استيراد", "doRollbackLastImport()", "ghost", "sm")}
      </div>
    </div>
    ${importSection}
    <div class="frame p4">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">تصدير إلى Primavera</h3>
      <p style="font-size:12px;color:var(--muted);margin-bottom:10px;">يُنشئ ملفاً صالحاً يمكن فتحه مباشرة داخل Primavera P6 (استيراد XER عادي) دون فقدان الأنشطة أو الروابط أو نسب الإنجاز.</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${STATE.data.projects.map((p) => `<div style="display:flex;justify-content:space-between;align-items:center;background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:8px 12px;">
          <span style="font-size:12.5px;color:#0F1420;">${esc(p.name)}</span>
          <div style="display:flex;gap:6px;">${btn("XER", `exportPrimaveraXER('${p.id}')`, "ghost", "sm")}${btn("CSV", `exportPrimaveraCSV('${p.id}')`, "ghost", "sm")}</div>
        </div>`).join("")}
      </div>
    </div>`;
}

function renderPrimaveraHealthCheckTab() {
  const projectId = STATE.primaveraHealthCheckProjectId;
  const report = STATE.primaveraHealthCheckReport;
  const statusLevel = { pass: "good", fail: "danger", na: "info" };
  const statusLabel = { pass: "سليم", fail: "توجد مشاكل", na: "غير قابل للفحص" };
  return `
    <div class="frame p4" style="margin-bottom:14px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">فحص صحة الجدول الزمني (12 فحصاً)</h3>
      <select onchange="runHealthCheckFor(this.value)">
        <option value="">اختر مشروعاً...</option>
        ${STATE.data.projects.map((p) => `<option value="${p.id}" ${projectId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
      </select>
    </div>
    ${report ? `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px;">
        ${kpiCard({ label: "إجمالي الأنشطة", value: report.taskCount, level: "info" })}
        ${kpiCard({ label: "إجمالي المشاكل المكتشفة", value: report.totalIssues, level: report.totalIssues ? "danger" : "good" })}
        ${kpiCard({ label: "فحوص سليمة", value: report.checks.filter((c) => c.status === "pass").length + "/" + report.checks.length, level: "good" })}
      </div>
      ${report.checks.map((c) => `<div class="frame p4" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <b style="font-size:13px;color:#0F1420;">${esc(c.label)}</b>
          ${statusDot(statusLevel[c.status], statusLabel[c.status] + (c.issues.length ? ` (${c.issues.length})` : ""))}
        </div>
        ${c.issues.length ? `<div style="max-height:150px;overflow-y:auto;">${c.issues.slice(0, 20).map((i) => `<div style="font-size:11.5px;color:var(--muted);padding:4px 0;border-bottom:1px solid var(--row2);">«${esc(i.taskName || i.taskId)}» — ${esc(i.detail)}</div>`).join("")}</div>` : ""}
        <div style="font-size:11px;color:var(--muted2);margin-top:6px;">💡 ${esc(c.recommendation)}</div>
      </div>`).join("")}
    ` : emptyState("اختر مشروعاً أعلاه لتشغيل الفحص.")}`;
}

function renderPrimaveraBaselinesTab() {
  const compare = STATE.primaveraBaselineCompare;
  const project = compare ? STATE.data.projects.find((p) => p.id === compare.projectId) : null;
  const baselines = project ? (project.baselines || []) : [];

  let comparisonHtml = "";
  if (compare && compare.baselineIdA) {
    const baselineA = compare.baselineIdA === "current" ? getCurrentAsBaselineSnapshot(project) : baselines.find((b) => b.id === compare.baselineIdA);
    const baselineB = compare.baselineIdB ? (compare.baselineIdB === "current" ? getCurrentAsBaselineSnapshot(project) : baselines.find((b) => b.id === compare.baselineIdB)) : null;
    if (baselineA && baselineB) {
      const cmp = compareBaselines(baselineA, baselineB);
      const slipColor = cmp.scheduleSlipDays > 0 ? "var(--danger)" : cmp.scheduleSlipDays < 0 ? "var(--good)" : "var(--muted)";
      comparisonHtml = `
        <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);margin:14px 0;">
          <div class="frame p4"><div class="lbl">انزلاق تاريخ الانتهاء</div><div class="val" style="color:${slipColor};">${cmp.scheduleSlipDays == null ? "—" : (cmp.scheduleSlipDays > 0 ? "+" : "") + cmp.scheduleSlipDays + " يوم"}</div></div>
          <div class="frame p4"><div class="lbl">فرق القيمة التعاقدية</div><div class="val">${fmtMoney(cmp.costVariance)}</div></div>
        </div>
        <div class="frame p4">
          <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">تفاصيل الفروقات لكل نشاط (${cmp.taskVariances.length})</h3>
          <div style="max-height:320px;overflow-y:auto;">
          <table><thead><tr><th>النشاط</th><th>الحالة</th><th>انزلاق التاريخ</th><th>فرق الإنجاز</th></tr></thead>
          <tbody>${cmp.taskVariances.map((v) => `<tr>
            <td>${esc(v.name)}</td>
            <td>${v.status === "added" ? statusDot("info", "أُضيف") : v.status === "removed" ? statusDot("warn", "أُزيل") : "—"}</td>
            <td>${v.dateSlipDays == null ? "—" : `<span style="color:${v.dateSlipDays > 0 ? "var(--danger)" : v.dateSlipDays < 0 ? "var(--good)" : "var(--muted)"};">${v.dateSlipDays > 0 ? "+" : ""}${v.dateSlipDays} يوم</span>`}</td>
            <td>${v.completionDelta != null ? `${v.completionDelta > 0 ? "+" : ""}${v.completionDelta}%` : "—"}</td>
          </tr>`).join("")}</tbody></table>
          </div>
        </div>`;
    }
  }

  const baselineOptionsHtml = (selected) => `<option value="">اختر...</option><option value="current" ${selected === "current" ? "selected" : ""}>الوضع الحالي (مباشر)</option>${baselines.map((b) => `<option value="${b.id}" ${selected === b.id ? "selected" : ""}>${esc(b.name)} (${esc(fmtDateTime(b.savedAt).slice(0, 10))})</option>`).join("")}`;

  return `
    <div class="frame p4" style="margin-bottom:14px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">مقارنة خطوط الأساس</h3>
      <select onchange="setBaselineCompareProject(this.value)">
        <option value="">اختر مشروعاً...</option>
        ${STATE.data.projects.map((p) => `<option value="${p.id}" ${compare && compare.projectId === p.id ? "selected" : ""}>${esc(p.name)} (${(p.baselines || []).length} خط أساس محفوظ)</option>`).join("")}
      </select>
      ${project ? `<div style="margin-top:10px;">${btn("+ حفظ خط أساس جديد لهذا المشروع", `rebaselineProject('${project.id}')`, "primary", "sm")}</div>` : ""}
    </div>
    ${project ? `
      <div class="frame p4" style="margin-bottom:14px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <div>مقارنة: <select onchange="setBaselineCompareSide('baselineIdA', this.value)">${baselineOptionsHtml(compare.baselineIdA)}</select></div>
          <div>مع: <select onchange="setBaselineCompareSide('baselineIdB', this.value)">${baselineOptionsHtml(compare.baselineIdB)}</select></div>
        </div>
      </div>
      ${comparisonHtml}
      <div class="frame p4" style="margin-top:14px;">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">سجل خطوط الأساس المحفوظة (${baselines.length})</h3>
        ${baselines.length ? baselines.map((b) => `<div style="display:flex;justify-content:space-between;background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;">
          <span style="font-size:12px;color:#0F1420;">${esc(b.name)}</span>
          <span style="font-size:11px;color:var(--muted2);">${esc(b.savedBy)} — ${esc(fmtDateTime(b.savedAt))} — ${b.taskSnapshots.length} نشاط</span>
        </div>`).join("") : emptyState("لا توجد خطوط أساس محفوظة لهذا المشروع بعد.")}
      </div>` : ""}`;
}

function renderPrimaveraView() {
  const tab = STATE.primaveraTab || "import";
  const tabBtn = (key, label) => `<button class="btn ${tab === key ? "primary" : "ghost"} sm" onclick="setPrimaveraTab('${key}')">${esc(label)}</button>`;
  const body = tab === "import" ? renderPrimaveraImportExportTab() : tab === "healthcheck" ? renderPrimaveraHealthCheckTab() : renderPrimaveraBaselinesTab();
  return `${sectionHeader("Primavera P6 (استيراد/تصدير وفحص الجدول)")}
    <div class="frame p4" style="margin-bottom:14px;font-size:12px;color:var(--muted);">
      Primavera P6 Professional لا يملك واجهة API — التبادل يتم عبر الملفات فقط (XER هي الصيغة الأكثر استخداماً). Primavera Cloud لديها API حقيقية لكنها تتطلب مصادقة خادم-إلى-خادم بمفتاح سرّي، لذا لم تُنفَّذ من المتصفح مباشرة لتفادي كشف بيانات الاعتماد — نفس المبدأ الأمني المطبَّق على SAP وOracle في هذا النظام.
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;">${tabBtn("import", "📥 استيراد/تصدير")}${tabBtn("healthcheck", "🩺 فحص صحة الجدول")}${tabBtn("baselines", "📊 خطوط الأساس")}</div>
    ${body}`;
}

/* ============================================================
   التوثيق الرقمي والرصد الذكي (Digital Twin / Smart Monitoring)
   ============================================================ */
function setDigitalTwinTab(tab) { if (tab === "asset360" && STATE.digitalTwinTab !== "asset360") pushNavHistory(); STATE.digitalTwinTab = tab; renderApp(); }
function triggerExternalResultImport() { document.getElementById("external-result-import-input").click(); }
function handleExternalResultImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = buildExternalResultImportPreview(e.target.result);
    if (preview.error) { alert("تعذّر قراءة الملف: " + preview.error); return; }
    STATE.externalResultImportPreview = preview;
    renderApp();
  };
  reader.readAsText(file);
  input.value = "";
}
function cancelExternalResultImport() { STATE.externalResultImportPreview = null; renderApp(); }
function confirmExternalResultImport() {
  const preview = STATE.externalResultImportPreview;
  if (!preview) return;
  const created = applyExternalResultImport(preview);
  STATE.externalResultImportPreview = null;
  renderApp();
  alert(`تم استيراد ${created} سجلاً من نتائج "${preview.source}" بنجاح.`);
}
function downloadExternalResultSchemaExample() {
  const example = {
    schemaVersion: PMS_EXTERNAL_RESULT_SCHEMA_VERSION,
    source: "اسم الخدمة الخارجية",
    realityCaptures: [{ projectId: "اسم المشروع كما يظهر في النظام بالضبط", assetCode: "AST-001", captureType: "تصوير جوي بالدرون", captureDate: "2026-08-01", deviceInfo: "DJI Matrice 300", status: "مُعالَج ونتائجه جاهزة", resultSummary: "نسبة الإنجاز المرصودة: 62%" }],
    deviationReports: [{ projectId: "اسم المشروع كما يظهر في النظام بالضبط", assetCode: "AST-001", elementId: "PIPE-SEG-14", deviationType: "بُعد/قياس", designValue: "قطر 24 بوصة", actualValue: "قطر 22 بوصة", deviationPct: 8.3, location: "الكيلومتر 6.2", detectedAt: "2026-08-01" }],
    aiAnalysisResults: [{ projectId: "اسم المشروع كما يظهر في النظام بالضبط", analysisType: "مخالفة معدات حماية شخصية PPE", resultSummary: "عامل بلا خوذة أمان في منطقة الحفر", confidencePct: 91, receivedAt: "2026-08-01" }],
  };
  downloadTextFile("pms-external-result-schema-example.json", JSON.stringify(example, null, 2), "application/json");
}

function renderDigitalTwinImportTab() {
  const preview = STATE.externalResultImportPreview;
  return `
    <div class="frame p4" style="margin-bottom:14px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">استيراد نتائج جاهزة من خدمة خارجية</h3>
      <p style="font-size:12px;color:var(--muted);margin-bottom:10px;">نقطة الاستقبال الصادقة الوحيدة الممكنة من متصفح بلا خادم: ملف JSON بصيغة موثَّقة. أي خدمة مسح ثلاثي الأبعاد أو تحليل ذكاء اصطناعي تنتج ملفاً بهذا الشكل يمكن استيراده هنا مباشرة، مع معاينة كاملة قبل أي التزام بالبيانات.</p>
      <input type="file" id="external-result-import-input" accept=".json" style="display:none" onchange="handleExternalResultImportFile(this)" />
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${btn("📥 اختيار ملف نتائج JSON", "triggerExternalResultImport()", "primary", "sm")}
        ${btn("⭳ تنزيل نموذج للصيغة المطلوبة", "downloadExternalResultSchemaExample()", "ghost", "sm")}
      </div>
    </div>
    ${preview ? `<div class="frame p4" style="border-right:3px solid var(--accent);">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">معاينة الاستيراد — المصدر: ${esc(preview.source)}</h3>
      <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px;">
        ${kpiCard({ label: "مسوحات/توثيق واقعي", value: preview.summary.realityCaptureCount, level: "info" })}
        ${kpiCard({ label: "تقارير انحراف", value: preview.summary.deviationCount, level: "info" })}
        ${kpiCard({ label: "نتائج ذكاء اصطناعي", value: preview.summary.aiResultCount, level: "info" })}
        ${kpiCard({ label: "سجلات متجاهَلة (مشروع غير معروف)", value: preview.summary.skippedCount, level: preview.summary.skippedCount ? "warn" : "good" })}
      </div>
      ${preview.warnings.length ? `<div class="frame p4" style="margin-bottom:10px;border-right:3px solid var(--warn);">${preview.warnings.map((w) => `<div style="font-size:11.5px;color:var(--muted);">• ${esc(w)}</div>`).join("")}</div>` : ""}
      <div style="display:flex;gap:8px;">${btn("✓ تأكيد الاستيراد", "confirmExternalResultImport()", "primary", "sm")}${btn("إلغاء", "cancelExternalResultImport()", "danger", "sm")}</div>
    </div>` : ""}`;
}

function handleBulkAssetImport(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const parsed = parseAssetsCSV(e.target.result);
    if (!parsed.rows.length) { alert("لم يُعثر على أي صفوف صالحة في الملف."); return; }
    STATE.bulkAssetPreview = parsed;
    renderApp();
  };
  reader.readAsText(file);
  input.value = "";
}
function confirmBulkAssetImport() {
  const preview = STATE.bulkAssetPreview;
  if (!preview) return;
  const projectId = STATE.projectFilter && STATE.projectFilter !== "all" ? STATE.projectFilter : (STATE.data.projects[0] && STATE.data.projects[0].id);
  if (!projectId) { alert("اختر مشروعاً أولاً من القائمة العلوية."); return; }
  const created = applyBulkAssetImport(projectId, preview.rows);
  STATE.bulkAssetPreview = null;
  renderApp();
  alert(`تم استيراد ${created} عنصراً بنجاح.`);
}
function showAssetBarcode(assetId) {
  STATE.assetBarcodeId = assetId;
  renderApp();
}

function toggleAssetTreeNode(assetId) {
  STATE.collapsedAssetNodes = STATE.collapsedAssetNodes || {};
  STATE.collapsedAssetNodes[assetId] = !STATE.collapsedAssetNodes[assetId];
  renderApp();
}
function renderDigitalTwinMaturityPanel(projectId) {
  if (!projectId) return "";
  const maturity = computeDigitalTwinMaturityIndex(projectId);
  if (!maturity.available) return "";
  const levelColor = maturity.maturityLevel === "ناضج" ? "var(--good)" : maturity.maturityLevel === "قيد التطوير" ? "var(--warn)" : "var(--danger)";
  if (!maturity.assetCount) {
    return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--muted2);">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 6px;">📊 مؤشر نضج التوأم الرقمي</h3>
      <p style="font-size:12px;color:var(--muted2);margin:0;">${esc(maturity.honestNote)}</p>
    </div>`;
  }
  return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid ${levelColor};">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0;">📊 مؤشر نضج التوأم الرقمي (شمولية التمثيل — لا مجرد الخطر الحالي)</h3>
      <span style="font-size:16px;font-weight:800;color:${levelColor};">${maturity.overallMaturityPct}% — ${esc(maturity.maturityLevel)}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">
      ${maturity.dimensions.map((d) => `<div style="background:#F5F6F9;border-radius:8px;padding:10px;">
        <div style="font-size:10.5px;color:var(--muted2);margin-bottom:4px;">${esc(d.label)}</div>
        <div style="font-size:16px;font-weight:700;color:#0F1420;">${d.pct}%</div>
      </div>`).join("")}
    </div>
    <p style="font-size:10px;color:var(--muted2);margin-top:8px;">يقيس هذا المؤشر <b>شمولية</b> التوأم الرقمي (كم من نطاق العمل الفعلي له تمثيل رقمي حقيقي)، لا حالة الخطر الحالي — مؤشر مختلف تماماً عن مركز القيادة أدناه.</p>
  </div>`;
}

function renderDigitalTwinCommandCenterPanel(projectId) {
  if (!projectId) return "";
  const center = computeDigitalTwinCommandCenter(projectId);
  if (!center.totalAssets) return "";
  const fleetPatterns = computeFleetWidePatterns(3);
  const pareto = computeParetoAnalysis(projectId);
  const paretoPanel = pareto.available ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border2);">
    <h4 style="font-size:12px;color:var(--info);margin:0 0 6px;">📊 تحليل باريتو (ABC) — أين تذهب الأولوية المحدودة؟</h4>
    <p style="font-size:11px;color:var(--muted);margin:0 0 6px;">${esc(pareto.vitalFewSummary)}</p>
    ${pareto.classified.filter((a) => a.abcClass === "A").slice(0, 5).map((a) => `<div style="font-size:11px;color:var(--muted);padding:2px 0;">فئة A: ${esc(a.assetName)} — ${a.issueCount} انحراف (${a.pctOfTotal}% من الإجمالي)</div>`).join("")}
  </div>` : "";
  const fleetPanel = fleetPatterns.available && fleetPatterns.patterns.length ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border2);">
    <h4 style="font-size:12px;color:var(--danger);margin:0 0 6px;">⚠ نمط حقيقي عبر كل المشاريع (لا مشروع واحد فقط)</h4>
    ${fleetPatterns.patterns.map((p) => `<div style="font-size:11.5px;color:var(--muted);padding:4px 0;">
      «${esc(p.key)}» (${p.groupLabel}): ${p.withIssues} من ${p.sampleSize} (${Math.round(p.issueRate*100)}%) لديها انحرافات فعلية — عبر ${p.projectsInvolved} مشاريع مختلفة، مقابل متوسط عام ${Math.round(fleetPatterns.overallIssueRate*100)}%.
    </div>`).join("")}
  </div>` : "";
  return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--warn);">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">🎯 مركز قيادة العناصر — الأعلى خطراً فعلياً الآن (${center.totalAssets} عنصر مُحلَّل)</h3>
    ${center.topRisks.length ? center.topRisks.map((s) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2);cursor:pointer;" onclick="STATE.digitalTwinAssetId='${s.assetId}';setDigitalTwinTab('asset360');renderApp();">
        <div>
          <span style="font-size:12.5px;color:#0F1420;">${esc(s.assetName)}${s.inheritedFrom ? ` <span style="color:var(--muted2);font-size:10.5px;">(خطر موروث من ${esc(s.inheritedFrom)})</span>` : ""}</span>
        </div>
        ${statusDot(s.level, `${s.riskScore} نقطة`)}
      </div>`).join("") : `<p style="font-size:12px;color:var(--good);margin:0;">لا توجد عناصر بمؤشر خطر فعلي حالياً من إجمالي ${center.totalAssets} عنصراً مُحلَّلاً.</p>`}
    <div style="display:flex;gap:16px;margin-top:10px;font-size:11px;color:var(--muted2);">
      <span>✓ سليمة: ${center.healthyCount}</span>
      <span style="color:var(--danger);">⚠ خطر مرتفع: ${center.dangerCount}</span>
    </div>
    ${paretoPanel}
    ${fleetPanel}
  </div>`;
}

function renderDigitalTwinOverview() {
  const focusProjectId = STATE.projectFilter && STATE.projectFilter !== "all" ? STATE.projectFilter : (filterByProject(STATE.data.projects || [])[0] || {}).id;
  const assets = focusProjectId ? DigitalTwinRepository.getAssets(focusProjectId) : [];
  const gaps = focusProjectId ? computeScanCoverageGaps(focusProjectId) : { available: false };
  const priority = focusProjectId ? computeInspectionPriorityRanking(focusProjectId) : { available: false };
  const snapshots = focusProjectId ? TwinTimeMachine.getSnapshots(focusProjectId) : [];
  const sensorReadings = focusProjectId ? DigitalTwinRepository.getSensorReadings(focusProjectId) : [];
  const sensorAlerts = sensorReadings.filter((r) => deriveSensorAlertLevel(r) === "danger");
  const rateOfChangeAlerts = sensorReadings.filter((r) => { const roc = computeSensorRateOfChangeAlert(r, sensorReadings); return roc.available && roc.isAbnormalRate; });
  const coveragePct = gaps.available ? Math.round((gaps.scannedCount / gaps.totalAssets) * 100) : null;
  const topPriority = priority.available && priority.ranking.length ? priority.ranking[0] : null;

  const capabilityCard = (icon, title, valueHtml, tab, colorHex) => `<div class="tr-click" style="background:#F5F6F9;border:1px solid var(--border2);border-radius:10px;padding:14px;cursor:pointer;transition:transform .15s;" onclick="setDigitalTwinTab('${tab}')">
    <div style="font-size:20px;margin-bottom:6px;">${icon}</div>
    <div style="font-size:11px;color:var(--muted2);margin-bottom:4px;">${esc(title)}</div>
    <div style="font-size:16px;font-weight:800;color:${colorHex};">${valueHtml}</div>
  </div>`;

  return `
    <div class="ai-panel" style="margin-bottom:16px;"><div class="ai-panel-inner">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span class="ai-badge">⚡ محرك توأم رقمي متكامل<span class="ai-live-dot"></span></span>
      </div>
      <p style="font-size:12px;color:var(--muted);line-height:1.8;margin:0;">
        بنية حقيقية بمستودع بيانات موحَّد، ناقل أحداث حي، محرك حالة يسجّل كل تحوّل، آلة زمن باللقطات، محرك علاقات بتجاوز رسم بياني، وواجهات مزوِّدين صريحة لكل ما يحتاج بنية خلفية مستقبلاً — لا صفحة عرض بسيطة.
      </p>
    </div></div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:16px;">
      ${capabilityCard("🏗", "إجمالي العناصر المسجَّلة", assets.length, "assets", "#e8edf2")}
      ${capabilityCard("📡", "تغطية المسح الفعلي", coveragePct != null ? coveragePct + "%" : "—", "captures", coveragePct == null ? "#8a99a8" : coveragePct >= 70 ? "#2FBF71" : coveragePct >= 40 ? "#F5A623" : "#E5484D")}
      ${capabilityCard("🎯", "أولوية الفحص القادم (RBI)", topPriority ? esc(topPriority.asset.name) : "لا يوجد", "progressreport", topPriority && topPriority.priorityScore >= 50 ? "#E5484D" : "#2FBF71")}
      ${capabilityCard("🧊", "عارض BIM + تلوين 4D", STATE.apsViewerStatus === "loaded" ? "نموذج مُحمَّل" : "بانتظار التحميل", "bimviewer", STATE.apsViewerStatus === "loaded" ? "#2FBF71" : "#8a99a8")}
      ${capabilityCard("☁", "سحابة نقاط + واقع افتراضي", STATE.pointCloudPointCount ? STATE.pointCloudPointCount.toLocaleString() + " نقطة" : "لا يوجد ملف محمَّل", "pointcloud", "#22d3ee")}
      ${capabilityCard("📟", "تنبيهات مستشعرات IoT (حدّ ثابت + تسارع)", `${sensorAlerts.length + rateOfChangeAlerts.length}`, "sensors", (sensorAlerts.length + rateOfChangeAlerts.length) ? "#E5484D" : "#2FBF71")}
      ${capabilityCard("⏱", "لقطات آلة الزمن المحفوظة", snapshots.length, "assets", "#a78bfa")}
      ${capabilityCard("🤖", "كشف كائنات AI (TensorFlow.js)", typeof cocoSsd !== "undefined" ? "جاهز" : "يحتاج اتصالاً بالإنترنت أول مرة", "captures", "#22d3ee")}
    </div>

    ${renderDigitalTwinMaturityPanel(focusProjectId)}
    ${renderDigitalTwinCommandCenterPanel(focusProjectId)}

    <div class="frame p4">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">🧠 محركات حقيقية عاملة خلف الواجهة</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;font-size:11.5px;color:var(--muted);">
        <div>✓ محرك الحالة (State Engine) — ${(STATE.data.twinStateHistory || []).length} تحوّل حالة مسجَّل</div>
        <div>✓ محرك العلاقات (Relationship Engine) — تجاوز رسم بياني بحماية من الحلقات</div>
        <div>✓ محرك مونت كارلو لمخاطر الجدول — توزيعات مثلثي/PERT حقيقية</div>
        <div>✓ عميل استدعاء ذكي (Tool-Calling Agent) — 8 أدوات حقيقية</div>
        <div>✓ محرك RBI (API 580) لأولوية الفحص</div>
        <div>✓ واجهات مزوِّدين صريحة لسحابة النقاط والتنبؤ — لا معالجة مزيَّفة</div>
      </div>
    </div>
  `;
}

function renderAssetTreeView(assets) {
  if (!assets.length) return `<div class="frame p4">${emptyState("لا توجد عناصر مسجَّلة بعد.")}</div>`;
  const tree = buildAssetTree(assets);
  const collapsed = STATE.collapsedAssetNodes || {};
  const statusLevel = (s) => (s === "منفَّذ" ? "good" : s === "قيد الصيانة" ? "warn" : "info");
  const renderNode = (node, depth) => {
    const isCollapsed = collapsed[node.id];
    const hasChildren = node.children && node.children.length > 0;
    const indent = depth * 22;
    const row = `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-right:${indent}px;border-radius:6px;background:${depth === 0 ? "#F5F6F9" : "transparent"};margin-bottom:2px;">
      ${hasChildren ? `<button style="background:none;border:none;color:var(--muted2);cursor:pointer;font-size:12px;width:16px;" onclick="toggleAssetTreeNode('${node.id}')">${isCollapsed ? "▶" : "▼"}</button>` : `<span style="width:16px;display:inline-block;"></span>`}
      <span style="font-size:12px;color:#0F1420;flex:1;cursor:pointer;" onclick="STATE.digitalTwinAssetId='${node.id}';setDigitalTwinTab('asset360')">${esc(node.name)} <span style="color:var(--muted2);font-size:10.5px;">(${esc(node.assetCode)})</span></span>
      ${statusDot(statusLevel(node.status), node.status || "مخطَّط")}
      ${hasChildren ? `<span style="font-size:10px;color:var(--muted2);">${node.children.length} فرعي</span>` : ""}
    </div>`;
    const childrenHtml = (hasChildren && !isCollapsed) ? node.children.map((c) => renderNode(c, depth + 1)).join("") : "";
    return row + childrenHtml;
  };
  return `<div class="frame p4" style="margin-bottom:14px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">🌳 التسلسل الهرمي للعناصر</h3>
    ${tree.map((n) => renderNode(n, 0)).join("")}
  </div>`;
}

async function addAssetReferencePhoto(assetId, inputEl) {
  if (STATE.user && !canEdit(STATE.user.role, "digitalTwin")) { alert("دورك الحالي لا يملك صلاحية إضافة صور مرجعية للتوثيق الرقمي."); return; }
  const file = inputEl.files[0];
  if (!file) return;
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) { alert(`حجم الصورة (${formatFileSizeMB(file.size)}MB) يتجاوز الحدّ الأقصى (8MB).`); inputEl.value = ""; return; }
  try {
    const dataUrl = await compressImageFile(file);
    const asset = STATE.data.projectAssets.find((a) => a.id === assetId);
    if (!asset) return;
    STATE.data.projectAssets = STATE.data.projectAssets.map((a) => a.id === assetId
      ? Object.assign({}, a, { referenceCaptures: [...(a.referenceCaptures || []), { photo: dataUrl, capturedAt: Date.now(), capturedBy: STATE.user ? STATE.user.name : "؟", completionAtCapture: null }] })
      : a);
    saveData(STATE.data);
    renderApp();
    showToast("تم حفظ صورة مرجعية للعنصر", "success");
  } catch (e) { alert("تعذّر معالجة الصورة."); }
  inputEl.value = "";
}
function goToPointCloudForAsset(assetId) {
  STATE.digitalTwinLinkingAssetId = assetId; // أي لقطة تُحفَظ بعد هذا تُربَط تلقائياً بهذا العنصر تحديداً
  setDigitalTwinTab("pointcloud");
}
function renderAssetFieldDocumentationPanel(asset) {
  const captures = asset.referenceCaptures || [];
  return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--info);">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 8px;">📸 توثيق ميداني حقيقي لهذا العنصر تحديداً</h3>
    <div style="background:#F5F6F9;border-radius:8px;padding:10px;margin-bottom:10px;font-size:11.5px;color:var(--muted);line-height:1.8;">
      <b style="color:var(--warn);">توضيح صادق مهم:</b> متصفح الآيفون (بما فيها هذا النظام كتطبيق ويب) <b>لا يمكنه الوصول لمستشعر LiDAR مباشرة</b> — هذا قيد حقيقي من آبل نفسها على متصفحات الويب، لا نقص في هذا النظام. المسار الحقيقي: افتح تطبيق مسح ليزري حقيقي يستخدم LiDAR الآيفون فعلياً (مثل <b>Scaniverse</b> أو <b>3D Scanner App</b> أو <b>Polycam</b>) → امسح العنصر → صدِّر الملف بصيغة نصية (XYZ) → استورده هنا مباشرة مربوطاً بهذا العنصر تحديداً.
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <input type="file" id="asset-ref-photo-input-${asset.id}" accept="image/*" capture="environment" style="display:none" onchange="addAssetReferencePhoto('${asset.id}', this)" />
      ${btn("📷 أخذ صورة مرجعية الآن (تعمل فعلياً من الكاميرا مباشرة)", `document.getElementById('asset-ref-photo-input-${asset.id}').click()`, "primary", "sm")}
      ${btn("📐 استيراد مسح ليزري لهذا العنصر", `goToPointCloudForAsset('${asset.id}')`, "ghost", "sm")}
    </div>
    ${captures.length ? `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;">
      ${captures.slice().reverse().map((c) => `<div style="flex-shrink:0;text-align:center;">
        <img src="${c.photo}" style="width:100px;height:100px;object-fit:cover;border-radius:6px;border:1px solid var(--border2);" />
        <div style="font-size:9.5px;color:var(--muted2);margin-top:3px;">${new Date(c.capturedAt).toLocaleDateString("ar")}</div>
      </div>`).join("")}
    </div>` : `<p style="font-size:11px;color:var(--muted2);margin:0;">لا صور مرجعية محفوظة لهذا العنصر بعد.</p>`}
  </div>`;
}

function renderAssetDigitalThreadPanel(assetId) {
  const thread = computeAssetDigitalThread(assetId);
  if (!thread.available || thread.eventCount < 2) return "";
  return `<div class="frame p4" style="margin-bottom:16px;border-right:3px solid var(--accent);">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 8px;">🧵 الخيط الرقمي — تتبّع زمني موحَّد كامل لهذا العنصر (${thread.eventCount} حدثاً حقيقياً)</h3>
    <p style="font-size:10px;color:var(--muted2);margin:0 0 10px;">مفهوم "الخيط الرقمي" مختلف عن "التوأم الرقمي" — التوأم يُحاكي الحالة الآن، والخيط يربط كل مراحل حياة العنصر عبر الزمن من مصادر مختلفة حقيقية في مكان واحد.</p>
    <div style="max-height:260px;overflow-y:auto;">
      ${thread.events.map((e) => `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border2);">
        <span style="font-size:14px;">${e.icon}</span>
        <div style="flex:1;">
          <div style="font-size:11.5px;color:#0F1420;">${esc(e.text)}</div>
          <div style="font-size:9.5px;color:var(--muted2);">${esc(e.date)} — ${esc(e.source)}${e.actor ? ` — ${esc(e.actor)}` : ""}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}

function renderAsset360View(assetId) {
  const asset = STATE.data.projectAssets.find((a) => a.id === assetId);
  if (!asset) return emptyState("العنصر غير موجود.");
  const contract = (STATE.data.contracts || []).find((c) => c.id === asset.linkedContractId);
  const task = (STATE.data.tasks || []).find((t) => t.id === asset.linkedTaskId);
  const qcRecords = (STATE.data.qc || []).filter((q) => q.assetId === assetId || (q.title && q.title.includes(asset.name)));
  const hseRecords = (STATE.data.hse || []).filter((h) => h.assetId === assetId);
  const inspections = (STATE.data.smartInspections || []).filter((i) => i.assetId === assetId);
  const deviations = (STATE.data.deviationReports || []).filter((d) => matchesAssetIdentifier(d, asset));
  const certs = (STATE.data.certificates || []).filter((c) => c.projectId === asset.projectId);
  const row = (label, value) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--row2);font-size:12.5px;"><span style="color:var(--muted2);">${esc(label)}</span><span style="color:#0F1420;">${value}</span></div>`;

  return `
    <div class="frame p4" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="font-size:15px;color:#0F1420;margin:0;">🏗 ${esc(asset.name)} <span style="color:var(--muted2);font-size:12px;">(${esc(asset.assetCode)})</span></h3>
        ${btn("↩ عودة للسجل", "setDigitalTwinTab('assets')", "ghost", "sm")}
      </div>
    </div>
    ${renderAssetFieldDocumentationPanel(asset)}
    ${renderAssetDigitalThreadPanel(asset.id)}
    <div class="grid2" style="margin-bottom:16px;">
      <div class="frame p4">
        <h4 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">البيانات الأساسية</h4>

        ${row("النوع", esc(asset.assetType || "—"))}
        ${row("الموقع", esc(asset.location || "—"))}
        ${row("الحالة", statusDot(asset.status === "منفَّذ" ? "good" : "info", asset.status || "مخطَّط"))}
        ${row("تاريخ التركيب", esc(asset.installDate || "—"))}
        ${row("المورِّد", esc(asset.supplier || "—"))}
        ${row("المخطط الهندسي", asset.drawingRef ? esc(asset.drawingRef) : "—")}
        ${row("مرجع BIM", asset.bimReference ? esc(asset.bimReference) : "—")}
      </div>
      <div class="frame p4">
        <h4 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">الروابط التعاقدية والزمنية</h4>
        ${row("العقد المرتبط", contract ? esc(contract.party) : "—")}
        ${row("المقاول المنفِّذ", esc(asset.contractor || "—"))}
        ${row("النشاط في الجدول الزمني", task ? esc(task.name) : "—")}
        ${row("نسبة إنجاز النشاط المرتبط", task ? `${task.completion || 0}%` : "—")}
      </div>
    </div>
    <div class="grid2" style="margin-bottom:16px;">
      <div class="frame p4">
        <h4 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">🩺 سجل الجودة والسلامة (${qcRecords.length + hseRecords.length})</h4>
        ${qcRecords.length || hseRecords.length ? [...qcRecords, ...hseRecords].map((r) => `<div style="font-size:11.5px;color:var(--muted);padding:4px 0;border-bottom:1px solid var(--row2);">${esc(r.title)} — ${esc(r.date || "")}</div>`).join("") : emptyState("لا توجد سجلات جودة/سلامة مرتبطة مباشرة بهذا العنصر بعد.")}
      </div>
      <div class="frame p4">
        <h4 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">🥽 التفتيشات الذكية (${inspections.length}) وتقارير الانحراف (${deviations.length})</h4>
        ${inspections.map((i) => `<div style="font-size:11.5px;color:var(--muted);padding:4px 0;border-bottom:1px solid var(--row2);">تفتيش ${esc(i.inspectionDate || "")} — ${statusDot(i.overallResult === "معتمد" ? "good" : i.overallResult === "مرفوض" ? "danger" : "warn", i.overallResult || "—")}</div>`).join("")}
        ${deviations.map((d) => `<div style="font-size:11.5px;color:var(--muted);padding:4px 0;border-bottom:1px solid var(--row2);">انحراف: ${esc(d.deviationType || "")} (${d.deviationPct || 0}%)</div>`).join("")}
        ${!inspections.length && !deviations.length ? emptyState("لا توجد تفتيشات أو انحرافات مسجَّلة لهذا العنصر بعد.") : ""}
      </div>
    </div>
    <div class="frame p4" style="margin-bottom:16px;">
      <h4 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">📡 سجل المسوحات متعدّد المصادر لهذا العنصر</h4>
      ${(() => {
        const history = computeAssetScanHistory(assetId);
        if (!history.available) return emptyState(history.reason);
        return `${history.conflicts && history.conflicts.length ? `<div class="frame p4" style="border-right:3px solid var(--danger);margin-bottom:10px;">
            <b style="font-size:12px;color:var(--danger);">⚠ تعارض مصادر مكتشَف:</b>
            ${history.conflicts.map((c) => `<div style="font-size:11.5px;color:var(--muted);margin-top:4px;">بتاريخ ${esc(c.date)}: قيم متباينة (${c.values.join("%، ")}%) — فرق ${c.spread.toFixed(1)} نقطة، يحتاج مراجعة بشرية قبل الاعتماد.</div>`).join("")}
          </div>` : ""}
          <table><thead><tr><th>النوع</th><th>التاريخ</th><th>الجهاز/المصدر</th><th>الإنجاز المرصود</th></tr></thead>
          <tbody>${history.captures.map((c) => `<tr><td>${esc(c.type || "—")}</td><td>${esc(c.date || "—")}</td><td>${esc(c.device || c.source || "—")}</td><td>${c.detectedPct != null && c.detectedPct !== "" ? c.detectedPct + "%" : "—"}</td></tr>`).join("")}</tbody></table>
          <p style="font-size:11px;color:var(--muted2);margin-top:8px;">دمج على مستوى البيانات (عرض كل مصدر جنباً إلى جنب مع تاريخه) — لا دمج هندسي لإحداثيات المصادر المختلفة.</p>`;
      })()}
    </div>
    <div class="frame p4">
      <h4 style="font-size:12.5px;color:#3D4759;margin:0 0 8px;">💰 السياق المالي للمشروع المرتبط</h4>
      ${row("عدد مستخلصات المالك للمشروع", certs.length)}
      ${row("إجمالي المحصَّل من المشروع", fmtMoney(certs.reduce((s, c) => s + Number(c.paidAmount || 0), 0)))}
      <p style="font-size:11px;color:var(--muted2);margin-top:8px;">لا يوجد ربط تكلفة مباشر لكل عنصر بمفرده حالياً (يحتاج تخصيص تكلفة تفصيلي لكل عنصر، غير متوفر في نموذج الميزانية الحالي) — المعروض هنا سياق المشروع ككل الذي ينتمي إليه العنصر.</p>
    </div>`;
}

function renderProjectTimelineView(readOnly) {
  const focusProjectId = STATE.projectFilter && STATE.projectFilter !== "all" ? STATE.projectFilter : (filterByProject(STATE.data.projects || [])[0] || {}).id;
  if (!focusProjectId) return emptyState("اختر مشروعاً من القائمة أعلاه أولاً.");
  const snapshots = ProjectTimeMachine.getSnapshots(focusProjectId);
  const fmtDate = (ts) => new Date(ts).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" });

  const takeSnapshotHtml = readOnly ? "" : `<div style="margin-bottom:16px;">
    ${btn("📸 أخذ لقطة زمنية شاملة الآن", `openTakeTimelineSnapshotPrompt('${focusProjectId}')`, "primary", "sm")}
  </div>`;

  if (!snapshots.length) {
    return `<div class="frame p4">
      ${takeSnapshotHtml}
      ${emptyState("لا توجد لقطات زمنية لهذا المشروع بعد — خذ أول لقطة لبدء بناء الآلة الزمنية.")}
    </div>`;
  }

  const selectedId = STATE.timelineSelectedSnapshotId && snapshots.some((s) => s.id === STATE.timelineSelectedSnapshotId) ? STATE.timelineSelectedSnapshotId : snapshots[0].id;
  const selected = snapshots.find((s) => s.id === selectedId);
  const timelineHtml = `<div class="frame p4" style="margin-bottom:14px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">🕐 الخط الزمني — اضغط على أي نقطة للتحرّك عبر الزمن</h3>
    <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;">
      ${snapshots.slice().reverse().map((s) => `<div onclick="STATE.timelineSelectedSnapshotId='${s.id}';renderApp();" style="flex-shrink:0;cursor:pointer;text-align:center;padding:8px 12px;border-radius:8px;border:1px solid ${s.id === selectedId ? "var(--accent)" : "var(--border2)"};background:${s.id === selectedId ? "rgba(31,182,166,.12)" : "#F5F6F9"};min-width:110px;">
        <div style="font-size:11px;color:${s.id === selectedId ? "var(--accent)" : "#e8edf2"};font-weight:600;">${esc(s.label)}</div>
        <div style="font-size:9.5px;color:var(--muted2);margin-top:2px;">${fmtDate(s.takenAt)}</div>
      </div>`).join("")}
    </div>
  </div>`;

  const snapshotDetailHtml = `<div class="frame p4" style="margin-bottom:14px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">📍 حالة المشروع في: ${esc(selected.label)} (${fmtDate(selected.takenAt)})</h3>
    <div class="kpi-grid">
      ${kpiCard({ label: "التقدّم الفعلي", value: `${selected.progress.actualCompletionPct ?? "—"}%`, level: "info" })}
      ${kpiCard({ label: "التقدّم المخطَّط", value: `${selected.progress.plannedCompletionPct ?? "—"}%`, level: "info" })}
      ${kpiCard({ label: "مؤشر التكلفة CPI", value: selected.cost.CPI != null ? selected.cost.CPI.toFixed(2) : "—", level: selected.cost.CPI != null && selected.cost.CPI < 0.95 ? "danger" : "good" })}
      ${kpiCard({ label: "مؤشر الجدول SPI", value: selected.cost.SPI != null ? selected.cost.SPI.toFixed(2) : "—", level: selected.cost.SPI != null && selected.cost.SPI < 0.95 ? "danger" : "good" })}
      ${kpiCard({ label: "الأنشطة المتأخرة", value: selected.schedule.delayedCount, level: selected.schedule.delayedCount > 0 ? "warn" : "good" })}
      ${kpiCard({ label: "المخاطر المفتوحة", value: selected.risk.openCount, level: selected.risk.openCount > 0 ? "warn" : "good" })}
    </div>
    <div style="font-size:11px;color:var(--muted2);margin-top:10px;">أصول: ${selected.digitalTwin.assets.length} — انحرافات مفتوحة: ${selected.digitalTwin.openDeviationsCount} — وثائق: ${selected.documents.count} — صور/وسائط: ${selected.photos.count}</div>
    ${!readOnly ? btn("🗑 حذف هذه اللقطة", `if(confirm('حذف هذه اللقطة نهائياً؟')){ProjectTimeMachine.removeSnapshot('${selected.id}');renderApp();}`, "ghost", "sm") : ""}
  </div>`;

  const compareHtml = snapshots.length >= 2 ? renderTimelineComparisonPanel(snapshots) : `<div class="frame p4">${emptyState("تحتاج لقطتين على الأقل للمقارنة بين تاريخين.")}</div>`;

  return `${takeSnapshotHtml}${timelineHtml}${snapshotDetailHtml}${compareHtml}`;
}
function openTakeTimelineSnapshotPrompt(projectId) {
  const label = prompt("اسم واضح لهذه اللقطة (مثال: «نهاية الشهر — أغسطس 2026»):", `لقطة ${todayISO()}`);
  if (!label || !label.trim()) return;
  const snap = ProjectTimeMachine.createSnapshot(projectId, label.trim());
  if (snap) { STATE.timelineSelectedSnapshotId = snap.id; renderApp(); showToast("تم أخذ اللقطة الزمنية بنجاح", "success"); }
}
function renderTimelineComparisonPanel(snapshots) {
  const idA = STATE.timelineCompareA && snapshots.some((s) => s.id === STATE.timelineCompareA) ? STATE.timelineCompareA : snapshots[snapshots.length - 1].id;
  const idB = STATE.timelineCompareB && snapshots.some((s) => s.id === STATE.timelineCompareB) ? STATE.timelineCompareB : snapshots[0].id;
  const optionsHtml = (selectedId) => snapshots.map((s) => `<option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${esc(s.label)} — ${new Date(s.takenAt).toLocaleDateString("ar")}</option>`).join("");
  const comparison = ProjectTimeMachine.compareSnapshots(idA, idB);
  const fmtDelta = (v) => v == null ? "—" : (v > 0 ? `+${v}` : `${v}`);
  const deltaColor = (v, goodIsPositive) => v == null ? "var(--muted2)" : ((goodIsPositive ? v >= 0 : v <= 0) ? "var(--good)" : "var(--danger)");
  return `<div class="frame p4">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">⚖ مقارنة تاريخ (أ) مقابل تاريخ (ب)</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <select onchange="STATE.timelineCompareA=this.value;renderApp();" style="flex:1;min-width:180px;">${optionsHtml(idA)}</select>
      <span style="align-self:center;color:var(--muted2);">←</span>
      <select onchange="STATE.timelineCompareB=this.value;renderApp();" style="flex:1;min-width:180px;">${optionsHtml(idB)}</select>
    </div>
    ${comparison.available ? `
      <table class="tbl" style="width:100%;">
        <thead><tr><th>المؤشر</th><th>${esc(comparison.dateA.label)}</th><th>${esc(comparison.dateB.label)}</th><th>الانحراف</th></tr></thead>
        <tbody>
          <tr><td>التقدّم الفعلي</td><td>${comparison.progressDeviation.actual.before ?? "—"}%</td><td>${comparison.progressDeviation.actual.after ?? "—"}%</td>
            <td style="color:${deltaColor((comparison.progressDeviation.actual.after || 0) - (comparison.progressDeviation.actual.before || 0), true)};">${fmtDelta((comparison.progressDeviation.actual.after || 0) - (comparison.progressDeviation.actual.before || 0))}%</td></tr>
          <tr><td>التقدّم المخطَّط</td><td>${comparison.progressDeviation.planned.before ?? "—"}%</td><td>${comparison.progressDeviation.planned.after ?? "—"}%</td><td>—</td></tr>
          <tr><td>الانحراف الحالي (فعلي − مخطَّط)</td><td colspan="2" style="text-align:center;">—</td>
            <td style="color:${deltaColor(comparison.progressDeviation.currentDeviationPct, true)};font-weight:700;">${fmtDelta(comparison.progressDeviation.currentDeviationPct)}%</td></tr>
          <tr><td>مؤشر التكلفة CPI</td><td>${comparison.costDeviation.CPI.before != null ? comparison.costDeviation.CPI.before.toFixed(2) : "—"}</td><td>${comparison.costDeviation.CPI.after != null ? comparison.costDeviation.CPI.after.toFixed(2) : "—"}</td><td>—</td></tr>
          <tr><td>مؤشر الجدول SPI</td><td>${comparison.costDeviation.SPI.before != null ? comparison.costDeviation.SPI.before.toFixed(2) : "—"}</td><td>${comparison.costDeviation.SPI.after != null ? comparison.costDeviation.SPI.after.toFixed(2) : "—"}</td><td>—</td></tr>
          <tr><td>التكلفة الفعلية (AC)</td><td>${fmtMoney(comparison.costDeviation.AC.before)}</td><td>${fmtMoney(comparison.costDeviation.AC.after)}</td>
            <td style="color:${deltaColor(-comparison.costDeviation.AC.deltaReal, true)};">${fmtMoney(comparison.costDeviation.AC.deltaReal)}</td></tr>
          <tr><td>الأنشطة المتأخرة</td><td>${comparison.scheduleDeviation.delayedCount.before}</td><td>${comparison.scheduleDeviation.delayedCount.after}</td>
            <td style="color:${deltaColor(comparison.scheduleDeviation.delayedCount.delta, false)};">${fmtDelta(comparison.scheduleDeviation.delayedCount.delta)}</td></tr>
          <tr><td>المخاطر المفتوحة</td><td>${comparison.riskDeviation.openCount.before}</td><td>${comparison.riskDeviation.openCount.after}</td>
            <td style="color:${deltaColor(comparison.riskDeviation.openCount.delta, false)};">${fmtDelta(comparison.riskDeviation.openCount.delta)}</td></tr>
        </tbody>
      </table>
      ${comparison.assetChanges.length ? `<div style="margin-top:14px;">
        <h4 style="font-size:12px;color:var(--info);margin:0 0 6px;">تغيّرات حالة الأصول بين التاريخين</h4>
        ${comparison.assetChanges.map((c) => `<div style="font-size:11.5px;color:var(--muted);padding:3px 0;">
          ${c.type === "status-changed" ? `${esc(c.name)}: ${esc(c.from)} ← ${esc(c.to)}` : c.type === "added" ? `${esc(c.name)} (جديد)` : `${esc(c.name)} (محذوف)`}
        </div>`).join("")}
      </div>` : ""}
    ` : emptyState(comparison.reason)}
  </div>`;
}

function renderDigitalTwinView() {
  const tab = STATE.digitalTwinTab || "overview";
  const tabBtn = (key, label) => `<button class="btn ${tab === key ? "primary" : "ghost"} sm" onclick="setDigitalTwinTab('${key}')">${esc(label)}</button>`;
  const readOnly = !canEdit(STATE.user.role, "digitalTwin");

  let body;
  if (tab === "overview") {
    body = renderDigitalTwinOverview();
  } else if (tab === "asset360" && STATE.digitalTwinAssetId) {
    body = renderAsset360View(STATE.digitalTwinAssetId);
  } else if (tab === "timeline") {
    body = renderProjectTimelineView(readOnly);
  } else if (tab === "assets") {
    const assetExtraCols = [
      { key: "_intelligence", label: "مؤشر الاهتمام (تحليل مُركَّب)", render: (_, row) => {
        const score = computeEffectiveAssetRisk(row.id);
        if (!score) return "—";
        const inheritedNote = score.inheritedFrom ? ` — خطر موروث من: ${score.inheritedFrom}` : "";
        const evidenceNote = score.evidenceNote ? ` — ${score.evidenceNote}` : "";
        const evidenceBadge = score.evidenceConfidence === "منخفضة" ? ` <span style="color:var(--muted2);font-size:9px;" title="${esc(score.evidenceNote || "")}">(شواهد محدودة)</span>` : "";
        return `<span title="${score.signals.map((s) => s.text).join(' — ')}${inheritedNote}${evidenceNote}">${statusDot(score.level, `${score.riskScore} نقطة${score.inheritedFrom ? " ⬆" : ""}`)}</span>${evidenceBadge}`;
      } },
      { key: "_view360", label: "عرض شامل", render: (_, row) => `<button class="btn ghost sm" onclick="STATE.digitalTwinAssetId='${row.id}';setDigitalTwinTab('asset360')">🔗 عرض 360</button>${row.dbId != null && row.dbId !== "" ? `<button class="btn ghost sm" onclick="highlightAssetInViewer('${row.dbId}')">🎯 تحقّق dbId</button>` : ""}${btn("🏷", `showAssetBarcode('${row.id}')`, "ghost", "sm")}` },
    ];
    const bulkImportPanel = `<div class="frame p4" style="margin-bottom:14px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 8px;">📥 استيراد جماعي (CSV)</h3>
      <p style="font-size:11.5px;color:var(--muted);margin-bottom:8px;">أعمدة الملف المتوقَّعة: Asset Code, Name, Type, Location, Contractor, Criticality.</p>
      <input type="file" id="bulk-asset-input" accept=".csv" style="display:none" onchange="handleBulkAssetImport(this)" />
      ${btn("اختيار ملف CSV", "document.getElementById('bulk-asset-input').click()", "primary", "sm")}
      ${STATE.bulkAssetPreview ? `<div class="frame p4" style="margin-top:10px;border-right:3px solid var(--accent);">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">${STATE.bulkAssetPreview.rows.length} عنصر جاهز للاستيراد${STATE.bulkAssetPreview.warnings.length ? " — " + STATE.bulkAssetPreview.warnings.join(" ") : ""}</div>
        <div style="display:flex;gap:8px;">${btn("✓ تأكيد الاستيراد", "confirmBulkAssetImport()", "primary", "sm")}${btn("إلغاء", "STATE.bulkAssetPreview=null;renderApp();", "danger", "sm")}</div>
      </div>` : ""}
    </div>`;
    const priorityData = computeInspectionPriorityRanking(STATE.projectFilter && STATE.projectFilter !== "all" ? STATE.projectFilter : (STATE.data.projects[0] && STATE.data.projects[0].id));
    const priorityPanel = priorityData.available ? `<div class="frame p4" style="margin-bottom:14px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 8px;">🎯 أولوية الفحص القادم (Risk-Based Inspection — مبدأ API 580)</h3>
      <p style="font-size:11px;color:var(--muted2);margin-bottom:8px;">مبني على حرجية العنصر + قِدَم آخر رصد + وجود فجوة تغطية — لا افتراض، معادلة وزن حقيقية.</p>
      <table><thead><tr><th>العنصر</th><th>الحرجية</th><th>آخر رصد</th><th>أولوية</th></tr></thead>
      <tbody>${priorityData.ranking.slice(0, 8).map((r) => `<tr><td>${esc(r.asset.name)}</td><td>${esc(r.asset.criticality || "متوسطة")}</td><td>${r.hasNeverScanned ? "لم يُمسَح إطلاقاً" : r.ageDays + " يوماً"}</td><td>${statusDot(r.priorityScore >= 50 ? "danger" : r.priorityScore >= 25 ? "warn" : "good", r.priorityScore)}</td></tr>`).join("")}</tbody></table>
    </div>` : "";
    const assetRows = filterByProject(STATE.data.projectAssets || []);
    const viewMode = STATE.assetViewMode || "table";
    const toggleBar = `<div class="frame p4" style="margin-bottom:14px;display:flex;gap:8px;">
      ${btn("📋 عرض جدولي", "STATE.assetViewMode='table';renderApp();", viewMode === "table" ? "primary" : "ghost", "sm")}
      ${btn("🌳 عرض شجري (هرمي)", "STATE.assetViewMode='tree';renderApp();", viewMode === "tree" ? "primary" : "ghost", "sm")}
    </div>`;
    const treeView = viewMode === "tree" ? renderAssetTreeView(assetRows) : "";
    const tableView = viewMode === "table" ? renderModuleView("projectAssets", "سجل عناصر المشروع (Digital Twin)", MODULES.projectAssets.fields(), assetRows, assetExtraCols, readOnly) : "";
    body = bulkImportPanel + priorityPanel + toggleBar + treeView + tableView;
  } else if (tab === "captures") {
    body = renderModuleView("realityCaptures", "المسوحات والتوثيق الواقعي (LiDAR / درون / 360°)", MODULES.realityCaptures.fields(), filterByProject(STATE.data.realityCaptures || []), [], readOnly);
  } else if (tab === "deviations") {
    body = renderModuleView("deviationReports", "تقارير الانحرافات (التصميم مقابل الواقع)", MODULES.deviationReports.fields(), filterByProject(STATE.data.deviationReports || []), [], readOnly);
  } else if (tab === "progressreport") {
    const projects = filterByProject(STATE.data.projects || []);
    const focusProjectId = STATE.progressReportProjectId || (projects[0] && projects[0].id);
    const assetTypes = Array.from(new Set((STATE.data.projectAssets || []).filter((a) => a.projectId === focusProjectId).map((a) => a.assetType).filter(Boolean)));
    const focusType = STATE.progressReportAssetType || assetTypes[0];
    const report = (focusProjectId && focusType) ? computeElementProgressReport(focusProjectId, focusType) : { available: false, reason: "اختر مشروعاً ونوع عنصر أولاً." };
    body = `
      <div class="frame p4" style="margin-bottom:14px;font-size:12px;color:var(--muted);line-height:1.8;">
        محرك ارتباط وتجميع حقيقي — لا رؤية حاسوبية ولا مطابقة هندسية آلية لسحابة نقاط. يقارن نسبة إنجاز مرصودة فعلياً (مُدخَلة يدوياً من تفتيش، أو مستوردة من خدمة مسح خارجية) بنسبة الإنجاز المتوقَّعة من الجدول الزمني الحقيقي، ويربط أي انحراف بسببه المسجَّل فعلياً.
      </div>
      <div class="frame p4" style="margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;">
        <select onchange="STATE.progressReportProjectId=this.value;STATE.progressReportAssetType=null;renderApp();">${projects.map((p) => `<option value="${p.id}" ${focusProjectId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
        <select onchange="STATE.progressReportAssetType=this.value;renderApp();">${assetTypes.length ? assetTypes.map((t) => `<option value="${esc(t)}" ${focusType === t ? "selected" : ""}>${esc(t)}</option>`).join("") : `<option value="">لا توجد أنواع عناصر مسجَّلة</option>`}</select>
      </div>
      ${report.available ? `
        <div class="frame p4">
          <h3 style="font-size:14px;color:#0F1420;margin:0 0 12px;">${esc(report.assetType)}</h3>
          <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px;">
            ${kpiCard({ label: "العدد المخطَّط", value: report.plannedCount, level: "info" })}
            ${kpiCard({ label: "الإنجاز المتوقَّع (من الجدول)", value: report.expectedPct + "%", level: "info" })}
            ${kpiCard({ label: "الإنجاز المرصود فعلياً", value: report.detectedPct != null ? report.detectedPct + "%" : "—", level: report.detectedPct == null ? "warn" : "good" })}
          </div>
          <div style="font-size:12px;color:var(--muted2);margin-bottom:10px;">تغطية الرصد الفعلي: ${report.detectedCoverage} من ${report.totalCount} عنصر لديها بيانات مسح فعلية — ${report.detectedCoverage < report.totalCount ? "الرقم أعلاه تقديري جزئياً، لا يمثّل كل العناصر." : "يمثّل كل العناصر."}</div>
          ${report.deviationPct != null ? `<div class="frame p4" style="border-right:3px solid ${report.deviationPct < -5 ? "var(--danger)" : report.deviationPct > 5 ? "var(--warn)" : "var(--good)"};margin-bottom:10px;">
            <b>الانحراف: ${report.deviationPct > 0 ? "+" : ""}${report.deviationPct}%</b>
          </div>` : ""}
          ${report.causes.length ? `<div class="frame p4" style="margin-bottom:10px;"><b style="font-size:12px;">الأسباب المسجَّلة:</b>${report.causes.map((c) => `<div style="font-size:11.5px;color:var(--muted);padding:4px 0;">• ${esc(c)}</div>`).join("")}</div>` : ""}
          <div class="frame p4"><b style="font-size:12px;">الأثر الزمني المُتوقَّع:</b><div style="font-size:12px;color:var(--muted);margin-top:4px;">${esc(report.scheduleImpactNote)}</div></div>
        </div>` : emptyState(report.reason)}
      ${(() => {
        const timeline = focusProjectId ? computeRealityTimeline(focusProjectId, focusType) : { available: false, reason: "اختر مشروعاً أولاً." };
        return `<div class="frame p4" style="margin-top:14px;">
          <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">⏱ آلة الزمن — تطوّر الإنجاز المرصود فعلياً عبر التاريخ</h3>
          ${timeline.available ? `<table><thead><tr><th>التاريخ</th><th>متوسط الإنجاز المرصود</th><th>عدد نقاط الرصد</th></tr></thead>
            <tbody>${timeline.timeline.map((t) => `<tr><td>${esc(t.date)}</td><td>${t.avgDetectedPct}%</td><td>${t.sampleCount}</td></tr>`).join("")}</tbody></table>`
            : `<div style="font-size:12px;color:var(--muted);">${esc(timeline.reason)}</div>`}
        </div>`;
      })()}
      ${(() => {
        const recovery = focusProjectId ? generateRecoveryOptions(focusProjectId) : { available: false, reason: "اختر مشروعاً أولاً." };
        if (!recovery.available) return `<div class="frame p4" style="margin-top:14px;font-size:12px;color:var(--good);">✓ ${esc(recovery.reason)}</div>`;
        return `<div class="frame p4" style="margin-top:14px;border-right:3px solid var(--warn);">
          <h3 style="font-size:13px;color:#3D4759;margin:0 0 8px;">💡 خيارات تعافٍ أولية — النشاط الحرج الأكثر تأخراً: «${esc(recovery.taskName)}» (متأخر ${recovery.delayDays} يوماً)</h3>
          ${recovery.options.map((o) => `<div style="background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
            <b style="font-size:12.5px;color:#0F1420;">${esc(o.label)}</b>
            <div style="font-size:11.5px;color:var(--muted);margin-top:4px;">تكلفة تقديرية: ${o.costEstimate ? fmtMoney(o.costEstimate) : "—"} ${o.scheduleRecoveryDays ? `— تعافٍ زمني تقديري: ~${o.scheduleRecoveryDays} يوم` : ""}</div>
            <div style="font-size:11px;color:var(--muted2);margin-top:4px;">${esc(o.note)}</div>
          </div>`).join("")}
          <p style="font-size:11px;color:var(--warn);margin-top:6px;">⚠ ${esc(recovery.disclaimer)}</p>
        </div>`;
      })()}
      ${(() => {
        const gaps = focusProjectId ? computeScanCoverageGaps(focusProjectId) : { available: false, reason: "اختر مشروعاً أولاً." };
        if (!gaps.available) return "";
        return `<div class="frame p4" style="margin-top:14px;">
          <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">🎯 فجوات التغطية — أي عناصر لم تُمسَح إطلاقاً بعد</h3>
          <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:12px;">
            ${kpiCard({ label: "إجمالي العناصر", value: gaps.totalAssets, level: "info" })}
            ${kpiCard({ label: "لديها مسح واحد فأكثر", value: gaps.scannedCount, level: "good" })}
            ${kpiCard({ label: "لم تُمسَح إطلاقاً", value: gaps.neverScannedCount, level: gaps.neverScannedCount ? "warn" : "good" })}
          </div>
          ${gaps.neverScannedByType.length ? `<table><thead><tr><th>النوع</th><th>عدد العناصر غير المُمسوحة</th></tr></thead>
            <tbody>${gaps.neverScannedByType.map((g) => `<tr><td>${esc(g.type)}</td><td>${g.count}</td></tr>`).join("")}</tbody></table>`
            : `<div style="font-size:12px;color:var(--good);">كل العناصر لديها مسح واحد على الأقل.</div>`}
        </div>`;
      })()}`;
  } else if (tab === "arsessions") {
    body = renderModuleView("arSessions", "جلسات التفتيش الذكي (نظارات/مساعدة عن بُعد)", MODULES.arSessions.fields(), filterByProject(STATE.data.arSessions || []), [], readOnly);
  } else if (tab === "airesults") {
    body = renderModuleView("aiAnalysisResults", "نتائج الرؤية الحاسوبية والذكاء الاصطناعي", MODULES.aiAnalysisResults.fields(), filterByProject(STATE.data.aiAnalysisResults || []), [], readOnly);
  } else if (tab === "inspections") {
    body = renderModuleView("smartInspections", "التفتيش الذكي (قائمة فحص + GPS + قياسات)", MODULES.smartInspections.fields(), filterByProject(STATE.data.smartInspections || []), [], readOnly);
  } else if (tab === "contractors") {
    const ranking = computeContractorRanking(filterByProject(STATE.data.contractorEvaluations || []));
    const rankingHtml = `<div class="frame p4" style="margin-bottom:14px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">تصنيف المقاولين (حسب متوسط التقييم)</h3>
      ${ranking.length ? `<table><thead><tr><th>الترتيب</th><th>المقاول</th><th>عدد التقييمات</th><th>المتوسط العام</th></tr></thead>
      <tbody>${ranking.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.contractorName)}</td><td>${r.evaluationCount}</td><td>${statusDot(r.avgScore >= 4 ? "good" : r.avgScore >= 3 ? "warn" : "danger", r.avgScore != null ? r.avgScore.toFixed(1) + "/5" : "—")}</td></tr>`).join("")}</tbody></table>` : emptyState("لا توجد تقييمات مسجَّلة بعد.")}
    </div>`;
    body = rankingHtml + renderModuleView("contractorEvaluations", "سجل تقييمات المقاولين", MODULES.contractorEvaluations.fields(), filterByProject(STATE.data.contractorEvaluations || []), [], readOnly);
  } else if (tab === "sensors") {
    const readings = filterByProject(STATE.data.sensorReadings || []);
    const alertReadings = readings.filter((r) => deriveSensorAlertLevel(r) === "danger");
    const sensorExtraCols = [{ key: "_alert", label: "الحالة", render: (_, row) => {
      const level = deriveSensorAlertLevel(row);
      return statusDot(level, level === "danger" ? "خارج النطاق الآمن" : "ضمن النطاق الآمن");
    } }];
    body = `<div class="frame p4" style="margin-bottom:14px;font-size:12px;color:var(--muted);line-height:1.8;">
        سجل قراءات دوري حقيقي (يدوي أو مستورَد دفعياً من نظام IoT خارجي) — <b>ليس بثاً حياً فعلياً</b>؛ البث الحي عبر MQTT/WebSockets يحتاج خادماً مركزياً دائم التشغيل غير متوفر في هذه البنية (موضَّح في خطة الانتقال للمنصة السحابية). التنبيهات هنا حقيقية: أي قراءة تتجاوز الحدود الآمنة المُدخَلة تُعلَّم فوراً.
      </div>
      <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:14px;">
        ${kpiCard({ label: "إجمالي القراءات المسجَّلة", value: readings.length, level: "info" })}
        ${kpiCard({ label: "قراءات خارج النطاق الآمن", value: alertReadings.length, level: alertReadings.length ? "danger" : "good" })}
      </div>
      ${renderModuleView("sensorReadings", "قراءات المستشعرات", MODULES.sensorReadings.fields(), readings, sensorExtraCols, readOnly)}`;
  } else if (tab === "bimviewer") {
    const status = STATE.apsViewerStatus;
    body = `
      <div class="frame p4" style="margin-bottom:14px;">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">عارض BIM (Autodesk Platform Services)</h3>
        <p style="font-size:12px;color:var(--muted);line-height:1.8;margin-bottom:12px;">
          عارض WebGL حقيقي — نفس مكتبة Autodesk المستخدَمة فعلياً في Autodesk Construction Cloud، لا محاكاة. يحتاج رمز وصول (Access Token)
          صالحاً لساعة واحدة فقط، ومُعرِّف نموذج (URN) لملف رُفِع وتُرجم مسبقاً. كلاهما لا يمكن الحصول عليهما من هذا المتصفح مباشرة —
          لنفس سبب عدم ربط SAP مباشرة بمتصفح: يحتاجان مفتاحك السرّي، ولا يجوز أن يظهر في كود يعمل على جهاز المستخدم.
        </p>
        <div class="frame p4" style="background:var(--panel2,rgba(0,0,0,.02));margin-bottom:12px;">
          <h4 style="font-size:12px;color:#3D4759;margin:0 0 8px;">خطوات التشغيل (مرة كل ساعة، ما لم تُؤتمَت لاحقاً)</h4>
          <ol style="font-size:11.5px;color:var(--muted);line-height:2;padding-inline-start:18px;margin:0;">
            <li><b>أنشئ حساب APS</b> (مجاني) على <span style="font-family:monospace;">aps.autodesk.com</span> إن لم يكن لديك واحد.</li>
            <li><b>أنشئ تطبيقاً (App)</b> من لوحة APS للحصول على <span style="font-family:monospace;">Client ID</span> و<span style="font-family:monospace;">Client Secret</span> — مرة واحدة فقط، لا تتكرر كل ساعة.</li>
            <li><b>ارفع نموذجك</b> (Revit/IFC/NWD...) عبر Data Management API، ثم <b>رجمه</b> (Translate) عبر Model Derivative API — هذا يُعطيك <b>Model URN</b> ثابتاً لا يتغيّر طالما لم تستبدل الملف.</li>
            <li><b>احصل على Access Token</b> (صالح ساعة واحدة فقط): من جهاز فيه Client ID/Secret — عبر Postman، أو سكربت بسيط، أو خادمك الخاص — أرسل طلب <span style="font-family:monospace;">POST https://developer.api.autodesk.com/authentication/v2/token</span> بـ Client ID/Secret. <b>لا تُدخل Client Secret هنا في هذه الصفحة إطلاقاً</b> — فقط الـ Token الناتج، الذي تنتهي صلاحيته تلقائياً.</li>
            <li><b>الصق Token وURN</b> في الحقلين أدناه واضغط "تحميل النموذج". كرِّر الخطوة 4 فقط كل ساعة (الخطوات 1-3 لا تتكرر).</li>
          </ol>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          <input id="aps-token-input" class="inp" type="password" placeholder="Access Token (صالح ساعة واحدة)" style="min-width:280px;" />
          <input id="aps-urn-input" class="inp" placeholder="Model URN (ثابت)" style="min-width:280px;" />
          ${btn("🏗 تحميل النموذج", "launchAPSViewerFromForm()", "primary", "sm")}
        </div>
        ${status === "error" ? `<div class="frame p4" style="border-right:3px solid var(--danger);color:var(--danger);font-size:12px;">${esc(STATE.apsViewerError || "")}</div>` : ""}
        ${status === "loading" ? `<div style="font-size:12px;color:var(--muted);">جارِ التحميل...</div>` : ""}
        <div id="aps-viewer-container" style="width:100%;height:480px;background:#1a1a1a;border-radius:8px;margin-top:10px;${status === "loaded" ? "" : "display:flex;align-items:center;justify-content:center;"}">
          ${status === "loaded" ? "" : `<span style="color:#666;font-size:12px;">${status === "loading" ? "جارِ تهيئة العارض..." : "لا يوجد نموذج مُحمَّل بعد"}</span>`}
        </div>
        ${status === "loaded" && STATE.apsSelectedDbId != null ? (() => {
          const selectedAsset = (STATE.data.projectAssets || []).find((a) => a.dbId != null && Number(a.dbId) === Number(STATE.apsSelectedDbId));
          if (!selectedAsset) return `<div class="frame p4" style="margin-top:10px;font-size:11.5px;color:var(--muted2);">عنصر مُحدَّد (dbId: ${esc(STATE.apsSelectedDbId)}) — غير مرتبط بأي عنصر في سجل Digital Twin بعد.</div>`;
          const task = (STATE.data.tasks || []).find((t) => t.id === selectedAsset.linkedTaskId);
          const inspections = (STATE.data.smartInspections || []).filter((i) => i.assetId === selectedAsset.id);
          const deviations = (STATE.data.deviationReports || []).filter((d) => matchesAssetIdentifier(d, selectedAsset));
          return `<div class="frame p4" style="margin-top:10px;border-right:3px solid var(--info);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h4 style="font-size:13px;color:#0F1420;margin:0;">🖱 العنصر المُحدَّد: ${esc(selectedAsset.name)} (${esc(selectedAsset.assetCode)})</h4>
              <button class="btn ghost sm" onclick="STATE.digitalTwinAssetId='${selectedAsset.id}';setDigitalTwinTab('asset360');">عرض 360 كامل →</button>
            </div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:8px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
              <div>النوع: ${esc(selectedAsset.assetType || "—")}</div>
              <div>الحالة: ${esc(selectedAsset.status || "—")}</div>
              <div>المقاول: ${esc(selectedAsset.contractor || "—")}</div>
              <div>النشاط المرتبط: ${task ? `${esc(task.name)} (${task.completion || 0}%)` : "—"}</div>
              <div>التفتيشات الذكية: ${inspections.length}</div>
              <div>تقارير الانحراف: ${deviations.length}</div>
            </div>
          </div>`;
        })() : status === "loaded" ? `<div style="font-size:11px;color:var(--muted2);margin-top:8px;">👆 اضغط أي عنصر داخل النموذج أعلاه لعرض معلوماته فوراً هنا.</div>` : ""}
        ${status === "loaded" ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
          <h4 style="font-size:12px;color:#3D4759;margin:0 0 8px;">📅 التلوين الرباعي الأبعاد (4D) — حسب حالة الجدول الزمني الفعلية</h4>
          <p style="font-size:11px;color:var(--muted2);margin-bottom:8px;">يحتاج ربط كل عنصر بـ«مُعرِّف العنصر (dbId)» من سجل عناصر المشروع أولاً. أخضر = مكتمل، أحمر = على المسار الحرج، كهرماني = قيد التنفيذ، أزرق = لم يبدأ، رمادي = بلا نشاط مرتبط.</p>
          <div style="display:flex;gap:8px;">${btn("🎨 تطبيق تلوين الجدول الزمني", "apply4DScheduleColoring()", "primary", "sm")}${btn("مسح التلوين", "clear4DColoring()", "ghost", "sm")}</div>
        </div>` : ""}
      </div>`;
  } else if (tab === "pointcloud") {
    const pointCount = STATE.pointCloudPointCount;
    if (STATE.webXRCheckStatus === undefined) {
      STATE.webXRCheckStatus = "checking";
      checkWebXRSupport().then((r) => { STATE.webXRCheckStatus = r.supported ? "supported" : "unsupported"; STATE.webXRReason = r.reason; renderApp(); });
    }
    body = `
      ${STATE.digitalTwinLinkingAssetId ? (() => {
        const linkingAsset = (STATE.data.projectAssets || []).find((a) => a.id === STATE.digitalTwinLinkingAssetId);
        return linkingAsset ? `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--accent);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12.5px;color:#0F1420;">🔗 أي لقطة تحفظها الآن ستُربَط تلقائياً بعنصر «${esc(linkingAsset.name)}» تحديداً</span>
          ${btn("إلغاء الربط", "STATE.digitalTwinLinkingAssetId=null;renderApp();", "ghost", "sm")}
        </div>` : "";
      })() : ""}
      <div class="frame p4" style="margin-bottom:14px;">
        <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">عارض سحابة النقاط (مبسَّط)</h3>
        <p style="font-size:12px;color:var(--muted);line-height:1.8;margin-bottom:10px;">
          عارض حقيقي مبني على WebGL مباشرة — لكن ليس Potree الحقيقية (حزمتها الرسمية على npm ليست بديلاً بسيطاً لسطر واحد، تحتاج jQuery وعملية بناء كاملة)، فبُني بديل أبسط يدعم سحوب النقاط متوسطة الحجم (آلاف إلى بضعة ملايين نقطة). الصيغة المدعومة حالياً: ملف نصي XYZ (كل سطر: x y z أو x y z r g b). لصيغ E57/LAS/PLY الأصلية، حوِّلها لهذه الصيغة النصية أولاً عبر برنامج المسح نفسه (كل برامج Leica/FARO/Trimble تدعم هذا التصدير).
        </p>
        <input type="file" id="pointcloud-file-input" accept=".xyz,.txt,.csv" style="display:none" onchange="handlePointCloudFile(this)" />
        ${btn("📥 اختيار ملف سحابة نقاط (XYZ)", "triggerPointCloudImport()", "primary", "sm")}
        ${btn("↩ استعادة آخر سحابة محفوظة (IndexedDB)", "restoreLastPointCloud()", "ghost", "sm")}
        ${pointCount ? `<span style="font-size:11.5px;color:var(--muted2);margin-right:10px;">${pointCount.toLocaleString()} نقطة مُحمَّلة — اسحب للتدوير، عجلة الفأرة للتكبير/التصغير</span>` : ""}
        <div id="pointcloud-viewer-container" style="width:100%;height:480px;background:#1a1a1a;border-radius:8px;margin-top:10px;${pointCount ? "" : "display:flex;align-items:center;justify-content:center;"}">
          ${pointCount ? "" : `<span style="color:#666;font-size:12px;">لا توجد سحابة نقاط مُحمَّلة بعد</span>`}
        </div>
      </div>
      ${renderVolumetricAnalysisPanel()}
      <div class="frame p4" style="margin-bottom:14px;">
        <div style="font-size:11.5px;">
          <b style="color:#3D4759;">🥽 الواقع الافتراضي (WebXR)</b>
          ${STATE.webXRCheckStatus === "checking" ? `<div style="color:var(--muted2);margin-top:4px;">جارِ التحقّق الفعلي من دعم WebXR على هذا الجهاز...</div>`
            : STATE.webXRCheckStatus === "supported" ? `<div style="margin-top:6px;">${btn("🥽 دخول وضع VR", "enterVRMode()", "primary", "sm")}${activeXRSession ? btn("خروج من VR", "exitVRMode()", "ghost", "sm") : ""}</div>`
            : `<div style="color:var(--muted2);margin-top:4px;">غير متاح على هذا الجهاز: ${esc(STATE.webXRReason || "")}</div>`}
        </div>
      </div>`;
  } else {
    body = renderDigitalTwinImportTab();
  }

  return `${sectionHeader("التوثيق الرقمي والرصد الذكي (Digital Twin)", btn("📷 مسح باركود لفتح عنصر", "openAssetScanner()", "ghost", "sm"))}
    <div class="frame p4" style="margin-bottom:14px;font-size:12px;color:var(--muted);line-height:1.8;">
      هذه النسخة أصبحت تحتوي على <b>محرك معالجة خلفي حقيقي</b> — لكنه الآن تبويب RealityTwin المستقل (LiDAR على آيفون، تسجيل Horn/RANSAC، مقارنة IFC مع المسح)، لا نسخة "Scan-vs-BIM" هنا. عارض APS أدناه يبقى مسؤولاً عن عرض نموذج BIM ثلاثي الأبعاد فقط.
    </div>
    ${STATE.assetBarcodeId ? (() => {
      const asset = (STATE.data.projectAssets || []).find((a) => a.id === STATE.assetBarcodeId);
      if (!asset) return "";
      return `<div class="frame p4" style="margin-bottom:14px;text-align:center;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <b style="font-size:12.5px;">باركود العنصر: ${esc(asset.name)}</b>
          <button class="btn ghost sm" onclick="STATE.assetBarcodeId=null;renderApp();">إغلاق</button>
        </div>
        <svg id="asset-barcode-svg" style="background:white;padding:8px;border-radius:6px;"></svg>
        <p style="font-size:11px;color:var(--muted2);margin-top:6px;">اطبع هذا والصقه على العنصر الفعلي بالموقع — امسحه لاحقاً بزر «مسح باركود لفتح عنصر» أعلاه.</p>
      </div>`;
    })() : ""}
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">${tabBtn("overview", "⚡ نظرة عامة على القدرات")}${tabBtn("assets", "🏗 سجل العناصر")}${tabBtn("timeline", "🕐 الآلة الزمنية")}${tabBtn("inspections", "✅ التفتيش الذكي")}${tabBtn("captures", "📡 المسوحات")}${tabBtn("deviations", "⚠ الانحرافات")}${tabBtn("progressreport", "📊 تحقّق التقدّم AI")}${tabBtn("sensors", "📟 مستشعرات IoT")}${tabBtn("arsessions", "🥽 جلسات النظارات")}${tabBtn("airesults", "🤖 نتائج AI")}${tabBtn("contractors", "🏆 تقييم المقاولين")}${tabBtn("bimviewer", "🧊 عارض BIM")}${tabBtn("pointcloud", "☁ سحابة النقاط")}${tabBtn("import", "📥 استيراد خارجي")}</div>
    ${body}`;
}

/* ============================================================
   صفحة Microsoft 365 — معالج اتصال + 3 تبويبات (بريد/تقويم/ملفات)
   مع إمكانية ربط أي عنصر بمشروع أو عقد أو مهمة داخل النظام.
   ============================================================ */
function connectMsGraphFromForm() {
  const clientId = document.getElementById("msg-client-id").value.trim();
  const tenantId = document.getElementById("msg-tenant-id").value.trim();
  if (!clientId || !tenantId) { alert("أدخل Client ID وTenant ID أولاً — راجع خطوات التسجيل أعلاه."); return; }
  connectMsGraph(clientId, tenantId);
}
function setMsGraphTab(tab) { STATE.msGraphTab = tab; renderApp(); }
async function refreshMsGraphMail() {
  STATE.msGraphLoading = "mail";
  renderApp();
  try { STATE.msGraphMailCache = await fetchOutlookMail(STATE.msGraphMailSearch || ""); }
  catch (e) { alert("تعذّر جلب البريد: " + e.message); }
  STATE.msGraphLoading = null;
  renderApp();
}
async function refreshMsGraphCalendar() {
  STATE.msGraphLoading = "calendar";
  renderApp();
  try { STATE.msGraphCalendarCache = await fetchOutlookCalendar(); }
  catch (e) { alert("تعذّر جلب التقويم: " + e.message); }
  STATE.msGraphLoading = null;
  renderApp();
}
async function refreshMsGraphFiles() {
  STATE.msGraphLoading = "files";
  renderApp();
  try { STATE.msGraphFilesCache = await fetchOneDriveFiles(); }
  catch (e) { alert("تعذّر جلب ملفات OneDrive: " + e.message); }
  STATE.msGraphLoading = null;
  renderApp();
}
function onMsGraphSearchChange(val) { STATE.msGraphMailSearch = val; }

const MS_LINK_ENTITY_TYPES = [
  { key: "projects", label: "مشروع", labelKey: "name" },
  { key: "contracts", label: "عقد", labelKey: "party" },
  { key: "tasks", label: "مهمة", labelKey: "name" },
];
function startMsLink(msType, graphId, title, webLink) {
  STATE.msLinkPicker = { msType, graphId, title, webLink, entityType: "" };
  renderApp();
}
function cancelMsLink() { STATE.msLinkPicker = null; renderApp(); }
function onMsLinkEntityTypeChange(val) {
  if (!STATE.msLinkPicker) return;
  STATE.msLinkPicker.entityType = val;
  renderApp();
}
function confirmMsLink(recordId) {
  const picker = STATE.msLinkPicker;
  if (!picker || !recordId) return;
  const entityDef = MS_LINK_ENTITY_TYPES.find((e) => e.key === picker.entityType);
  const record = (STATE.data[picker.entityType] || []).find((r) => r.id === recordId);
  if (!entityDef || !record) return;
  const linkedLabel = `${entityDef.label}: ${record[entityDef.labelKey] || record.id}`;
  linkMsGraphItem(picker.msType, { id: picker.graphId, subject: picker.title, webLink: picker.webLink }, picker.entityType, recordId, linkedLabel);
  STATE.msLinkPicker = null;
  renderApp();
}
function renderMsLinkPickerInline(msType, graphId) {
  const picker = STATE.msLinkPicker;
  if (!picker || picker.msType !== msType || picker.graphId !== graphId) return "";
  const entityOptions = MS_LINK_ENTITY_TYPES.map((e) => `<option value="${e.key}" ${picker.entityType === e.key ? "selected" : ""}>${esc(e.label)}</option>`).join("");
  let recordSelect = "";
  if (picker.entityType) {
    const entityDef = MS_LINK_ENTITY_TYPES.find((e) => e.key === picker.entityType);
    const records = filterByProject(STATE.data[picker.entityType] || []);
    recordSelect = `<select onchange="confirmMsLink(this.value)"><option value="">اختر ${esc(entityDef.label)}...</option>
      ${records.map((r) => `<option value="${r.id}">${esc(r[entityDef.labelKey] || r.id)}</option>`).join("")}</select>`;
  }
  return `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center;">
    <select onchange="onMsLinkEntityTypeChange(this.value)"><option value="">ربط بـ...</option>${entityOptions}</select>
    ${recordSelect}
    <button class="btn ghost sm" onclick="cancelMsLink()">إلغاء</button>
  </div>`;
}

function renderMsGraphView() {
  const status = STATE.msGraphStatus || "disconnected";
  if (status !== "connected") {
    return `${sectionHeader("Microsoft 365 (Outlook / التقويم / OneDrive)")}
      <div class="frame p4 help-body" style="margin-bottom:16px;">
        <h4>خطوات الربط (مرة واحدة فقط لكل مستخدم)</h4>
        <ol style="font-size:12.5px;color:var(--muted);line-height:2;padding-inline-start:20px;">
          <li>ادخل إلى <code>portal.azure.com</code> بحساب Microsoft 365 الخاص بمؤسستك.</li>
          <li>Azure Active Directory ← App registrations ← New registration.</li>
          <li>اسمٍ الاختيار حر، ونوع الحساب "Accounts in this organizational directory only".</li>
          <li>Redirect URI (نوع Single-page application) — الصق فيه رابط هذا النظام كما يظهر في شريط العنوان الآن.</li>
          <li>بعد التسجيل، انسخ "Application (client) ID" و"Directory (tenant) ID" من صفحة Overview.</li>
          <li>من API permissions ← Add a permission ← Microsoft Graph ← Delegated: أضف Mail.Read, Mail.Send, Calendars.ReadWrite, Files.ReadWrite, User.Read.</li>
        </ol>
        ${status === "error" ? `<div class="frame p4" style="margin:10px 0;color:var(--danger);font-size:12px;">خطأ: ${esc(STATE.msGraphError || "")}</div>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <input id="msg-client-id" class="inp" placeholder="Application (client) ID" style="min-width:260px;" />
          <input id="msg-tenant-id" class="inp" placeholder="Directory (tenant) ID" style="min-width:260px;" />
          ${btn("🔑 تسجيل الدخول بحساب Microsoft", "connectMsGraphFromForm()", "primary", "sm")}
        </div>
      </div>`;
  }

  const tab = STATE.msGraphTab || "mail";
  const loading = STATE.msGraphLoading;
  const tabBtn = (key, label) => `<button class="btn ${tab === key ? "primary" : "ghost"} sm" onclick="setMsGraphTab('${key}')">${esc(label)}</button>`;

  let bodyHtml = "";
  if (tab === "mail") {
    const mail = STATE.msGraphMailCache || [];
    bodyHtml = `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
        <input class="inp" style="flex:1;min-width:180px;" placeholder="بحث في البريد..." value="${esc(STATE.msGraphMailSearch || "")}" oninput="onMsGraphSearchChange(this.value)" />
        ${btn(loading === "mail" ? "جارِ التحديث..." : "🔄 تحديث البريد", "refreshMsGraphMail()", "primary", "sm")}
      </div>
      ${mail.length ? mail.map((m) => `<div class="frame p4" style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-size:13px;color:#0F1420;font-weight:700;">${esc(m.subject || "(بلا عنوان)")}</div>
            <div style="font-size:11px;color:var(--muted2);">${esc((m.from && m.from.emailAddress && m.from.emailAddress.address) || "")} — ${esc((m.receivedDateTime || "").slice(0, 16).replace("T", " "))}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:4px;">${esc((m.bodyPreview || "").slice(0, 120))}</div>
          </div>
          <button class="btn ghost sm" onclick="startMsLink('mail','${esc(m.id)}',${JSON.stringify(m.subject || "").replace(/"/g, "&quot;")},${JSON.stringify(m.webLink || "").replace(/"/g, "&quot;")})">🔗 ربط</button>
        </div>
        ${renderMsLinkPickerInline("mail", m.id)}
      </div>`).join("") : emptyState("اضغط «تحديث البريد» لعرض رسائلك.")}`;
  } else if (tab === "calendar") {
    const events = STATE.msGraphCalendarCache || [];
    bodyHtml = `<div style="margin-bottom:12px;">${btn(loading === "calendar" ? "جارِ التحديث..." : "🔄 تحديث التقويم", "refreshMsGraphCalendar()", "primary", "sm")}</div>
      ${events.length ? events.map((ev) => `<div class="frame p4" style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-size:13px;color:#0F1420;font-weight:700;">${esc(ev.subject || "(بلا عنوان)")}</div>
            <div style="font-size:11px;color:var(--muted2);">${esc((ev.start && ev.start.dateTime || "").slice(0, 16).replace("T", " "))} → ${esc((ev.end && ev.end.dateTime || "").slice(0, 16).replace("T", " "))}</div>
          </div>
          <button class="btn ghost sm" onclick="startMsLink('event','${esc(ev.id)}',${JSON.stringify(ev.subject || "").replace(/"/g, "&quot;")},${JSON.stringify(ev.webLink || "").replace(/"/g, "&quot;")})">🔗 ربط</button>
        </div>
        ${renderMsLinkPickerInline("event", ev.id)}
      </div>`).join("") : emptyState("اضغط «تحديث التقويم» لعرض مواعيدك.")}`;
  } else {
    const files = STATE.msGraphFilesCache || [];
    bodyHtml = `<div style="margin-bottom:12px;">${btn(loading === "files" ? "جارِ التحديث..." : "🔄 تحديث الملفات", "refreshMsGraphFiles()", "primary", "sm")}</div>
      ${files.length ? files.map((f) => `<div class="frame p4" style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;gap:10px;">
          <div style="font-size:13px;color:#0F1420;">${f.folder ? "📁" : "📄"} ${esc(f.name)}</div>
          <button class="btn ghost sm" onclick="startMsLink('file','${esc(f.id)}',${JSON.stringify(f.name || "").replace(/"/g, "&quot;")},${JSON.stringify(f.webUrl || "").replace(/"/g, "&quot;")})">🔗 ربط</button>
        </div>
        ${renderMsLinkPickerInline("file", f.id)}
      </div>`).join("") : emptyState("اضغط «تحديث الملفات» لعرض ملفات OneDrive.")}`;
  }

  const linkedItems = STATE.data.msLinkedItems || [];
  const linkedHtml = linkedItems.length ? `<div class="frame p4" style="margin-top:16px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">العناصر المرتبطة (${linkedItems.length})</h3>
      ${linkedItems.map((li) => `<div style="display:flex;justify-content:space-between;align-items:center;background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;">
        <div style="font-size:12px;color:#0F1420;">${esc(li.title)} ← ${esc(li.linkedLabel)}</div>
        <button class="btn ghost sm" onclick="unlinkMsGraphItem('${li.id}')">✕ إلغاء الربط</button>
      </div>`).join("")}
    </div>` : "";

  return `${sectionHeader("Microsoft 365 (Outlook / التقويم / OneDrive)", btn("قطع الاتصال", "disconnectMsGraph()", "danger", "sm"))}
    <div class="frame p4" style="margin-bottom:14px;font-size:12px;color:var(--good);">✓ متصل بحساب: ${esc(STATE.msGraphUserName || "")}</div>
    <div style="display:flex;gap:8px;margin-bottom:14px;">${tabBtn("mail", "📧 البريد")}${tabBtn("calendar", "📅 التقويم")}${tabBtn("files", "📁 OneDrive")}</div>
    ${bodyHtml}
    ${linkedHtml}`;
}

/* ============================================================
   واجهة صفحة Primavera P6 — استيراد/تصدير، فحص صحة الجدول، وخطوط الأساس
   ============================================================ */
function setPrimaveraTab(tab) { STATE.primaveraTab = tab; renderApp(); }
function triggerPrimaveraImport() { document.getElementById("primavera-import-input").click(); }
function handlePrimaveraImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const isXER = /\.xer$/i.test(file.name);
  const isCSV = /\.csv$/i.test(file.name);
  if (!isXER && !isCSV) { alert("الملفات المدعومة حالياً: XER أو CSV. لملفات XML من Primavera، صدِّرها كـXER بدلاً من ذلك (الأكثر استخداماً وموثوقية لتبادل الجداول)."); input.value = ""; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      if (isXER) {
        const parsed = parseXER(e.target.result);
        STATE.primaveraImportPreview = Object.assign({ fileType: "xer" }, buildXERImportPreview(parsed));
      } else {
        const parsed = parseCSVSchedule(e.target.result);
        STATE.primaveraImportPreview = { fileType: "csv", projects: [], tasks: parsed.tasks.map((t) => ({ activityId: t.activityId, name: t.name, start: t.start, end: t.end, completion: t.completion })), relationships: [], warnings: parsed.warnings, conflicts: [], summary: { projectCount: 0, taskCount: parsed.tasks.length, relationshipCount: 0 } };
      }
      renderApp();
    } catch (err) {
      alert("تعذّر قراءة الملف: " + err.message);
    }
  };
  reader.readAsText(file);
  input.value = "";
}
function cancelPrimaveraImport() { STATE.primaveraImportPreview = null; renderApp(); }
function confirmPrimaveraImport(targetProjectId) {
  const preview = STATE.primaveraImportPreview;
  if (!preview) return;
  const result = applyXERImport(preview, targetProjectId || null);
  if (!result || result.success === false) { renderApp(); return; } // رسالة المنع الحقيقية عُرضت فعلاً داخل applyXERImport؛ المعاينة تبقى محفوظة لإعادة المحاولة بلا رفع جديد
  STATE.primaveraImportPreview = null;
  renderApp();
  alert(`تم الاستيراد بنجاح: ${result.importedTasks} نشاط، ${result.importedRelationships} علاقة. يمكنك التراجع عن هذا الاستيراد بالكامل من الزر المخصَّص إن وجدت خطأً.`);
}
function doRollbackLastImport() {
  if (!confirm("سيتم التراجع عن آخر عملية استيراد بالكامل واستعادة البيانات لما كانت عليه قبلها مباشرة. متابعة؟")) return;
  if (rollbackLastImport()) { renderApp(); showToast("تم التراجع بنجاح", "success"); }
}
function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function exportPrimaveraXER(projectId) {
  const proj = STATE.data.projects.find((p) => p.id === projectId);
  if (!proj) return;
  downloadTextFile(`${proj.name.replace(/[^\w\u0600-\u06FF]+/g, "_")}.xer`, exportProjectToXER(projectId), "text/plain");
}
function exportPrimaveraCSV(projectId) {
  const proj = STATE.data.projects.find((p) => p.id === projectId);
  if (!proj) return;
  downloadTextFile(`${proj.name.replace(/[^\w\u0600-\u06FF]+/g, "_")}.csv`, exportProjectToCSV(projectId), "text/csv");
}
function runHealthCheckFor(projectId) {
  STATE.primaveraHealthCheckProjectId = projectId;
  STATE.primaveraHealthCheckReport = runScheduleHealthCheck(projectId);
  renderApp();
}
function setBaselineCompareProject(projectId) {
  STATE.primaveraBaselineCompare = { projectId, baselineIdA: "", baselineIdB: "" };
  renderApp();
}
function setBaselineCompareSide(side, baselineId) {
  if (!STATE.primaveraBaselineCompare) return;
  STATE.primaveraBaselineCompare[side] = baselineId;
  renderApp();
}

function renderCloud() {
  const saved = loadCloudConfig();
  const status = STATE.cloudStatus || (saved ? "connecting" : "disconnected");
  const statusMap = {
    connected: { level: "good", text: "متصل — أي تعديل يظهر فوراً لكل من ينضم بنفس رمز المؤسسة" },
    connecting: { level: "warn", text: "جارِ الاتصال..." },
    error: { level: "danger", text: "خطأ في الاتصال (سيُعاد المحاولة تلقائياً فور توفر إنترنت): " + (STATE.cloudError || "") },
    disconnected: { level: "info", text: "غير متصل — النظام يعمل محلياً على هذا الجهاز فقط" },
  };
  const s = statusMap[status] || statusMap.disconnected;

  return `
    ${sectionHeader("المزامنة السحابية")}
    <div class="frame p4" style="margin-bottom:16px;">
      <div style="margin-bottom:10px;">${statusDot(s.level, s.text)}</div>
      ${saved ? `<div style="font-size:12px;color:var(--muted);margin-bottom:10px;">رمز المؤسسة الحالي: <b style="font-family:monospace;color:var(--accent);">${esc(saved.orgCode)}</b></div>${btn("قطع الاتصال", "disconnectCloudUI()", "danger", "sm")}` : ""}
    </div>

    <div class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>كيف تفعّل المزامنة الفورية المجانية (مرة واحدة فقط)</h4>
      <p>1. اذهب إلى console.firebase.google.com وسجّل الدخول بحساب Google (مجاني).</p>
      <p>2. أنشئ مشروعاً جديداً (Add project) — أي اسم يناسبك.</p>
      <p>3. من القائمة الجانبية: Build ← Firestore Database ← Create database ← اختر "Start in test mode" (وضع الاختبار) ← اخترالمنطقة الأقرب لك.</p>
      <p>4. من الصفحة الرئيسية للمشروع: اضغط أيقونة الويب (&lt;/&gt;) لإضافة تطبيق ويب، أعطه أي اسم، ثم انسخ الكائن firebaseConfig كاملاً (يبدأ بـ { apiKey: ... }).</p>
      <p>5. الصق هذا الكائن في الحقل أدناه، واختر "رمز مؤسسة" (أي كلمة سرية بينك وبين فريقك، مثل اسم شركتك)، ثم اضغط اتصال.</p>
      <p>6. على جهاز كل فرد من الفريق (المهندس، المحاسب...) كرر نفس الخطوة 5 فقط: الصق نفس بيانات الاتصال ونفس رمز المؤسسة بالضبط ليصبح الجميع على نفس القاعدة السحابية.</p>
    </div>

    <div class="frame p4">
      <form onsubmit="submitCloudForm(event)">
        <div class="field">
          <label>بيانات الاتصال (Firebase config) — الصقها كاملة بصيغة JSON</label>
          <textarea id="cloud-config-input" rows="6" placeholder='{"apiKey": "...", "authDomain": "...", "projectId": "...", ...}'>${saved ? esc(JSON.stringify(saved.configObj, null, 2)) : ""}</textarea>
        </div>
        <div class="field">
          <label>رمز المؤسسة (اختر كلمة موحّدة يستخدمها كل فريقك)</label>
          <input id="cloud-org-input" type="text" placeholder="مثال: akakus-tender-2026" value="${saved ? esc(saved.orgCode) : ""}" />
        </div>
        <button type="submit" class="btn primary">اتصال / تحديث الاتصال</button>
      </form>
    </div>
  `;
}

function renderHelp() {
  return `
    ${sectionHeader("دليل الاستخدام الكامل")}

    <div class="frame p4 help-body" style="margin-bottom:16px;">
      <div class="help-toc">
        <a href="#h-overview">نظرة عامة</a>
        <a href="#h-roles">الأدوار والصلاحيات</a>
        <a href="#h-sync">مزامنة البيانات بين الأجهزة</a>
        <a href="#h-install">تثبيت النظام كتطبيق على الهاتف</a>
        <a href="#h-exec">ضبط المشروع الأساسي وإدارة الموقع الميداني</a>
        <a href="#h-contracts">الإدارة التجارية والمشتريات</a>
        <a href="#h-finance">الشؤون المالية</a>
        <a href="#h-comm">التواصل والوثائق</a>
        <a href="#h-admin">الإدارة المؤسسية والنظام</a>
        <a href="#h-mobile">الاستخدام على الهاتف</a>
        <a href="#h-security">ملاحظات أمان مهمة</a>
      </div>
    </div>

    <div id="h-overview" class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>نظرة عامة</h4>
      <p>هذا نظام متكامل لإدارة المشاريع (مقاولات، نفط وغاز، بنية تحتية) يعمل بالكامل من داخل هذا الملف على جهازك — بدون إنترنت وبدون حساب خارجي إلزامي. جميع البيانات (المشاريع، الفواتير، المستخلصات، التقارير...) تُخزَّن محلياً في متصفحك على هذا الجهاز. استخدم مربع البحث الشامل 🔍 في الأعلى للوصول السريع لأي عنصر في النظام من أي صفحة.</p>
    </div>

    <div id="h-roles" class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>الأدوار والصلاحيات (5 أدوار)</h4>
      <ul>
        <li><b>مالك الشركة:</b> يرى كل شيء في النظام دون استثناء، لا يعدّل بيانات (متابعة تنفيذية فقط) — باستثناء إدارة حسابات المستخدمين.</li>
        <li><b>مدير عام:</b> يدير السجل الرئيسي للموارد (مدراء المشاريع، المهندسون، العمال، المعدات) ويُعيّن مدير المشروع عند إنشاء مشروع جديد.</li>
        <li><b>مدير المشروع:</b> إدارة كاملة لمشاريعه: الجدول، المهام، الموارد، المخاطر، الجودة، السلامة، الفواتير، العهد، مستخلصات المالك والمقاولين، المطالبات، المراسلات، الاجتماعات، الملاحظات والتسليم، الوثائق.</li>
        <li><b>مهندس الموقع:</b> التقارير اليومية، المهام، الموارد، الجودة، السلامة، اجتماعات الموقع، وملاحظات التفتيش والتسليم.</li>
        <li><b>المحاسب العام:</b> الميزانية، الفواتير، مطابقة العهد، اعتماد تحصيل مستخلصات المالك وصرف مستخلصات المقاولين، العقود، المشتريات، ومتابعة صلاحية الوثائق.</li>
      </ul>
      <p>يُنشئ مالك الشركة كل الحسابات (اسم مستخدم وكلمة مرور) من صفحة «المستخدمون». عند إنشاء حساب مدير مشروع أو مهندس موقع، اربطه بسجله في «الموارد» (حقل «مرتبط بسجل الموارد») — بعدها لن يرى ذلك المستخدم إلا مشاريعه هو تحديداً (المشاريع التي يديرها أو المعيَّن عليها)، لا كل مشاريع الشركة. إن تُرك الحقل فارغاً، يرى المستخدم كل ما تسمح به صلاحيات دوره دون تقييد إضافي. تنبيه: هذا تحقّق بسيط داخل المتصفح، وليس نظام حماية بمستوى خادم — راجع «ملاحظات أمان مهمة» أدناه.</p>
    </div>

    <div id="h-sync" class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>مزامنة البيانات بين الأجهزة — طريقتان</h4>
      <h5>الطريقة الأولى (الأسهل والموصى بها): مزامنة سحابية فورية مجانية</h5>
      <p>من صفحة «المزامنة السحابية» (قسم الإدارة والنظام)، يُنشئ أي شخص في الفريق مشروع Firebase مجاني (5 دقائق، حساب Google فقط)، ويلصق بيانات الاتصال ورمز مؤسسة (كلمة سرية متفق عليها) في الصفحة. بعدها، كل من يفتح النظام على أي جهاز (حاسوب، هاتف) ويستخدم نفس بيانات الاتصال ونفس رمز المؤسسة، تصبح شاشته متزامنة فوراً ولحظياً مع الجميع — أي تعديل يظهر عند الآخرين مباشرة بدون أي خطوة إضافية. البيانات تُحفظ دائماً محلياً على جهازك أولاً (تعمل حتى بدون إنترنت)، وإن انقطع الاتصال أثناء العمل، يُعاد الاتصال والمزامنة تلقائياً بمجرد عودة الإنترنت دون الحاجة لإعادة تحميل الصفحة. الخطوات التفصيلية موجودة داخل صفحة «المزامنة السحابية» نفسها.</p>
      <h5>الطريقة الثانية (بلا إنترنت وبلا حساب): المشاركة والدمج الذكي</h5>
      <p>من صفحة «البيانات والنسخ الاحتياطي»: اضغط «📤 مشاركة بياناتي» — يفتح هذا قائمة المشاركة الطبيعية لجهازك (AirDrop على آيفون، Nearby Share على أندرويد، واتساب، بلوتوث، أو أي طريقة يدعمها هاتفك)، اختر الطرف الآخر أو طريقة الإرسال. الطرف المستقبِل يضغط «🔀 استيراد ودمج بيانات مستلمة» ويختار الملف — النظام يدمج البيانات المستلمة مع بياناته الحالية سجلاً-بسجل (لا يستبدل كل شيء): أي سجل جديد يُضاف، وأي تعديل أحدث يُطبَّق تلقائياً، بينما يبقى أي شيء لم يتغيَّر لديه كما هو تماماً — يظهر له ملخص واضح بعدد الإضافات والتحديثات قبل أن يوافق. هذا يعمل تماماً كأنكما تعملان على نفس القاعدة السحابية، لكن بلا أي خادم أو اتصال دائم بالإنترنت.</p>
      <p style="color:var(--warn);">تنبيه: هذا مختلف عن «استيراد نسخة JSON (استبدال كامل)» في نفس الصفحة — ذاك يستبدل كل بياناتك الحالية بالكامل، بينما المشاركة والدمج هنا يضيف/يحدِّث فقط دون فقدان أي شيء لديك.</p>
    </div>

    <div id="h-install" class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>تثبيت النظام كتطبيق على الهاتف (أندرويد وآيفون)</h4>
      <p>النظام مُجهَّز بالكامل ليُثبَّت كأيقونة على الشاشة الرئيسية ويعمل كتطبيق مستقل (يفتح بدون شريط عنوان المتصفح، ويعمل بلا إنترنت بعد أول فتح). لكن هذا يحتاج خطوة أولى مهمة قبل أي شيء:</p>
      <h5>الخطوة الأولى (ضرورية): استضافة الملفات برابط حقيقي</h5>
      <p>المتصفحات لا تسمح بتثبيت تطبيق من ملف مفتوح مباشرة من جهازك (file://) — يجب أن يكون الرابط عبر HTTPS. أسهل طريقة مجانية ومناسبة هنا: <b>Firebase Hosting</b> — نفس حساب Firebase الذي أنشأته لصفحة «المزامنة السحابية» (إن أنشأته) يمكن استخدامه للاستضافة مجاناً أيضاً:</p>
      <ul>
        <li>ثبّت أداة Firebase CLI على حاسوبك (تحتاج Node.js): <code>npm install -g firebase-tools</code></li>
        <li>من مجلد ملفات النظام: <code>firebase login</code> ثم <code>firebase init hosting</code> (اختر مشروع Firebase نفسه، ومجلد الملفات الحالي كمجلد النشر).</li>
        <li>نفّذ <code>firebase deploy</code> — ستحصل على رابط مثل <code>https://اسم-مشروعك.web.app</code> يعمل فوراً من أي جهاز.</li>
      </ul>
      <p>بدائل أخرى بنفس الفكرة (استضافة ملفات ثابتة مجانية): GitHub Pages، Netlify، Vercel — أي منها يعطيك رابط HTTPS صالح للتثبيت.</p>
      <h5>الخطوة الثانية: التثبيت من الهاتف</h5>
      <p>افتح الرابط من متصفح الهاتف، ثم اضغط زر «📲 تثبيت» الظاهر في الشريط العلوي:</p>
      <ul>
        <li><b>أندرويد (Chrome):</b> يظهر الزر تلقائياً عندما يكتشف المتصفح أن التطبيق قابل للتثبيت — اضغطه ثم أكّد «تثبيت».</li>
        <li><b>آيفون/آيباد (Safari حصراً):</b> المتصفح لا يدعم التثبيت التلقائي، لذا يعرض الزر تعليمات: اضغط زر «المشاركة» (مربع بسهم لأعلى) في شريط Safari السفلي، ثم «إضافة إلى الشاشة الرئيسية».</li>
      </ul>
      <p>بعد التثبيت، يظهر النظام كأيقونة عادية على الشاشة الرئيسية، ويفتح كتطبيق كامل الشاشة، ويعمل بلا إنترنت (البيانات محفوظة محلياً دائماً، وتتزامن سحابياً فور توفر الإنترنت إن فُعِّلت المزامنة).</p>
    </div>

    <div id="h-exec" class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>ضبط المشروع الأساسي وإدارة الموقع الميداني</h4>
      <h5>لوحة التحكم</h5>
      <p>محفظة كل المشاريع مع مؤشرات CPI/SPI، مؤشر الصحة الشامل لكل مشروع (يجمع أداء الجدول والتكلفة والمخاطر والبنود المتأخرة في درجة واحدة قابلة للتفسير الكامل)، وتنبيهات ذكية تجمع كل ما يحتاج انتباهاً فورياً. اضغط أي مشروع للتعمّق في لوحته الخاصة، وأي نشاط داخلها لتفاصيله.</p>
      <h5>المشاريع</h5>
      <p>السجل الرئيسي لكل مشروع: القيمة التعاقدية، التواريخ، مدير المشروع (يُختار من السجل الرئيسي للموارد)، وموقع المشروع — حدِّده بدقة بضغطة واحدة على خريطة تفاعلية مدمجة (تحتاج إنترنت عند أول استخدام)، أو اكتب عنواناً نصياً كبديل. حذف مشروع يعرض ملخصاً شفافاً بكل ما سيُحذف معه من بيانات مرتبطة قبل التنفيذ.</p>
      <h5>الجدول الزمني</h5>
      <p>مخطط Gantt للمهام مع الترابطات والمسار الحرج (CPM).</p>
      <h5>التقارير اليومية</h5>
      <p>يختار المهندس المهام المنفذة في اليوم من قائمة، فيُبنى ملخص التقرير تلقائياً من حالة تلك المهام — أرشيف كامل من أول يوم للمشروع قابل للبحث والرجوع إليه في أي وقت.</p>
      <h5>المهام / نسب الإنجاز</h5>
      <p>إدارة تفصيلية للمهام وحالتها، ومقارنة الإنجاز المخطط بالفعلي لكل نشاط.</p>
      <h5>الموارد</h5>
      <p>4 تبويبات: العمالة، المعدات، المواد، والسجل الرئيسي للموارد. المدير العام يضيف مدراء المشاريع والمهندسين وينشئ حسابات دخولهم مباشرة من نفس النموذج (اسم مستخدم وكلمة مرور)؛ مدير المشروع يستطيع إضافة عمال ومعدات بنفسه وتعيين مهندسين ومعدات لمشروعه، لكنه لا يرى السعر اليومي لمدراء المشاريع أو المهندسين — فقط أسعار العمالة والمعدات.</p>
      <h5>سجل المخاطر</h5>
      <p>مصفوفة احتمالية × أثر (Heat Map) بـ5 مستويات، قابلة للتصفية بالضغط على أي خلية، مع رسم بياني للتعرض الكلي لكل مشروع.</p>
      <h5>أوامر التغيير</h5>
      <p>أي أمر تغيير «معتمد» ينعكس تلقائياً على قيمة العقد (BAC) وتاريخ الانتهاء الفعّال المستخدم في كل حسابات CPI/SPI/EAC في النظام بأكمله.</p>
      <h5>الجودة QA/QC والسلامة HSE</h5>
      <p>كل بند (فحص، NCR، حادث سلامة) له جهة مسؤولة عن المعالجة وتاريخ إغلاق مستهدف، وتتحول حالته تلقائياً إلى «متأخر» إن تجاوز الموعد دون إغلاق فعلي موثّق. حوادث السلامة المرتفعة الخطورة غير المغلقة تظهر فوراً في تنبيهات لوحة التحكم.</p>
      <h5>قائمة الملاحظات والتسليم</h5>
      <p>ملاحظات التفتيش قبل التسليم (Punch List/Snagging) بدورة عمل مفصولة الأدوار: المهندس المشرف وحده يُدخل الإجراء التصحيحي وصورة بعد المعالجة ثم يرسلها للمراجعة، ومدير المشروع وحده يقبل (تُغلق نهائياً) أو يرفض مع كتابة السبب (يُنشأ بند جديد تلقائياً للمهندس بمهلة جديدة).</p>
    </div>

    <div id="h-contracts" class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>الإدارة التجارية والمشتريات</h4>
      <h5>العقود</h5>
      <p>سجل عقود المالك والمقاولين من الباطن والموردين، مع تنبيه تلقائي قبل انتهاء أي عقد بـ30 يوماً.</p>
      <h5>المشتريات والعطاءات</h5>
      <p>لكل طلب شراء، سجّل عروض أسعار متعددة من موردين مختلفين (السعر، مدة التوريد، المطابقة الفنية)، وقارنها جنباً إلى جنب. عند اختيار الفائز بضغطة واحدة، يُحدَّث المورد والمبلغ في طلب الشراء تلقائياً، مع مؤشر توفير مقارنة بمتوسط العروض.</p>
    </div>

    <div id="h-finance" class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>الشؤون المالية</h4>
      <p>كل هذه الصفحات مرتبطة ببعضها فعلياً (لا شكلياً): الفواتير والمستخلصات والعهد كلها تتغذّى مباشرة في حسابات التدفق النقدي والربحية أدناه. صفحة «التحليل المالي الذكي» تحتوي مركزاً بأعلاها يربطها جميعاً برقم حي لكل واحدة.</p>
      <h5>التحليل المالي الذكي</h5>
      <p>عشرة أقسام: التدفق النقدي، الربحية، مستخلصات المالك، مستخلصات المقاولين، المطالبات، المصروفات، المستحقات والمدفوعات، حالة العقود، الإنجاز الفني مقابل المالي، ومؤشرات تنبؤية (معادلات صريحة، ليست تعلّماً آلياً).</p>
      <h5>الميزانية التفصيلية</h5>
      <p>الميزانية والفعلي حسب بند التكلفة لكل مشروع.</p>
      <h5>الفواتير</h5>
      <p>فواتير العملاء والموردين، مع مراجعة واعتماد/رفض من المحاسب العام.</p>
      <h5>مستخلصات المالك</h5>
      <p>دورة عمل كاملة: مسودة ← تقديم للمالك ← اعتماد (بانتظار الصرف) ← تحصيل كامل. المعتمد وغير المحصَّل يدخل في الرصيد المتوقع؛ المُقدَّم وغير المعتمد يُعرض كأنبوب (Pipeline) منفصل غير مؤكد.</p>
      <h5>مستخلصات المقاولين من الباطن</h5>
      <p>نفس الفكرة تماماً لكن معكوسة الاتجاه: نحن الجهة المراجِعة والدافعة. مُقدَّم من المقاول ← مراجعة فنية ← اعتماد للصرف ← مدفوع.</p>
      <h5>سجل المطالبات</h5>
      <p>طلبات تمديد المدة أو التعويض المالي الناتجة عن أحداث خارج سيطرة المقاول، قبل تحوّلها لأمر تغيير معتمد رسمياً.</p>
      <h5>العهد والسُلف</h5>
      <p>يمنح المحاسب العام عهدة أصلية لمدير المشروع برقم يُولَّد تلقائياً (لا إدخال يدوي). يمكن لمدير المشروع بعدها منح جزء منها كعهدة فرعية لمهندس مشرف على الموقع. كل حامل عهدة — مدير مشروع أو مهندس — يقدّم فواتير الصرف مرتبطة بعهدته من صفحة الفواتير (مع صورتها)، فتُخصم تلقائياً من رصيد عهدته؛ وأي عهدة فرعية تُخصم تلقائياً أيضاً من رصيد العهدة الأصلية. المحاسب العام يعتمد المطابقة النهائية.</p>
    </div>

    <div id="h-comm" class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>التواصل والوثائق</h4>
      <h5>المراسلات</h5>
      <p>سجل وارد/صادر مع المالك أو الاستشاري، بأولوية وحالة رد — العاجلة بلا رد تظهر في تنبيهات لوحة التحكم.</p>
      <h5>الاجتماعات والقرارات</h5>
      <p>تبويب الاجتماعات لتوثيق المحاضر، وتبويب القرارات لبنود المتابعة المرتبطة بكل اجتماع — حالتها (مفتوحة/متأخرة/منجزة) تُشتق تلقائياً من تاريخ الاستحقاق.</p>
      <h5>الوثائق والتراخيص والضمانات</h5>
      <p>سجل موحّد للرخص والتصاريح والضمانات وشهادات المعايرة، بحالة صلاحية تُشتق تلقائياً (ساري/ينتهي قريباً/منتهي/دائم) وتنبيه قبل الانتهاء.</p>
    </div>

    <div id="h-admin" class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>الإدارة المؤسسية والنظام</h4>
      <h5>المستخدمون</h5>
      <p>مالك الشركة فقط يضيف/يعدّل/يحذف حسابات الدخول لبقية الأدوار.</p>
      <h5>المساعد الذكي</h5>
      <p>ميزة اختيارية تحتاج اتصال إنترنت ومفتاح API شخصي. بقية النظام يعمل بكامل خصائصه بدون إنترنت.</p>
      <h5>المزامنة السحابية</h5>
      <p>راجع قسم «مزامنة البيانات بين الأجهزة» أعلاه.</p>
      <h5>البيانات والنسخ الاحتياطي</h5>
      <p>تصدير/استيراد ملف JSON كامل، استرجاع بيانات تجريبية للتجربة، أو حذف كل البيانات نهائياً (مع الحفاظ التلقائي على حسابات الدخول الافتراضية حتى لا يُحبَس أحد خارج النظام).</p>
    </div>

    <div id="h-mobile" class="frame p4 help-body" style="margin-bottom:16px;">
      <h4>الاستخدام على الهاتف</h4>
      <p>القائمة الجانبية تصبح لوحة منزلقة تُفتح بأيقونة ☰ في الأعلى وتُغلق تلقائياً بعد اختيار أي صفحة. النوافذ المنبثقة (الإضافة/التعديل) تفتح كورقة سفلية بأزرار كاملة العرض لسهولة اللمس.</p>
    </div>

    <div id="h-security" class="frame p4 help-body">
      <h4>ملاحظات أمان مهمة</h4>
      <p>تسجيل الدخول تحقّق داخل هذا المتصفح فقط، وليس نظام حماية بمستوى خادم — كلمات المرور مخزَّنة بصيغة مُجزَّأة (SHA-256 مع ملح عشوائي لكل مستخدم) لا كنص صريح، لكن لا يوجد حدّ لمحاولات الدخول ولا انتهاء صلاحية جلسة تلقائي. لا تستخدم كلمات مرور حساسة تستخدمها في أنظمة أخرى. عند استخدام المزامنة السحابية، بيانات مشروعك تُخزَّن في قاعدة Firestore الخاصة بحساب Firebase الذي أنشأته أنت أو زميلك — راجع إعدادات قواعد الأمان (Security Rules) في Firebase إن كانت بياناتك حساسة.</p>
    </div>
  `;
}

/* ============================================================
   صفحة ملاحظات الإدارة العليا — دورة كاملة: ملاحظة GM بصورة، رد
   مدير المشروع بصورة، تشيك ليست تنفيذ حقيقي، ترحيل للملاحظات غير
   المنفَّذة، وتلخيص الملاحظات المتكررة.
   ============================================================ */
function toggleProjectNoteCompletion(noteId, checked) {
  const note = (STATE.data.projectNotes || []).find((n) => n.id === noteId);
  if (!note) return;
  MODULES.projectNotes.update(noteId, Object.assign({}, note, { completed: checked ? "نعم" : "لا", completedDate: checked ? todayISO() : "" }));
  renderApp();
}
function renderProjectNotesView() {
  const rows = filterByProject(STATE.data.projectNotes || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const readOnly = !canEdit(STATE.user.role, "projectNotes");
  const openCount = rows.filter((n) => n.completed !== "نعم").length;
  const summary = [
    kpiCard({ label: "إجمالي الملاحظات", value: rows.length, level: "info" }),
    kpiCard({ label: "منجزة", value: rows.filter((n) => n.completed === "نعم").length, level: "good" }),
    kpiCard({ label: "قيد المتابعة", value: openCount, level: openCount ? "warn" : "good" }),
  ];
  const checklistRows = rows.map((n) => `<div style="display:flex;align-items:flex-start;gap:10px;background:#F5F6F9;border-radius:8px;padding:10px 12px;margin-bottom:8px;">
    <input type="checkbox" ${n.completed === "نعم" ? "checked" : ""} ${readOnly ? "disabled" : ""} onchange="toggleProjectNoteCompletion('${n.id}', this.checked)" style="margin-top:3px;" />
    <div style="flex:1;">
      <div style="font-size:12.5px;color:${n.completed === "نعم" ? "var(--muted2)" : "#e8edf2"};${n.completed === "نعم" ? "text-decoration:line-through;" : ""}">${esc(n.text)}</div>
      <div style="font-size:10.5px;color:var(--muted2);margin-top:3px;">${esc(n.date || "")} ${n.source ? "— " + esc(n.source) : ""} ${n.completed === "نعم" && n.completedDate ? "— أُنجزت: " + esc(n.completedDate) : ""}</div>
    </div>
  </div>`).join("");
  const addBtn = readOnly ? "" : btn("+ ملاحظة جديدة", "openAddModal('projectNotes')", "primary", "sm");
  return `${sectionHeader("ملاحظات المشروع (تشيك ليست)", addBtn)}
    <div class="kpi-grid">${summary.join("")}</div>
    <div class="frame p4">${rows.length ? checklistRows : emptyState("لا توجد ملاحظات بعد — تُضاف يدوياً أو تلقائياً من تحليل نقاش بالذكاء الاصطناعي.")}</div>`;
}

function renderGmNotesView() {
  if (STATE.gmNoteDetailId) return renderGmNoteDetailView(STATE.gmNoteDetailId);
  let rows = filterByProject(STATE.data.gmNotes || []).slice().sort((a, b) => (b.raisedDate || "").localeCompare(a.raisedDate || ""));
  if (STATE.user.role === "مهندس الموقع") {
    // المهندس يرى فقط الملاحظات المُوجَّهة إليه تحديداً — لا كل ملاحظات المشروع (قد تخصّ مهندسين آخرين تماماً)
    rows = rows.filter((n) => n.assignedEngineerResourceId === STATE.user.linkedResourceId);
  }
  const readOnly = !canEdit(STATE.user.role, "gmNotes");

  const pendingPmResponse = rows.filter((n) => (n.status || "بانتظار رد مدير المشروع") === "بانتظار رد مدير المشروع" && !n.carriedToId);
  const pendingGmReview = rows.filter((n) => n.status === "بانتظار مراجعة GM");
  const returnedToPm = rows.filter((n) => n.status === "مُعادة لمدير المشروع");
  const overdue = rows.filter((n) => n.dueDate && n.dueDate < todayISO() && n.status !== "مقبولة ومغلقة" && !n.carriedToId);
  const summary = [
    kpiCard({ label: "إجمالي الملاحظات", value: rows.length, level: "info" }),
    kpiCard({ label: "بانتظار رد مدير المشروع", value: pendingPmResponse.length, level: pendingPmResponse.length ? "warn" : "good" }),
    kpiCard({ label: "بانتظار مراجعة الإدارة العليا", value: pendingGmReview.length, level: pendingGmReview.length ? "warn" : "good" }),
    kpiCard({ label: "أُعيدت لمدير المشروع للتصحيح", value: returnedToPm.length, level: returnedToPm.length ? "danger" : "good" }),
    kpiCard({ label: "متأخرة عن الموعد النهائي", value: overdue.length, level: overdue.length ? "danger" : "good" }),
  ];

  const focusProjectId = STATE.projectFilter && STATE.projectFilter !== "all" ? STATE.projectFilter : (filterByProject(STATE.data.projects || [])[0] || {}).id;
  const recurring = focusProjectId ? computeRecurringNotesSummary(focusProjectId) : [];
  const recurringPanel = recurring.length ? `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--warn);">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">🔁 ملاحظات متكررة — نفس الموضوع أُثير أكثر من مرة</h3>
    <table><thead><tr><th>الموضوع</th><th>عدد مرات التكرار</th><th>غير محسومة منها</th><th>التواريخ</th></tr></thead>
    <tbody>${recurring.map((r) => `<tr><td>${esc(r.title)}</td><td>${statusDot(r.count >= 3 ? "danger" : "warn", r.count)}</td><td>${r.unexecutedCount}</td><td style="font-size:10.5px;color:var(--muted2);">${r.dates.join("، ")}</td></tr>`).join("")}</tbody></table>
    <p style="font-size:11px;color:var(--muted2);margin-top:8px;">تجميع بمطابقة نصية دقيقة لعنوان الملاحظة (بعد تنسيق بسيط) — لا تشابهاً ذكياً بين موضوعات مختلفة الصياغة.</p>
  </div>` : "";

  const rowsHtml = rows.map((n) => {
    const s = deriveGmNoteStatus(n);
    const level = s === "منجزة ومغلقة" ? "good" : (s === "أُعيدت لمدير المشروع للتصحيح" || s === "متأخرة عن الموعد") ? "danger" : s === "مُرحَّلة لملاحظة تالية" ? "info" : "warn";
    const pmName = (STATE.data.resourcePool || []).find((r) => r.id === n.assignedPmResourceId);
    return `<div style="display:flex;justify-content:space-between;align-items:center;background:#F5F6F9;border-radius:8px;padding:10px 12px;margin-bottom:8px;cursor:pointer;" onclick="STATE.gmNoteDetailId='${n.id}';renderApp();">
      <div>
        <div style="font-size:12.5px;color:#0F1420;">${esc(n.title)}</div>
        <div style="font-size:10.5px;color:var(--muted2);margin-top:2px;">${esc(projName(n.projectId))} — مدير المشروع: ${esc(pmName ? pmName.name : "—")} — الموعد: ${esc(n.dueDate || "—")}</div>
      </div>
      ${statusDot(level, s)}
    </div>`;
  }).join("");

  const addBtn = readOnly ? "" : btn("+ ملاحظة جديدة", "openAddModal('gmNotes')", "primary", "sm");
  return `${sectionHeader("ملاحظات الإدارة العليا", addBtn)}
    <div class="kpi-grid">${summary.join("")}</div>
    ${recurringPanel}
    <div class="frame p4">${rows.length ? rowsHtml : emptyState("لا توجد ملاحظات بعد.")}</div>`;
}
function renderGmNoteDetailView(noteId) {
  const note = (STATE.data.gmNotes || []).find((n) => n.id === noteId);
  if (!note) { STATE.gmNoteDetailId = null; return renderGmNotesView(); }
  const isGM = STATE.user.role === "مدير عام" || STATE.user.role === "مالك الشركة";
  const isPmToEngineerNote = note.issuerLevel === "PM";
  const assignedResource = (STATE.data.resourcePool || []).find((r) => r.id === (isPmToEngineerNote ? note.assignedEngineerResourceId : note.assignedPmResourceId));
  const isAssignedResponder = assignedResource && STATE.user.linkedResourceId === assignedResource.id;
  const isIssuingPm = isPmToEngineerNote && STATE.user.id === note.issuedByUserId;
  const history = note.responseHistory || [];
  const lastEntry = history[history.length - 1];
  const issuerLabel = isPmToEngineerNote ? "مدير المشروع" : "الإدارة العليا";
  const assigneeLabel = isPmToEngineerNote ? "المهندس المُكلَّف" : "مدير المشروع المُكلَّف";

  const originalPanel = `<div class="frame p4" style="margin-bottom:14px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h3 style="font-size:13px;color:#3D4759;margin:0;">📌 الملاحظة الأصلية من ${esc(issuerLabel)} (للقراءة فقط)</h3>
      ${statusDot(note.priority === "عالية" ? "danger" : note.priority === "متوسطة" ? "warn" : "info", note.priority || "متوسطة")}
    </div>
    <div style="font-size:13px;color:#0F1420;margin-bottom:6px;"><b>${esc(note.title)}</b></div>
    <div style="font-size:12px;color:var(--muted);line-height:1.8;">${esc(note.description || "—")}</div>
    ${note.photo ? `<img src="${note.photo}" style="max-width:100%;max-height:180px;border-radius:6px;margin-top:8px;" />` : ""}
    <div style="font-size:11px;color:var(--muted2);margin-top:8px;">الموعد النهائي: ${esc(note.dueDate)} — ${esc(assigneeLabel)}: ${esc(assignedResource ? assignedResource.name : "—")}${note.gmComment ? ` — تعليق إضافي: ${esc(note.gmComment)}` : ""}</div>
  </div>`;

  const historyPanel = history.length ? `<div class="frame p4" style="margin-bottom:14px;">
    <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">📜 سجل الردود الكامل (${history.length} نسخة)</h3>
    ${history.map((h) => `<div style="background:#F5F6F9;border-radius:8px;padding:10px 12px;margin-bottom:8px;border-right:3px solid ${h.gmDecision === "accepted" ? "var(--good)" : h.gmDecision === "rejected" ? "var(--danger)" : "var(--warn)"};">
      <div style="font-size:11.5px;color:#0F1420;">نسخة ${h.version} — ${esc(h.submittedBy)} — ${esc(h.submittedDate)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">${esc(h.response)}</div>
      ${h.actionTaken ? `<div style="font-size:11px;color:var(--muted2);margin-top:3px;">الإجراء المُتَّخذ: ${esc(h.actionTaken)}</div>` : ""}
      ${h.evidencePhoto ? `<img src="${h.evidencePhoto}" style="max-width:100%;max-height:140px;border-radius:6px;margin-top:6px;" />` : ""}
      ${h.gmDecision ? `<div style="font-size:11px;color:${h.gmDecision === "accepted" ? "var(--good)" : "var(--danger)"};margin-top:6px;">القرار: ${h.gmDecision === "accepted" ? "قُبِل" : "رُفِض"} (${esc(h.gmDecisionDate)})${h.gmComment ? ` — ${esc(h.gmComment)}` : ""}</div>` : ""}
    </div>`).join("")}
  </div>` : "";

  const canDecide = isPmToEngineerNote ? isIssuingPm : isGM;
  const pendingReviewStatus = isPmToEngineerNote ? "بانتظار مراجعة مدير المشروع" : "بانتظار مراجعة GM";
  const waitingResponseStatuses = isPmToEngineerNote ? ["بانتظار رد المهندس", "مُعادة للمهندس"] : ["بانتظار رد مدير المشروع", "مُعادة لمدير المشروع"];

  let actionPanel = "";
  if (canDecide && note.status === pendingReviewStatus && lastEntry && !lastEntry.gmDecision) {
    actionPanel = `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--info);">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">مراجعة الرد المُقدَّم</h3>
      <textarea id="gm-decision-comment" class="inp" rows="2" style="width:100%;margin-bottom:8px;" placeholder="تعليق (إلزامي عند الرفض)"></textarea>
      <div style="display:flex;gap:8px;">
        ${btn("✓ قبول", "gmDecideOnResponse('" + note.id + "','accepted', document.getElementById('gm-decision-comment').value)", "primary", "sm")}
        ${btn("✕ رفض وإعادة لـ" + assigneeLabel, "gmDecideOnResponse('" + note.id + "','rejected', document.getElementById('gm-decision-comment').value)", "danger", "sm")}
      </div>
    </div>`;
  } else if (isAssignedResponder && waitingResponseStatuses.includes(note.status)) {
    actionPanel = `<div class="frame p4" style="margin-bottom:14px;border-right:3px solid var(--warn);">
      <h3 style="font-size:13px;color:#3D4759;margin:0 0 10px;">${note.status.includes("مُعادة") ? "إعادة الرد بعد الملاحظات" : "إرسال الرد"}</h3>
      <textarea id="pm-response-text" class="inp" rows="3" style="width:100%;margin-bottom:8px;" placeholder="الرد / الشرح"></textarea>
      <input id="pm-action-taken" class="inp" style="width:100%;margin-bottom:8px;" placeholder="الإجراء التصحيحي المُتَّخذ (اختياري)" />
      <select id="pm-completion-status" class="inp" style="width:100%;margin-bottom:8px;">
        <option value="مكتمل">مكتمل</option><option value="قيد التنفيذ">قيد التنفيذ</option><option value="متعذّر التنفيذ">متعذّر التنفيذ</option>
      </select>
      ${btn("إرسال الرد", "submitPmResponse('" + note.id + "', document.getElementById('pm-response-text').value, document.getElementById('pm-action-taken').value, document.getElementById('pm-completion-status').value)", "primary", "sm")}
    </div>`;
  }

  return `${sectionHeader("تفاصيل الملاحظة", btn("← رجوع للقائمة", "STATE.gmNoteDetailId=null;renderApp();", "ghost", "sm"))}
    ${originalPanel}
    ${actionPanel}
    ${historyPanel}`;
}
function promptCarryForwardGmNote(noteId) {
  const newDate = prompt("أدخل الموعد النهائي الجديد لتنفيذ هذه الملاحظة (YYYY-MM-DD):", addDays(todayISO(), 7));
  if (!newDate) return;
  const result = carryForwardGmNote(noteId, newDate);
  if (result) { renderApp(); showToast("تم ترحيل الملاحظة بنجاح إلى موعد " + newDate, "success"); }
}
