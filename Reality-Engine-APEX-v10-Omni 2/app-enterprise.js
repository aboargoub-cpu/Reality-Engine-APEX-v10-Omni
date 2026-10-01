/* ============================================================
   Reality Engine Enterprise Layer — v5.0
   Executive cockpit, portfolio governance, maturity controls,
   delegated approvals, risk heatmap, schedule/cost health,
   decision register, security posture and enterprise admin.
   This layer intentionally composes existing engines rather than
   replacing them.
   ============================================================ */
(function () {
  const E = window.RealityEnterprise = {};
  const iso = () => new Date().toISOString();
  const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
  const arr = (k) => Array.isArray(STATE.data && STATE.data[k]) ? STATE.data[k] : [];
  const pct = (v) => `${Math.round(clamp(num(v), 0, 100))}%`;
  const daysLate = (p) => p && p.endDate ? Math.max(0, Math.ceil((new Date(todayISO()) - new Date(p.endDate)) / 86400000)) : 0;
  const safeSave = () => { if (typeof saveData === 'function') saveData(STATE.data); };

  E.ensure = function () {
    STATE.data.enterprise = STATE.data.enterprise || {};
    const e = STATE.data.enterprise;
    e.version = e.version || '5.0';
    e.settings = Object.assign({
      currency: 'LYD', defaultToleranceM: 0.025, riskThreshold: 15,
      approvalSlaDays: 3, scheduleAlertDays: 7, costAlertPct: 10,
      requireIndependentCheckPoint: true, requireTwoPersonApproval: true,
      securityLevel: 'enterprise',
    }, e.settings || {});
    e.approvalPolicies = Array.isArray(e.approvalPolicies) ? e.approvalPolicies : [];
    e.decisions = Array.isArray(e.decisions) ? e.decisions : [];
    e.raci = Array.isArray(e.raci) ? e.raci : [];
    e.riskSnapshots = Array.isArray(e.riskSnapshots) ? e.riskSnapshots : [];
    e.securityEvents = Array.isArray(e.securityEvents) ? e.securityEvents : [];
    return e;
  };

  function projectHealth(p) {
    let evm = null; try { evm = computeEVM(p, arr('budgetItems'), arr('changeOrders')); } catch (_) {}
    const risks = arr('risks').filter(r => r.projectId === p.id);
    const criticalRisks = risks.filter(r => typeof riskScore === 'function' && riskScore(r) >= 15).length;
    const openTasks = arr('tasks').filter(t => t.projectId === p.id && deriveTaskStatus(t) !== 'منتهي');
    const overdue = openTasks.filter(t => deriveTaskStatus(t) === 'متأخر').length;
    const schedule = evm && evm.SPI != null ? evm.SPI : 1;
    const cost = evm && evm.CPI != null ? evm.CPI : 1;
    const lateDays = daysLate(p);
    let score = 100;
    if (schedule < .9) score -= 25; else if (schedule < .98) score -= 12;
    if (cost < .9) score -= 25; else if (cost < .98) score -= 12;
    score -= Math.min(25, criticalRisks * 7);
    score -= Math.min(15, overdue * 2);
    if (lateDays > 0) score -= Math.min(20, lateDays);
    score = clamp(score, 0, 100);
    return { score, spi: schedule, cpi: cost, criticalRisks, overdue, lateDays,
      band: score >= 80 ? 'good' : score >= 60 ? 'warn' : 'danger' };
  }

  function kpi(title, value, sub, cls='') {
    return `<div class="ent-kpi ${cls}"><div class="ent-kpi-title">${esc(title)}</div><div class="ent-kpi-value">${value}</div><div class="ent-kpi-sub">${esc(sub || '')}</div></div>`;
  }
  function pill(text, cls='info') { return `<span class="ent-pill ${cls}">${esc(text)}</span>`; }
  function bar(label, value, cls='') {
    const v = clamp(num(value), 0, 100);
    return `<div class="ent-bar-row"><div><span>${esc(label)}</span><b>${Math.round(v)}%</b></div><div class="ent-bar"><i class="${cls}" style="width:${v}%"></i></div></div>`;
  }

  E.renderCockpit = function () {
    E.ensure();
    const projects = filterByProject(arr('projects'));
    const health = projects.map(p => ({ p, h: projectHealth(p) }));
    const avg = health.length ? health.reduce((s,x)=>s+x.h.score,0)/health.length : 0;
    const atRisk = health.filter(x => x.h.band === 'danger').length;
    const watch = health.filter(x => x.h.band === 'warn').length;
    const tasks = filterByProject(arr('tasks'));
    const overdue = tasks.filter(t => deriveTaskStatus(t) === 'متأخر').length;
    const risks = filterByProject(arr('risks')).sort((a,b)=>num(riskScore(b))-num(riskScore(a)));
    const criticalRisks = risks.filter(r => num(riskScore(r)) >= 15).length;
    const hse = filterByProject(arr('hse'));
    const openHse = hse.filter(x => deriveHSEStatus(x) !== 'مغلق').length;
    const qcs = filterByProject(arr('qc'));
    const openQc = qcs.filter(x => String(x.status||'').toLowerCase() !== 'مغلق' && String(x.status||'') !== 'مكتمل').length;
    const decisions = E.ensure().decisions.filter(d => d.status !== 'مغلق');
    const twin = filterByProject(arr('realityCaptures'));
    const recent = twin.slice().sort((a,b)=>num(b.updatedAt)-num(a.updatedAt)).slice(0,5);
    const totalBudget = arr('budgetItems').filter(x => projects.some(p=>p.id===x.projectId)).reduce((s,x)=>s+num(x.budget),0);
    const totalActual = arr('budgetItems').filter(x => projects.some(p=>p.id===x.projectId)).reduce((s,x)=>s+num(x.actual),0);
    const budgetPct = totalBudget ? totalActual/totalBudget*100 : 0;
    const avgCompletion = projects.length ? projects.reduce((s,p)=>s+num(p.completion),0)/projects.length : 0;
    const now = new Date();
    const next7 = tasks.filter(t => t.endDate && new Date(t.endDate) >= now && new Date(t.endDate) <= new Date(now.getTime()+7*86400000) && deriveTaskStatus(t)!=='منتهي').length;

    return `<div class="ent-wrap">
      <div class="ent-hero">
        <div><div class="ent-eyebrow">ENTERPRISE PROJECT CONTROL CENTER · v5</div><h1>مركز القيادة المؤسسية</h1><p>نظرة تنفيذية موحّدة تربط القيمة، الجدول، التكلفة، المخاطر، القرارات، الجودة، HSE والتوأم الرقمي.</p></div>
        <div class="ent-actions"><button class="btn primary" onclick="RealityEnterprise.openAdmin()">⚙ حوكمة النظام</button><button class="btn ghost" onclick="RealityEnterprise.snapshot()">📸 حفظ لقطة الأداء</button></div>
      </div>
      <div class="ent-kpis">
        ${kpi('المشاريع النشطة', projects.length, `${atRisk} خطر · ${watch} تحت المراقبة`, atRisk ? 'danger':'good')}
        ${kpi('صحة المحفظة', Math.round(avg), 'مؤشر مركب 0–100', avg>=80?'good':avg>=60?'warn':'danger')}
        ${kpi('الإنجاز المتوسط', pct(avgCompletion), 'من بيانات المشاريع', avgCompletion>=70?'good':'info')}
        ${kpi('التكلفة الفعلية / الميزانية', pct(budgetPct), `${fmtMoney(totalActual)} / ${fmtMoney(totalBudget)}`, budgetPct>100?'danger':budgetPct>90?'warn':'good')}
        ${kpi('مهام متأخرة', overdue, `${next7} مستحقة خلال 7 أيام`, overdue?'danger':'good')}
        ${kpi('مخاطر حرجة', criticalRisks, `${risks.length} إجمالي المخاطر`, criticalRisks?'danger':'good')}
        ${kpi('HSE مفتوح', openHse, 'حالات تحتاج إغلاقاً', openHse?'warn':'good')}
        ${kpi('قرارات مفتوحة', decisions.length, 'تُدار من سجل القرار', decisions.length?'warn':'good')}
      </div>
      <div class="ent-grid ent-grid-main">
        <section class="frame p4 ent-panel"><div class="ent-panel-head"><h3>صحة المشاريع</h3><span>${pill('Portfolio Health','info')}</span></div>
          ${health.length ? health.sort((a,b)=>a.h.score-b.h.score).map(x=>`<div class="ent-project-row" onclick="drillToProject('${x.p.id}')"><div class="ent-project-name"><b>${esc(x.p.name)}</b><small>${esc(x.p.code||'')}</small></div><div>${bar('Health',x.h.score,x.h.band)} </div><div class="ent-mini-stats"><span>SPI ${x.h.spi.toFixed(2)}</span><span>CPI ${x.h.cpi.toFixed(2)}</span><span>${x.h.criticalRisks} خطر</span></div></div>`).join('') : `<div class="empty-state">لا توجد مشاريع في نطاقك.</div>`}
        </section>
        <section class="frame p4 ent-panel"><div class="ent-panel-head"><h3>مصفوفة المخاطر</h3><span>${pill(`${criticalRisks} حرجة`, criticalRisks?'danger':'good')}</span></div>
          <div class="ent-risk-grid">${[1,2,3,4,5].map(i=>[5,4,3,2,1].map(j=>{const s=i*j; const n=risks.filter(r=>num(r.probability||r.likelihood||0)===i && num(r.impact||0)===j).length; return `<div class="risk-cell r${s>=15?'3':s>=8?'2':'1'}" title="${s}">${n||''}</div>`}).join('')).join('')}</div>
          ${risks.slice(0,5).map(r=>`<div class="ent-risk-item"><span>${esc(r.title||r.description||'خطر')}</span>${pill(`${riskScore(r)}/25`, riskScore(r)>=15?'danger':riskScore(r)>=8?'warn':'good')}</div>`).join('')}
        </section>
      </div>
      <div class="ent-grid ent-grid-3">
        <section class="frame p4 ent-panel"><div class="ent-panel-head"><h3>الحوكمة والقرارات</h3><button class="btn ghost sm" onclick="RealityEnterprise.addDecision()">+ قرار</button></div>
          ${decisions.slice(0,6).map(d=>`<div class="ent-list-row"><div><b>${esc(d.title)}</b><small>${esc(d.owner||'غير محدد')} · ${esc(d.dueDate||'—')}</small></div>${pill(d.status||'مفتوح', d.status==='مغلق'?'good':'warn')}</div>`).join('') || '<div class="empty-state">لا توجد قرارات مفتوحة.</div>'}
        </section>
        <section class="frame p4 ent-panel"><div class="ent-panel-head"><h3>التوأم الرقمي</h3><button class="btn ghost sm" onclick="setActive('digitalTwin')">فتح</button></div>
          <div class="ent-big-number">${twin.length}</div><div class="ent-muted">عمليات Reality Capture مسجلة</div>
          ${recent.map(x=>`<div class="ent-list-row"><div><b>${esc(x.name||x.title||'Reality Capture')}</b><small>${esc(x.status||'مسجل')}</small></div>${pill(x.quality||'—','info')}</div>`).join('') || '<div class="empty-state">ابدأ أول مسح.</div>'}
        </section>
        <section class="frame p4 ent-panel"><div class="ent-panel-head"><h3>جودة التنفيذ</h3></div>
          ${bar('QA/QC مفتوح', qcs.length ? Math.max(0,100-openQc/qcs.length*100):100, openQc?'warn':'good')}
          ${bar('HSE مغلق', hse.length ? (hse.filter(x=>deriveHSEStatus(x)==='مغلق').length/hse.length*100):100, openHse?'warn':'good')}
          ${bar('تغطية التوثيق الرقمي', projects.length ? Math.min(100,twin.length/projects.length*100):0, twin.length?'good':'info')}
        </section>
      </div>
      <div class="ent-footer-note">منهجية المركز مبنية على مبادئ PMBOK® Guide – Eighth Edition، ISO 21502 لإدارة المشاريع، وISO 19650 لإدارة المعلومات وBIM، مع ضوابط أمنية مستلهمة من OWASP ASVS 5.0 وZero Trust. هذه طبقة تشغيلية داخل النظام وليست ادعاءً بالامتثال أو الاعتماد.</div>
    </div>`;
  };

  E.snapshot = function () {
    E.ensure();
    const projects = filterByProject(arr('projects'));
    const snap = { id: uid(), timestamp: Date.now(), createdAt: iso(), userId: STATE.user&&STATE.user.id, userName: STATE.user&&STATE.user.name,
      projects: projects.map(p=>{const h=projectHealth(p); return {projectId:p.id,name:p.name,completion:num(p.completion),health:h.score,spi:h.spi,cpi:h.cpi,risks:h.criticalRisks,overdue:h.overdue};}) };
    E.ensure().riskSnapshots.push(snap); E.ensure().riskSnapshots=E.ensure().riskSnapshots.slice(-120); safeSave();
    alert('تم حفظ لقطة أداء مؤسسية قابلة للمراجعة.');
  };

  E.addDecision = function () {
    E.ensure();
    const title = prompt('عنوان القرار:'); if (!title) return;
    const owner = prompt('المسؤول عن القرار:') || '';
    const dueDate = prompt('تاريخ الاستحقاق YYYY-MM-DD:', todayISO()) || '';
    E.ensure().decisions.push({id:uid(),title,owner,dueDate,status:'مفتوح',createdAt:Date.now(),createdBy:STATE.user&&STATE.user.name});
    logAudit('create','enterprise.decisions',E.ensure().decisions.at(-1).id,title); safeSave(); renderApp();
  };

  E.openAdmin = function(){
    if (!STATE.user || !['مالك الشركة','مدير عام'].includes(STATE.user.role)) { alert('مركز الحوكمة متاح لمالك الشركة ومدير عام فقط.'); return; }
    STATE.active='enterpriseAdmin'; renderApp();
  };

  E.renderAdmin = function(){
    E.ensure(); const e=E.ensure(); const users=arr('users'); const matrix=getFinePermissionsMatrix();
    const roles=Object.keys(ROLE_CONFIG);
    const approvalRows=(e.approvalPolicies||[]).map((p,i)=>`<tr><td>${esc(p.name)}</td><td>${esc(p.module)}</td><td>${esc(p.action)}</td><td>${esc(p.approverRole)}</td><td>${p.slaDays} يوم</td><td><button class="btn danger sm" onclick="RealityEnterprise.removePolicy(${i})">حذف</button></td></tr>`).join('');
    return `<div class="ent-wrap"><div class="ent-hero"><div><div class="ent-eyebrow">ENTERPRISE GOVERNANCE</div><h1>الحوكمة والصلاحيات</h1><p>فصل المهام، التفويض، سياسات الاعتماد، ومراقبة الأمن والتدقيق.</p></div><div class="ent-actions"><button class="btn ghost" onclick="setActive('dashboard')">← مركز القيادة</button></div></div>
      <div class="ent-grid ent-grid-3">
        <section class="frame p4 ent-panel"><div class="ent-panel-head"><h3>حسابات المستخدمين</h3><span>${pill(`${users.length} حساب`,'info')}</span></div>${users.map(u=>`<div class="ent-list-row"><div><b>${esc(u.name)}</b><small>${esc(u.username)} · ${esc(u.role)}</small></div>${pill(u.status||'نشط',u.status==='نشط'?'good':'danger')}</div>`).join('')}</section>
        <section class="frame p4 ent-panel"><div class="ent-panel-head"><h3>مستوى الأمان</h3>${pill(e.settings.securityLevel,'good')}</div><div class="ent-security-score">${e.settings.securityLevel==='enterprise'?'85':'65'}/100</div><ul class="ent-checks"><li>✓ كلمات مرور مجزأة محلياً</li><li>✓ قفل بعد محاولات فاشلة</li><li>✓ Audit Log</li><li>✓ Fine-grained permissions</li><li>✓ فصل اعتماد/إنشاء</li><li>⚠ الخادم المركزي يحتاج تفعيل AUTH_REQUIRED في الإنتاج</li></ul></section>
        <section class="frame p4 ent-panel"><div class="ent-panel-head"><h3>إعدادات التحكم</h3></div><label class="ent-toggle"><input type="checkbox" ${e.settings.requireIndependentCheckPoint?'checked':''} onchange="RealityEnterprise.toggleSetting('requireIndependentCheckPoint',this.checked)"><span>نقطة تحقق مستقلة للمسح</span></label><label class="ent-toggle"><input type="checkbox" ${e.settings.requireTwoPersonApproval?'checked':''} onchange="RealityEnterprise.toggleSetting('requireTwoPersonApproval',this.checked)"><span>مبدأ الشخصين للاعتماد</span></label><label class="ent-toggle"><input type="checkbox" ${e.settings.approvalSlaDays<=3?'checked':''} onchange="RealityEnterprise.setSla(this.checked)"><span>تنبيه SLA خلال 3 أيام</span></label></section>
      </div>
      <section class="frame p4 ent-panel"><div class="ent-panel-head"><h3>سياسات الاعتماد</h3><button class="btn primary sm" onclick="RealityEnterprise.addPolicy()">+ سياسة اعتماد</button></div><div style="overflow:auto"><table><thead><tr><th>السياسة</th><th>الوحدة</th><th>الإجراء</th><th>المعتمد</th><th>SLA</th><th></th></tr></thead><tbody>${approvalRows||'<tr><td colspan="6">لا توجد سياسات مخصصة.</td></tr>'}</tbody></table></div></section>
      <section class="frame p4 ent-panel"><div class="ent-panel-head"><h3>مصفوفة الصلاحيات</h3></div><div style="overflow:auto"><table><thead><tr><th>الدور</th><th>الوحدات المرئية</th><th>الوحدات القابلة للتعديل</th><th>ملاحظات</th></tr></thead><tbody>${roles.map(r=>`<tr><td><b>${esc(r)}</b></td><td>${ROLE_CONFIG[r].view.length}</td><td>${ROLE_CONFIG[r].edit.length}</td><td>${esc(ROLE_CONFIG[r].desc)}</td></tr>`).join('')}</tbody></table></div></section>
      <div class="ent-footer-note">لأمن الإنتاج: لا تعتمد على إخفاء الأزرار في المتصفح. يجب فرض Authorization على API/قاعدة البيانات أيضاً، مع MFA، إدارة جلسات، سجلات غير قابلة للعبث، وتشفير البيانات الحساسة.</div>
    </div>`;
  };
  E.toggleSetting=(k,v)=>{E.ensure().settings[k]=v;safeSave();renderApp();};
  E.setSla=(v)=>{E.ensure().settings.approvalSlaDays=v?3:7;safeSave();renderApp();};
  E.addPolicy=()=>{E.ensure(); const name=prompt('اسم السياسة:');if(!name)return;const module=prompt('الوحدة (مثال invoices):','invoices');const action=prompt('الإجراء (approve/reject):','approve');const approverRole=prompt('الدور المعتمد:','مدير عام');const sla=Number(prompt('SLA بالأيام:','3'))||3;E.ensure().approvalPolicies.push({id:uid(),name,module,action,approverRole,slaDays:sla,createdAt:Date.now()});safeSave();renderApp();};
  E.removePolicy=(i)=>{if(!confirm('حذف سياسة الاعتماد؟'))return;E.ensure().approvalPolicies.splice(i,1);safeSave();renderApp();};

  // Extend navigation after the original application has loaded.
  function install() {
    E.ensure();
    if (typeof NAV_SECTIONS !== 'undefined') {
      const adminSec = NAV_SECTIONS.find(s=>s.section==='الإدارة المؤسسية');
      if (adminSec && !adminSec.items.some(x=>x.key==='enterpriseAdmin')) adminSec.items.splice(1,0,{key:'enterpriseAdmin',label:'مركز الحوكمة المؤسسية',ic:'🏛'});
    }
    if (typeof ALL_KEYS !== 'undefined' && !ALL_KEYS.includes('enterpriseAdmin')) ALL_KEYS.push('enterpriseAdmin');
    if (typeof VIEW_RENDERERS !== 'undefined') VIEW_RENDERERS.enterpriseAdmin=E.renderAdmin;
    if (typeof VIEW_RENDERERS !== 'undefined') VIEW_RENDERERS.dashboard=E.renderCockpit;
    if (typeof ROLES !== 'undefined' && !ROLES.includes('مدير PMO')) ROLES.push('مدير PMO');
    if (typeof ROLE_CONFIG !== 'undefined' && !ROLE_CONFIG['مدير PMO']) ROLE_CONFIG['مدير PMO']={icon:'◎',desc:'حوكمة المحفظة، المنهجية، التقارير، المخاطر، الأداء والتغيير على مستوى المؤسسة',view:ALL_KEYS.slice(),edit:['projects','schedule','risks','progress','changeOrders','documents','meetings','digitalTwin','predictiveAnalytics']};
    if (typeof STATE.data.finePermissions !== 'undefined' && STATE.data.finePermissions && !STATE.data.finePermissions['مدير PMO']) {
      STATE.data.finePermissions['مدير PMO'] = {};
      ALL_KEYS.forEach(k => STATE.data.finePermissions['مدير PMO'][k] = {view:ROLE_CONFIG['مدير PMO'].view.includes(k),create:ROLE_CONFIG['مدير PMO'].edit.includes(k),edit:ROLE_CONFIG['مدير PMO'].edit.includes(k),delete:false,submit:ROLE_CONFIG['مدير PMO'].edit.includes(k),approve:false,reject:false,export:true,download:true,print:true});
      safeSave();
    }
    if (STATE.user) renderApp();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>setTimeout(install,0)); else setTimeout(install,0);
})();
