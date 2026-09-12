///js/firebase.js
// -----------------------------------------------------------------------------
// Central Firebase bootstrap. Every page that needs Auth/Firestore imports the
// named exports from this single module so there is only one initialized app.
//
// SETUP: paste your project's config below (Firebase Console > Project Settings
// > General > Your apps > SDK setup and configuration). Nothing else in the
// codebase needs to change once this object is filled in.
// -----------------------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// TODO: replace with your Firebase project config
  const firebaseConfig = {
    apiKey: "AIzaSyBqsZorvNj9H8tDynyymlmgDlRUcw-_LCM",
    authDomain: "examnest-51706.firebaseapp.com",
    projectId: "examnest-51706",
    storageBucket: "examnest-51706.firebasestorage.app",
    messagingSenderId: "981168085247",
    appId: "1:981168085247:web:464f6ff3c04206539094ca",
    measurementId: "G-B8SRFP3L28"
  };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Session-only persistence: closing the browser tab ends the admin session.
// This keeps "logout destroys the session immediately" true even if the admin
// forgets to click Logout.
setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});


