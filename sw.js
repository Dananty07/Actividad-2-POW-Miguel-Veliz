/* Service Worker — cache básica para modo offline */
const CACHE = "rickmorty-v1";
const CORE = [
  "/index.html",
  "/login.html",
  "/register.html",
  "/forgot.html",
  "/shell.html",
  "/styles.css",
  "/app.js",
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
  // Modificamos para validar de forma más segura las peticiones de nuestra propia app
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((r) => {
        return r || fetch(e.request).then((resp) => {
          if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
          
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return resp;
        }).catch(() => {
          // Si el usuario está navegando a una página interna sin conexión, entregamos el index
          if (e.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
      })
    );
  }
});