// js/upload.js
import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, $all, qs, escapeHtml, toast } from "./utils.js";

const REQUIRED_COLUMNS = ["Question", "Option A", "Option B", "Option C", "Option D", "Answer"];
let parsedRows = []; // raw rows straight from the file
let validRows = []; // rows that passed validation, ready to save
let lockedTestId = null; // set when arriving via Create Test's auto-redirect

export async function initUploadFlow() {
  lockedTestId = qs("testId");
  if (lockedTestId) {
    await lockToTest(lockedTestId);
  } else {
    await populateTestDropdown();
  }
  wireDropzone();
  $("#uploadForm")?.addEventListener("submit", handleSave);
}

/** Arrived from Create Test's auto-redirect: no manual test selection —
 *  the dropdown becomes a read-only label naming the test it's locked to. */
async function lockToTest(testId) {
  const wrap = $("#targetTestWrap");
  try {
    const snap = await getDoc(doc(db, "tests", testId));
    if (!snap.exists()) {
      toast("That test could not be found.", "error");
      lockedTestId = null;
      await populateTestDropdown();
      return;
    }
    const test = snap.data();
    wrap.innerHTML = `
      <label>Saving questions to</label>
      <div class="locked-test-pill">
        <strong>${escapeHtml(test.title)}</strong>
        <span class="pill pill--published">published</span>
      </div>
      <p style="font-size:0.8rem;color:var(--navy-60);margin-top:8px;">
        This test just went live — its questions are added automatically. <a href="dashboard.html#mocktests">Choose a different test instead →</a>
      </p>
    `;
  } catch (err) {
    console.error(err);
  }
}

async function populateTestDropdown() {
  const wrap = $("#targetTestWrap");
  wrap.innerHTML = `
    <label for="targetTest">Save these questions to</label>
    <select id="targetTest"><option value="">Select a test...</option></select>
  `;
  const select = $("#targetTest");
  try {
    const snap = await getDocs(collection(db, "tests"));
    select.innerHTML =
      `<option value="">Select a test...</option>` +
      snap.docs.map((d) => `<option value="${d.id}">${escapeHtml(d.data().title)}</option>`).join("");
  } catch (err) {
    console.error(err);
  }
}

function currentTargetTestId() {
  if (lockedTestId) return lockedTestId;
  return $("#targetTest")?.value || "";
}

function wireDropzone() {
  const zone = $("#dropzone");
  const input = $("#fileInput");
  if (!zone || !input) return;

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-dragover");
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  input.addEventListener("change", () => {
    if (input.files[0]) handleFile(input.files[0]);
  });
}

function setStep(stepName) {
  $all(".upload-step").forEach((el) => {
    el.classList.remove("is-active", "is-done");
    const order = ["select", "preview", "validate", "save"];
    if (order.indexOf(el.dataset.step) < order.indexOf(stepName)) el.classList.add("is-done");
    if (el.dataset.step === stepName) el.classList.add("is-active");
  });
}

function handleFile(file) {
  const name = file.name.toLowerCase();
  setStep("preview");
  $("#fileNameLabel").textContent = file.name;
  $("#importCompletePanel").style.display = "none";

  if (name.endsWith(".csv")) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => onParsed(results.data),
      error: () => toast("Couldn't parse this CSV file.", "error"),
    });
  } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        onParsed(data);
      } catch (err) {
        console.error(err);
        toast("Couldn't parse this Excel file.", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    toast("Please upload a .csv or .xlsx file.", "error");
  }
  // The File object itself is never uploaded anywhere or kept after this
  // function returns — only the parsed rows below are retained in memory.
}

function onParsed(rows) {
  parsedRows = rows;
  renderPreview(rows);
  validateRows(rows);
}

