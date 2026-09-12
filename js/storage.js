// js/storage.js
// Anonymous, per-browser candidate history. No account, no server round-trip —
// every "have they attempted this test before" check happens against
// localStorage on the visitor's own device.

const KEY = "examnest_attempts_v1";
const INPROGRESS_KEY_PREFIX = "examnest_inprogress_";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

/** Returns { attempted, lastScore, lastMax, lastDate, attemptCount } or null */
export function getAttemptRecord(testId) {
  const all = readAll();
  return all[testId] || null;
}

export function recordAttempt(testId, { score, maxScore, accuracy }) {
  const all = readAll();
  const prev = all[testId] || { attemptCount: 0 };
  all[testId] = {
    attempted: true,
    lastScore: score,
    lastMax: maxScore,
    lastAccuracy: accuracy,
    lastDate: new Date().toISOString(),
    attemptCount: (prev.attemptCount || 0) + 1,
  };
  writeAll(all);
}

/** Wipes a single test's attempt history (Completed / Last Score / Last Date).
 *  Used when an admin deletes a test — so the same test title, if recreated
 *  later, behaves as brand new and shows "Start Test" again on this browser. */
export function clearAttemptRecord(testId) {
  const all = readAll();
  if (all[testId]) {
    delete all[testId];
    writeAll(all);
  }
  clearExamSession(testId);
}

// --- In-progress exam session persistence (auto-save answers) --------------

export function saveExamSession(testId, sessionData) {
  try {
    localStorage.setItem(
      INPROGRESS_KEY_PREFIX + testId,
      JSON.stringify(sessionData)
    );
  } catch (err) {
    console.error("Auto-save failed:", err);
  }
}

export function loadExamSession(testId) {
  try {
    const raw = localStorage.getItem(INPROGRESS_KEY_PREFIX + testId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearExamSession(testId) {
  localStorage.removeItem(INPROGRESS_KEY_PREFIX + testId);
}

// Latest submitted result, handed off between exam.html -> result.html
export function saveLatestResult(result) {
  sessionStorage.setItem("examnest_latest_result", JSON.stringify(result));
}

export function loadLatestResult() {
  try {
    const raw = sessionStorage.getItem("examnest_latest_result");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}