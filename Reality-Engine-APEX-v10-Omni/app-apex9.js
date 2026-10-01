/* Reality Engine APEX v7 — Enterprise Intelligence Layer */
(function(){
  const A = window.APEX9 = {};
  const a = k => Array.isArray(STATE.data?.[k]) ? STATE.data[k] : [];
  const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const clamp=(v,l=0,h=100)=>Math.max(l,Math.min(h,v));
  const esc9 = v => typeof esc === 'function' ? esc(v) : String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const mean = xs => xs.length ? xs.reduce((s,x)=>s+x,0)/xs.length : 0;
  const randNormal = () => {
    let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  };

  A.ensure = () => {
    if (!STATE.data) return null;
    STATE.data.apex9 = STATE.data.apex9 || {};
    const x=STATE.data.apex9;
    x.version='7.0';
    x.lastAssessment=x.lastAssessment||new Date().toISOString();
    x.agents=x.agents||[
      {id:'schedule-sentinel',name:'Schedule Sentinel',mode:'advisory',scope:'schedule',active:true},
      {id:'cost-guardian',name:'Cost Guardian',mode:'advisory',scope:'finance',active:true},
      {id:'risk-orchestrator',name:'Risk Orchestrator',mode:'advisory',scope:'risk',active:true},
      {id:'reality-inspector',name:'Reality Inspector',mode:'advisory',scope:'digital-twin',active:true},
      {id:'document-intelligence',name:'Document Intelligence',mode:'advisory',scope:'documents',active:true}
    ];
    x.evidence=x.evidence||[];
    x.scenarios=x.scenarios||[];
    x.policies=x.policies||{highImpactRequiresHuman:true,aiCanNeverApprove:true};
    return x;
  };

  function projectScore(p){
    let score=100;
    try{
      const e=computeEVM(p,a('budgetItems'),a('changeOrders'));
      if(e?.SPI<1) score-=clamp((1-e.SPI)*80,0,25);
      if(e?.CPI<1) score-=clamp((1-e.CPI)*80,0,25);
    }catch(_){}
    const risks=a('risks').filter(r=>r.projectId===p.id);
    score-=Math.min(25,risks.filter(r=>n(typeof riskScore==='function'?riskScore(r):r.score)>=15).length*7);
    const tasks=a('tasks').filter(t=>t.projectId===p.id);
    score-=Math.min(15,tasks.filter(t=>typeof deriveTaskStatus==='function'&&deriveTaskStatus(t)==='متأخر').length*2);
    return Math.round(clamp(score));
  }

  function signals(){
    const out=[];
    const ps=a('projects');
    ps.forEach(p=>{
      const s=projectScore(p);
      if(s<60) out.push({sev:'critical',project:p.name||p.code||p.id,title:'تدخل تنفيذي فوري',reason:`Health Score = ${s}%`,action:'فتح غرفة التعافي ومراجعة الجدول والتكلفة والمخاطر.'});
      else if(s<80) out.push({sev:'warning',project:p.name||p.code||p.id,title:'مراقبة مشددة',reason:`Health Score = ${s}%`,action:'إنشاء خطة تعافٍ بمالك وموعد تحقق.'});
    });
    a('changeOrders').filter(x=>String(x.status||'').toLowerCase().includes('pending')||String(x.status||'').includes('معلق')).slice(0,8)
      .forEach(x=>out.push({sev:'change',project:x.projectId||'',title:'تغيير غير محسوم',reason:'Change Order يحتاج قراراً',action:'تحليل أثر الوقت والتكلفة والنطاق قبل الاعتماد.'}));
    return out.slice(0,12);
  }

  A.simulate = function(opts={}){
    const iterations=Math.max(1000,Math.min(50000,n(opts.iterations||10000)));
    const optimistic=Math.max(1,n(opts.optimistic||30)), likely=Math.max(optimistic,n(opts.mostLikely||45)), pessimistic=Math.max(likely,n(opts.pessimistic||70));
    const samples=[];
    for(let i=0;i<iterations;i++){
      // Triangular distribution + small correlated uncertainty.
      const u=Math.random(), c=(likely-optimistic)/(pessimistic-optimistic||1);
      let x;
      if(u<c) x=optimistic+Math.sqrt(u*(pessimistic-optimistic)*(likely-optimistic));
      else x=pessimistic-Math.sqrt((1-u)*(pessimistic-optimistic)*(pessimistic-likely));
      x+=randNormal()*Math.max(0.5,x*0.04);
      samples.push(Math.max(0,x));
    }
    samples.sort((x,y)=>x-y);
    const q=p=>samples[Math.floor((samples.length-1)*p)];
    const result={iterations,mean:mean(samples),p50:q(.50),p80:q(.80),p90:q(.90),p95:q(.95),min:samples[0],max:samples.at(-1)};
    A.ensure().scenarios.unshift({id:'SC-'+Date.now(),createdAt:new Date().toISOString(),inputs:opts,result});
    A.ensure().scenarios=A.ensure().scenarios.slice(0,50);
    if(typeof saveData==='function') saveData(STATE.data);
    return result;
  };

  A.commandPalette = function(){
    const q=prompt('APEX Command Palette — اكتب: project, risk, scenario, digital twin, approvals, search');
    if(!q)return;
    const s=q.toLowerCase();
    if(s.includes('scenario')||s.includes('محاك')) return setActive('apex9');
    if(s.includes('risk')||s.includes('خطر')) return setActive('risks');
    if(s.includes('twin')||s.includes('مسح')) return setActive('digitalTwin');
    if(s.includes('approval')||s.includes('مواف')) return setActive('users');
    if(s.includes('search')||s.includes('بحث')) return STATE.globalSearchOpen=true,renderApp();
    setActive('projects');
  };

  A.render = function(){
    A.ensure();
    const ps=a('projects'), sig=signals(), agents=A.ensure().agents;
    const scores=ps.map(p=>projectScore(p)), portfolio=Math.round(mean(scores));
    const risks=a('risks').filter(r=>!['closed','مغلق'].includes(String(r.status||'').toLowerCase()));
    const critical=risks.filter(r=>n(typeof riskScore==='function'?riskScore(r):r.score)>=15).length;
    const tasks=a('tasks'), overdue=tasks.filter(t=>typeof deriveTaskStatus==='function'&&deriveTaskStatus(t)==='متأخر').length;
    const resources=a('resources');
    const activeAgents=agents.filter(x=>x.active).length;
    return `<div class="apex9">
      <header class="a9-hero">
        <div><div class="a9-kicker">REALITY ENGINE • APEX 7 • PROJECT OPERATING SYSTEM</div>
        <h1>مركز ذكاء المشروع المؤسسي</h1>
        <p>منصة واحدة تربط القرار، الجدول، المال، المخاطر، الوثائق، الموارد والـDigital Twin مع طبقة أدلة قابلة للتدقيق.</p></div>
        <div class="a9-actions"><button class="a9-btn primary" onclick="APEX9.commandPalette()">⌘ Command</button>
        <button class="a9-btn" onclick="APEX9.runScenario()">🎲 Scenario</button></div>
      </header>

      <section class="a9-grid kpis">
        ${[['صحة المحفظة',portfolio+'%','Value health',portfolio>=80?'good':portfolio>=60?'warn':'bad'],
           ['مشاريع',ps.length,'Portfolio', ''],
           ['مخاطر حرجة',critical,'Risk exposure',critical?'bad':'good'],
           ['مهام متأخرة',overdue,'Execution pressure',overdue?'warn':'good'],
           ['AI Agents',activeAgents,'Advisory only','']].map(x=>`<article class="a9-card a9-kpi ${x[3]}"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></article>`).join('')}
      </section>

      <section class="a9-grid main">
        <article class="a9-card">
          <div class="a9-head"><div><h2>AI Action Radar</h2><small>اقتراحات قابلة للتفسير — لا اعتماد آلي للقرارات عالية الأثر</small></div><button class="a9-link" onclick="setActive('ai')">Copilot</button></div>
          <div class="a9-list">${sig.length?sig.map(x=>`<div class="a9-signal ${x.sev}"><div class="sig-dot"></div><div><b>${esc9(x.title)}</b><small>${esc9(x.project||'Portfolio')} · ${esc9(x.reason)}</small><p>${esc9(x.action)}</p></div></div>`).join(''):'<div class="a9-empty">لا توجد إشارات تستدعي التدخل.</div>'}</div>
        </article>

        <article class="a9-card">
          <div class="a9-head"><div><h2>Project Health Matrix</h2><small>ترتيب تلقائي حسب الحاجة للتدخل</small></div><button class="a9-link" onclick="setActive('projects')">فتح المشاريع</button></div>
          <div class="a9-table">${ps.slice().sort((p,q)=>projectScore(p)-projectScore(q)).slice(0,8).map(p=>{
            const s=projectScore(p); const c=s>=80?'good':s>=60?'warn':'bad';
            return `<div class="a9-row"><span>${esc9(p.name||p.code||p.id)}</span><div class="a9-progress"><i class="${c}" style="width:${s}%"></i></div><b>${s}%</b></div>`;
          }).join('')||'<div class="a9-empty">أضف مشاريع لبدء التحليل.</div>'}</div>
        </article>
      </section>

      <section class="a9-grid three">
        <article class="a9-card">
          <div class="a9-head"><div><h2>Probabilistic Forecast</h2><small>Monte Carlo — تاريخ احتمالي لا تاريخ قطعي</small></div></div>
          <div class="forecast"><div><b id="a9p50">—</b><span>P50</span></div><div><b id="a9p80">—</b><span>P80</span></div><div><b id="a9p90">—</b><span>P90</span></div></div>
          <button class="a9-btn full" onclick="APEX9.runScenario()">تشغيل 10,000 محاكاة</button>
        </article>

        <article class="a9-card">
          <div class="a9-head"><div><h2>AI Governance</h2><small>Agents تحت سياسة Human-in-the-loop</small></div></div>
          ${agents.map(g=>`<div class="agent"><span class="agent-led ${g.active?'on':''}"></span><b>${esc9(g.name)}</b><small>${esc9(g.scope)}</small><em>${g.mode==='advisory'?'ADVISORY':'CONTROLLED'}</em></div>`).join('')}
        </article>

        <article class="a9-card">
          <div class="a9-head"><div><h2>Digital Thread</h2><small>من الدليل إلى القرار</small></div></div>
          <div class="thread">${['Project','Schedule / EVM','Risk & Change','BIM / IFC','Reality Capture','Decision / Approval'].map((x,i)=>`<div><i>${i+1}</i><span>${x}</span></div>`).join('')}</div>
          <button class="a9-btn full" onclick="setActive('digitalTwin')">فتح Digital Twin</button>
        </article>
      </section>

      <section class="a9-card evidence">
        <div class="a9-head"><div><h2>Evidence Ledger</h2><small>كل قرار حرج يجب أن يكون قابلاً للرجوع إلى مصدره</small></div><button class="a9-link" onclick="setActive('auditLog')">Audit</button></div>
        <div class="evidence-grid">
          <div><b>${a('documents').length}</b><span>Documents</span></div>
          <div><b>${a('auditLog').length}</b><span>Audit events</span></div>
          <div><b>${a('changeOrders').length}</b><span>Changes</span></div>
          <div><b>${resources.length}</b><span>Resources</span></div>
        </div>
      </section>
    </div>`;
  };

  A.runScenario=function(){
    const r=A.simulate({optimistic:30,mostLikely:45,pessimistic:70,iterations:10000});
    setTimeout(()=>{const p50=document.getElementById('a9p50'),p80=document.getElementById('a9p80'),p90=document.getElementById('a9p90'); if(p50){p50.textContent=Math.round(r.p50)+'d';p80.textContent=Math.round(r.p80)+'d';p90.textContent=Math.round(r.p90)+'d';}},0);
    if(typeof toast==='function') toast(`Monte Carlo: P50 ${Math.round(r.p50)}d · P80 ${Math.round(r.p80)}d · P90 ${Math.round(r.p90)}d`);
  };

  function install(){
    if (!STATE.data) { setTimeout(install, 100); return; }
    A.ensure();
    if(window.VIEW_RENDERERS){
      VIEW_RENDERERS.apex9=A.render;
      if(!NAV_SECTIONS.some(s=>s.items?.some(i=>i.key==='apex9'))){
        NAV_SECTIONS.unshift({section:null,items:[{key:'apex9',label:'APEX Intelligence',ic:'◈'}]});
        ALL_KEYS.push('apex9');
        Object.keys(ROLE_CONFIG||{}).forEach(r=>ROLE_CONFIG[r].view=[...new Set([...(ROLE_CONFIG[r].view||[]),'apex9'])]);
      }
    }
    document.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();A.commandPalette();}
      if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='i'){e.preventDefault();setActive('apex9');}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));else setTimeout(install,0);
})();
