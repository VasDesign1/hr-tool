// Reusable month-view calendar. Mon-first (Australian convention).
// State is kept on the container element via dataset.

import { melDateKey } from "./time.js";

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
  const { entries = [], onClickDay, onClickEntry } = opts;

  // Group entries by date for fast lookup, expanding multi-day to each weekday
  const byDate = {};
  for (const e of entries) {
    let cur = parseKey(e.startDate);
    const end = parseKey(e.endDate);
    let pos = 0;
    const dayCount = daysBetween(e.startDate, e.endDate);
    while (cur <= end) {
      const key = toKey(cur);
      (byDate[key] ||= []).push({
        ...e,
        partOfRange: dayCount > 1,
        isFirst: pos === 0,
        isLast: cur.getTime() === end.getTime()
      });
      cur = new Date(cur.getTime() + 86_400_000);
      pos++;
    }
  }

  // First day of grid: Monday on/before the 1st
  const first = new Date(Date.UTC(state.year, state.month, 1));
  const dow = (first.getUTCDay() + 6) % 7; // Mon=0
  const gridStart = new Date(first.getTime() - dow * 86_400_000);

  const todayKey = melDateKey();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getTime() + i * 86_400_000);
    const key = toKey(d);
    const inMonth = d.getUTCMonth() === state.month;
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
        <div class="cal-num">${d.getUTCDate()}</div>
        <div class="cal-entries">${entriesHtml}</div>
      </div>
    `);
  }

  container.innerHTML = `
    <div class="cal-header">
      <button class="ghost cal-nav" data-cal-prev>‹</button>
      <div class="cal-title">${MONTHS[state.month]} ${state.year}</div>
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
function daysBetween(startKey, endKey) {
  const s = parseKey(startKey).getTime();
  const e = parseKey(endKey).getTime();
  return Math.round((e - s) / 86_400_000) + 1;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
