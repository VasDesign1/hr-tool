// Leave maths — single combined pool (annual + personal/carer's).
// Defaults match Vic Air spec: 38h week, 20d/yr, accrual cap.

import { isPublicHoliday } from "./holidays.js";
import { melDateKey } from "./time.js";

export const DAILY_HOURS = 7.6;
export const WEEKLY_HOURS = 38;
export const ENTITLEMENT_DAYS = 20;
export const ENTITLEMENT_HOURS = ENTITLEMENT_DAYS * DAILY_HOURS; // 152
export const HOURS_PER_YEAR = WEEKLY_HOURS * 52;                 // 1976
// Hours of leave accrued per hour worked (legacy ratio — kept for reference).
export const ACCRUAL_RATIO = ENTITLEMENT_HOURS / HOURS_PER_YEAR; // ~0.0769
// Weekly accrual: 152h / 52 weeks = ~2.923h per fully-passed week.
export const WEEKLY_ACCRUAL_HOURS = ENTITLEMENT_HOURS / 52;

// Count working weekdays (Mon–Fri excluding Victoria public holidays).
export function workingDaysBetween(startKey, endKey) {
  if (!startKey || !endKey || endKey < startKey) return 0;
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  let cur = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  let count = 0;
  while (cur <= end) {
    const d = new Date(cur);
    const dow = d.getUTCDay(); // 0=Sun, 6=Sat
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
    if (dow >= 1 && dow <= 5 && !isPublicHoliday(key)) count++;
    cur += 86_400_000;
  }
  return count;
}


// Total hours of leave requested across a date range, honouring half-day toggles.
// Single-day request: EITHER toggle (or both) means half a day — a one-day
// request can never be less than half a day, only the morning/afternoon differs.
export function leaveHoursFor(startKey, endKey, halfDayStart = false, halfDayEnd = false) {
  const days = workingDaysBetween(startKey, endKey);
  let hours = days * DAILY_HOURS;
  if (startKey === endKey) {
    if (halfDayStart || halfDayEnd) hours -= DAILY_HOURS / 2;
  } else {
    if (halfDayStart) hours -= DAILY_HOURS / 2;
    if (halfDayEnd) hours -= DAILY_HOURS / 2;
  }
  return Math.max(0, hours);
}

