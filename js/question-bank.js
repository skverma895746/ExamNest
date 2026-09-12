// js/question-bank.js
import { db } from "./firebase.js";
import {
  collection,
  doc,
  deleteDoc,
  updateDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, $all, escapeHtml, toast, debounce, confirmDialog } from "./utils.js";

let allQuestions = []; // { testId, testTitle, id, ...question }
let visibleQuestions = []; // after search/filter — what Select All operates on

export async function loadQuestionBank() {
  const tbody = $("#questionBankBody");
  const testFilter = $("#qbTestFilter");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4">Loading question bank...</td></tr>`;
  try {
    const testsSnap = await getDocs(collection(db, "tests"));
    allQuestions = [];
    const options = [`<option value="">All tests</option>`];
    for (const t of testsSnap.docs) {
      const data = t.data();
      options.push(`<option value="${t.id}">${escapeHtml(data.title)}</option>`);
      const qSnap = await getDocs(collection(db, "tests", t.id, "questions"));
      qSnap.forEach((q) => {
        allQuestions.push({ testId: t.id, testTitle: data.title, id: q.id, ...q.data() });
      });
    }
    if (testFilter) testFilter.innerHTML = options.join("");
    visibleQuestions = allQuestions;
    renderTable(visibleQuestions);
    updateBulkBar();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="4">Couldn't load the question bank.</td></tr>`;
  }
}

function renderTable(list) {
  const tbody = $("#questionBankBody");
  if (!list.length) {
    tbody.innerHTML = `
      <tr><td colspan="4">
        <div class="empty-illustration">
          <div class="empty-illustration__icon">🗂</div>
          <h3>No questions found</h3>
          <p>Try a different search, filter, or upload a fresh question set.</p>
        </div>
      </td></tr>`;
    setSelectAllState(false, true);
    return;
  }
  tbody.innerHTML = list
    .map(
      (q) => `
      <tr data-test-id="${q.testId}" data-q-id="${q.id}">
        <td class="qb-select-cell"><input type="checkbox" class="qb-select" /></td>
        <td data-label="Question">${escapeHtml(q.question).slice(0, 90)}${q.question.length > 90 ? "…" : ""}</td>
        <td data-label="Test">${escapeHtml(q.testTitle)}</td>
        <td data-label="Actions" class="row-actions">
          <button class="icon-btn" data-action="edit-q">Edit</button>
          <button class="icon-btn icon-btn--danger" data-action="delete-q">Delete</button>
        </td>
      </tr>`
    )
    .join("");
  setSelectAllState(false, false);
}

// -----------------------------------------------------------------------------
// Select All + bulk action bar
// -----------------------------------------------------------------------------
function setSelectAllState(checked, disabled) {
  const selectAll = $("#qbSelectAll");
  if (!selectAll) return;
  selectAll.checked = checked;
  selectAll.indeterminate = false;
  selectAll.disabled = disabled;
}

function updateBulkBar() {
  const tbody = $("#questionBankBody");
  const bar = $("#bulkActionBar");
  const countLabel = $("#bulkActionCount");
  if (!tbody || !bar) return;
  const checked = $all(".qb-select:checked", tbody);
  if (checked.length > 0) {
    bar.classList.add("is-visible");
    countLabel.textContent = `${checked.length} Question${checked.length === 1 ? "" : "s"} Selected`;
  } else {
    bar.classList.remove("is-visible");
  }

  const selectAll = $("#qbSelectAll");
  const allBoxes = $all(".qb-select", tbody);
  if (selectAll && allBoxes.length) {
    selectAll.checked = checked.length === allBoxes.length;
    selectAll.indeterminate = checked.length > 0 && checked.length < allBoxes.length;
  }
}

export function wireQuestionBank() {
  const searchInput = $("#qbSearch");
  const testFilter = $("#qbTestFilter");
  const tbody = $("#questionBankBody");
  const selectAll = $("#qbSelectAll");
  const bulkDeleteBtn = $("#bulkDeleteBtn");
  const bulkCancelBtn = $("#bulkCancelBtn");
  if (!tbody) return;

  function applyFilters() {
    const term = (searchInput?.value || "").toLowerCase();
    const testId = testFilter?.value || "";
    visibleQuestions = allQuestions.filter((q) => {
      const matchesTerm = q.question.toLowerCase().includes(term);
      const matchesTest = !testId || q.testId === testId;
      return matchesTerm && matchesTest;
    });
    renderTable(visibleQuestions);
    updateBulkBar();
  }

  searchInput?.addEventListener("input", debounce(applyFilters, 200));
  testFilter?.addEventListener("change", applyFilters);

  // Select All applies to the currently visible (searched/filtered) rows —
  // and stays in sync if the person edits the search after selecting.
  selectAll?.addEventListener("change", () => {
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
    const testId = row.dataset.testId;
    const qId = row.dataset.qId;

    if (btn.dataset.action === "delete-q") {
      const ok = await confirmDialog({
        title: "Delete this question?",
        body: "This question will be permanently removed from its test.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (ok) {
        await deleteDoc(doc(db, "tests", testId, "questions", qId));
        toast("Question deleted.", "success");
        loadQuestionBank();
      }
    } else if (btn.dataset.action === "edit-q") {
      const q = allQuestions.find((x) => x.testId === testId && x.id === qId);
      openQuestionEditModal(q);
    }
  });

  bulkDeleteBtn?.addEventListener("click", async () => {
    const checked = $all(".qb-select:checked", tbody);
    if (!checked.length) return;
    const ok = await confirmDialog({
      title: `Delete ${checked.length} question(s)?`,
      body: "Selected questions will be permanently removed from their tests. This cannot be undone.",
      confirmLabel: "Delete Selected",
      danger: true,
    });
    if (!ok) return;
    for (const cb of checked) {
      const row = cb.closest("tr");
      await deleteDoc(doc(db, "tests", row.dataset.testId, "questions", row.dataset.qId));
    }
    toast("Selected questions deleted.", "success");
    loadQuestionBank();
  });

  bulkCancelBtn?.addEventListener("click", () => {
    $all(".qb-select", tbody).forEach((cb) => (cb.checked = false));
    updateBulkBar();
  });

  $("#questionModalForm")?.addEventListener("submit", saveQuestionEdit);
  $("#questionModalCancel")?.addEventListener("click", () => {
    $("#questionModalBackdrop").classList.remove("is-open");
  });
}

function openQuestionEditModal(q) {
  const backdrop = $("#questionModalBackdrop");
  const form = $("#questionModalForm");
  form.dataset.testId = q.testId;
  form.dataset.qId = q.id;
  form.question.value = q.question;
  form.optionA.value = q.optionA;
  form.optionB.value = q.optionB;
  form.optionC.value = q.optionC;
  form.optionD.value = q.optionD;
  form.answer.value = q.answer;
  backdrop.classList.add("is-open");
}

async function saveQuestionEdit(e) {
  e.preventDefault();
  const form = e.target;
  const { testId, qId } = form.dataset;
  await updateDoc(doc(db, "tests", testId, "questions", qId), {
    question: form.question.value.trim(),
    optionA: form.optionA.value.trim(),
    optionB: form.optionB.value.trim(),
    optionC: form.optionC.value.trim(),
    optionD: form.optionD.value.trim(),
    answer: form.answer.value.trim().toUpperCase(),
  });
  toast("Question updated.", "success");
  $("#questionModalBackdrop").classList.remove("is-open");
  loadQuestionBank();
}