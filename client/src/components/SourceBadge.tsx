interface SourceBadgeProps {
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
  maxSources?: number;
}

export default function SourceBadge({ fc_score, ktc_score, dp_score, sources_available, source_agreement, maxSources = 3 }: SourceBadgeProps) {
  const n = sources_available;
  const warn = source_agreement === "low";
  const thirdLabel = maxSources === 2 ? "DP" : "FP";
  const sources = [
    { key: "FC", score: fc_score, color: "#3b82f6" },
    { key: "KTC", score: ktc_score, color: "#22c55e" },
    { key: thirdLabel, score: dp_score, color: "#f59e0b" },
  ].slice(0, maxSources);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }} title={`${n}/${maxSources} sources${warn ? " (low agreement)" : ""}`}>
      {sources.map((s) => (
        <span
          key={s.key}
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 4px",
            borderRadius: 3,
            color: s.score != null ? s.color : "var(--text-muted)",
            opacity: s.score != null ? 1 : 0.3,
            background: s.score != null
              ? `color-mix(in srgb, ${s.color} 15%, transparent)`
              : "transparent",
          }}
        >
          {s.key}
        </span>
      ))}
      {warn && <span style={{ color: "var(--red)", fontSize: 10, marginLeft: 1 }}>!</span>}
    </div>
  );
}
