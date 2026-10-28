/**
 * صفحة «المصليات»: قائمة المصليات مع المتابعة وإلغائها.
 * يعتمد على api.js (api, esc) وعلى App.user.
 */
const Mosques = {
  list: [],

  async render() {
    const root = document.getElementById('mosques-root');
    if (!root) return;

    root.innerHTML = '<p class="empty">جاري التحميل...</p>';
    root.onclick = (event) => this.handleClick(event);

    try {
      this.list = await api('/mosques');
    } catch (error) {
      root.innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`;
      return;
    }
    this.draw();
  },

  // هل ارتبط المستخدم بهذا المصلى عبر منصبه؟ (مسؤول، رئيس لجنة، عضو)
  isTied(mosque) {
    return App.user && App.user.mosqueId && String(App.user.mosqueId) === String(mosque._id);
  },

  draw() {
    const root = document.getElementById('mosques-root');
    if (!root) return;

    if (!this.list.length) {
      root.innerHTML = `
        <h2 class="page-title">🕌 المصليات</h2>
        <div class="card"><p class="empty">لا توجد مصليات بعد</p></div>`;
      return;
    }

    root.innerHTML = `
      <h2 class="page-title">🕌 المصليات</h2>
      <p class="hint">تابع مصلاك لتصلك إعلاناته ومحاضراته.</p>
      ${this.list.map((m) => this.cardHtml(m)).join('')}
    `;
  },

  cardHtml(m) {
    const place = [m.universityName, m.location && m.location.city].filter(Boolean).join(' — ');
    const tied = this.isTied(m);

    let action;
    if (tied) {
      action = '<span class="role-badge">مصلاك</span>';
    } else if (m.isFollowing) {
      action = `<button class="btn btn-outline btn-sm" data-action="unfollow" data-id="${esc(m._id)}">إلغاء المتابعة</button>`;
    } else {
      action = `<button class="btn btn-primary btn-sm" data-action="follow" data-id="${esc(m._id)}">متابعة</button>`;
    }

    return `
      <div class="card mosque-card">
        <div class="mosque-top">
          <div>
            <h3 class="mosque-name">${esc(m.name)}</h3>
            <div class="mosque-place">${esc(place)}</div>
          </div>
          ${action}
        </div>
        ${m.description ? `<p class="mosque-desc">${esc(m.description)}</p>` : ''}
        <div class="mosque-meta">👥 ${esc(m.followersCount)} متابع</div>
        <div class="form-msg alert alert-danger hidden"></div>
      </div>
    `;
  },

  async handleClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const follow = button.dataset.action === 'follow';
    const unfollow = button.dataset.action === 'unfollow';
    if (!follow && !unfollow) return;

    button.disabled = true;
    try {
      const result = await api(`/mosques/${button.dataset.id}/follow`, {
        method: follow ? 'POST' : 'DELETE'
      });
      const mosque = this.list.find((m) => String(m._id) === String(button.dataset.id));
      if (mosque) {
        mosque.isFollowing = result.isFollowing;
        mosque.followersCount = result.followersCount;
      }
      this.draw();
    } catch (error) {
      const box = button.closest('.mosque-card').querySelector('.form-msg');
      box.textContent = error.message;
      box.classList.remove('hidden');
      button.disabled = false;
    }
  }
};

window.Mosques = Mosques;
