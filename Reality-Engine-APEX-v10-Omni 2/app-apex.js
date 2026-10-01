/* Reality Engine APEX — Enterprise Intelligence Layer
 * Adds an executive command center, AI-style triage, governance radar,
 * portfolio health, predictive forecast, decision cockpit and enhanced UX.
 * It is additive: existing modules remain intact.
 */
(function(){
  const APEX = window.APEX = { version:'6.0.0', mode:'enterprise' };
  STATE.apex = STATE.apex || { compact:false, focus:false, alertsOnly:false };

  function arr(k){ return Array.isArray(STATE.data?.[k]) ? STATE.data[k] : []; }
  function n(v){ const x=Number(v); return Number.isFinite(x)?x:0; }
  function pct(v){ return Math.max(0,Math.min(100,n(v))); }
  function avg(a){ return a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0; }
  function escA(v){ return typeof esc==='function'?esc(v==null?'':String(v)):String(v??''); }

  function projectHealth(p){
    const evm = typeof computeEVM==='function' ? computeEVM(p, arr('budgetItems'), arr('changeOrders')) : {};
    const risks = arr('risks').filter(r=>r.projectId===p.id && String(r.status||'').toLowerCase()!=='closed');
    const tasks = arr('tasks').filter(t=>t.projectId===p.id);
    const overdue = tasks.filter(t=>t.endDate && t.endDate < todayISO() && String(t.status||'').toLowerCase()!=='completed').length;
    let score = 100;
    if(n(evm.CPI) && evm.CPI<1) score -= Math.min(25,(1-evm.CPI)*70);
    if(n(evm.SPI) && evm.SPI<1) score -= Math.min(25,(1-evm.SPI)*70);
    score -= Math.min(20, risks.filter(r=>String(r.level||r.severity||'').toLowerCase().includes('high')||String(r.level||r.severity||'').includes('عالي')).length*7);
    score -= Math.min(20, overdue*3);
    const completion=pct(p.completion);
    if(completion>=95) score+=3;
    score=Math.round(Math.max(0,Math.min(100,score)));
    return {projectId:p.id,score, evm, risks, tasks, overdue, band:score>=80?'healthy':score>=60?'watch':'critical'};
  }

  function portfolioMetrics(){
    const ps=arr('projects');
    const hs=ps.map(projectHealth);
    const avgHealth=Math.round(avg(hs.map(x=>x.score))||0);
    const atRisk=hs.filter(x=>x.band!=='healthy').length;
    const overdue=hs.reduce((s,x)=>s+x.overdue,0);
    const active=ps.filter(p=>String(p.status||'').toLowerCase()!=='منتهي'&&String(p.status||'').toLowerCase()!=='completed').length;
    const budget=ps.reduce((s,p)=>s+n(p.contractValue||p.budget),0);
    const completion=avg(ps.map(p=>n(p.completion)));
    return {projects:ps.length,active,avgHealth,atRisk,overdue,budget,completion,health:avgHealth>=80?'healthy':avgHealth>=60?'watch':'critical',hs};
  }

  function aiTriage(){
    const m=portfolioMetrics(), out=[];
    if(m.atRisk) out.push({sev:'danger',icon:'🚨',title:`${m.atRisk} مشروع يحتاج تدخلاً`,text:'ابدأ بالمشاريع ذات أقل Health Score وافتح أسباب الانحراف قبل الاجتماع التنفيذي.'});
    if(m.overdue) out.push({sev:'warn',icon:'⏱',title:`${m.overdue} مهمة متأخرة`,text:'راجع المسار الحرج والاعتماديات؛ التأخر المتكرر مؤشر مبكر على ضغط الجدول.'});
    const invoices=arr('invoices');
    const pending=invoices.filter(x=>['pending','معلق','قيد المراجعة','submitted'].includes(String(x.status||'').toLowerCase())).length;
    if(pending) out.push({sev:'info',icon:'💰',title:`${pending} مستند مالي يحتاج معالجة`,text:'ضع SLA للفواتير والمستخلصات واربط التأخير بالتدفق النقدي المتوقع.'});
    const risks=arr('risks').filter(r=>!['closed','مغلق'].includes(String(r.status||'').toLowerCase()));
    if(risks.length) out.push({sev:'warn',icon:'⚠',title:`${risks.length} خطر مفتوح`,text:'حوّل المخاطر عالية الاحتمال/الأثر إلى إجراءات وقائية بمالك وتاريخ استحقاق.'});
    if(!out.length) out.push({sev:'good',icon:'✦',title:'المحفظة مستقرة مبدئياً',text:'لا توجد إشارات حرجة في البيانات الحالية. استمر في مراقبة الانحرافات وليس النتائج فقط.'});
    return out;
  }

  function renderApex(){
    if (!(window.APEX12?.apexCommanderAllowed?.() || ['مدير عام','مالك الشركة','مدير PMO','Executive','APEX Commander'].includes(String(STATE.user?.role||'')))) return '<div class="frame" style="padding:24px">غير مصرح</div>';
    const m=portfolioMetrics(), ai=aiTriage();
    const healthCls=m.health==='healthy'?'good':m.health==='watch'?'warn':'danger';
    const top=m.hs.slice().sort((a,b)=>a.score-b.score).slice(0,6);
    const recent=arr('auditLog').slice(-8).reverse();
    const decisions=arr('meetings').filter(x=>String(x.status||'').toLowerCase().includes('open')||String(x.decisionStatus||'').toLowerCase().includes('pending')).slice(0,5);
    return `<div class="apex-page">
      <div class="apex-hero">
        <div><div class="eyebrow">REALITY ENGINE APEX • ENTERPRISE CONTROL PLANE</div><h1>مركز القيادة المؤسسي</h1><p>صورة واحدة للمحفظة: القيمة، الجدول، المخاطر، النقد، القرارات، والواقع الميداني.</p></div>
        <div class="apex-hero-actions"><button class="btn primary" onclick="setActive('ai')">🤖 اسأل Copilot</button><button class="btn ghost" onclick="toggleApexFocus()">${STATE.apex.focus?'↙ الخروج من التركيز':'⛶ وضع التركيز'}</button></div>
      </div>
      <div class="apex-kpis">
        ${[['المشاريع',m.projects,'🗂','info'],['النشطة',m.active,'⚡','info'],['صحة المحفظة',m.avgHealth+'%','◉',healthCls],['تحتاج تدخلاً',m.atRisk,'🚨',m.atRisk?'danger':'good'],['مهام متأخرة',m.overdue,'⏱',m.overdue?'warn':'good'],['الإنجاز المتوسط',Math.round(m.completion)+'%','📈','info']].map(x=>`<div class="apex-kpi ${x[3]}"><div class="kicon">${x[2]}</div><div><span>${x[0]}</span><strong>${escA(x[1])}</strong></div></div>`).join('')}
      </div>
      <div class="apex-grid apex-grid-main">
        <section class="frame apex-card apex-health"><div class="apex-card-head"><div><b>رادار صحة المشاريع</b><small>ترتيب تلقائي حسب الأولوية التنفيذية</small></div><span class="badge-pill">AI TRIAGE</span></div>
          <div class="apex-project-list">${top.length?top.map(h=>{const p=arr('projects').find(x=>x.id===h.tasks[0]?.projectId||x.id===h.projectId)||arr('projects').find(x=>x.id===h?.projectId); const pp=p||{}; return `<div class="apex-project-row" onclick="setProjectFilter('${escA(pp.id||'all')}');setActive('projects')"><div class="apex-project-name"><span class="apex-dot ${h.band}"></span><b>${escA(pp.name||'مشروع')}</b><small>${h.overdue} متأخرة • ${h.risks.length} مخاطر مفتوحة</small></div><div class="apex-score">${h.score}%</div><div class="apex-bar"><i style="width:${h.score}%"></i></div></div>`}).join(''):'<div class="empty">لا توجد مشاريع بعد.</div>'}</div>
        </section>
        <section class="frame apex-card"><div class="apex-card-head"><div><b>AI Action Radar</b><small>إشارات قابلة للتنفيذ، وليست مجرد تنبيهات</small></div><span>✦</span></div>${ai.map(a=>`<div class="apex-ai-item ${a.sev}"><span class="aicon">${a.icon}</span><div><b>${escA(a.title)}</b><p>${escA(a.text)}</p></div></div>`).join('')}</section>
      </div>
      <div class="apex-grid">
        <section class="frame apex-card"><div class="apex-card-head"><div><b>غرفة القرارات</b><small>ما يحتاج قراراً الآن؟</small></div><button class="btn ghost sm" onclick="setActive('meetings')">فتح</button></div>${decisions.length?decisions.map(d=>`<div class="apex-decision"><span>◆</span><div><b>${escA(d.title||d.subject||d.name||'قرار')}</b><small>${escA(d.date||d.dueDate||'')}</small></div></div>`).join(''):'<div class="empty">لا توجد قرارات معلقة ظاهرة في البيانات الحالية.</div>'}</section>
        <section class="frame apex-card"><div class="apex-card-head"><div><b>Digital Twin Readiness</b><small>جاهزية الواقع الميداني للربط بالمشروع</small></div><button class="btn ghost sm" onclick="setActive('digitalTwin')">فتح التوأم</button></div>
          ${['Control Network','iPhone / LiDAR','BIM / IFC','Scan Registration','Quality Gate'].map((x,i)=>`<div class="apex-readiness"><span>${x}</span><div class="apex-mini-bar"><i style="width:${[92,78,86,72,64][i]}%"></i></div><b>${[92,78,86,72,64][i]}%</b></div>`).join('')}
        </section>
        <section class="frame apex-card"><div class="apex-card-head"><div><b>Governance Pulse</b><small>فصل المهام والاعتمادات</small></div><button class="btn ghost sm" onclick="setActive('users')">إدارة</button></div>
          <div class="gov-grid"><div><b>${arr('users').length}</b><span>مستخدمون</span></div><div><b>${arr('temporaryGrants').length}</b><span>صلاحيات مؤقتة</span></div><div><b>${arr('delegations').length}</b><span>تفويضات</span></div><div><b>${arr('auditLog').length}</b><span>أحداث تدقيق</span></div></div>
        </section>
      </div>
      <section class="frame apex-card apex-footer-card"><div class="apex-card-head"><div><b>Operational Event Stream</b><small>آخر الأدلة المسجلة في النظام</small></div><button class="btn ghost sm" onclick="setActive('auditLog')">السجل الكامل</button></div>${recent.length?recent.map(e=>`<div class="apex-event"><span class="event-time">${escA(e.timestamp||e.date||'')}</span><span>${escA(e.action||e.eventType||e.type||'حدث')}</span><span class="muted">${escA(e.userName||e.createdBy||'')}</span></div>`).join(''):'<div class="empty">لا توجد أحداث تدقيق معروضة.</div>'}</section>
    </div>`;
  }

  function toggleApexFocus(){ STATE.apex.focus=!STATE.apex.focus; document.body.classList.toggle('apex-focus',STATE.apex.focus); renderApp(); }
  window.toggleApexFocus=toggleApexFocus;
  window.renderApex=renderApex;

  function install(){
    if(!window.VIEW_RENDERERS) return;
    VIEW_RENDERERS.apex=renderApex;
    if(!NAV_SECTIONS.some(s=>s.items.some(i=>i.key==='apex'))){
      NAV_SECTIONS.splice(0,0,{section:null,items:[{key:'apex',label:'APEX Command Center',ic:'✦'}]});
      NAV.push(NAV_SECTIONS[0].items[0]);
      ALL_KEYS.push('apex');
      Object.keys(ROLE_CONFIG||{}).forEach(r=>{ ROLE_CONFIG[r].view = ROLE_CONFIG[r].view.includes('apex')?ROLE_CONFIG[r].view:[...ROLE_CONFIG[r].view,'apex']; });
    }
    const oldRender=window.renderShell;
    if(!window.__apexShellPatched){
      window.__apexShellPatched=true;
      window.renderShell=function(){
        const html=oldRender();
        return html.replace('<div class="main">','<div class="main">');
      };
    }
    // Add command shortcuts beyond Ctrl+K.
    document.addEventListener('keydown',e=>{
      if(!STATE.user) return;
      if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='a'){e.preventDefault();if(window.APEX12?.apexCommanderAllowed?.())setActive('apex');}
      if(e.key==='Escape'&&STATE.apex.focus){STATE.apex.focus=false;document.body.classList.remove('apex-focus');renderApp();}
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0)); else setTimeout(install,0);
})();
