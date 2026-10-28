const express = require('express');
const mongoose = require('mongoose');
const Committee = require('../models/Committee');
const Mosque = require('../models/Mosque');
const User = require('../models/User');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleCheck');
const validateId = require('../middleware/validateId');
const { fail, isText, route } = require('../utils/http');

const router = express.Router();
router.use(auth);

/*
 * قاعدة أمان أساسية في هذا الملف:
 * أي تعيين (رئيس لجنة أو عضو) يتم بتحديث ذرّي بشرط role = 'general_user'
 * (أو عضو في نفس اللجنة عند تغيير الرئيس). لذلك لا يمكن أبداً أن يُخفَّض
 * مسؤول أعلى أو مسؤول مصلى أو أي صاحب منصب بتعيينه في لجنة.
 */

const same = (a, b) => a != null && b != null && String(a) === String(b);

// مسؤول هذا المصلى أو المسؤول الأعلى
const isMosqueManager = (user, committee) =>
  user.role === 'super_admin' ||
  (user.role === 'mosque_admin' && same(user.mosqueId, committee.mosqueId));

// يدير أعضاء اللجنة: مسؤول المصلى، الأعلى، أو رئيس هذه اللجنة
const canManage = (user, committee) =>
  isMosqueManager(user, committee) ||
  (user.role === 'committee_admin' && same(committee.adminId, user._id));

const person = (u, withEmail) =>
  u ? { _id: u._id, name: u.name, ...(withEmail ? { email: u.email } : {}) } : null;

// البريد لا يظهر إلا لمن يدير اللجنة
const present = (c, withEmails) => ({
  _id: c._id,
  name: c.name,
  description: c.description,
  mosqueId: c.mosqueId,
  admin: person(c.adminId, withEmails),
  members: (c.members || []).map((m) => person(m, withEmails)).filter(Boolean)
});

const findCandidate = async (email) => {
  if (!isText(email)) throw fail(400, 'أدخل البريد الإلكتروني');
  const user = await User.findOne({
    email: String(email).toLowerCase().trim(),
    isActive: true
  });
  if (!user) {
    throw fail(404, 'لا يوجد حساب بهذا البريد. اطلب منه إنشاء حساب في التطبيق أولاً');
  }
  return user;
};

const loadCommittee = async (id) => {
  const committee = await Committee.findById(id);
  if (!committee) throw fail(404, 'اللجنة غير موجودة');
  return committee;
};

// يعيد حساباً عيّنّاه للتو إلى مستخدم عام (للتراجع عند فشل خطوة لاحقة)
const revertToGeneral = (userId, committeeId) =>
  User.updateOne(
    { _id: userId, committeeId },
    { $set: { role: 'general_user', mosqueId: null, committeeId: null } }
  );

const POPULATE_ADMIN = { path: 'adminId', select: 'name email' };
const POPULATE_MEMBERS = { path: 'members', select: 'name email' };

// ===== لجنتي (رئيس لجنة أو عضو) =====
router.get('/mine', route(async (req, res) => {
  if (!['committee_admin', 'committee_member'].includes(req.user.role) || !req.user.committeeId) {
    throw fail(404, 'لست عضواً في أي لجنة');
  }

  const committee = await Committee.findById(req.user.committeeId)
    .populate(POPULATE_ADMIN)
    .populate(POPULATE_MEMBERS);
  if (!committee) throw fail(404, 'اللجنة غير موجودة');

  const manage = canManage(req.user, committee);
  res.json({ ...present(committee, manage), canManage: manage });
}));

// ===== كل لجان مصلى (مسؤول المصلى أو الأعلى) =====
router.get('/mosque/:mosqueId', validateId('mosqueId'), route(async (req, res) => {
  const allowed =
    req.user.role === 'super_admin' ||
    (req.user.role === 'mosque_admin' && same(req.user.mosqueId, req.params.mosqueId));
  if (!allowed) throw fail(403, 'ليس لديك صلاحية');

  const committees = await Committee.find({ mosqueId: req.params.mosqueId })
    .sort({ name: 1 })
    .populate(POPULATE_ADMIN)
    .populate(POPULATE_MEMBERS);

  res.json(committees.map((c) => present(c, true)));
}));

