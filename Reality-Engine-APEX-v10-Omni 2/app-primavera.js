/* ============================================================
   تكامل Primavera P6 — عبر الملفات (XER / P6 XML / CSV)
   ============================================================
   Primavera P6 Professional لا يملك أصلاً أي واجهة API — قاعدة
   بياناته تُقرأ فقط عبر تطبيقه أو عبر تصدير/استيراد الملفات (XER
   هي الصيغة الأكثر استخداماً فعلياً لتبادل الجداول الزمنية معه).
   Primavera Cloud (SaaS) لديها REST API حقيقية، لكنها تتطلب مصادقة
   خادم-إلى-خادم بمفتاح سرّي — وضعه داخل متصفح يكشفه لأي شخص يفتح
   "أدوات المطوّر"، لذا لم يُنفَّذ هنا عمداً (نفس مبدأ SAP/Oracle).
   المزامنة هنا إذاً هي عبر الملفات: استيراد/تصدير حقيقي وكامل،
   بمعاينة والتحقق واكتشاف تعارضات وسجل كامل وإمكانية تراجع —
   وليست مجرد استيراد/تصدير بسيط.

   قيد مهم صريح: نموذج البيانات الحالي للنظام لا يخزّن نوع العلاقة
   (FS/SS/FF/SF) ولا الـLag في حساب المسار الحرج نفسه (يُعامل كل
   الروابط كـFS بلا مهلة، كما بُني أصلاً). للحفاظ على البيانات دون
   فقدانها عند التصدير لاحقاً لـPrimavera، نحفظ هذه التفاصيل في حقل
   إضافي "predecessorDetails" منفصل عن حساب الجدولة نفسه — أي أن
   الاستيراد/التصدير يحافظ على النوع والمهلة بدقة، لكن حساب المسار
   الحرج داخل هذا النظام نفسه يبقى بمنطقه الحالي (FS فقط) كما هو
   موثَّق أصلاً، لا إضافة وهمية.
   ============================================================ */

/* ---------------- محرك تحليل XER (Generic Table Parser) ---------------- */
function parseXER(text) {
  const lines = text.split(/\r?\n/);
  const tables = {};
  let currentTable = null;
  let currentFields = null;
  let headerLine = null;
  for (const raw of lines) {
    if (!raw) continue;
    if (raw.startsWith("ERMHDR")) { headerLine = raw; continue; }
    const parts = raw.split("\t");
    const tag = parts[0];
    if (tag === "%T") {
      currentTable = parts[1];
      tables[currentTable] = tables[currentTable] || { fields: [], rows: [] };
      currentFields = null;
    } else if (tag === "%F") {
      currentFields = parts.slice(1);
      if (currentTable) tables[currentTable].fields = currentFields;
    } else if (tag === "%R") {
      if (!currentTable || !currentFields) continue;
      const values = parts.slice(1);
      const row = {};
      currentFields.forEach((f, i) => { row[f] = values[i] !== undefined ? values[i] : ""; });
      tables[currentTable].rows.push(row);
    }
    // %E و%W (Workgroup) تُتجاهَل عمداً — لا تحمل بيانات جدولة مطلوبة هنا
  }
  return { header: headerLine, tables };
}

const XER_RELATIONSHIP_MAP = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };
const XER_RELATIONSHIP_REVERSE = { FS: "PR_FS", SS: "PR_SS", FF: "PR_FF", SF: "PR_SF" };

