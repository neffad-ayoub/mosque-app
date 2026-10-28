/**
 * مواقيت الصلاة:
 *  - تُجلب من Aladhan (تقويم شهري كامل) وتُخزَّن في localStorage، فتعمل بلا إنترنت بعد أول جلب
 *  - الموقع: إحداثيات مصلى (يضيفها مسؤوله) أو GPS الجهاز
 *  - الصلاة القادمة والعد التنازلي بتوقيت الموقع نفسه (لا بتوقيت الجهاز)
 *  - تنبيه قبل الأذان بالإشعارات (يعمل والتطبيق مفتوح)
 * يعتمد على api.js (api, esc) وعلى App.user.
 */
const PrayerTimes = {
  // الصلوات الخمس + الشروق (للعرض فقط، لا يدخل في «الصلاة القادمة»)
  PRAYERS: [
    { key: 'Fajr', name: 'الفجر' },
    { key: 'Sunrise', name: 'الشروق' },
    { key: 'Dhuhr', name: 'الظهر' },
    { key: 'Asr', name: 'العصر' },
    { key: 'Maghrib', name: 'المغرب' },
    { key: 'Isha', name: 'العشاء' }
  ],
  FIVE: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'],

  // معرّفات طرق الحساب في Aladhan
  METHODS: [
    [19, 'الجزائر (وزارة الشؤون الدينية)'],
    [3, 'رابطة العالم الإسلامي'],
    [4, 'أم القرى (مكة)'],
    [5, 'الهيئة المصرية العامة للمساحة'],
    [1, 'جامعة العلوم الإسلامية بكراتشي'],
    [2, 'أمريكا الشمالية (ISNA)'],
    [21, 'المغرب'],
    [18, 'تونس']
  ],
  DEFAULT_METHOD: 19,
  REMINDER_OPTIONS: [[0, 'عند دخول الوقت'], [5, 'قبل 5 دقائق'], [10, 'قبل 10 دقائق'], [15, 'قبل 15 دقيقة'], [30, 'قبل 30 دقيقة']],

  CACHE_PREFIX: 'pt:v1:',
  SETTINGS_KEY: 'pt:settings',

  now: () => new Date(), // يُستبدل في الاختبارات

  state: null,       // آخر بيانات محمّلة: { loc, method, tz, year, month, data, tomorrow }
  mosques: [],       // مصليات لها إحداثيات (للقائمة)
  mosquesWithoutCoords: 0,
  timer: null,
  fired: {},         // تنبيهات أُرسلت اليوم (لمنع التكرار)
  loading: null,
  inflight: null,

  // ===================== تخزين محلي (لا يرمي أخطاء أبداً) =====================
  store: {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ممتلئ أو ممنوع */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* تجاهل */ }
    },
    keys() {
      try { return Object.keys(localStorage); } catch { return []; }
    }
  },

  getSettings() {
    const saved = this.store.get(this.SETTINGS_KEY) || {};
    return {
      source: saved.source || null,           // 'mosque' | 'gps' | null (تلقائي)
      mosqueId: saved.mosqueId || null,
      gps: saved.gps || null,                 // { lat, lon }
      method: saved.method || this.DEFAULT_METHOD,
      reminder: { on: false, minutes: 10, ...(saved.reminder || {}) },
      lastLoc: saved.lastLoc || null          // آخر موقع نجح (للعمل بلا إنترنت)
    };
  },

  saveSettings(settings) {
    this.store.set(this.SETTINGS_KEY, settings);
  },

  // ===================== دوال نقية (قابلة للاختبار) =====================

  /** "05:30 (+01)" ← 330 (دقائق منذ منتصف الليل). null إن لم يكن وقتاً صالحاً */
  parseMinutes(value) {
    const m = /(\d{1,2}):(\d{2})/.exec(String(value == null ? '' : value));
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  },

  /** يحوّل يوماً واحداً من رد Aladhan إلى شكل بسيط */
  parseDay(raw, index) {
    const greg = (raw.date && raw.date.gregorian) || {};
    const day = parseInt(greg.day, 10) || index + 1;

    const t = {};
    for (const p of this.PRAYERS) t[p.key] = this.parseMinutes(raw.timings && raw.timings[p.key]);

    const h = raw.date && raw.date.hijri;
    const hijri = h
      ? [h.weekday && h.weekday.ar, parseInt(h.day, 10) || '', h.month && h.month.ar, h.year, 'هـ']
        .filter((x) => x !== '' && x != null).join(' ')
      : '';

    return { day, t, hijri };
  },

  /** يتحقق من رد الشهر. يرمي رسالة عربية واضحة إن لم يطابق المتوقع */
  parseMonth(json, year, month) {
    if (!json || !Array.isArray(json.data) || !json.data.length) {
      throw new Error('رد خدمة المواقيت غير متوقع');
    }
    const days = json.data.map((d, i) => this.parseDay(d, i));

    for (const d of days) {
      for (const key of this.FIVE) {
        if (d.t[key] == null) throw new Error('رد خدمة المواقيت غير متوقع (وقت ناقص)');
      }
    }

    const meta = json.data[0].meta || {};
    return { year, month, tz: meta.timezone || null, days };
  },

  /** الوقت الحالي في منطقة زمنية معينة: { year, month, day, seconds } */
  zoneNow(tz) {
    const date = this.now();
    let parts;
    try {
      parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz || undefined, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(date);
    } catch {
      parts = new Intl.DateTimeFormat('en-CA', {
        hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(date);
    }
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    return {
      year: get('year'), month: get('month'), day: get('day'),
      seconds: get('hour') * 3600 + get('minute') * 60 + get('second')
    };
  },

  /**
   * الصلاة القادمة. بعد العشاء ترجع فجر الغد.
   * @param data      بيانات الشهر الحالي
   * @param zone      zoneNow()
   * @param tomorrow  بيانات الشهر التالي (تُستعمل فقط في آخر يوم من الشهر)
   */
  computeNext(data, zone, tomorrow) {
    const today = data.days.find((d) => d.day === zone.day);
    if (!today) return null;

    for (const key of this.FIVE) {
      const at = today.t[key] * 60;
      if (at > zone.seconds) {
        return { key, seconds: at - zone.seconds, minutes: today.t[key], tomorrow: false };
      }
    }

    const nextDay =
      data.days.find((d) => d.day === zone.day + 1) ||
      (tomorrow && tomorrow.days[0]) ||
      today; // احتياط: نفس أوقات اليوم تقريباً
    return {
      key: 'Fajr',
      seconds: 86400 - zone.seconds + nextDay.t.Fajr * 60,
      minutes: nextDay.t.Fajr,
      tomorrow: true
    };
  },

  fmtTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  },

  fmtCountdown(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return [h, m, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  },

  nameOf(key) {
    const p = this.PRAYERS.find((x) => x.key === key);
    return p ? p.name : key;
  },

  hasCoords(m) {
    return Boolean(m.location) && typeof m.location.latitude === 'number' && typeof m.location.longitude === 'number';
  },

  // ===================== الجلب والكاش =====================

  cacheKey(loc, method, year, month) {
    return `${this.CACHE_PREFIX}${loc.lat.toFixed(3)}:${loc.lon.toFixed(3)}:${method}:${year}-${month}`;
  },

  /** يحذف شهوراً قديمة من الكاش كي لا يمتلئ التخزين */
  prune(year, month) {
    const current = year * 12 + month;
    for (const key of this.store.keys()) {
      if (!key.startsWith(this.CACHE_PREFIX)) continue;
      const ym = /(\d{4})-(\d{1,2})$/.exec(key);
      if (ym && Number(ym[1]) * 12 + Number(ym[2]) < current) this.store.remove(key);
    }
  },

  async fetchMonth(loc, method, year, month) {
    const url = `https://api.aladhan.com/v1/calendar/${year}/${month}` +
      `?latitude=${loc.lat}&longitude=${loc.lon}&method=${method}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch {
      throw new Error('تعذّر الاتصال بخدمة المواقيت. تحقق من الإنترنت.');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error('خدمة المواقيت لا تستجيب حالياً. حاول لاحقاً.');

    let json = null;
    try { json = await response.json(); } catch { /* يعالجه parseMonth */ }
    return this.parseMonth(json, year, month);
  },

  /** من الكاش إن وُجد (الأوقات ثابتة لنفس الشهر والموقع والطريقة)، وإلا من الشبكة */
  async getMonth(loc, method, year, month) {
    const key = this.cacheKey(loc, method, year, month);
    const cached = this.store.get(key);
    if (cached && Array.isArray(cached.days) && cached.days.length) return cached;

    let data;
    try {
      data = await this.fetchMonth(loc, method, year, month);
    } catch (error) {
      throw new Error(`${error.message} ولا توجد بيانات محفوظة لهذا الشهر.`);
    }
    this.store.set(key, data);
    return data;
  },

  // ===================== الموقع =====================

  locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error('هذا المتصفح لا يدعم تحديد الموقع'));
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({
          lat: Math.round(p.coords.latitude * 10000) / 10000,
          lon: Math.round(p.coords.longitude * 10000) / 10000
        }),
        (e) => reject(new Error(e && e.code === 1
          ? 'رُفض إذن الموقع. اسمح به من إعدادات المتصفح ثم أعد المحاولة.'
          : 'تعذّر تحديد موقعك. جرّب مصلى من القائمة.')),
        { timeout: 10000, maximumAge: 600000 }
      );
    });
  },

  /**
   * يحدد الموقع المستعمل: اختيار المستخدم، وإلا مصلاه، وإلا مصلى يتابعه، وإلا آخر موقع ناجح.
   * @param quick  إن وُجد آخر موقع ناجح نستعمله بلا طلب للسيرفر (للبطاقة في الرئيسية)
   */
  async resolveLocation(settings, quick = false) {
    if (quick && settings.lastLoc) return settings.lastLoc;

    let all = null;
    try {
      all = await api('/mosques');
    } catch {
      // بلا إنترنت أو السيرفر نائم: نكمل بآخر موقع محفوظ
      return settings.lastLoc || null;
    }

    this.mosques = all.filter((m) => this.hasCoords(m));
    this.mosquesWithoutCoords = all.length - this.mosques.length;
    const asLoc = (m) => ({
      lat: m.location.latitude, lon: m.location.longitude,
      label: m.name, source: 'mosque', mosqueId: m._id
    });

    if (settings.source === 'gps' && settings.gps) {
      return { lat: settings.gps.lat, lon: settings.gps.lon, label: 'موقعي الحالي', source: 'gps' };
    }
    if (settings.source === 'mosque') {
      const chosen = this.mosques.find((m) => String(m._id) === String(settings.mosqueId));
      if (chosen) return asLoc(chosen);
    }

    const tiedId = App.user && App.user.mosqueId;
    const tied = tiedId && this.mosques.find((m) => String(m._id) === String(tiedId));
    if (tied) return asLoc(tied);
    const followed = this.mosques.find((m) => m.isFollowing);
    if (followed) return asLoc(followed);

    return settings.lastLoc || null;
  },

  // ===================== تحميل الحالة =====================

  /** يحمّل الموقع وبيانات الشهر ويبدأ المؤقّت. يرجع null إن لم يوجد موقع */
  async ensureState({ quick = false } = {}) {
    // طلبات متزامنة بنفس الإعدادات (البطاقة + الصفحة) تتشارك تحميلاً واحداً
    const sig = JSON.stringify([this.getSettings(), quick]);
    if (this.inflight && this.inflight.sig === sig) return this.inflight.promise;
    const promise = this.loadState({ quick }).finally(() => {
      if (this.inflight && this.inflight.promise === promise) this.inflight = null;
    });
    this.inflight = { sig, promise };
    return promise;
  },

  async loadState({ quick }) {
    const settings = this.getSettings();
    const loc = await this.resolveLocation(settings, quick);
    if (!loc) {
      this.state = null;
      return null;
    }

    const method = settings.method;
    const first = this.zoneNow(null);
    let data = await this.getMonth(loc, method, first.year, first.month);

    // الشهر عند الموقع قد يختلف عن شهر الجهاز (فرق التوقيت)
    let zone = this.zoneNow(data.tz);
    if (zone.year !== data.year || zone.month !== data.month) {
      data = await this.getMonth(loc, method, zone.year, zone.month);
      zone = this.zoneNow(data.tz);
    }

    // آخر يوم في الشهر: نحتاج الشهر التالي لحساب فجر الغد
    let tomorrow = null;
    const nextYear = zone.month === 12 ? zone.year + 1 : zone.year;
    const nextMonth = zone.month === 12 ? 1 : zone.month + 1;
    if (zone.day >= data.days.length || zone.day >= 25) {
      try {
        tomorrow = await this.getMonth(loc, method, nextYear, nextMonth);
      } catch { /* اختياري */ }
    }

    this.prune(zone.year, zone.month);
    this.state = { loc, method, tz: data.tz, year: data.year, month: data.month, data, tomorrow };

    // نحفظ الموقع كآخر موقع ناجح (للعمل بلا إنترنت)
    const fresh = this.getSettings();
    fresh.lastLoc = { lat: loc.lat, lon: loc.lon, label: loc.label, source: loc.source, mosqueId: loc.mosqueId };
    this.saveSettings(fresh);

    this.startTicker();
    return this.state;
  },

  startTicker() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000);
  },

  // ===================== التحديث كل ثانية =====================

  tick() {
    const s = this.state;
    if (!s) return;

    const zone = this.zoneNow(s.tz);

    // تغيّر الشهر (منتصف الليل في آخر الشهر): نعيد التحميل
    if (zone.year !== s.year || zone.month !== s.month) {
      if (!this.loading) {
        this.loading = this.ensureState({ quick: true })
          .catch(() => {})
          .finally(() => { this.loading = null; });
      }
      return;
    }

    const next = this.computeNext(s.data, zone, s.tomorrow);
    if (!next) return;

    this.updateDom(next);
    this.checkReminders(zone, s);
  },

  setText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  },

  updateDom(next) {
    const name = this.nameOf(next.key) + (next.tomorrow ? ' (غداً)' : '');
    const time = this.fmtTime(next.minutes);
    const count = this.fmtCountdown(next.seconds);

    this.setText('pt-next-name', name);
    this.setText('pt-next-time', time);
    this.setText('pt-countdown', count);
    this.setText('home-pt-name', name);
    this.setText('home-pt-time', time);
    this.setText('home-pt-count', count);

    document.querySelectorAll('.pt-row[data-prayer]').forEach((row) => {
      row.classList.toggle('next', !next.tomorrow && row.dataset.prayer === next.key);
    });
  },

  // ===================== التنبيهات =====================

  notificationsSupported() {
    return typeof Notification !== 'undefined';
  },

  checkReminders(zone, s) {
    const { reminder } = this.getSettings();
    if (!reminder.on || !this.notificationsSupported() || Notification.permission !== 'granted') return;

    const today = s.data.days.find((d) => d.day === zone.day);
    if (!today) return;
    const dayKey = `${zone.year}-${zone.month}-${zone.day}`;

    for (const key of this.FIVE) {
      const left = today.t[key] * 60 - zone.seconds;
      const id = `${dayKey}:${key}:${reminder.minutes}`;
      // داخل نافذة التنبيه ولم نرسله بعد
      if (left <= reminder.minutes * 60 && left > -60 && !this.fired[id]) {
        this.fired[id] = true;
        const title = reminder.minutes === 0
          ? `حان وقت صلاة ${this.nameOf(key)}`
          : `قريباً: صلاة ${this.nameOf(key)}`;
        const body = reminder.minutes === 0
          ? `الساعة ${this.fmtTime(today.t[key])} — ${s.loc.label}`
          : `بعد ${Math.max(1, Math.round(left / 60))} دقيقة (${this.fmtTime(today.t[key])}) — ${s.loc.label}`;
        try { new Notification(title, { body, tag: id }); } catch { /* تجاهل */ }
      }
    }
  },

  async requestNotifications() {
    if (!this.notificationsSupported()) return 'unsupported';
    try { return await Notification.requestPermission(); } catch { return 'denied'; }
  },

  // ===================== صفحة المواقيت =====================

  async render() {
    const root = document.getElementById('prayer-root');
    if (!root) return;

    root.innerHTML = '<p class="empty">جاري تحميل المواقيت...</p>';
    root.onchange = (e) => this.handleChange(e);
    root.onclick = (e) => this.handleClick(e);

    let error = null;
    try {
      await this.ensureState();
    } catch (e) {
      error = e.message;
      this.state = null;
    }
    this.draw(error);
  },

  settingsHtml() {
    const settings = this.getSettings();
    const loc = this.state && this.state.loc;
    const sel = loc ? (loc.source === 'gps' ? 'gps' : `mosque:${loc.mosqueId}`) : '';

    const options = [
      !loc ? '<option value="">— اختر الموقع —</option>' : '',
      ...this.mosques.map((m) => {
        const value = `mosque:${m._id}`;
        const city = m.location.city ? ' — ' + m.location.city : '';
        return `<option value="${esc(value)}" ${value === sel ? 'selected' : ''}>${esc(m.name + city)}</option>`;
      }),
      `<option value="gps" ${sel === 'gps' ? 'selected' : ''}>📍 موقعي الحالي (GPS)</option>`
    ].join('');

    const methods = this.METHODS
      .map(([id, label]) => `<option value="${id}" ${id === settings.method ? 'selected' : ''}>${esc(label)}</option>`)
      .join('');

    const r = settings.reminder;
    const reminderValue = r.on ? String(r.minutes) : 'off';
    const reminders = [['off', 'بلا تنبيه'], ...this.REMINDER_OPTIONS.map(([m, l]) => [String(m), l])]
      .map(([v, l]) => `<option value="${v}" ${v === reminderValue ? 'selected' : ''}>${esc(l)}</option>`)
      .join('');

    let notifyNote = '';
    if (r.on) {
      if (!this.notificationsSupported()) {
        notifyNote = '<p class="hint">هذا المتصفح لا يدعم الإشعارات.</p>';
      } else if (Notification.permission !== 'granted') {
        notifyNote = '<button class="btn btn-outline btn-sm" data-action="allow-notifications">السماح بالإشعارات</button>';
      } else {
        notifyNote = '<p class="hint">يعمل والتطبيق مفتوح. التنبيه وهو مغلق يأتي مع نسخة الهاتف.</p>';
      }
    }

    return `
      <div class="card pt-settings">
        <div class="card-header"><h3 class="card-title">⚙️ الإعدادات</h3></div>
        <div class="form-group">
          <label class="form-label">موقع المواقيت</label>
          <select class="form-input" id="pt-source">${options}</select>
          ${this.mosquesWithoutCoords
            ? `<p class="hint">${esc(this.mosquesWithoutCoords)} مصلى بلا إحداثيات لا يظهر هنا. يضيفها مسؤول المصلى من «إدارة المصلى».</p>`
            : ''}
        </div>
        <div class="form-group">
          <label class="form-label">طريقة الحساب</label>
          <select class="form-input" id="pt-method">${methods}</select>
        </div>
        <div class="form-group">
          <label class="form-label">التنبيه</label>
          <select class="form-input" id="pt-reminder">${reminders}</select>
          ${notifyNote}
        </div>
      </div>
    `;
  },

  draw(error) {
    const root = document.getElementById('prayer-root');
    if (!root) return;

    const s = this.state;
    let body = '';

    if (error) {
      body = `<div class="alert alert-danger">${esc(error)}</div>
              <button class="btn btn-primary btn-sm" data-action="retry">إعادة المحاولة</button>`;
    } else if (!s) {
      body = `<div class="card"><p class="empty">
                لم يتم تحديد موقع بعد. اختر مصلى من الإعدادات أدناه، أو اضغط «موقعي الحالي».
              </p></div>`;
    } else {
      const zone = this.zoneNow(s.tz);
      const today = s.data.days.find((d) => d.day === zone.day);
      const next = this.computeNext(s.data, zone, s.tomorrow);
      const greg = new Date(zone.year, zone.month - 1, zone.day)
        .toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      const rows = this.PRAYERS.map((p) => `
        <div class="pt-row ${next && !next.tomorrow && next.key === p.key ? 'next' : ''}" data-prayer="${esc(p.key)}">
          <span class="pt-row-name">${esc(p.name)}</span>
          <span class="pt-row-time">${esc(this.fmtTime(today.t[p.key] == null ? 0 : today.t[p.key]))}</span>
        </div>`).join('');

      body = `
        <div class="pt-next-card">
          <div class="pt-loc">📍 ${esc(s.loc.label)}</div>
          <div class="pt-next-label">الصلاة القادمة</div>
          <div class="pt-next-main"><span id="pt-next-name">—</span> <span id="pt-next-time"></span></div>
          <div class="pt-countdown" id="pt-countdown">--:--:--</div>
        </div>
        <div class="pt-dates">
          <div>${esc(greg)}</div>
          ${today.hijri ? `<div class="pt-hijri">${esc(today.hijri)}</div>` : ''}
        </div>
        <div class="card pt-list">${rows}</div>`;
    }

    root.innerHTML = `
      <h2 class="page-title">🕌 مواقيت الصلاة</h2>
      ${body}
      ${this.settingsHtml()}
    `;

    this.tick();
  },

  async handleChange(event) {
    const el = event.target;
    const settings = this.getSettings();

    if (el.id === 'pt-source') {
      if (!el.value) return;
      if (el.value === 'gps') {
        try {
          const pos = await this.locate();
          settings.source = 'gps';
          settings.gps = pos;
        } catch (e) {
          this.draw(e.message);
          return;
        }
      } else {
        settings.source = 'mosque';
        settings.mosqueId = el.value.replace('mosque:', '');
      }
    } else if (el.id === 'pt-method') {
      settings.method = Number(el.value) || this.DEFAULT_METHOD;
    } else if (el.id === 'pt-reminder') {
      settings.reminder = el.value === 'off'
        ? { ...settings.reminder, on: false }
        : { on: true, minutes: Number(el.value) };
      this.fired = {};
      this.saveSettings(settings);
      if (el.value !== 'off' && this.notificationsSupported() && Notification.permission === 'default') {
        await this.requestNotifications();
      }
      this.draw(null);
      return;
    } else {
      return;
    }

    this.saveSettings(settings);
    await this.render();
  },

  async handleClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    if (button.dataset.action === 'retry') {
      await this.render();
    } else if (button.dataset.action === 'allow-notifications') {
      await this.requestNotifications();
      this.draw(null);
    }
  },

  // ===================== بطاقة الرئيسية =====================

  async renderMini() {
    if (!document.getElementById('home-pt')) return;

    // نعرض فوراً ما لدينا ثم نحدّث
    if (this.state) this.tick();

    try {
      if (!this.state) await this.ensureState({ quick: true });
    } catch (e) {
      this.setText('home-pt-note', e.message);
      return;
    }

    if (!this.state) {
      this.setText('home-pt-note', 'اختر موقعك لعرض المواقيت');
      return;
    }
    this.setText('home-pt-note', '📍 ' + this.state.loc.label);
    this.tick();
  }
};

window.PrayerTimes = PrayerTimes;