function renderPreview(rows) {
  const container = $("#previewTable");
  if (!rows.length) {
    container.innerHTML = `<p>No rows found in this file.</p>`;
    return;
  }
  const sample = rows.slice(0, 8);
  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${REQUIRED_COLUMNS.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>
          ${sample
            .map(
              (r) => `<tr>${REQUIRED_COLUMNS.map((c) => `<td data-label="${c}">${escapeHtml(String(r[c] ?? ""))}</td>`).join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <p style="font-size:0.82rem;color:var(--navy-60);margin-top:8px;">
      Showing ${sample.length} of ${rows.length} rows.
    </p>
  `;
}

function validateRows(rows) {
  setStep("validate");
  const errors = [];
  const seenQuestions = new Set();
  validRows = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // account for header row
    const question = String(row["Question"] || "").trim();
    const a = String(row["Option A"] || "").trim();
    const b = String(row["Option B"] || "").trim();
    const c = String(row["Option C"] || "").trim();
    const d = String(row["Option D"] || "").trim();
    const answer = String(row["Answer"] || "").trim().toUpperCase();

    if (!question && !a && !b && !c && !d) return; // fully empty row, skip silently

    if (!question) {
      errors.push(`Row ${rowNum}: missing question text.`);
      return;
    }
    if (!a || !b || !c || !d) {
      errors.push(`Row ${rowNum}: one or more options are missing.`);
      return;
    }
    if (!["A", "B", "C", "D"].includes(answer)) {
      errors.push(`Row ${rowNum}: answer must be A, B, C or D.`);
      return;
    }
    const dupKey = question.toLowerCase();
    if (seenQuestions.has(dupKey)) {
      errors.push(`Row ${rowNum}: duplicate question ("${question.slice(0, 40)}...").`);
      return;
    }
    seenQuestions.add(dupKey);

    validRows.push({ question, optionA: a, optionB: b, optionC: c, optionD: d, answer });
  });

  const msgBox = $("#validationMsg");
  if (errors.length) {
    msgBox.className = "validation-msg validation-msg--warning";
    msgBox.innerHTML = `<strong>${errors.length} row(s) need attention</strong> — these will be skipped:<br>${errors
      .slice(0, 12)
      .map(escapeHtml)
      .join("<br>")}${errors.length > 12 ? `<br>…and ${errors.length - 12} more.` : ""}`;
  } else {
    msgBox.className = "validation-msg validation-msg--success";
    msgBox.textContent = "All rows look good.";
  }
  msgBox.style.display = "block";

  $("#validCount").textContent = validRows.length;
  $("#saveBtn").disabled = validRows.length === 0;
}

async function handleSave(e) {
  e.preventDefault();
  const testId = currentTargetTestId();
  if (!testId) {
    toast("Please choose which test these questions belong to.", "warning");
    return;
  }
  if (!validRows.length) {
    toast("No valid questions to save.", "warning");
    return;
  }
  const saveBtn = $("#saveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const col = collection(db, "tests", testId, "questions");
    for (const q of validRows) {
      await addDoc(col, q);
    }
    setStep("save");
    const savedCount = validRows.length;
    toast(`${savedCount} question(s) saved to the test.`, "success");

    // Discard the parsed data now that it's safely in Firestore.
    parsedRows = [];
    validRows = [];
    $("#previewTable").innerHTML = "";
    $("#fileInput").value = "";
    $("#validationMsg").style.display = "none";

    // Import Complete → Live: make the hand-off from Create Test obvious.
    const panel = $("#importCompletePanel");
    panel.style.display = "block";
    panel.innerHTML = `
      <div class="empty-illustration" style="padding-top:8px;">
        <div class="empty-illustration__icon" style="background:rgba(16,185,129,0.14);color:var(--success);">✓</div>
        <h3>Import complete — this test is live</h3>
        <p>${savedCount} question(s) were added. Candidates can find and take this test right now on Get Test.</p>
      </div>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:6px;">
        <a href="get-test.html" class="btn btn--primary">View on Get Test</a>
        <a href="question-bank.html" class="btn btn--ghost">Review in Question Bank</a>
        <a href="dashboard.html#mocktests" class="btn btn--soft">Back to Mock Tests</a>
      </div>
    `;
  } catch (err) {
    console.error(err);
    toast("Couldn't save questions. Please try again.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save to Firestore";
  }
}