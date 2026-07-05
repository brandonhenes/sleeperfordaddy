import type { TradeHealthWarning } from "@shared/types";

export function fairnessLabel(fairness: string): string {
  if (fairness === "fair") return "FAIR";
  if (fairness === "slight_edge") return "SLIGHT EDGE";
  return "LOPSIDED";
}

export function formatTradeValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString();
}

export function formatSignedTradeValue(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatTradeValue(value)}`;
}

export function acceptanceColor(label: string): string {
  if (label === "Likely") return "var(--green)";
  if (label === "Possible") return "var(--warning)";
  if (label === "Unlikely") return "#f97316";
  return "var(--red)";
}

export function warningColors(type: TradeHealthWarning["type"]) {
  if (type === "block") {
    return {
      background: "rgba(239,68,68,0.12)",
      border: "1px solid rgba(239,68,68,0.28)",
      color: "#fca5a5",
      label: "#f87171",
    };
  }
  return {
    background: "rgba(245,158,11,0.12)",
    border: "1px solid rgba(245,158,11,0.28)",
    color: "#fcd34d",
    label: "#fbbf24",
  };
}

export function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
