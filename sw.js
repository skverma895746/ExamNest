// sw.js

const CACHE_NAME = "examnest-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",

  // CSS
  "./css/style.css",
  "./css/responsive.css",

  // PWA
  "./js/pwa.js",

  // Icons
  "./assets/icons/favicon.svg",
  "./assets/icons/apple-touch-icon.png"
];


// --------------------------------------------------
// INSTALL
// --------------------------------------------------

self.addEventListener("install", (event) => {

  console.log("ExamNest SW: Installing...");

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(APP_FILES);
      })
      .then(() => {
        console.log("ExamNest SW: Cache completed.");
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error(
          "ExamNest SW: Cache failed:",
          error
        );
      })
  );

});


// --------------------------------------------------
// ACTIVATE
// --------------------------------------------------

self.addEventListener("activate", (event) => {

  console.log("ExamNest SW: Activated.");

  event.waitUntil(

    caches.keys()
      .then((cacheNames) => {

        return Promise.all(

          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))

        );

      })
      .then(() => self.clients.claim())

  );

});


// --------------------------------------------------
// FETCH
// --------------------------------------------------

self.addEventListener("fetch", (event) => {

  // Only handle GET requests
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(

    caches.match(event.request)
      .then((cachedResponse) => {

        // If cached → use cache
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise → try network
        return fetch(event.request)
          .then((networkResponse) => {

            // Cache successful same-origin responses
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === "basic"
            ) {

              const responseClone =
                networkResponse.clone();

              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(
                    event.request,
                    responseClone
                  );
                });

            }

            return networkResponse;

          });

      })

  );

});