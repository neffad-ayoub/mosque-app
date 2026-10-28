/**
 * يتحقق أن معاملات المسار معرّفات MongoDB صحيحة (24 خانة سداسية عشرية)
 * قبل أن تصل لقاعدة البيانات، فيرجع 400 بدل خطأ 500.
 * مثال: router.get('/:id', validateId('id'), handler)
 */
const OBJECT_ID = /^[a-f\d]{24}$/i;

module.exports = (...params) => (req, res, next) => {
  for (const name of params) {
    if (!OBJECT_ID.test(String(req.params[name]))) {
      return res.status(400).json({ error: 'معرّف غير صالح' });
    }
  }
  next();
};
