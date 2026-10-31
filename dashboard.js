import { guard, logout, esc, escA } from './app.js';
import { db } from './firebase-config.js';
import { toast, openModal, initModal } from './ui.js';
import { compressFile, makeThumb, isImageData } from './images.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where,
  orderBy, limit, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = id => document.getElementById(id);
const STATUS = { new: 'جديد', confirmed: 'مؤكد', shipped: 'اتشحن', delivered: 'اتسلّم', cancelled: 'ملغي' };
const MAX_IMG = 5;
const MAX_TOTAL_CHARS = 900000;   // حد أمان تحت 1 ميجا للوثيقة الواحدة

let storeId = null;
let store = null;
let products = [];
let cats = [];
let orders = [];
let sheetImages = [];
let editingId = null;
let busy = false;
let logoData = '';
let formFilled = false;

/* ---------- أدوات ---------- */
const fmtPrice = n => Number(n || 0).toLocaleString('ar-EG') + ' ج.م';
const fmtDate = ts => {
  try {
    const d = ts.toDate();
    const p = x => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  } catch (e) { return ''; }
};
const waNumber = phone => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '20' + d.slice(1);
  return d;
};
const catName = id => { const c = cats.find(x => x.id === id); return c ? c.name : 'بدون تصنيف'; };
const splitList = s => [...new Set(String(s || '').split(/[,،\n]/).map(x => x.trim()).filter(Boolean))].slice(0, 20);
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

function errMsg(e) {
  const c = (e && e.code) || '';
  if (c.includes('permission-denied')) return 'مفيش صلاحية لتنفيذ العملية. ممكن المتجر أو حسابك يكون موقوف.';
  if (c.includes('network') || c.includes('unavailable')) return 'مشكلة في الاتصال بالإنترنت.';
  return 'حصل خطأ، جرّب تاني.';
}
const loadErr = what => () => { if (!store || store.active) toast('تعذّر تحميل ' + what + '.', true); };

/* ---------- الرئيسية ---------- */
function renderHome() {
  if (!store) return;
  $('homeBox').innerHTML = '<h2>' + esc(store.name) + '</h2><p class="muted">الحالة: ' +
    (store.active ? '🟢 شغّال' : '⛔ موقوف من إدارة المنصة (مش هتقدر تعدّل لحد ما يتفعّل)') + '</p>';
  $('homeStats').hidden = false;
  $('catalogLink').value = new URL('store.html?s=' + encodeURIComponent(storeId), location.href).href;
}
function renderStats() {
  $('sProducts').textContent = products.length;
  $('sCats').textContent = cats.length;
  $('sNew').textContent = orders.filter(o => o.status === 'new').length;
  $('sOrders').textContent = orders.length + (orders.length >= 100 ? '+' : '');
}

/* ---------- المنتجات ---------- */
function renderProducts() {
  const q = $('pSearch').value.trim().toLowerCase();
  const list = products
    .filter(p => !q || String(p.name).toLowerCase().includes(q))
    .sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
  $('productsList').innerHTML = list.length === 0
    ? '<p class="muted">مفيش منتجات. اضغط "منتج جديد".</p>'
    : list.map(p => {
      const id = escA(p.id);
      return '<div class="pcard"><div class="pimg">' + (isImageData(p.thumb) ? '<img src="' + escA(p.thumb) + '" alt="">' : '📷') + '</div>' +
        '<div class="pbody"><b>' + esc(p.name) + '</b>' +
        '<div class="price">' + fmtPrice(p.price) + (Number(p.oldPrice) > Number(p.price) ? ' <s class="muted" style="font-weight:400">' + fmtPrice(p.oldPrice) + '</s>' : '') + '</div>' +
        '<div class="sub">' + esc(catName(p.categoryId)) + '</div>' +
        '<div>' + (p.active ? '' : '<span class="pill off">مخفي</span> ') + (p.featured ? '<span class="pill on">مميز</span>' : '') + '</div></div>' +
        '<div class="actions">' +
        '<button type="button" data-act="edit" data-id="' + id + '">✏️</button>' +
        '<button type="button" data-act="toggle" data-id="' + id + '">' + (p.active ? '🙈 إخفاء' : '👁️ إظهار') + '</button>' +
        '<button type="button" class="danger" data-act="del" data-id="' + id + '">🗑️</button></div></div>';
    }).join('');
}

