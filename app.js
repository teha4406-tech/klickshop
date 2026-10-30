// دوال مشتركة بين كل الصفحات: معرفة دور المستخدم، حماية الصفحات، تسجيل الخروج
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const esc = s => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };

// بيرجّع دور المستخدم من قاعدة البيانات (مش من المتصفح):
// - super_admin: لو فيه وثيقة باسمه في platformAdmins (بتتعمل يدويًا من Firebase Console بس)
// - store_owner: لو وثيقته في users دورها store_owner وحسابه شغال
export async function loadRole(user) {
  try {
    const a = await getDoc(doc(db, 'platformAdmins', user.uid));
    if (a.exists()) return { role: 'super_admin', profile: { email: user.email } };
  } catch (e) { /* مفيش صلاحية = مش مدير */ }
  try {
    const u = await getDoc(doc(db, 'users', user.uid));
    if (u.exists() && u.data().role === 'store_owner' && u.data().active === true) {
      return { role: 'store_owner', profile: u.data() };
    }
  } catch (e) { /* ignore */ }
  return { role: null };
}

// بيحمي الصفحة: لو المستخدم مش مسجل أو دوره غلط بيحوّله. ده تحسين للتجربة بس،
// الحماية الحقيقية في قواعد Firestore.
export function guard(requiredRole, onReady) {
  onAuthStateChanged(auth, async user => {
    if (!user) { location.replace('login.html'); return; }
    const r = await loadRole(user);
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
