const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// تحميل متغيرات البيئة قبل أي شيء آخر (المتغيرات الموجودة في النظام/الاستضافة لها الأولوية على .env)
dotenv.config();

const mongoose = require('mongoose');
const connectDB = require('./config/db');
require('./models'); // تسجيل كل النماذج

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// خلف وسيط الاستضافة (Render وغيرها) نثق بأول وسيط،
// وإلا يرى حد المحاولات كل الزوار بعنوان واحد ويحظرهم معاً
if (isProd) app.set('trust proxy', 1);

// الواجهة والـ API يعملان من نفس العنوان فلا نحتاج CORS في الإنتاج.
// نفتحه فقط لنطاقات تحددها بنفسك في CORS_ORIGIN (مفصولة بفاصلة)
if (!isProd) {
  app.use(cors());
} else if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// تسجيل الطلبات
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// ===== الـ API =====
app.get('/api', (req, res) => {
  res.json({
    message: 'API تطبيق المصليات الجامعية 🕌',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      codes: '/api/codes',
      mosques: '/api/mosques',
      committees: '/api/committees',
      health: '/api/health'
    }
  });
});

// فحص الصحة: 200 إن كانت قاعدة البيانات متصلة، 503 إن لم تكن
app.get('/api/health', (req, res) => {
  const db = mongoose.connection.readyState === 1;
  res.status(db ? 200 : 503).json({ ok: db, db });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/codes', require('./routes/codes'));
app.use('/api/mosques', require('./routes/mosques'));
app.use('/api/committees', require('./routes/committees'));

// أي مسار /api غير معروف يرجع JSON (لا نريد أن تصل طلبات الـ API إلى الملفات الثابتة)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'المسار غير موجود', path: req.path });
});

// ===== الواجهة (مجلد frontend فقط، لا شيء من backend) =====
app.use(express.static(FRONTEND_DIR));

// 404 لأي شيء آخر
app.use((req, res) => {
  res.status(404).json({ error: 'المسار غير موجود', path: req.path });
});

// معالج الأخطاء العام
app.use((error, req, res, next) => {
  console.error('Error:', error);
  const status = error.status || 500;
  res.status(status).json({
    error: status < 500 ? error.message : 'خطأ في السيرفر'
  });
});

// تشغيل السيرفر بعد التأكد من الإعدادات والاتصال بقاعدة البيانات
const start = async () => {
  for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
    if (!process.env[key]) {
      console.error(`❌ المتغير ${key} غير موجود (في .env أو في إعدادات الاستضافة)`);
      process.exit(1);
    }
  }

  if (isProd && process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET قصير. في الإنتاج يجب أن يكون 32 حرفاً على الأقل');
    process.exit(1);
  }

  try {
    await connectDB();
  } catch (error) {
    console.error('❌ تعذّر الاتصال بقاعدة البيانات:', error.message);
    console.error('   تأكد أن MongoDB يعمل، أو راجع MONGODB_URI');
    process.exit(1);
  }

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log('=================================');
    console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`);
    console.log(`🌍 البيئة: ${process.env.NODE_ENV || 'development'}`);
    console.log('=================================');
  });
};

if (require.main === module) {
  start();
}

module.exports = app;