function renderSheetImages() {
  $('sImgs').innerHTML = sheetImages.map((src, i) =>
    '<div class="th' + (i === 0 ? ' main' : '') + '"><img src="' + escA(src) + '" alt="">' +
    '<button type="button" data-rm="' + i + '" aria-label="حذف">✕</button>' +
    (i > 0 ? '<button type="button" class="star" data-main="' + i + '" aria-label="رئيسية">★</button>' : '') + '</div>').join('');
}

async function loadImages(id) {
  busy = true;
  try {
    const s = await getDoc(doc(db, 'productImages', id));
    if (editingId === id && s.exists()) { sheetImages = (s.data().images || []).filter(isImageData); renderSheetImages(); }
  } catch (e) { /* ignore */ }
  busy = false;
}

function openSheet(p) {
  editingId = p ? p.id : null;
  sheetImages = [];
  $('sTitle').textContent = p ? 'تعديل منتج' : 'منتج جديد';
  $('sName').value = p ? p.name : '';
  $('sPrice').value = p ? p.price : '';
  $('sOld').value = p && p.oldPrice ? p.oldPrice : '';
  $('sDesc').value = p ? (p.description || '') : '';
  $('sSizes').value = p ? (p.sizes || []).join(', ') : '';
  $('sColors').value = p ? (p.colors || []).join(', ') : '';
  $('sActive').checked = p ? p.active !== false : true;
  $('sFeatured').checked = p ? !!p.featured : false;
  $('sCat').innerHTML = '<option value="">بدون تصنيف</option>' +
    [...cats].sort(byOrder).map(c => '<option value="' + escA(c.id) + '">' + esc(c.name) + '</option>').join('');
  $('sCat').value = p && p.categoryId ? p.categoryId : '';
  $('sError').hidden = true;
  $('sSave').disabled = false;
  $('sSave').textContent = '💾 حفظ';
  renderSheetImages();
  $('sheet').hidden = false;
  if (p && p.imageCount) loadImages(p.id);
}
function closeSheet() { $('sheet').hidden = true; editingId = null; }

async function saveProduct() {
  if (busy) return;
  const err = m => { $('sError').textContent = m; $('sError').hidden = false; };
  const name = $('sName').value.trim();
  const price = parseFloat($('sPrice').value);
  const old = $('sOld').value === '' ? 0 : parseFloat($('sOld').value);
  if (!name) return err('اكتب اسم المنتج.');
  if (!(price >= 0)) return err('اكتب سعر صحيح.');
  if (!(old >= 0)) return err('السعر قبل الخصم غير صحيح.');
  if (sheetImages.reduce((n, s) => n + s.length, 0) > MAX_TOTAL_CHARS) return err('حجم الصور كبير. احذف صورة أو اتنين.');
  busy = true;
  $('sError').hidden = true;
  $('sSave').disabled = true;
  $('sSave').textContent = '⏳ جاري الحفظ...';
  try {
    const thumb = sheetImages.length ? await makeThumb(sheetImages[0]) : '';
    const data = {
      storeId, name, description: $('sDesc').value.trim(), price, oldPrice: old, categoryId: $('sCat').value,
      sizes: splitList($('sSizes').value), colors: splitList($('sColors').value),
      active: $('sActive').checked, featured: $('sFeatured').checked,
      thumb, imageCount: sheetImages.length, updatedAt: serverTimestamp()
    };
    const id = editingId || doc(collection(db, 'products')).id;
    const batch = writeBatch(db);
    if (editingId) batch.update(doc(db, 'products', id), data);
    else batch.set(doc(db, 'products', id), { ...data, createdAt: serverTimestamp() });
    batch.set(doc(db, 'productImages', id), { storeId, productId: id, images: sheetImages });
    await batch.commit();
    closeSheet();
    toast('✅ تم حفظ المنتج');
  } catch (e) { err(errMsg(e)); }
  busy = false;
  $('sSave').disabled = false;
  $('sSave').textContent = '💾 حفظ';
}

