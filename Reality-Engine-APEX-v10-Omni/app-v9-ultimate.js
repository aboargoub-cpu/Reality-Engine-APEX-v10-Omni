/* Reality Engine APEX v9 Ultimate — Clean shell, role modes, capture-first Digital Twin */
(function(){
'use strict';
const U=window.APEX9U={};
const D=()=>STATE.data.ultimate9||(STATE.data.ultimate9={mode:'executive',theme:'light',capture:{step:1,points:4,template:'A4'}});
const save=()=>typeof saveData==='function'&&saveData(STATE.data);
const esc9=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const projects=()=>Array.isArray(STATE.data.projects)?STATE.data.projects:[];
const tasks=()=>Array.isArray(STATE.data.tasks)?STATE.data.tasks:[];
const risks=()=>Array.isArray(STATE.data.risks)?STATE.data.risks:[];
const docs=()=>Array.isArray(STATE.data.documents)?STATE.data.documents:[];

U.setMode=m=>{D().mode=m;save();renderApp()};
U.setTheme=t=>{D().theme=t;document.documentElement.dataset.apexTheme=t;save();renderApp()};
U.captureStep=s=>{D().capture.step=s;save();renderApp()};
U.openCapture=()=>{D().mode='field';D().capture.step=1;save();renderApp()};
U.launchIOS=()=>{
  const projectId=D().capture.projectId||'';
  const url=D().capture.universalLink||('realityengine://capture?project='+encodeURIComponent(projectId));
  window.location.href=url;
  setTimeout(()=>typeof toast==='function'&&toast('إذا لم يفتح التطبيق، استخدم زر فتح تطبيق المسح. يتطلب iOS Universal Link أو Custom URL Scheme.'));
};
U.downloadTarget=()=>{
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">
 <rect width="210" height="297" fill="#fff"/><rect x="7" y="7" width="196" height="283" fill="none" stroke="#111" stroke-width=".6"/>
 <text x="105" y="25" text-anchor="middle" font-family="Arial" font-size="6" font-weight="700">REALITY ENGINE — RCP CONTROL TARGET</text>
 <text x="105" y="33" text-anchor="middle" font-family="Arial" font-size="3.5">PRINT AT 100% • REFERENCE POINT = CROSSHAIR CENTER</text>
 <circle cx="105" cy="145" r="32" fill="none" stroke="#111" stroke-width="1"/><circle cx="105" cy="145" r="4" fill="none" stroke="#111" stroke-width="1"/>
 <path d="M68 145h74M105 108v74" stroke="#111" stroke-width="1"/>
 <text x="105" y="190" text-anchor="middle" font-family="Arial" font-size="4.5" font-weight="700">RCP CENTER</text>
 <text x="15" y="275" font-family="Arial" font-size="3.5">RCP ID: ____________________</text>
 <text x="15" y="282" font-family="Arial" font-size="3">A4 210×297 mm • Matte recommended • Mount flat and rigid</text></svg>`;
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));a.download='APEX_RCP_Control_Target_A4.svg';a.click();
};
U.selectProject=id=>{D().capture.projectId=id;D().capture.step=2;save();renderApp()};
U.setPoint=(i,role)=>{
 const p=D().capture['p'+i]||{role,x:0,y:0,z:0}; 
 const x=prompt(`RCP-${String(i).padStart(3,'0')} — X الحقيقي بالمتر`,p.x); if(x===null)return;
 const y=prompt('Y الحقيقي بالمتر',p.y); if(y===null)return;
 const z=prompt('Z الحقيقي بالمتر',p.z); if(z===null)return;
 D().capture['p'+i]={role,x:Number(x),y:Number(y),z:Number(z)};save();renderApp();
};
U.createSession=()=>{D().capture.sessionId='CAP-'+Date.now();D().capture.step=4;save();renderApp()};
U.finish=()=>{D().capture.step=5;save();renderApp()};
U.render=()=>{
 const d=D(),mode=d.mode||'executive', p=projects(), t=tasks(), r=risks(), dc=docs();
 if(mode==='field') return U.field();
 const health=p.length?Math.round(p.reduce((s,x)=>s+(typeof computeProjectHealth==='function'?computeProjectHealth(x):75),0)/p.length):0;
 const overdue=t.filter(x=>typeof deriveTaskStatus==='function'&&deriveTaskStatus(x)==='متأخر').length;
 const high=r.filter(x=>Number(x.score||x.riskScore||0)>=15).length;
 return `<div class="u9">
  <header class="u9bar"><div class="brand9"><div class="mark9">A</div><div><b>APEX</b><span>Reality Engine</span></div></div>
   <nav class="modes9">${[['executive','Executive'],['project','Project'],['field','Field'],['twin','Digital Twin']].map(([k,l])=>`<button class="${mode===k?'on':''}" onclick="APEX9U.setMode('${k}')">${l}</button>`).join('')}</nav>
   <div class="bar-actions"><button onclick="APEX9U.openCapture()">＋ New Capture</button><button onclick="APEX9U.setTheme(document.documentElement.dataset.apexTheme==='dark'?'light':'dark')">◐</button></div>
  </header>
  ${mode==='project'?U.project():mode==='twin'?U.twin():`
  <section class="hero9"><div><div class="cap9">EXECUTIVE CONTROL</div><h1>Project command, without the noise.</h1><p>كل قرار مهم في مكان واحد — الحالة، المخاطر، المال، التنفيذ، والأدلة.</p></div><button class="heroBtn9" onclick="APEX9U.openCapture()">ابدأ Reality Capture</button></section>
  <section class="kpi9">${[['Portfolio Health',health+'%',health>=80?'ok':'warn'],['Projects',p.length,'' ],['Overdue Tasks',overdue,overdue?'bad':'ok'],['High Risks',high,high?'bad':'ok']].map(x=>`<article><span>${x[0]}</span><b class="${x[2]}">${x[1]}</b></article>`).join('')}</section>
  <section class="grid9"><article class="panel9"><div class="ph9"><h2>What needs attention</h2><span>AI-assisted</span></div>
   ${p.slice(0,6).map(x=>`<div class="line9"><div><b>${esc9(x.name||x.code||x.id)}</b><small>Project health & execution</small></div><button onclick="APEX9U.setMode('project')">Open</button></div>`).join('')||'<div class="empty9">No active projects yet.</div>'}
  </article>
  <article class="panel9"><div class="ph9"><h2>Reality Capture</h2><span>Field-first</span></div>
   <div class="captureCard9"><div class="captureIcon9">⌁</div><div><b>Capture → Calibrate → Twin</b><p>4 control points, printable target, iPhone handoff and independent check.</p><button onclick="APEX9U.openCapture()">Start guided capture</button></div></div>
   <div class="mini9"><b>${dc.length}</b><span>documents</span><b>${r.length}</b><span>risks</span></div>
  </article></section>`}
 </div>`;
};
U.project=()=>`<div class="u9"><section class="hero9 compact"><div><div class="cap9">PROJECT MODE</div><h1>Execution cockpit</h1><p>الجدول، EVM، المخاطر والتغييرات دون تشتيت.</p></div></section>
<section class="grid9"><article class="panel9"><div class="ph9"><h2>Projects</h2></div>${projects().map(p=>`<div class="line9"><div><b>${esc9(p.name||p.code||p.id)}</b><small>${esc9(p.status||'Active')}</small></div><button onclick="setActive('projects')">Manage</button></div>`).join('')}</article>
<article class="panel9"><div class="ph9"><h2>Decision rule</h2></div><div class="rule9">AI recommends → evidence supports → accountable person approves.</div></article></section></div>`;
U.twin=()=>`<div class="u9"><section class="hero9 compact"><div><div class="cap9">DIGITAL TWIN</div><h1>Reality, BIM and progress in one view.</h1><p>لا توجد إعدادات مخفية: التقط، عاير، تحقق، ثم انشر.</p></div><button class="heroBtn9" onclick="APEX9U.openCapture()">New capture</button></section>
<section class="twin9"><div class="twinCanvas9"><div class="wire9"></div><div class="point p1"></div><div class="point p2"></div><div class="point p3"></div><div class="point p4"></div><div class="twinLabel9">SCAN SPACE</div></div><aside><h3>Quality Gate</h3><div class="q9"><span>Control points</span><b>4+</b></div><div class="q9"><span>Transform</span><b>7-parameter</b></div><div class="q9"><span>Independent check</span><b>Required</b></div><div class="q9"><span>Publish</span><b>Human approval</b></div></aside></section></div>`;
U.field=()=>{
 const c=D().capture,step=c.step||1,ps=projects();
 const labels=['Project','Control Points','Target','iPhone Scan','Verify'];
 const points=[1,2,3,4];
 return `<div class="u9 field9"><section class="hero9 compact"><div><div class="cap9">FIELD MODE • ${step}/5</div><h1>iPhone Reality Capture</h1><p>اتبع الخطوات فقط. النظام يتولى الإعدادات التقنية.</p></div><button class="soft9" onclick="APEX9U.setMode('executive')">Exit</button></section>
 <div class="steps9">${labels.map((x,i)=>`<button class="${step===i+1?'on':''} ${step>i+1?'done':''}" onclick="APEX9U.captureStep(${i+1})"><b>${i+1}</b>${x}</button>`).join('')}</div>
 ${step===1?`<article class="wizard9"><h2>اختر المشروع</h2><p>المسح سيُحفظ مباشرة تحت هذا المشروع.</p><select id="u9proj"><option value="">Select project</option>${ps.map(p=>`<option value="${esc9(p.id)}">${esc9(p.name||p.code||p.id)}</option>`).join('')}</select><button class="heroBtn9" onclick="APEX9U.selectProject(document.getElementById('u9proj').value)">Continue</button></article>`:''}
 ${step===2?`<article class="wizard9"><h2>ضع 4 نقاط تحكم</h2><p>وزّعها حول منطقة المسح. لا تضعها على خط واحد. <b>مركز كل علامة هو النقطة.</b></p><div class="points9">${points.map(i=>{let q=c['p'+i]||{role:i===1?'ORIGIN':i===4?'CHECK':'CONTROL',x:i===2?5:0,y:i===3?5:0,z:i===4?1:0};return `<div><b>RCP-${String(i).padStart(3,'0')}</b><small>${q.role}</small><span>${q.x}, ${q.y}, ${q.z} m</span><button onclick="APEX9U.setPoint(${i},'${q.role}')">Set XYZ</button></div>`}).join('')}</div><div class="tip9"><b>أفضل توزيع:</b> ضع النقاط في أطراف الغرفة/المنطقة، واجعل نقطة CHECK بعيدة عن نقاط المعايرة.</div><button class="heroBtn9" onclick="APEX9U.captureStep(3)">Continue</button></article>`:''}
 ${step===3?`<article class="wizard9"><h2>اطبع Reference Target</h2><div class="target9"><div class="paper9"><div class="cross9"></div><span>RCP CENTER</span></div><div><h3>A4 — 210 × 297 mm</h3><ul><li>Print at 100%</li><li>Do not fit to page</li><li>Matte lamination recommended</li><li>Mount flat on rigid surface</li><li>Reference = exact crosshair center</li></ul><button class="heroBtn9" onclick="APEX9U.downloadTarget()">Download target</button><button class="soft9" onclick="APEX9U.captureStep(4)">Target ready</button></div></div></article>`:''}
 ${step===4?`<article class="wizard9"><h2>افتح المسح على iPhone</h2><p>اضغط مرة واحدة. إذا كان تطبيق المسح مرتبطاً بـUniversal Link سيفتح مباشرة بعد موافقة iOS.</p><div class="launch9"><div class="iphone9">LiDAR<br><b>READY</b></div><div><b>Session: ${esc9(c.sessionId||'not created')}</b><p>امسح كل RCP من عدة زوايا، ثم أكمل المسح بشكل طبيعي.</p><button class="heroBtn9" onclick="APEX9U.launchIOS()">Open scanning app</button><button class="soft9" onclick="APEX9U.createSession()">I already have the scan</button></div></div></article>`:''}
 ${step===5?`<article class="wizard9"><h2>تحقق قبل النشر</h2><div class="quality9">${[['Control points','4+','ok'],['Scale / Rotation / Translation','Ready','ok'],['Independent Check','Required','warn'],['Publish','Human approval','ok']].map(x=>`<div><span>${x[0]}</span><b class="${x[2]}">${x[1]}</b></div>`).join('')}</div><div class="tip9">النظام يحسب التحويل، يرفض النقاط الشاذة، ويفحص نقطة CHECK قبل السماح بالنشر إلى Digital Twin.</div><button class="heroBtn9" onclick="APEX9U.setMode('twin')">Open Digital Twin</button></article>`:''}
 </div>`;
};
if(window.VIEW_RENDERERS) VIEW_RENDERERS.ultimate9=U.render;
window.setTimeout(()=>{if(window.NAV_SECTIONS&&!NAV_SECTIONS.some(s=>s.items?.some(i=>i.key==='ultimate9'))){NAV_SECTIONS.unshift({section:null,items:[{key:'ultimate9',label:'APEX Home',ic:'A'}]});ALL_KEYS.push('ultimate9')} if(window.STATE){STATE.data.ultimate9=STATE.data.ultimate9||{mode:'executive',theme:'light',capture:{step:1,points:4}};document.documentElement.dataset.apexTheme=STATE.data.ultimate9.theme||'light';}},0);
})();