// Compute leave balance. Four-part model:
//   1. `openingBalanceDays` on the user — the days they walk in with (e.g. Jessie's 8.47).
//   2. Weekly accrual from `accrualStartDate` onward: every COMPLETED Mon–Sun week in which the
//      contractor logged any work adds `WEEKLY_ACCRUAL_HOURS` (~2.923h) to the balance.
//      Weeks where they didn't work at all (e.g. on full-week leave) do NOT accrue.
//   3. Approved leave requests subtract their `hours` from the balance.
//   4. Manual admin adjustments (± hours from leaveLedger/{uid}/entries) add/subtract.
// Returns { opening, accrued, taken, adjusted, balance, hoursWorked, ledger }.
export function computeBalance(timeEntries, approvedLeaveRequests, user, adjustments = []) {
  const openingHours = ((user?.openingBalanceDays) || 0) * DAILY_HOURS;
  const accrualStart = user?.accrualStartDate || null;

  // Per-event ledger so admin can audit every credit + debit going into the balance.
  const ledger = [];
  if (openingHours > 0) {
    ledger.push({
      date: accrualStart || "—",
      kind: "opening",
      hours: openingHours,
      note: "Opening balance"
    });
  }

  let accrued = 0;
  if (accrualStart) {
    // When `accrueAllWeeks` is true, every fully-passed week from accrualStart accrues
    // regardless of whether the contractor had any timesheet entries.
    // Useful when older time-tracking data isn't in the tool yet.
    const forceAccrue = !!user?.accrueAllWeeks;

    const workDates = new Set();
    if (!forceAccrue) {
      for (const e of timeEntries) {
        if (e.hoursWorked && e.hoursWorked > 0) workDates.add(e.date);
      }
    }

    // Anchor on the Monday of the week containing accrualStart
    const [sy, sm, sd] = accrualStart.split("-").map(Number);
    const startMs = Date.UTC(sy, sm - 1, sd);
    const startDow = (new Date(startMs).getUTCDay() + 6) % 7; // Mon=0
    let cursor = startMs - startDow * 86_400_000;

    const todayKey = melDateKey();
    const [ty, tm, td] = todayKey.split("-").map(Number);
    const todayMs = Date.UTC(ty, tm - 1, td);

    // Walk weeks. Only accrue for weeks whose Sunday has fully passed (Sun < today).
    while (cursor + 6 * 86_400_000 < todayMs) {
      let worked = forceAccrue;
      const scanStart = Math.max(cursor, startMs);
      const scanEnd   = cursor + 6 * 86_400_000;
      if (!forceAccrue) {
        for (let d = scanStart; d <= scanEnd; d += 86_400_000) {
          const dt = new Date(d);
          const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;
          if (workDates.has(key)) { worked = true; break; }
        }
      }
      if (worked) {
        accrued += WEEKLY_ACCRUAL_HOURS;
        const monDt = new Date(cursor);
        const monKey = `${monDt.getUTCFullYear()}-${String(monDt.getUTCMonth()+1).padStart(2,"0")}-${String(monDt.getUTCDate()).padStart(2,"0")}`;
        const sunDt = new Date(cursor + 6 * 86_400_000);
        const sunKey = `${sunDt.getUTCFullYear()}-${String(sunDt.getUTCMonth()+1).padStart(2,"0")}-${String(sunDt.getUTCDate()).padStart(2,"0")}`;
        ledger.push({
          date: sunKey,
          kind: "accrual",
          hours: WEEKLY_ACCRUAL_HOURS,
          note: `Week ${monKey} → ${sunKey}${forceAccrue ? " (auto-accrued, no timesheet check)" : ""}`
        });
      }
      cursor += 7 * 86_400_000;
    }
  }

  // Approved-leave debits
  for (const r of approvedLeaveRequests) {
    if (r.hours) {
      const range = r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`;
      ledger.push({
        date: r.startDate,
        kind: "leave",
        hours: -r.hours,
        note: `Leave taken (${range})${r.reason ? " · " + r.reason : ""}`
      });
    }
  }

  // Manual admin adjustments
  let adjusted = 0;
  for (const a of adjustments) {
    if (!a || !a.hours) continue;
    adjusted += a.hours;
    ledger.push({
      date: a.date || "—",
      kind: "adjustment",
      hours: a.hours,
      note: `Adjustment — ${a.reason || "no reason given"}${a.by ? " · by " + a.by : ""}`
    });
  }

  ledger.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  // Annotate running balance for the UI
  let running = 0;
  for (const ev of ledger) {
    running += ev.hours;
    ev.runningHours = running;
  }

  let hoursWorked = 0;
  for (const e of timeEntries) if (e.hoursWorked) hoursWorked += e.hoursWorked;

  let taken = 0;
  for (const r of approvedLeaveRequests) if (r.hours) taken += r.hours;

  const balance = openingHours + accrued + adjusted - taken;

  return {
    opening: openingHours,
    accrued,
    taken,
    adjusted,
    balance,
    hoursWorked,
    rawBalance: balance,
    ledger
  };
}

// Map a leaveLedger/{uid}/entries snapshot to the adjustments array computeBalance expects.
export function adjustmentsFromSnap(snap) {
  const out = [];
  snap.forEach(d => {
    const a = d.data();
    if (a.type !== "adjustment" || !a.hours) return;
    out.push({ date: a.date || "—", hours: a.hours, reason: a.reason || "", by: a.createdBy?.name || "" });
  });
  return out;
}

// Short badge text for a request's half-day selection, or "" if full days.
// Single day: which toggle the contractor picked. Range: which end(s) are half.
export function halfDayLabel(r) {
  if (!r?.halfDayStart && !r?.halfDayEnd) return "";
  if (r.startDate === r.endDate) {
    if (r.halfDayStart && r.halfDayEnd) return "½ day";
    return r.halfDayStart ? "½ day · start of day" : "½ day · end of day";
  }
  const parts = [];
  if (r.halfDayStart) parts.push("first");
  if (r.halfDayEnd) parts.push("last");
  return `½ ${parts.join(" & ")} day`;
}

// "12d 4h" style formatting using a 7.6-hour day.
export function fmtLeave(hours) {
  if (hours == null || isNaN(hours)) return "—";
  if (hours < 0) return "-" + fmtLeave(-hours);
  if (hours < 0.05) return "0d";
  const days = Math.floor(hours / DAILY_HOURS);
  const remH = hours - days * DAILY_HOURS;
  const remHRound = Math.round(remH * 10) / 10;
  if (days === 0) return `${remHRound}h`;
  if (remHRound < 0.05) return `${days}d`;
  return `${days}d ${remHRound}h`;
}
