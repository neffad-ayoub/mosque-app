/**
 * التطبيق الرئيسي - المصليات الجامعية
 */

// التطبيق الرئيسي (api.js يوفّر API_URL و Session و api() و esc())
const App = {
  // الصفحة الحالية
  currentPage: 'home',
  
  // بيانات المستخدم
  user: null,
  
  // التهيئة الأولية
  init() {
    console.log('🚀 بدء تشغيل التطبيق...');
    
    // تحميل الإعدادات
    this.loadTheme();
    
    // إخفاء شاشة التحميل
    setTimeout(() => {
      this.hideLoadingScreen();
    }, 1000);
    
    // التحقق من تسجيل الدخول (يحوّل لصفحة الدخول إن لم يكن مسجلاً)
    if (!this.checkAuth()) return;
    
    // إعداد المستمعات
    this.setupEventListeners();
    this.applyRoleMenu();

    // تحميل الصفحة الافتراضية
    this.loadPage('home');
    
    // تحديث الدور وبيانات المصلى من السيرفر
    this.refreshUser();

    console.log('✅ تم تشغيل التطبيق بنجاح');
  },
  
  // إخفاء شاشة التحميل
  hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');
    
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
      loadingScreen.style.display = 'none';
      app.style.display = 'block';
    }, 300);
  },
  
  // التحقق من تسجيل الدخول
  checkAuth() {
    if (!Session.isLoggedIn()) {
      window.location.href = Session.loginUrl();
      return false;
    }
    
    this.user = Session.getUser();
    return true;
  },

  // تحديث بيانات المستخدم من السيرفر (الدور قد يتغير بعد استعمال كود)
  async refreshUser() {
    try {
      this.user = await api('/auth/me');
      localStorage.setItem('user', JSON.stringify(this.user));
      this.applyRoleMenu();
      if (this.currentPage === 'profile') Profile.render();
    } catch (error) {
      console.warn('تعذّر تحديث بيانات المستخدم:', error.message);
    }
  },

  // يُظهر عناصر القائمة الخاصة بدور المستخدم فقط (data-roles="role1,role2")
  applyRoleMenu() {
    const role = this.user && this.user.role;
    document.querySelectorAll('[data-roles]').forEach((el) => {
      el.classList.toggle('hidden', !el.dataset.roles.split(',').includes(role));
    });
  },
  
  // تحميل الثيم
  loadTheme() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
      document.body.classList.add('dark-mode');
      const themeBtn = document.getElementById('theme-toggle');
      if (themeBtn) themeBtn.textContent = '☀️';
    }
  },
  
  // تبديل الثيم
  toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    
    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.textContent = isDark ? '☀️' : '🌙';
    
    console.log('🎨 تم تغيير الثيم إلى:', isDark ? 'ليلي' : 'نهاري');
  },
  
  // إعداد المستمعات
  setupEventListeners() {
    // زر القائمة
    const menuBtn = document.getElementById('menu-btn');
    menuBtn.addEventListener('click', () => this.toggleSidebar());
    
    // زر الثيم
    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.addEventListener('click', () => this.toggleTheme());
    
    // زر إغلاق القائمة
    const closeSidebarBtn = document.getElementById('close-sidebar');
    closeSidebarBtn.addEventListener('click', () => this.toggleSidebar());
    
    // Overlay
    const overlay = document.getElementById('sidebar-overlay');
    overlay.addEventListener('click', () => this.toggleSidebar());
    
    // عناصر القائمة الجانبية
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.loadPage(page);
        this.toggleSidebar();
      });
    });
    
    // أزرار التنقل السفلية
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        this.loadPage(page);
      });
    });
    
    // زر تسجيل الخروج
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  },
  
  // فتح/إغلاق القائمة الجانبية
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
  },
  
  // تحميل صفحة
  loadPage(pageName) {
    console.log('📄 تحميل صفحة:', pageName);
    
    this.currentPage = pageName;
    
    // تحديث القائمة النشطة
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.page === pageName) {
        item.classList.add('active');
      }
    });
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.page === pageName) {
        btn.classList.add('active');
      }
    });
    
    // تحميل محتوى الصفحة
    const content = this.getPageContent(pageName);
    document.getElementById('main-content').innerHTML = content;
    
    // تنفيذ كود خاص بالصفحة
    this.initPage(pageName);
  },
  
  // الحصول على محتوى الصفحة
  getPageContent(pageName) {
    const pages = {
      home: this.getHomeContent(),
      'prayer-times': this.getPrayerTimesContent(),
      sebha: this.getSebhaContent(),
      athkar: this.getAthkarContent(),
      library: this.getLibraryContent(),
      announcements: this.getAnnouncementsContent(),
      profile: this.getProfileContent(),
      // تُرسم محتوياتها في mosques.js و manage.js
      mosques: '<div id="mosques-root"></div>',
      manage: '<div id="manage-root"></div>',
      committee: '<div id="committee-root"></div>'
    };
    
    return pages[pageName] || '<div class="card"><h2>الصفحة قيد التطوير</h2></div>';
  },
  
  // محتوى الصفحة الرئيسية
  getHomeContent() {
    return `
      <div class="welcome-section">
        <div class="card">
          <h1 class="text-center mb-3">🕌 مرحباً بك في تطبيق المصليات الجامعية</h1>
          <p class="text-center" style="color: var(--text-secondary); font-size: 18px;">
            وَأَقِمِ الصَّلَاةَ طَرَفَيِ النَّهَارِ وَزُلَفًا مِّنَ اللَّيْلِ
          </p>
        </div>
        
        <div class="home-pt" id="home-pt" onclick="App.loadPage('prayer-times')">
          <div>
            <div class="home-pt-note">الصلاة القادمة</div>
            <div class="home-pt-main"><span id="home-pt-name">—</span> <span id="home-pt-time"></span></div>
            <div class="home-pt-note" id="home-pt-note">جاري التحميل...</div>
          </div>
          <div class="home-pt-count" id="home-pt-count">--:--:--</div>
        </div>

        <div class="quick-access">
          <h2 class="mb-2" style="color: var(--text-primary);">الوصول السريع</h2>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
            <div class="quick-card" onclick="App.loadPage('prayer-times')">
              <div class="quick-icon">🕌</div>
              <h3>مواقيت الصلاة</h3>
            </div>
            
            <div class="quick-card" onclick="App.loadPage('sebha')">
              <div class="quick-icon">📿</div>
              <h3>السبحة</h3>
            </div>
            
            <div class="quick-card" onclick="App.loadPage('athkar')">
              <div class="quick-icon">📖</div>
              <h3>الأذكار</h3>
            </div>
            
            <div class="quick-card" onclick="App.loadPage('library')">
              <div class="quick-icon">📚</div>
              <h3>المكتبة</h3>
            </div>

            <div class="quick-card" onclick="App.loadPage('mosques')">
              <div class="quick-icon">🏛️</div>
              <h3>المصليات</h3>
            </div>
          </div>
        </div>
        
        <div class="card mt-3">
          <div class="card-header">
            <h2 class="card-title">📢 آخر الإعلانات</h2>
            <a href="#" onclick="App.loadPage('announcements')" style="color: var(--primary); text-decoration: none;">
              عرض الكل
            </a>
          </div>
          <div class="card-body">
            <p style="text-align: center; color: var(--text-light); padding: 20px;">
              لا توجد إعلانات حالياً
            </p>
          </div>
        </div>
      </div>
      
      <style>
        .quick-card {
          background: var(--card-bg);
          padding: 24px;
          border-radius: var(--radius-lg);
          text-align: center;
          cursor: pointer;
          transition: var(--transition);
          box-shadow: 0 2px 8px var(--shadow);
        }
        
        .quick-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 4px 15px var(--shadow-md);
        }
        
        .quick-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }
        
        .quick-card h3 {
          color: var(--text-primary);
          font-size: 16px;
        }
      </style>
    `;
  },
  
  // محتوى صفحة مواقيت الصلاة
  getPrayerTimesContent() {
    // المحتوى يُرسم في PrayerTimes.render() (prayer-times.js)
    return '<div class="prayer-times-page"><div id="prayer-root"></div></div>';
  },
  
  // محتوى صفحة السبحة
  getSebhaContent() {
    return `
      <div class="sebha-page">
        <div class="card">
          <h2 class="text-center mb-3">📿 السبحة الرقمية</h2>
          <p class="text-center" style="color: var(--text-secondary);">
            الصفحة قيد التطوير - سنضيف السبحة قريباً
          </p>
        </div>
      </div>
    `;
  },
  
  // محتوى صفحة الأذكار
  getAthkarContent() {
    return `
      <div class="athkar-page">
        <div class="card">
          <h2 class="text-center mb-3">📖 الأذكار</h2>
          <p class="text-center" style="color: var(--text-secondary);">
            الصفحة قيد التطوير - سنضيف الأذكار قريباً
          </p>
        </div>
      </div>
    `;
  },
  
  // محتوى صفحة المكتبة
  getLibraryContent() {
    return `
      <div class="library-page">
        <div class="card">
          <h2 class="text-center mb-3">📚 المكتبة</h2>
          <p class="text-center" style="color: var(--text-secondary);">
            الصفحة قيد التطوير - سنضيف المكتبة قريباً
          </p>
        </div>
      </div>
    `;
  },
  
  // محتوى صفحة الإعلانات
  getAnnouncementsContent() {
    return `
      <div class="announcements-page">
        <div class="card">
          <h2 class="text-center mb-3">📢 الإعلانات</h2>
          <p class="text-center" style="color: var(--text-secondary);">
            الصفحة قيد التطوير - سنضيف الإعلانات قريباً
          </p>
        </div>
      </div>
    `;
  },
  
  // محتوى صفحة الملف الشخصي
  getProfileContent() {
    // المحتوى يُرسم في Profile.render() (profile.js)
    return '<div class="profile-page"><div id="profile-root"></div></div>';
  },
  
  // تهيئة الصفحة بعد التحميل
  initPage(pageName) {
    if (pageName === 'home') PrayerTimes.renderMini();
    if (pageName === 'prayer-times') PrayerTimes.render();
    if (pageName === 'profile') Profile.render();
    if (pageName === 'mosques') Mosques.render();
    if (pageName === 'manage') Manage.render();
    if (pageName === 'committee') MyCommittee.render();
    console.log('✅ تم تهيئة صفحة:', pageName);
  },
  
  // تسجيل الخروج
  logout() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
      Session.clear();
      window.location.href = Session.loginUrl();
    }
  }
};

// تشغيل التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// تصدير للاستخدام العام
window.App = App;
