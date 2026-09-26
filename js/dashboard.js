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

import {
  $,
  formatDate,
  toast,
  escapeHtml,
  confirmDialog,
} from "./utils.js";

import { clearAttemptRecord } from "./storage.js";


// -----------------------------------------------------------------------------
// Shared admin shell
// -----------------------------------------------------------------------------

export function renderShell(activeKey) {
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("sidebarScrim");

  if (!sidebar) return;

  sidebar
    .querySelectorAll(".sidebar__link[data-key]")
    .forEach((link) => {
      link.classList.toggle(
        "is-active",
        link.dataset.key === activeKey
      );
    });

  $("#logoutBtn")?.addEventListener("click", async () => {
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
    scrim?.classList.add("is-visible");
  });

  scrim?.addEventListener("click", () => {
    sidebar.classList.remove("is-open");
    scrim.classList.remove("is-visible");
  });
}


// -----------------------------------------------------------------------------
// Dashboard overview
// -----------------------------------------------------------------------------

export async function loadOverviewStats() {
  try {
    const testsSnap = await getDocs(
      collection(db, "tests")
    );

    let totalQuestions = 0;
    let latestTest = null;

    for (const t of testsSnap.docs) {
      const data = t.data();

      const countSnap = await getCountFromServer(
        collection(
          db,
          "tests",
          t.id,
          "questions"
        )
      );

      totalQuestions += countSnap.data().count;

      if (
        !latestTest ||
        (data.createdAt?.seconds || 0) >
          (latestTest.createdAt?.seconds || 0)
      ) {
        latestTest = {
          id: t.id,
          ...data,
        };
      }
    }

    setStat(
      "statTotalTests",
      testsSnap.size
    );

    setStat(
      "statTotalQuestions",
      totalQuestions
    );

    setStat(
      "statLatestTest",
      latestTest
        ? latestTest.title
        : "—"
    );

  } catch (err) {
    console.error(err);

    toast(
      "Couldn't load dashboard stats.",
      "error"
    );
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
// Mock Test management
// create / edit / delete / publish / duplicate
// -----------------------------------------------------------------------------

export async function loadMockTestsTable() {
  const tbody = $("#mockTestsBody");

  if (!tbody) return;

  /*
   * 7 columns:
   *
   * 1. Title
   * 2. Duration
   * 3. Marks / Question
   * 4. Negative marking
   * 5. Status
   * 6. Created
   * 7. Actions
   */

  tbody.innerHTML = `
    <tr>
      <td colspan="7">
        Loading tests...
      </td>
    </tr>
  `;

  try {
    const snap = await getDocs(
      query(
        collection(db, "tests"),
        orderBy("createdAt", "desc")
      )
    );

    if (snap.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">

            <div class="empty-illustration">

              <div class="empty-illustration__icon">
                📄
              </div>

              <h3>No tests yet</h3>

              <p>
                Click "+ Create Test" above —
                it goes live immediately and takes
                you straight to Upload Questions.
              </p>

            </div>

          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML = snap.docs
      .map((d) => {
        const t = d.data();

        /*
         * Backward compatibility:
         *
         * Old tests may not have marksPerQuestion.
         * Such tests will display 1 mark.
         */

        const marksPerQuestion =
          t.marksPerQuestion ?? 1;

        return `
          <tr data-id="${d.id}">

            <td data-label="Title">
              <strong>
                ${escapeHtml(t.title || "Untitled Test")}
              </strong>
            </td>


            <td data-label="Duration">
              ${t.duration ?? 0} min
            </td>


            <td data-label="Marks / Question">
              ${marksPerQuestion}
            </td>


            <td data-label="Negative">
              ${t.negativeMarking ?? 0}
            </td>


            <td data-label="Status">

              <span
                class="pill ${
                  t.status === "published"
                    ? "pill--published"
                    : "pill--draft"
                }"
              >
                ${escapeHtml(t.status || "draft")}
              </span>

            </td>


            <td data-label="Created">

              ${
                t.createdAt
                  ? formatDate(
                      new Date(
                        t.createdAt.seconds * 1000
                      )
                    )
                  : "—"
              }

            </td>


            <td
              data-label="Actions"
              class="row-actions"
            >

              <button
                class="icon-btn"
                data-action="edit"
              >
                ✏️ Edit
              </button>


              <button
                class="icon-btn"
                data-action="toggle"
              >
                ${
                  t.status === "published"
                    ? "🔒 Unpublish"
                    : "🌐 Publish"
                }
              </button>


              <button
                class="icon-btn"
                data-action="duplicate"
              >
                ⧉ Duplicate
              </button>


              <button
                class="icon-btn icon-btn--danger"
                data-action="delete"
              >
                🗑️ Delete
              </button>

            </td>

          </tr>
        `;
      })
      .join("");

  } catch (err) {
    console.error(err);

    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          Couldn't load tests.
        </td>
      </tr>
    `;
  }
}


// -----------------------------------------------------------------------------
// Wire Mock Test Actions
// -----------------------------------------------------------------------------

export function wireMockTestActions() {
  const tbody = $("#mockTestsBody");

  if (!tbody) return;

  tbody.addEventListener(
    "click",
    async (e) => {
      const btn =
        e.target.closest(
          "button[data-action]"
        );

      if (!btn) return;

      const row =
        btn.closest("tr");

      if (!row) return;

      const testId =
        row.dataset.id;

      const action =
        btn.dataset.action;


      // -----------------------------------------------------------
      // EDIT
      // -----------------------------------------------------------

      if (action === "edit") {
        openTestModal(testId);
      }


      // -----------------------------------------------------------
      // DELETE
      // -----------------------------------------------------------

      else if (action === "delete") {
        const ok =
          await confirmDialog({
            title:
              "Delete this test permanently?",

            body:
              "This removes the test, every question in it, every attempt ever submitted for it, and clears any Start Test / Retest history stored in this browser. This cannot be undone.",

            confirmLabel:
              "Delete Permanently",

            danger:
              true,
          });

        if (ok) {
          await deleteTestCascade(
            testId
          );

          toast(
            "Test and all related data deleted.",
            "success"
          );

          loadMockTestsTable();
          loadOverviewStats();
        }
      }


      // -----------------------------------------------------------
      // PUBLISH / UNPUBLISH
      // -----------------------------------------------------------

      else if (action === "toggle") {
        const ref =
          doc(
            db,
            "tests",
            testId
          );

        const snap =
          await getDoc(ref);

        if (!snap.exists()) {
          toast(
            "Test not found.",
            "error"
          );

          return;
        }

        const current =
          snap.data().status;

        await updateDoc(
          ref,
          {
            status:
              current === "published"
                ? "draft"
                : "published",
          }
        );

        toast(
          current === "published"
            ? "Test unpublished."
            : "Test published.",
          "success"
        );

        loadMockTestsTable();
      }


      // -----------------------------------------------------------
      // DUPLICATE
      // -----------------------------------------------------------

      else if (action === "duplicate") {
        await duplicateTest(
          testId
        );

        toast(
          "Test duplicated as a draft.",
          "success"
        );

        loadMockTestsTable();
      }
    }
  );


  // CREATE TEST
  $("#createTestBtn")?.addEventListener(
    "click",
    () => openTestModal(null)
  );


  // FORM SUBMIT
  $("#testModalForm")?.addEventListener(
    "submit",
    saveTestFromModal
  );


  // CANCEL
  $("#testModalCancel")?.addEventListener(
    "click",
    closeTestModal
  );
}


// -----------------------------------------------------------------------------
// Delete Test Cascade
// -----------------------------------------------------------------------------

async function deleteTestCascade(testId) {
  const qSnap =
    await getDocs(
      collection(
        db,
        "tests",
        testId,
        "questions"
      )
    );

  await Promise.all(
    qSnap.docs.map(
      (q) =>
        deleteDoc(q.ref)
    )
  );


  const attemptsSnap =
    await getDocs(
      query(
        collection(db, "attempts"),
        where(
          "testId",
          "==",
          testId
        )
      )
    );


  await Promise.all(
    attemptsSnap.docs.map(
      (a) =>
        deleteDoc(a.ref)
    )
  );


  await deleteDoc(
    doc(
      db,
      "tests",
      testId
    )
  );


  clearAttemptRecord(testId);
}


// -----------------------------------------------------------------------------
// Duplicate Test
// -----------------------------------------------------------------------------

async function duplicateTest(testId) {
  const original =
    await getDoc(
      doc(
        db,
        "tests",
        testId
      )
    );

  if (!original.exists()) {
    throw new Error(
      "Original test not found."
    );
  }

  const data =
    original.data();

  /*
   * ...data automatically copies:
   *
   * marksPerQuestion
   * duration
   * negativeMarking
   * difficulty
   * shuffleQuestions
   * shuffleOptions
   * etc.
   */

  const newRef =
    await addDoc(
      collection(db, "tests"),
      {
        ...data,

        title:
          `${data.title} (Copy)`,

        status:
          "draft",

        createdAt:
          serverTimestamp(),
      }
    );


  const qSnap =
    await getDocs(
      collection(
        db,
        "tests",
        testId,
        "questions"
      )
    );


  await Promise.all(
    qSnap.docs.map(
      (q) =>
        addDoc(
          collection(
            db,
            "tests",
            newRef.id,
            "questions"
          ),
          q.data()
        )
    )
  );
}


// -----------------------------------------------------------------------------
// Open Create / Edit Test Modal
// -----------------------------------------------------------------------------

function openTestModal(testId) {
  const backdrop =
    $("#testModalBackdrop");

  const form =
    $("#testModalForm");

  if (!backdrop || !form) return;


  form.reset();


  form.dataset.editingId =
    testId || "";


  $("#testModalTitle").textContent =
    testId
      ? "Edit Test"
      : "Create Test";


  $("#testModalHint").style.display =
    testId
      ? "none"
      : "block";


  // -----------------------------------------------------------
  // EDIT EXISTING TEST
  // -----------------------------------------------------------

  if (testId) {
    getDoc(
      doc(
        db,
        "tests",
        testId
      )
    )
      .then((snap) => {

        if (!snap.exists()) {
          toast(
            "Test not found.",
            "error"
          );

          return;
        }

        const t =
          snap.data();


        form.title.value =
          t.title || "";


        form.description.value =
          t.description || "";


        form.duration.value =
          t.duration ?? 60;


        /*
         * Marks per question.
         *
         * Old tests without this field
         * automatically use 1.
         */

        form.marksPerQuestion.value =
          t.marksPerQuestion ?? 1;


        form.negativeMarking.value =
          t.negativeMarking ?? 0;


        form.difficulty.value =
          t.difficulty || "medium";


        form.shuffleQuestions.checked =
          !!t.shuffleQuestions;


        form.shuffleOptions.checked =
          !!t.shuffleOptions;

      })
      .catch((err) => {

        console.error(err);

        toast(
          "Couldn't load test details.",
          "error"
        );

      });

  }


  // -----------------------------------------------------------
  // NEW TEST
  // -----------------------------------------------------------

  else {

    /*
     * Safe fallback.
     *
     * If settings/global is unavailable,
     * marks will remain 1.
     */

    form.marksPerQuestion.value = 1;


    getDoc(
      doc(
        db,
        "settings",
        "global"
      )
    )
      .then((snap) => {

        if (!snap.exists()) return;

        const d =
          snap.data();


        form.duration.value =
          d.defaultTimer ?? 60;


        /*
         * Default Marks per Question
         */

        form.marksPerQuestion.value =
          d.defaultMarksPerQuestion ?? 1;


        form.negativeMarking.value =
          d.defaultNegative ?? 0;


        form.difficulty.value =
          d.defaultDifficulty ??
          "medium";


        form.shuffleQuestions.checked =
          !!d.defaultShuffleQuestions;


        form.shuffleOptions.checked =
          !!d.defaultShuffleOptions;

      })
      .catch((err) => {
        console.error(
          "Couldn't load test defaults:",
          err
        );
      });
  }


  backdrop.classList.add(
    "is-open"
  );
}


// -----------------------------------------------------------------------------
// Close Modal
// -----------------------------------------------------------------------------

function closeTestModal() {
  const backdrop =
    $("#testModalBackdrop");

  if (backdrop) {
    backdrop.classList.remove(
      "is-open"
    );
  }
}


// -----------------------------------------------------------------------------
// Save Create / Edit Test
// -----------------------------------------------------------------------------

async function saveTestFromModal(e) {
  e.preventDefault();


  const form =
    e.target;


  const editingId =
    form.dataset.editingId;


  // -----------------------------------------------------------
  // Read Marks Per Question
  // -----------------------------------------------------------

  const marksValue =
    Number(
      form.marksPerQuestion.value
    );


  // -----------------------------------------------------------
  // Validate Marks Per Question
  // -----------------------------------------------------------

  if (
    !Number.isFinite(marksValue) ||
    marksValue < 0
  ) {
    toast(
      "Marks per question must be 0 or greater.",
      "warning"
    );

    form.marksPerQuestion.focus();

    return;
  }


  // -----------------------------------------------------------
  // Read Negative Marking
  // -----------------------------------------------------------

  const negativeValue =
    Number(
      form.negativeMarking.value
    );


  // -----------------------------------------------------------
  // Validate Negative Marking
  // -----------------------------------------------------------

  if (
    !Number.isFinite(negativeValue) ||
    negativeValue < 0
  ) {
    toast(
      "Negative marking must be 0 or greater.",
      "warning"
    );

    form.negativeMarking.focus();

    return;
  }


  // -----------------------------------------------------------
  // Payload
  // -----------------------------------------------------------

  const payload = {

    title:
      form.title.value.trim(),


    description:
      form.description.value.trim(),


    duration:
      Number(form.duration.value) || 60,


    /*
     * Marks per Question
     *
     * Example:
     * 1 mark
     * 2 marks
     * 0.5 marks
     */

    marksPerQuestion:
      marksValue,


    negativeMarking:
      negativeValue,


    difficulty:
      form.difficulty.value ||
      "medium",


    shuffleQuestions:
      form.shuffleQuestions.checked,


    shuffleOptions:
      form.shuffleOptions.checked,

  };


  // -----------------------------------------------------------
  // Validate Title
  // -----------------------------------------------------------

  if (!payload.title) {
    toast(
      "Please give the test a title.",
      "warning"
    );

    form.title.focus();

    return;
  }


  // -----------------------------------------------------------
  // Disable Submit Button
  // -----------------------------------------------------------

  const submitBtn =
    form.querySelector(
      'button[type="submit"]'
    );


  if (submitBtn) {
    submitBtn.disabled = true;
  }


  try {

    // ---------------------------------------------------------
    // EDIT EXISTING TEST
    // ---------------------------------------------------------

    if (editingId) {

      await updateDoc(
        doc(
          db,
          "tests",
          editingId
        ),
        payload
      );


      toast(
        "Test updated.",
        "success"
      );


      closeTestModal();


      loadMockTestsTable();


      loadOverviewStats();

    }


    // ---------------------------------------------------------
    // CREATE NEW TEST
    // ---------------------------------------------------------

    else {

      /*
       * Create Test goes live immediately.
       *
       * marksPerQuestion is included in payload,
       * therefore Firestore stores it in:
       *
       * tests/{testId}
       */

      const newRef =
        await addDoc(
          collection(
            db,
            "tests"
          ),
          {

            ...payload,

            status:
              "published",

            questionCount:
              0,

            createdAt:
              serverTimestamp(),

          }
        );


      toast(
        "Test created and published. Now add its questions...",
        "success"
      );


      window.location.href =
        `upload.html?testId=${encodeURIComponent(
          newRef.id
        )}`;


      return;
    }


  } catch (err) {

    console.error(err);


    toast(
      "Couldn't save the test. Please try again.",
      "error"
    );

  } finally {

    if (submitBtn) {
      submitBtn.disabled = false;
    }

  }
}