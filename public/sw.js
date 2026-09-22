/* Offline shell cache — student/late data never leave IndexedDB on device. */
const CACHE = "llegadas-shell-v3";
const BASE = new URL("./", self.location).pathname; // e.g. /llegadas-tarde/
const PRECACHE = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}sample-roster.csv`,
  `${BASE}icons/icon.svg`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}icons/apple-touch-icon.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(url).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function shouldCache(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (!p.startsWith(BASE) && p !== BASE.slice(0, -1)) return false;
  return (
    p === BASE ||
    p === BASE.slice(0, -1) ||
    p.endsWith(".html") ||
    p.endsWith(".js") ||
    p.endsWith(".css") ||
    p.endsWith(".webmanifest") ||
    p.endsWith(".csv") ||
    p.endsWith(".svg") ||
    p.endsWith(".png") ||
    p.endsWith(".ico") ||
    p.includes("/assets/") ||
    p.includes("/icons/") ||
    p.includes("/src/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App shell navigations: network first, cache fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((c) => c || caches.match(`${BASE}index.html`)),
        ),
    );
    return;
  }

  if (!shouldCache(url)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetching = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      // Stale-while-revalidate for shell assets
      return cached || fetching;
    }),
  );
});