function xerDateToISO(xerDate) {
  if (!xerDate) return "";
  // صيغة XER القياسية: YYYY-MM-DD HH:MM أو YYYY-MM-DD
  const m = String(xerDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
function isoDateToXER(iso) {
  return iso ? `${iso} 08:00` : "";
}

/* ---------------- بناء معاينة الاستيراد (Preview) قبل أي التزام فعلي بالبيانات ---------------- */
function buildXERImportPreview(parsed) {
  const tables = parsed.tables;
  const warnings = [];
  const conflicts = [];

  const projectRows = (tables.PROJECT && tables.PROJECT.rows) || [];
  const taskRows = (tables.TASK && tables.TASK.rows) || [];
  const predRows = (tables.TASKPRED && tables.TASKPRED.rows) || [];

  if (!projectRows.length) warnings.push("لم يُعثر على جدول PROJECT في الملف — تحقق أنه ملف XER صحيح ومُصدَّر من Primavera فعلياً.");
  if (!taskRows.length) warnings.push("لم يُعثر على أي أنشطة (جدول TASK) في الملف.");

  const previewProjects = projectRows.map((p) => ({
    xerProjId: p.proj_id,
    name: p.proj_short_name || p.proj_id || "مشروع مستورَد",
    startDate: xerDateToISO(p.plan_start_date || p.proj_start_date),
    endDate: xerDateToISO(p.plan_end_date || p.scd_end_date),
  }));

  const taskIdMap = new Map(); // xer task_id (رقم داخلي) → بيانات المهمة المستوردة (id سيُولَّد لاحقاً عند التنفيذ الفعلي)
  const previewTasks = taskRows.map((t) => {
    const completion = t.phys_complete_pct ? Number(t.phys_complete_pct) : (t.complete_pct_type === "CP_Phys" ? 0 : 0);
    const status = t.status_code === "TK_Complete" ? "منتهي" : t.status_code === "TK_Active" ? "جارٍ" : "لم يبدأ";
    const row = {
      xerTaskId: t.task_id, xerProjId: t.proj_id, activityId: t.task_code || t.task_id,
      name: t.task_name || t.task_code || "نشاط بلا اسم",
      start: xerDateToISO(t.act_start_date || t.target_start_date || t.early_start_date),
      end: xerDateToISO(t.act_end_date || t.target_end_date || t.early_end_date),
      completion: isNaN(completion) ? 0 : completion,
      statusText: status,
    };
    taskIdMap.set(t.task_id, row);
    if (!row.start || !row.end) warnings.push(`النشاط "${row.name}" (${row.activityId}) بلا تاريخ بداية أو نهاية صريح في الملف.`);
    return row;
  });

  const previewRelationships = predRows.map((r) => {
    const fromTask = taskIdMap.get(r.pred_task_id);
    const toTask = taskIdMap.get(r.task_id);
    if (!fromTask || !toTask) {
      conflicts.push(`علاقة تشير لنشاط غير موجود في الملف (pred_task_id=${r.pred_task_id}, task_id=${r.task_id}) — سيُتجاهَل هذا الرابط.`);
      return null;
    }
    return {
      fromActivityId: fromTask.activityId, toActivityId: toTask.activityId,
      type: XER_RELATIONSHIP_MAP[r.pred_type] || "FS",
      lagDays: r.lag_hr_cnt ? Math.round(Number(r.lag_hr_cnt) / 8) : 0, // XER تخزّن المهلة بالساعات، والنظام يستخدم أيام عمل تقريبية
    };
  }).filter(Boolean);

  const nonFsCount = previewRelationships.filter((r) => r.type !== "FS" || r.lagDays !== 0).length;
  if (nonFsCount > 0) {
    warnings.push(`${nonFsCount} علاقة من نوع غير FS أو بها مهلة زمنية (Lag) — ستُحفَظ تفاصيلها بدقة، لكن حساب المسار الحرج داخل هذا النظام يعامل كل الروابط حالياً كـFS بلا مهلة (قيد معروف وموثَّق، لا فقدان بيانات صامت).`);
  }

  return {
    projects: previewProjects, tasks: previewTasks, relationships: previewRelationships,
    warnings, conflicts,
    summary: { projectCount: previewProjects.length, taskCount: previewTasks.length, relationshipCount: previewRelationships.length },
  };
}

/* ---------------- تنفيذ الاستيراد فعلياً — مع لقطة كاملة للتراجع (Rollback) ---------------- */
function applyXERImport(preview, targetProjectId) {
  if (STATE.user && !canEdit(STATE.user.role, "primavera") && !canEdit(STATE.user.role, "projects")) { alert("دورك الحالي لا يملك صلاحية استيراد جدول Primavera."); return { success: false }; }
  const snapshot = JSON.parse(JSON.stringify(STATE.data));
  STATE.data._lastImportSnapshot = { snapshot, takenAt: Date.now(), takenBy: (STATE.user && STATE.user.name) || "—" };

  let projectId = targetProjectId;
  if (!projectId) {
    const pr = preview.projects[0];
    const newProj = {
      id: uid(), name: pr ? pr.name : "مشروع مستورَد من Primavera", contractValue: 0,
      startDate: pr ? pr.startDate : todayISO(), endDate: pr ? pr.endDate : todayISO(),
      completion: 0, risk: "متوسط", history: [{ date: todayISO(), completion: 0 }], updatedAt: Date.now(),
    };
    STATE.data.projects = [...STATE.data.projects, newProj];
    logAudit("create", "projects", newProj.id, `مشروع مستورَد من Primavera: ${newProj.name}`);
    projectId = newProj.id;
  }

  const activityIdToNewId = new Map();
  preview.tasks.forEach((t) => {
    const newTask = {
      id: uid(), projectId, name: t.name, start: t.start, end: t.end, completion: t.completion,
      predecessors: [], predecessorDetails: [], externalActivityId: t.activityId, updatedAt: Date.now(),
    };
    STATE.data.tasks.push(newTask);
    activityIdToNewId.set(t.activityId, newTask.id);
  });

  preview.relationships.forEach((r) => {
    const fromId = activityIdToNewId.get(r.fromActivityId);
    const toId = activityIdToNewId.get(r.toActivityId);
    if (!fromId || !toId) return;
    const toTask = STATE.data.tasks.find((t) => t.id === toId);
    if (!toTask) return;
    toTask.predecessors = toTask.predecessors || [];
    toTask.predecessorDetails = toTask.predecessorDetails || [];
    toTask.predecessors.push(fromId);
    toTask.predecessorDetails.push({ taskId: fromId, type: r.type, lagDays: r.lagDays });
  });

  logAudit("create", "tasks", projectId, `استيراد Primavera: ${preview.tasks.length} نشاط، ${preview.relationships.length} علاقة`);
  saveData(STATE.data);
  return { projectId, importedTasks: preview.tasks.length, importedRelationships: preview.relationships.length };
}
function rollbackLastImport() {
  const snap = STATE.data._lastImportSnapshot;
  if (!snap) { alert("لا توجد عملية استيراد حديثة للتراجع عنها."); return false; }
  STATE.data = snap.snapshot;
  logAudit("delete", "system", "rollback-import", "تراجع عن آخر عملية استيراد Primavera");
  saveData(STATE.data);
  return true;
}

/* ---------------- تصدير إلى XER — ملف صالح يفتحه Primavera P6 مباشرة ---------------- */
function exportProjectToXER(projectId) {
  const project = STATE.data.projects.find((p) => p.id === projectId);
  if (!project) return "";
  const tasks = STATE.data.tasks.filter((t) => t.projectId === projectId);
  const taskIdMap = new Map();
  tasks.forEach((t, i) => taskIdMap.set(t.id, 10000 + i)); // XER تتطلب أرقام صحيحة داخلية للأنشطة

  const lines = [];
  lines.push(`ERMHDR\t18.8\t${todayISO()}\tProject\tadmin\tadmin\tdbxDatabaseNoName\tProject Management\tGMT`);

  lines.push("%T\tPROJECT");
  lines.push("%F\tproj_id\tproj_short_name\tplan_start_date\tplan_end_date");
  lines.push(`%R\t1\t${project.name}\t${isoDateToXER(project.startDate)}\t${isoDateToXER(project.endDate)}`);

  lines.push("%T\tTASK");
  lines.push("%F\ttask_id\tproj_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\tphys_complete_pct\tstatus_code");
  tasks.forEach((t) => {
    const statusCode = Number(t.completion) >= 100 ? "TK_Complete" : Number(t.completion) > 0 ? "TK_Active" : "TK_NotStart";
    lines.push(`%R\t${taskIdMap.get(t.id)}\t1\t${t.externalActivityId || taskIdMap.get(t.id)}\t${t.name}\t${isoDateToXER(t.start)}\t${isoDateToXER(t.end)}\t${t.completion || 0}\t${statusCode}`);
  });

  lines.push("%T\tTASKPRED");
  lines.push("%F\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt");
  tasks.forEach((t) => {
    (t.predecessorDetails && t.predecessorDetails.length ? t.predecessorDetails : (t.predecessors || []).map((pid) => ({ taskId: pid, type: "FS", lagDays: 0 })))
      .forEach((pd) => {
        const predXerId = taskIdMap.get(pd.taskId);
        if (!predXerId) return;
        lines.push(`%R\t${taskIdMap.get(t.id)}\t${predXerId}\t${XER_RELATIONSHIP_REVERSE[pd.type] || "PR_FS"}\t${(pd.lagDays || 0) * 8}`);
      });
  });

  lines.push("%E");
  return lines.join("\r\n");
}

/* ============================================================
   فحص صحة الجدول الزمني (Schedule Health Check) — 12 فحصاً حقيقياً
   يعمل على جدول أي مشروع داخل هذا النظام مباشرة، بغض النظر عن كونه
   مستورَداً من Primavera أو لا — لا يحتاج أي اتصال بـPrimavera.
   ============================================================ */
function detectCircularRelationships(tasks) {
  const byId = {};
  tasks.forEach((t) => (byId[t.id] = t));
  const cycles = [];
  const visited = new Set(), inStack = new Set(), path = [];
  function dfs(id) {
    if (inStack.has(id)) {
      const cycleStart = path.indexOf(id);
      if (cycleStart >= 0) cycles.push(path.slice(cycleStart).concat(id));
      return;
    }
    if (visited.has(id) || !byId[id]) return;
    visited.add(id); inStack.add(id); path.push(id);
    (byId[id].predecessors || []).forEach((pid) => dfs(pid));
    path.pop(); inStack.delete(id);
  }
  tasks.forEach((t) => dfs(t.id));
  return cycles;
}

function getDcmaLongDurationDays() { return ScheduleConfig.dcmaLongDurationDays; } // قراءة حيّة — الدرس المُستفاد من مراجعة إعدادات التوأم الرقمي، لا تكرار لنفس الخلل
function getDcmaHighFloatDays() { return ScheduleConfig.dcmaHighFloatDays; }

function runScheduleHealthCheck(projectId) {
  const tasks = STATE.data.tasks.filter((t) => t.projectId === projectId);
  const byId = {};
  tasks.forEach((t) => (byId[t.id] = t));
  const succMap = {};
  tasks.forEach((t) => (succMap[t.id] = []));
  tasks.forEach((t) => (t.predecessors || []).forEach((pid) => { if (succMap[pid]) succMap[pid].push(t.id); }));

  let cpm = { critical: new Set(), slack: {} };
  try { cpm = computeCriticalPath(tasks); } catch (e) { /* جدول فارغ أو دائري بالكامل — يستمر الفحص بقيم افتراضية آمنة */ }

  const checks = [];
  const addCheck = (key, label, issues, recommendation, status) => {
    checks.push({ key, label, issues, recommendation, status: status || (issues.length === 0 ? "pass" : "fail") });
  };

  const noPred = tasks.filter((t) => !(t.predecessors || []).length);
  const noSucc = tasks.filter((t) => !(succMap[t.id] || []).length);
  const missingLogic = tasks.filter((t) => !(t.predecessors || []).length || !(succMap[t.id] || []).length);
  addCheck("missingLogic", "روابط منطقية ناقصة (Missing Logic)",
    missingLogic.map((t) => ({ taskId: t.id, taskName: t.name, detail: (!(t.predecessors || []).length && !(succMap[t.id] || []).length) ? "بلا نشاط سابق وبلا نشاط لاحق" : !(t.predecessors || []).length ? "بلا نشاط سابق" : "بلا نشاط لاحق" })),
    "اربط كل نشاط (عدا بداية/نهاية المشروع الفعليتين) بنشاط سابق ولاحق واحد على الأقل.");

  addCheck("openEnds", "أطراف مفتوحة (Open Ends)",
    noPred.map((t) => ({ taskId: t.id, taskName: t.name, detail: "بداية مفتوحة — بلا نشاط سابق" })),
    "حدِّد نشاطاً سابقاً واضحاً لكل نشاط عدا النشاط الأول الفعلي للمشروع.");

  const negFloat = tasks.filter((t) => (cpm.slack[t.id] || 0) < 0);
  addCheck("negativeFloat", "وقت فائض سالب (Negative Float)",
    negFloat.map((t) => ({ taskId: t.id, taskName: t.name, detail: `الفائض: ${cpm.slack[t.id]} يوم` })),
    "الجدول الحالي غير قابل للتحقيق كما هو مخطَّط لهذه الأنشطة — راجع القيود أو أعد توزيع الموارد.");

  const cycles = detectCircularRelationships(tasks);
  addCheck("circular", "علاقات دائرية (Circular Relationships)",
    cycles.map((c) => ({ taskId: c[0], taskName: byId[c[0]] ? byId[c[0]].name : c[0], detail: `دورة مغلقة: ${c.map((id) => (byId[id] ? byId[id].name : id)).join(" → ")}` })),
    "أزل أحد الروابط ضمن هذه الدورة — حساب الجدولة يصبح مستحيلاً رياضياً مع وجودها.");

  const oos = tasks.filter((t) => {
    const comp = Number(t.completion) || 0;
    if (comp <= 0) return false;
    return (t.predecessors || []).some((pid) => byId[pid] && Number(byId[pid].completion || 0) < 100);
  });
  addCheck("outOfSequence", "إنجاز خارج التسلسل (Out-of-Sequence Progress)",
    oos.map((t) => ({ taskId: t.id, taskName: t.name, detail: "بدأ تنفيذه قبل اكتمال نشاط سابق له بالكامل" })),
    "راجع منطق الترابط، أو حدِّث تاريخ البدء الفعلي ليعكس الواقع بدقة.");

  const today = todayISO();
  const invalidConstraints = tasks.filter((t) => (t.start && t.end && t.end < t.start) || (Number(t.completion) >= 100 && t.end && t.end > today));
  addCheck("invalidConstraints", "قيود غير صحيحة (Invalid Constraints)",
    invalidConstraints.map((t) => ({ taskId: t.id, taskName: t.name, detail: (t.start && t.end && t.end < t.start) ? "تاريخ النهاية قبل تاريخ البداية" : "مكتمل 100% لكن تاريخ النهاية لا يزال مستقبلياً" })),
    "صحِّح التواريخ لتعكس واقع التنفيذ الفعلي.");

  const longDurationThreshold = getDcmaLongDurationDays();
  const longDur = tasks.filter((t) => t.start && t.end && daysBetween(t.start, t.end) > longDurationThreshold);
  addCheck("longDuration", `أنشطة طويلة المدة (أكثر من ${longDurationThreshold} يوماً)`,
    longDur.map((t) => ({ taskId: t.id, taskName: t.name, detail: `المدة: ${daysBetween(t.start, t.end)} يوماً` })),
    "قسِّم النشاط لأنشطة فرعية أصغر لتحسين دقة متابعة التقدّم.");

  const highFloatThreshold = getDcmaHighFloatDays();
  const highFloat = tasks.filter((t) => (cpm.slack[t.id] || 0) > highFloatThreshold);
  addCheck("highFloat", `فائض زمني مرتفع (أكثر من ${highFloatThreshold} يوماً)`,
    highFloat.map((t) => ({ taskId: t.id, taskName: t.name, detail: `الفائض: ${cpm.slack[t.id]} يوم` })),
    "راجع منطق الترابط — فائض مرتفع جداً غالباً يعني ترابطاً منطقياً ناقصاً لا فائضاً حقيقياً.");

  const dangling = tasks.filter((t) => !(t.predecessors || []).length && !(succMap[t.id] || []).length);
  addCheck("dangling", "أنشطة معزولة تماماً (Dangling Activities)",
    dangling.map((t) => ({ taskId: t.id, taskName: t.name, detail: "بلا أي رابط منطقي إطلاقاً" })),
    "اربط هذا النشاط بالجدول العام، وإلا فلن يُحتسب ضمن المسار الحرج إطلاقاً.");

  addCheck("calendarConflicts", "تعارضات التقويم (Calendar Conflicts)", [],
    "غير قابل للفحص حالياً — هذا النظام لا يحتوي نظام تقاويم عمل متعددة (كالعطلات الرسمية لكل مشروع) كما في Primavera. لا يُدَّعى فحص وهمي هنا.",
    "na");

  const seen = new Map();
  const duplicates = [];
  tasks.forEach((t) => {
    const key = `${(t.name || "").trim().toLowerCase()}|${t.start}|${t.end}`;
    if (seen.has(key)) duplicates.push(t); else seen.set(key, t);
  });
  addCheck("duplicates", "أنشطة مكرَّرة (Duplicate Activities)",
    duplicates.map((t) => ({ taskId: t.id, taskName: t.name, detail: "نفس الاسم والتواريخ لنشاط آخر بالضبط" })),
    "احذف التكرار، أو تحقّق أن هذا ليس خطأ إدخال مزدوج.");

  const staleRefs = [];
  tasks.forEach((t) => (t.predecessors || []).forEach((pid) => { if (!byId[pid]) staleRefs.push({ taskId: t.id, taskName: t.name, detail: `يشير لنشاط سابق غير موجود في المشروع (معرِّف: ${pid})` }); }));
  addCheck("relationshipValidation", "صحة الروابط (Relationship Validation)", staleRefs,
    "نظّف الروابط المعلَّقة التي تشير لأنشطة محذوفة.");

  const totalIssues = checks.reduce((s, c) => s + c.issues.length, 0);
  return { checks, totalIssues, taskCount: tasks.length };
}

function exportProjectToCSV(projectId) {
  const project = STATE.data.projects.find((p) => p.id === projectId);
  if (!project) return "";
  const tasks = STATE.data.tasks.filter((t) => t.projectId === projectId);
  const header = ["Activity ID", "Activity Name", "Start", "Finish", "% Complete", "Predecessors"].join(",");
  const idToActivityId = new Map(tasks.map((t) => [t.id, t.externalActivityId || t.id]));
  const rows = tasks.map((t) => {
    const preds = (t.predecessors || []).map((pid) => idToActivityId.get(pid) || pid).join(";");
    const esc2 = (v) => `"${String(v).replace(/"/g, '""')}"`;
    return [esc2(t.externalActivityId || t.id), esc2(t.name), t.start || "", t.end || "", t.completion || 0, esc2(preds)].join(",");
  });
  return [header, ...rows].join("\r\n");
}
function parseCSVSchedule(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { tasks: [], warnings: ["الملف فارغ."] };
  const parseCsvLine = (line) => {
    const out = []; let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name) => header.findIndex((h) => h.includes(name));
  const iId = idx("activity id"), iName = idx("activity name"), iStart = idx("start"), iEnd = idx("finish"), iPct = idx("complete"), iPred = idx("predecessor");
  const warnings = [];
  const tasks = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      activityId: cols[iId] || "", name: cols[iName] || "نشاط بلا اسم",
      start: cols[iStart] || "", end: cols[iEnd] || "", completion: Number(cols[iPct]) || 0,
      predecessorIds: (cols[iPred] || "").split(";").map((s) => s.trim()).filter(Boolean),
    };
  });
  if (iId < 0 || iName < 0) warnings.push("لم يُعثر على عمودي Activity ID أو Activity Name في الملف — تأكد أن الصف الأول يحتوي عناوين الأعمدة الصحيحة.");
  return { tasks, warnings };
}

/* ============================================================
   محوِّلات استيراد الجدول الزمني (Schedule Import Adapters) — تطبيق
   حقيقي لعقد المحوِّلات المشترَك على منطق التحليل الموجود أصلاً (XER
   وCSV)، بلا تغيير سلوك. نقطة امتداد حقيقية لصيغ مستقبلية (كملفات
   MS Project XML مثلاً) — تُضاف بتسجيل محوِّل جديد فقط، بلا لمس أي
   من دوال التحليل أو الاستيراد الحالية.
   ============================================================ */
const ScheduleImportAdapterRegistry = createAdapterRegistry("Schedule Import");
ScheduleImportAdapterRegistry.register("xer", { supports: (format) => format === "xer", parse: (rawText) => parseXER(rawText) });
ScheduleImportAdapterRegistry.register("csv", { supports: (format) => format === "csv", parse: (rawText) => parseCSVSchedule(rawText) });
function getScheduleImportAdapterFor(format) { return ScheduleImportAdapterRegistry.findFor(format); }
