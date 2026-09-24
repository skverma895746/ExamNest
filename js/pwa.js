// js/pwa.js
// Registers the service worker so ExamNest is installable and works
// offline for previously visited pages/assets. This file only adds
// PWA capability — it does not change any existing page behavior,
// and registration failures are silently logged, never surfaced to
// the user.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
