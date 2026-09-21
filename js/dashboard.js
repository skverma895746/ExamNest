// js/dashboard.js
import { db } from "./firebase.js";
import { logout } from "./auth.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  getCountFromServer,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, formatDate, toast, escapeHtml, confirmDialog } from "./utils.js";
import { clearAttemptRecord } from "./storage.js";

// -----------------------------------------------------------------------------
// Shared admin shell: sidebar + mobile topbar. Every protected page calls
// renderShell(activeKey) once guardAdminPage() resolves.
// -----------------------------------------------------------------------------
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "▦", href: "dashboard.html" },
  { key: "mocktests", label: "Mock Tests", icon: "📄", href: "dashboard.html#mocktests" },
  { key: "upload", label: "Upload Questions", icon: "⬆", href: "upload.html" },
  { key: "questionbank", label: "Question Bank", icon: "🗂", href: "question-bank.html" },
  { key: "settings", label: "Settings", icon: "⚙", href: "settings.html" },
];

export function renderShell(activeKey) {
  const shell = document.createElement("div");
  shell.className = "admin-shell";

  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.id = "sidebar";
  sidebar.innerHTML = `
    <div class="sidebar__brand"><span class="brand__mark">EN</span>ExamNest</div>
    <nav>
      ${NAV_ITEMS.map(
        (item) => `
        <a class="sidebar__link ${item.key === activeKey ? "is-active" : ""}" href="${item.href}">
          <span class="sidebar__icon">${item.icon}</span>${item.label}
        </a>`
      ).join("")}
    </nav>
    <button class="sidebar__link sidebar__link--logout" id="logoutBtn">
      <span class="sidebar__icon">⏻</span>Logout
    </button>
  `;

  const topbar = document.createElement("div");
  topbar.className = "admin-topbar";
  topbar.innerHTML = `
    <button class="hamburger" id="sidebarToggle" aria-label="Open menu"><span></span><span></span><span></span></button>
    <div class="brand" style="font-size:1rem"><span class="brand__mark">EN</span>ExamNest</div>
    <span style="width:38px"></span>
  `;

  const scrim = document.createElement("div");
  scrim.className = "sidebar-scrim";
  scrim.id = "sidebarScrim";

  const main = document.getElementById("adminMain");
  shell.appendChild(sidebar);
  const mainWrap = document.createElement("div");
  mainWrap.appendChild(topbar);
  mainWrap.appendChild(main);
  shell.appendChild(mainWrap);

  document.body.prepend(scrim);
  document.body.prepend(shell);

  $("#logoutBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Log out?",
      body: "You'll need to sign in again to access the admin dashboard.",
      confirmLabel: "Log Out",
      danger: true,
    });
    if (ok) await logout();
  });

  $("#sidebarToggle")?.addEventListener("click", () => {
    sidebar.classList.add("is-open");
    scrim.classList.add("is-visible");
  });
  scrim.addEventListener("click", () => {
    sidebar.classList.remove("is-open");
    scrim.classList.remove("is-visible");
  });
}

// -----------------------------------------------------------------------------
// Dashboard overview (stat cards) — Total Tests, Total Questions, Latest Test.
// Total Attempts / results analytics were removed on purpose: this dashboard
// no longer reads the attempts collection at all, which is the point of the
// optimization (attempts are still written by exam.js and still cascade-
// deleted with their test — they're just never read back for display here).
// -----------------------------------------------------------------------------
export async function loadOverviewStats() {
  try {
    const testsSnap = await getDocs(collection(db, "tests"));
    let totalQuestions = 0;
    let latestTest = null;
    for (const t of testsSnap.docs) {
      const data = t.data();
      // getCountFromServer costs far less than fetching every question
      // document just to count them.
      const countSnap = await getCountFromServer(collection(db, "tests", t.id, "questions"));
      totalQuestions += countSnap.data().count;
      if (!latestTest || (data.createdAt?.seconds || 0) > (latestTest.createdAt?.seconds || 0)) {
        latestTest = { id: t.id, ...data };
      }
    }

    setStat("statTotalTests", testsSnap.size);
    setStat("statTotalQuestions", totalQuestions);
    setStat("statLatestTest", latestTest ? latestTest.title : "—");
  } catch (err) {
    console.error(err);
    toast("Couldn't load dashboard stats.", "error");
  }
}

