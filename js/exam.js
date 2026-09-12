// js/exam.js
import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, $all, qs, shuffle, escapeHtml, formatDuration, toast } from "./utils.js";
import {
  saveExamSession,
  loadExamSession,
  clearExamSession,
  recordAttempt,
  saveLatestResult,
} from "./storage.js";

const STATUS = {
  NOT_VISITED: "not-visited",
  VISITED: "visited",
  ANSWERED: "answered",
  REVIEW: "review",
  ANSWERED_REVIEW: "answered-review",
};

let test = null;
let testId = null;
let questions = []; // shuffled, each: { id, question, optionA..D, answer, _options:[{key,text}] }
let answers = {}; // questionId -> "A"|"B"|"C"|"D"
let statuses = {}; // questionId -> STATUS
let currentIndex = 0;
let secondsRemaining = 0;
let timerHandle = null;
let startedAt = null;
let tabSwitchCount = 0;
let fullscreenExitCount = 0;
let hasEnteredFullscreenOnce = false;

export async function initExam() {
  testId = qs("testId");
  if (!testId) {
    renderFatal("No test was specified. Please go back and pick a test.");
    return;
  }

  // The exam can only be opened by way of the instructions page — this
  // sessionStorage flag is set there right before navigating here.
  const acknowledged = sessionStorage.getItem("examnest_instructions_ack_" + testId);
  if (!acknowledged) {
    window.location.replace(`instructions.html?testId=${encodeURIComponent(testId)}`);
    return;
  }

  try {
    const testSnap = await getDoc(doc(db, "tests", testId));
    if (!testSnap.exists() || testSnap.data().status !== "published") {
      renderFatal("This test could not be found. It may have been removed or unpublished.");
      return;
    }
    test = { id: testId, ...testSnap.data() };

    const qSnap = await getDocs(collection(db, "tests", testId, "questions"));
    let rawQuestions = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (!rawQuestions.length) {
      renderFatal("This test doesn't have any questions yet.");
      return;
    }

    if (test.shuffleQuestions) rawQuestions = shuffle(rawQuestions);

    questions = rawQuestions.map((q) => {
      let opts = [
        { key: "A", text: q.optionA },
        { key: "B", text: q.optionB },
        { key: "C", text: q.optionC },
        { key: "D", text: q.optionD },
      ];
      if (test.shuffleOptions) opts = shuffle(opts);
      return { ...q, _options: opts };
    });

    resumeOrStartSession();
    renderBeginGate();
  } catch (err) {
    console.error(err);
    renderFatal("Something went wrong loading this test. Please try again.");
  }
}

/**
 * Fullscreen must be requested from a real user gesture, and that gesture
 * can't carry over from the instructions.html navigation — so exam.html
 * shows one short "Begin" screen whose click both requests fullscreen and
 * starts the timer. Skips straight to the exam if this is a resumed session
 * (the timer is already running server-side-equivalent, in localStorage).
 */
function renderBeginGate() {
  const root = $("#examRoot");
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
      <div class="instructions-card" style="max-width:460px;text-align:center;">
        <h1 style="margin-bottom:10px;">${escapeHtml(test.title)}</h1>
        <p style="color:var(--navy-60);margin-bottom:24px;">
          This test runs best in fullscreen. Click below to enter fullscreen and start the timer.
        </p>
        <button class="btn btn--primary btn--block" id="beginExamBtn">Begin Exam</button>
      </div>
    </div>`;

  $("#beginExamBtn").addEventListener("click", async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      // Fullscreen can be denied (e.g. iOS Safari, embedded iframes) — the
      // exam still proceeds normally, just without the fullscreen lock.
      console.warn("Fullscreen request was not granted:", err);
    }
    hasEnteredFullscreenOnce = true;
    renderShell();
    renderPalette();
    renderQuestion();
    startTimer();
    wireGlobalActions();
    wireFullscreenSecurity();
  });
}

function resumeOrStartSession() {
  const saved = loadExamSession(testId);
  if (saved && saved.questionIds?.length === questions.length) {
    answers = saved.answers || {};
    statuses = saved.statuses || {};
    secondsRemaining = saved.secondsRemaining ?? test.duration * 60;
    startedAt = saved.startedAt || Date.now();
  } else {
    answers = {};
    statuses = {};
    questions.forEach((q) => (statuses[q.id] = STATUS.NOT_VISITED));
    secondsRemaining = (test.duration || 60) * 60;
    startedAt = Date.now();
    persistSession();
  }
}

function persistSession() {
  saveExamSession(testId, {
    questionIds: questions.map((q) => q.id),
    answers,
    statuses,
    secondsRemaining,
    startedAt,
  });
}

function renderFatal(message) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:'Poppins',sans-serif;">
      <div>
        <h1 style="margin-bottom:10px;">Can't start this test</h1>
        <p style="color:#64748b;margin-bottom:20px;">${escapeHtml(message)}</p>
        <a href="get-test.html" style="display:inline-block;padding:12px 24px;background:#2563EB;color:#fff;border-radius:999px;text-decoration:none;font-weight:600;">Back to tests</a>
      </div>
    </div>`;
}

