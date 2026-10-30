import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { loadRole } from './app.js';

const $ = id => document.getElementById(id);

function note(text, ok) {
  const el = $('note');
  el.textContent = text || '';
  el.className = 'note ' + (ok ? 'ok' : 'err');
  el.hidden = !text;
}

function authMsg(e) {
  const c = (e && e.code) || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') || c.includes('invalid-login')) return 'الإيميل أو الباسورد غلط.';
  if (c.includes('invalid-email')) return 'الإيميل مش مكتوب صح.';
  if (c.includes('too-many-requests')) return 'محاولات كتير، استنى شوية وجرّب تاني.';
  if (c.includes('network')) return 'مشكلة في الاتصال بالإنترنت.';
  if (c.includes('user-disabled')) return 'الحساب ده موقوف.';
  return 'حصل خطأ، جرّب تاني.';
}

let busy = false;

// بعد تسجيل الدخول: نحدد الدور من قاعدة البيانات ونحوّل لصفحة الدور
async function route(user) {
  const r = await loadRole(user);
  if (r.role === 'super_admin') { location.replace('admin.html'); return; }
  if (r.role === 'store_owner') { location.replace('dashboard.html'); return; }
  await signOut(auth);
  note('حسابك غير مفعّل أو غير مسجّل في المنصة. تواصل مع الإدارة.');
}

if (new URLSearchParams(location.search).get('e') === 'noaccess') {
  note('حسابك غير مفعّل أو غير مسجّل في المنصة. تواصل مع الإدارة.');
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  note('');
  busy = true;
  $('loginBtn').disabled = true;
  try {
    const cred = await signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
    await route(cred.user);
  } catch (err) { note(authMsg(err)); }
  busy = false;
  $('loginBtn').disabled = false;
});

$('forgotBtn').addEventListener('click', async () => {
  const email = $('email').value.trim();
  if (!email) { note('اكتب الإيميل الأول.'); return; }
  try { await sendPasswordResetEmail(auth, email); note('اتبعتلك إيميل لتغيير الباسورد، افحص الإيميل.', true); }
  catch (err) { note(authMsg(err)); }
});

// لو المستخدم داخل بالفعل من قبل
onAuthStateChanged(auth, user => { if (user && !busy) route(user); });
