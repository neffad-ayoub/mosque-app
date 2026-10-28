const express = require('express');
const Mosque = require('../models/Mosque');
const auth = require('../middleware/auth');
const validateId = require('../middleware/validateId');
const { fail, route } = require('../utils/http');

const router = express.Router();
router.use(auth);

const same = (a, b) => a != null && b != null && String(a) === String(b);

// ما يراه أي مستخدم عن المصلى (بدون قائمة المتابعين)
const present = (mosque, userId) => ({
  _id: mosque._id,
  name: mosque.name,
  universityName: mosque.universityName,
  description: mosque.description,
  location: {
    city: mosque.location?.city,
    address: mosque.location?.address,
    latitude: mosque.location?.latitude,
    longitude: mosque.location?.longitude
  },
  followersCount: mosque.members.length,
  isFollowing: mosque.members.some((id) => same(id, userId))
});

const canEditMosque = (user, mosqueId) =>
  user.role === 'super_admin' || (user.role === 'mosque_admin' && same(user.mosqueId, mosqueId));

// ===== قائمة المصليات =====
router.get('/', route(async (req, res) => {
  const mosques = await Mosque.find({ isActive: true })
    .select('name universityName description location members')
    .sort({ name: 1 })
    .limit(200);

  res.json(mosques.map((m) => present(m, req.user._id)));
}));

// ===== مصلى واحد =====
router.get('/:id', validateId('id'), route(async (req, res) => {
  const mosque = await Mosque.findOne({ _id: req.params.id, isActive: true })
    .select('name universityName description location members');
  if (!mosque) throw fail(404, 'المصلى غير موجود');

  res.json(present(mosque, req.user._id));
}));

// ===== تعديل المصلى (مسؤول هذا المصلى أو المسؤول الأعلى) =====
// نقبل حقولاً محددة فقط، فلا يمكن تعديل adminId أو members أو غيرها عبر الطلب
router.patch('/:id', validateId('id'), route(async (req, res) => {
  if (!canEditMosque(req.user, req.params.id)) {
    throw fail(403, 'ليس لديك صلاحية تعديل هذا المصلى');
  }

  const set = {};

  const text = (field, target, label, required = false) => {
    const value = req.body[field];
    if (value === undefined) return;
    if (typeof value !== 'string') throw fail(400, `${label}: قيمة غير صالحة`);
    if (required && !value.trim()) throw fail(400, `${label} لا يمكن أن يكون فارغاً`);
    set[target] = value.trim();
  };

  const number = (field, target, label, min, max) => {
    const value = req.body[field];
    if (value === undefined) return;
    if (value === null || value === '') {
      set[target] = null;
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      throw fail(400, `${label}: يجب أن تكون بين ${min} و${max}`);
    }
    set[target] = n;
  };

  text('name', 'name', 'اسم المصلى', true);
  text('universityName', 'universityName', 'اسم الجامعة', true);
  text('description', 'description', 'الوصف');
  text('city', 'location.city', 'المدينة');
  text('address', 'location.address', 'العنوان');
  number('latitude', 'location.latitude', 'خط العرض', -90, 90);
  number('longitude', 'location.longitude', 'خط الطول', -180, 180);

  if (!Object.keys(set).length) throw fail(400, 'لا توجد تغييرات');

  const mosque = await Mosque.findOneAndUpdate(
    { _id: req.params.id, isActive: true },
    { $set: set },
    { new: true, runValidators: true }
  );
  if (!mosque) throw fail(404, 'المصلى غير موجود');

  res.json(present(mosque, req.user._id));
}));

// ===== متابعة مصلى (لتصلك إعلاناته) =====
router.post('/:id/follow', validateId('id'), route(async (req, res) => {
  const mosque = await Mosque.findOneAndUpdate(
    { _id: req.params.id, isActive: true },
    { $addToSet: { members: req.user._id } }, // آمن لو ضغط المستخدم مرتين
    { new: true }
  ).select('members');
  if (!mosque) throw fail(404, 'المصلى غير موجود');

  res.json({ isFollowing: true, followersCount: mosque.members.length });
}));

// ===== إلغاء المتابعة =====
router.delete('/:id/follow', validateId('id'), route(async (req, res) => {
  // من ارتبط بالمصلى عبر منصبه (مسؤول، رئيس لجنة، عضو) يبقى متابعاً له
  if (same(req.user.mosqueId, req.params.id)) {
    throw fail(400, 'أنت مرتبط بهذا المصلى عبر منصبك فلا يمكن إلغاء المتابعة');
  }

  const mosque = await Mosque.findOneAndUpdate(
    { _id: req.params.id, isActive: true },
    { $pull: { members: req.user._id } },
    { new: true }
  ).select('members');
  if (!mosque) throw fail(404, 'المصلى غير موجود');

  res.json({ isFollowing: false, followersCount: mosque.members.length });
}));

module.exports = router;