function renderShell() {
  const root = $("#examRoot");
  root.innerHTML = `
    <div class="exam-topbar">
      <div class="exam-topbar__title">${escapeHtml(test.title)}<span id="progressLabel"></span></div>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn--ghost btn--sm palette-sheet-toggle" id="openPaletteBtn">Palette</button>
        <div class="exam-timer" id="examTimer">⏱ --:--</div>
      </div>
    </div>
    <div class="exam-shell">
      <div class="exam-question-area">
        <div class="exam-progress" id="examProgress"></div>
        <div class="exam-question-card" id="questionCard"></div>
        <div class="exam-actions">
          <button class="btn btn--ghost" id="prevBtn">← Previous</button>
          <button class="btn btn--soft" id="markReviewBtn">Mark for Review</button>
          <button class="btn btn--primary" id="saveNextBtn">Save &amp; Next</button>
        </div>
      </div>
      <aside class="exam-palette" id="examPalette">
        <h3>Question Palette</h3>
        <div class="palette-grid" id="paletteGrid"></div>
        <div class="palette-legend">
          <span><span class="dot" style="background:#fff;border:1px solid #cbd5e1"></span>Not Visited</span>
          <span><span class="dot" style="background:#fff;border:2px solid #94a3b8"></span>Visited</span>
          <span><span class="dot" style="background:#10B981"></span>Answered</span>
          <span><span class="dot" style="background:#8b5cf6"></span>Marked for Review</span>
          <span><span class="dot" style="background:linear-gradient(135deg,#10B981 50%,#8b5cf6 50%)"></span>Answered &amp; Review</span>
        </div>
        <button class="btn btn--primary exam-submit-btn" id="submitBtn">Submit Test</button>
      </aside>
    </div>

    <div class="exam-bottom-nav">
      <button class="btn btn--ghost btn--sm" id="prevBtnMobile">Prev</button>
      <button class="btn btn--soft btn--sm" id="markReviewBtnMobile">Review</button>
      <button class="btn btn--primary btn--sm" id="saveNextBtnMobile" style="flex:1">Save &amp; Next</button>
      <button class="btn btn--danger btn--sm" id="submitBtnMobile">Submit</button>
    </div>

    <div class="palette-sheet-backdrop" id="paletteSheetBackdrop"></div>
    <div class="palette-sheet" id="paletteSheet">
      <div class="palette-sheet__handle"></div>
      <h3 style="margin-bottom:14px;">Question Palette</h3>
      <div class="palette-grid" id="paletteGridMobile"></div>
    </div>

    <div class="modal-backdrop" id="submitModalBackdrop">
      <div class="modal">
        <h2>Submit Test?</h2>
        <p style="color:var(--navy-60);font-size:0.9rem;">Once submitted, you won't be able to change your answers.</p>
        <div class="confirm-summary" id="confirmSummary"></div>
        <div class="modal-actions">
          <button class="btn btn--ghost" id="submitCancelBtn">Cancel</button>
          <button class="btn btn--danger" id="submitFinalBtn">Final Submit</button>
        </div>
      </div>
    </div>

    <div class="exam-warning-banner" id="examWarningBanner"></div>
  `;
}

/**
 * Fullscreen exit (ESC, swipe-away, etc.) and tab/app switching are both
 * flagged with a non-blocking warning banner. Exam state is untouched either
 * way — everything is already auto-saved — so we warn rather than punish.
 */
