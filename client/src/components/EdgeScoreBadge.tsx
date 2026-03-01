interface EdgeScoreBadgeProps {
  score: number;
  size?: "sm" | "md";
}

function getScoreStyle(score: number): { bg: string; color: string } {
  if (score >= 90) return { bg: "#f59e0b", color: "#000" };
  if (score >= 80) return { bg: "#22c55e", color: "#fff" };
  if (score >= 70) return { bg: "#3b82f6", color: "#fff" };
  if (score >= 60) return { bg: "#64748b", color: "#fff" };
  if (score >= 39) return { bg: "#334155", color: "#94a3b8" };
  return { bg: "#1e293b", color: "#475569" };
}

export default function EdgeScoreBadge({ score, size = "sm" }: EdgeScoreBadgeProps) {
  const { bg, color } = getScoreStyle(score);
  const isSm = size === "sm";

  return (
    <span
      className="font-mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: isSm ? 28 : 36,
        height: isSm ? 20 : 28,
        borderRadius: 5,
        fontSize: isSm ? 11 : 14,
        fontWeight: 700,
        background: bg,
        color,
        lineHeight: 1,
      }}
    >
      {score === 0 ? "\u2014" : score}
    </span>
  );
}