// ===== إنشاء لجنة وتعيين رئيسها (مسؤول المصلى) =====
router.post('/', checkRole('mosque_admin'), route(async (req, res) => {
  const { name, description, adminEmail } = req.body;
  if (!isText(name)) throw fail(400, 'اسم اللجنة مطلوب');

  const mosque = await Mosque.findOne({ _id: req.user.mosqueId, isActive: true });
  if (!mosque) throw fail(404, 'المصلى غير موجود');

  const head = await findCandidate(adminEmail);
  if (head.role !== 'general_user') {
    throw fail(400, 'هذا الحساب يملك منصباً بالفعل ولا يمكن تعيينه');
  }

  const committeeId = new mongoose.Types.ObjectId();

  // 1) نحجز الرئيس بتحديث ذرّي (ينجح فقط إن بقي مستخدماً عاماً)
  const claimed = await User.findOneAndUpdate(
    { _id: head._id, role: 'general_user', isActive: true },
    { $set: { role: 'committee_admin', mosqueId: mosque._id, committeeId } },
    { new: true }
  );
  if (!claimed) throw fail(409, 'تغيّر وضع هذا الحساب للتو، أعد المحاولة');

  // 2) ننشئ اللجنة، وعند الفشل نعيد الحساب كما كان
  let committee;
  try {
    committee = await Committee.create({
      _id: committeeId,
      name,
      description: isText(description) ? description : undefined,
      mosqueId: mosque._id,
      adminId: head._id,
      members: [head._id],
      createdBy: req.user._id
    });
  } catch (error) {
    await revertToGeneral(head._id, committeeId);
    throw error;
  }

  // 3) نربطها بالمصلى ونجعل رئيسها متابعاً له
  await Mosque.updateOne(
    { _id: mosque._id },
    { $addToSet: { committees: committee._id, members: head._id } }
  );

  res.status(201).json({
    message: 'تم إنشاء اللجنة وتعيين رئيسها',
    committee: { _id: committee._id, name: committee.name }
  });
}));

// ===== تعديل اسم/وصف اللجنة (مسؤول المصلى) =====
router.patch('/:id', validateId('id'), route(async (req, res) => {
  const committee = await loadCommittee(req.params.id);
  if (!isMosqueManager(req.user, committee)) throw fail(403, 'ليس لديك صلاحية');

  const set = {};
  if (req.body.name !== undefined) {
    if (!isText(req.body.name)) throw fail(400, 'اسم اللجنة مطلوب');
    set.name = req.body.name.trim();
  }
  if (req.body.description !== undefined) {
    if (typeof req.body.description !== 'string') throw fail(400, 'الوصف غير صالح');
    set.description = req.body.description.trim();
  }
  if (!Object.keys(set).length) throw fail(400, 'لا توجد تغييرات');

  await Committee.updateOne({ _id: committee._id }, { $set: set }, { runValidators: true });
  res.json({ message: 'تم التحديث' });
}));

// ===== تغيير رئيس اللجنة (مسؤول المصلى) =====
router.put('/:id/admin', validateId('id'), route(async (req, res) => {
  const committee = await loadCommittee(req.params.id);
  if (!isMosqueManager(req.user, committee)) {
    throw fail(403, 'تعيين رئيس اللجنة لمسؤول المصلى فقط');
  }

  const next = await findCandidate(req.body.email);
  if (same(next._id, committee.adminId)) throw fail(400, 'هذا الشخص هو رئيس اللجنة بالفعل');

  const isOwnMember = next.role === 'committee_member' && same(next.committeeId, committee._id);
  if (next.role !== 'general_user' && !isOwnMember) {
    throw fail(400, 'هذا الحساب يملك منصباً بالفعل ولا يمكن تعيينه');
  }

  // يعيد الرئيس الجديد إلى وضعه السابق إن فشلت خطوة لاحقة
  const restoreNext = () =>
    User.updateOne(
      { _id: next._id, role: 'committee_admin', committeeId: committee._id },
      {
        $set: isOwnMember
          ? { role: 'committee_member' }
          : { role: 'general_user', mosqueId: null, committeeId: null }
      }
    );

  // 1) نحجز الرئيس الجديد بشرط أن يكون مستخدماً عاماً أو عضواً في هذه اللجنة
  const claimed = await User.findOneAndUpdate(
    {
      _id: next._id,
      isActive: true,
      $or: [
        { role: 'general_user' },
        { role: 'committee_member', committeeId: committee._id }
      ]
    },
    { $set: { role: 'committee_admin', mosqueId: committee.mosqueId, committeeId: committee._id } },
    { new: true }
  );
  if (!claimed) throw fail(409, 'تغيّر وضع هذا الحساب للتو، أعد المحاولة');

  // 2) نغيّر رئيس اللجنة بشرط أن الرئيس لم يتغيّر أثناء ذلك
  const oldAdminId = committee.adminId;
  let updated;
  try {
    updated = await Committee.findOneAndUpdate(
      { _id: committee._id, adminId: oldAdminId },
      { $set: { adminId: next._id }, $addToSet: { members: next._id } },
      { new: true }
    );
  } catch (error) {
    await restoreNext();
    throw error;
  }
  if (!updated) {
    await restoreNext();
    throw fail(409, 'تغيّرت اللجنة للتو، أعد المحاولة');
  }

  // 3) الرئيس القديم يبقى عضواً في اللجنة
  await User.updateOne(
    { _id: oldAdminId, role: 'committee_admin', committeeId: committee._id },
    { $set: { role: 'committee_member' } }
  );
  await Mosque.updateOne({ _id: committee.mosqueId }, { $addToSet: { members: next._id } });

  res.json({ message: 'تم تغيير رئيس اللجنة' });
}));