function setStat(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
    el.classList.remove("is-loading");
  }
}

// -----------------------------------------------------------------------------
// Mock Test management (create / edit / delete / publish / duplicate)
// -----------------------------------------------------------------------------
export async function loadMockTestsTable() {
  const tbody = $("#mockTestsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6">Loading tests...</td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, "tests"), orderBy("createdAt", "desc")));
    if (snap.empty) {
      tbody.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-illustration">
            <div class="empty-illustration__icon">📄</div>
            <h3>No tests yet</h3>
            <p>Click "+ Create Test" above — it goes live immediately and takes you straight to Upload Questions.</p>
          </div>
        </td></tr>`;
      return;
    }
    tbody.innerHTML = snap.docs
      .map((d) => {
        const t = d.data();
        return `
        <tr data-id="${d.id}">
          <td data-label="Title"><strong>${escapeHtml(t.title)}</strong></td>
          <td data-label="Duration">${t.duration ?? 0} min</td>
          <td data-label="Negative">${t.negativeMarking ?? 0}</td>
          <td data-label="Status"><span class="pill ${t.status === "published" ? "pill--published" : "pill--draft"}">${t.status}</span></td>
          <td data-label="Created">${t.createdAt ? formatDate(new Date(t.createdAt.seconds * 1000)) : "—"}</td>
          <td data-label="Actions" class="row-actions">
            <button class="icon-btn" data-action="edit">Edit</button>
            <button class="icon-btn" data-action="toggle">${t.status === "published" ? "Unpublish" : "Publish"}</button>
            <button class="icon-btn" data-action="duplicate">Duplicate</button>
            <button class="icon-btn icon-btn--danger" data-action="delete">Delete</button>
          </td>
        </tr>`;
      })
      .join("");
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6">Couldn't load tests.</td></tr>`;
  }
}

export function wireMockTestActions() {
  const tbody = $("#mockTestsBody");
  if (!tbody) return;

  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const row = btn.closest("tr");
    const testId = row.dataset.id;
    const action = btn.dataset.action;

    if (action === "edit") {
      openTestModal(testId);
    } else if (action === "delete") {
      const ok = await confirmDialog({
        title: "Delete this test permanently?",
        body: "This removes the test, every question in it, every attempt ever submitted for it, and clears any Start Test / Retest history stored in this browser. This cannot be undone.",
        confirmLabel: "Delete Permanently",
        danger: true,
      });
      if (ok) {
        await deleteTestCascade(testId);
        toast("Test and all related data deleted.", "success");
        loadMockTestsTable();
        loadOverviewStats();
      }
    } else if (action === "toggle") {
      const ref = doc(db, "tests", testId);
      const snap = await getDoc(ref);
      const current = snap.data().status;
      await updateDoc(ref, { status: current === "published" ? "draft" : "published" });
      toast(current === "published" ? "Test unpublished." : "Test published.", "success");
      loadMockTestsTable();
    } else if (action === "duplicate") {
      await duplicateTest(testId);
      toast("Test duplicated as a draft.", "success");
      loadMockTestsTable();
    }
  });

  $("#createTestBtn")?.addEventListener("click", () => openTestModal(null));
  $("#testModalForm")?.addEventListener("submit", saveTestFromModal);
  $("#testModalCancel")?.addEventListener("click", closeTestModal);
}

/** Complete reset: test doc + its questions subcollection + every attempt
 *  tied to it + this browser's localStorage history for it. */
