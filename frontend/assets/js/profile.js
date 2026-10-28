/**
 * صفحة الملف الشخصي:
 *  - بيانات الحساب والدور
 *  - المستخدم العام: نموذج استعمال كود مصلى
 *  - المسؤول الأعلى: توليد الأكواد وإدارتها
 * يعتمد على api.js (api, esc) وعلى App.user.
 */
const Profile = {
  roleLabels: {
    super_admin: 'المسؤول الأعلى',
    mosque_admin: 'مسؤول المصلى',
    committee_admin: 'مسؤول لجنة',
    committee_member: 'عضو لجنة',
    general_user: 'مستخدم عام'
  },

  codes: [],
  flash: null, // رسالة تظهر مرة واحدة أعلى الصفحة

  // ===== الرسم =====
  render() {
    const root = document.getElementById('profile-root');
    if (!root) return;

    const user = App.user;
    const flash = this.flash;
    this.flash = null;

    root.innerHTML = `
      ${flash ? `<div class="alert alert-${flash.type}">${esc(flash.text)}</div>` : ''}

      <div class="card">
        <div class="profile-head">
          <div class="profile-avatar">${esc(user.name.trim().charAt(0))}</div>
          <div>
            <h2 class="profile-name">${esc(user.name)}</h2>
            <div class="profile-email">${esc(user.email)}</div>
            <span class="role-badge">${esc(this.roleLabels[user.role] || user.role)}</span>
          </div>
        </div>
        ${user.mosque ? `<p class="profile-mosque">🕌 ${esc(user.mosque.name)} — ${esc(user.mosque.universityName)}</p>` : ''}
        ${user.committee ? `<p class="profile-committee">👥 ${esc(user.committee.name)}</p>` : ''}
      </div>

      ${user.role === 'general_user' ? this.redeemHtml() : ''}
      ${user.role === 'super_admin' ? this.codesPanelHtml() : ''}
    `;

    // نستعمل onclick/onsubmit (لا addEventListener) كي لا تتكرر المستمعات عند إعادة الرسم
    root.onsubmit = (event) => this.handleSubmit(event);
    root.onclick = (event) => this.handleClick(event);

    if (user.role === 'super_admin') this.loadCodes();
  },

  redeemHtml() {
    return `
      <div class="card">
        <div class="card-header"><h3 class="card-title">🔑 هل لديك كود مصلى؟</h3></div>
        <p class="hint">إذا أعطاك المسؤول الأعلى كوداً، أدخله هنا لإنشاء مصلاك وتصبح مسؤولاً عنه.</p>
        <form data-form="redeem" novalidate>
          <div class="form-group">
            <label class="form-label">الكود</label>
            <input class="form-input code-input" name="code" placeholder="MSJD-XXXX-XXXX" autocomplete="off" required>
          </div>
          <div class="form-group">
            <label class="form-label">اسم المصلى</label>
            <input class="form-input" name="mosqueName" required>
          </div>
          <div class="form-group">
            <label class="form-label">اسم الجامعة</label>
            <input class="form-input" name="universityName" required>
          </div>
          <div class="form-group">
            <label class="form-label">المدينة (اختياري)</label>
            <input class="form-input" name="city">
          </div>
          <div class="form-msg alert alert-danger hidden"></div>
          <button type="submit" class="btn btn-primary">إنشاء المصلى</button>
        </form>
      </div>
    `;
  },

  codesPanelHtml() {
    return `
      <div class="card">
        <div class="card-header"><h3 class="card-title">🔑 أكواد المصليات</h3></div>
        <p class="hint">كل كود يُستعمل مرة واحدة ويصلح 7 أيام. سلّمه لمن يريد إضافة مصلى.</p>
        <form data-form="create-code" class="code-form" novalidate>
          <input class="form-input" name="note" placeholder="لمن هذا الكود؟ (للتذكير)" maxlength="200">
          <button type="submit" class="btn btn-primary">توليد كود</button>
        </form>
        <div class="form-msg alert alert-danger hidden"></div>
        <div id="codes-list" class="codes-list"><p class="empty">جاري التحميل...</p></div>
      </div>
    `;
  },

  // ===== الأحداث =====
  handleSubmit(event) {
    event.preventDefault();
    const form = event.target.closest('form[data-form]');
    if (!form) return;

    if (form.dataset.form === 'redeem') this.redeem(form);
    if (form.dataset.form === 'create-code') this.createCode(form);
  },

  handleClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    if (button.dataset.action === 'copy') this.copyCode(button.dataset.code);
    if (button.dataset.action === 'revoke') this.revokeCode(button.dataset.id);
  },

  showMessage(form, text) {
    const box = form.parentElement.querySelector('.form-msg');
    box.textContent = text;
    box.classList.toggle('hidden', !text);
  },

  // ===== استعمال كود =====
  async redeem(form) {
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    this.showMessage(form, '');
    button.disabled = true;

    try {
      const result = await api('/auth/redeem-code', {
        method: 'POST',
        body: {
          code: data.get('code'),
          mosque: {
            name: data.get('mosqueName'),
            universityName: data.get('universityName'),
            city: data.get('city')
          }
        }
      });

      await App.refreshUser();
      this.flash = { type: 'success', text: result.message };
      this.render();
    } catch (error) {
      this.showMessage(form, error.message);
      button.disabled = false;
    }
  },

  // ===== أكواد المسؤول الأعلى =====
  async loadCodes() {
    const list = document.getElementById('codes-list');
    if (!list) return;

    try {
      this.codes = await api('/codes');
      this.renderCodes();
    } catch (error) {
      list.innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`;
    }
  },

  codeStatus(code) {
    if (code.isUsed) return { key: 'used', label: 'مستعمل' };
    if (new Date(code.expiresAt) < new Date()) return { key: 'expired', label: 'منتهي' };
    return { key: 'available', label: 'متاح' };
  },

  renderCodes() {
    const list = document.getElementById('codes-list');
    if (!list) return;

    if (!this.codes.length) {
      list.innerHTML = '<p class="empty">لا توجد أكواد بعد</p>';
      return;
    }

    list.innerHTML = this.codes.map((code) => {
      const status = this.codeStatus(code);
      const expires = new Date(code.expiresAt).toLocaleDateString('ar-DZ');

      const details = [
        code.note ? `📝 ${esc(code.note)}` : '',
        code.isUsed && code.usedBy ? `👤 ${esc(code.usedBy.name)}` : '',
        code.isUsed && code.mosqueId ? `🕌 ${esc(code.mosqueId.name)}` : '',
        !code.isUsed ? `⏳ ينتهي ${esc(expires)}` : ''
      ].filter(Boolean).join(' · ');

      return `
        <div class="code-row">
          <div class="code-main">
            <code class="code-value">${esc(code.code)}</code>
            <span class="code-status status-${status.key}">${status.label}</span>
          </div>
          ${details ? `<div class="code-meta">${details}</div>` : ''}
          ${!code.isUsed ? `
            <div class="code-actions">
              ${status.key === 'available' ? `<button class="btn btn-outline btn-sm" data-action="copy" data-code="${esc(code.code)}">نسخ</button>` : ''}
              <button class="btn btn-danger btn-sm" data-action="revoke" data-id="${esc(code._id)}">إلغاء</button>
            </div>` : ''}
        </div>
      `;
    }).join('');
  },

  async createCode(form) {
    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    this.showMessage(form, '');
    button.disabled = true;

    try {
      await api('/codes', { method: 'POST', body: { note: data.get('note') } });
      form.reset();
      await this.loadCodes();
    } catch (error) {
      this.showMessage(form, error.message);
    } finally {
      button.disabled = false;
    }
  },

  async copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      alert('تم نسخ الكود: ' + code);
    } catch {
      prompt('انسخ الكود:', code);
    }
  },

  async revokeCode(id) {
    if (!confirm('إلغاء هذا الكود نهائياً؟')) return;

    try {
      await api(`/codes/${id}`, { method: 'DELETE' });
      await this.loadCodes();
    } catch (error) {
      alert(error.message);
    }
  }
};

window.Profile = Profile;
