// js/utils.js
// Small, dependency-free helpers shared by every page.

export function $(selector, scope = document) {
  return scope.querySelector(selector);
}

export function $all(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

export function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function toast(message, type = "info", duration = 3200) {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 250);
  }, duration);
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Shared sticky-navbar + mobile hamburger drawer, used by every public page
 * (index, get-test, instructions, result). Pass the drawer's inner HTML
 * (the same links shown on desktop) and this wires scroll shadow + toggle.
 */
export function initNavbar(drawerLinksHtml) {
  const navbar = $(".navbar");
  if (navbar) {
    window.addEventListener(
      "scroll",
      () => navbar.classList.toggle("is-scrolled", window.scrollY > 8),
      { passive: true }
    );
  }
  const hamburger = $("#hamburgerBtn");
  if (!hamburger) return;
  hamburger.addEventListener("click", () => {
    const expanded = hamburger.getAttribute("aria-expanded") === "true";
    hamburger.setAttribute("aria-expanded", String(!expanded));
    let drawer = document.getElementById("mobileDrawer");
    if (!expanded) {
      drawer = document.createElement("div");
      drawer.id = "mobileDrawer";
      drawer.className = "mobile-drawer";
      drawer.innerHTML = drawerLinksHtml;
      document.body.appendChild(drawer);
    } else {
      drawer?.remove();
    }
  });
}

/**
 * Reusable confirmation dialog (replaces window.confirm for a consistent,
 * on-brand look). Resolves true/false. `danger` reddens the confirm button.
 */
export function confirmDialog({ title, body, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true">
        <h2>${title}</h2>
        <p style="color:var(--navy-60);font-size:0.9rem;">${body}</p>
        <div class="modal-actions">
          <button class="btn btn--ghost" data-choice="cancel">Cancel</button>
          <button class="btn ${danger ? "btn--danger" : "btn--primary"}" data-choice="confirm">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("is-open"));

    function close(result) {
      backdrop.classList.remove("is-open");
      setTimeout(() => backdrop.remove(), 200);
      resolve(result);
    }
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(false);
      const choice = e.target.closest("[data-choice]")?.dataset.choice;
      if (choice === "confirm") close(true);
      if (choice === "cancel") close(false);
    });
  });
}