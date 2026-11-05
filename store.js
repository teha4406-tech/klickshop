// كتالوج العملاء العام: بيتفتح برابط store.html?s=اسم-المتجر من غير تسجيل دخول
import { db } from './firebase-config.js';
import { esc, escA, latinDigits } from './app.js';
import { isImageData } from './images.js';
import { enabledMethods, instructions, methodLabel, isHttps } from './payments.js';
import {
  doc, getDoc, getDocs, setDoc, collection, query, where, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = id => document.getElementById(id);
const slug = (new URLSearchParams(location.search).get('s') || '').toLowerCase();
const CART_KEY = 'kc:cart:' + slug;
const CACHE_KEY = 'kc:data:' + slug;
const CACHE_TTL = 3 * 60 * 1000;   // الكاش 3 دقايق عشان نوفّر قراءات Firestore المجانية
const MAX_QTY = 20;
const MAX_LINES = 50;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
};

let store = null;
let cats = [];
let products = [];
let cart = [];
let activeCat = '';
let payKey = '';
let cur = null;
const imgCache = new Map();

/* ---------- أدوات ---------- */
const fmtPrice = n => Number(n || 0).toLocaleString('ar-EG') + ' ج.م';
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';
const waDigits = s => String(s || '').replace(/\D/g, '');
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}
function showState(msg) {
  $('state').textContent = msg;
  $('state').hidden = false;
  $('app').hidden = true;
}

/* ---------- تحميل البيانات ---------- */
async function loadData() {
  try {
    const c = JSON.parse(ss.get(CACHE_KEY) || 'null');
    if (c && Date.now() - c.t < CACHE_TTL && c.store && Array.isArray(c.products)) return c;
  } catch (e) { /* كاش بايظ، نتجاهله */ }

  const sSnap = await getDoc(doc(db, 'stores', slug));
  if (!sSnap.exists()) throw new Error('missing');
  const s = sSnap.data();
  const [cSnap, pSnap] = await Promise.all([
    getDocs(query(collection(db, 'categories'), where('storeId', '==', slug), where('active', '==', true))),
    getDocs(query(collection(db, 'products'), where('storeId', '==', slug), where('active', '==', true), limit(100)))
  ]);
  const data = {
    t: Date.now(),
    store: {
      name: s.name, description: s.description, whatsapp: s.whatsapp, phone: s.phone, address: s.address,
      instagram: s.instagram, facebook: s.facebook, tiktok: s.tiktok, logo: s.logo, theme: s.theme, payment: s.payment || {}
    },
    cats: cSnap.docs.map(d => ({ id: d.id, name: d.data().name, order: d.data().order || 0 })),
    products: pSnap.docs.map(d => {
      const p = d.data();
      return {
        id: d.id, name: p.name, description: p.description, price: p.price, oldPrice: p.oldPrice,
        categoryId: p.categoryId, sizes: p.sizes || [], colors: p.colors || [], featured: !!p.featured,
        thumb: p.thumb, imageCount: p.imageCount || 0, cs: (p.createdAt && p.createdAt.seconds) || 0
      };
    })
  };
  ss.set(CACHE_KEY, JSON.stringify(data));
  return data;
}

