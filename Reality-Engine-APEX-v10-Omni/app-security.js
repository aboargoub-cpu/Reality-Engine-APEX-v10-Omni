/* ============================================================
   طبقة خدمة الصلاحيات (Authorization Service Boundary)
   ============================================================
   هذا الملف لا يُعيد تنفيذ أي منطق صلاحيات — هو غلاف تفويض بحت
   (pure delegation wrapper) حول الدوال الحقيقية الموجودة أصلاً في
   app-core.js:
     - ROLE_CONFIG, PERMISSION_MATRIX (بيانات، لم تُنقَل ولم تُغيَّر)
     - canView(role, key), canEdit(role, key)
     - checkPermission(functionKey, role)
     - getUserScopedProjectIds()

   الهدف: نقطة استدعاء واحدة موحَّدة (AuthorizationService.*) لأي كود
   جديد مستقبلاً، بحيث يصبح ممكناً لاحقاً استبدال ما بداخل هذا الغلاف
   بطلب API حقيقي لخادم صلاحيات، بلا أي تغيير في نقاط الاستدعاء التي
   تستخدم AuthorizationService — بينما كل نقاط الاستدعاء القديمة (مئات
   الاستدعاءات المباشرة لـ canEdit/canView/checkPermission في كل
   الملفات الأخرى) تستمر بالعمل تماماً كما هي، بلا أي تعديل عليها في
   هذه الجولة. لا سلوك تغيَّر، فقط حدّ معماري إضافي جديد.

   *لم يُنفَّذ Server Authentication هنا* — هذا غلاف تنظيمي محلي فقط.
   ============================================================ */

const AuthorizationService = {
  /** هل يملك هذا الدور صلاحية عرض هذا المفتاح؟ (تفويض مباشر لـ canView) */
  canView(role, key) {
    return canView(role, key);
  },
  /** هل يملك هذا الدور صلاحية تعديل هذا المفتاح؟ (تفويض مباشر لـ canEdit) */
  canEdit(role, key) {
    return canEdit(role, key);
  },
  /** فحص صلاحية دقيقة على مستوى إجراء محدَّد من PERMISSION_MATRIX (تفويض مباشر لـ checkPermission) */
  checkPermission(functionKey, role) {
    return checkPermission(functionKey, role);
  },
  /** نطاق مشاريع المستخدم الحالي — null يعني نطاقاً غير مُقيَّد (تفويض مباشر لـ getUserScopedProjectIds) */
  getScopedProjectIds() {
    return getUserScopedProjectIds();
  },
  /** نطاق مشاريع مستخدم مُحدَّد (تفويض مباشر لـ getUserScopedProjectIdsFor إن وُجدت) */
  getScopedProjectIdsFor(user) {
    return typeof getUserScopedProjectIdsFor === "function" ? getUserScopedProjectIdsFor(user) : null;
  },
};
