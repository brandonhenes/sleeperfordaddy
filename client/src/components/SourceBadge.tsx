import { useState } from "react";

interface SourceBadgeProps {
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
  maxSources?: number;
}

export default function SourceBadge({ fc_score, ktc_score, dp_score, sources_available, source_agreement, maxSources = 3 }: SourceBadgeProps) {
  const [showDetail, setShowDetail] = useState(false);
  const n = sources_available;
  const color = n >= 3 ? "var(--green)" : n === 2 ? "var(--amber)" : "var(--text-muted)";
  const warn = source_agreement === "low";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail); }}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          fontSize: 10, fontWeight: 700, color, fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 2,
        }}
      >
        {n}/{maxSources}{warn && <span style={{ color: "var(--red)", marginLeft: 2 }}>!</span>}
      </button>
      {showDetail && (
        <div style={{
          position: "absolute", right: 0, top: 18, background: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px",
          fontSize: 10, whiteSpace: "nowrap", zIndex: 10, color: "var(--text-dim)",
        }}>
          {fc_score != null && <div>FC: {fc_score}</div>}
          {ktc_score != null && <div>KTC: {ktc_score}</div>}
          {dp_score != null && <div>DP: {dp_score}</div>}
          {n === 0 && <div>No data</div>}
        </div>
      )}
    </div>
  );
}
