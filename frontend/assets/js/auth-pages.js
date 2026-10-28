/**
 * منطق صفحتي تسجيل الدخول وإنشاء الحساب.
 * يعتمد على api.js (Session, api).
 */

// الوضع الليلي المحفوظ
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark-mode');
}

// المسجّل دخوله لا يحتاج هذه الصفحات
if (Session.isLoggedIn()) {
  window.location.href = Session.homeUrl();
}

function showError(message) {
  const box = document.getElementById('error-message');
  box.textContent = message;
  box.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error-message').classList.add('hidden');
}

/** يشغّل طلباً مع تعطيل الزر أثناء الانتظار */
async function submitForm(form, request) {
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  hideError();
  button.disabled = true;
  button.textContent = 'جاري المعالجة...';

  try {
    const data = await request();
    Session.save(data.token, data.user);
    window.location.href = Session.homeUrl();
  } catch (error) {
    showError(error.message);
    button.disabled = false;
    button.textContent = originalText;
  }
}

// ===== تسجيل الدخول =====
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(loginForm);

    submitForm(loginForm, () =>
      api('/auth/login', {
        method: 'POST',
        auth: false,
        body: { email: form.get('email'), password: form.get('password') }
      })
    );
  });
}

// ===== إنشاء حساب =====
const registerForm = document.getElementById('register-form');
if (registerForm) {
  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(registerForm);

    if (form.get('password').length < 8) {
      return showError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    }
    if (form.get('password') !== form.get('confirmPassword')) {
      return showError('كلمتا المرور غير متطابقتين');
    }

    submitForm(registerForm, () =>
      api('/auth/register', {
        method: 'POST',
        auth: false,
        body: {
          name: form.get('name'),
          email: form.get('email'),
          phone: form.get('phone'),
          password: form.get('password')
        }
      })
    );
  });
}
