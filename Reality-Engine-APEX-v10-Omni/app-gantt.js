/* ============================================================
   مخطط جانت تفاعلي (على غرار Primavera): سحب لإعادة الجدولة،
   مقابض لتغيير المدة، أسهم تبعية بين الأنشطة، وتظليل المسار الحرج.
   ============================================================ */

let GANTT_PX_PER_DAY = 26;

function ganttDateRange(tasks) {
  const dates = [];
  tasks.forEach((t) => { if (t.start) dates.push(new Date(t.start)); if (t.end) dates.push(new Date(t.end)); });
  if (!dates.length) { const now = new Date(); return { start: now, end: new Date(now.getTime() + 30 * 86400000) }; }
  let min = new Date(Math.min(...dates)), max = new Date(Math.max(...dates));
  min.setDate(min.getDate() - 3);
  max.setDate(max.getDate() + 5);
  return { start: min, end: max };
}
function ganttDayOffset(from, date) { return Math.round((new Date(date) - new Date(from)) / 86400000); }
function ganttFmtDay(d) { return d.getDate(); }
function ganttMonthName(d) { return d.toLocaleDateString("ar", { month: "long", year: "numeric" }); }

function renderGanttHTML(tasks) {
  if (!tasks.length) return emptyState("لا توجد أنشطة لعرضها في المخطط.");
  const { start, end } = ganttDateRange(tasks);
  const totalDays = ganttDayOffset(start, end);
  const rowH = 38;
  const criticalSet = criticalTaskIds(STATE.data.tasks);
  const projFilteredIds = new Set(tasks.map((t) => t.id));
  const byId = {}; tasks.forEach((t) => (byId[t.id] = t));

  // header: month groups + day ticks
  const dayTicks = [];
  const monthGroups = [];
  let cursor = new Date(start);
  let curMonth = null, curMonthStartX = 0;
  for (let i = 0; i <= totalDays; i++) {
    const x = i * GANTT_PX_PER_DAY;
    const isWeekend = cursor.getDay() === 5 || cursor.getDay() === 6; // الجمعة والسبت — عطلة نهاية الأسبوع المعتادة إقليمياً
    dayTicks.push(`<div style="position:absolute;right:${x}px;top:0;width:${GANTT_PX_PER_DAY}px;text-align:center;font-size:9px;color:${isWeekend ? "var(--danger)" : "var(--muted2)"};background:${isWeekend ? "rgba(229,72,77,.06)" : "transparent"};border-left:1px solid #1c2733;height:100%;line-height:20px;">${ganttFmtDay(cursor)}</div>`);
    const mLabel = ganttMonthName(cursor);
    if (mLabel !== curMonth) {
      if (curMonth !== null) monthGroups.push({ label: curMonth, x: curMonthStartX, w: x - curMonthStartX });
      curMonth = mLabel; curMonthStartX = x;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  monthGroups.push({ label: curMonth, x: curMonthStartX, w: (totalDays + 1) * GANTT_PX_PER_DAY - curMonthStartX });

  // خلفية ملوَّنة شفافة لأعمدة عطلة نهاية الأسبوع تمتد على ارتفاع المخطط بالكامل — مرجع بصري حقيقي لجدولة الإنشاءات
  const weekendStripes = [];
  { let wc = new Date(start); for (let i = 0; i <= totalDays; i++) { if (wc.getDay() === 5 || wc.getDay() === 6) weekendStripes.push(i * GANTT_PX_PER_DAY); wc.setDate(wc.getDate() + 1); } }
  const weekendOverlay = weekendStripes.map((x) => `<div style="position:absolute;top:0;right:${x}px;width:${GANTT_PX_PER_DAY}px;height:100%;background:rgba(229,72,77,.045);pointer-events:none;"></div>`).join("");

  const monthRow = monthGroups.map((m) => `<div style="position:absolute;right:${m.x}px;width:${m.w}px;top:0;height:20px;font-size:10px;color:var(--muted);text-align:center;border-left:1px solid #1c2733;">${esc(m.label)}</div>`).join("");

  const todayX = ganttDayOffset(start, todayISO()) * GANTT_PX_PER_DAY;

  // bars
  const bars = tasks.map((t, i) => {
    const x = ganttDayOffset(start, t.start || todayISO()) * GANTT_PX_PER_DAY;
    const durationDays = daysBetween(t.start, t.end);
    const isMilestone = durationDays <= 0;
    const w = Math.max(GANTT_PX_PER_DAY * 0.6, durationDays * GANTT_PX_PER_DAY);
    const critical = criticalSet.has(t.id);
    const status = deriveTaskStatus(t);
    // نمط ألوان مطابق لتقاليد Primavera P6 وMS Project: أزرق للنشاط العادي، أحمر للمسار الحرج تحديداً —
    // لا يُستخدَم لون مختلف لـ"متأخر" لوحده لأن الحالتين (حرج/متأخر) غالباً متلازمتان في هذه الأدوات، والأحمر يُعبِّر عن كليهما
    const color = critical || status === "متأخر" ? "#D64550" : status === "منتهي" ? "#3B7DD8" : "#3B7DD8";
    const outlineColor = critical || status === "متأخر" ? "#8C2F37" : "#1F4E8C";
    const comp = clamp(t.completion || 0, 0, 100);
    if (isMilestone) {
      // معلَم زمني (Milestone) بالتقليد القياسي في P6/MSP — ماسة داكنة صلبة، ملوَّنة بالحرج/التأخر فقط عند وجودهما
      const size = 14;
      const msColor = critical || status === "متأخر" ? "#D64550" : "#1c2b3d";
      return `<div class="gantt-bar" data-task-id="${t.id}" title="${esc(t.name)} — معلَم بتاريخ ${esc(t.start || "")}" style="position:absolute;top:${i * rowH + rowH/2 - size/2}px;right:${x - size/2}px;width:${size}px;height:${size}px;background:${msColor};transform:rotate(45deg);cursor:grab;border:1px solid #e8edf2;box-shadow:0 1px 3px rgba(0,0,0,.5);">
        <span style="position:absolute;top:${size + 4}px;right:${-40 + size/2}px;width:110px;font-size:9.5px;color:#0F1420;white-space:nowrap;transform:rotate(0deg);pointer-events:none;">${esc(t.name.length > 18 ? t.name.slice(0, 18) + "…" : t.name)}</span>
      </div>`;
    }
    const estCharsFit = Math.floor((w - 12) / 6.2);
    const displayName = t.name.length > estCharsFit ? (estCharsFit > 3 ? t.name.slice(0, estCharsFit - 1) + "…" : "") : t.name;
    const labelInside = estCharsFit > 3;
    return `<div class="gantt-bar" data-task-id="${t.id}" title="${esc(t.name)} — ${esc(t.start || "")} إلى ${esc(t.end || "")} — إنجاز ${comp}%${critical ? " — على المسار الحرج" : ""}" style="position:absolute;top:${i * rowH + 8}px;right:${x}px;width:${w}px;height:${rowH - 16}px;background:${color}30;border:1px solid ${outlineColor};border-radius:2px;cursor:grab;box-shadow:0 1px 2px rgba(0,0,0,.4);">
      <div class="gantt-fill" style="position:absolute;top:0;right:0;height:100%;width:${comp}%;background:${color};border-radius:2px 0 0 2px;"></div>
      <div class="gantt-handle gantt-handle-l" data-edge="start" style="position:absolute;top:0;right:-3px;width:7px;height:100%;cursor:ew-resize;"></div>
      <div class="gantt-handle gantt-handle-r" data-edge="end" style="position:absolute;top:0;left:-3px;width:7px;height:100%;cursor:ew-resize;"></div>
      ${labelInside
        ? `<span style="position:absolute;top:1px;right:5px;font-size:9.5px;color:#f5f7fa;white-space:nowrap;pointer-events:none;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,.6);">${esc(displayName)}</span>`
        : `<span style="position:absolute;top:1px;left:${w + 6}px;font-size:9.5px;color:#c8d3dd;white-space:nowrap;pointer-events:none;font-weight:600;">${esc(t.name.length > 26 ? t.name.slice(0, 26) + "…" : t.name)}</span>`}
    </div>`;
  }).join("");

  // dependency arrows (SVG overlay)
  const rowCenter = (i) => i * rowH + rowH / 2;
  let arrows = "";
  tasks.forEach((t, i) => {
    (t.predecessors || []).forEach((pid) => {
      const pIndex = tasks.findIndex((x) => x.id === pid);
      if (pIndex === -1) return;
      const pTask = byId[pid];
      const x1 = ganttDayOffset(start, pTask.end || pTask.start) * GANTT_PX_PER_DAY;
      const y1 = rowCenter(pIndex);
      const x2 = ganttDayOffset(start, t.start) * GANTT_PX_PER_DAY;
      const y2 = rowCenter(i);
      const midX = (x1 + x2) / 2;
      arrows += `<path d="M ${x1} ${y1} H ${midX} V ${y2} H ${x2}" fill="none" stroke="#5b6b7a" stroke-width="1.4" marker-end="url(#arrowhead)" />`;
    });
  });

  const totalW = (totalDays + 1) * GANTT_PX_PER_DAY;
  const totalH = tasks.length * rowH;

  return `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
      <span style="font-size:11px;color:var(--muted);">حجم اليوم:</span>
      <button class="btn ghost sm" onclick="ganttZoom(-6)">－</button>
      <button class="btn ghost sm" onclick="ganttZoom(6)">＋</button>
      <span style="font-size:11px;color:var(--muted2);">اسحب أي نشاط لتغيير تاريخه، أو اسحب من طرفه لتغيير مدته.</span>
    </div>
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:10px;flex-wrap:wrap;font-size:10.5px;color:var(--muted);background:#F5F6F9;border-radius:6px;padding:6px 10px;">
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:1px;background:#3B7DD8;display:inline-block;"></span> نشاط عادي</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:1px;background:#D64550;display:inline-block;"></span> مسار حرج / متأخر</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:9px;height:9px;background:#1c2b3d;display:inline-block;transform:rotate(45deg);border:1px solid #e8edf2;"></span> معلَم (Milestone)</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;background:rgba(229,72,77,.15);display:inline-block;"></span> عطلة نهاية الأسبوع</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:1px;height:12px;border-right:1.5px dashed #D64550;display:inline-block;"></span> اليوم</span>
      <span style="display:flex;align-items:center;gap:4px;color:var(--muted2);">التعبئة الداكنة داخل الشريط = نسبة الإنجاز الفعلية</span>
    </div>
    <div style="display:flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
      <div style="width:170px;flex-shrink:0;background:#0D1622;border-left:1px solid var(--border);">
        <div style="height:40px;border-bottom:1px solid var(--border);"></div>
        ${tasks.map((t, i) => `<div title="${esc(t.name)} — ${esc(t.start || "")} إلى ${esc(t.end || "")} — إنجاز ${clamp(t.completion || 0, 0, 100)}%" style="height:${rowH}px;display:flex;align-items:center;padding:0 10px;font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:${i % 2 === 1 ? "rgba(255,255,255,.015)" : "transparent"};border-bottom:1px solid #F5F6F9;">${esc(t.name)}</div>`).join("")}
      </div>
      <div id="gantt-scroll" style="overflow-x:auto;overflow-y:hidden;flex:1;" dir="ltr">
        <div style="position:relative;width:${totalW}px;height:${40 + totalH}px;">
          <div style="position:relative;height:20px;">${monthRow}</div>
          <div style="position:relative;height:20px;border-bottom:1px solid var(--border);">${dayTicks.join("")}</div>
          <div style="position:relative;width:${totalW}px;height:${totalH}px;" id="gantt-rows-area">
            ${weekendOverlay}
            ${tasks.map((_, i) => `<div style="position:absolute;top:${i * rowH}px;right:0;width:100%;height:${rowH}px;background:${i % 2 === 1 ? "rgba(255,255,255,.015)" : "transparent"};border-bottom:1px solid #F5F6F9;"></div>`).join("")}
            <div style="position:absolute;top:0;right:${todayX}px;width:0;height:${totalH}px;border-right:1.5px dashed #D64550;opacity:.75;"></div>
            <svg width="${totalW}" height="${totalH}" style="position:absolute;top:0;right:0;pointer-events:none;">
              <defs><marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#5b6b7a"/></marker></defs>
              ${arrows}
            </svg>
            ${bars}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ---- Drag / resize interactions (attached after render) ---- */
function ganttZoom(delta) {
  GANTT_PX_PER_DAY = clamp(GANTT_PX_PER_DAY + delta, 10, 60);
  renderApp();
}

function ganttInit(tasks) {
  const area = document.getElementById("gantt-rows-area");
  if (!area) return;
  const byId = {}; tasks.forEach((t) => (byId[t.id] = t));

  area.querySelectorAll(".gantt-bar").forEach((barEl) => {
    const taskId = barEl.getAttribute("data-task-id");
    const task = byId[taskId];
    if (!task) return;

    const startDrag = (clientX, mode, edge) => {
      const startX = clientX;
      const origLeft = parseFloat(barEl.style.right);
      const origWidth = parseFloat(barEl.style.width);
      const onMove = (cx) => {
        const dx = cx - startX; // LTR container: moving right (positive dx) increases date offset
        const dayDelta = Math.round(dx / GANTT_PX_PER_DAY);
        if (mode === "move") {
          barEl.style.right = (origLeft - dayDelta * GANTT_PX_PER_DAY) + "px";
        } else if (mode === "resize-end") {
          const newW = Math.max(GANTT_PX_PER_DAY * 0.6, origWidth + dayDelta * GANTT_PX_PER_DAY);
          barEl.style.width = newW + "px";
        } else if (mode === "resize-start") {
          const newW = Math.max(GANTT_PX_PER_DAY * 0.6, origWidth - dayDelta * GANTT_PX_PER_DAY);
          barEl.style.right = (origLeft - dayDelta * GANTT_PX_PER_DAY) + "px";
          barEl.style.width = newW + "px";
        }
        barEl._dayDelta = dayDelta;
      };
      const onEnd = () => {
        document.removeEventListener("mousemove", mouseMoveH);
        document.removeEventListener("mouseup", mouseUpH);
        document.removeEventListener("touchmove", touchMoveH);
        document.removeEventListener("touchend", touchUpH);
        const dayDelta = barEl._dayDelta || 0;
        if (dayDelta !== 0) {
          let newStart = task.start, newEnd = task.end;
          const shift = (dateStr, days) => { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
          if (mode === "move") { newStart = shift(task.start, dayDelta); newEnd = shift(task.end, dayDelta); }
          else if (mode === "resize-end") { newEnd = shift(task.end, dayDelta); if (new Date(newEnd) < new Date(newStart)) newEnd = newStart; }
          else if (mode === "resize-start") { newStart = shift(task.start, dayDelta); if (new Date(newStart) > new Date(newEnd)) newStart = newEnd; }
          MODULES.tasks.update(task.id, { start: newStart, end: newEnd });
        }
        renderApp();
      };
      const mouseMoveH = (e) => onMove(e.clientX);
      const mouseUpH = () => onEnd();
      const touchMoveH = (e) => { onMove(e.touches[0].clientX); e.preventDefault(); };
      const touchUpH = () => onEnd();
      document.addEventListener("mousemove", mouseMoveH);
      document.addEventListener("mouseup", mouseUpH);
      document.addEventListener("touchmove", touchMoveH, { passive: false });
      document.addEventListener("touchend", touchUpH);
    };

    barEl.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("gantt-handle")) return;
      e.preventDefault();
      startDrag(e.clientX, "move");
    });
    barEl.addEventListener("touchstart", (e) => {
      if (e.target.classList.contains("gantt-handle")) return;
      startDrag(e.touches[0].clientX, "move");
    }, { passive: true });

    barEl.querySelectorAll(".gantt-handle").forEach((h) => {
      const edge = h.getAttribute("data-edge");
      h.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); startDrag(e.clientX, edge === "start" ? "resize-start" : "resize-end"); });
      h.addEventListener("touchstart", (e) => { e.stopPropagation(); startDrag(e.touches[0].clientX, edge === "start" ? "resize-start" : "resize-end"); }, { passive: true });
    });

    barEl.addEventListener("dblclick", () => openEditModal("tasks", task.id));
  });
}
