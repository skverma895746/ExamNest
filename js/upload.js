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

// Every ExamNest upload is a single bilingual SSC/RRB/UPP-style CBT paper —
// both English and Hindi are mandatory for the question and all four options.
const REQUIRED_COLUMNS = [
  "Question_EN",
  "Question_HI",
  "OptionA_EN",
  "OptionA_HI",
  "OptionB_EN",
  "OptionB_HI",
  "OptionC_EN",
  "OptionC_HI",
  "OptionD_EN",
  "OptionD_HI",
  "Answer",
];
let parsedRows = []; // raw rows straight from the file (already header-normalized)
let validRows = []; // rows that passed validation, ready to save
let lockedTestId = null; // set when arriving via Create Test's auto-redirect
let lastRawHeaders = []; // the actual column headers found in the last uploaded file, pre-normalization

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

/**
 * Column headers coming out of real-world files are unreliable in three
 * ways this app has to tolerate:
 *  1. Excel's "CSV UTF-8" export prepends an invisible BOM (\uFEFF) to the
 *     very first header, silently turning "Question_EN" into
 *     "\uFEFFQuestion_EN" — every lookup for that column then fails.
 *  2. Stray leading/trailing whitespace around a header ("Question_EN ").
 *  3. Case differences ("question_en", "QUESTION_EN").
 * normalizeHeaderKey + normalizeRow clean this up once, right after
 * parsing, so every downstream function can trust row["Question_EN"] etc.
 * to exist whenever the data is actually there.
 */
function normalizeHeaderKey(key) {
  return String(key ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function normalizeRow(row) {
  const cleaned = {};

  // Remove BOM and extra spaces
  for (const [key, value] of Object.entries(row)) {
    cleaned[normalizeHeaderKey(key)] = value;
  }

  // Accept multiple CSV/Excel header formats
  const aliases = {
    "Question (English)": "Question_EN",
    "Question (Hindi)": "Question_HI",
    "Question": "Question_EN",
    "Question_EN ": "Question_EN",

    "Option A": "OptionA_EN",
    "Option B": "OptionB_EN",
    "Option C": "OptionC_EN",
    "Option D": "OptionD_EN",

    "Option A (Hindi)": "OptionA_HI",
    "Option B (Hindi)": "OptionB_HI",
    "Option C (Hindi)": "OptionC_HI",
    "Option D (Hindi)": "OptionD_HI",

    "Correct Answer": "Answer"
  };

  // Copy alias values
  for (const [oldKey, newKey] of Object.entries(aliases)) {
    if (cleaned[oldKey] !== undefined && cleaned[newKey] === undefined) {
      cleaned[newKey] = cleaned[oldKey];
    }
  }

  const normalized = {};

  REQUIRED_COLUMNS.forEach((col) => {
    const matchKey = Object.keys(cleaned).find(
      (k) => k.toLowerCase() === col.toLowerCase()
    );
    normalized[col] = matchKey ? cleaned[matchKey] : "";
  });

  return normalized;
}

function handleFile(file) {
  const name = file.name.toLowerCase();
  setStep("preview");
  $("#fileNameLabel").textContent = file.name;
  $("#importCompletePanel").style.display = "none";
  lastRawHeaders = [];

  if (name.endsWith(".csv")) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => {
        const clean = normalizeHeaderKey(h);
        if (!lastRawHeaders.includes(clean)) lastRawHeaders.push(clean);
        return clean;
      },
      complete: (results) => onParsed(results.data.map(normalizeRow)),
      error: () => toast("Couldn't parse this CSV file.", "error"),
    });
  } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        lastRawHeaders = data.length ? Object.keys(data[0]).map(normalizeHeaderKey) : [];
        onParsed(data.map(normalizeRow));
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
    const rowNum = i + 2;

    const question_en = String(row["Question_EN"] || "").trim();
    const question_hi = String(row["Question_HI"] || "").trim();

    const optionA_en = String(row["OptionA_EN"] || "").trim();
    const optionA_hi = String(row["OptionA_HI"] || "").trim();

    const optionB_en = String(row["OptionB_EN"] || "").trim();
    const optionB_hi = String(row["OptionB_HI"] || "").trim();

    const optionC_en = String(row["OptionC_EN"] || "").trim();
    const optionC_hi = String(row["OptionC_HI"] || "").trim();

    const optionD_en = String(row["OptionD_EN"] || "").trim();
    const optionD_hi = String(row["OptionD_HI"] || "").trim();

    const answer = String(row["Answer"] || "").trim().toUpperCase();

    // Skip fully empty row
    const anyValue =
      question_en || question_hi ||
      optionA_en || optionA_hi ||
      optionB_en || optionB_hi ||
      optionC_en || optionC_hi ||
      optionD_en || optionD_hi ||
      answer;

    if (!anyValue) return;

    // Required: English Question
    if (!question_en) {
      errors.push(`Row ${rowNum}: missing English question (Question_EN).`);
      return;
    }

    // Required: English Options
    if (!optionA_en || !optionB_en || !optionC_en || !optionD_en) {
      errors.push(`Row ${rowNum}: one or more English options are missing.`);
      return;
    }

    // Required: Answer
    if (!["A", "B", "C", "D"].includes(answer)) {
      errors.push(`Row ${rowNum}: answer must be A, B, C or D.`);
      return;
    }

    // Duplicate check
    const dupKey = question_en.toLowerCase();
    if (seenQuestions.has(dupKey)) {
      errors.push(`Row ${rowNum}: duplicate question ("${question_en.slice(0, 40)}...").`);
      return;
    }
    seenQuestions.add(dupKey);

    // Hindi auto-fill if empty
    validRows.push({
      question_en,
      question_hi: question_hi || question_en,

      optionA_en,
      optionA_hi: optionA_hi || optionA_en,

      optionB_en,
      optionB_hi: optionB_hi || optionB_en,

      optionC_en,
      optionC_hi: optionC_hi || optionC_en,

      optionD_en,
      optionD_hi: optionD_hi || optionD_en,

      answer,
    });
  });

  const msgBox = $("#validationMsg");

  if (errors.length) {
    msgBox.className = "validation-msg validation-msg--warning";
    msgBox.innerHTML =
      `<strong>${errors.length} row(s) need attention</strong> — these will be skipped:<br>` +
      errors
        .slice(0, 12)
        .map(escapeHtml)
        .join("<br>") +
      (errors.length > 12 ? `<br>…and ${errors.length - 12} more.` : "");
  } else if (rows.length > 0 && validRows.length === 0) {
    msgBox.className = "validation-msg validation-msg--warning";
    msgBox.innerHTML = `
      <strong>No matching columns found.</strong><br>
      <strong>Expected:</strong> ${REQUIRED_COLUMNS.map(escapeHtml).join(", ")}<br>
      <strong>Found:</strong> ${
        lastRawHeaders.length
          ? lastRawHeaders.map(escapeHtml).join(", ")
          : "(no headers detected)"
      }
    `;
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