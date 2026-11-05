// طرق الدفع اليدوية: عند الاستلام، إنستاباي، محفظة، تحويل بنكي، رابط دفع
// بتتخزن في stores/{id}.payment (للمتجر) و platformSettings/main.payment (لاشتراكات المتاجر)
import { latinDigits } from './app.js';

export const PAY_METHODS = {
  cod: { icon: '💵', label: 'الدفع عند الاستلام' },
  instapay: { icon: '⚡', label: 'إنستاباي' },
  wallet: { icon: '📱', label: 'محفظة إلكترونية' },
  bank: { icon: '🏦', label: 'تحويل بنكي' },
  link: { icon: '🔗', label: 'رابط دفع أونلاين' }
};
export const methodLabel = k => PAY_METHODS[k] ? PAY_METHODS[k].icon + ' ' + PAY_METHODS[k].label : (k ? String(k) : '');
export const isHttps = u => /^https:\/\/[^\s]+$/i.test(String(u || ''));

// الطرق المفعّلة فعلًا (مفعّلة وبياناتها مكتوبة)
export function enabledMethods(p) {
  p = p || {};
  const out = [];
  if (p.cod && p.cod.on) out.push('cod');
  if (p.instapay && p.instapay.on && p.instapay.address) out.push('instapay');
  if (p.wallet && p.wallet.on && p.wallet.number) out.push('wallet');
  if (p.bank && p.bank.on && p.bank.account) out.push('bank');
  if (p.link && p.link.on && isHttps(p.link.url)) out.push('link');
  return out;
}

// تعليمات الدفع (بتظهر للعميل وبتتبعت في واتساب)
export function instructions(k, p) {
  p = p || {};
  if (k === 'cod') return 'هتدفع الحساب كاش عند استلام الطلب.';
  if (k === 'instapay' && p.instapay) return 'حوّل المبلغ على إنستاباي: ' + p.instapay.address + ' وابعت صورة التحويل على واتساب.';
  if (k === 'wallet' && p.wallet) return 'حوّل المبلغ على ' + (p.wallet.label || 'المحفظة') + ': ' + p.wallet.number + ' وابعت صورة التحويل على واتساب.';
  if (k === 'bank' && p.bank) return 'حوّل المبلغ على الحساب البنكي: ' + [p.bank.bank, p.bank.holder, p.bank.account].filter(Boolean).join(' - ') + ' وابعت صورة التحويل على واتساب.';
  if (k === 'link' && p.link) return 'ادفع أونلاين من الرابط: ' + p.link.url;
  return '';
}

/* ---------- فورم الإعدادات (بيتحط جوه لوحة صاحب المحل ولوحة المدير) ---------- */
export function payFormHtml(prefix, opts = {}) {
  const i = id => ' id="' + prefix + '_' + id + '"';
  return '<div class="payform">' +
    (opts.noCod ? '' : '<label class="chk"><input type="checkbox"' + i('cod_on') + '> 💵 الدفع عند الاستلام</label>') +
    '<label class="chk"><input type="checkbox"' + i('instapay_on') + '> ⚡ إنستاباي</label>' +
    '<input' + i('instapay_address') + ' dir="ltr" maxlength="60" placeholder="عنوان إنستاباي (مثال name@instapay)">' +
    '<label class="chk"><input type="checkbox"' + i('wallet_on') + '> 📱 محفظة إلكترونية</label>' +
    '<input' + i('wallet_label') + ' maxlength="30" placeholder="اسم المحفظة (فودافون كاش...)">' +
    '<input' + i('wallet_number') + ' dir="ltr" inputmode="numeric" maxlength="20" placeholder="رقم المحفظة">' +
    '<label class="chk"><input type="checkbox"' + i('bank_on') + '> 🏦 تحويل بنكي</label>' +
    '<input' + i('bank_bank') + ' maxlength="40" placeholder="اسم البنك">' +
    '<input' + i('bank_holder') + ' maxlength="60" placeholder="اسم صاحب الحساب">' +
    '<input' + i('bank_account') + ' dir="ltr" maxlength="40" placeholder="رقم الحساب / IBAN">' +
    '<label class="chk"><input type="checkbox"' + i('link_on') + '> 🔗 رابط دفع أونلاين (من بوابة دفع)</label>' +
    '<input' + i('link_url') + ' dir="ltr" maxlength="300" placeholder="https://...">' +
    '<input' + i('note') + ' maxlength="200" placeholder="ملاحظة تظهر للعميل (اختياري)">' +
    '</div>';
}

const el = (prefix, id) => document.getElementById(prefix + '_' + id);

export function fillPayForm(prefix, p) {
  p = p || {};
  const set = (id, v) => { const e = el(prefix, id); if (e) e.value = v || ''; };
  const chk = (id, v) => { const e = el(prefix, id); if (e) e.checked = !!v; };
  chk('cod_on', p.cod && p.cod.on);
  chk('instapay_on', p.instapay && p.instapay.on); set('instapay_address', p.instapay && p.instapay.address);
  chk('wallet_on', p.wallet && p.wallet.on); set('wallet_label', p.wallet && p.wallet.label); set('wallet_number', p.wallet && p.wallet.number);
  chk('bank_on', p.bank && p.bank.on); set('bank_bank', p.bank && p.bank.bank); set('bank_holder', p.bank && p.bank.holder); set('bank_account', p.bank && p.bank.account);
  chk('link_on', p.link && p.link.on); set('link_url', p.link && p.link.url);
  set('note', p.note);
}

// بيقرا الفورم ويرجّع { value, error }
export function readPayForm(prefix) {
  const txt = (id, n) => { const e = el(prefix, id); return e ? e.value.trim().slice(0, n) : ''; };
  const on = id => { const e = el(prefix, id); return !!(e && e.checked); };
  const v = {
    cod: { on: on('cod_on') },
    instapay: { on: on('instapay_on'), address: latinDigits(txt('instapay_address', 60)) },
    wallet: { on: on('wallet_on'), label: txt('wallet_label', 30), number: latinDigits(txt('wallet_number', 20)).replace(/[^\d+]/g, '') },
    bank: { on: on('bank_on'), bank: txt('bank_bank', 40), holder: txt('bank_holder', 60), account: latinDigits(txt('bank_account', 40)) },
    link: { on: on('link_on'), url: txt('link_url', 300) },
    note: txt('note', 200)
  };
  let error = '';
  if (v.instapay.on && !v.instapay.address) error = 'اكتب عنوان إنستاباي.';
  else if (v.wallet.on && !/^\+?\d{8,15}$/.test(v.wallet.number)) error = 'رقم المحفظة لازم يكون من 8 لـ 15 رقم.';
  else if (v.bank.on && !v.bank.account) error = 'اكتب رقم الحساب البنكي.';
  else if (v.link.on && !isHttps(v.link.url)) error = 'رابط الدفع لازم يبدأ بـ https://';
  return { value: v, error };
}
