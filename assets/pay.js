// Pay helpers — monthly cycle, AUD formatting, CSV export for the HR company.

import { melDateKey } from "./time.js";

// Calendar-month period (1st → last day) for a given YYYY-MM-DD key.
// Slice 6 will add a configurable anchor day.
export function currentPeriodFor(dateKey) {
  const [y, m] = dateKey.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, year: y, month: m };
}

export function shiftPeriod(periodStart, deltaMonths) {
  const [y, m] = periodStart.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return currentPeriodFor(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`);
}

export function periodLabel(period) {
  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  return `${months[period.month - 1]} ${period.year}`;
}

export function periodIdFor(uid, period) {
  return `${uid}_${period.year}-${String(period.month).padStart(2, "0")}`;
}

export function fmtAUD(amount) {
  if (amount == null || isNaN(amount)) return "—";
  return "$" + Number(amount).toLocaleString("en-AU", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

// CSV escaping per RFC 4180.
function csvCell(s) {
  const v = String(s ?? "");
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function buildPayrollCsv(rows, period) {
  const header = ["Name", "Email", "Period Start", "Period End", "Hours Worked", "Gross AUD", "Status"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      r.name,
      r.email,
      period.start,
      period.end,
      r.hoursWorked.toFixed(2),
      r.grossAmount.toFixed(2),
      r.status
    ].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
