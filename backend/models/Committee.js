const mongoose = require('mongoose');

const committeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'اسم اللجنة مطلوب'],
    trim: true,
    maxlength: 100
  },
  description: { type: String, trim: true, maxlength: 500 },
  mosqueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mosque', required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// لا يتكرر اسم اللجنة داخل المصلى الواحد
committeeSchema.index({ mosqueId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Committee', committeeSchema);
