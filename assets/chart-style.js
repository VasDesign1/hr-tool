// Shared vibrant chart styling — vivid solid colors, bottom legend, subtle grid.
// Matches the reference dashboard look the user shared.

import { fmtHours } from "./time.js";

// Vibrant palette — one stable hue per contractor.
// Order matches the dashboard "Today's activity" avatar colours so a contractor
// has the same hue everywhere (avatars, charts, analytics).
export const VIVID_PALETTE = [
  "#14B8A6", // teal
  "#3B82F6", // blue
  "#EAB308", // yellow
  "#EF4444", // red
  "#8B5CF6", // purple
  "#0EA5E9", // sky
  "#15803D", // dark green
  "#F97316", // orange
  "#7E22CE", // dark purple
  "#94A3B8", // slate
];

// Per-contractor stable color
export function colorFor(uid, idx) {
  if (typeof idx === "number") return VIVID_PALETTE[idx % VIVID_PALETTE.length];
  let hash = 0;
  for (let i = 0; i < String(uid).length; i++) hash = (hash * 31 + String(uid).charCodeAt(i)) >>> 0;
  return VIVID_PALETTE[hash % VIVID_PALETTE.length];
}

// Lighter shade for "break" variant of the same hue (#RRGGBB + alpha)
export function lighter(color) { return color + "55"; }

// Convert a bar chart's data shape into pie chart data.
// Multi-dataset → sum each dataset, slice per dataset using its color.
// Single dataset → one slice per label, rainbow from the palette.
export function chartToPieData(barData, palette) {
  palette = palette || VIVID_PALETTE;
  if (barData.datasets.length > 1) {
    return {
      labels: barData.datasets.map(ds => {
        const parts = ds.label.split(" · ");
        return parts.length >= 2 ? `${parts[0]} (${parts[1].split(" ")[0]})` : ds.label;
      }),
      datasets: [{
        data: barData.datasets.map(ds => ds.data.reduce((s, v) => s + (v || 0), 0)),
        backgroundColor: barData.datasets.map(ds => ds.backgroundColor),
        borderColor: "#fff",
        borderWidth: 2
      }]
    };
  }
  return {
    labels: barData.labels,
    datasets: [{
      data: barData.datasets[0].data,
      backgroundColor: barData.labels.map((_, i) => palette[i % palette.length]),
      borderColor: "#fff",
      borderWidth: 2
    }]
  };
}

// Pie chart options matching the vibrant style — right-side legend, percentage tooltips.
export function vividPieOptions({ isCount = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
        labels: {
          boxWidth: 12, boxHeight: 12, padding: 10,
          color: "#334155",
          font: { family: "Inter", size: 12, weight: "500" }
        }
      },
      tooltip: {
        backgroundColor: "#0B1220", padding: 12, cornerRadius: 8,
        titleFont: { family: "Inter", weight: "600", size: 13 },
        bodyFont: { family: "Inter", size: 12 },
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed;
            const total = ctx.dataset.data.reduce((s, x) => s + (x || 0), 0);
            const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0";
            return `${ctx.label}: ${isCount ? v : fmtHours(v)} (${pct}%)`;
          }
        }
      }
    }
  };
}

// True when there is no plottable data — used to show a fallback message instead of an empty pie.
export function isEmptyData(barData) {
  if (!barData?.datasets?.length) return true;
  const total = barData.datasets.reduce((s, ds) => s + ds.data.reduce((a, v) => a + (v || 0), 0), 0);
  return total <= 0.0001;
}

// Tiny pill toggle UI for switching a chart between bar/pie.
// Returns the toolbar element you can insert anywhere in the page.
export function makeChartToggle(initialType = "bar", onChange) {
  const wrap = document.createElement("div");
  wrap.className = "chart-toolbar";
  wrap.innerHTML = `
    <button data-t="bar" class="${initialType === "bar" ? "active" : ""}">Bar</button>
    <button data-t="pie" class="${initialType === "pie" ? "active" : ""}">Pie</button>
  `;
  wrap.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(btn.dataset.t);
    });
  });
  return wrap;
}

// Solid Chart.js dataset style for a Worked / Break pair.
export function workedBreakDatasets({ contractorName, color, workedData, breakData, workedTotal, breakTotal, thickness = 22 }) {
  return [
    {
      label: `${contractorName} · Worked ${fmtHours(workedTotal)}`,
      data: workedData,
      backgroundColor: color,
      borderColor: color,
      borderWidth: 0,
      borderRadius: 2,
      maxBarThickness: thickness
    },
    {
      label: `${contractorName} · Break ${fmtHours(breakTotal)}`,
      data: breakData,
      backgroundColor: lighter(color),
      borderColor: color,
      borderWidth: 0,
      borderRadius: 2,
      maxBarThickness: thickness
    }
  ];
}

// Shared chart options — bottom legend, vibrant tooltip, subtle grid, hour formatting.
// `titleLookup(index)` returns the tooltip title for a given x-index (e.g. "Mon 16/06/2026").
export function vividChartOptions({ yLabel = "Hours", titleLookup, isCount = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: {
        position: "bottom",
        align: "center",
        labels: {
          boxWidth: 12, boxHeight: 12, padding: 12,
          usePointStyle: false,
          color: "#334155",
          font: { family: "Inter", size: 12, weight: "500" },
          // Tidy: "Luis · Worked 7h 6m" → "Luis (Worked)"; single-series → keep name
          generateLabels: (chart) => {
            const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
            items.forEach(it => {
              const parts = it.text.split(" · ");
              if (parts.length >= 2) {
                const series = parts[1].split(" ")[0];
                it.text = `${parts[0]} (${series})`;
              }
            });
            return items;
          }
        }
      },
      tooltip: {
        backgroundColor: "#0B1220",
        padding: 12, cornerRadius: 8,
        titleFont: { family: "Inter", weight: "600", size: 13 },
        bodyFont: { family: "Inter", size: 12 },
        callbacks: {
          title: (items) => titleLookup ? titleLookup(items[0].dataIndex) : items[0].label,
          label: (ctx) => `${ctx.dataset.label.split(" · ")[0]}: ${isCount ? ctx.parsed.y : fmtHours(ctx.parsed.y)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false, drawBorder: false },
        ticks: {
          color: "#475569",
          font: { family: "Inter", size: 11, weight: "500" },
          autoSkip: true, autoSkipPadding: 12, maxRotation: 30
        }
      },
      y: {
        beginAtZero: true,
        grid: { color: "#EEF2F6", drawBorder: false },
        border: { display: false },
        ticks: {
          color: "#64748B",
          font: { family: "Inter", size: 12 },
          callback: (v) => isCount ? v : fmtHours(v)
        },
        title: {
          display: !!yLabel,
          text: yLabel,
          color: "#94A3B8",
          font: { family: "Inter", size: 11, weight: "500" }
        }
      }
    }
  };
}
