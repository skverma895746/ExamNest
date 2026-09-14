// js/question-bank.js
//
// Firestore read optimization: opening this page reads only the exam list
// (collection "tests"). Selecting an exam from the dropdown reads nothing.
// Only clicking "View" reads that exam's questions subcollection — and only
// the first time; after that, the in-memory cache below is reused for the
// rest of this page's session, so re-viewing the same exam costs zero reads.
import { db } from "./firebase.js";
import {
  collection,
  doc,
  deleteDoc,
  updateDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, $all, escapeHtml, toast, debounce, confirmDialog } from "./utils.js";

const testTitles = {}; // testId -> title, filled once from the lightweight exam-list read
const questionCache = {}; // testId -> question array, filled lazily on first View

let currentTestId = null;
let visibleQuestions = []; // currentTestId's questions after the local search filter

export async function initQuestionBank() {
  await loadTestDropdown();
  wireControls();
}

/** The ONLY read that happens on page load: the exam list itself. */
async function loadTestDropdown() {
  const select = $("#qbTestSelect");
  try {
    const snap = await getDocs(collection(db, "tests"));
    const options = [`<option value="">Select an exam...</option>`];
    snap.forEach((d) => {
      testTitles[d.id] = d.data().title;
      options.push(`<option value="${d.id}">${escapeHtml(d.data().title)}</option>`);
    });
    select.innerHTML = options.join("");
  } catch (err) {
    console.error(err);
    toast("Couldn't load the exam list.", "error");
  }
}

function wireControls() {
  const select = $("#qbTestSelect");
  const viewBtn = $("#qbViewBtn");
  const searchInput = $("#qbSearch");
  const tbody = $("#questionBankBody");
  const selectAll = $("#qbSelectAll");
  const bulkDeleteBtn = $("#bulkDeleteBtn");
  const bulkCancelBtn = $("#bulkCancelBtn");

  // Selecting an exam only enables the View button — no Firestore read here.
  select.addEventListener("change", () => {
    viewBtn.disabled = !select.value;
  });

  viewBtn.addEventListener("click", () => handleView(select.value));

  searchInput.addEventListener(
    "input",
    debounce(() => {
      const term = searchInput.value.trim().toLowerCase();
      const all = questionCache[currentTestId] || [];
      visibleQuestions = term
        ? all.filter((q) => String(q.question_en ?? q.question ?? "").toLowerCase().includes(term))
        : all;
      renderTable(visibleQuestions);
    }, 200)
  );

  selectAll.addEventListener("change", () => {
    $all(".qb-select", tbody).forEach((cb) => (cb.checked = selectAll.checked));
    updateBulkBar();
  });

  tbody.addEventListener("change", (e) => {
    if (e.target.classList.contains("qb-select")) updateBulkBar();
  });

  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const row = btn.closest("tr");
    const qId = row.dataset.qId;

    if (btn.dataset.action === "delete-q") {
      const ok = await confirmDialog({
        title: "Delete this question?",
        body: "This question will be permanently removed from this exam.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (ok) await deleteQuestion(qId);
    } else if (btn.dataset.action === "edit-q") {
      const q = (questionCache[currentTestId] || []).find((x) => x.id === qId);
      if (q) openQuestionEditModal(q);
    }
  });

  bulkDeleteBtn.addEventListener("click", async () => {
    const checked = $all(".qb-select:checked", tbody);
    if (!checked.length) return;
    const ok = await confirmDialog({
      title: `Delete ${checked.length} question(s)?`,
      body: "Selected questions will be permanently removed from this exam. This cannot be undone.",
      confirmLabel: "Delete Selected",
      danger: true,
    });
    if (!ok) return;
    const ids = checked.map((cb) => cb.closest("tr").dataset.qId);
    for (const qId of ids) {
      await deleteDoc(doc(db, "tests", currentTestId, "questions", qId));
    }
    questionCache[currentTestId] = (questionCache[currentTestId] || []).filter((q) => !ids.includes(q.id));
    toast("Selected questions deleted.", "success");
    applySearchAndRender();
  });

  bulkCancelBtn.addEventListener("click", () => {
    $all(".qb-select", tbody).forEach((cb) => (cb.checked = false));
    updateBulkBar();
  });

  $("#questionModalForm").addEventListener("submit", saveQuestionEdit);
  $("#questionModalCancel").addEventListener("click", () => {
    $("#questionModalBackdrop").classList.remove("is-open");
  });
}

