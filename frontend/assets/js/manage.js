/**
 * إدارة المصلى واللجان:
 *  - CommitteeUI : بطاقة اللجنة وإجراءاتها (مشتركة بين الصفحتين)
 *  - Manage      : لوحة مسؤول المصلى (بيانات المصلى + إنشاء اللجان وإدارتها)
 *  - MyCommittee : صفحة «لجنتي» لرئيس اللجنة وأعضائها
 * يعتمد على api.js (api, esc) وعلى App.user.
 */

// يعرض رسالة داخل أقرب بطاقة (.card أو .committee-card)
function showFormMessage(element, text) {
  const scope = element.closest('.committee-card, .card');
  const box = scope && scope.querySelector('.form-msg');
  if (!box) return;
  box.textContent = text;
  box.classList.toggle('hidden', !text);
}

function flashHtml(flash) {
  if (!flash) return '';
  const type = flash.type === 'success' ? 'success' : 'danger';
  return `<div class="alert alert-${type}">${esc(flash.text)}</div>`;
}

// ===================== بطاقة اللجنة =====================
const CommitteeUI = {
  /**
   * @param c   اللجنة كما يرجعها الـ API
   * @param opts.manage         يرى نماذج إضافة/إزالة الأعضاء
   * @param opts.mosqueManager  يرى تغيير الرئيس وحذف اللجنة
   */
  card(c, { manage, mosqueManager }) {
    const adminId = c.admin && c.admin._id;
    const id = esc(c._id);

    const members = c.members.map((m) => {
      const isHead = String(m._id) === String(adminId);
      return `
        <li class="member-row">
          <div class="member-info">
            <span class="member-name">${esc(m.name)}</span>
            ${isHead ? '<span class="role-badge">رئيس اللجنة</span>' : ''}
            ${m.email ? `<span class="member-email">${esc(m.email)}</span>` : ''}
          </div>
          ${manage && !isHead
            ? `<button class="btn btn-danger btn-sm" data-action="remove-member" data-committee="${id}" data-user="${esc(m._id)}">إزالة</button>`
            : ''}
        </li>`;
    }).join('');

    return `
      <div class="committee-card" data-committee-card="${id}">
        <div class="committee-head">
          <h4 class="committee-name">${esc(c.name)}</h4>
          <span class="committee-count">👥 ${esc(c.members.length)}</span>
        </div>
        ${c.description ? `<p class="committee-desc">${esc(c.description)}</p>` : ''}
        <ul class="member-list">${members || '<li class="empty">لا أعضاء</li>'}</ul>

        ${manage ? `
          <form class="inline-form" data-form="add-member" data-committee="${id}" novalidate>
            <input class="form-input" type="email" name="email" placeholder="بريد العضو الجديد" autocomplete="off" required>
            <button type="submit" class="btn btn-primary btn-sm">إضافة عضو</button>
          </form>` : ''}

        ${mosqueManager ? `
          <form class="inline-form" data-form="change-head" data-committee="${id}" novalidate>
            <input class="form-input" type="email" name="email" placeholder="بريد الرئيس الجديد" autocomplete="off" required>
            <button type="submit" class="btn btn-outline btn-sm">تغيير الرئيس</button>
          </form>
          <button class="btn btn-danger btn-sm" data-action="delete-committee" data-committee="${id}">حذف اللجنة</button>` : ''}

        <div class="form-msg alert alert-danger hidden"></div>
      </div>
    `;
  },

  // يعالج نماذج البطاقة. يرجع true إن كان النموذج يخصه
  async handleSubmit(form, reload) {
    const kind = form.dataset.form;
    if (kind !== 'add-member' && kind !== 'change-head') return false;

    const id = form.dataset.committee;
    const email = new FormData(form).get('email');
    const button = form.querySelector('button[type="submit"]');

    showFormMessage(form, '');
    button.disabled = true;

    try {
      const result = kind === 'add-member'
        ? await api(`/committees/${id}/members`, { method: 'POST', body: { email } })
        : await api(`/committees/${id}/admin`, { method: 'PUT', body: { email } });
      await reload({ type: 'success', text: result.message });
    } catch (error) {
      showFormMessage(form, error.message);
      button.disabled = false;
    }
    return true;
  },

  // يعالج أزرار البطاقة. يرجع true إن كان الزر يخصه
  async handleClick(button, reload) {
    const action = button.dataset.action;
    const id = button.dataset.committee;

    let request;
    if (action === 'remove-member') {
      if (!confirm('إزالة هذا العضو من اللجنة؟')) return true;
      request = () => api(`/committees/${id}/members/${button.dataset.user}`, { method: 'DELETE' });
    } else if (action === 'delete-committee') {
      if (!confirm('حذف اللجنة؟ سيعود رئيسها وأعضاؤها مستخدمين عاديين.')) return true;
      request = () => api(`/committees/${id}`, { method: 'DELETE' });
    } else {
      return false;
    }

    button.disabled = true;
    try {
      const result = await request();
      await reload({ type: 'success', text: result.message });
    } catch (error) {
      showFormMessage(button, error.message);
      button.disabled = false;
    }
    return true;
  }
};

