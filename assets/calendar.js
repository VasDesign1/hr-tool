// Reusable month-view calendar. Mon-first (Australian convention).
// State is kept on the container element via dataset.

import { melDateKey } from "./time.js";
import { isPublicHoliday } from "./holidays.js";

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const DOW    = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export function renderCalendar(container, opts) {
  // Initialise state on first call
  if (!container._calState) {
    const now = new Date();
    container._calState = {
      year: opts.year  ?? now.getFullYear(),
      month: opts.month ?? now.getMonth()
    };
  }
  if (opts.year != null)  container._calState.year  = opts.year;
  if (opts.month != null) container._calState.month = opts.month;

  const state = container._calState;
  const { entries = [], onClickDay, onClickEntry, allowSpan = false } = opts;

  // Optional 2-month view (admin only — the page opts in via `allowSpan`).
  // Preference is remembered per browser.
  const SPAN_KEY = "hrtool.calSpan";
  let span = 1;
  if (allowSpan) {
    try { span = localStorage.getItem(SPAN_KEY) === "2" ? 2 : 1; } catch { span = 1; }
  }
  const lastMonthIdx = state.month + span - 1;              // may be 12 → next year
  const lastYear  = state.year + Math.floor(lastMonthIdx / 12);
  const lastMonth = lastMonthIdx % 12;

  // Group entries by date for fast lookup. Leave requests are only drawn on
  // working days (Mon-Fri, not a Vic public holiday) — weekends and holidays
  // are never charged, so they must not look like the contractor is off.
  // Holiday entries themselves draw on their own date regardless.
  const byDate = {};
  for (const e of entries) {
    let cur = parseKey(e.startDate);
    const end = parseKey(e.endDate);
    const keys = [];
    while (cur <= end) {
      const key = toKey(cur);
      const dow = cur.getUTCDay();
      const working = dow >= 1 && dow <= 5 && !isPublicHoliday(key);
      if (e.isHoliday || working) keys.push(key);
      cur = new Date(cur.getTime() + 86_400_000);
    }
    keys.forEach((key, i) => {
      (byDate[key] ||= []).push({
        ...e,
        partOfRange: keys.length > 1,
        isFirst: i === 0,
        isLast: i === keys.length - 1
      });
    });
  }

  // First day of grid: Monday on/before the 1st of the first month.
  // Single month: fixed 6 rows (42 cells). Two months: Monday before the 1st
  // through the Sunday on/after the last day of the second month.
  const first = new Date(Date.UTC(state.year, state.month, 1));
  const dow = (first.getUTCDay() + 6) % 7; // Mon=0
  const gridStart = new Date(first.getTime() - dow * 86_400_000);
  let cellCount = 42;
  if (span > 1) {
    const last = new Date(Date.UTC(lastYear, lastMonth + 1, 0));
    const lastDow = (last.getUTCDay() + 6) % 7;
    const gridEnd = new Date(last.getTime() + (6 - lastDow) * 86_400_000);
    cellCount = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
  }
  const firstKey = toKey(first);
  const lastKey  = toKey(new Date(Date.UTC(lastYear, lastMonth + 1, 0)));

  const todayKey = melDateKey();
  const cells = [];
  for (let i = 0; i < cellCount; i++) {
    const d = new Date(gridStart.getTime() + i * 86_400_000);
    const key = toKey(d);
    const inMonth = key >= firstKey && key <= lastKey;
    // In the 2-month view, label the 1st of each month so the boundary is visible.
    const numLabel = (span > 1 && inMonth && d.getUTCDate() === 1)
      ? `1 ${MONTHS[d.getUTCMonth()].slice(0, 3)}`
      : String(d.getUTCDate());
    const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const isToday = key === todayKey;
    const dayEntries = byDate[key] || [];

    const entriesHtml = dayEntries.map((e, idx) => {
      const cls = `cal-entry ${e.status}${e.partOfRange ? " range" : ""}${e.isFirst ? " first" : ""}${e.isLast ? " last" : ""}`;
      return `<span class="${cls}" data-entry-id="${e.id}" data-entry-idx="${idx}" title="${escapeAttr(e.tooltip || e.label || "")}">${escapeHtml(e.label || "")}</span>`;
    }).join("");

    cells.push(`
      <div class="cal-day ${inMonth ? "" : "other"} ${isWeekend ? "weekend" : ""} ${isToday ? "today" : ""}"
           data-date="${key}">
        <div class="cal-num">${numLabel}</div>
        <div class="cal-entries">${entriesHtml}</div>
      </div>
    `);
  }

  const title = span > 1
    ? `${MONTHS[state.month]} ${state.year} – ${MONTHS[lastMonth]} ${lastYear}`
    : `${MONTHS[state.month]} ${state.year}`;
  const spanBtn = allowSpan
    ? `<button class="ghost cal-nav" data-cal-span title="${span > 1 ? "Show one month" : "Show two months back to back"}">${span > 1 ? "1 month" : "2 months"}</button>`
    : "";
  container.innerHTML = `
    <div class="cal-header">
      <button class="ghost cal-nav" data-cal-prev>‹</button>
      <div class="cal-title">${title}</div>
      ${spanBtn}
      <button class="ghost cal-nav" data-cal-today>Today</button>
      <button class="ghost cal-nav" data-cal-next>›</button>
    </div>
    <div class="cal-dow">${DOW.map(d => `<div>${d}</div>`).join("")}</div>
    <div class="cal-grid">${cells.join("")}</div>
  `;

  container.querySelector("[data-cal-prev]").addEventListener("click", () => {
    const s = container._calState;
    if (s.month === 0) { s.month = 11; s.year--; } else s.month--;
    renderCalendar(container, opts);
  });
  container.querySelector("[data-cal-next]").addEventListener("click", () => {
    const s = container._calState;
    if (s.month === 11) { s.month = 0; s.year++; } else s.month++;
    renderCalendar(container, opts);
  });
  container.querySelector("[data-cal-span]")?.addEventListener("click", () => {
    try { localStorage.setItem(SPAN_KEY, span > 1 ? "1" : "2"); } catch {}
    renderCalendar(container, opts);
  });
  container.querySelector("[data-cal-today]").addEventListener("click", () => {
    const n = new Date();
    container._calState = { year: n.getFullYear(), month: n.getMonth() };
    renderCalendar(container, opts);
  });

  if (onClickEntry) {
    container.querySelectorAll(".cal-entry").forEach(el => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const entryId = el.dataset.entryId;
        const entry = entries.find(e => e.id === entryId);
        if (entry) onClickEntry(entry);
      });
    });
  }
  if (onClickDay) {
    container.querySelectorAll(".cal-day").forEach(el => {
      el.addEventListener("click", () => onClickDay(el.dataset.date));
    });
  }

  // ----- Hover floating tooltip on cal-entry -----
  let tipEl = document.getElementById("calFloatTip");
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.id = "calFloatTip";
    tipEl.className = "float-tip";
    document.body.appendChild(tipEl);
  }
  const STATUS_CLASSES = ["pending", "approved", "denied", "cancelled", "holiday"];
  container.querySelectorAll(".cal-entry").forEach(el => {
    const tooltip = el.getAttribute("title");
    if (!tooltip) return;
    // suppress native browser tooltip
    el.removeAttribute("title");
    el.dataset.tip = tooltip;
    const status = STATUS_CLASSES.find(s => el.classList.contains(s)) || "";
    el.addEventListener("mouseenter", () => {
      const lines = el.dataset.tip.split("\n");
      const head = lines.shift() || "";
      const body = lines.join("\n");
      tipEl.innerHTML = `<div class="tip-head">${escapeHtml(head)}</div>` +
                        (body ? `<div class="tip-body">${escapeHtml(body).replace(/\n/g, "<br>")}</div>` : "");
      STATUS_CLASSES.forEach(s => tipEl.classList.remove("stat-" + s));
      if (status) tipEl.classList.add("stat-" + status);
      tipEl.classList.add("open");
    });
    el.addEventListener("mousemove", (ev) => {
      tipEl.style.left = (ev.clientX + 14) + "px";
      tipEl.style.top  = (ev.clientY + 14) + "px";
    });
    el.addEventListener("mouseleave", () => {
      tipEl.classList.remove("open");
    });
  });
}

function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