/* ---------- الواجهة ---------- */
function applyTheme() {
  const t = store.theme || {};
  const col = /^#[0-9a-fA-F]{6}$/.test(t.color || '') ? t.color : '#4f46e5';
  const n = parseInt(col.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  const root = document.documentElement.style;
  root.setProperty('--accent', col);
  root.setProperty('--on-accent', lum > 0.6 ? '#111827' : '#ffffff');
  root.setProperty('--cols', Number(t.cols) === 3 ? 3 : 2);
}

function renderHeader() {
  $('sName').textContent = store.name || '';
  $('sDesc').textContent = store.description || '';
  document.title = store.name || 'الكتالوج';
  if (isImageData(store.logo)) { $('logo').src = store.logo; $('logo').hidden = false; }
  const links = [];
  const wa = waDigits(store.whatsapp);
  if (wa) links.push('<a class="wa" href="https://wa.me/' + wa + '" target="_blank" rel="noopener">💬 واتساب</a>');
  const tel = String(store.phone || '').replace(/[^\d+]/g, '');
  if (tel) links.push('<a href="tel:' + escA(tel) + '">📞 اتصال</a>');
  [['instagram', '📸 انستجرام'], ['facebook', '👍 فيسبوك'], ['tiktok', '🎵 تيك توك']].forEach(([k, label]) => {
    if (safeUrl(store[k])) links.push('<a href="' + escA(store[k]) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
  });
  $('links').innerHTML = links.join('');
  $('addr').textContent = store.address ? '📍 ' + store.address : '';
}

function renderChips() {
  const used = cats.filter(c => products.some(p => p.categoryId === c.id));
  $('chips').hidden = used.length === 0;
  $('chips').innerHTML = '<button type="button" data-c=""' + (activeCat === '' ? ' class="on"' : '') + '>الكل</button>' +
    used.map(c => '<button type="button" data-c="' + escA(c.id) + '"' + (activeCat === c.id ? ' class="on"' : '') + '>' + esc(c.name) + '</button>').join('');
}

function renderGrid() {
  const q = $('q').value.trim().toLowerCase();
  const list = products
    .filter(p => (!activeCat || p.categoryId === activeCat) && (!q || (p.name + ' ' + (p.description || '')).toLowerCase().includes(q)))
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.cs || 0) - (a.cs || 0));
  $('empty').hidden = list.length > 0;
  $('grid').innerHTML = list.map(p => {
    const sale = Number(p.oldPrice) > Number(p.price) ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    return '<article class="card" data-id="' + escA(p.id) + '"><div class="im">' +
      (isImageData(p.thumb) ? '<img loading="lazy" src="' + escA(p.thumb) + '" alt="">' : '📷') +
      (p.featured ? '<span class="tag">⭐ مميز</span>' : '') + (sale ? '<span class="tag sale">-' + sale + '%</span>' : '') +
      '</div><div class="info"><h3>' + esc(p.name) + '</h3><div class="pr">' + fmtPrice(p.price) +
      (sale ? ' <s>' + fmtPrice(p.oldPrice) + '</s>' : '') + '</div></div></article>';
  }).join('');
}

/* ---------- تفاصيل المنتج ---------- */
function renderGallery() {
  const img = cur.imgs[cur.idx];
  $('pMain').hidden = !img;
  if (img) $('pMain').src = img;
  $('pThumbs').innerHTML = cur.imgs.length > 1
    ? cur.imgs.map((s, i) => '<img src="' + escA(s) + '" data-i="' + i + '" class="' + (i === cur.idx ? 'on' : '') + '" alt="">').join('') : '';
}

function renderOpts() {
  const p = cur.p;
  $('pSizesBox').hidden = !(p.sizes || []).length;
  $('pColorsBox').hidden = !(p.colors || []).length;
  $('pSizes').innerHTML = (p.sizes || []).map(s => '<button type="button" data-v="' + escA(s) + '" class="' + (cur.size === s ? 'on' : '') + '">' + esc(s) + '</button>').join('');
  $('pColors').innerHTML = (p.colors || []).map(s => '<button type="button" data-v="' + escA(s) + '" class="' + (cur.color === s ? 'on' : '') + '">' + esc(s) + '</button>').join('');
}

async function openProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  cur = { p, size: '', color: '', qty: 1, idx: 0, imgs: imgCache.get(id) || (isImageData(p.thumb) ? [p.thumb] : []) };
  $('pName').textContent = p.name;
  $('pPrice').innerHTML = fmtPrice(p.price) + (Number(p.oldPrice) > Number(p.price) ? ' <s>' + fmtPrice(p.oldPrice) + '</s>' : '');
  $('pDesc').textContent = p.description || '';
  $('pDesc').hidden = !p.description;
  $('qVal').textContent = '1';
  $('pErr').hidden = true;
  renderOpts();
  renderGallery();
  $('pOv').hidden = false;
  if (!imgCache.has(id) && p.imageCount > 0) {
    try {
      const s = await getDoc(doc(db, 'productImages', id));
      const imgs = s.exists() ? (s.data().images || []).filter(isImageData) : [];
      if (imgs.length) {
        imgCache.set(id, imgs);
        if (cur && cur.p.id === id) { cur.imgs = imgs; renderGallery(); }
      }
    } catch (e) { /* نكمّل بالصورة المصغرة */ }
  }
}
function closeProduct() { $('pOv').hidden = true; cur = null; }

