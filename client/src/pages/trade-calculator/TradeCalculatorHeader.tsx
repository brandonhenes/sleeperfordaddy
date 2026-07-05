import FreshnessBar from "../../components/FreshnessBar";
import type { TradeValuationProfile } from "@shared/types";

const VALUATION_PROFILE_OPTIONS: Array<{
  value: TradeValuationProfile;
  label: string;
  desc: string;
}> = [
  { value: "ktc_league", label: "KTC League", desc: "KTC values with this league's scoring context" },
  { value: "composite", label: "Composite", desc: "Current FC/KTC/DP league-aware model" },
  { value: "ktc", label: "KTC", desc: "Raw KTC values plus package context" },
];

type TradeCalculatorHeaderProps = {
  showRedraft: boolean;
  onToggleRedraft: () => void;
  valuationMode: TradeValuationProfile;
  onValuationModeChange: (mode: TradeValuationProfile) => void;
  selectedLeague: string;
};

export default function TradeCalculatorHeader({
  showRedraft,
  onToggleRedraft,
  valuationMode,
  onValuationModeChange,
  selectedLeague,
}: TradeCalculatorHeaderProps) {
  return (
    <div style={{ padding: "28px 0 8px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Calculator</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
        Click your roster and your opponent roster. Evaluation and acceptance update live.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <button
          type="button"
          onClick={onToggleRedraft}
          style={{
            borderRadius: 999,
            padding: "7px 12px",
            border: `1px solid ${showRedraft ? "#60a5fa" : "var(--border)"}`,
            background: showRedraft ? "rgba(96,165,250,0.14)" : "transparent",
            color: showRedraft ? "#93c5fd" : "var(--text-muted)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {showRedraft ? "Redraft On" : "Redraft Off"}
        </button>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {VALUATION_PROFILE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onValuationModeChange(option.value)}
              title={option.desc}
              style={{
                borderRadius: 999,
                padding: "7px 12px",
                border: `1px solid ${valuationMode === option.value ? "var(--amber)" : "var(--border)"}`,
                background: valuationMode === option.value ? "rgba(245,158,11,0.12)" : "transparent",
                color: valuationMode === option.value ? "var(--amber)" : "var(--text-muted)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <FreshnessBar leagueId={selectedLeague || undefined} />
    </div>
  );
}
