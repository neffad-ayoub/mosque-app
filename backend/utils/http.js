/** أدوات مشتركة للمسارات */

// خطأ متوقع برسالة تُعرض للمستخدم:  throw fail(404, 'غير موجود')
const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

// تحويل أي خطأ إلى رد مفهوم. الأخطاء غير المتوقعة تُسجَّل ولا تُكشف تفاصيلها
const handleError = (res, error) => {
  if (error.expose) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error.name === 'ValidationError') {
    const first = Object.values(error.errors)[0];
    return res.status(400).json({ error: first.message });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ error: 'قيمة غير صالحة' });
  }
  if (error.code === 11000) {
    const keys = Object.keys(error.keyPattern || {});
    const message = keys.includes('email')
      ? 'البريد الإلكتروني مستخدم بالفعل'
      : keys.includes('name')
        ? 'الاسم مستخدم بالفعل'
        : 'القيمة مستخدمة بالفعل';
    return res.status(409).json({ error: message });
  }
  console.error(error);
  res.status(500).json({ error: 'خطأ في السيرفر' });
};

// يغلّف معالجاً async كي تصل أخطاؤه إلى handleError دائماً
const route = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((error) => handleError(res, error));

module.exports = { fail, isText, handleError, route };
