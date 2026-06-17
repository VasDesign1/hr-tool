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

// Pretty hours: 7.6 -> "7h 36m"; 0.633 -> "38m"; 0.005 -> "18s"; 0 -> "0m"
export function fmtHours(hours) {
  if (hours == null || isNaN(hours)) return "—";
  const sign = hours < 0 ? "-" : "";
  const absH = Math.abs(hours);
  if (absH > 0 && absH < 1 / 60) {
    const secs = Math.max(1, Math.round(absH * 3600));
    return `${sign}${secs}s`;
  }
  const totalMins = Math.round(absH * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0 && m === 0) return "0m";
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

// Pretty minutes: 38.5 -> "38m"; 0.5 -> "30s"; 95 -> "1h 35m"
export function fmtMins(mins) {
  if (mins == null || isNaN(mins)) return "—";
  return fmtHours(mins / 60);
}

// Decimal hours between two Date or millis timestamps.
export function hoursBetween(startMs, endMs) {
  return (endMs - startMs) / 3_600_000;
}

// "16 Jun 2026" — short calendar date for stamps/tooltips.
export function fmtDateShort(date) {
  if (!date) return "—";
  const d = (date instanceof Date) ? date : new Date(date);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// "16/06/2026" — Aussie numeric format. Accepts Date or "YYYY-MM-DD".
export function fmtAU(dateOrKey) {
  if (!dateOrKey) return "—";
  if (typeof dateOrKey === "string") {
    const [y, m, d] = dateOrKey.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateOrKey.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// "16/06" — short chart-axis label for tight bars.
export function fmtAUShort(dateKey) {
  if (!dateKey) return "";
  const [, m, d] = dateKey.split("-");
  return `${d}/${m}`;
}

// "Mon 16/06" — weekday + short date, useful for chart axes.
export function fmtAUDow(dateKey) {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.toLocaleDateString("en-AU", { timeZone: "UTC", weekday: "short" });
  return `${dow} ${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}`;
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

// Parse "YYYY-MM-DD" + "HH:MM" wall-clock in Melbourne → UTC millis.
export function parseMelTime(dateKey, timeStr) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, min, 0));
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: MEL_TZ, timeZoneName: "shortOffset" });
  const parts = fmt.formatToParts(guess);
  const off = parts.find(p => p.type === "timeZoneName")?.value || "GMT+10";
  const m2 = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(off);
  let offsetMin = 0;
  if (m2) {
    const sign = m2[1] === "+" ? 1 : -1;
    offsetMin = sign * (parseInt(m2[2], 10) * 60 + parseInt(m2[3] || "0", 10));
  }
  return guess.getTime() - offsetMin * 60_000;
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
