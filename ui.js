// نافذة عامة (فورم أو تأكيد) ورسائل منبثقة، بتستخدمها لوحة صاحب المحل
import { esc, escA, latinDigits } from './app.js';

const $ = id => document.getElementById(id);
let mResolve = null;
let mValidate = null;
let mFields = [];

export function toast(text, bad) {
  const t = $('toast');
  t.textContent = text;
  t.className = 'toast' + (bad ? ' bad' : '');
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

export function openModal({ title, message = '', fields = [], okText = 'حفظ', danger = false, validate = null }) {
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
      (f.placeholder ? ' placeholder="' + escA(f.placeholder) + '"' : '');
    let input;
    if (f.type === 'select') {
      input = '<select' + attrs + '>' + f.options.map(o =>
        '<option value="' + escA(o.value) + '"' + (o.value === f.value ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea' + attrs + ' rows="3">' + esc(f.value || '') + '</textarea>';
    } else {
      input = '<input type="' + (f.type || 'text') + '"' + attrs + ' value="' + escA(f.value ?? '') + '" autocomplete="off">';
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

export function initModal() {
  $('mOk').addEventListener('click', () => {
    const vals = {};
    mFields.forEach(f => { const el = $('f_' + f.id); vals[f.id] = f.dir === 'ltr' ? latinDigits(el.value.trim()) : el.value.trim(); });
    const showErr = m => { $('mError').textContent = m; $('mError').hidden = false; };
    for (const f of mFields) if (f.required && !vals[f.id]) { showErr('املأ كل الخانات المطلوبة.'); return; }
    const err = mValidate ? mValidate(vals) : '';
    if (err) { showErr(err); return; }
    closeModal(vals);
  });
  $('mCancel').addEventListener('click', () => closeModal(null));
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(null); });
  $('modal').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); $('mOk').click(); }
    if (e.key === 'Escape') closeModal(null);
  });
}
