/* Service Worker — cache básica para modo offline */
const CACHE = "rickmorty-v1";
const CORE = [
  "/app/index.html",
  "/app/login.html",
  "/app/register.html",
  "/app/forgot.html",
  "/app/shell.html",
  "/app/styles.css",
  "/app/app.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // API Rick and Morty: stale-while-revalidate
  if (url.hostname === "rickandmortyapi.com") {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        const fetchPromise = fetch(e.request)
          .then((resp) => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // App shell: cache-first
  if (url.pathname.startsWith("/app/")) {
    e.respondWith(
      caches.match(e.request).then((r) => {
        return r || fetch(e.request).then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return resp;
        }).catch(() => {
          // Corrección crítica: Solo retornar index.html si es una navegación de página
          if (e.request.mode === "navigate") {
            return caches.match("/app/index.html");
          }
        });
      })
    );
  }
});