// ===== حذف لجنة (مسؤول المصلى) =====
router.delete('/:id', validateId('id'), route(async (req, res) => {
  const committee = await loadCommittee(req.params.id);
  if (!isMosqueManager(req.user, committee)) throw fail(403, 'ليس لديك صلاحية');

  // نعيد رئيسها وأعضاءها فقط إلى مستخدمين عامّين (الشرط يحمي أي دور آخر)
  await User.updateMany(
    { committeeId: committee._id, role: { $in: ['committee_admin', 'committee_member'] } },
    { $set: { role: 'general_user', mosqueId: null, committeeId: null } }
  );
  await Mosque.updateOne({ _id: committee.mosqueId }, { $pull: { committees: committee._id } });
  await Committee.deleteOne({ _id: committee._id });

  res.json({ message: 'تم حذف اللجنة' });
}));

// ===== إضافة عضو (رئيس اللجنة أو مسؤول المصلى) =====
router.post('/:id/members', validateId('id'), route(async (req, res) => {
  const committee = await loadCommittee(req.params.id);
  if (!canManage(req.user, committee)) throw fail(403, 'ليس لديك صلاحية إدارة هذه اللجنة');

  const target = await findCandidate(req.body.email);
  if (same(target.committeeId, committee._id)) throw fail(400, 'هذا الشخص عضو في اللجنة بالفعل');
  if (target.role !== 'general_user') {
    throw fail(400, 'هذا الحساب يملك منصباً بالفعل ولا يمكن إضافته');
  }

  // 1) حجز ذرّي: ينجح فقط إن بقي مستخدماً عاماً
  const claimed = await User.findOneAndUpdate(
    { _id: target._id, role: 'general_user', isActive: true },
    { $set: { role: 'committee_member', mosqueId: committee.mosqueId, committeeId: committee._id } },
    { new: true }
  );
  if (!claimed) throw fail(409, 'تغيّر وضع هذا الحساب للتو، أعد المحاولة');

  // 2) إضافته للجنة وللمصلى، وعند فشل الأولى نعيده كما كان
  try {
    await Committee.updateOne({ _id: committee._id }, { $addToSet: { members: target._id } });
  } catch (error) {
    await revertToGeneral(target._id, committee._id);
    throw error;
  }
  await Mosque.updateOne({ _id: committee.mosqueId }, { $addToSet: { members: target._id } });

  res.status(201).json({
    message: 'تمت إضافة العضو',
    member: { _id: target._id, name: target.name, email: target.email }
  });
}));

// ===== إزالة عضو =====
router.delete('/:id/members/:userId', validateId('id', 'userId'), route(async (req, res) => {
  const committee = await loadCommittee(req.params.id);
  if (!canManage(req.user, committee)) throw fail(403, 'ليس لديك صلاحية إدارة هذه اللجنة');

  if (same(committee.adminId, req.params.userId)) {
    throw fail(400, 'لا يمكن إزالة رئيس اللجنة. غيّر الرئيس أو احذف اللجنة');
  }
  if (!committee.members.some((m) => same(m, req.params.userId))) {
    throw fail(404, 'هذا الشخص ليس عضواً في اللجنة');
  }

  // الشرط (عضو في هذه اللجنة بالذات) يمنع المساس بأي دور آخر
  await User.updateOne(
    { _id: req.params.userId, committeeId: committee._id, role: 'committee_member' },
    { $set: { role: 'general_user', mosqueId: null, committeeId: null } }
  );
  await Committee.updateOne({ _id: committee._id }, { $pull: { members: req.params.userId } });

  res.json({ message: 'تمت إزالة العضو' });
}));

module.exports = router;
