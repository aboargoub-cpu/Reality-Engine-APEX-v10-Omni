REALITY ENGINE APEX v6.0.0
Enterprise Project Intelligence + Digital Twin + AI + Governance

نظام إدارة المشاريع المتكامل — نسخة مستقلة (بدون إنترنت / بدون Claude)
==========================================================================

ما هذا؟
--------
نسخة كاملة من النظام تعمل بمفردها على جهازك: كمبيوتر (ويندوز/ماك/لينكس)،
أو هاتف أندرويد، أو آيفون/آيباد. لا تحتاج إنترنت (إلا للمساعد الذكي
الاختياري)، ولا تحتاج فتح Claude، ولا أي حساب خارجي.

البيانات تُخزَّن محلياً على كل جهاز على حدة. لمشاركة نفس البيانات بين
عدة أجهزة، استخدم وحدة «البيانات والنسخ الاحتياطي» داخل النظام لتصدير
ملف JSON ومشاركته (بريد، USB، Google Drive/OneDrive)، ثم استورده على
الجهاز الآخر.

الطريقة الأسرع (كل الأجهزة، بدون أي إعداد):
--------------------------------------------
افتح ملف index.html مباشرة بأي متصفح (دبل-كليك عليه، أو من متصفح
الهاتف). النظام يعمل بكامل خصائصه فوراً. هذه الطريقة كافية تماماً
للاستخدام اليومي.

الطريقة الموصى بها لتثبيت النظام كتطبيق حقيقي (أيقونة + عمل كامل offline):
---------------------------------------------------------------------------
المتصفحات تسمح بتثبيت "تطبيق ويب" (PWA) وتفعيل العمل بدون إنترنت بشكل
موثوق فقط عند فتح الموقع عبر خادم (حتى لو محلي على جهازك)، لا عبر فتح
الملف مباشرة. لذلك:

1) على الكمبيوتر (ويندوز):
   - دبل-كليك على ملف start-windows.bat
   - سيُفتح المتصفح تلقائياً على http://localhost:8000
   - من متصفح Chrome/Edge: اضغط على أيقونة "تثبيت" في شريط العنوان
     لتثبيت النظام كتطبيق مستقل بأيقونة على سطح المكتب.

2) على الكمبيوتر (ماك / لينكس):
   - افتح Terminal في هذا المجلد وشغّل: bash start-mac-linux.sh
   - أو دبل-كليك على start-mac-linux.sh إذا كان مسموحاً بتشغيل الملفات.
   - نفس خطوات التثبيت من المتصفح كما في ويندوز.

3) على الهاتف (أندرويد / آيفون):
   الطريقة الأبسط: افتح index.html من تطبيق الملفات في الهاتف مباشرة
   بمتصفح Chrome (أندرويد) أو Safari (آيفون) — يعمل النظام بكامله فوراً
   دون أي إعداد.
   للتثبيت كأيقونة تطبيق حقيقية: شغّل الخادم على الكمبيوتر (الخطوة 1
   أو 2)، تأكد أن الهاتف والكمبيوتر على نفس شبكة الواي فاي، ثم افتح من
   متصفح الهاتف عنوان الكمبيوتر مثل: http://192.168.1.10:8000
   (استبدل الرقم بعنوان IP الكمبيوتر الظاهر على الشبكة)، ثم من قائمة
   المتصفح اختر "إضافة إلى الشاشة الرئيسية" / "Add to Home Screen".

الأدوار الأربعة:
-----------------
- مالك الشركة: يرى كل شيء، لا يعدّل أي بيانات (متابعة فقط).
- مدير المشروع: يدير مشاريعه بالكامل.
- مهندس الموقع: يسجّل التقارير اليومية والمهام والموارد والجودة والسلامة.
- المحاسب العام: يدير المالية والفواتير والعقود والمشتريات.

كل التفاصيل والشرح الكامل لكل وحدة موجود داخل النظام نفسه في صفحة
"دليل الاستخدام" (من الشريط الجانبي).

ملاحظات صريحة مهمة:
---------------------
- لا توجد كلمة مرور حقيقية — شاشة الدخول فقط لتحديد الاسم والدور.
- المزامنة الفورية الحقيقية بين الأجهزة تحتاج تفعيل «المزامنة السحابية» من
  الشريط الجانبي (يتطلب حساب Firebase مجاني — التعليمات كاملة داخل تلك
  الصفحة). بدون تفعيلها، كل جهاز يحتفظ ببياناته محلياً فقط، وتنقلها
  بتصدير/استيراد ملف JSON يدوياً.
- ميزتا مسح/توليد الباركود وربط السحابة تحتاج اتصال إنترنت (لتحميل
  مكتبات خارجية آمنة عند أول استخدام). بقية النظام يعمل بدون إنترنت.
- المساعد الذكي اختياري ويحتاج اتصال إنترنت ومفتاح Anthropic API شخصي؛
  بعض المتصفحات قد تمنع الاتصال المباشر بالـ API لأسباب أمنية (CORS) —
  في هذه الحالة استخدم النظام داخل Claude.ai حيث يعمل المساعد الذكي
  بالكامل دون قيود.
