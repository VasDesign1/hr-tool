// Shared vibrant chart styling — vivid solid colors, bottom legend, subtle grid.
// Matches the reference dashboard look the user shared.

import { fmtHours } from "./time.js";

// Vibrant palette — one stable hue per contractor
export const VIVID_PALETTE = [
  "#3B82F6", // blue
  "#14B8A6", // teal
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
          // Strip "· total Xh Ym" from legend labels for tidiness
          generateLabels: (chart) => {
            const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
            items.forEach(it => {
              const idx = it.text.indexOf(" · ");
              if (idx > -1) it.text = it.text.slice(0, idx);
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
