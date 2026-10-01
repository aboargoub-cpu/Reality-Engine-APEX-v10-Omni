
/* APEX v10 OMNI — mobile-first application shell */
(function(){
"use strict";
const V=window.APEX10={};
const q=()=>STATE.data.apex10||(STATE.data.apex10={mode:"home",capture:{step:1,projectId:"",points:[],sessionId:"",status:"ready"},aiOpen:false});
const save=()=>typeof saveData==="function"&&saveData(STATE.data);
const esc10=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const projects=()=>STATE.data.projects||[], tasks=()=>STATE.data.tasks||[], risks=()=>STATE.data.risks||[];
const isMobile=()=>matchMedia("(max-width: 760px)").matches;
V.nav=m=>{q().mode=m;save();V.render()};
V.captureStep=s=>{q().mode="capture";q().capture.step=s;save();V.render()};
V.project=id=>{q().capture.projectId=id;q().capture.step=2;q().mode="capture";save();V.render()};
V.setPoint=(id)=>{
 let p=q().capture.points.find(x=>x.id===id);
 if(!p){p={id,role:"CONTROL",x:0,y:0,z:0,found:false};q().capture.points.push(p)}
 const x=prompt(id+" — X الحقيقي بالمتر",p.x), y=x===null?null:prompt(id+" — Y الحقيقي بالمتر",p.y), z=y===null?null:prompt(id+" — Z الحقيقي بالمتر",p.z);
 if(x!==null&&y!==null&&z!==null){Object.assign(p,{x:+x,y:+y,z:+z});save();V.render()}
};
V.toggleAI=()=>{q().aiOpen=!q().aiOpen;V.render()};
V.launch=()=>{
 q().capture.sessionId="CAP-"+Date.now();q().capture.status="handoff";save();
 const url="https://app.reality-engine.local/capture?session="+encodeURIComponent(q().capture.sessionId);
 // Production: replace with the real HTTPS Universal Link domain.
 window.location.href=url;
 setTimeout(()=>{alert("لم يتم تثبيت تطبيق المسح بعد. في النسخة الإنتاجية سيؤدي هذا الرابط إلى تطبيق iPhone عبر Universal Link بعد موافقة iOS.");},700);
};
V.demoRecognize=()=>{
 const pts=q().capture.points.length?q().capture.points:[
  {id:"RCP-001",role:"ORIGIN",x:0,y:0,z:0,found:false},{id:"RCP-002",role:"CONTROL",x:5,y:0,z:0,found:false},
  {id:"RCP-003",role:"CONTROL",x:0,y:5,z:0,found:false},{id:"RCP-004",role:"CHECK",x:2,y:2,z:1,found:false}];
 q().capture.points=pts;pts.forEach((p,i)=>setTimeout(()=>{p.found=true;save();V.render()},300+i*500));
 q().capture.status="recognizing";save();V.render();
};
V.publish=()=>{q().capture.status="published";q().mode="twin";save();V.render()};
V.render=()=>{
 document.body.classList.add("apex10");
 const root=document.getElementById("app"); if(!root||!STATE.user){return}
 root.innerHTML=V.shell();
};
V.shell=()=>{
 const d=q(), m=d.mode, cap=d.capture, p=projects();
 const nav=[["home","الرئيسية","⌂"],["projects","المشاريع","▦"],["capture","المسح","⌁"],["twin","Digital Twin","◈"],["ai","AI","✦"]];
 return `<div class="a10-app">
 <header class="a10-top"><button class="a10-brand" onclick="APEX10.nav('home')"><span class="a10-logo">R</span><span><b>REALITY ENGINE</b><small>APEX • PROJECT OS</small></span></button>
 <div class="a10-top-actions"><button onclick="APEX10.toggleAI()" aria-label="AI">✦</button><button onclick="setActive('settings')" aria-label="Settings">⚙</button></div></header>
 <main class="a10-main">${m==="home"?V.home():m==="projects"?V.projects():m==="capture"?V.capture():m==="twin"?V.twin():V.ai()}</main>
 <nav class="a10-bottom">${nav.map(n=>`<button class="${m===n[0]?'active':''}" onclick="APEX10.nav('${n[0]}')"><i>${n[2]}</i><span>${n[1]}</span></button>`).join("")}</nav>
 ${d.aiOpen?V.aiSheet():""}</div>`;
};
V.home=()=>{
 const ps=projects(), ts=tasks(), rs=risks(), overdue=ts.filter(t=>typeof deriveTaskStatus==="function"&&deriveTaskStatus(t)==="متأخر").length;
 return `<section class="a10-wrap"><div class="a10-hello"><div><small>PROJECT COMMAND</small><h1>صباح الخير.</h1><p>كل ما يحتاج قراراً اليوم، في شاشة واحدة.</p></div><button class="a10-primary" onclick="APEX10.nav('capture')">＋ مسح جديد</button></div>
 <div class="a10-kpis"><article><span>المشاريع</span><b>${ps.length}</b><small>Active portfolio</small></article><article><span>المتأخر</span><b class="${overdue?'red':''}">${overdue}</b><small>Tasks requiring action</small></article><article><span>المخاطر</span><b class="${rs.length?'amber':''}">${rs.length}</b><small>Open risks</small></article></div>
 <div class="a10-section-head"><h2>Today</h2><button onclick="APEX10.nav('projects')">عرض الكل</button></div>
 <div class="a10-list">${ps.slice(0,5).map((x,i)=>`<button class="a10-card" onclick="APEX10.nav('projects')"><span class="status-dot ${i%3===0?'green':i%3===1?'amber':'blue'}"></span><div><b>${esc10(x.name||x.code||x.id)}</b><small>${esc10(x.status||"Active")} • Health ${75+i*4}%</small></div><strong>›</strong></button>`).join("")||'<div class="a10-empty">أضف أول مشروع للبدء.</div>'}</div>
 <div class="a10-ai-strip" onclick="APEX10.toggleAI()"><span>✦</span><div><b>APEX Intelligence</b><small>اسأل عن التأخير، التكلفة، المخاطر أو المسح.</small></div><strong>›</strong></div></section>`;
};
V.projects=()=>`<section class="a10-wrap"><div class="a10-title"><small>PORTFOLIO</small><h1>المشاريع</h1><button class="a10-primary">＋ مشروع</button></div><div class="a10-list">${projects().map((x,i)=>`<button class="a10-project" onclick="setActive('projectOverview')"><div class="a10-project-head"><b>${esc10(x.name||x.code||x.id)}</b><span>${esc10(x.status||"Active")}</span></div><div class="a10-progress"><i style="width:${55+i*8}%"></i></div><div class="a10-project-meta"><span>Progress ${55+i*8}%</span><span>Budget control</span><span>›</span></div></button>`).join("")||'<div class="a10-empty">لا توجد مشاريع.</div>'}</div></section>`;
V.capture=()=>{
 const c=q().capture,step=c.step||1, pts=c.points.length?c.points:[
 {id:"RCP-001",role:"ORIGIN",x:0,y:0,z:0,found:false},{id:"RCP-002",role:"CONTROL",x:5,y:0,z:0,found:false},
 {id:"RCP-003",role:"CONTROL",x:0,y:5,z:0,found:false},{id:"RCP-004",role:"CHECK",x:2,y:2,z:1,found:false}];
 c.points=pts;
 const labels=["المشروع","النقاط","الورقة","iPhone","التحقق"];
 return `<section class="a10-wrap capture"><div class="a10-title"><small>FIELD MODE</small><h1>المسح الميداني</h1><p>لا توجد إعدادات مخفية. نفّذ الخطوات بالترتيب.</p></div>
 <div class="a10-stepbar">${labels.map((x,i)=>`<button class="${step===i+1?'on':''} ${step>i+1?'done':''}" onclick="APEX10.captureStep(${i+1})"><b>${i+1}</b><span>${x}</span></button>`).join("")}</div>
 ${step===1?`<div class="a10-panel"><div class="a10-number">01</div><h2>اختر المشروع</h2><p>كل الملفات والنقاط والمسح ستُربط بهذا المشروع.</p><select id="a10-project"><option value="">اختر المشروع</option>${projects().map(p=>`<option value="${esc10(p.id)}">${esc10(p.name||p.code||p.id)}</option>`).join("")}</select><button class="a10-primary wide" onclick="APEX10.project(document.getElementById('a10-project').value)">التالي</button></div>`:""}
 ${step===2?`<div class="a10-panel"><div class="a10-number">02</div><h2>ضع 4 علامات في الموقع</h2><p><b>لا تقيس الورقة.</b> النظام يتعرف على مركز العلامة فقط. ضع العلامات حول منطقة المسح، وليست على خط واحد.</p><div class="site-map"><span class="zone"></span><button class="mappt m1">RCP-001</button><button class="mappt m2">RCP-002</button><button class="mappt m3">RCP-003</button><button class="mappt m4">RCP-004</button></div><div class="a10-points">${pts.map(p=>`<button class="${p.found?'found':''}" onclick="APEX10.setPoint('${p.id}')"><b>${p.id}</b><small>${p.role}</small><span>${p.x}, ${p.y}, ${p.z} m</span><em>${p.found?'✓ recognized':'Set XYZ'}</em></button>`).join("")}</div><div class="a10-tip"><b>RCP-001</b> = الأصل 0,0,0 (اختياري). <b>RCP-004</b> = CHECK؛ لا تستخدمه لحساب التحويل، بل للتحقق.</div><button class="a10-primary wide" onclick="APEX10.captureStep(3)">النقاط جاهزة</button></div>`:""}
 ${step===3?`<div class="a10-panel"><div class="a10-number">03</div><h2>اطبع ورقة المرجعية</h2><p>هذه الورقة هي الشيء الذي سيبحث عنه iPhone أثناء المسح.</p><div class="target-live"><div class="cross-big"></div><b>RCP CENTER</b><small>مركز التقاطع = XYZ</small></div><div class="spec-grid"><span>A4<br><b>210×297 mm</b></span><span>Print<br><b>100%</b></span><span>Surface<br><b>Matte</b></span><span>Mount<br><b>Rigid</b></span></div><button class="a10-secondary wide" onclick="APEX9U.downloadTarget()">⬇ تحميل ورقة RCP</button><button class="a10-primary wide" onclick="APEX10.captureStep(4)">ثبتها وابدأ</button></div>`:""}
 ${step===4?`<div class="a10-panel"><div class="a10-number">04</div><h2>الآن افتح تطبيق المسح</h2><div class="phone-flow"><div class="phone-ui"><span>LI DAR</span><div class="scan-ring"></div><b>READY</b></div><div><h3>ماذا تفعل داخل التطبيق؟</h3><ol><li>اسمح للكاميرا وLiDAR.</li><li>وجّه الهاتف إلى RCP-001 حتى يظهر <b>✓</b>.</li><li>مرّر على RCP-002 ثم RCP-003 ثم RCP-004.</li><li>بعد التعرف على الأربع، امسح المكان كله.</li><li>اضغط Finish وأرسل الملف للنظام.</li></ol></div></div><div class="a10-recognizer"><div><span class="rec-dot"></span><b>RCP recognition</b><small>${pts.filter(p=>p.found).length}/4 detected</small></div><button class="a10-secondary" onclick="APEX10.demoRecognize()">محاكاة التعرف</button></div><button class="a10-primary wide" onclick="APEX10.launch()">📱 فتح تطبيق المسح</button><button class="a10-secondary wide" onclick="APEX10.captureStep(5)">لدي ملف المسح بالفعل</button></div>`:""}
 ${step===5?`<div class="a10-panel"><div class="a10-number">05</div><h2>فحص الجودة قبل Digital Twin</h2><div class="checks">${[["4 Control Points","PASS"],["Scale","CALCULATED"],["Rotation / Translation","CALCULATED"],["RCP-004 Check","PENDING"],["Human approval","REQUIRED"]].map((x,i)=>`<div><span>${x[0]}</span><b class="${i===3?'amber':'green'}">${x[1]}</b></div>`).join("")}</div><div class="a10-tip"><b>قاعدة النشر:</b> النظام يحسب Scale + Rotation + Translation، يرفض الشذوذ، ثم يقارن RCP-004 المستقلة. إذا تجاوز الخطأ الحد المسموح، يعود للمستخدم ويطلب إعادة التقاط النقطة.</div><button class="a10-primary wide" onclick="APEX10.publish()">فتح Digital Twin</button></div>`:""}</section>`;
};
V.twin=()=>`<section class="a10-wrap"><div class="a10-title"><small>DIGITAL TWIN</small><h1>التوأم الرقمي</h1><p>نسخة الواقع مع طبقة التقدم، الجودة، المخاطر والأصول.</p></div><div class="twin10"><div class="twin-view"><div class="twin-grid"></div><span class="twin-tag">LIVE / VERIFIED</span><div class="twin-axis">X<br>Y<br>Z</div></div><div class="twin-cards"><article><small>Alignment</small><b>Verified</b><span>Independent check passed</span></article><article><small>Reality Revision</small><b>RCP-004</b><span>Latest field capture</span></article><article><small>AI Insight</small><b>3 anomalies</b><span>Tap to review evidence</span></article></div><button class="a10-primary wide" onclick="APEX10.toggleAI()">✦ Analyze Twin with AI</button></div></section>`;
V.ai=()=>`<section class="a10-wrap"><div class="a10-title"><small>APEX INTELLIGENCE</small><h1>ذكاء المشروع</h1><p>ذكاء متعدد الوكلاء، لكن كل قرار حساس يبقى تحت مسؤولية الإنسان.</p></div><div class="ai-grid10">${[["Schedule Agent","يكتشف المسار الحرج والتأخيرات قبل حدوثها."],["Cost Agent","يتنبأ بالانحراف ويدقق EAC / ETC."],["Risk Agent","يربط المخاطر بالأحداث والقرارات والأدلة."],["Reality Agent","يفحص Point Cloud والتغيرات المكانية."],["Document Agent","يستخرج المعرفة من العقود والمراسلات."],["Decision Agent","يحول البيانات إلى خيارات قرار قابلة للتدقيق."]].map(x=>`<article><span>✦</span><b>${x[0]}</b><p>${x[1]}</p><button>Open</button></article>`).join("")}</div><div class="future10"><b>Future Lab — hidden by default</b><span>Edge AI • predictive twin • generative schedule • multimodal search • autonomous field QA • knowledge graph</span></div></section>`;
V.aiSheet=()=>`<div class="a10-sheet"><div class="sheet-head"><b>APEX Copilot</b><button onclick="APEX10.toggleAI()">×</button></div><div class="sheet-msg">اسأل مثلاً: «لماذا المشروع متأخر؟» أو «ما المخاطر التي قد تؤثر على تاريخ التسليم؟» أو «ابدأ مسح غرفة جديدة».</div><div class="sheet-actions"><button>تحليل التأخير</button><button>فحص المخاطر</button><button>تحليل Digital Twin</button><button>ابدأ مسح</button></div><div class="sheet-input"><input placeholder="اكتب سؤالك…"><button>↑</button></div></div>`;
window.VIEW_RENDERERS=window.VIEW_RENDERERS||{};
V.render();
})();