/* ---------- السلة ---------- */
function loadCart() {
  try {
    const arr = JSON.parse(ls.get(CART_KEY) || '[]');
    cart = (Array.isArray(arr) ? arr : []).slice(0, MAX_LINES).map(i => ({
      key: String(i.key || ''), productId: String(i.productId || ''), name: String(i.name || '').slice(0, 120),
      price: Math.max(0, Number(i.price) || 0), qty: Math.min(MAX_QTY, Math.max(1, parseInt(i.qty, 10) || 1)),
      size: String(i.size || '').slice(0, 40), color: String(i.color || '').slice(0, 40)
    })).filter(i => i.key && i.productId);
  } catch (e) { cart = []; }
}
function saveCart() { ls.set(CART_KEY, JSON.stringify(cart)); renderCartBadge(); }

// بنحدّث أسعار السلة من الأسعار الحالية ونشيل المنتجات اللي اتشالت
function syncCart() {
  cart = cart.filter(i => products.some(p => p.id === i.productId));
  cart.forEach(i => { const p = products.find(x => x.id === i.productId); i.price = Number(p.price) || 0; i.name = p.name; });
  saveCart();
}
function cartTotal() { return cart.reduce((n, i) => n + i.price * i.qty, 0); }
function renderCartBadge() {
  const n = cart.reduce((s, i) => s + i.qty, 0);
  $('cartCount').textContent = n;
  $('cartBtn').hidden = n === 0;
}

function renderCart() {
  $('cItems').innerHTML = cart.length === 0 ? '<p class="empty">السلة فاضية.</p>' : cart.map(i => {
    const p = products.find(x => x.id === i.productId);
    const k = escA(i.key);
    return '<div class="ci">' + (p && isImageData(p.thumb) ? '<img src="' + escA(p.thumb) + '" alt="">' : '<div class="ph">📷</div>') +
      '<div class="t"><b>' + esc(i.name) + '</b><small>' + [i.size, i.color].filter(Boolean).map(esc).join(' • ') + '</small><div class="pr">' + fmtPrice(i.price * i.qty) + '</div></div>' +
      '<div class="q"><button type="button" data-k="' + k + '" data-d="-1">−</button><b>' + i.qty + '</b><button type="button" data-k="' + k + '" data-d="1">+</button></div>' +
      '<button class="rm" type="button" data-k="' + k + '" data-d="rm" aria-label="حذف">🗑️</button></div>';
  }).join('');
  $('cTotal').textContent = fmtPrice(cartTotal());
  $('sendBtn').disabled = cart.length === 0;
}

function openCart() {
  $('cBody').hidden = false;
  $('cDone').hidden = true;
  $('cErr').hidden = true;
  try {
    const c = JSON.parse(ls.get('kc:cust') || '{}');
    if (!$('cName').value) $('cName').value = String(c.n || '');
    if (!$('cPhone').value) $('cPhone').value = String(c.p || '');
  } catch (e) { /* ignore */ }
  renderCart();
  renderPay();
  $('cOv').hidden = false;
}

