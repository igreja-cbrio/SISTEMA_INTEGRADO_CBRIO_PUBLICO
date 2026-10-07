import * as React from "react";













export function gradId(color: string): string {
  return "cg-" + String(color).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}



export const GRADIENT_PALETTE: string[] = [
  "#00B39D", "#3fe3c6", "#00897B", "#7BAEC2", "#70a8b0",
  "#E97A3F", "#f59e0b", "#eab308", "#f97316", "#fbbf24",
  "#3b82f6", "#06b6d4", "#0ea5e9", "#60a5fa",
  "#8b5cf6", "#a855f7", "#a78bfa",
  "#10b981", "#34d399", "#84cc16",
  "#ec4899", "#ef4444", "#f43f5e", "#dc2626",
  "#94a3b8", "#9CA3AF",
];

const REGISTERED_IDS = new Set(GRADIENT_PALETTE.map(gradId));




const GRADIENTS_ATIVOS = true;



export function gradFill(color: string): string {
  if (!color) return color;
  return GRADIENTS_ATIVOS && REGISTERED_IDS.has(gradId(color)) ? `url(#${gradId(color)})` : color;
}



export function GlobalChartGradients() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }}>
      <defs>
        {GRADIENT_PALETTE.map((c) => (
          <linearGradient key={c} id={gradId(c)} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={0.95} />
            <stop offset="100%" stopColor={c} stopOpacity={0.34} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}



export function ChartGradients(_props: { colors?: string[]; vertical?: boolean; from?: number; to?: number }) {
  return null;
}

export default ChartGradients;
