// Victoria public holidays — hardcoded for 2026 and 2027.
// AFL Grand Final Friday omitted because the date depends on the season.

const VIC_HOLIDAYS = [
  // 2026
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-26", name: "Australia Day" },
  { date: "2026-03-09", name: "Labour Day" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-04", name: "Easter Saturday" },
  { date: "2026-04-05", name: "Easter Sunday" },
  { date: "2026-04-06", name: "Easter Monday" },
  { date: "2026-04-25", name: "ANZAC Day" },
  { date: "2026-06-08", name: "King's Birthday" },
  { date: "2026-11-03", name: "Melbourne Cup Day" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-26", name: "Boxing Day" },
  { date: "2026-12-28", name: "Boxing Day (obs.)" },

  // 2027
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-01-26", name: "Australia Day" },
  { date: "2027-03-08", name: "Labour Day" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-03-27", name: "Easter Saturday" },
  { date: "2027-03-28", name: "Easter Sunday" },
  { date: "2027-03-29", name: "Easter Monday" },
  { date: "2027-04-25", name: "ANZAC Day" },
  { date: "2027-04-26", name: "ANZAC Day (obs.)" },
  { date: "2027-06-14", name: "King's Birthday" },
  { date: "2027-11-02", name: "Melbourne Cup Day" },
  { date: "2027-12-25", name: "Christmas Day" },
  { date: "2027-12-27", name: "Christmas Day (obs.)" },
  { date: "2027-12-28", name: "Boxing Day (obs.)" }
];

const holidayMap = new Map(VIC_HOLIDAYS.map(h => [h.date, h.name]));

export function isPublicHoliday(dateKey) {
  return holidayMap.has(dateKey);
}

export function holidayName(dateKey) {
  return holidayMap.get(dateKey) || null;
}

export function holidaysAsCalendarEntries() {
  return VIC_HOLIDAYS.map(h => ({
    id: `hol-${h.date}`,
    startDate: h.date,
    endDate: h.date,
    status: "holiday",
    label: h.name,
    tooltip: `${h.name} (Vic public holiday)`,
    isHoliday: true
  }));
}

export function holidaysBetween(startKey, endKey) {
  return VIC_HOLIDAYS.filter(h => h.date >= startKey && h.date <= endKey);
}

// Holiday dates (as YYYY-MM-DD strings) that fall on a weekday within the range.
// Used in leave-hour preview to show what's auto-skipped.
export function publicHolidaysInRange(startKey, endKey) {
  if (!startKey || !endKey || endKey < startKey) return [];
  const out = [];
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  let cur = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  while (cur <= end) {
    const d = new Date(cur);
    const dow = d.getUTCDay();
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
    if (dow >= 1 && dow <= 5 && isPublicHoliday(key)) out.push(key);
    cur += 86_400_000;
  }
  return out;
}
