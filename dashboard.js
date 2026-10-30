import { guard, logout, esc } from './app.js';
import { db } from './firebase-config.js';
import { collection, query, where, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = id => document.getElementById(id);

guard('store_owner', async (user, r) => {
  $('who').textContent = r.profile.displayName || user.email;
  $('logoutBtn').addEventListener('click', logout);
  try {
    const snap = await getDocs(query(collection(db, 'stores'), where('ownerUid', '==', user.uid), limit(1)));
    if (snap.empty) {
      $('storeBox').innerHTML = '<p class="muted">لسه مفيش متجر مربوط بحسابك. تواصل مع إدارة المنصة.</p>';
      return;
    }
    const s = snap.docs[0].data();
    $('storeBox').innerHTML =
      '<h2>' + esc(s.name) + '</h2>' +
      '<p class="muted">الحالة: ' + (s.active ? '🟢 شغّال' : '⛔ موقوف') + '</p>';
  } catch (e) {
    $('storeBox').innerHTML = '<p class="muted">تعذّر تحميل بيانات المتجر.</p>';
  }
});