- لضمان أمان حقيقي على مستوى مؤسسي (حسابات وكلمات مرور حقيقية، صلاحيات
  محمية من طرف خادم بدل الواجهة فقط)، الخطوة التالية الطبيعية هي بناء
  نسخة بخادم مخصص — وهذا يمكن البناء عليه بعد التجربة.

مزايا هذا الإصدار:
--------------------
- مخطط جانت تفاعلي: اسحب أي نشاط لتغيير تاريخه، أو من طرفه لتغيير مدته،
  مع أسهم تبعية وتظليل المسار الحرج تلقائياً.
- فواتير بصورة مرفقة + باركود (مسح بالكاميرا أو توليد وطباعة).
- تقارير يومية بصور متعددة من الموقع.
- سجل أوامر التغيير (Variation Orders) بمنهجية PMBOK لضبط التغييرات.
- خط أساس (Baseline) لكل مشروع مع حساب الانحراف الزمني تلقائياً.
- رسوم بيانية إضافية في كل وحدة تقريباً (مشتريات، موارد، جودة، سلامة).
- مزامنة سحابية فورية اختيارية عبر Firebase (مجاني بالكامل لفريق صغير).

بالتوفيق!

================ REAL SCAN-vs-BIM ENGINE (NEW) ================
تمت إضافة backend/app/main.py + backend/requirements.txt.
المحرك ينفذ Registration حقيقي (FPFH + RANSAC + ICP) وقياس انحراف العناصر عند استخدام IFC.
تشغيل المحرك:
  cd backend
  python -m venv .venv
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 8787
ثم افتح تبويب Digital Twin > Scan-vs-BIM وضع عنوان الخادم http://localhost:8787.


=== DIGITAL TWIN v4 / CONTROL NETWORK ===
تم تطوير Digital Twin / Reality Capture ليشمل Control Network ثابت، Automatic Control Point Calibration، iPhone LiDAR marker observations، وQuality Gate. المسار الجديد: Control Network -> iPhone Scan -> control_points.json -> Automatic Matching -> 7-parameter similarity transform -> residual/P95 -> corrected scan -> Digital Twin.

================ ENTERPRISE v5 — FINAL ARCHITECTURE ================

تمت إضافة طبقة Enterprise Command Center لتجميع الحوكمة والأداء في شاشة واحدة:
- Portfolio Health مركب من SPI/CPI/المخاطر/التأخير.
- Executive KPI wall.
- Risk heatmap + critical risk watchlist.
- Decision register سريع مع مالك القرار وSLA.
- Reality Capture / Digital Twin coverage.
- QA/QC + HSE health.
- Enterprise Governance Center لإدارة سياسات الاعتماد والإعدادات ومراجعة الصلاحيات.
- دعم دور PMO جديد مع صلاحيات محددة.
- مبدأ فصل المهام ومبدأ الشخصين ونقطة تحقق مستقلة للمسح كإعدادات مؤسسية.

المنهجية المرجعية:
- PMI PMBOK Guide — Eighth Edition (2025): value delivery, governance, scope, schedule, finance, stakeholders, resources, risk, AI/PMO/procurement.
- ISO 21502:2020: project management guidance عبر predictive/adaptive/hybrid approaches.
- ISO 19650: information management, versioning, organization and BIM lifecycle.
- OWASP ASVS 5.0: application security verification.
- CISA Zero Trust Maturity Model: identity/device/network/application/data + visibility/automation/governance.

================ PRODUCTION SECURITY ================

أضيف backend/app/security.py مع AUTH_REQUIRED اختياري.
لتشغيل المصادقة المركزية في بيئة خادم:
  PMS_AUTH_REQUIRED=true
  PMS_AUTH_SECRET=<strong-random-secret>
  PMS_BOOTSTRAP_ADMIN=admin
  PMS_BOOTSTRAP_PASSWORD=<strong-password>
ثم شغّل backend كالمعتاد.

الـAPI يوفر:
  POST /api/auth/login
  GET  /api/auth/me
  GET  /api/security/status
وتصبح عمليات Reality الحساسة محمية بالدور عند تفعيل AUTH_REQUIRED.

ملاحظة إنتاجية: النسخة المحلية ما زالت Offline-first. لا تعتبر طبقة الواجهة وحدها بديلاً عن API authorization أو MFA أو OIDC/Entra ID في بيئة متعددة المستخدمين.

APEX v7 — 9/10 Target Upgrade
- New APEX Intelligence Center with portfolio health, AI Action Radar and Digital Thread.
- Monte Carlo P50/P80/P90 scenario engine.
- AI agent governance registry with Human-in-the-loop policy.
- Evidence-led decision architecture.
- Production architecture seam: PostgreSQL + Redis + MinIO + tenant/audit/AI-action schema.
- Command palette: Ctrl/Cmd+K. APEX Intelligence: Ctrl/Cmd+Shift+I.
- See APEX-9-ARCHITECTURE.md and backend/migrations/001_apex_core.sql.