function wireFullscreenSecurity() {
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && hasEnteredFullscreenOnce) {
      fullscreenExitCount++;
      showWarningBanner("⚠ You exited fullscreen. Please return to fullscreen to continue the test.");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      tabSwitchCount++;
      showWarningBanner("⚠ Tab switch detected. Your progress is saved, but repeated switching may be flagged.");
      persistSession();
    }
  });
}

let warningBannerTimeout = null;
function showWarningBanner(message) {
  const banner = $("#examWarningBanner");
  if (!banner) return;
  banner.textContent = message;
  banner.classList.add("is-visible");
  clearTimeout(warningBannerTimeout);
  warningBannerTimeout = setTimeout(() => banner.classList.remove("is-visible"), 4500);
}

function computeStatus(qId) {
  const answered = answers[qId] !== undefined;
  const st = statuses[qId] || STATUS.NOT_VISITED;
  if (st === STATUS.REVIEW || st === STATUS.ANSWERED_REVIEW) {
    return answered ? STATUS.ANSWERED_REVIEW : STATUS.REVIEW;
  }
  return answered ? STATUS.ANSWERED : st;
}

function renderPalette() {
  const html = questions
    .map((q, i) => {
      const status = computeStatus(q.id);
      return `<button class="palette-cell status-${status} ${i === currentIndex ? "is-current" : ""}" data-index="${i}">${i + 1}</button>`;
    })
    .join("");
  $("#paletteGrid").innerHTML = html;
  $("#paletteGridMobile").innerHTML = html;
  $("#progressLabel").textContent = `Question ${currentIndex + 1} of ${questions.length}`;
  $("#examProgress").textContent = `Question ${currentIndex + 1} of ${questions.length}`;

  $all(".palette-cell").forEach((cell) =>
    cell.addEventListener("click", () => {
      goToQuestion(Number(cell.dataset.index));
      closePaletteSheet();
    })
  );
}

function renderQuestion() {
  const q = questions[currentIndex];
  if (statuses[q.id] === STATUS.NOT_VISITED) statuses[q.id] = STATUS.VISITED;

  const card = $("#questionCard");
  card.innerHTML = `
    <div class="exam-question-card__q">${currentIndex + 1}. ${escapeHtml(q.question)}</div>
    ${q._options
      .map(
        (opt) => `
      <label class="exam-option ${answers[q.id] === opt.key ? "is-selected" : ""}" data-key="${opt.key}">
        <input type="radio" name="option" value="${opt.key}" ${answers[q.id] === opt.key ? "checked" : ""} />
        <span>${escapeHtml(opt.text)}</span>
      </label>`
      )
      .join("")}
  `;

  $all(".exam-option", card).forEach((label) => {
    label.addEventListener("click", () => {
      const key = label.dataset.key;
      answers[q.id] = key;
      $all(".exam-option", card).forEach((l) => l.classList.remove("is-selected"));
      label.classList.add("is-selected");
      persistSession();
      renderPalette();
    });
  });

  renderPalette();
}

function goToQuestion(index) {
  if (index < 0 || index >= questions.length) return;
  currentIndex = index;
  renderQuestion();
}

function wireGlobalActions() {
  const onPrev = () => goToQuestion(currentIndex - 1);
  const onNext = () => {
    persistSession();
    goToQuestion(currentIndex + 1);
  };
  const onMarkReview = () => {
    const q = questions[currentIndex];
    const answered = answers[q.id] !== undefined;
    statuses[q.id] = answered ? STATUS.ANSWERED_REVIEW : STATUS.REVIEW;
    persistSession();
    renderPalette();
    goToQuestion(Math.min(currentIndex + 1, questions.length - 1));
  };

  $("#prevBtn").addEventListener("click", onPrev);
  $("#prevBtnMobile").addEventListener("click", onPrev);
  $("#saveNextBtn").addEventListener("click", onNext);
  $("#saveNextBtnMobile").addEventListener("click", onNext);
  $("#markReviewBtn").addEventListener("click", onMarkReview);
  $("#markReviewBtnMobile").addEventListener("click", onMarkReview);

  $("#submitBtn").addEventListener("click", openSubmitModal);
  $("#submitBtnMobile").addEventListener("click", openSubmitModal);
  $("#submitCancelBtn").addEventListener("click", closeSubmitModal);
  $("#submitFinalBtn").addEventListener("click", finalSubmit);

  $("#openPaletteBtn").addEventListener("click", openPaletteSheet);
  $("#paletteSheetBackdrop").addEventListener("click", closePaletteSheet);

  window.addEventListener("beforeunload", (e) => {
    e.preventDefault();
    e.returnValue = "";
  });
}

