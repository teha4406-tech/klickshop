// Service worker بسيط: بيخلي الموقع قابل للتثبيت على الموبايل، ومبيخزّنش ملفات
// (عشان أي تحديث تعمله يظهر فورًا، والبيانات كلها من Firebase أونلاين).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