async function productAction(act, id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  try {
    if (act === 'edit') openSheet(p);
    else if (act === 'toggle') {
      await updateDoc(doc(db, 'products', id), { active: !p.active, updatedAt: serverTimestamp() });
      toast(p.active ? '🙈 اتخفى من الكتالوج' : '👁️ ظهر في الكتالوج');
    } else if (act === 'del') {
      const v = await openModal({ title: 'حذف المنتج', danger: true, okText: 'احذف', message: 'هيتحذف "' + p.name + '" نهائيًا.' });
      if (!v) return;
      try {
        const b = writeBatch(db);
        b.delete(doc(db, 'products', id));
        b.delete(doc(db, 'productImages', id));
        await b.commit();
      } catch (e2) { await deleteDoc(doc(db, 'products', id)); }
      toast('🗑️ تم حذف المنتج');
    }
  } catch (e) { toast(errMsg(e), true); }
}

/* ---------- التصنيفات ---------- */
function renderCats() {
  const sorted = [...cats].sort(byOrder);
  $('catsList').innerHTML = sorted.length === 0
    ? '<p class="muted">مفيش تصنيفات. اضغط "تصنيف جديد".</p>'
    : sorted.map((c, i) => {
      const id = escA(c.id);
      const n = products.filter(p => p.categoryId === c.id).length;
      return '<div class="item"><div class="grow"><b>' + esc(c.name) + '</b> <span class="pill ' + (c.active ? 'on' : 'off') + '">' + (c.active ? 'ظاهر' : 'مخفي') + '</span>' +
        '<div class="sub">' + n + ' منتج</div></div><div class="actions">' +
        (i > 0 ? '<button type="button" data-act="up" data-id="' + id + '">⬆️</button>' : '') +
        (i < sorted.length - 1 ? '<button type="button" data-act="down" data-id="' + id + '">⬇️</button>' : '') +
        '<button type="button" data-act="edit" data-id="' + id + '">✏️</button>' +
        '<button type="button" data-act="toggle" data-id="' + id + '">' + (c.active ? '🙈' : '👁️') + '</button>' +
        '<button type="button" class="danger" data-act="del" data-id="' + id + '">🗑️</button></div></div>';
    }).join('');
}

async function addCat() {
  const v = await openModal({
    title: 'تصنيف جديد', fields: [{ id: 'name', label: 'اسم التصنيف', required: true }],
    validate: v => v.name.length > 80 ? 'الاسم طويل (80 حرف كحد أقصى).' : ''
  });
  if (!v) return;
  const order = cats.reduce((m, c) => Math.max(m, c.order || 0), 0) + 1;
  try {
    await setDoc(doc(collection(db, 'categories')), { storeId, name: v.name, order, active: true, createdAt: serverTimestamp() });
    toast('✅ تم إضافة التصنيف');
  } catch (e) { toast(errMsg(e), true); }
}

async function catAction(act, id) {
  const sorted = [...cats].sort(byOrder);
  const i = sorted.findIndex(c => c.id === id);
  const c = sorted[i];
  if (!c) return;
  try {
    if (act === 'up' || act === 'down') {
      const o = sorted[i + (act === 'up' ? -1 : 1)];
      if (!o) return;
      const b = writeBatch(db);
      b.update(doc(db, 'categories', c.id), { order: o.order });
      b.update(doc(db, 'categories', o.id), { order: c.order });
      await b.commit();
    } else if (act === 'toggle') {
      await updateDoc(doc(db, 'categories', id), { active: !c.active });
    } else if (act === 'edit') {
      const v = await openModal({ title: 'تعديل التصنيف', fields: [{ id: 'name', label: 'الاسم', value: c.name, required: true }], validate: v => v.name.length > 80 ? 'الاسم طويل.' : '' });
      if (!v) return;
      await updateDoc(doc(db, 'categories', id), { name: v.name });
      toast('✅ تم التعديل');
    } else if (act === 'del') {
      const n = products.filter(p => p.categoryId === id).length;
      const v = await openModal({
        title: 'حذف التصنيف', danger: true, okText: 'احذف',
        message: n ? 'فيه ' + n + ' منتج في التصنيف ده، هيبقوا "بدون تصنيف".' : 'هيتحذف التصنيف "' + c.name + '".'
      });
      if (!v) return;
      await deleteDoc(doc(db, 'categories', id));
      toast('🗑️ تم حذف التصنيف');
    }
  } catch (e) { toast(errMsg(e), true); }
}

