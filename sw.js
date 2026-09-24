// sw.js — ExamNest service worker
// Purpose: make the static app shell (HTML/CSS/JS/icons) installable
// and available offline. It deliberately does NOT touch anything
// that existing functionality depends on:
//   - Only intercepts same-origin GET requests.
//   - Firebase Auth / Firestore calls are cross-origin, so they are
//     never matched here and always go straight to the network.
//   - Any non-GET request (writes, uploads) is left completely alone.
// Bump CACHE_VERSION any time a precached file's content changes.

const CACHE_VERSION = "examnest-shell-v1";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./get-test.html",
  "./instructions.html",
  "./exam.html",
  "./result.html",
  "./login.html",
  "./dashboard.html",
  "./upload.html",
  "./question-bank.html",
  "./settings.html",
  "./manifest.json",
  "./css/style.css",
  "./css/responsive.css",
  "./css/dashboard.css",
  "./css/exam.css",
  "./css/result.css",
  "./js/utils.js",
  "./js/firebase.js",
  "./js/auth.js",
  "./js/storage.js",
  "./js/dashboard.js",
  "./js/exam.js",
  "./js/result.js",
  "./js/upload.js",
  "./js/question-bank.js",
  "./js/pwa.js",
  "./assets/icons/favicon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => console.warn("SW precache skipped some files:", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Leave every non-GET request, and every cross-origin request
  // (Firebase Auth, Firestore, any external API), completely
  // untouched — pass straight through with no interception.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  if (req.mode === "navigate") {
    // HTML page loads: network-first, so logged-in users always see
    // fresh content when online; falls back to the cached shell (or
    // cached index.html) only when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Static assets (css/js/icons/manifest): cache-first for speed,
  // refreshed in the background whenever the network is available.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});