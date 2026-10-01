/* APEX v12 Mobile-First Shell — iPhone/iPad/Windows adaptive */
(()=>{"use strict";
const A11=window.APEX11||{};
const state=()=>STATE.data.apex12||(STATE.data.apex12={view:"home",captureStep:1,projectId:"",scannerReady:false,points:[
{id:"RCP-001",role:"ORIGIN",xyz:[0,0,0],found:false},{id:"RCP-002",role:"CONTROL",xyz:[5,0,0],found:false},
{id:"RCP-003",role:"CONTROL",xyz:[0,5,0],found:false},{id:"RCP-004",role:"CHECK",xyz:[2,2,1],found:false}]});
const projects=()=>STATE.data.projects||[];
const role=()=>String(STATE.user?.role||"").trim();
const apexCommanderAllowed=()=>["مدير عام","مالك الشركة","مدير PMO","Executive","APEX Commander"].includes(role());
const escx=v=>typeof esc==="function"?esc(v==null?"":String(v)):String(v??"");
const save=()=>typeof saveData==="function"&&saveData(STATE.data);
const go=v=>{state().view=v;save();render()};
const step=n=>{state().captureStep=n;state().view="capture";save();render()};
const setProject=id=>{state().projectId=id;step(2)};
const launchScanner=async()=>{
  try{
    if(!window.isSecureContext) throw new Error("يجب تشغيل النظام عبر HTTPS لطلب صلاحية الكاميرا.");
    if(!navigator.mediaDevices?.getUserMedia) throw new Error("المتصفح لا يدعم الوصول إلى الكاميرا.");
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}}});
    stream.getTracks().forEach(t=>t.stop());
    state().scannerReady=true; save();
    const payload=new URLSearchParams({projectId:state().projectId||"",captureSessionId:"cap-"+Date.now(),requestedControlPointIds:state().points.map(p=>p.id).join(","),returnURL:location.origin+location.pathname+"?captureReturn=1"});
    const universal=`https://capture.reality-engine.local/launch?${payload}`;
    const scheme=`realityengine://capture?${payload}`;
    const ios= /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if(ios){
      location.href=scheme;
      setTimeout(()=>{ if(document.visibilityState==="visible") location.href=universal; },900);
    }else{
      alert("تم منح صلاحية الكاميرا. افتح تطبيق Reality Capture على جهاز iPhone/iPad لإكمال LiDAR ثم أعد حزمة المسح إلى النظام.");
    }
  }catch(e){alert(e.message||"تعذر فتح الكاميرا.")}
};
const xyz=id=>{const p=state().points.find(x=>x.id===id);if(!p)return;let v=["X","Y","Z"].map((a,i)=>prompt(`${a} الحقيقي بالمتر`,p.xyz[i]));if(v.some(x=>x===null))return;p.xyz=v.map(Number);p.found=true;save();render()};
const recognize=()=>{state().points.forEach(p=>p.found=true);save();render()};
const rcpReady=()=>state().points.filter(p=>p.found).length>=4;

