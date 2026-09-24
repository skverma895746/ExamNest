// js/pwa.js
// Registers the service worker so ExamNest is installable and works
// offline for previously visited pages/assets. This file only adds
// PWA capability — it does not change any existing page behavior,
// and registration failures are silently logged, never surfaced to
// the user.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

// ---------------- Custom "Install App" button ----------------
// Modern Chrome no longer shows its own install popup automatically —
// the site must capture the `beforeinstallprompt` event and offer its
// own visible trigger. This injects a small floating button (bottom-
// right) on any page that loads pwa.js, and only shows it once Chrome
// confirms the site is actually installable.

let deferredInstallPrompt = null;

function createInstallButton() {
  const btn = document.createElement("button");
  btn.id = "pwaInstallBtn";
  btn.type = "button";
  btn.textContent = "⬇ Install App";
  btn.style.cssText = `
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 9999;
    padding: 12px 20px;
    background: linear-gradient(135deg, #2563EB, #1D4ED8);
    color: #fff;
    border: none;
    border-radius: 999px;
    font-family: inherit;
    font-weight: 600;
    font-size: 14px;
    box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);
    cursor: pointer;
    display: none;
    align-items: center;
    gap: 8px;
    transition: transform 200ms ease, box-shadow 200ms ease;
  `;
  btn.addEventListener("mouseenter", () => (btn.style.transform = "translateY(-2px)"));
  btn.addEventListener("mouseleave", () => (btn.style.transform = "translateY(0)"));

  btn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    btn.disabled = true;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log("Install prompt outcome:", outcome);
    deferredInstallPrompt = null;
    btn.style.display = "none";
    btn.disabled = false;
  });

  document.body.appendChild(btn);
  return btn;
}

window.addEventListener("beforeinstallprompt", (event) => {
  // Prevent the (now largely unused) default mini-infobar and store
  // the event so our own button can trigger it on demand.
  event.preventDefault();
  deferredInstallPrompt = event;

  const show = () => {
    const btn = document.getElementById("pwaInstallBtn") || createInstallButton();
    btn.style.display = "flex";
  };

  if (document.body) {
    show();
  } else {
    document.addEventListener("DOMContentLoaded", show);
  }
});

// Hide the button (if visible) once the app has actually been installed.
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById("pwaInstallBtn");
  if (btn) btn.style.display = "none";
  console.log("ExamNest was installed.");
});