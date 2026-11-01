// تبويبات المدير العام الإضافية: الباقات والاشتراكات، المنتجات، الطلبات، التقارير، إعدادات المنصة
import { db } from './firebase-config.js';
import { esc, escA, latinDigits } from './app.js';
import { isImageData } from './images.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit,
  onSnapshot, getCountFromServer, getAggregateFromServer, sum, count, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = id => document.getElementById(id);
const STATUS = { new: 'جديد', confirmed: 'مؤكد', shipped: 'اتشحن', delivered: 'اتسلّم', cancelled: 'ملغي' };
const fmtPrice = n => Number(n || 0).toLocaleString('ar-EG') + ' ج.م';
const p2 = x => String(x).padStart(2, '0');
const fmtDay = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const fmtDateTime = ts => { try { const d = ts.toDate(); return fmtDay(d) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); } catch (e) { return ''; } };
const byName = (a, b) => String(a.name).localeCompare(String(b.name));
const indexHint = e => {
  const m = String((e && e.message) || '').match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
  return m ? '<p class="muted">محتاج فهرس في Firebase. <a href="' + escA(m[0]) + '" target="_blank" rel="noopener">اضغط هنا</a> واضغط Create وانتظر دقايق.</p>' : '<p class="muted">تعذّر تحميل البيانات.</p>';
};

