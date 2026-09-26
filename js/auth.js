// js/auth.js
// Handles admin login/logout, 5-hour auto logout, and page protection.

import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const SESSION_DURATION = 5 * 60 * 60 * 1000; // 5 Hours
const LOGIN_TIME_KEY = "examnest_login_time";

let logoutTimer = null;

/* ---------- Session Helpers ---------- */

function saveLoginTime() {
  localStorage.setItem(LOGIN_TIME_KEY, Date.now().toString());
}

function clearLoginTime() {
  localStorage.removeItem(LOGIN_TIME_KEY);

  if (logoutTimer) {
    clearTimeout(logoutTimer);
    logoutTimer = null;
  }
}

function getLoginTime() {
  const value = localStorage.getItem(LOGIN_TIME_KEY);
  return value ? Number(value) : null;
}

function isSessionExpired() {
  const loginTime = getLoginTime();

  if (!loginTime) return false; // First login → expired mat maan.

  return Date.now() - loginTime >= SESSION_DURATION;
}

function startAutoLogoutTimer() {
  if (logoutTimer) clearTimeout(logoutTimer);

  const loginTime = getLoginTime();
  if (!loginTime) return;

  const remaining = SESSION_DURATION - (Date.now() - loginTime);

  if (remaining <= 0) {
    logout();
    return;
  }

  logoutTimer = setTimeout(() => {
    logout();
  }, remaining);
}

/* ---------- Protected Page Guard ---------- */

export function guardAdminPage() {
  document.documentElement.classList.add("auth-checking");

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace("login.html");
        return;
      }

      // Agar login time missing hai (fresh login), save kar do.
      if (!getLoginTime()) {
        saveLoginTime();
      }

      // 5 hours complete ho gaye?
      if (isSessionExpired()) {
        clearLoginTime();
        await signOut(auth).catch(() => {});
        window.location.replace("login.html");
        return;
      }

      document.documentElement.classList.remove("auth-checking");
      startAutoLogoutTimer();
      resolve(user);
    });

    // Back/Forward Cache protection
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        unsubscribe();
        guardAdminPage();
      }
    });
  });
}

/* ---------- Login ---------- */

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);

  saveLoginTime();
  startAutoLogoutTimer();

  return cred.user;
}

/* ---------- Logout ---------- */

export async function logout() {
  clearLoginTime();
  await signOut(auth).catch(() => {});
  window.location.replace("login.html");
}

/* ---------- Login Page ---------- */

export function redirectIfAlreadyLoggedIn() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    if (!getLoginTime()) {
      saveLoginTime();
    }

    if (isSessionExpired()) {
      clearLoginTime();
      await signOut(auth).catch(() => {});
      return;
    }

    startAutoLogoutTimer();
    window.location.replace("dashboard.html");
  });
}