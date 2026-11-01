// دوال مشتركة بين كل الصفحات: معرفة دور المستخدم، حماية الصفحات، تسجيل الخروج
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const esc = s => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
// للنصوص اللي بتتحط جوه خصائص HTML زي value="..."
export const escA = s => esc(s).replace(/"/g, '&quot;');

// بيحوّل الأرقام العربي (٠١٢...) والفارسي لأرقام إنجليزي، عشان خانات الهاتف والسعر تشتغل مع كيبورد عربي
export const latinDigits = s => String(s ?? '')
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

// بيرجّع دور المستخدم من قاعدة البيانات (مش من المتصفح):
// - super_admin: لو فيه وثيقة باسمه في platformAdmins (بتتعمل يدويًا من Firebase Console بس)
// - store_owner: لو وثيقته في users دورها store_owner وحسابه شغال
// لو حصل خطأ اتصال بيرجّع error:true عشان منقولش للمستخدم "حسابك غير مفعّل" بالغلط
export async function loadRole(user) {
  let failed = false;
  const isNet = e => !String((e && e.code) || '').includes('permission-denied');
  try {
    const a = await getDoc(doc(db, 'platformAdmins', user.uid));
    if (a.exists()) return { role: 'super_admin', profile: { email: user.email } };
  } catch (e) { if (isNet(e)) failed = true; }
  try {
    const u = await getDoc(doc(db, 'users', user.uid));
    if (u.exists() && u.data().role === 'store_owner' && u.data().active === true) {
      return { role: 'store_owner', profile: u.data() };
    }
  } catch (e) { if (isNet(e)) failed = true; }
  return { role: null, error: failed };
}

function showConnError() {
  document.body.classList.remove('loading');
  document.body.innerHTML = '<div style="text-align:center;padding:4rem 1rem;font-family:inherit">' +
    '<p style="font-size:1.1rem;margin-bottom:1rem">مشكلة في الاتصال بالإنترنت.</p></div>';
  const b = document.createElement('button');
  b.textContent = 'حاول تاني';
  b.style.cssText = 'padding:.7rem 1.6rem;border:0;border-radius:12px;background:#4f46e5;color:#fff;font:inherit;font-weight:700;cursor:pointer';
  b.addEventListener('click', () => location.reload());
  document.body.firstChild.appendChild(b);
}

// بيحمي الصفحة: لو المستخدم مش مسجل أو دوره غلط بيحوّله. ده تحسين للتجربة بس،
// الحماية الحقيقية في قواعد Firestore.
export function guard(requiredRole, onReady) {
  onAuthStateChanged(auth, async user => {
    if (!user) { location.replace('login.html'); return; }
    const r = await loadRole(user);
    if (r.error) { showConnError(); return; }
    if (r.role !== requiredRole) {
      if (r.role === 'super_admin') location.replace('admin.html');
      else if (r.role === 'store_owner') location.replace('dashboard.html');
      else { await signOut(auth); location.replace('login.html?e=noaccess'); }
      return;
    }
    document.body.classList.remove('loading');
    safeCall(onReady, user, r);
  });
}
function safeCall(fn, user, r) { try { fn(user, r); } catch (e) { console.error(e); } }

export async function logout() {
  await signOut(auth);
  location.replace('login.html');
}
