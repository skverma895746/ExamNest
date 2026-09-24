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
    if (document.getElementById("pwaInstallBtn")) {
      return document.getElementById("pwaInstallBtn");
    }

    const btn = document.createElement("button");

    btn.id = "pwaInstallBtn";
    btn.type = "button";
    btn.innerHTML = "⬇️ Install App";

    btn.style.cssText = `
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 999999;

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

      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;

      transition: all 0.2s ease;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "translateY(-2px)";
      btn.style.boxShadow =
        "0 12px 30px rgba(37, 99, 235, 0.45)";
    });

    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow =
        "0 8px 25px rgba(37, 99, 235, 0.35)";
    });

    btn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) {
        console.log("Install prompt is not available yet.");
        return;
      }

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

        btn.style.display = "none";
      } catch (error) {
        console.error(
          "Install prompt failed:",
          error
        );
      }

      btn.disabled = false;
    });

    document.body.appendChild(btn);

    return btn;
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