const CACHE_NAME = "examnest-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./css/responsive.css",
  "./js/pwa.js",
  "./assets/icons/favicon.svg",
  "./assets/icons/apple-touch-icon.png"
];

// INSTALL
self.addEventListener("install", (event) => {
  console.log("ExamNest SW: Installing...");

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error("ExamNest SW: Cache failed:", error);
      })
  );
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  console.log("ExamNest SW: Activated.");

  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {

        if (
          response &&
          response.status === 200 &&
          response.type === "basic"
        ) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });
        }

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});