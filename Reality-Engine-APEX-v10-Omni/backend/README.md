# PMS Reality Processing & Progress Engine v2

## القدرات
- Scan-vs-BIM هندسي: FPFH + RANSAC + Point-to-Plane ICP.
- تحليل على مستوى عنصر IFC مع surface coverage وP95/max deviation.
- مقارنة Scan-1 مع Scan-2 مع Registration تلقائي، change volume، occupancy change، symmetric nearest-neighbour distances.
- نسبة إنجاز حجمية اختيارية عندما يحدد مدير المشروع `expected_scope_volume_m3` كحجم نطاق مستهدف قابل للتدقيق.
- استخراج نسبة تقدم من خصائص IFC مثل Progress/Completion/PercentComplete أو حالات التنفيذ الشائعة.
- حفظ كل تقرير JSON في `backend/data` لإعادة القراءة من النظام.

## تشغيل
```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8787
```

## ملاحظة هندسية مهمة
مسحان وحدهما يعطيان **تغيراً مكانياً** بشكل موثوق، لكنهما لا يكفيان وحدهما لإثبات "نسبة إنجاز المشروع" لكل نشاط. لذلك المحرك يفرّق بين:
1. Change Rate / Changed Volume: محسوب مباشرة من المسحين.
2. Progress %: لا يظهر إلا إذا كان هناك denominator هندسي واضح مثل expected scope volume، أو بيانات BIM/4D تحمل Progress/Completion، أو ربط عناصر BIM بالمهام والأوزان.

هذا يمنع النظام من اختلاق نسبة إنجاز تبدو دقيقة وهي غير قابلة للتدقيق.


## iPhone / LiDAR capture + calibration (v2.1)
- استخدم iPhone 16 Pro/Pro Max أو جهاز iPad/iPhone مزوداً بـ LiDAR للمسح ثلاثي الأبعاد.
- iPhone 16 و16 Plus العاديان لا يحتويان LiDAR، لذلك لا نعامل عمليا المسح منهما كـ LiDAR survey.
- مجلد `../ios-scanner` يحتوي نقطة بداية لتطبيق iOS/ARKit يلتقط Scene Depth ويصدر PLY.
- داخل PMS يوجد قسم `iPhone / LiDAR — فحص وتصحيح المسح`. ارفع PLY، أدخل قياس المرجع داخل المسح والقياس الحقيقي، وسيحسب المحرك scale factor.
- إذا تجاوز خطأ المقياس 3% يوصي النظام بعدم اعتماد التقرير وطلب مرجع إضافي/نقاط تحكم.
- تصحيح المقياس لا يعوض عن drift أو خطأ الدوران/الموقع المحلي؛ للمشاريع ذات tolerance صغير استخدم نقاط تحكم مساحية أو laser scanner احترافي.

## أفضل بروتوكول ميداني
1. ثبت مرجعاً معروفاً في المكان (مسافة مقاسة بدقة، أو نقاط تحكم مساحية).
2. امسح بنفس المسار والارتفاع تقريباً في كل زيارة.
3. اجعل المسح الأول هو Baseline ولا تغير نظام الإحداثيات دون توثيق.
4. في المسح الثاني استخدم نفس المرجع قبل اعتماد المقارنة.
5. شغّل Scan-to-Scan ثم راجع Registration Confidence وScale Calibration.
6. إذا كانت الثقة منخفضة أو المرجع غير متسق، لا يعتمد النظام نسبة الإنجاز تلقائياً.

## 3D Control Points / Field Calibration

The engine now supports a 3D similarity transformation from at least 3 corresponding control points. For field work, use 3 non-collinear points at minimum and preferably 4 points distributed around the scanned area. Enter each point's coordinates as observed in the scan and its true/survey/BIM coordinates. The engine reports mean, P95 and maximum residuals and produces a corrected PLY.

Recommended workflow:
1. Capture with iPhone 16 Pro/Pro Max or another scanner.
2. Establish 3–4 known control points in the area (survey/BIM coordinates).
3. Enter the scan coordinates and true coordinates in Digital Twin → Reality Engine → 3D Control Points.
4. Run correction and inspect residuals.
5. Use the corrected PLY for Scan-to-Scan and Scan-vs-BIM.

Quality guidance in the UI is a screening rule, not a contractual survey certification. For high-accuracy work, use a Total Station/GNSS control network and use the phone scan as reality capture.


## Reality Engine v3 — Control Network Calibration

الإصدار الجديد يضيف شبكة تحكم ثابتة للموقع (`/api/reality/control-networks`) ومعايرة تلقائية تعتمد على IDs للنقاط. يمكن لتطبيق iOS تصدير `control_points.json` مع PLY، ثم يطابق PMS النقاط مع Control Network ويطبق 3D Similarity Transform (Scale + Rotation + Translation) ويحسب residuals وP95 وQuality Gate.

### Workflow الموصى به
1. أنشئ Control Network من 4 نقاط موزعة مكانياً على الأقل.
2. استخدم علامات RCP-001… في الموقع.
3. نفذ المسح من iPhone LiDAR.
4. ارفع PLY + control_points.json.
5. نفذ Automatic Control Point Calibration.
6. لا تعتمد النتيجة إذا فشلت Quality Gate؛ أضف نقاطاً أو أعد المسح.

المعايرة لا تعالج local drift بالكامل، ولذلك يمكن استخدام نقطة مستقلة كـ Check Point. للمشاريع ذات المتطلبات المساحية/التعاقدية الدقيقة استخدم شبكة مساحية مرجعية.
