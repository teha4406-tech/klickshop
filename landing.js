// الصفحة التسويقية: الاسم والتواصل من platformSettings/main، والباقات من plans (مفيش بيانات وهمية)
import { db } from './firebase-config.js';
import { esc, escA } from './app.js';
import { doc, getDoc, getDocs, collection } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = id => document.getElementById(id);

async function init() {
  let ps = {};
  try { const s = await getDoc(doc(db, 'platformSettings', 'main')); if (s.exists()) ps = s.data(); } catch (e) { /* نكمّل بالافتراضي */ }
  const name = ps.name || 'KlikShop';
  document.querySelectorAll('[data-name]').forEach(el => { el.textContent = name; });
  document.title = name + ' | كتالوج إلكتروني لمحلك';
  if (ps.tagline) { $('fTag').textContent = '— ' + ps.tagline; $('hSub').textContent = ps.tagline; }

  const wa = String(ps.whatsapp || '').replace(/\D/g, '');
  const mail = String(ps.email || '').trim();
  const waLink = text => 'https://wa.me/' + wa + (text ? '?text=' + encodeURIComponent(text) : '');
  const links = [];
  if (wa) links.push('<a class="btn wa sm" href="' + escA(waLink('')) + '" target="_blank" rel="noopener">💬 تواصل واتساب</a>');
  if (mail) links.push('<a class="btn ghost sm" style="color:#fff;border-color:#fff" href="mailto:' + escA(mail) + '">✉️ ' + esc(mail) + '</a>');
  $('contact').innerHTML = links.join('');
  if (wa) $('cta').innerHTML = '<a class="btn wa" href="' + escA(waLink('أهلا، عايز أعرف عن ' + name)) + '" target="_blank" rel="noopener">💬 ابدأ دلوقتي</a><a class="btn" href="#pricing">شوف الباقات</a>';

  // الباقات
  let plans = [];
  try {
    plans = (await getDocs(collection(db, 'plans'))).docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  } catch (e) { /* ignore */ }
  const cur = ps.currency || 'ج.م';
  $('plans').innerHTML = plans.length === 0
    ? '<div class="soon" style="grid-column:1/-1">الأسعار هتتحدد قريبًا. تواصل معانا وهنعرض عليك الباقة المناسبة.</div>'
    : plans.map(p => {
      const lim = Number(p.maxProducts) > 0 ? 'حتى ' + Number(p.maxProducts).toLocaleString('ar-EG') + ' منتج' : 'منتجات غير محدودة';
      const feats = [lim].concat(Array.isArray(p.features) ? p.features : []);
      const msg = 'أهلا، عايز أشترك في باقة ' + (p.name || '');
      return '<div class="plan' + (p.highlight ? ' hl' : '') + '">' + (p.highlight ? '<span class="badge">الأكثر طلبًا</span>' : '') +
        '<h3>' + esc(p.name || '') + '</h3><div class="price">' + Number(p.price || 0).toLocaleString('ar-EG') + ' <small>' + esc(cur) + ' / ' + (p.period === 'year' ? 'سنة' : 'شهر') + '</small></div>' +
        '<ul>' + feats.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul>' +
        (wa ? '<a class="btn" href="' + escA(waLink(msg)) + '" target="_blank" rel="noopener">اشترك الآن</a>' : '<a class="btn" href="login.html">تسجيل الدخول</a>') + '</div>';
    }).join('');
}
init();
