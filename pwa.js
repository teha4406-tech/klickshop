// تسجيل الـ service worker عشان التطبيق يتثبّت على الموبايل
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}
