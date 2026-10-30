// إعدادات Firebase بتاعة مشروع klick-shop + تشغيل الخدمات
// ملاحظة: القيم دي مش أسرار. الأمان الحقيقي في قواعد Firestore (firestore.rules).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyD5wDfaZCH3GEa7D_NCeMr0n9irzzBuMmM',
  authDomain: 'klick-shop.firebaseapp.com',
  projectId: 'klick-shop',
  storageBucket: 'klick-shop.firebasestorage.app',
  messagingSenderId: '119315456196',
  appId: '1:119315456196:web:6c739f0ae3f3350b186991'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// الاكتشاف التلقائي بيساعد لو الشبكة بتعطّل الاتصال المستمر
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