// ===================== لوحة مسؤول المصلى =====================
const Manage = {
  mosque: null,
  committees: [],
  flash: null,

  async render() {
    const root = document.getElementById('manage-root');
    if (!root) return;

    if (!App.user || App.user.role !== 'mosque_admin' || !App.user.mosqueId) {
      root.innerHTML = '<div class="alert alert-warning">هذه الصفحة لمسؤولي المصليات فقط.</div>';
      return;
    }

    root.innerHTML = '<p class="empty">جاري التحميل...</p>';
    const mosqueId = App.user.mosqueId;

    try {
      [this.mosque, this.committees] = await Promise.all([
        api(`/mosques/${mosqueId}`),
        api(`/committees/mosque/${mosqueId}`)
      ]);
    } catch (error) {
      root.innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`;
      return;
    }
    this.draw();
  },

  reload(flash) {
    this.flash = flash || null;
    return this.render();
  },

  draw() {
    const root = document.getElementById('manage-root');
    if (!root) return;

    const m = this.mosque;
    const loc = m.location || {};
    const flash = this.flash;
    this.flash = null;

    const value = (v) => esc(v == null ? '' : v);

    root.innerHTML = `
      <h2 class="page-title">⚙️ إدارة المصلى</h2>
      ${flashHtml(flash)}

      <div class="card">
        <div class="card-header"><h3 class="card-title">بيانات المصلى</h3></div>
        <form data-form="mosque" novalidate>
          <div class="form-group">
            <label class="form-label">اسم المصلى</label>
            <input class="form-input" name="name" value="${value(m.name)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">اسم الجامعة</label>
            <input class="form-input" name="universityName" value="${value(m.universityName)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">الوصف</label>
            <textarea class="form-input" name="description" rows="3">${value(m.description)}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">المدينة</label>
            <input class="form-input" name="city" value="${value(loc.city)}">
          </div>
          <div class="form-group">
            <label class="form-label">العنوان</label>
            <input class="form-input" name="address" value="${value(loc.address)}">
          </div>
          <p class="hint">الإحداثيات تُستعمل لحساب مواقيت الصلاة بدقة. افتح خرائط جوجل، اضغط مطولاً على موقع المصلى، وانسخ الرقمين.</p>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">خط العرض</label>
              <input class="form-input ltr" name="latitude" inputmode="decimal" placeholder="27.8743" value="${value(loc.latitude)}">
            </div>
            <div class="form-group">
              <label class="form-label">خط الطول</label>
              <input class="form-input ltr" name="longitude" inputmode="decimal" placeholder="-0.2836" value="${value(loc.longitude)}">
            </div>
          </div>
          <div class="form-msg alert alert-danger hidden"></div>
          <button type="submit" class="btn btn-primary">حفظ</button>
        </form>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">➕ لجنة جديدة</h3></div>
        <p class="hint">رئيس اللجنة يجب أن يملك حساباً في التطبيق. اكتب بريده وسيصبح رئيسها ويستطيع إضافة أعضائها.</p>
        <form data-form="create-committee" novalidate>
          <div class="form-group">
            <label class="form-label">اسم اللجنة</label>
            <input class="form-input" name="name" placeholder="لجنة الإعلام" required>
          </div>
          <div class="form-group">
            <label class="form-label">وصف (اختياري)</label>
            <input class="form-input" name="description">
          </div>
          <div class="form-group">
            <label class="form-label">بريد رئيس اللجنة</label>
            <input class="form-input ltr" type="email" name="adminEmail" autocomplete="off" required>
          </div>
          <div class="form-msg alert alert-danger hidden"></div>
          <button type="submit" class="btn btn-primary">إنشاء اللجنة</button>
        </form>
      </div>

      <h3 class="section-title">اللجان (${esc(this.committees.length)})</h3>
      ${this.committees.length
        ? this.committees.map((c) => CommitteeUI.card(c, { manage: true, mosqueManager: true })).join('')
        : '<div class="card"><p class="empty">لا توجد لجان بعد</p></div>'}
    `;

    root.onsubmit = (event) => this.handleSubmit(event);
    root.onclick = (event) => this.handleClick(event);
  },

  async handleSubmit(event) {
    event.preventDefault();
    const form = event.target.closest('form[data-form]');
    if (!form) return;

    const reload = (flash) => this.reload(flash);
    if (await CommitteeUI.handleSubmit(form, reload)) return;

    const data = new FormData(form);
    const button = form.querySelector('button[type="submit"]');
    showFormMessage(form, '');
    button.disabled = true;

    try {
      if (form.dataset.form === 'mosque') {
        await api(`/mosques/${this.mosque._id}`, {
          method: 'PATCH',
          body: {
            name: data.get('name'),
            universityName: data.get('universityName'),
            description: data.get('description'),
            city: data.get('city'),
            address: data.get('address'),
            latitude: data.get('latitude'),
            longitude: data.get('longitude')
          }
        });
        App.refreshUser(); // اسم المصلى يظهر في الملف الشخصي
        await this.reload({ type: 'success', text: 'تم حفظ بيانات المصلى' });
      } else if (form.dataset.form === 'create-committee') {
        const result = await api('/committees', {
          method: 'POST',
          body: {
            name: data.get('name'),
            description: data.get('description'),
            adminEmail: data.get('adminEmail')
          }
        });
        await this.reload({ type: 'success', text: result.message });
      }
    } catch (error) {
      showFormMessage(form, error.message);
      button.disabled = false;
    }
  },

  async handleClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    await CommitteeUI.handleClick(button, (flash) => this.reload(flash));
  }
};

// ===================== لجنتي =====================
const MyCommittee = {
  flash: null,
  committee: null,

  async render() {
    const root = document.getElementById('committee-root');
    if (!root) return;

    root.innerHTML = '<p class="empty">جاري التحميل...</p>';

    try {
      this.committee = await api('/committees/mine');
    } catch (error) {
      root.innerHTML = `<div class="alert alert-warning">${esc(error.message)}</div>`;
      return;
    }
    this.draw();
  },

  reload(flash) {
    this.flash = flash || null;
    return this.render();
  },

  draw() {
    const root = document.getElementById('committee-root');
    if (!root) return;

    const c = this.committee;
    const flash = this.flash;
    this.flash = null;

    root.innerHTML = `
      <h2 class="page-title">👥 لجنتي</h2>
      ${flashHtml(flash)}
      ${c.canManage ? '<p class="hint">أنت رئيس هذه اللجنة: أضف أعضاءها بالبريد الإلكتروني (يجب أن يملكوا حساباً في التطبيق).</p>' : ''}
      ${CommitteeUI.card(c, { manage: c.canManage, mosqueManager: false })}
    `;

    root.onsubmit = async (event) => {
      event.preventDefault();
      const form = event.target.closest('form[data-form]');
      if (form) await CommitteeUI.handleSubmit(form, (f) => this.reload(f));
    };
    root.onclick = async (event) => {
      const button = event.target.closest('button[data-action]');
      if (button) await CommitteeUI.handleClick(button, (f) => this.reload(f));
    };
  }
};

window.CommitteeUI = CommitteeUI;
window.Manage = Manage;
window.MyCommittee = MyCommittee;
