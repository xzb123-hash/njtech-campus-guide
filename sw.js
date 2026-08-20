/* 南京工业大学新生导览 · 离线缓存服务线程（stale-while-revalidate） */
const CACHE = "njtech-guide-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) =>
        c.addAll([
          "./",
          "./index.html",
          "./map.html",
          "./guide.html",
          "./gallery.html",
          "./about.html",
          "./css/style.css",
          "./js/data.js",
          "./js/roads_data.js",
          "./js/app.js",
          "./lib/leaflet/leaflet.js",
          "./lib/leaflet/leaflet.css",
        ])
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 不缓存外部瓦片
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchP = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchP;
    })
  );
});
