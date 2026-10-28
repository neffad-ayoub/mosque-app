/**
 * إنشاء (أو ترقية) حساب المسؤول الأعلى.
 * هذه هي الطريقة الوحيدة للحصول على الدور super_admin — لا يوجد مسار API لذلك.
 *
 * الاستعمال:
 *   npm run create-admin -- "الاسم" email@example.com "كلمة_المرور_8_أحرف+"
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const [name, email, password] = process.argv.slice(2);

(async () => {
  if (!name || !email || !password) {
    console.error('الاستعمال: npm run create-admin -- "الاسم" email "كلمة المرور"');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

    let user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user) {
      user.role = 'super_admin';
      user.isActive = true;
      await user.save();
      console.log(`✅ تمت ترقية الحساب الموجود إلى مسؤول أعلى: ${user.email}`);
    } else {
      user = await User.create({ name, email, password, role: 'super_admin' });
      console.log(`✅ تم إنشاء حساب المسؤول الأعلى: ${user.email}`);
    }
  } catch (error) {
    console.error('❌ فشل:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
