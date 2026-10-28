/**
 * اختبار شامل لتدفق الحسابات والأكواد على السيرفر الحقيقي + MongoDB.
 *
 * قبل التشغيل:
 *   1) شغّل MongoDB والسيرفر (npm run dev)
 *   2) أنشئ حساب المسؤول الأعلى مرة واحدة:
 *        npm run create-admin -- "Admin" admin@test.com "Admin12345"
 * ثم:
 *   npm run smoke-test
 *
 * متغيرات اختيارية: API_URL, ADMIN_EMAIL, ADMIN_PASSWORD
 */
const BASE = process.env.API_URL || 'http://localhost:5000/api';
const ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@test.com',
  password: process.env.ADMIN_PASSWORD || 'Admin12345'
};

let failures = 0;
const check = (name, condition, extra = '') => {
  if (condition) {
    console.log('  ✓', name);
  } else {
    failures++;
    console.log('  ✗', name, extra);
  }
};

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

(async () => {
  const stamp = Date.now();
  const emailA = `user.a.${stamp}@test.com`;
  const emailB = `user.b.${stamp}@test.com`;
  const pass = 'Password123';
  const mosque = { name: 'مصلى الاختبار', universityName: 'جامعة الاختبار', city: 'أدرار' };

  console.log('التسجيل والدخول');
  let r = await call('POST', '/auth/register', { name: 'مستخدم أ', email: emailA, password: pass });
  check('تسجيل حساب جديد → 201 ودور general_user', r.status === 201 && r.data.user?.role === 'general_user', JSON.stringify(r.data));
  const tokenA = r.data.token;

  r = await call('POST', '/auth/register', { name: 'مكرر', email: emailA, password: pass });
  check('بريد مكرر → 409', r.status === 409, `status=${r.status}`);

  r = await call('POST', '/auth/register', { name: 'مخادع', email: `h.${stamp}@test.com`, password: pass, role: 'super_admin' });
  check('محاولة تمرير role=super_admin عند التسجيل تُتجاهل', r.status === 201 && r.data.user?.role === 'general_user', JSON.stringify(r.data));

  r = await call('POST', '/auth/login', { email: emailA, password: 'wrong-password' });
  check('كلمة مرور خاطئة → 401', r.status === 401, `status=${r.status}`);

  r = await call('POST', '/auth/login', { email: emailA.toUpperCase(), password: pass });
  check('دخول صحيح (البريد غير حساس لحالة الأحرف) → 200 وتوكن', r.status === 200 && !!r.data.token, JSON.stringify(r.data));

  r = await call('GET', '/auth/me', undefined, tokenA);
  check('/auth/me يرجع البيانات بدون كلمة المرور', r.status === 200 && r.data.email === emailA && r.data.password === undefined, JSON.stringify(r.data));

  console.log('الصلاحيات');
  r = await call('GET', '/codes', undefined, tokenA);
  check('المستخدم العام لا يصل لمسارات الأكواد → 403', r.status === 403, `status=${r.status}`);

  r = await call('POST', '/auth/login', ADMIN);
  if (r.status !== 200) {
    console.log(`\n✗ تعذّر دخول المسؤول الأعلى (${ADMIN.email}).`);
    console.log('  أنشئه أولاً: npm run create-admin -- "Admin" admin@test.com "Admin12345"');
    process.exit(1);
  }
  check('دخول المسؤول الأعلى', r.data.user.role === 'super_admin');
  const tokenAdmin = r.data.token;

  console.log('تدفق الأكواد');
  r = await call('POST', '/codes', { note: 'اختبار' }, tokenAdmin);
  check('المسؤول الأعلى يولّد كوداً بالشكل MSJD-XXXX-XXXX', r.status === 201 && /^MSJD-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(r.data.code || ''), JSON.stringify(r.data));
  const code = r.data.code;

  r = await call('POST', '/auth/redeem-code', { code: 'MSJD-XXXX-XXXX', mosque }, tokenA);
  check('كود غير موجود → 400', r.status === 400, `status=${r.status}`);

  r = await call('POST', '/auth/redeem-code', { code, mosque: { name: '', universityName: '' } }, tokenA);
  check('بيانات مصلى ناقصة → 400 (والكود لا يُستهلك)', r.status === 400, `status=${r.status}`);

  r = await call('POST', '/auth/redeem-code', { code: code.toLowerCase(), mosque }, tokenA);
  check('كود صحيح (بأحرف صغيرة) → 201', r.status === 201, JSON.stringify(r.data));

  r = await call('GET', '/auth/me', undefined, tokenA);
  check('الدور صار mosque_admin ويظهر المصلى', r.data.role === 'mosque_admin' && r.data.mosque?.name === mosque.name, JSON.stringify(r.data));

  r = await call('POST', '/auth/register', { name: 'مستخدم ب', email: emailB, password: pass });
  const tokenB = r.data.token;
  r = await call('POST', '/auth/redeem-code', { code, mosque }, tokenB);
  check('إعادة استعمال نفس الكود → 400', r.status === 400, `status=${r.status}`);

  r = await call('POST', '/codes', {}, tokenAdmin);
  const spare = r.data;
  r = await call('POST', '/auth/redeem-code', { code: spare.code, mosque }, tokenA);
  check('مسؤول المصلى لا يستعمل كوداً جديداً (يملك صلاحية بالفعل) → 400', r.status === 400, `status=${r.status}`);

  r = await call('GET', '/codes', undefined, tokenAdmin);
  const used = (r.data || []).find((c) => c.code === code);
  check('الكود يظهر مستعملاً مع اسم صاحبه والمصلى', used?.isUsed === true && used.usedBy?.email === emailA && used.mosqueId?.name === mosque.name, JSON.stringify(used));

  r = await call('DELETE', `/codes/${used?._id}`, undefined, tokenAdmin);
  check('لا يمكن إلغاء كود مستعمل → 404', r.status === 404, `status=${r.status}`);

  r = await call('DELETE', `/codes/${spare._id}`, undefined, tokenAdmin);
  check('إلغاء كود غير مستعمل → 200', r.status === 200, `status=${r.status}`);
  r = await call('POST', '/auth/redeem-code', { code: spare.code, mosque }, tokenB);
  check('الكود الملغى لا يعمل → 400', r.status === 400, `status=${r.status}`);

  // ================= المرحلة 3: المصليات واللجان =================
  const signup = async (label) => {
    const email = `${label}.${stamp}@test.com`;
    const res = await call('POST', '/auth/register', { name: label, email, password: pass });
    return { email, token: res.data.token, id: res.data.user.id };
  };
  const roleOf = async (token) => (await call('GET', '/auth/me', undefined, token)).data;

  r = await call('GET', '/auth/me', undefined, tokenA);
  const mosqueId = r.data.mosqueId;
  const head = await signup('head');
  const member = await signup('member');
  const spectator = await signup('spectator');

  console.log('المصليات والمتابعة');
  r = await call('GET', '/mosques', undefined, spectator.token);
  const listed = (r.data || []).find((m) => m._id === mosqueId);
  check('المصلى يظهر في القائمة، ومسؤوله متابع له', listed && listed.followersCount === 1 && listed.isFollowing === false && listed.admin === undefined && listed.members === undefined, JSON.stringify(listed));

  r = await call('POST', `/mosques/${mosqueId}/follow`, {}, spectator.token);
  check('متابعة مصلى → العدد 2', r.status === 200 && r.data.followersCount === 2, JSON.stringify(r.data));
  r = await call('POST', `/mosques/${mosqueId}/follow`, {}, spectator.token);
  check('المتابعة مرتين لا تكرر المتابع (العدد يبقى 2)', r.data.followersCount === 2, JSON.stringify(r.data));
  r = await call('DELETE', `/mosques/${mosqueId}/follow`, undefined, spectator.token);
  check('إلغاء المتابعة → العدد 1', r.status === 200 && r.data.followersCount === 1, JSON.stringify(r.data));
  r = await call('DELETE', `/mosques/${mosqueId}/follow`, undefined, tokenA);
  check('مسؤول المصلى لا يلغي متابعة مصلاه → 400', r.status === 400, `status=${r.status}`);
  r = await call('GET', '/mosques/not-an-id', undefined, tokenA);
  check('معرّف مصلى غير صالح → 400', r.status === 400, `status=${r.status}`);

  console.log('تعديل المصلى');
  r = await call('PATCH', `/mosques/${mosqueId}`, { name: 'اختراق' }, spectator.token);
  check('مستخدم عام لا يعدّل المصلى → 403', r.status === 403, `status=${r.status}`);
  r = await call('PATCH', `/mosques/${mosqueId}`, { name: 'مصلى معدّل', latitude: '27.87', longitude: '-0.28', adminId: spectator.id, isActive: false }, tokenA);
  check('المسؤول يعدّل المصلى والإحداثيات (وتُتجاهل adminId/isActive)', r.status === 200 && r.data.name === 'مصلى معدّل' && r.data.location.latitude === 27.87, JSON.stringify(r.data));
  r = await call('GET', '/mosques', undefined, tokenA);
  check('المصلى لم يُعطَّل بعد محاولة isActive:false', (r.data || []).some((m) => m._id === mosqueId));
  check('مسؤول المصلى بقي مسؤولاً (adminId لم يتغير)', (await roleOf(tokenA)).role === 'mosque_admin');
  r = await call('PATCH', `/mosques/${mosqueId}`, { latitude: 120 }, tokenA);
  check('خط عرض خارج المدى → 400', r.status === 400, `status=${r.status}`);

  console.log('إنشاء اللجان');
  r = await call('POST', '/committees', { name: 'لجنة', adminEmail: head.email }, spectator.token);
  check('مستخدم عام لا ينشئ لجنة → 403', r.status === 403, `status=${r.status}`);
  r = await call('POST', '/committees', { name: 'لجنة الإعلام', adminEmail: `nobody.${stamp}@test.com` }, tokenA);
  check('رئيس بريده غير مسجّل → 404', r.status === 404, `status=${r.status}`);
  r = await call('POST', '/committees', { name: 'لجنة الإعلام', adminEmail: ADMIN.email }, tokenA);
  check('لا يمكن تعيين المسؤول الأعلى رئيس لجنة → 400', r.status === 400, `status=${r.status}`);
  r = await call('POST', '/auth/login', ADMIN);
  check('المسؤول الأعلى ما زال super_admin (لم يُخفَّض)', r.data.user?.role === 'super_admin');
  r = await call('POST', '/committees', { name: 'لجنة الإعلام', adminEmail: emailA }, tokenA);
  check('لا يمكن تعيين مسؤول المصلى نفسه رئيس لجنة → 400', r.status === 400, `status=${r.status}`);
  check('مسؤول المصلى ما زال mosque_admin', (await roleOf(tokenA)).role === 'mosque_admin');

  r = await call('POST', '/committees', { name: 'لجنة الإعلام', description: 'وصف', adminEmail: head.email }, tokenA);
  check('إنشاء لجنة بتعيين رئيسها → 201', r.status === 201 && !!r.data.committee?._id, JSON.stringify(r.data));
  const committeeId = r.data.committee?._id;
  let me = await roleOf(head.token);
  check('الرئيس صار committee_admin ومرتبطاً بالمصلى واللجنة', me.role === 'committee_admin' && me.mosqueId === mosqueId && me.committee?.name === 'لجنة الإعلام', JSON.stringify(me));

  r = await call('POST', '/committees', { name: 'لجنة الإعلام', adminEmail: spectator.email }, tokenA);
  check('اسم لجنة مكرر في نفس المصلى → 409', r.status === 409, `status=${r.status}`);
  check('الحساب المرفوض بقي مستخدماً عاماً (لا تسرّب حجز)', (await roleOf(spectator.token)).role === 'general_user');
  r = await call('POST', '/committees', { name: 'لجنة أخرى', adminEmail: head.email }, tokenA);
  check('رئيس لجنة لا يُعيَّن رئيساً لأخرى → 400', r.status === 400, `status=${r.status}`);

  r = await call('GET', `/committees/mosque/${mosqueId}`, undefined, tokenA);
  check('مسؤول المصلى يرى لجانه بتفاصيل رؤسائها', r.status === 200 && r.data.length === 1 && r.data[0].admin?.email === head.email, JSON.stringify(r.data));
  r = await call('GET', `/committees/mosque/${mosqueId}`, undefined, head.token);
  check('رئيس اللجنة لا يرى قائمة لجان المصلى → 403', r.status === 403, `status=${r.status}`);

  console.log('أعضاء اللجنة');
  r = await call('POST', `/committees/${committeeId}/members`, { email: member.email }, spectator.token);
  check('مستخدم عام لا يضيف أعضاء → 403', r.status === 403, `status=${r.status}`);
  r = await call('POST', `/committees/${committeeId}/members`, { email: ADMIN.email }, head.token);
  check('لا يُضاف المسؤول الأعلى عضواً → 400', r.status === 400, `status=${r.status}`);
  r = await call('POST', `/committees/${committeeId}/members`, { email: emailA }, head.token);
  check('لا يُضاف مسؤول المصلى عضواً → 400', r.status === 400, `status=${r.status}`);
  check('مسؤول المصلى ما زال mosque_admin بعد المحاولة', (await roleOf(tokenA)).role === 'mosque_admin');

  r = await call('POST', `/committees/${committeeId}/members`, { email: member.email.toUpperCase() }, head.token);
  check('رئيس اللجنة يضيف عضواً (البريد غير حساس لحالة الأحرف) → 201', r.status === 201, JSON.stringify(r.data));
  me = await roleOf(member.token);
  check('العضو صار committee_member مرتبطاً بالمصلى واللجنة', me.role === 'committee_member' && me.mosqueId === mosqueId && me.committee?.name === 'لجنة الإعلام', JSON.stringify(me));
  r = await call('POST', `/committees/${committeeId}/members`, { email: member.email }, head.token);
  check('إضافة نفس العضو مرتين → 400', r.status === 400, `status=${r.status}`);
  r = await call('POST', `/committees/${committeeId}/members`, { email: spectator.email }, member.token);
  check('عضو اللجنة العادي لا يضيف أعضاء → 403', r.status === 403, `status=${r.status}`);

  r = await call('GET', '/committees/mine', undefined, member.token);
  check('العضو يرى لجنته بأسماء فقط (بلا بريد أحد) وcanManage=false', r.status === 200 && r.data.canManage === false && r.data.members.every((m) => m.email === undefined) && r.data.admin.email === undefined, JSON.stringify(r.data));
  r = await call('GET', '/committees/mine', undefined, head.token);
  check('الرئيس يرى لجنته ببريد الأعضاء وcanManage=true', r.status === 200 && r.data.canManage === true && r.data.members.length === 2 && r.data.members.every((m) => !!m.email), JSON.stringify(r.data));

  r = await call('GET', '/mosques', undefined, member.token);
  check('عضو اللجنة متابع تلقائياً لمصلاه', (r.data || []).find((m) => m._id === mosqueId)?.isFollowing === true);
  r = await call('DELETE', `/mosques/${mosqueId}/follow`, undefined, member.token);
  check('عضو اللجنة لا يلغي متابعة مصلاه → 400', r.status === 400, `status=${r.status}`);

  r = await call('DELETE', `/committees/${committeeId}/members/${head.id}`, undefined, head.token);
  check('لا تُزال رئاسة اللجنة بإزالة العضو → 400', r.status === 400, `status=${r.status}`);
  r = await call('DELETE', `/committees/${committeeId}/members/${member.id}`, undefined, head.token);
  check('الرئيس يزيل عضواً → 200', r.status === 200, `status=${r.status}`);
  me = await roleOf(member.token);
  check('العضو المُزال عاد general_user بلا مصلى ولا لجنة', me.role === 'general_user' && !me.mosqueId && !me.committee, JSON.stringify(me));
  r = await call('DELETE', `/committees/${committeeId}/members/${member.id}`, undefined, head.token);
  check('إزالة من ليس عضواً → 404', r.status === 404, `status=${r.status}`);

  console.log('تغيير الرئيس وحذف اللجنة');
  await call('POST', `/committees/${committeeId}/members`, { email: member.email }, head.token);
  r = await call('PUT', `/committees/${committeeId}/admin`, { email: member.email }, head.token);
  check('الرئيس نفسه لا يغيّر الرئيس → 403', r.status === 403, `status=${r.status}`);
  r = await call('PUT', `/committees/${committeeId}/admin`, { email: spectator.email }, tokenA);
  check('مسؤول المصلى يعيّن رئيساً جديداً من خارج اللجنة → 200', r.status === 200, JSON.stringify(r.data));
  check('الرئيس الجديد committee_admin', (await roleOf(spectator.token)).role === 'committee_admin');
  check('الرئيس القديم صار committee_member (بقي في اللجنة)', (await roleOf(head.token)).role === 'committee_member');
  r = await call('PUT', `/committees/${committeeId}/admin`, { email: member.email }, tokenA);
  check('تعيين عضو من اللجنة نفسها رئيساً → 200', r.status === 200, JSON.stringify(r.data));
  check('العضو صار committee_admin', (await roleOf(member.token)).role === 'committee_admin');
  check('الرئيس السابق (spectator) صار committee_member', (await roleOf(spectator.token)).role === 'committee_member');

  r = await call('DELETE', `/committees/${committeeId}`, undefined, member.token);
  check('رئيس اللجنة لا يحذفها → 403', r.status === 403, `status=${r.status}`);
  r = await call('DELETE', `/committees/${committeeId}`, undefined, tokenA);
  check('مسؤول المصلى يحذف اللجنة → 200', r.status === 200, `status=${r.status}`);
  for (const [label, who] of [['الرئيس', member], ['العضو', spectator], ['الرئيس الأول', head]]) {
    me = await roleOf(who.token);
    check(`${label} عاد general_user بعد الحذف`, me.role === 'general_user' && !me.committee, JSON.stringify(me));
  }
  check('مسؤول المصلى لم يتأثر بالحذف', (await roleOf(tokenA)).role === 'mosque_admin');
  r = await call('POST', '/auth/login', ADMIN);
  check('المسؤول الأعلى لم يتأثر بالحذف', r.data.user?.role === 'super_admin');
  r = await call('GET', `/committees/mosque/${mosqueId}`, undefined, tokenA);
  check('لا لجان متبقية في المصلى', r.status === 200 && r.data.length === 0, JSON.stringify(r.data));

  console.log(failures ? `\n✗ فشل ${failures} فحصاً` : '\n✓ كل الفحوص نجحت');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('\n✗ تعذّر الاتصال بالسيرفر:', e.message);
  console.error('  تأكد أن السيرفر يعمل: npm run dev');
  process.exit(1);
});