/* ---------- طرق الدفع ---------- */
function payInfoHtml(k) {
  if (!k) return '';
  const p = store.payment || {};
  let h = esc(instructions(k, p));
  if (k === 'link' && p.link && isHttps(p.link.url)) h = 'ادفع أونلاين: <a href="' + escA(p.link.url) + '" target="_blank" rel="noopener noreferrer">افتح صفحة الدفع</a>';
  if (p.note) h += '<br>' + esc(p.note);
  return h;
}
function renderPay() {
  const keys = enabledMethods(store.payment);
  $('cPayBox').hidden = keys.length === 0;
  if (!keys.includes(payKey)) payKey = keys.length === 1 ? keys[0] : '';
  $('cPayList').innerHTML = keys.map(k =>
    '<label class="' + (payKey === k ? 'on' : '') + '"><input type="radio" name="pay" value="' + k + '"' + (payKey === k ? ' checked' : '') + '> ' + esc(methodLabel(k)) + '</label>').join('');
  const h = payInfoHtml(payKey);
  $('cPayInfo').innerHTML = h;
  $('cPayInfo').hidden = !h;
}

function buildMessage(orderNo, name, phone, note) {
  const lines = ['🛍️ طلب جديد من *' + store.name + '*'];
  if (orderNo) lines.push('رقم الطلب: #' + orderNo);
  lines.push('', '👤 الاسم: ' + name, '📱 الهاتف: ' + phone, '', '🧾 الطلب:');
  cart.forEach((i, n) => lines.push((n + 1) + ') ' + i.name + (i.size ? ' — مقاس ' + i.size : '') + (i.color ? ' — لون ' + i.color : '') +
    ' × ' + i.qty + ' = ' + fmtPrice(i.price * i.qty)));
  lines.push('', '💰 الإجمالي: ' + fmtPrice(cartTotal()));
  if (payKey) lines.push('💳 طريقة الدفع: ' + methodLabel(payKey) + (payKey === 'cod' || payKey === 'link' ? '' : ' (هبعتلك صورة التحويل)'));
  if (note) lines.push('📝 ملاحظات: ' + note);
  return lines.join('\n');
}

async function sendOrder() {
  const err = m => { $('cErr').textContent = m; $('cErr').hidden = false; };
  $('cErr').hidden = true;
  const name = $('cName').value.trim();
  const phone = latinDigits($('cPhone').value.trim());
  const note = $('cNote').value.trim();
  const wa = waDigits(store.whatsapp);
  if (cart.length === 0) return err('السلة فاضية.');
  if (name.length < 2) return err('اكتب اسمك.');
  if (!/^[0-9+\s-]{6,20}$/.test(phone)) return err('اكتب رقم موبايل صحيح.');
  if (!wa) return err('رقم واتساب المتجر مش متاح حاليًا.');
  if (enabledMethods(store.payment).length && !payKey) return err('اختار طريقة الدفع.');
  if (Date.now() - (Number(ls.get('kc:last')) || 0) < 15000) return err('استنى ثواني وحاول تاني.');

  $('sendBtn').disabled = true;
  $('sendBtn').textContent = '⏳ جاري الإرسال...';
  const total = cartTotal();
  const ref = doc(collection(db, 'orders'));
  let orderNo = '';
  try {
    await setDoc(ref, {
      storeId: slug, customerName: name.slice(0, 80), customerPhone: phone,
      items: cart.map(i => ({ productId: i.productId, name: i.name, price: i.price, qty: i.qty, size: i.size, color: i.color })),
      total, ...(note ? { note: note.slice(0, 500) } : {}), status: 'new', paymentMethod: payKey || 'cod', paymentStatus: 'unpaid', createdAt: serverTimestamp()
    });
    orderNo = ref.id.slice(-6);
  } catch (e) { orderNo = ''; /* الطلب هيتبعت لواتساب حتى لو التسجيل فشل */ }

  const url = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(buildMessage(orderNo, name, phone, note));
  ls.set('kc:cust', JSON.stringify({ n: name, p: phone }));
  ls.set('kc:last', String(Date.now()));
  cart = [];
  saveCart();
  $('cNote').value = '';
  $('sendBtn').textContent = '📲 إرسال الطلب عبر واتساب';
  $('cBody').hidden = true;
  $('cDone').hidden = false;
  $('cDoneMsg').textContent = (orderNo ? 'تم تسجيل طلبك رقم #' + orderNo + '. ' : 'جهّزنا طلبك. ') + 'هنفتحلك واتساب عشان تبعته لصاحب المحل.';
  $('cDonePay').innerHTML = payInfoHtml(payKey);
  $('cDonePay').hidden = !payKey;
  $('waAgain').href = url;
  setTimeout(() => { location.href = url; }, 400);
}