async function handleView(testId) {
  if (!testId) return;
  currentTestId = testId;
  $("#qbSearch").value = "";

  const cacheNote = $("#qbCacheNote");
  const fromCache = Object.prototype.hasOwnProperty.call(questionCache, testId);

  if (!fromCache) {
    $("#qbViewBtn").disabled = true;
    $("#qbViewBtn").textContent = "Loading...";
    try {
      const qSnap = await getDocs(collection(db, "tests", testId, "questions"));
      questionCache[testId] = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error(err);
      toast("Couldn't load questions for this exam.", "error");
      $("#qbViewBtn").disabled = false;
      $("#qbViewBtn").textContent = "View";
      return;
    }
    $("#qbViewBtn").disabled = false;
    $("#qbViewBtn").textContent = "View";
  }

  cacheNote.style.display = "block";
  cacheNote.textContent = fromCache
    ? "Loaded from cache — no new Firestore read for this exam."
    : "Loaded fresh from Firestore and cached for this session.";

  $("#qbResultsTitle").textContent = `Questions — ${escapeHtml(testTitles[testId] || "")}`;
  $("#qbResultsPanel").style.display = "block";
  $("#qbEmptyState").style.display = "none";

  applySearchAndRender();
}

function applySearchAndRender() {
  const term = $("#qbSearch").value.trim().toLowerCase();
  const all = questionCache[currentTestId] || [];
  visibleQuestions = term
    ? all.filter((q) => String(q.question_en ?? q.question ?? "").toLowerCase().includes(term))
    : all;
  renderTable(visibleQuestions);
}

function renderTable(list) {
  const tbody = $("#questionBankBody");
  if (!list.length) {
    tbody.innerHTML = `
      <tr><td colspan="9">
        <div class="empty-illustration">
          <div class="empty-illustration__icon">🔍</div>
          <h3>No questions found</h3>
          <p>This exam has no questions yet, or none match your search.</p>
        </div>
      </td></tr>`;
    setSelectAllState(false, true);
    return;
  }
  tbody.innerHTML = list
    .map(
      (q, i) => `
      <tr data-q-id="${q.id}">
        <td class="qb-select-cell"><input type="checkbox" class="qb-select" /></td>
        <td data-label="#">${i + 1}</td>
        <td data-label="Question">${bilingualCell(q.question_en ?? q.question, q.question_hi ?? q.questionHindi)}</td>
        <td data-label="Option A" class="${q.answer === "A" ? "qb-correct-option" : ""}">${bilingualCell(q.optionA_en ?? q.optionA, q.optionA_hi ?? q.optionAHindi)}</td>
        <td data-label="Option B" class="${q.answer === "B" ? "qb-correct-option" : ""}">${bilingualCell(q.optionB_en ?? q.optionB, q.optionB_hi ?? q.optionBHindi)}</td>
        <td data-label="Option C" class="${q.answer === "C" ? "qb-correct-option" : ""}">${bilingualCell(q.optionC_en ?? q.optionC, q.optionC_hi ?? q.optionCHindi)}</td>
        <td data-label="Option D" class="${q.answer === "D" ? "qb-correct-option" : ""}">${bilingualCell(q.optionD_en ?? q.optionD, q.optionD_hi ?? q.optionDHindi)}</td>
        <td data-label="Answer"><span class="qb-answer-pill">${q.answer}</span></td>
        <td data-label="Actions" class="row-actions">
          <button class="icon-btn" data-action="edit-q">Edit</button>
          <button class="icon-btn icon-btn--danger" data-action="delete-q">Delete</button>
        </td>
      </tr>`
    )
    .join("");
  setSelectAllState(false, false);
  updateBulkBar();
}

/** English text, with its Hindi translation stacked below when present.
 *  Never truncates — long content wraps via the .qb-bilingual CSS instead. */
function bilingualCell(english, hindi) {
  return `<span class="qb-bilingual">
    <span class="qb-bilingual__en">${escapeHtml(english)}</span>
    ${hindi ? `<span class="qb-bilingual__hi">${escapeHtml(hindi)}</span>` : ""}
  </span>`;
}

