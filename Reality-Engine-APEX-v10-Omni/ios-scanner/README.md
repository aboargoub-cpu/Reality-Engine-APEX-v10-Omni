# PMS Reality Scanner — iPhone LiDAR + Automatic Control Points

## الهدف
التطبيق يلتقط Point Cloud من ARKit LiDAR ويبحث أثناء المسح عن علامات بصرية تحمل IDs مثل `RCP-001`, `RCP-002`... عند العثور عليها، يسجل مركز العلامة في الإطار العالمي لـ ARKit ويصدر:

- `scan.ply`
- `control_points.json`

يمكن رفع الاثنين إلى Reality Engine لإجراء المعايرة التلقائية عبر Control Network.

## Workflow
1. أنشئ Control Network في PMS وأعطِ كل RCP إحداثياتها الحقيقية.
2. اطبع QR/Barcode لكل نقطة باسم `RCP-001` ... وضعها في الموقع بشكل ثابت.
3. افتح التطبيق واضغط Start Scan.
4. تحرك ببطء ومرر الكاميرا على كل علامة حتى تظهر ✓.
5. اضغط Stop Scan ثم Export Bundle.
6. ارفع `scan.ply` و`control_points.json` إلى Digital Twin → Reality Capture.
7. Reality Engine يطابق IDs مع الشبكة ويحسب Scale + Rotation + Translation + residuals.
8. إذا اجتاز Quality Gate، استخدم الملف المصحح داخل Digital Twin.

## ملاحظات هندسية
- التطبيق يعتمد على ARKit Scene Depth، ولذلك يحتاج جهازاً مزوداً بـ LiDAR.
- تحديد مركز العلامة من depth camera هو تقدير عملي وليس مسحاً مساحياً تعاقدياً.
- للمشاريع ذات التفاوتات الصغيرة جداً أو الإحداثيات الرسمية، استخدم Total Station / Survey Control أو Laser Scanner احترافي.
- يفضل 4 نقاط موزعة مكانياً + نقطة Check مستقلة. لا تضع كل النقاط على خط واحد.
- يمكن لاحقاً استبدال QR بــ AprilTag/ArUco مع marker geometry ثابتة إذا أردت Robustness أعلى في المواقع الصناعية.