/* ---------- تشغيل ---------- */
async function init() {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 40) { showState('رابط المتجر غير صحيح.'); return; }
  try {
    const d = await loadData();
    store = d.store;
    cats = [...d.cats].sort(byOrder);
    products = d.products;
  } catch (e) {
    const c = String((e && e.code) || '');
    showState(c.includes('unavailable') || c.includes('network') ? 'تأكد من اتصال الإنترنت وحاول تاني.' : 'المتجر غير متاح حاليًا.');
    return;
  }
  applyTheme();
  renderHeader();
  renderChips();
  renderGrid();
  loadCart();
  syncCart();
  $('state').hidden = true;
  $('app').hidden = false;

  $('q').addEventListener('input', renderGrid);
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    activeCat = b.dataset.c;
    renderChips();
    renderGrid();
  });
  $('grid').addEventListener('click', e => { const c = e.target.closest('.card'); if (c) openProduct(c.dataset.id); });

  $('pClose').addEventListener('click', closeProduct);
  $('pOv').addEventListener('click', e => { if (e.target === $('pOv')) closeProduct(); });
  $('pThumbs').addEventListener('click', e => { const i = e.target.closest('[data-i]'); if (i && cur) { cur.idx = Number(i.dataset.i); renderGallery(); } });
  $('pSizes').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b && cur) { cur.size = b.dataset.v; renderOpts(); } });
  $('pColors').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b && cur) { cur.color = b.dataset.v; renderOpts(); } });
  $('qMinus').addEventListener('click', () => { if (cur && cur.qty > 1) { cur.qty--; $('qVal').textContent = cur.qty; } });
  $('qPlus').addEventListener('click', () => { if (cur && cur.qty < MAX_QTY) { cur.qty++; $('qVal').textContent = cur.qty; } });
  $('addBtn').addEventListener('click', () => {
    if (!cur) return;
    const p = cur.p;
    const perr = m => { $('pErr').textContent = m; $('pErr').hidden = false; };
    if ((p.sizes || []).length && !cur.size) return perr('اختار المقاس.');
    if ((p.colors || []).length && !cur.color) return perr('اختار اللون.');
    const key = p.id + '|' + cur.size + '|' + cur.color;
    const ex = cart.find(i => i.key === key);
    if (ex) ex.qty = Math.min(MAX_QTY, ex.qty + cur.qty);
    else {
      if (cart.length >= MAX_LINES) return perr('السلة وصلت للحد الأقصى.');
      cart.push({ key, productId: p.id, name: p.name, price: Number(p.price) || 0, qty: cur.qty, size: cur.size, color: cur.color });
    }
    saveCart();
    closeProduct();
    toast('✅ اتضاف للسلة');
  });

  $('cartBtn').addEventListener('click', openCart);
  $('cClose').addEventListener('click', () => { $('cOv').hidden = true; });
  $('cBack').addEventListener('click', () => { $('cOv').hidden = true; });
  $('cOv').addEventListener('click', e => { if (e.target === $('cOv')) $('cOv').hidden = true; });
  $('cItems').addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const i = cart.find(x => x.key === b.dataset.k);
    if (!i) return;
    if (b.dataset.d === 'rm') cart = cart.filter(x => x !== i);
    else i.qty = Math.min(MAX_QTY, Math.max(1, i.qty + Number(b.dataset.d)));
    saveCart();
    renderCart();
  });
  $('sendBtn').addEventListener('click', sendOrder);
  $('cPayList').addEventListener('change', e => { const r = e.target.closest('input[name="pay"]'); if (r) { payKey = r.value; renderPay(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeProduct(); $('cOv').hidden = true; } });
}
init();
