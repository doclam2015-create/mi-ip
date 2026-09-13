const CACHE = "mi-ip-v3";
const ASSETS = ["./","./index.html","./app.js","./manifest.json","./icon.png","./icon-192.png","./icon-180.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  // Las consultas de IP y los tiles del mapa siempre van a la red.
  if (u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
});