/* ---------- الطلبات ---------- */
function renderOrders() {
  const f = $('oFilter').value;
  const list = orders.filter(o => !f || o.status === f);
  $('ordersList').innerHTML = list.length === 0 ? '<p class="muted">مفيش طلبات.</p>' : list.map(o => {
    const items = (o.items || []).map(i =>
      '<li>' + esc(i.name) + (i.size ? ' - ' + esc(i.size) : '') + (i.color ? ' - ' + esc(i.color) : '') +
      ' × ' + Number(i.qty || 1) + ' = ' + fmtPrice(Number(i.price || 0) * Number(i.qty || 1)) + '</li>').join('');
    const wa = waNumber(o.customerPhone);
    return '<div class="ocard"><div class="head"><b>طلب #' + esc(o.id.slice(-6)) + '</b><span class="muted">' + fmtDate(o.createdAt) + '</span>' +
      '<select data-oid="' + escA(o.id) + '">' +
      Object.keys(STATUS).map(k => '<option value="' + k + '"' + (o.status === k ? ' selected' : '') + '>' + STATUS[k] + '</option>').join('') + '</select></div>' +
      '<div>👤 ' + esc(o.customerName) + ' — <a href="https://wa.me/' + escA(wa) + '" target="_blank" rel="noopener" dir="ltr">' + esc(o.customerPhone) + '</a></div>' +
      '<ul>' + items + '</ul><div><b>الإجمالي: ' + fmtPrice(o.total) + '</b></div>' +
      (o.note ? '<div class="muted">📝 ' + esc(o.note) + '</div>' : '') + '</div>';
  }).join('');
}

