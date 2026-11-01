// صفحة اختبار قواعد Firestore من الموبايل: بتجرّب عمليات حقيقية وبتقارن النتيجة بالمتوقع.
import { auth, db, firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { loadRole, esc } from './app.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = id => document.getElementById(id);
const rows = [];
let current = null;

function render() {
  $('results').innerHTML = rows.map(r => r.skipped
    ? '<div class="trow"><span>⏭️</span><div><b>' + esc(r.name) + '</b><div class="muted">اتخطى: ' + esc(r.skipped) + '</div></div></div>'
    : '<div class="trow ' + (r.ok ? 'pass' : 'fail') + '"><span>' + (r.ok ? '✅' : '❌') + '</span><div><b>' + esc(r.name) + '</b>' +
      '<div class="muted">المتوقع: ' + (r.wantAllow ? 'مسموح' : 'ممنوع') + ' — الحاصل: ' +
      (r.allowed ? 'مسموح' : 'ممنوع (' + esc(r.code) + ')') + '</div></div></div>').join('');
  const done = rows.filter(r => !r.skipped);
  const bad = done.filter(r => !r.ok).length;
  const s = $('summary');
  s.hidden = done.length === 0;
  s.className = 'note ' + (bad === 0 ? 'ok' : 'err');
  s.textContent = bad === 0 ? '✅ نجحت ' + done.length + ' من ' + done.length + ' اختبار' : '❌ فشل ' + bad + ' من ' + done.length + ' اختبار. راجع الأحمر.';
}

// wantAllow=true: لازم تنجح. false: لازم تترفض برسالة permission-denied بالذات.
async function T(name, wantAllow, fn) {
  let allowed = true;
  let code = '';
  try { await fn(); } catch (e) { allowed = false; code = (e && e.code) || String(e); }
  const ok = allowed === wantAllow && (allowed || code.includes('permission-denied'));
  rows.push({ name, wantAllow, allowed, code, ok });
  render();
}
function skip(name, why) { rows.push({ name, skipped: why }); render(); }

const fakeStore = (ownerUid, extra = {}) => ({ name: 'اختبار', ownerUid, active: true, createdAt: serverTimestamp(), ...extra });

async function adminSuite(user) {
  const me = user.uid;
  await T('المدير يقرا وثيقته في platformAdmins', true, () => getDoc(doc(db, 'platformAdmins', me)));
  await T('مفيش كتابة في platformAdmins حتى للمدير من الموقع', false, () => setDoc(doc(db, 'platformAdmins', 'zz-test'), { email: 'x@x.com' }));
  await T('منع إنشاء حساب بدور super_admin في users', false, () => setDoc(doc(db, 'users', 'zz-test'), { email: 'x@x.com', role: 'super_admin', active: true }));
  await T('قراءة كل الحسابات', true, () => getDocs(query(collection(db, 'users'), limit(1))));
  await T('قراءة كل الطلبات', true, () => getDocs(query(collection(db, 'orders'), limit(1))));
  await T('إنشاء متجر تجريبي ثم حذفه', true, async () => {
    await setDoc(doc(db, 'stores', 'zz-rules-test'), fakeStore(me));
    await deleteDoc(doc(db, 'stores', 'zz-rules-test'));
  });
  await T('كتابة وحذف إعدادات المنصة', true, async () => {
    await setDoc(doc(db, 'platformSettings', 'zz-test'), { x: 1 });
    await deleteDoc(doc(db, 'platformSettings', 'zz-test'));
  });
  await T('قراءة الباقات (عام)', true, () => getDocs(query(collection(db, 'plans'), limit(1))));
}

async function ownerSuite(user) {
  const me = user.uid;
  const mine = (await getDocs(query(collection(db, 'stores'), where('ownerUid', '==', me), limit(1)))).docs[0];
  if (!mine) { skip('كل اختبارات صاحب المحل', 'مفيش متجر مربوط بحسابك'); return; }
  const mineId = mine.id;
  const others = (await getDocs(query(collection(db, 'stores'), where('active', '==', true), limit(10)))).docs
    .filter(d => d.id !== mineId && d.data().ownerUid !== me);
  const other = others[0];
  const otherId = other ? other.id : null;
  const otherOwner = other ? other.data().ownerUid : null;

  await T('قراءة وثيقتي أنا في users', true, () => getDoc(doc(db, 'users', me)));
  await T('قراءة وثيقة مدير عام تاني (platformAdmins)', false, () => getDoc(doc(db, 'platformAdmins', 'someone-else')));
  await T('كتابة وثيقة لنفسي في platformAdmins (ترقية نفسي)', false, () => setDoc(doc(db, 'platformAdmins', me), { email: user.email }));
  await T('تغيير دوري في users إلى super_admin', false, () => updateDoc(doc(db, 'users', me), { role: 'super_admin' }));
  await T('تعديل أي حاجة في وثيقتي في users', false, () => updateDoc(doc(db, 'users', me), { displayName: 'hack' }));
  await T('تغيير ownerUid لمتجري', false, () => updateDoc(doc(db, 'stores', mineId), { ownerUid: otherOwner || 'someone-else' }));
  await T('إيقاف متجري بنفسي (active)', false, () => updateDoc(doc(db, 'stores', mineId), { active: false }));
  await T('تعديل بيانات عرض متجري (اسم بنفس القيمة)', true, () => updateDoc(doc(db, 'stores', mineId), { name: mine.data().name }));
  await T('إنشاء متجر جديد', false, () => setDoc(doc(db, 'stores', 'zz-owner-test'), fakeStore(me)));
  await T('حذف متجري', false, () => deleteDoc(doc(db, 'stores', mineId)));
  await T('قراءة طلبات متجري', true, () => getDocs(query(collection(db, 'orders'), where('storeId', '==', mineId), limit(1))));
  await T('قراءة كل منتجات متجري (بما فيها المخفية)', true, () => getDocs(query(collection(db, 'products'), where('storeId', '==', mineId), limit(1))));
  await T('قراءة تصنيفات متجري', true, () => getDocs(query(collection(db, 'categories'), where('storeId', '==', mineId), limit(1))));
  await T('كتابة في الباقات', false, () => setDoc(doc(db, 'plans', 'zz-test'), { x: 1 }));
  await T('كتابة في إعدادات المنصة', false, () => setDoc(doc(db, 'platformSettings', 'zz-test'), { x: 1 }));

  // منتج في متجري: إضافة وتعديل وحذف
  const pRef = doc(collection(db, 'products'));
  const product = storeId => ({ storeId, name: '__rules_test__', price: 1, active: false, createdAt: serverTimestamp() });
  await T('إضافة منتج في متجري', true, () => setDoc(pRef, product(mineId)));
  await T('تعديل منتج في متجري', true, () => updateDoc(pRef, { price: 2 }));
  await T('نقل منتجي لمتجر تاني', false, () => updateDoc(pRef, { storeId: otherId || 'someone-else' }));
  const iRef = doc(db, 'productImages', pRef.id);
  await T('حفظ صور منتجي', true, () => setDoc(iRef, { storeId: mineId, productId: pRef.id, images: [] }));
  await T('نقل صور منتجي لمتجر تاني', false, () => updateDoc(iRef, { storeId: otherId || 'someone-else' }));
  await T('حذف صور منتجي', true, () => deleteDoc(iRef));
  await T('حذف منتج من متجري', true, () => deleteDoc(pRef));
  await T('إضافة تصنيف في متجري ثم حذفه', true, async () => {
    const cRef = doc(collection(db, 'categories'));
    await setDoc(cRef, { storeId: mineId, name: '__rules_test__', order: 1, active: false, createdAt: serverTimestamp() });
    await deleteDoc(cRef);
  });

  // طلب غير صالح (حالة غير new) لازم يترفض
  await T('إنشاء طلب بحالة غير new', false, () => setDoc(doc(collection(db, 'orders')), {
    storeId: mineId, customerName: 'اختبار', customerPhone: '01000000000',
    items: [{ n: 1 }], total: 1, status: 'confirmed', createdAt: serverTimestamp()
  }));

  if (!otherId) {
    skip('اختبارات متجر شخص تاني', 'محتاج متجر تاني شغّال لصاحب محل تاني');
    return;
  }
  await T('قراءة كل منتجات متجر شخص تاني (من غير فلتر ظاهر)', false, () => getDocs(query(collection(db, 'products'), where('storeId', '==', otherId), limit(1))));
  await T('قراءة المنتجات الظاهرة لمتجر شخص تاني (الكتالوج العام)', true, () => getDocs(query(collection(db, 'products'), where('storeId', '==', otherId), where('active', '==', true), limit(1))));
  await T('إضافة تصنيف في متجر شخص تاني', false, () => setDoc(doc(collection(db, 'categories')), { storeId: otherId, name: 'hack', order: 1, active: true, createdAt: serverTimestamp() }));
  await T('قراءة وثيقة صاحب محل تاني', false, () => getDoc(doc(db, 'users', otherOwner)));
  await T('تعديل اسم متجر شخص تاني', false, () => updateDoc(doc(db, 'stores', otherId), { name: 'hack' }));
  await T('إضافة منتج في متجر شخص تاني', false, () => setDoc(doc(collection(db, 'products')), product(otherId)));
  await T('قراءة طلبات متجر شخص تاني', false, () => getDocs(query(collection(db, 'orders'), where('storeId', '==', otherId), limit(1))));
  await T('قراءة اشتراك متجر شخص تاني', false, () => getDoc(doc(db, 'subscriptions', otherId)));
}

// زائر من غير تسجيل دخول: نسخة Firebase تانية مفيهاش مستخدم
async function guestSuite() {
  const g = initializeFirestore(initializeApp(firebaseConfig, 'guest-' + Date.now()), { experimentalAutoDetectLongPolling: true });
  let st = null;
  await T('قراءة المتاجر الشغّالة (عام)', true, async () => {
    st = (await getDocs(query(collection(g, 'stores'), where('active', '==', true), limit(1)))).docs[0];
  });
  if (!st) { skip('اختبارات الزائر على متجر', 'مفيش متجر شغّال'); return; }
  const sid = st.id;
  const order = extra => ({
    storeId: sid, customerName: 'اختبار', customerPhone: '01000000000',
    items: [{ n: 1 }], total: 1, status: 'new', createdAt: serverTimestamp(), ...extra
  });
  await T('قراءة المنتجات الظاهرة (active==true)', true, () => getDocs(query(collection(g, 'products'), where('storeId', '==', sid), where('active', '==', true), limit(1))));
  await T('قراءة كل المنتجات من غير فلتر الظهور (المخفية محمية)', false, () => getDocs(query(collection(g, 'products'), where('storeId', '==', sid), limit(1))));
  await T('قراءة الطلبات', false, () => getDocs(query(collection(g, 'orders'), limit(1))));
  await T('قراءة الحسابات', false, () => getDocs(query(collection(g, 'users'), limit(1))));
  await T('قراءة platformAdmins', false, () => getDoc(doc(g, 'platformAdmins', 'x')));
  await T('قراءة الاشتراكات', false, () => getDoc(doc(g, 'subscriptions', sid)));
  await T('قراءة الباقات (عام)', true, () => getDocs(query(collection(g, 'plans'), limit(1))));
  await T('كتابة منتج', false, () => setDoc(doc(g, 'products', 'zz-guest'), { storeId: sid, name: 'x', price: 1 }));
  await T('تعديل متجر', false, () => updateDoc(doc(g, 'stores', sid), { name: 'hack' }));
  await T('كتابة في الباقات', false, () => setDoc(doc(g, 'plans', 'zz-guest'), { x: 1 }));
  await T('طلب بحالة غير new', false, () => setDoc(doc(collection(g, 'orders')), order({ status: 'confirmed' })));
  await T('طلب من غير منتجات', false, () => setDoc(doc(collection(g, 'orders')), order({ items: [] })));
  await T('طلب بوقت مزيف (مش وقت السيرفر)', false, () => setDoc(doc(collection(g, 'orders')), order({ createdAt: new Date() })));
  await T('طلب لمتجر مش موجود', false, () => setDoc(doc(collection(g, 'orders')), order({ storeId: 'zz-not-exist' })));
  await T('طلب بحقل زيادة مش مسموح', false, () => setDoc(doc(collection(g, 'orders')), order({ hacked: true })));
}

$('guestBtn').addEventListener('click', async () => {
  rows.length = 0;
  render();
  $('guestBtn').disabled = true;
  $('runBtn').disabled = true;
  try { await guestSuite(); render(); } catch (e) { skip('الاختبار وقف بسبب خطأ', String((e && e.code) || e)); }
  $('guestBtn').disabled = false;
  $('runBtn').disabled = false;
});

$('runBtn').addEventListener('click', async () => {
  if (!current) return;
  rows.length = 0;
  render();
  $('runBtn').disabled = true;
  $('runBtn').textContent = '⏳ جاري الاختبار...';
  try {
    if (current.role === 'super_admin') await adminSuite(current.user);
    else await ownerSuite(current.user);
  } catch (e) { skip('الاختبار وقف بسبب خطأ', String(e && e.code || e)); }
  $('runBtn').disabled = false;
  $('runBtn').textContent = '🔁 شغّل الاختبار تاني';
});

onAuthStateChanged(auth, async user => {
  if (!user) { location.replace('login.html'); return; }
  const r = await loadRole(user);
  if (r.error) { document.body.classList.remove('loading'); $('who').textContent = 'مشكلة في الاتصال، حدّث الصفحة.'; return; }
  if (!r.role) { location.replace('login.html?e=noaccess'); return; }
  current = { user, role: r.role };
  $('who').textContent = user.email + ' — ' + (r.role === 'super_admin' ? 'مدير عام' : 'صاحب محل');
  $('backLink').href = r.role === 'super_admin' ? 'admin.html' : 'dashboard.html';
  document.body.classList.remove('loading');
});
