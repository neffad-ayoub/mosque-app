const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = [
  'super_admin',      // المسؤول الأعلى
  'mosque_admin',     // مسؤول المصلى
  'committee_admin',  // مسؤول لجنة
  'committee_member', // عضو لجنة
  'general_user'      // مستخدم عام
];

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'الاسم مطلوب'],
    trim: true,
    maxlength: [80, 'الاسم طويل جداً']
  },
  email: {
    type: String,
    required: [true, 'البريد الإلكتروني مطلوب'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'البريد الإلكتروني غير صالح']
  },
  password: {
    type: String,
    required: [true, 'كلمة المرور مطلوبة'],
    minlength: [8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'],
    select: false // لا تُرجَع في الاستعلامات إلا عند الطلب
  },
  phone: { type: String, trim: true, maxlength: 20 },
  role: { type: String, enum: ROLES, default: 'general_user' },
  mosqueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mosque', default: null },
  committeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Committee', default: null },
  profileImage: String,
  fcmToken: String,
  settings: {
    notifications: { type: Boolean, default: true },
    nightMode: { type: Boolean, default: false },
    prayerReminders: {
      fajr: { type: Boolean, default: true },
      dhuhr: { type: Boolean, default: true },
      asr: { type: Boolean, default: true },
      maghrib: { type: Boolean, default: true },
      isha: { type: Boolean, default: true },
      minutesBefore: { type: Number, default: 15 }
    },
    athkarReminders: {
      morning: { type: Boolean, default: true },
      evening: { type: Boolean, default: true },
      morningTime: { type: String, default: '07:00' },
      eveningTime: { type: String, default: '18:00' }
    }
  },
  isActive: { type: Boolean, default: true },
  lastLogin: Date
}, { timestamps: true });

// تشفير كلمة المرور قبل الحفظ (فقط إذا تغيّرت)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// لا نُرجع كلمة المرور أبداً في JSON
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

const User = mongoose.model('User', userSchema);
User.ROLES = ROLES;

module.exports = User;
