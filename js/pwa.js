// js/pwa.js
// ExamNest PWA setup

(function () {
  "use strict";

  let deferredInstallPrompt = null;
  let installButton = null;

  // --------------------------------------------------
  // SERVICE WORKER
  // --------------------------------------------------

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          "./sw.js",
          { scope: "./" }
        );

        console.log(
          "ExamNest Service Worker registered:",
          registration.scope
        );
      } catch (error) {
        console.error(
          "ExamNest Service Worker registration failed:",
          error
        );
      }
    });
  }

  // --------------------------------------------------
  // CREATE INSTALL BUTTON
  // --------------------------------------------------

function createInstallButton() {
  if (document.getElementById("pwaInstallWrap")) {
    return document.getElementById("pwaInstallWrap");
  }

  // Wrapper
  const wrap = document.createElement("div");

  wrap.id = "pwaInstallWrap";

  wrap.style.cssText = `
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 999999;

    display: none;
    align-items: center;
    gap: 8px;
  `;

  // Install button
  const btn = document.createElement("button");

  btn.id = "pwaInstallBtn";
  btn.type = "button";
  btn.innerHTML = "⬇ Install App";

  btn.style.cssText = `
    padding: 12px 20px;

    background: linear-gradient(
      135deg,
      #2563EB,
      #1D4ED8
    );

    color: white;
    border: none;
    border-radius: 999px;

    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: 600;

    box-shadow:
      0 8px 25px rgba(37, 99, 235, 0.35);

    cursor: pointer;

    white-space: nowrap;
  `;

  // Close button
  const closeBtn = document.createElement("button");

  closeBtn.id = "pwaInstallCloseBtn";
  closeBtn.type = "button";
  closeBtn.innerHTML = "✕";
  closeBtn.title = "Close";

  closeBtn.style.cssText = `
    width: 34px;
    height: 34px;

    border: none;
    border-radius: 50%;

    background: #ffffff;
    color: #475569;

    font-size: 16px;
    font-weight: 600;

    box-shadow:
      0 5px 18px rgba(0, 0, 0, 0.15);

    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Install
  btn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;

    btn.disabled = true;

    try {
      deferredInstallPrompt.prompt();

      const result =
        await deferredInstallPrompt.userChoice;

      console.log(
        "Install prompt result:",
        result.outcome
      );

      deferredInstallPrompt = null;

      wrap.style.display = "none";

    } catch (error) {
      console.error(
        "Install prompt failed:",
        error
      );
    }

    btn.disabled = false;
  });

  // Close
  closeBtn.addEventListener("click", () => {
    wrap.style.display = "none";
  });

  wrap.appendChild(btn);
  wrap.appendChild(closeBtn);

  document.body.appendChild(wrap);

  return wrap;
}

  // --------------------------------------------------
  // BEFORE INSTALL PROMPT
  // --------------------------------------------------

  window.addEventListener(
    "beforeinstallprompt",
    (event) => {
      console.log(
        "beforeinstallprompt fired — ExamNest is installable."
      );

      event.preventDefault();

      deferredInstallPrompt = event;

      if (document.body) {
        installButton = createInstallButton();
        installButton.style.display = "flex";
      }
    }
  );

  // --------------------------------------------------
  // APP INSTALLED
  // --------------------------------------------------

  window.addEventListener("appinstalled", () => {
    console.log("ExamNest installed successfully.");

    deferredInstallPrompt = null;

    const btn =
      document.getElementById("pwaInstallBtn");

    if (btn) {
      btn.style.display = "none";
    }
  });

  // --------------------------------------------------
  // DEBUG
  // --------------------------------------------------

  window.addEventListener("load", () => {
    console.log("ExamNest PWA script loaded.");

    console.log(
      "Service Worker supported:",
      "serviceWorker" in navigator
    );

    console.log(
      "Current URL:",
      window.location.href
    );

    console.log(
      "Manifest:",
      document.querySelector('link[rel="manifest"]')
    );
  });

})();