export function initExtra(ctx) {
  const { openModal, toast, errMsg, getStores } = ctx;
  let plans = [];
  let subs = {};
  let prods = [];
  let orders = [];
  let period = '30';

  /* ---------------- الباقات ---------------- */
  const planFields = p => [
    { id: 'name', label: 'اسم الباقة', value: p ? p.name : '', required: true },
    { id: 'price', label: 'السعر', type: 'number', value: p ? String(p.price) : '', required: true },
    { id: 'period', label: 'المدة', type: 'select', value: p ? (p.period || 'month') : 'month', options: [{ value: 'month', label: 'شهري' }, { value: 'year', label: 'سنوي' }] },
    { id: 'maxProducts', label: 'أقصى عدد منتجات (0 = غير محدود)', type: 'number', value: p ? String(p.maxProducts || 0) : '0', required: true },
    { id: 'features', label: 'مميزات الباقة (كل ميزة في سطر)', type: 'textarea', value: p ? (p.features || []).join('\n') : '' },
    { id: 'highlight', label: 'علامة "الأكثر طلبًا"', type: 'select', value: p && p.highlight ? '1' : '0', options: [{ value: '0', label: 'لأ' }, { value: '1', label: 'أيوه' }] },
    { id: 'active', label: 'تظهر في الصفحة التسويقية', type: 'select', value: p && p.active === false ? '0' : '1', options: [{ value: '1', label: 'أيوه' }, { value: '0', label: 'لأ' }] },
    { id: 'order', label: 'الترتيب (رقم)', type: 'number', value: p ? String(p.order || 0) : String(plans.length + 1) }
  ];
  const planValidate = v => (!(Number(v.price) >= 0) ? 'السعر غير صحيح.' :
    (!(Number(v.maxProducts) >= 0) ? 'عدد المنتجات غير صحيح.' : (v.name.length > 60 ? 'الاسم طويل.' : '')));
  const planData = v => ({
    name: v.name, price: Number(v.price), period: v.period, maxProducts: Math.floor(Number(v.maxProducts)),
    features: v.features.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 15),
    highlight: v.highlight === '1', active: v.active === '1', order: Number(v.order) || 0
  });

  function renderPlans() {
    const list = [...plans].sort((a, b) => (a.order || 0) - (b.order || 0));
    $('plansList').innerHTML = list.length === 0 ? '<p class="muted">مفيش باقات. اضغط "باقة جديدة".</p>' : list.map(p => {
      const id = escA(p.id);
      return '<div class="item"><div class="grow"><b>' + esc(p.name) + '</b> <span class="pill ' + (p.active !== false ? 'on' : 'off') + '">' + (p.active !== false ? 'ظاهرة' : 'مخفية') + '</span>' +
        (p.highlight ? ' <span class="pill on">الأكثر طلبًا</span>' : '') +
        '<div class="sub">' + fmtPrice(p.price) + ' / ' + (p.period === 'year' ? 'سنة' : 'شهر') + ' — ' + (Number(p.maxProducts) > 0 ? 'حتى ' + Number(p.maxProducts) + ' منتج' : 'منتجات غير محدودة') + '</div></div>' +
        '<div class="actions"><button type="button" data-act="edit" data-id="' + id + '">✏️ تعديل</button><button type="button" class="danger" data-act="del" data-id="' + id + '">🗑️ حذف</button></div></div>';
    }).join('');
  }

  async function addPlan() {
    const v = await openModal({ title: 'باقة جديدة', fields: planFields(null), validate: planValidate });
    if (!v) return;
    try { await setDoc(doc(collection(db, 'plans')), { ...planData(v), createdAt: serverTimestamp() }); toast('✅ تم إضافة الباقة'); }
    catch (e) { toast(errMsg(e), true); }
  }
  async function planAction(act, id) {
    const p = plans.find(x => x.id === id);
    if (!p) return;
    try {
      if (act === 'edit') {
        const v = await openModal({ title: 'تعديل الباقة', fields: planFields(p), validate: planValidate });
        if (!v) return;
        await updateDoc(doc(db, 'plans', id), planData(v));
        toast('✅ تم التعديل');
      } else if (act === 'del') {
        const used = Object.values(subs).filter(s => s.planId === id).length;
        const v = await openModal({ title: 'حذف الباقة', danger: true, okText: 'احذف', message: used ? 'فيه ' + used + ' متجر مشترك فيها. الاشتراكات هتفضل زي ما هي.' : 'هتتحذف الباقة "' + p.name + '".' });
        if (!v) return;
        await deleteDoc(doc(db, 'plans', id));
        toast('🗑️ تم حذف الباقة');
      }
    } catch (e) { toast(errMsg(e), true); }
  }

  /* ---------------- الاشتراكات ---------------- */
  function subState(sub) {
    if (!sub) return { label: 'بدون اشتراك', cls: 'off', days: null };
    const end = sub.endsAt && sub.endsAt.toDate ? sub.endsAt.toDate() : null;
    const days = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
    if (sub.status === 'expired' || (days !== null && days < 0)) return { label: 'منتهي', cls: 'off', days };
    if (sub.status === 'trial') return { label: 'تجريبي', cls: 'warn', days };
    if (days !== null && days <= 7) return { label: 'قرب ينتهي', cls: 'warn', days };
    return { label: 'نشط', cls: 'on', days };
  }
  function renderSubs() {
    const stores = getStores();
    $('subsList').innerHTML = stores.length === 0 ? '<p class="muted">مفيش متاجر.</p>' : [...stores].sort(byName).map(s => {
      const sub = subs[s.id];
      const st = subState(sub);
      const id = escA(s.id);
      const end = sub && sub.endsAt && sub.endsAt.toDate ? sub.endsAt.toDate() : null;
      return '<div class="item"><div class="grow"><b>' + esc(s.name) + '</b> <span class="pill ' + st.cls + '">' + st.label + '</span>' +
        '<div class="sub">' + (sub ? esc(sub.planName || '—') + (end ? ' — ينتهي ' + fmtDay(end) + (st.days >= 0 ? ' (باقي ' + st.days + ' يوم)' : '') : '') : 'مفيش اشتراك') + '</div></div>' +
        '<div class="actions"><button type="button" data-act="sub" data-id="' + id + '">✏️ اشتراك</button>' +
        (sub ? '<button type="button" data-act="renew" data-id="' + id + '">🔁 تجديد</button>' : '') + '</div></div>';
    }).join('');
  }
  async function editSub(s) {
    if (plans.length === 0) { toast('أنشئ باقة الأول.', true); return; }
    const sub = subs[s.id];
    const end = sub && sub.endsAt && sub.endsAt.toDate ? sub.endsAt.toDate() : new Date(Date.now() + 30 * 86400000);
    const v = await openModal({
      title: 'اشتراك: ' + s.name,
      fields: [
        { id: 'planId', label: 'الباقة', type: 'select', value: sub && plans.some(p => p.id === sub.planId) ? sub.planId : plans[0].id, options: plans.map(p => ({ value: p.id, label: p.name })) },
        { id: 'status', label: 'الحالة', type: 'select', value: sub ? sub.status : 'active', options: [{ value: 'active', label: 'نشط' }, { value: 'trial', label: 'تجريبي' }, { value: 'expired', label: 'منتهي' }] },
        { id: 'endDate', label: 'تاريخ الانتهاء', type: 'date', value: fmtDay(end), required: true },
        { id: 'note', label: 'ملاحظات (اختياري)', value: sub ? (sub.note || '') : '' }
      ]
    });
    if (!v) return;
    const plan = plans.find(p => p.id === v.planId);
    const endDate = new Date(v.endDate + 'T23:59:59');
    if (!plan || isNaN(endDate.getTime())) { toast('البيانات غير صحيحة.', true); return; }
    try {
      await setDoc(doc(db, 'subscriptions', s.id), {
        storeId: s.id, planId: plan.id, planName: plan.name, price: Number(plan.price), maxProducts: Number(plan.maxProducts) || 0,
        status: v.status, startsAt: sub && sub.startsAt ? sub.startsAt : serverTimestamp(),
        endsAt: Timestamp.fromDate(endDate), note: v.note, updatedAt: serverTimestamp()
      });
      toast('✅ تم حفظ الاشتراك');
    } catch (e) { toast(errMsg(e), true); }
  }
  async function renewSub(s) {
    const sub = subs[s.id];
    if (!sub) return;
    const plan = plans.find(p => p.id === sub.planId);
    const days = plan && plan.period === 'year' ? 365 : 30;
    const end = sub.endsAt && sub.endsAt.toDate ? sub.endsAt.toDate() : new Date();
    const base = end.getTime() > Date.now() ? end : new Date();
    const next = new Date(base.getTime() + days * 86400000);
    next.setHours(23, 59, 59, 0);
    try {
      await updateDoc(doc(db, 'subscriptions', s.id), { endsAt: Timestamp.fromDate(next), status: 'active', updatedAt: serverTimestamp() });
      toast('✅ تم التجديد لحد ' + fmtDay(next));
    } catch (e) { toast(errMsg(e), true); }
  }

  /* ---------------- المنتجات ---------------- */
  async function loadProducts() {
    const id = $('aStore').value;
    if (!id) { prods = []; $('aProducts').innerHTML = '<p class="muted">اختار متجر لعرض منتجاته.</p>'; return; }
    $('aProducts').innerHTML = '<p class="muted">جاري التحميل...</p>';
    try {
      const snap = await getDocs(query(collection(db, 'products'), where('storeId', '==', id), limit(100)));
      prods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderProducts();
    } catch (e) { $('aProducts').innerHTML = '<p class="muted">تعذّر تحميل المنتجات.</p>'; }
  }
  function renderProducts() {
    $('aProducts').innerHTML = prods.length === 0 ? '<p class="muted">مفيش منتجات في المتجر ده.</p>' : prods.map(p => {
      const id = escA(p.id);
      return '<div class="item">' + (isImageData(p.thumb) ? '<img class="thumb48" src="' + escA(p.thumb) + '" alt="">' : '<div class="thumb48" style="display:grid;place-items:center">📷</div>') +
        '<div class="grow"><b>' + esc(p.name) + '</b> <span class="pill ' + (p.active ? 'on' : 'off') + '">' + (p.active ? 'ظاهر' : 'مخفي') + '</span><div class="sub">' + fmtPrice(p.price) + '</div></div>' +
        '<div class="actions"><button type="button" data-act="toggle" data-id="' + id + '">' + (p.active ? '🙈 إخفاء' : '👁️ إظهار') + '</button>' +
        '<button type="button" class="danger" data-act="del" data-id="' + id + '">🗑️</button></div></div>';
    }).join('');
  }
  async function productAction(act, id) {
    const p = prods.find(x => x.id === id);
    if (!p) return;
    try {
      if (act === 'toggle') {
        await updateDoc(doc(db, 'products', id), { active: !p.active });
        p.active = !p.active;
        renderProducts();
        toast(p.active ? '👁️ ظهر في الكتالوج' : '🙈 اتخفى من الكتالوج');
      } else if (act === 'del') {
        const v = await openModal({ title: 'حذف المنتج', danger: true, okText: 'احذف', message: 'هيتحذف "' + p.name + '" نهائيًا.' });
        if (!v) return;
        try {
          const b = writeBatch(db);
          b.delete(doc(db, 'products', id));
          b.delete(doc(db, 'productImages', id));
          await b.commit();
        } catch (e2) { await deleteDoc(doc(db, 'products', id)); }
        prods = prods.filter(x => x.id !== id);
        renderProducts();
        toast('🗑️ تم حذف المنتج');
      }
    } catch (e) { toast(errMsg(e), true); }
  }

  /* ---------------- الطلبات ---------------- */
  async function loadOrders() {
    $('oHint').hidden = true;
    $('aOrders').innerHTML = '<p class="muted">جاري التحميل...</p>';
    const sid = $('oStore').value;
    try {
      const q = sid
        ? query(collection(db, 'orders'), where('storeId', '==', sid), orderBy('createdAt', 'desc'), limit(100))
        : query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100));
      orders = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
      renderOrders();
    } catch (e) {
      $('aOrders').innerHTML = '';
      $('oHint').innerHTML = indexHint(e);
      $('oHint').hidden = false;
    }
  }
  function renderOrders() {
    const f = $('oStatus').value;
    const list = orders.filter(o => !f || o.status === f);
    const names = {};
    getStores().forEach(s => { names[s.id] = s.name; });
    $('aOrders').innerHTML = list.length === 0 ? '<p class="muted">مفيش طلبات.</p>' : list.map(o => {
      const items = (o.items || []).map(i => '<li>' + esc(i.name) + (i.size ? ' - ' + esc(i.size) : '') + (i.color ? ' - ' + esc(i.color) : '') + ' × ' + Number(i.qty || 1) + '</li>').join('');
      const id = escA(o.id);
      return '<div class="ocard"><div class="head"><b>#' + esc(o.id.slice(-6)) + ' — ' + esc(names[o.storeId] || o.storeId) + '</b><span class="muted">' + fmtDateTime(o.createdAt) + '</span>' +
        '<select data-oid="' + id + '">' + Object.keys(STATUS).map(k => '<option value="' + k + '"' + (o.status === k ? ' selected' : '') + '>' + STATUS[k] + '</option>').join('') + '</select></div>' +
        '<div>👤 ' + esc(o.customerName) + ' — <span dir="ltr">' + esc(o.customerPhone) + '</span></div><ul>' + items + '</ul>' +
        '<div><b>' + fmtPrice(o.total) + '</b></div><div class="actions" style="margin-top:.4rem"><button type="button" class="danger" data-del="' + id + '">🗑️ حذف الطلب</button></div></div>';
    }).join('');
  }

  /* ---------------- التقارير ---------------- */
  async function runReports() {
    $('rHint').hidden = true;
    $('rStores').innerHTML = '<p class="muted">جاري التحميل...</p>';
    const col = collection(db, 'orders');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let since = null;
    if (period === 'today') since = today;
    else if (period === '7' || period === '30') { since = new Date(today); since.setDate(since.getDate() - (period === '7' ? 6 : 29)); }
    try {
      const q = since ? query(col, where('createdAt', '>=', Timestamp.fromDate(since))) : col;
      const agg = (await getAggregateFromServer(q, { n: count(), total: sum('total') })).data();
      const sc = await Promise.all(Object.keys(STATUS).map(async k => [k, (await getCountFromServer(query(col, where('status', '==', k)))).data().count]));
      const stores = getStores();
      const rows = await Promise.all(stores.map(async s => {
        const [o, p] = await Promise.all([
          getAggregateFromServer(query(col, where('storeId', '==', s.id)), { n: count(), total: sum('total') }),
          getCountFromServer(query(collection(db, 'products'), where('storeId', '==', s.id)))
        ]);
        return { s, orders: o.data().n, total: o.data().total || 0, products: p.data().count };
      }));
      const subList = stores.map(s => subState(subs[s.id]));
      const box = (n, l) => '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>';
      $('rStats').innerHTML = box(Number(agg.n).toLocaleString('ar-EG'), 'طلبات الفترة') + box(fmtPrice(agg.total || 0), 'قيمة طلبات الفترة') +
        box(stores.filter(s => s.active).length + ' / ' + stores.length, 'متاجر شغّالة') +
        box(subList.filter(x => x.cls === 'warn' && x.label === 'قرب ينتهي').length, 'اشتراكات قربت تنتهي') +
        box(subList.filter(x => x.label === 'منتهي').length, 'اشتراكات منتهية');
      $('rStatus').textContent = 'كل الطلبات حسب الحالة: ' + sc.map(([k, n]) => STATUS[k] + ' ' + n).join(' • ');
      const max = Math.max(1, ...rows.map(r => r.total));
      $('rStores').innerHTML = rows.length === 0 ? '<p class="muted">مفيش متاجر.</p>' : rows.sort((a, b) => b.total - a.total).map(r =>
        '<div class="barrow"><div class="n">' + esc(r.s.name) + '</div><div class="tr"><div class="fl" style="width:' + (r.total / max * 100) + '%"></div></div>' +
        '<div class="v">' + fmtPrice(r.total) + '<br>' + r.orders + ' طلب • ' + r.products + ' منتج</div></div>').join('') +
        '<p class="muted" style="margin-top:.6rem;font-size:.82rem">أرقام المتاجر لكل الوقت (مش للفترة المختارة).</p>';
    } catch (e) {
      $('rStores').innerHTML = '';
      $('rHint').innerHTML = indexHint(e);
      $('rHint').hidden = false;
    }
  }

  /* ---------------- إعدادات المنصة ---------------- */
  async function loadSettings() {
    try {
      const s = await getDoc(doc(db, 'platformSettings', 'main'));
      const d = s.exists() ? s.data() : {};
      $('ps_name').value = d.name || '';
      $('ps_tagline').value = d.tagline || '';
      $('ps_whatsapp').value = d.whatsapp || '';
      $('ps_email').value = d.email || '';
      $('ps_currency').value = d.currency || '';
    } catch (e) { toast('تعذّر تحميل الإعدادات.', true); }
  }
  async function saveSettings() {
    const wa = latinDigits($('ps_whatsapp').value).replace(/\D/g, '');
    if (wa && !/^\d{8,15}$/.test(wa)) { toast('رقم الواتساب لازم 8 لـ 15 رقم بالكود الدولي.', true); return; }
    try {
      await setDoc(doc(db, 'platformSettings', 'main'), {
        name: $('ps_name').value.trim(), tagline: $('ps_tagline').value.trim(), whatsapp: wa,
        email: $('ps_email').value.trim(), currency: $('ps_currency').value.trim(), updatedAt: serverTimestamp()
      }, { merge: true });
      toast('✅ تم حفظ إعدادات المنصة');
    } catch (e) { toast(errMsg(e), true); }
  }

  /* ---------------- ربط ---------------- */
  function fillSelect(id, first) {
    const el = $(id);
    const cur = el.value;
    el.innerHTML = '<option value="">' + first + '</option>' + [...getStores()].sort(byName).map(s => '<option value="' + escA(s.id) + '">' + esc(s.name) + '</option>').join('');
    el.value = cur;
  }
  function refresh() { fillSelect('aStore', 'اختار متجر'); fillSelect('oStore', 'كل المتاجر'); renderSubs(); }

  onSnapshot(collection(db, 'plans'), s => { plans = s.docs.map(d => ({ id: d.id, ...d.data() })); renderPlans(); renderSubs(); }, () => toast('تعذّر تحميل الباقات.', true));
  onSnapshot(collection(db, 'subscriptions'), s => {
    subs = {};
    s.docs.forEach(d => { subs[d.id] = d.data({ serverTimestamps: 'estimate' }); });
    renderSubs();
  }, () => toast('تعذّر تحميل الاشتراكات.', true));

  $('addPlanBtn').addEventListener('click', addPlan);
  $('plansList').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) planAction(b.dataset.act, b.dataset.id); });
  $('subsList').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const s = getStores().find(x => x.id === b.dataset.id);
    if (s) (b.dataset.act === 'renew' ? renewSub : editSub)(s);
  });
  $('aStore').addEventListener('change', loadProducts);
  $('aProducts').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) productAction(b.dataset.act, b.dataset.id); });
  $('oStore').addEventListener('change', loadOrders);
  $('oStatus').addEventListener('change', renderOrders);
  $('aOrdersRefresh').addEventListener('click', loadOrders);
  $('aOrders').addEventListener('change', async e => {
    const s = e.target.closest('select[data-oid]');
    if (!s) return;
    try { await updateDoc(doc(db, 'orders', s.dataset.oid), { status: s.value }); const o = orders.find(x => x.id === s.dataset.oid); if (o) o.status = s.value; toast('✅ تم تغيير الحالة'); }
    catch (err) { toast(errMsg(err), true); renderOrders(); }
  });
  $('aOrders').addEventListener('click', async e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const v = await openModal({ title: 'حذف الطلب', danger: true, okText: 'احذف', message: 'هيتحذف الطلب نهائيًا.' });
    if (!v) return;
    try { await deleteDoc(doc(db, 'orders', b.dataset.del)); orders = orders.filter(o => o.id !== b.dataset.del); renderOrders(); toast('🗑️ تم حذف الطلب'); }
    catch (err) { toast(errMsg(err), true); }
  });
  $('rPeriod').addEventListener('click', e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    period = b.dataset.p;
    document.querySelectorAll('#rPeriod button').forEach(x => x.classList.toggle('on', x === b));
    runReports();
  });
  $('rRefresh').addEventListener('click', runReports);
  $('ps_save').addEventListener('click', saveSettings);
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    if (b.dataset.tab === 'products') loadProducts();
    else if (b.dataset.tab === 'orders') loadOrders();
    else if (b.dataset.tab === 'reports') runReports();
    else if (b.dataset.tab === 'settings') loadSettings();
  });

  return { refresh };
}