function openPaletteSheet() {
  $("#paletteSheetBackdrop").classList.add("is-open");
  $("#paletteSheet").classList.add("is-open");
}
function closePaletteSheet() {
  $("#paletteSheetBackdrop").classList.remove("is-open");
  $("#paletteSheet").classList.remove("is-open");
}

function openSubmitModal() {
  const answeredCount = Object.keys(answers).length;
  const reviewCount = questions.filter((q) =>
    [STATUS.REVIEW, STATUS.ANSWERED_REVIEW].includes(statuses[q.id])
  ).length;
  $("#confirmSummary").innerHTML = `
    <div><strong>${answeredCount}</strong><span>Answered</span></div>
    <div><strong>${questions.length - answeredCount}</strong><span>Unattempted</span></div>
    <div><strong>${reviewCount}</strong><span>Marked</span></div>
  `;
  $("#submitModalBackdrop").classList.add("is-open");
}
function closeSubmitModal() {
  $("#submitModalBackdrop").classList.remove("is-open");
}

function startTimer() {
  updateTimerDisplay();
  timerHandle = setInterval(() => {
    secondsRemaining -= 1;
    if (secondsRemaining <= 0) {
      secondsRemaining = 0;
      updateTimerDisplay();
      clearInterval(timerHandle);
      toast("Time's up! Submitting your test...", "warning");
      finalSubmit(true);
      return;
    }
    updateTimerDisplay();
    if (secondsRemaining % 5 === 0) persistSession();
  }, 1000);
}

function updateTimerDisplay() {
  const el = $("#examTimer");
  if (!el) return;
  el.textContent = `⏱ ${formatDuration(secondsRemaining)}`;
  el.classList.toggle("is-low", secondsRemaining <= 60);
}

async function finalSubmit(auto = false) {
  clearInterval(timerHandle);
  window.onbeforeunload = null;
  closeSubmitModal();

  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  sessionStorage.removeItem("examnest_instructions_ack_" + testId);

  const timeUsed = (test.duration || 60) * 60 - secondsRemaining;
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  const perQuestion = questions.map((q) => {
    const given = answers[q.id];
    let status = "unattempted";
    if (given === undefined) {
      unattempted++;
    } else if (given === q.answer) {
      correct++;
      status = "correct";
    } else {
      wrong++;
      status = "wrong";
    }
    return {
      id: q.id,
      question: q.question,
      options: q._options,
      yourAnswer: given || null,
      correctAnswer: q.answer,
      status,
    };
  });

  const negMarking = Number(test.negativeMarking) || 0;
  const rawScore = correct - wrong * negMarking;
  const maxScore = questions.length;
  const accuracy = correct + wrong > 0 ? (correct / (correct + wrong)) * 100 : 0;
  const score = Math.round(rawScore * 100) / 100;

  const result = {
    testId,
    testTitle: test.title,
    score,
    maxScore,
    accuracy,
    correct,
    wrong,
    unattempted,
    timeUsed,
    duration: (test.duration || 60) * 60,
    perQuestion,
    submittedAt: new Date().toISOString(),
    autoSubmitted: auto,
  };

  try {
    await addDoc(collection(db, "attempts"), {
      testId,
      score,
      maxScore,
      accuracy,
      correct,
      wrong,
      unattempted,
      timeUsed,
      answers,
      tabSwitchCount,
      fullscreenExitCount,
      submittedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Couldn't save attempt to Firestore:", err);
  }

  recordAttempt(testId, { score, maxScore, accuracy });
  clearExamSession(testId);
  saveLatestResult(result);

  // replace() so the Back button can never land on this editable exam again.
  window.location.replace(`result.html?testId=${encodeURIComponent(testId)}`);
}