function listenOrders() {
  onSnapshot(
    query(collection(db, 'orders'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'), limit(100)),
    s => {
      orders = s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
      $('ordersHint').hidden = true;
      renderOrders();
      renderStats();
    },
    e => {
      if (String((e && e.code) || '').includes('failed-precondition')) {
        const m = String(e.message || '').match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
        $('ordersHint').innerHTML = '<h2>خطوة لمرة واحدة</h2><p class="muted">الطلبات محتاجة فهرس (Index) في Firebase. ' +
          (m ? 'اضغط الرابط ده واضغط Create، وانتظر دقايق:</p><p style="margin-top:.5rem"><a href="' + escA(m[0]) + '" target="_blank" rel="noopener">إنشاء الفهرس</a></p>'
            : 'اطلب من إدارة المنصة تنشئ فهرس orders (storeId تصاعدي، createdAt تنازلي).</p>');
        $('ordersHint').hidden = false;
      } else if (!store || store.active) toast('تعذّر تحميل الطلبات.', true);
    }
  );
}

/* ---------- بيانات المتجر ---------- */
function showLogo() {
  $('st_logoPrev').hidden = !isImageData(logoData);
  if (isImageData(logoData)) $('st_logoPrev').src = logoData;
}
function fillStoreForm() {
  const s = store;
  $('st_name').value = s.name || '';
  $('st_description').value = s.description || '';
  $('st_whatsapp').value = s.whatsapp || '';
  $('st_phone').value = s.phone || '';
  $('st_address').value = s.address || '';
  $('st_instagram').value = s.instagram || '';
  $('st_facebook').value = s.facebook || '';
  $('st_tiktok').value = s.tiktok || '';
  $('st_color').value = (s.theme && s.theme.color) || '#4f46e5';
  $('st_cols').value = String((s.theme && s.theme.cols) || 2);
  logoData = s.logo || '';
  showLogo();
}

async function saveStore(e) {
  e.preventDefault();
  const wa = $('st_whatsapp').value.replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(wa)) { toast('رقم الواتساب لازم يكون 8 لـ 15 رقم بالكود الدولي.', true); return; }
  for (const id of ['st_instagram', 'st_facebook', 'st_tiktok']) {
    const v = $(id).value.trim();
    if (v && !/^https?:\/\//i.test(v)) { toast('الروابط لازم تبدأ بـ https://', true); return; }
  }
  const data = {
    name: $('st_name').value.trim(), description: $('st_description').value.trim(), whatsapp: wa,
    phone: $('st_phone').value.trim(), address: $('st_address').value.trim(),
    instagram: $('st_instagram').value.trim(), facebook: $('st_facebook').value.trim(), tiktok: $('st_tiktok').value.trim(),
    logo: isImageData(logoData) ? logoData : '',
    theme: { color: $('st_color').value, cols: Number($('st_cols').value) === 3 ? 3 : 2 }
  };
  if (!data.name) { toast('اكتب اسم المتجر.', true); return; }
  $('st_save').disabled = true;
  try { await updateDoc(doc(db, 'stores', storeId), data); toast('✅ تم حفظ بيانات المتجر'); }
  catch (err) { toast(errMsg(err), true); }
  $('st_save').disabled = false;
}

/* ---------- تشغيل ---------- */
guard('store_owner', async (user, r) => {
  initModal();
  $('who').textContent = r.profile.displayName || user.email;
  $('logoutBtn').addEventListener('click', logout);
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  });

  try {
    const snap = await getDocs(query(collection(db, 'stores'), where('ownerUid', '==', user.uid), limit(1)));
    if (snap.empty) {
      $('homeBox').innerHTML = '<p class="muted">لسه مفيش متجر مربوط بحسابك. تواصل مع إدارة المنصة.</p>';
      document.querySelectorAll('#tabs button:not([data-tab="home"])').forEach(b => { b.hidden = true; });
      return;
    }
    storeId = snap.docs[0].id;
  } catch (e) { $('homeBox').innerHTML = '<p class="muted">تعذّر تحميل بيانات المتجر.</p>'; return; }

  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('catalogLink').value); toast('✅ اتنسخ الرابط'); }
    catch (e) { $('catalogLink').select(); toast('حدّد الرابط وانسخه يدويًا.', true); }
  });

  // منتجات
  $('addProductBtn').addEventListener('click', () => openSheet(null));
  $('pSearch').addEventListener('input', renderProducts);
  $('productsList').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) productAction(b.dataset.act, b.dataset.id); });
  $('sCancel').addEventListener('click', closeSheet);
  $('sSave').addEventListener('click', saveProduct);
  $('sheet').addEventListener('click', e => { if (e.target === $('sheet')) closeSheet(); });
  $('sFiles').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    busy = true;
    $('sSave').disabled = true;
    for (const f of files) {
      if (sheetImages.length >= MAX_IMG) { toast('أقصى عدد صور ' + MAX_IMG, true); break; }
      try { sheetImages.push(await compressFile(f)); renderSheetImages(); }
      catch (err) { toast('الصورة دي مش مدعومة.', true); }
    }
    busy = false;
    $('sSave').disabled = false;
  });
  $('sImgs').addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    const mk = e.target.closest('[data-main]');
    if (rm) sheetImages.splice(Number(rm.dataset.rm), 1);
    else if (mk) { const i = Number(mk.dataset.main); sheetImages.unshift(sheetImages.splice(i, 1)[0]); }
    else return;
    renderSheetImages();
  });

  // تصنيفات
  $('addCatBtn').addEventListener('click', addCat);
  $('catsList').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) catAction(b.dataset.act, b.dataset.id); });

  // طلبات
  $('oFilter').addEventListener('change', renderOrders);
  $('ordersList').addEventListener('change', async e => {
    const s = e.target.closest('select[data-oid]');
    if (!s) return;
    try { await updateDoc(doc(db, 'orders', s.dataset.oid), { status: s.value }); toast('✅ تم تغيير حالة الطلب'); }
    catch (err) { toast(errMsg(err), true); renderOrders(); }
  });

  // المتجر
  $('storeForm').addEventListener('submit', saveStore);
  $('st_logo').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { logoData = await compressFile(f, 240, 0.8, 40000); showLogo(); }
    catch (err) { toast('الصورة دي مش مدعومة.', true); }
  });
  $('st_logoClear').addEventListener('click', () => { logoData = ''; showLogo(); });

  // اشتراكات لحظية
  onSnapshot(doc(db, 'stores', storeId), s => {
    if (!s.exists()) return;
    store = { id: s.id, ...s.data() };
    renderHome();
    if (!formFilled) { fillStoreForm(); formFilled = true; }
  }, loadErr('بيانات المتجر'));
  onSnapshot(query(collection(db, 'products'), where('storeId', '==', storeId)), s => {
    products = s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
    renderProducts(); renderCats(); renderStats();
  }, loadErr('المنتجات'));
  onSnapshot(query(collection(db, 'categories'), where('storeId', '==', storeId)), s => {
    cats = s.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCats(); renderProducts(); renderStats();
  }, loadErr('التصنيفات'));
  listenOrders();
});
