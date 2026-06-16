// Shared time helpers — Melbourne is the official clock; contractor's local just for display.

export const MEL_TZ = "Australia/Melbourne";

// "YYYY-MM-DD" in Melbourne for a given Date (or now).
export function melDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEL_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const m = {};
  parts.forEach(p => m[p.type] = p.value);
  return `${m.year}-${m.month}-${m.day}`;
}

// "HH:MM:SS" in Melbourne for a given Date.
export function melClock(date = new Date()) {
  return date.toLocaleTimeString("en-AU", {
    timeZone: MEL_TZ, hour12: false
  });
}

// User's browser local clock.
export function localClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour12: false });
}

// Pretty hours: 7.6 -> "7h 36m"
export function fmtHours(hours) {
  if (hours == null || isNaN(hours)) return "—";
  const totalMins = Math.round(hours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Decimal hours between two Date or millis timestamps.
export function hoursBetween(startMs, endMs) {
  return (endMs - startMs) / 3_600_000;
}

// Pretty day label: "Mon 16 Jun" in Melbourne.
export function fmtDay(dateKey) {
  // dateKey is "YYYY-MM-DD" interpreted as Melbourne local — show as a label.
  const [y, m, d] = dateKey.split("-").map(Number);
  // Build a Date that represents that calendar day; using UTC midnight is fine for display.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-AU", {
    weekday: "short", day: "2-digit", month: "short", timeZone: "UTC"
  });
}

// "08:34" Melbourne for a given Date.
export function melTimeShort(date) {
  return date.toLocaleTimeString("en-AU", {
    timeZone: MEL_TZ, hour: "2-digit", minute: "2-digit", hour12: false
  });
}

// dateKeys for last N days including today, ordered newest-first.
export function lastNDateKeys(n) {
  const out = [];
  const todayKey = melDateKey();
  let [y, m, d] = todayKey.split("-").map(Number);
  let dt = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < n; i++) {
    const k = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    out.push(k);
    dt = new Date(dt.getTime() - 86_400_000);
  }
  return out;
}
