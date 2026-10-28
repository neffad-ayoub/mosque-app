const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const AccessCode = require('../models/AccessCode');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/roleCheck');

const router = express.Router();

// كل مسارات الأكواد للمسؤول الأعلى فقط
router.use(auth, checkRole('super_admin'));

// أحرف بلا تشابه (بدون O/0 و I/1) كي يسهل نقل الكود
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomGroup = (len) =>
  Array.from({ length: len }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

const generateCode = () => `MSJD-${randomGroup(4)}-${randomGroup(4)}`;

// ===== توليد كود جديد =====
router.post('/', async (req, res) => {
  try {
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 200) : undefined;
    const days = Math.min(Math.max(parseInt(req.body.days, 10) || 7, 1), 30);

    const accessCode = await AccessCode.create({
      code: generateCode(),
      type: 'mosque',
      note,
      createdBy: req.user._id,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    });

    res.status(201).json(accessCode);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'تعذّر إنشاء الكود' });
  }
});

// ===== قائمة الأكواد (الأحدث أولاً) =====
router.get('/', async (req, res) => {
  try {
    const codes = await AccessCode.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('usedBy', 'name email')
      .populate('mosqueId', 'name');

    res.json(codes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

// ===== إلغاء كود غير مستعمل =====
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'معرّف غير صالح' });
    }

    const deleted = await AccessCode.findOneAndDelete({ _id: req.params.id, isUsed: false });
    if (!deleted) {
      return res.status(404).json({ error: 'الكود غير موجود أو مستعمل بالفعل' });
    }

    res.json({ message: 'تم إلغاء الكود' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'خطأ في السيرفر' });
  }
});

module.exports = router;