function setSelectAllState(checked, disabled) {
  const selectAll = $("#qbSelectAll");
  selectAll.checked = checked;
  selectAll.indeterminate = false;
  selectAll.disabled = disabled;
}

function updateBulkBar() {
  const tbody = $("#questionBankBody");
  const bar = $("#bulkActionBar");
  const countLabel = $("#bulkActionCount");
  const checked = $all(".qb-select:checked", tbody);
  if (checked.length > 0) {
    bar.classList.add("is-visible");
    countLabel.textContent = `${checked.length} Question${checked.length === 1 ? "" : "s"} Selected`;
  } else {
    bar.classList.remove("is-visible");
  }
  const selectAll = $("#qbSelectAll");
  const allBoxes = $all(".qb-select", tbody);
  if (allBoxes.length) {
    selectAll.checked = checked.length === allBoxes.length;
    selectAll.indeterminate = checked.length > 0 && checked.length < allBoxes.length;
  }
}

async function deleteQuestion(qId) {
  await deleteDoc(doc(db, "tests", currentTestId, "questions", qId));
  questionCache[currentTestId] = (questionCache[currentTestId] || []).filter((q) => q.id !== qId);
  toast("Question deleted.", "success");
  applySearchAndRender();
}

function openQuestionEditModal(q) {
  const backdrop = $("#questionModalBackdrop");
  const form = $("#questionModalForm");
  form.dataset.qId = q.id;
  form.question.value = q.question_en ?? q.question ?? "";
  form.questionHindi.value = q.question_hi ?? q.questionHindi ?? "";
  form.optionA.value = q.optionA_en ?? q.optionA ?? "";
  form.optionAHindi.value = q.optionA_hi ?? q.optionAHindi ?? "";
  form.optionB.value = q.optionB_en ?? q.optionB ?? "";
  form.optionBHindi.value = q.optionB_hi ?? q.optionBHindi ?? "";
  form.optionC.value = q.optionC_en ?? q.optionC ?? "";
  form.optionCHindi.value = q.optionC_hi ?? q.optionCHindi ?? "";
  form.optionD.value = q.optionD_en ?? q.optionD ?? "";
  form.optionDHindi.value = q.optionD_hi ?? q.optionDHindi ?? "";
  form.answer.value = q.answer;
  backdrop.classList.add("is-open");
}

async function saveQuestionEdit(e) {
  e.preventDefault();
  const form = e.target;
  const qId = form.dataset.qId;

  const updated = {
    question_en: form.question.value.trim(),
    question_hi: form.questionHindi.value.trim(),
    optionA_en: form.optionA.value.trim(),
    optionA_hi: form.optionAHindi.value.trim(),
    optionB_en: form.optionB.value.trim(),
    optionB_hi: form.optionBHindi.value.trim(),
    optionC_en: form.optionC.value.trim(),
    optionC_hi: form.optionCHindi.value.trim(),
    optionD_en: form.optionD.value.trim(),
    optionD_hi: form.optionDHindi.value.trim(),
    answer: form.answer.value.trim().toUpperCase(),
  };

  // Both languages are mandatory for every field — the HTML inputs aren't
  // marked required (Hindi used to be optional), so this is enforced here.
  if (
    !updated.question_en || !updated.question_hi ||
    !updated.optionA_en || !updated.optionA_hi ||
    !updated.optionB_en || !updated.optionB_hi ||
    !updated.optionC_en || !updated.optionC_hi ||
    !updated.optionD_en || !updated.optionD_hi
  ) {
    toast("English and Hindi are both required for the question and every option.", "warning");
    return;
  }
  if (!["A", "B", "C", "D"].includes(updated.answer)) {
    toast("Answer must be A, B, C or D.", "warning");
    return;
  }

  await updateDoc(doc(db, "tests", currentTestId, "questions", qId), updated);

  // Keep the cache in sync so a later View click doesn't need a re-read.
  const list = questionCache[currentTestId] || [];
  const idx = list.findIndex((q) => q.id === qId);
  if (idx !== -1) list[idx] = { id: qId, ...updated };

  toast("Question updated.", "success");
  $("#questionModalBackdrop").classList.remove("is-open");
  applySearchAndRender();
}