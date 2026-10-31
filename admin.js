import { guard, logout, esc, escA } from './app.js';
import { initExtra } from './admin-extra.js';
import { auth, db, firebaseConfig } from './firebase-config.js';
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, doc, query, where, getCountFromServer, onSnapshot, runTransaction,
  setDoc, updateDoc, deleteDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = id => document.getElementById(id);
let stores = [];
let owners = [];
let extra = null;

/* ---------- أدوات واجهة ---------- */
function toast(text, bad) {
  const t = $('toast');
  t.textContent = text;
  t.className = 'toast' + (bad ? ' bad' : '');
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

function errMsg(e) {
  const c = (e && e.code) || '';
  if (c.includes('email-already-in-use')) return 'الإيميل ده مسجّل قبل كده.';
  if (c.includes('invalid-email')) return 'الإيميل مش مكتوب صح.';
  if (c.includes('weak-password')) return 'الباسورد ضعيف (6 حروف على الأقل).';
  if (c.includes('permission-denied')) return 'مفيش صلاحية لتنفيذ العملية دي.';
  if (c.includes('network')) return 'مشكلة في الاتصال بالإنترنت.';
  if (e && e.message === 'slug-exists') return 'رابط المتجر (slug) ده مستخدم لمتجر تاني.';
  return 'حصل خطأ، جرّب تاني.';
}

/* ---------- نافذة عامة (فورم أو تأكيد) ---------- */
let mResolve = null;
let mValidate = null;
let mFields = [];

function openModal({ title, message = '', fields = [], okText = 'حفظ', danger = false, validate = null }) {
  mFields = fields;
  mValidate = validate;
  $('mTitle').textContent = title;
  $('mMsg').textContent = message;
  $('mMsg').hidden = !message;
  $('mError').hidden = true;
  $('mOk').textContent = okText;
  $('mOk').className = 'btn' + (danger ? ' danger' : '');
  $('mFields').innerHTML = fields.map(f => {
    const attrs = ' id="f_' + f.id + '"' + (f.dir ? ' dir="' + f.dir + '"' : '') +
      (f.disabled ? ' disabled' : '') + (f.placeholder ? ' placeholder="' + escA(f.placeholder) + '"' : '');
    let input;
    if (f.type === 'select') {
      input = '<select' + attrs + '>' + f.options.map(o =>
        '<option value="' + escA(o.value) + '"' + (o.value === f.value ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea' + attrs + ' rows="3">' + esc(f.value || '') + '</textarea>';
    } else {
      input = '<input type="' + (f.type || 'text') + '"' + attrs + ' value="' + escA(f.value || '') + '" autocomplete="off">';
    }
    return '<label for="f_' + f.id + '">' + esc(f.label) + '</label>' + input;
  }).join('');
  $('modal').hidden = false;
  const first = $('mFields').querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 50);
  return new Promise(res => { mResolve = res; });
}
function closeModal(result) {
  $('modal').hidden = true;
  if (mResolve) { mResolve(result); mResolve = null; }
}
$('mOk').addEventListener('click', () => {
  const vals = {};
  mFields.forEach(f => { const el = $('f_' + f.id); vals[f.id] = f.type === 'password' ? el.value : el.value.trim(); });
  const showErr = m => { $('mError').textContent = m; $('mError').hidden = false; };
  for (const f of mFields) if (f.required && !vals[f.id]) { showErr('املأ كل الخانات المطلوبة.'); return; }
  const err = mValidate ? mValidate(vals) : '';
  if (err) { showErr(err); return; }
  closeModal(vals);
});
$('mCancel').addEventListener('click', () => closeModal(null));
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(null); });

/* ---------- عرض القوائم ---------- */
const ownerName = uid => {
  const o = owners.find(x => x.uid === uid);
  return o ? ((o.displayName || '') + ' (' + o.email + ')') : '— غير معروف —';
};

function renderStores() {
  $('storesList').innerHTML = stores.length === 0
    ? '<p class="muted">مفيش متاجر لسه. أنشئ صاحب محل الأول، وبعدين اضغط "متجر جديد".</p>'
    : [...stores].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(s =>
      '<div class="item"><div class="grow"><b>' + esc(s.name) + '</b> ' +
      '<span class="pill ' + (s.active ? 'on' : 'off') + '">' + (s.active ? 'شغّال' : 'موقوف') + '</span>' +
      '<div class="sub" dir="ltr" style="text-align:start">' + esc(s.id) + '</div>' +
      '<div class="sub">👤 ' + esc(ownerName(s.ownerUid)) + '</div>' +
      '<div class="sub" dir="ltr" style="text-align:start">📱 ' + esc(s.whatsapp || '') + '</div></div>' +
      '<div class="actions">' +
      '<button type="button" data-act="edit" data-id="' + escA(s.id) + '">✏️ تعديل</button>' +
      '<button type="button" data-act="toggle" data-id="' + escA(s.id) + '">' + (s.active ? '⏸️ إيقاف' : '▶️ تشغيل') + '</button>' +
      '<button type="button" class="danger" data-act="del" data-id="' + escA(s.id) + '">🗑️ حذف</button>' +
      '</div></div>').join('');
}

