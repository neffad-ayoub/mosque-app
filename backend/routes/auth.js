const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Mosque = require('../models/Mosque');
const AccessCode = require('../models/AccessCode');
const auth = require('../middleware/auth');
const { handleError, isText } = require('../utils/http');

const router = express.Router();

// حد المحاولات لكل IP كل 15 دقيقة (يمنع تخمين كلمات المرور). الافتراضي 20
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة، أعد المحاولة بعد 15 دقيقة' }
});

const signToken = (user) =>
  jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  mosqueId: user.mosqueId,
  committeeId: user.committeeId
});


// ===== تسجيل حساب جديد (دائماً مستخدم عام) =====
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!isText(name) || !isText(email) || !isText(password)) {
      return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
    }

    // الدور لا يُقرأ من الطلب أبداً: كل من يسجّل هنا مستخدم عام
    const user = await User.create({
      name,
      email,
      password,
      phone: isText(phone) ? phone : undefined,
      role: 'general_user'
    });

    res.status(201).json({ user: publicUser(user), token: signToken(user) });
  } catch (error) {
    handleError(res, error);
  }
});

// ===== تسجيل الدخول =====
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isText(email) || !isText(password)) {
      return res.status(400).json({ error: 'أدخل البريد وكلمة المرور' });
    }

    // String() يمنع حقن كائنات مثل {"$ne": null}
    const user = await User.findOne({ email: String(email).toLowerCase().trim() })
      .select('+password');

    const ok = user && user.isActive && (await user.comparePassword(password));
    if (!ok) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }

    await User.updateOne({ _id: user._id }, { lastLogin: new Date() });

    res.json({ user: publicUser(user), token: signToken(user) });
  } catch (error) {
    handleError(res, error);
  }
});

// ===== بيانات المستخدم الحالي =====
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('mosqueId', 'name universityName')
      .populate('committeeId', 'name');

    res.json({
      ...publicUser(user),
      mosqueId: user.mosqueId?._id || null,
      mosque: user.mosqueId || null,
      committee: user.committeeId || null
    });
  } catch (error) {
    handleError(res, error);
  }
});

// ===== استعمال كود لإنشاء مصلى (يصبح صاحبه مسؤول المصلى) =====
router.post('/redeem-code', auth, async (req, res) => {
  try {
    if (req.user.role !== 'general_user') {
      return res.status(400).json({ error: 'حسابك يملك صلاحية بالفعل' });
    }

    const { code, mosque } = req.body;
    if (!isText(code) || !mosque || !isText(mosque.name) || !isText(mosque.universityName)) {
      return res.status(400).json({ error: 'أدخل الكود واسم المصلى واسم الجامعة' });
    }

    // استهلاك الكود بشكل ذرّي: لو استعمله شخصان معاً ينجح واحد فقط
    const accessCode = await AccessCode.findOneAndUpdate(
      {
        code: String(code).trim().toUpperCase(),
        type: 'mosque',
        isUsed: false,
        expiresAt: { $gt: new Date() }
      },
      { $set: { isUsed: true, usedBy: req.user._id, usedAt: new Date() } },
      { new: true }
    );

    if (!accessCode) {
      return res.status(400).json({ error: 'الكود غير صالح أو منتهي أو مستعمل' });
    }

    try {
      const newMosque = await Mosque.create({
        name: mosque.name,
        universityName: mosque.universityName,
        description: isText(mosque.description) ? mosque.description : undefined,
        location: { city: isText(mosque.city) ? mosque.city : undefined },
        adminId: req.user._id,
        members: [req.user._id] // مسؤول المصلى يتابع مصلاه تلقائياً
      });

      await AccessCode.updateOne({ _id: accessCode._id }, { mosqueId: newMosque._id });
      await User.updateOne(
        { _id: req.user._id },
        { role: 'mosque_admin', mosqueId: newMosque._id }
      );

      res.status(201).json({
        message: 'تم إنشاء المصلى وأصبحت مسؤولاً عنه',
        mosque: newMosque
      });
    } catch (error) {
      // فشل إنشاء المصلى: نعيد الكود صالحاً كي لا يضيع على صاحبه
      await AccessCode.updateOne(
        { _id: accessCode._id },
        { $set: { isUsed: false }, $unset: { usedBy: 1, usedAt: 1 } }
      );
      throw error;
    }
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