function header(){return `<header class="m12-header">
<button class="m12-brand" onclick="APEX12.go('home')" aria-label="الرئيسية"><span class="m12-mark">R</span><span><b>REALITY ENGINE</b><small>APEX PROJECT OS</small></span></button>
<div class="m12-actions"><button class="m12-icon" onclick="setActive('notifications')" aria-label="الإشعارات">●</button>${apexCommanderAllowed()?`<button class="m12-apex" onclick="setActive('apex')">APEX</button>`:""}<button class="m12-icon" onclick="setActive('settings')" aria-label="الإعدادات">⚙</button></div>
</header>`}
const nav=[["home","الرئيسية","⌂"],["projects","المشاريع","▦"],["twin","التوأم","◈"],["capture","المسح","⌁"]];
function bottom(){return `<nav class="m12-bottom" aria-label="التنقل الرئيسي">${nav.map(n=>`<button class="${state().view===n[0]?'sel':''}" onclick="APEX12.go('${n[0]}')"><i>${n[2]}</i><span>${n[1]}</span></button>`).join("")}</nav>`}
function page(inner){return `<main class="m12-main"><div class="m12-page">${inner}</div></main>`}
function home(){const ps=projects();return page(`<section class="m12-hero"><div><small>COMMAND CENTER</small><h1>لوحة التحكم</h1><p>قرارات اليوم، بدون ازدحام.</p></div><button class="m12-primary" onclick="APEX12.go('capture')">＋ مسح جديد</button></section>
<section class="m12-metrics"><article><small>المشاريع النشطة</small><b>${ps.length}</b></article><article><small>تقدم المحفظة</small><b>78%</b></article><article><small>تحتاج قرار</small><b>06</b></article></section>
<section class="m12-card"><div class="m12-cardhead"><h2>المشاريع</h2><button onclick="APEX12.go('projects')">عرض الكل</button></div>${ps.slice(0,5).map((p,i)=>`<button class="m12-row" onclick="setActive('projects');setProjectFilter('${escx(p.id||"all")}')"><span class="m12-dot"></span><span><b>${escx(p.name||p.code||p.id)}</b><small>${escx(p.status||"Active")} · ${62+i*7}%</small></span><strong>›</strong></button>`).join("")||`<div class="m12-empty">لا توجد مشاريع.</div>`}</section>`) }
function projectsView(){return page(`<section class="m12-hero"><div><small>PORTFOLIO</small><h1>المشاريع</h1><p>مساحة عمل محسنة للمس والقراءة السريعة.</p></div></section><section class="m12-projectgrid">${projects().map((p,i)=>`<article class="m12-project"><div><b>${escx(p.name||p.code||p.id)}</b><small>${escx(p.status||"Active")}</small></div><div class="m12-bar"><i style="width:${Math.min(100,60+i*8)}%"></i></div><div class="m12-projectfoot"><span>${Math.min(100,60+i*8)}%</span><span>Budget · Schedule · Risk</span></div></article>`).join("")||`<div class="m12-card">أنشئ مشروعك الأول.</div>`}</section>`) }
function capture(){const g=state(),s=g.captureStep,labels=["المشروع","النقاط","RCP","iPhone","اعتماد"];return page(`<section class="m12-hero"><div><small>FIELD WORKFLOW · RCP</small><h1>المسح الميداني</h1><p>Workflow واضح للمراجع: مشروع → نقاط → ورقة RCP → Capture → QA.</p></div></section>
<div class="m12-steps">${labels.map((x,i)=>`<button class="${s===i+1?'active':''} ${s>i+1?'done':''}" onclick="APEX12.step(${i+1})"><b>${i+1}</b><span>${x}</span></button>`).join("")}</div>
${s===1?`<section class="m12-focus"><small>STEP 01</small><h2>اختر المشروع</h2><select id="m12project"><option value="">اختر مشروعاً</option>${projects().map(p=>`<option value="${escx(p.id)}">${escx(p.name||p.code||p.id)}</option>`).join("")}</select><button class="m12-primary full" onclick="APEX12.setProject(document.getElementById('m12project').value)">التالي</button></section>`:""}
${s===2?`<section class="m12-focus"><small>STEP 02</small><h2>ثبت 4 نقاط مرجعية</h2><p>ثلاث نقاط للمعايرة ونقطة RCP-004 للتحقق المستقل. وزّعها حول منطقة المسح.</p><div class="m12-rcp">${g.points.map(p=>`<button onclick="APEX12.xyz('${p.id}')"><span><b>${p.id}</b><small>${p.role}</small></span><span>${p.xyz.join(", ")} m</span><strong>${p.found?"✓":"تحديد"}</strong></button>`).join("")}</div><div class="m12-note">لا تعتمد النشر النهائي بدون نقطة تحقق مستقلة.</div><button class="m12-primary full" onclick="APEX12.step(3)">تم تحديد النقاط</button></section>`:""}
${s===3?`<section class="m12-focus"><small>STEP 03</small><h2>ورقة RCP</h2><p>اطبع A4 بنسبة 100%، وثبّت الورقة على سطح مستوٍ وصلب. مركز التقاطع هو نقطة التحكم.</p><div class="m12-target"><span></span><b>RCP CENTER</b></div><div class="m12-specs"><span>A4<br><b>210×297 mm</b></span><span>Scale<br><b>100%</b></span><span>Mount<br><b>Rigid</b></span></div><button class="m12-secondary full" onclick="A11.downloadTarget?.()">⬇ ورقة RCP</button><button class="m12-primary full" onclick="APEX12.step(4)">ثبتها وابدأ</button></section>`:""}
${s===4?`<section class="m12-focus"><small>STEP 04</small><h2>افتح Reality Capture</h2><p>سيطلب النظام صلاحية الكاميرا أولاً. على iPhone/iPad يتم تسليم الجلسة للتطبيق الأصلي عبر Universal Link / URL Scheme، ثم تعاد حزمة المسح مع سلامة الملف.</p><div class="m12-phone"><div class="m12-ring"></div><b>RCP ${Math.min(4,g.points.filter(p=>p.found).length+1)} / 4</b><span>وجّه LiDAR والكاميرا إلى علامة التحكم</span></div><div class="m12-check"><span>${g.points.filter(p=>p.found).length}/4 نقاط معروفة</span><button class="m12-secondary" onclick="APEX12.recognize()">محاكاة التعرف</button></div><button class="m12-primary full" onclick="APEX12.launchScanner()">📱 طلب صلاحية وفتح تطبيق المسح</button><button class="m12-secondary full" onclick="APEX12.step(5)">لدي ملف المسح</button></section>`:""}
${s===5?`<section class="m12-focus"><small>STEP 05</small><h2>RCP Quality Gate</h2><div class="m12-quality">${["4 RCP observations","Scale / units","Rotation + translation","RCP-004 independent check","Human approval"].map((x,i)=>`<div><span>${x}</span><b>${i<3&&rcpReady()?"PASS":i===3?"CHECK":"REQUIRED"}</b></div>`).join("")}</div><p class="m12-note">النشر إلى Digital Twin متاح بعد اجتياز نقاط التحكم، فحص التحقق المستقل، وموافقة المراجع RCP.</p><button class="m12-primary full" onclick="APEX12.go('twin')">فتح Digital Twin</button></section>`:""}</div>`)}
function twin(){return page(`<section class="m12-hero"><div><small>REALITY MODEL</small><h1>Digital Twin</h1><p>الواقع الملتقط ومحاذاته الموثقة في شاشة مناسبة للهاتف.</p></div></section><div class="m12-twin"><section class="m12-canvas"><div class="m12-grid"></div><span>VERIFIED REVISION</span><em>X · Y · Z</em></section><section class="m12-twinstats"><article><small>ALIGNMENT</small><b>Verified</b><span>Independent check</span></article><article><small>REVISION</small><b>Reality-014</b><span>Latest capture</span></article><article><small>AI FINDINGS</small><b>3 anomalies</b><span>Evidence available</span></article></section></div>`)}
function render(){document.body.classList.add("apex12");const root=document.getElementById("app");if(!root||!STATE.user)return;const v=state().view;root.innerHTML=`<div class="m12-app">${header()}${v==="home"?home():v==="projects"?projectsView():v==="capture"?capture():twin()}${bottom()}</div>`}
A11.go=go; A11.step=step; A11.xyz=xyz; A11.recognize=recognize; A11.setProject=setProject; A11.launchScanner=launchScanner; A11.apexCommanderAllowed=apexCommanderAllowed;
window.APEX12={go,step,xyz,recognize,setProject,launchScanner,apexCommanderAllowed,render}; render();
})();