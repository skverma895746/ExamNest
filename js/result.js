// js/result.js
import { $, $all, escapeHtml, formatDuration, qs } from "./utils.js";
import { loadLatestResult } from "./storage.js";

let result = null;
let currentFilter = "all";

export function initResult() {
  result = loadLatestResult();
  const testId = qs("testId");

  if (!result || (testId && result.testId !== testId)) {
    renderFatal();
    return;
  }

  renderHero();
  renderCards();
  renderCharts();
  renderReview();
  wireActions();
}

function renderFatal() {
  document.getElementById("resultRoot").innerHTML = `
    <div style="min-height:70vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;">
      <div>
        <h1 style="margin-bottom:10px;">No recent result found</h1>
        <p style="color:#64748b;margin-bottom:20px;">Take a test to see your results here.</p>
        <a href="get-test.html" class="btn btn--primary">Browse Tests</a>
      </div>
    </div>`;
}

function renderHero() {
  $("#resultTestTitle").textContent = result.testTitle;
  $("#resultSubline").textContent = result.autoSubmitted
    ? "Time ran out — your test was submitted automatically."
    : "Here's how you did.";
}

function renderCards() {
  $("#cardScore").textContent = `${result.score}/${result.maxScore}`;
  $("#cardAccuracy").textContent = `${result.accuracy.toFixed(1)}%`;
  $("#cardCorrect").textContent = result.correct;
  $("#cardWrong").textContent = result.wrong;
  $("#cardUnattempted").textContent = result.unattempted;
  $("#cardTime").textContent = formatDuration(result.timeUsed);
}

function renderCharts() {
  // Accuracy pie (pure CSS conic-gradient, no library needed)
  const acc = result.accuracy;
  const pie = $("#accuracyPie");
  pie.style.background = `conic-gradient(var(--success) ${acc}%, var(--error) ${acc}% 100%)`;
  $("#accuracyPieLabel").textContent = `${acc.toFixed(1)}%`;

  // Performance bar chart: correct / wrong / unattempted
  const max = Math.max(result.correct, result.wrong, result.unattempted, 1);
  const bars = [
    { label: "Correct", value: result.correct, color: "var(--success)" },
    { label: "Wrong", value: result.wrong, color: "var(--error)" },
    { label: "Unattempted", value: result.unattempted, color: "var(--warning)" },
  ];
  $("#performanceChart").innerHTML = bars
    .map(
      (b) => `
      <div class="bar-chart__col">
        <div class="bar-chart__bar" style="height:${(b.value / max) * 120}px;background:${b.color}"></div>
        <div class="bar-chart__label">${b.label}<br><strong>${b.value}</strong></div>
      </div>`
    )
    .join("");

  // Time distribution
  const pct = Math.min(100, (result.timeUsed / result.duration) * 100);
  $("#timeBarFill").style.width = `${pct}%`;
  $("#timeUsedLabel").textContent = formatDuration(result.timeUsed);
  $("#timeTotalLabel").textContent = formatDuration(result.duration);
}

function renderReview() {
  const list = result.perQuestion.filter((q) => currentFilter === "all" || q.status === currentFilter);
  const container = $("#reviewList");

  if (!list.length) {
    container.innerHTML = `<p style="text-align:center;color:var(--navy-60);">No questions in this category.</p>`;
    return;
  }

  container.innerHTML = list
    .map((q, i) => {
      const badgeClass =
        q.status === "correct" ? "review-badge--correct" : q.status === "wrong" ? "review-badge--wrong" : "review-badge--unattempted";
      const badgeLabel = q.status === "correct" ? "Correct" : q.status === "wrong" ? "Wrong" : "Unattempted";
      return `
      <div class="review-item">
        <div class="review-item__head">
          <div class="review-item__q">${escapeHtml(q.question)}</div>
          <span class="review-badge ${badgeClass}">${badgeLabel}</span>
        </div>
        ${q.options
          .map((opt) => {
            let cls = "";
            if (opt.key === q.correctAnswer) cls = "is-correct-answer";
            else if (opt.key === q.yourAnswer && q.yourAnswer !== q.correctAnswer) cls = "is-your-wrong-answer";
            const tag =
              opt.key === q.correctAnswer
                ? " — Correct answer"
                : opt.key === q.yourAnswer
                ? " — Your answer"
                : "";
            return `<div class="review-option ${cls}">${opt.key}. ${escapeHtml(opt.text)}${tag}</div>`;
          })
          .join("")}
      </div>`;
    })
    .join("");
}

function wireActions() {
  $all(".review-filter").forEach((btn) =>
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      $all(".review-filter").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      renderReview();
    })
  );

  $("#retakeBtn").addEventListener("click", () => {
    window.location.href = `instructions.html?testId=${encodeURIComponent(result.testId)}&mode=retest`;
  });
  $("#reviewBtn").addEventListener("click", () => {
    document.getElementById("reviewSection").scrollIntoView({ behavior: "smooth" });
  });
}