async function deleteTestCascade(testId) {
  const qSnap = await getDocs(collection(db, "tests", testId, "questions"));
  await Promise.all(qSnap.docs.map((q) => deleteDoc(q.ref)));

  const attemptsSnap = await getDocs(query(collection(db, "attempts"), where("testId", "==", testId)));
  await Promise.all(attemptsSnap.docs.map((a) => deleteDoc(a.ref)));

  await deleteDoc(doc(db, "tests", testId));

  // If this same browser previously took the test, wipe its Start/Retest
  // memory too, so a same-named test created later reads as brand new.
  clearAttemptRecord(testId);
}

async function duplicateTest(testId) {
  const original = await getDoc(doc(db, "tests", testId));
  const data = original.data();
  const newRef = await addDoc(collection(db, "tests"), {
    ...data,
    title: `${data.title} (Copy)`,
    status: "draft",
    createdAt: serverTimestamp(),
  });
  const qSnap = await getDocs(collection(db, "tests", testId, "questions"));
  await Promise.all(
    qSnap.docs.map((q) => addDoc(collection(db, "tests", newRef.id, "questions"), q.data()))
  );
}

function openTestModal(testId) {
  const backdrop = $("#testModalBackdrop");
  const form = $("#testModalForm");

  form.reset();
  form.dataset.editingId = testId || "";
  $("#testModalTitle").textContent = testId ? "Edit Test" : "Create Test";
  $("#testModalHint").style.display = testId ? "none" : "block";

  if (testId) {
    // Edit existing test
    getDoc(doc(db, "tests", testId)).then((snap) => {
      const t = snap.data();

      form.title.value = t.title || "";
      form.description.value = t.description || "";
      form.duration.value = t.duration || 60;
      form.negativeMarking.value = t.negativeMarking || 0;
      form.difficulty.value = t.difficulty || "medium";
      form.shuffleQuestions.checked = !!t.shuffleQuestions;
      form.shuffleOptions.checked = !!t.shuffleOptions;
    });
  } else {
    // New Test → Load saved defaults
    getDoc(doc(db, "settings", "global")).then((snap) => {
      if (!snap.exists()) return;

      const d = snap.data();

      form.duration.value = d.defaultTimer ?? 60;
      form.negativeMarking.value = d.defaultNegative ?? 0;
      form.difficulty.value = d.defaultDifficulty ?? "medium";
      form.shuffleQuestions.checked = !!d.defaultShuffleQuestions;
      form.shuffleOptions.checked = !!d.defaultShuffleOptions;
    }).catch(console.error);
  }

  backdrop.classList.add("is-open");
}

function closeTestModal() {
  $("#testModalBackdrop").classList.remove("is-open");
}

async function saveTestFromModal(e) {
  e.preventDefault();
  const form = e.target;
  const editingId = form.dataset.editingId;
  const payload = {
    title: form.title.value.trim(),
    description: form.description.value.trim(),
    duration: Number(form.duration.value) || 60,
    negativeMarking: Number(form.negativeMarking.value) || 0,
    difficulty: form.difficulty.value || "medium",
    shuffleQuestions: form.shuffleQuestions.checked,
    shuffleOptions: form.shuffleOptions.checked,
  };
  if (!payload.title) {
    toast("Please give the test a title.", "warning");
    return;
  }
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    if (editingId) {
      await updateDoc(doc(db, "tests", editingId), payload);
      toast("Test updated.", "success");
      closeTestModal();
      loadMockTestsTable();
      loadOverviewStats();
    } else {
      // Create Test always goes live immediately — no draft step — then
      // hands off straight to Upload Questions with the test pre-selected.
      const newRef = await addDoc(collection(db, "tests"), {
        ...payload,
        status: "published",
        questionCount: 0,
        createdAt: serverTimestamp(),
      });
      toast("Test created and published. Now add its questions...", "success");
      window.location.href = `upload.html?testId=${encodeURIComponent(newRef.id)}`;
      return; // navigating away — skip resetting the button below
    }
  } catch (err) {
    console.error(err);
    toast("Couldn't save the test. Please try again.", "error");
  } finally {
    submitBtn.disabled = false;
  }
}