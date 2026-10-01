/* ============================================================
   رسوم بيانية بسيطة بصيغة SVG — بدون أي مكتبة خارجية (تعمل بدون إنترنت)
   ============================================================ */

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

/* Grouped/simple bar chart. series: [{name, color, values:[...]}], labels: [...] */
function barChart(labels, series, opts = {}) {
  const W = opts.width || 560, H = opts.height || 220;
  const padL = 40, padB = 32, padT = 10, padR = 10;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxVal = Math.max(1, ...series.flatMap((s) => s.values.map((v) => Number(v) || 0)));
  const svg = svgEl("svg", { width: "100%", height: H, viewBox: `0 0 ${W} ${H}`, style: "max-width:100%;" });

  // gridlines
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: "#1c2733", "stroke-width": 1 }));
    const val = Math.round(maxVal - (maxVal * i) / 4);
    const t = svgEl("text", { x: padL - 6, y: y + 3, "text-anchor": "end", class: "axis-label" });
    t.textContent = val >= 1000 ? Math.round(val / 1000) + "k" : val;
    svg.appendChild(t);
  }

  const groupW = plotW / labels.length;
  const barGap = 4;
  const barW = (groupW - barGap * 2) / series.length;

  labels.forEach((lab, li) => {
    series.forEach((s, si) => {
      const v = Number(s.values[li]) || 0;
      const h = (v / maxVal) * plotH;
      const x = padL + li * groupW + barGap + si * barW;
      const y = padT + plotH - h;
      const rect = svgEl("rect", { x, y, width: Math.max(1, barW - 2), height: Math.max(0, h), fill: s.color, rx: 2 });
      svg.appendChild(rect);
    });
    const lt = svgEl("text", { x: padL + li * groupW + groupW / 2, y: H - padB + 14, "text-anchor": "middle", class: "axis-label" });
    lt.textContent = lab.length > 10 ? lab.slice(0, 10) + "…" : lab;
    svg.appendChild(lt);
  });
  return svg;
}

/* Multi-line chart. series: [{name, color, values:[...] (nullable)}] */
function lineChart(labels, series, opts = {}) {
  const W = opts.width || 560, H = opts.height || 220;
  const padL = 34, padB = 26, padT = 10, padR = 10;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxVal = opts.max != null ? opts.max : Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null).map(Number)));
  const minVal = opts.min != null ? opts.min : 0;
  const svg = svgEl("svg", { width: "100%", height: H, viewBox: `0 0 ${W} ${H}`, style: "max-width:100%;" });

  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: "#1c2733", "stroke-width": 1 }));
    const val = Math.round(maxVal - ((maxVal - minVal) * i) / 4);
    const t = svgEl("text", { x: padL - 6, y: y + 3, "text-anchor": "end", class: "axis-label" });
    t.textContent = val;
    svg.appendChild(t);
  }
  const stepX = labels.length > 1 ? plotW / (labels.length - 1) : plotW;

  series.forEach((s) => {
    let d = "";
    s.values.forEach((v, i) => {
      if (v == null) return;
      const x = padL + i * stepX;
      const y = padT + plotH - ((v - minVal) / (maxVal - minVal || 1)) * plotH;
      d += (d ? " L " : "M ") + x.toFixed(1) + " " + y.toFixed(1);
    });
    if (d) {
      const path = svgEl("path", { d, fill: "none", stroke: s.color, "stroke-width": 2.2, "stroke-dasharray": s.dashed ? "4 4" : "" });
      svg.appendChild(path);
    }
    s.values.forEach((v, i) => {
      if (v == null) return;
      const x = padL + i * stepX;
      const y = padT + plotH - ((v - minVal) / (maxVal - minVal || 1)) * plotH;
      svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 2.6, fill: s.color }));
    });
  });

  labels.forEach((lab, i) => {
    if (labels.length > 10 && i % 2 !== 0) return;
    const x = padL + i * stepX;
    const t = svgEl("text", { x, y: H - padB + 14, "text-anchor": "middle", class: "axis-label" });
    t.textContent = lab;
    svg.appendChild(t);
  });
  return svg;
}

/* Donut chart. data: [{name, value, color}] */
function donutChart(data, opts = {}) {
  const size = opts.size || 180;
  const r = size / 2 - 10, cx = size / 2, cy = size / 2, rInner = r * 0.55;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const svg = svgEl("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}` });
  let angle = -Math.PI / 2;
  data.forEach((d) => {
    const frac = d.value / total;
    const a0 = angle, a1 = angle + frac * Math.PI * 2;
    angle = a1;
    if (d.value <= 0) return;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const xi0 = cx + rInner * Math.cos(a1), yi0 = cy + rInner * Math.sin(a1);
    const xi1 = cx + rInner * Math.cos(a0), yi1 = cy + rInner * Math.sin(a0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const path = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi0} ${yi0} A ${rInner} ${rInner} 0 ${large} 0 ${xi1} ${yi1} Z`;
    svg.appendChild(svgEl("path", { d: path, fill: d.color }));
  });
  return svg;
}

function legendHTML(items) {
  return `<div class="legend">${items.map((i) => `<span><span class="sw" style="background:${i.color}"></span>${esc(i.name)}</span>`).join("")}</div>`;
}
