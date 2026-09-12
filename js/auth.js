// js/auth.js
// Handles admin login/logout and guards every protected admin page.

import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/**
 * Call this at the top of every protected admin page (dashboard, upload,
 * settings, results-admin). It immediately hides the page content and only
 * reveals it once Firebase confirms a logged-in user — this is what stops
 * the browser Back button from ever showing a flash of protected content
 * after logout, since bfcache-restored pages re-run this check on `pageshow`.
 */
export function guardAdminPage() {
  document.documentElement.classList.add("auth-checking");

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // No session: bounce to login and stop any further page script.
        window.location.replace("login.html");
        return;
      }
      document.documentElement.classList.remove("auth-checking");
      resolve(user);
    });

    // If the page is restored from the back/forward cache, re-verify.
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        unsubscribe();
        guardAdminPage();
      }
    });
  });
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
  // Replace (not assign) so Back can't return to an admin page from history.
  window.location.replace("login.html");
}

/** For login.html: if already logged in, skip straight to the dashboard. */
export function redirectIfAlreadyLoggedIn() {
  onAuthStateChanged(auth, (user) => {
    if (user) window.location.replace("dashboard.html");
  });
}