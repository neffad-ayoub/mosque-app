/**
 * يسمح فقط للأدوار المذكورة. يُستعمل بعد auth.
 * مثال: router.post('/', auth, checkRole('super_admin'), handler)
 */
const checkRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'ليس لديك صلاحية لهذا الإجراء' });
  }
  next();
};

module.exports = checkRole;
