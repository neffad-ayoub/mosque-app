const mongoose = require('mongoose');

/**
 * الاتصال بقاعدة البيانات MongoDB
 * يرمي خطأ عند الفشل، والسيرفر هو من يقرر الإغلاق.
 */
const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000 // لا ننتظر طويلاً إذا MongoDB غير مشغّل
  });
  console.log(`✅ متصل بقاعدة البيانات: ${mongoose.connection.name}`);
};

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  تم قطع الاتصال بقاعدة البيانات');
});

mongoose.connection.on('error', (error) => {
  console.error('❌ خطأ في قاعدة البيانات:', error.message);
});

module.exports = connectDB;
