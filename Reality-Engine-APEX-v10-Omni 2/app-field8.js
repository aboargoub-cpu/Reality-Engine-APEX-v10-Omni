/* APEX v8 — Field-first Reality Capture */
(function(){
  const F=window.FIELD_CAPTURE={};
  const esc8=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const d=()=>{STATE.data.fieldCapture=STATE.data.fieldCapture||{};return STATE.data.fieldCapture};
  const save=()=>typeof saveData==='function'&&saveData(STATE.data);
  F.start=()=>{d().step=1;setActive('fieldCapture')};
  F.next=()=>{d().step=Math.min(5,(d().step||1)+1);save();renderApp()};
  F.back=()=>{d().step=Math.max(1,(d().step||1)-1);save();renderApp()};
  F.openScanner=()=>{
    // iOS cannot silently launch another app; use universal-link/custom-URL when configured.
    const url=d().captureURL||'realityengine://capture?project='+(encodeURIComponent(d().projectId||''));
    window.location.href=url;
    setTimeout(()=>{ if(typeof toast==='function') toast('إذا لم يفتح تطبيق المسح، اضغط "فتح تطبيق المسح" أو ثبّت رابط Universal Link.'); },900);
  };
  F.makeTemplate=()=>{
    const w=1200,h=900,svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="100%" height="100%" fill="white"/>
      <g fill="none" stroke="black" stroke-width="4"><rect x="30" y="30" width="1140" height="840"/></g>
      <g font-family="Arial" fill="black"><text x="600" y="100" text-anchor="middle" font-size="34" font-weight="700">REALITY ENGINE — CONTROL TARGET</text>
      <text x="600" y="145" text-anchor="middle" font-size="20">PRINT AT 100% — DO NOT SCALE</text>
      <text x="120" y="800" font-size="22">RCP ID: __________________</text>
      <text x="120" y="840" font-size="18">Sheet size: A4 recommended • Laminate flat • Keep target plane rigid</text></g>
      <g stroke="black" stroke-width="5" fill="none"><circle cx="600" cy="450" r="115"/><circle cx="600" cy="450" r="18"/><path d="M455 450h290M600 305v290"/></g>
      <g fill="black"><circle cx="600" cy="450" r="6"/></g>
      <text x="600" y="620" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700">REFERENCE CENTER = CROSSHAIR CENTER</text>
    </svg>`;
    const blob=new Blob([svg],{type:'image/svg+xml'}), a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='RealityEngine_Control_Target_A4.svg';a.click();
    if(typeof toast==='function')toast('تم إنشاء ملف Target جاهز للطباعة بنسبة 100%.');
  };
  F.saveProject=(id)=>{d().projectId=id;d().step=2;save();renderApp()};
  F.setURL=(v)=>{d().captureURL=v;save()};
  F.setCP=(id,role)=>{
    d().points=d().points||[];
    let p=d().points.find(x=>x.id===id); if(!p){p={id,role,x:0,y:0,z:0};d().points.push(p)}
    p.role=role;p.x=Number(prompt('X الحقيقي بالمتر',p.x||0));p.y=Number(prompt('Y الحقيقي بالمتر',p.y||0));p.z=Number(prompt('Z الحقيقي بالمتر',p.z||0));save();renderApp();
  };
  F.render=()=>{
    const s=d(),step=s.step||1, ps=Array.isArray(STATE.data.projects)?STATE.data.projects:[];
    const points=s.points||[
      {id:'RCP-001',role:'ORIGIN',x:0,y:0,z:0},
      {id:'RCP-002',role:'X-AXIS',x:5,y:0,z:0},
      {id:'RCP-003',role:'Y-AXIS',x:0,y:5,z:0},
      {id:'RCP-004',role:'CHECK',x:2,y:2,z:1}
    ];
    const steps=['المشروع','نقاط التحكم','ملف الهدف','المسح','المعايرة'];
    return `<div class="field8">
      <div class="field8-top"><div><div class="eyebrow8">REALITY CAPTURE • FIELD MODE</div><h1>مسح iPhone — خطوة بخطوة</h1><p>مسار واحد فقط: جهّز النقاط → اطبع الهدف → امسح → عاير → انشر إلى Digital Twin.</p></div>
      <button class="soft8" onclick="setActive('apex9')">← مركز APEX</button></div>
      <div class="stepper8">${steps.map((x,i)=>`<div class="${step===i+1?'active':''} ${step>i+1?'done':''}"><b>${i+1}</b><span>${x}</span></div>`).join('')}</div>
      ${step===1?`<section class="wizard8"><h2>1. اختر المشروع</h2><p>اختر المشروع الذي سيستقبل المسح. لا تحتاج إلى معرفة أي إعدادات تقنية.</p><select id="fc-project"><option value="">اختر المشروع</option>${ps.map(p=>`<option value="${esc8(p.id)}">${esc8(p.name||p.code||p.id)}</option>`).join('')}</select><button class="primary8" onclick="F.saveProject(document.getElementById('fc-project').value)">متابعة</button></section>`:''}
      ${step===2?`<section class="wizard8"><h2>2. ضع نقاط التحكم</h2><p>استخدم 4 نقاط على الأقل. ضعها في أماكن متباعدة، ولا تضعها على خط واحد. ثبّت كل ورقة على سطح مستوٍ وصلب.</p>
        <div class="target-diagram"><div class="wall">RCP-002 <span></span><i></i> RCP-003</div><div class="origin">RCP-001<br><b>0,0,0</b></div><div class="check">RCP-004<br><b>CHECK</b></div></div>
        <div class="point-cards">${points.map(p=>`<div class="point8"><b>${p.id}</b><small>${p.role}</small><span>(${p.x}, ${p.y}, ${p.z}) m</span><button onclick="F.setCP('${p.id}','${p.role}')">تعديل الإحداثيات</button></div>`).join('')}</div>
        <div class="notice8"><b>قاعدة التوزيع:</b> اجعل النقاط تحيط بمنطقة المسح قدر الإمكان. RCP-001 هو الأصل فقط إذا اخترت ذلك؛ يمكنك تغيير نظام الإحداثيات لاحقاً.</div>
        <button class="primary8" onclick="F.next()">تم وضع النقاط — التالي</button></section>`:''}
      ${step===3?`<section class="wizard8"><h2>3. ملف التقاط المرجعية</h2><p>هذا الملف هو ورقة الهدف التي يتعرف عليها الهاتف. اطبعها <b>100%</b> بدون Fit-to-page.</p>
        <div class="download-target"><div class="target-preview"><div class="cross"></div><b>REFERENCE CENTER</b></div><div><h3>المواصفات</h3><ul><li>A4: 210 × 297 mm</li><li>اطبع بنسبة 100%</li><li>لا تغيّر المقاس أو DPI</li><li>يفضل تغليفها بطبقة مطفية</li><li>ثبتها على سطح صلب</li><li>مركز النقطة = تقاطع الخطين الأسودين</li></ul><button class="primary8" onclick="F.makeTemplate()">⬇ إنشاء ملف SVG للطباعة</button></div></div>
        <div class="notice8"><b>كيف توضع؟</b> مركز الـRCP هو مركز علامة التقاطع. الصق/ثبّت الورقة بحيث لا تنثني. اكتب RCP ID على الورقة، ثم التقطها بالـiPhone أثناء المسح.</div>
        <label>رابط فتح تطبيق المسح (اختياري)<input value="${esc8(s.captureURL||'')}" onchange="F.setURL(this.value)" placeholder="realityengine://capture"></label>
        <button class="primary8" onclick="F.next()">الهدف جاهز — التالي</button></section>`:''}
      ${step===4?`<section class="wizard8"><h2>4. ابدأ المسح من هنا</h2><p>اضغط الزر. في iPhone نستخدم Universal Link أو Custom URL لفتح تطبيق المسح بعد موافقة المستخدم. لا يمكن للويب تجاوز إذن iOS.</p>
        <div class="launch8"><div class="phone">LiDAR<br><span>READY</span></div><div><b>Control Points المطلوبة: ${points.length}</b><p>امسح كل علامة من أكثر من زاوية. لا تحجب العلامة بيدك، وحافظ على حركة بطيئة.</p><button class="primary8" onclick="F.openScanner()">📱 فتح تطبيق المسح</button><button class="soft8" onclick="F.next()">لدي ملف المسح — متابعة</button></div></div>
        <div class="notice8">بعد الرجوع من التطبيق يجب أن يحتوي ملف الالتقاط على PLY/point cloud + ملف control_points.json. إذا لم يكن JSON متاحاً، سيطلب النظام تحديد النقاط يدوياً.</div></section>`:''}
      ${step===5?`<section class="wizard8"><h2>5. المعايرة والنشر</h2><div class="calibration8"><div><span>Control Points</span><b>${points.length}</b></div><div><span>Independent Check</span><b>${points.filter(x=>x.role==='CHECK').length?'✓':'—'}</b></div><div><span>Transform</span><b>7-Parameter</b></div><div><span>Quality Gate</span><b>Auto</b></div></div><p>سيتم استخراج Scale + Rotation + Translation، ثم فحص residual وP95 وCheck Point قبل السماح بالنشر.</p><button class="primary8" onclick="setActive('digitalTwin')">فتح Digital Twin</button></section>`:''}
    </div>`;
  };
  if(window.VIEW_RENDERERS) VIEW_RENDERERS.fieldCapture=F.render;
  if(window.NAV_SECTIONS && !NAV_SECTIONS.some(s=>s.items?.some(i=>i.key==='fieldCapture'))){
    NAV_SECTIONS.unshift({section:null,items:[{key:'fieldCapture',label:'مسح iPhone',ic:'⌁'}]});
    ALL_KEYS.push('fieldCapture');
  }
})();