function renderOwners() {
  $('ownersList').innerHTML = owners.length === 0
    ? '<p class="muted">مفيش أصحاب محلات لسه. اضغط "صاحب محل جديد".</p>'
    : [...owners].sort((a, b) => String(a.displayName).localeCompare(String(b.displayName))).map(o => {
      const st = stores.find(s => s.ownerUid === o.uid);
      return '<div class="item"><div class="grow"><b>' + esc(o.displayName || '') + '</b> ' +
        '<span class="pill ' + (o.active ? 'on' : 'off') + '">' + (o.active ? 'شغّال' : 'موقوف') + '</span>' +
        '<div class="sub" dir="ltr" style="text-align:start">' + esc(o.email) + '</div>' +
        '<div class="sub">🏪 ' + (st ? esc(st.name) : 'مفيش متجر مربوط') + '</div></div>' +
        '<div class="actions">' +
        '<button type="button" data-act="edit" data-id="' + escA(o.uid) + '">✏️ تعديل</button>' +
        '<button type="button" data-act="toggle" data-id="' + escA(o.uid) + '">' + (o.active ? '⏸️ إيقاف' : '▶️ تشغيل') + '</button>' +
        '<button type="button" data-act="mail" data-id="' + escA(o.uid) + '">📧 تغيير الباسورد</button>' +
        '<button type="button" class="danger" data-act="del" data-id="' + escA(o.uid) + '">🗑️ حذف</button>' +
        '</div></div>';
    }).join('');
}

function renderStats() {
  $('cStores').textContent = stores.length;
  $('cActive').textContent = stores.filter(s => s.active).length;
  $('cOwners').textContent = owners.length;
}
function renderAll() { renderStores(); renderOwners(); renderStats(); if (extra) extra.refresh(); }

/* ---------- صاحب محل ---------- */
async function addOwner() {
  const v = await openModal({
    title: 'صاحب محل جديد',
    fields: [
      { id: 'name', label: 'اسم صاحب المحل', required: true },
      { id: 'email', label: 'الإيميل', type: 'email', dir: 'ltr', required: true },
      { id: 'password', label: 'الباسورد (6 حروف على الأقل)', type: 'password', required: true }
    ],
    validate: v => v.password.length < 6 ? 'الباسورد لازم يكون 6 حروف على الأقل.' : ''
  });
  if (!v) return;
  // نسخة تانية من Firebase عشان إنشاء الحساب ميسجّلش خروجك
  const sec = initializeApp(firebaseConfig, 'sec' + Date.now());
  let created = null;
  try {
    created = await createUserWithEmailAndPassword(getAuth(sec), v.email, v.password);
    await setDoc(doc(db, 'users', created.user.uid), {
      email: v.email, displayName: v.name, role: 'store_owner', active: true, createdAt: serverTimestamp()
    });
    toast('✅ تم إنشاء حساب صاحب المحل');
  } catch (e) {
    if (created) { try { await created.user.delete(); } catch (e2) { /* ignore */ } }
    toast(errMsg(e), true);
  } finally {
    try { await signOut(getAuth(sec)); } catch (e3) { /* ignore */ }
    try { await deleteApp(sec); } catch (e4) { /* ignore */ }
  }
}

async function ownerAction(act, uid) {
  const o = owners.find(x => x.uid === uid);
  if (!o) return;
  try {
    if (act === 'toggle') {
      await updateDoc(doc(db, 'users', uid), { active: !o.active });
      toast(o.active ? '⏸️ تم إيقاف الحساب' : '▶️ تم تشغيل الحساب');
    } else if (act === 'mail') {
      await sendPasswordResetEmail(auth, o.email);
      toast('✅ اتبعت إيميل تغيير الباسورد على ' + o.email);
    } else if (act === 'edit') {
      const v = await openModal({ title: 'تعديل صاحب المحل', fields: [{ id: 'name', label: 'الاسم', value: o.displayName || '', required: true }] });
      if (!v) return;
      await updateDoc(doc(db, 'users', uid), { displayName: v.name });
      toast('✅ تم التعديل');
    } else if (act === 'del') {
      if (stores.some(s => s.ownerUid === uid)) { toast('الحساب ده مربوط بمتجر. غيّر صاحب المتجر أو احذف المتجر الأول.', true); return; }
      const v = await openModal({
        title: 'حذف صاحب المحل', danger: true, okText: 'احذف',
        message: 'هيتمنع الحساب من الدخول فورًا. لو عايز تستخدم نفس الإيميل تاني لازم تمسحه كمان من Firebase ← Authentication ← Users.'
      });
      if (!v) return;
      await deleteDoc(doc(db, 'users', uid));
      toast('🗑️ تم حذف الحساب');
    }
  } catch (e) { toast(errMsg(e), true); }
}

/* ---------- متجر ---------- */
const slugOk = s => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 40;
const ownerOptions = list => list.map(o => ({ value: o.uid, label: (o.displayName || '') + ' (' + o.email + ')' }));

