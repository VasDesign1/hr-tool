// Leave maths — single combined pool (annual + personal/carer's).
// Defaults match Vic Air spec: 38h week, 20d/yr, accrual cap.

export const DAILY_HOURS = 7.6;
export const WEEKLY_HOURS = 38;
export const ENTITLEMENT_DAYS = 20;
export const ENTITLEMENT_HOURS = ENTITLEMENT_DAYS * DAILY_HOURS; // 152
export const HOURS_PER_YEAR = WEEKLY_HOURS * 52;                 // 1976
// Hours of leave accrued per hour worked (Australian standard 4 weeks / year basis).
export const ACCRUAL_RATIO = ENTITLEMENT_HOURS / HOURS_PER_YEAR; // ~0.0769

// Count weekdays (Mon–Fri) between two YYYY-MM-DD strings inclusive.
// TODO Slice 6: subtract Victoria public holidays.
export function workingDaysBetween(startKey, endKey) {
  if (!startKey || !endKey || endKey < startKey) return 0;
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  let cur = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  let count = 0;
  while (cur <= end) {
    const dow = new Date(cur).getUTCDay(); // 0=Sun, 6=Sat
    if (dow >= 1 && dow <= 5) count++;
    cur += 86_400_000;
  }
  return count;
}

// Total hours of leave requested across a date range, honouring half-day toggles.
export function leaveHoursFor(startKey, endKey, halfDayStart = false, halfDayEnd = false) {
  const days = workingDaysBetween(startKey, endKey);
  let hours = days * DAILY_HOURS;
  if (halfDayStart) hours -= DAILY_HOURS / 2;
  if (halfDayEnd && startKey !== endKey) hours -= DAILY_HOURS / 2;
  return Math.max(0, hours);
}

// Compute live balance from raw history. Slow at huge scale; fine for 6 users.
// Returns { accrued, taken, balance, hoursWorked }.
export function computeBalance(timeEntries, approvedLeaveRequests) {
  let hoursWorked = 0;
  for (const e of timeEntries) {
    if (e.hoursWorked) hoursWorked += e.hoursWorked;
  }
  const accrued = hoursWorked * ACCRUAL_RATIO;
  let taken = 0;
  for (const r of approvedLeaveRequests) {
    if (r.hours) taken += r.hours;
  }
  const rawBalance = accrued - taken;
  const balance = Math.min(rawBalance, ENTITLEMENT_HOURS);
  return { accrued, taken, balance, hoursWorked, rawBalance };
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
