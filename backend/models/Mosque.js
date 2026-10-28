const mongoose = require('mongoose');

const mosqueSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'اسم المصلى مطلوب'],
    trim: true,
    maxlength: 100
  },
  universityName: {
    type: String,
    required: [true, 'اسم الجامعة مطلوب'],
    trim: true,
    maxlength: 100
  },
  description: { type: String, trim: true, maxlength: 1000 },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: {
    address: String,
    city: { type: String, trim: true },
    country: { type: String, default: 'الجزائر' },
    // نحتاج الإحداثيات لاحقاً لحساب مواقيت الصلاة
    latitude: Number,
    longitude: Number
  },
  images: [String],
  capacity: Number,
  facilities: [String],
  committees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Committee' }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// للبحث عن «المصليات التي أتابعها» وعن متابعي مصلى عند إرسال الإشعارات
mosqueSchema.index({ members: 1 });

module.exports = mongoose.model('Mosque', mosqueSchema);
