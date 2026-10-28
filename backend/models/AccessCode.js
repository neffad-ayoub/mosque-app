const mongoose = require('mongoose');

/**
 * كود دخول يولّده المسؤول الأعلى ويسلّمه لمن يريد إضافة مصلى.
 * الكود يُستعمل مرة واحدة فقط وله تاريخ انتهاء.
 */
const accessCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ['mosque'], default: 'mosque' },
  note: { type: String, trim: true, maxlength: 200 }, // لمن أعطيت الكود (للتذكير)
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isUsed: { type: Boolean, default: false },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  usedAt: Date,
  mosqueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mosque' },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model('AccessCode', accessCodeSchema);
