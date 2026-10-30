import { guard, logout } from './app.js';
import { db } from './firebase-config.js';
import { collection, query, where, getCountFromServer } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = id => document.getElementById(id);

guard('super_admin', async user => {
  $('who').textContent = user.email;
  $('logoutBtn').addEventListener('click', logout);

  const counts = [
    ['cStores', collection(db, 'stores')],
    ['cActive', query(collection(db, 'stores'), where('active', '==', true))],
    ['cOwners', collection(db, 'users')],
    ['cProducts', collection(db, 'products')],
    ['cOrders', collection(db, 'orders')]
  ];
  await Promise.all(counts.map(async ([id, q]) => {
    try { $(id).textContent = (await getCountFromServer(q)).data().count; }
    catch (e) { $(id).textContent = '—'; }
  }));
});
