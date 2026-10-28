# 🌍 نشر التطبيق للتجربة (Render + MongoDB Atlas)

السيرفر يقدّم الواجهة والـ API من عنوان واحد، فتنشر مشروعاً واحداً فقط.

**شرط قبل البدء:** `npm run smoke-test` نجح على جهازك (كل الفحوص ✓). لا تنشر كوداً لم يعمل محلياً.

---

## 1) قاعدة البيانات: MongoDB Atlas (مجانية)

1. أنشئ حساباً في cloud.mongodb.com ثم **Create → M0 (Free)**.
2. **Database Access → Add New Database User**: اسم مستخدم وكلمة مرور قوية. استعمل أحرفاً وأرقاماً فقط في كلمة المرور، وإلا ستحتاج ترميز الرموز الخاصة داخل الرابط.
3. **Network Access → Add IP Address → `0.0.0.0/0`**. ضروري لأن Render المجاني لا يملك عنواناً ثابتاً.
4. **Database → Connect → Drivers** وانسخ الرابط، ثم أضف اسم القاعدة قبل علامة `?`:
```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/mosque-app?retryWrites=true&w=majority
```
احتفظ بهذا الرابط، سيصير `MONGODB_URI`.

## 2) ارفع المشروع إلى GitHub

أنشئ مستودعاً **خاصاً** فارغاً على GitHub، ثم من مجلد `mosque-app` (الجذر، ليس backend):
```
git init
git add .
git commit -m "المصليات الجامعية: المرحلة 2"
git branch -M main
git remote add origin https://github.com/USERNAME/mosque-app.git
git push -u origin main
```
**تحقق قبل أن تنسى:** `git ls-files | findstr .env` يجب أن يُظهر `.env.example` فقط. إن ظهر `.env` فتوقف ولا تدفع.

## 3) السيرفر: Render

**New → Web Service** ← اختر المستودع، ثم:

| الحقل | القيمة |
|---|---|
| Region | Frankfurt (الأقرب للجزائر) |
| Root Directory | اتركه فارغاً |
| Build Command | `cd backend && npm install` |
| Start Command | `cd backend && npm start` |
| Instance Type | Free |

**Environment Variables** (أضف الأربعة):

| المتغير | القيمة |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | رابط Atlas من الخطوة 1 |
| `JWT_SECRET` | سرّ **جديد** (الأمر أدناه) |
| `AUTH_RATE_LIMIT` | `20` |

ولّد `JWT_SECRET` جديداً. **لا تنسخ القيمة الموجودة في `.env` المحلي:**
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

اضغط **Create Web Service** وانتظر انتهاء البناء.

## 4) تحقق أن كل شيء متصل

افتح في المتصفح:
```
https://اسم-خدمتك.onrender.com/api/health
```
- `{"ok":true,"db":true}` ← ممتاز.
- `503` أو `db:false` ← المشكلة في Atlas: كلمة المرور، أو `0.0.0.0/0` لم يُضَف، أو نسيت `/mosque-app` في الرابط. اقرأ Logs في Render.

## 5) أنشئ حسابك كمسؤول أعلى على القاعدة الحقيقية

من جهازك، داخل مجلد `backend` (PowerShell):
```
$env:MONGODB_URI="رابط-Atlas-كاملاً"
npm run create-admin -- "اسمك" you@mail.com "كلمة_مرور_قوية"
```
ثم أغلق نافذة PowerShell. لا تشغّل `smoke-test` على القاعدة الحقيقية: ينشئ مستخدمين ومصلى تجريبيين لا يوجد مسار لحذفهم.

## 6) التجربة الحقيقية

1. افتح رابط Render على هاتفك، سجّل الدخول، الملف الشخصي ← **توليد كود**.
2. أرسل الكود لمسؤول مصلى حقيقي بهذا القالب:

```
السلام عليكم ورحمة الله،
هذا كود إنشاء مصلاكم في تطبيق المصليات الجامعية:

الكود: MSJD-XXXX-XXXX
(يُستعمل مرة واحدة ويصلح 7 أيام. لا تشاركه مع أحد.)

الخطوات:
1) افتح الرابط: https://اسم-خدمتك.onrender.com
2) أنشئ حساباً جديداً
3) من القائمة اختر «الملف الشخصي»، وأدخل الكود واسم المصلى واسم الجامعة

أخبرني بأي صعوبة تواجهها.
```
3. اطلب منه أن يخبرك بكل خطوة تعثّر فيها. هذه هي المعلومة الوحيدة التي تهمك الآن.

---

## حدود الاستضافة المجانية (تحقق منها قبل أن تفاجئك)

**Render:** تنام الخدمة بعد 15 دقيقة بلا زوار، وأول طلب بعدها يستغرق نحو دقيقة. الحد الشهري 750 ساعة. أي مهمة مجدولة داخل السيرفر لن تعمل وهو نائم، فعند بناء تذكيرات الصلاة لاحقاً سنحتاج استضافة لا تنام أو نضع المنطق في الهاتف. المصدر: [Render — Deploy for Free](https://render.com/docs/free)

**Atlas M0:** تخزين 0.5 جيجابايت، و100 عملية في الثانية، وتتوقف المجموعة بعد 30 يوماً بلا أي اتصال. المصدر: [Atlas — Free cluster limits](https://mongodb.com/docs/atlas/reference/free-shared-limitations/)

هذه الحدود كافية لتجربة مع عدة مصليات. لا تكفي لإطلاق رسمي.

## مشاكل شائعة

| العَرَض | السبب والحل |
|---|---|
| البناء يفشل في Render | تأكد أن Build Command هو `cd backend && npm install` بالضبط |
| `/api/health` يعطي 503 | رابط Atlas أو الشبكة (الخطوة 1)، اقرأ Logs |
| الموقع يفتح لكن الدخول يعطي «تعذّر الاتصال» | الخدمة كانت نائمة، انتظر دقيقة وأعد المحاولة |
| `محاولات كثيرة` (429) | `AUTH_RATE_LIMIT=20` يحظر 20 محاولة/15 دقيقة لكل زائر، انتظر |
