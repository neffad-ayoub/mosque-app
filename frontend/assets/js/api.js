/**
 * أدوات مشتركة بين كل الصفحات: الاتصال بالـ API وإدارة الجلسة.
 * يجب تحميله قبل أي سكربت آخر.
 */

// عنوان الـ API يُختار تلقائياً:
//  - السيرفر يقدّم الواجهة (الاستضافة، أو http://localhost:5000)  → '/api' من نفس العنوان
//  - الواجهة مفتوحة من Live Server أو من ملف مباشرة                → http://localhost:5000/api
// (يمكن فرضه بتعريف window.API_URL قبل هذا الملف، وسنحتاجه عند تحويل التطبيق لهاتف)
const IS_LOCAL_HOST = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const API_URL = window.API_URL ||
  (IS_LOCAL_HOST && location.port !== '5000' ? 'http://localhost:5000/api' : '/api');

// الصفحات داخل مجلد /pages تحتاج '../' للوصول للجذر
const BASE_PATH = location.pathname.includes('/pages/') ? '../' : '';

const Session = {
  getToken() {
    return localStorage.getItem('token');
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  },

  save(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  clear() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  isLoggedIn() {
    return Boolean(this.getToken() && this.getUser());
  },

  loginUrl() {
    return BASE_PATH + 'pages/login.html';
  },

  homeUrl() {
    return BASE_PATH + 'index.html';
  }
};

/**
 * طلب إلى الـ API. يرجع البيانات أو يرمي Error برسالة عربية جاهزة للعرض.
 * إذا انتهت الجلسة (401) يحوّل المستخدم لصفحة الدخول.
 */
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && Session.getToken()) {
    headers.Authorization = `Bearer ${Session.getToken()}`;
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('تعذّر الاتصال بالخادم. تأكد أنه يعمل.');
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    // الرد ليس JSON
  }

  if (response.status === 401 && auth) {
    Session.clear();
    window.location.href = Session.loginUrl();
    throw new Error(data.error || 'انتهت الجلسة');
  }

  if (!response.ok) {
    throw new Error(data.error || 'حدث خطأ غير متوقع');
  }

  return data;
}

/**
 * تهريب النصوص قبل إدخالها في innerHTML (يمنع حقن الأكواد XSS).
 * استعمله مع أي نص قادم من المستخدمين أو الخادم.
 */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}
