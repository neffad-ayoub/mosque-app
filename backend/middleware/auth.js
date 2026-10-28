const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * يتحقق من التوكن ويضع المستخدم الحالي في req.user
 * الصلاحية تُقرأ من قاعدة البيانات في كل طلب،
 * فأي تغيير في الدور يسري فوراً بدون إعادة تسجيل دخول.
 */
const auth = async (req, res, next) => {
  try {
    const header = req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'الحساب غير موجود أو معطّل' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'انتهت الجلسة، سجّل الدخول من جديد' });
  }
};

module.exports = auth;
