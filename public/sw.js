// BM Xpress Rider — minimal service worker.
// Its job is to make the app installable and to fail gracefully offline.
// We deliberately do NOT cache API responses: money data must always be fresh.

const OFFLINE_URL = "/offline.html";
const CACHE = "bmx-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle page navigations. Everything else (API calls, assets) goes
  // straight to the network so balances and earnings are never stale.
  if (req.mode !== "navigate") return;

  event.respondWith(
    fetch(req).catch(() =>
      caches.match(OFFLINE_URL).then((res) => res || new Response("Offline", { status: 503 }))
    )
  );
});