async function addStore() {
  const free = owners.filter(o => o.active && !stores.some(s => s.ownerUid === o.uid));
  if (free.length === 0) { toast('أنشئ صاحب محل جديد الأول (أو كل أصحاب المحلات عندهم متاجر).', true); return; }
  const v = await openModal({
    title: 'متجر جديد',
    fields: [
      { id: 'name', label: 'اسم المتجر', required: true },
      { id: 'slug', label: 'رابط المتجر (إنجليزي صغير وأرقام وشرطة)', dir: 'ltr', required: true, placeholder: 'my-store' },
      { id: 'ownerUid', label: 'صاحب المحل', type: 'select', value: free[0].uid, options: ownerOptions(free) },
      { id: 'whatsapp', label: 'واتساب بالكود الدولي من غير + (مثال 201012345678)', dir: 'ltr', required: true },
      { id: 'phone', label: 'تليفون (اختياري)', dir: 'ltr' },
      { id: 'description', label: 'وصف مختصر (اختياري)', type: 'textarea' }
    ],
    validate: v => !slugOk(v.slug) ? 'الرابط لازم 3-40 حرف إنجليزي صغير وأرقام وشرطة بينهم.'
      : (!/^\d{8,15}$/.test(v.whatsapp) ? 'رقم الواتساب أرقام بس (8 لـ 15 رقم) بالكود الدولي.' : '')
  });
  if (!v) return;
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, 'stores', v.slug);   // رقم المتجر = الرابط، فمستحيل يتكرر
      if ((await tx.get(ref)).exists()) throw new Error('slug-exists');
      tx.set(ref, {
        name: v.name, slug: v.slug, ownerUid: v.ownerUid, active: true,
        whatsapp: v.whatsapp, phone: v.phone, description: v.description,
        plan: 'free', createdAt: serverTimestamp()
      });
    });
    toast('✅ تم إنشاء المتجر');
  } catch (e) { toast(errMsg(e), true); }
}

async function storeAction(act, id) {
  const s = stores.find(x => x.id === id);
  if (!s) return;
  try {
    if (act === 'toggle') {
      await updateDoc(doc(db, 'stores', id), { active: !s.active });
      toast(s.active ? '⏸️ تم إيقاف المتجر' : '▶️ تم تشغيل المتجر');
    } else if (act === 'edit') {
      const v = await openModal({
        title: 'تعديل المتجر',
        fields: [
          { id: 'name', label: 'اسم المتجر', value: s.name, required: true },
          { id: 'ownerUid', label: 'صاحب المحل', type: 'select', value: s.ownerUid, options: ownerOptions(owners) },
          { id: 'whatsapp', label: 'واتساب بالكود الدولي', dir: 'ltr', value: s.whatsapp || '', required: true },
          { id: 'phone', label: 'تليفون', dir: 'ltr', value: s.phone || '' },
          { id: 'description', label: 'وصف مختصر', type: 'textarea', value: s.description || '' }
        ],
        validate: v => !/^\d{8,15}$/.test(v.whatsapp) ? 'رقم الواتساب أرقام بس (8 لـ 15 رقم) بالكود الدولي.' : ''
      });
      if (!v) return;
      await updateDoc(doc(db, 'stores', id), { name: v.name, ownerUid: v.ownerUid, whatsapp: v.whatsapp, phone: v.phone, description: v.description });
      toast('✅ تم التعديل');
    } else if (act === 'del') {
      const n = (await getCountFromServer(query(collection(db, 'products'), where('storeId', '==', id)))).data().count;
      if (n > 0) { toast('المتجر فيه ' + n + ' منتج. أوقفه بدل ما تحذفه.', true); return; }
      const v = await openModal({ title: 'حذف المتجر', danger: true, okText: 'احذف', message: 'هيتحذف متجر "' + s.name + '" نهائيًا.' });
      if (!v) return;
      await deleteDoc(doc(db, 'stores', id));
      toast('🗑️ تم حذف المتجر');
    }
  } catch (e) { toast(errMsg(e), true); }
}

/* ---------- تشغيل ---------- */
guard('super_admin', async user => {
  $('who').textContent = user.email;
  $('logoutBtn').addEventListener('click', logout);

  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  });
  $('addStoreBtn').addEventListener('click', addStore);
  $('addOwnerBtn').addEventListener('click', addOwner);
  extra = initExtra({ openModal, toast, errMsg, getStores: () => stores, getOwners: () => owners });
  $('storesList').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) storeAction(b.dataset.act, b.dataset.id); });
  $('ownersList').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) ownerAction(b.dataset.act, b.dataset.id); });

  onSnapshot(collection(db, 'stores'), s => {
    stores = s.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  }, () => toast('تعذّر تحميل المتاجر.', true));
  onSnapshot(collection(db, 'users'), s => {
    owners = s.docs.map(d => ({ uid: d.id, ...d.data() })).filter(o => o.role === 'store_owner');
    renderAll();
  }, () => toast('تعذّر تحميل أصحاب المحلات.', true));

  for (const [id, name] of [['cProducts', 'products'], ['cOrders', 'orders']]) {
    try { $(id).textContent = (await getCountFromServer(collection(db, name))).data().count; }
    catch (e) { $(id).textContent = '—'; }
  }
});
