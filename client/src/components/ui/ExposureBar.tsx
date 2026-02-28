interface ExposureBarProps {
  leagueCount: number;
  totalLeagues: number;
  showLabel?: boolean;
}

export default function ExposureBar({
  leagueCount,
  totalLeagues,
  showLabel = true,
}: ExposureBarProps) {
  const pct = totalLeagues > 0 ? (leagueCount / totalLeagues) * 100 : 0;

  let barColor = "var(--green)";
  if (pct > 33) barColor = "var(--red)";
  else if (pct > 20) barColor = "var(--amber)";

  return (
    <div>
      <div
        style={{
          width: 60,
          height: 6,
          background: "var(--border)",
          borderRadius: 3,
        }}
      >
        <div
          style={{
            width: `${Math.min(pct, 100)}%`,
            height: 6,
            background: barColor,
            borderRadius: 3,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      {showLabel && (
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
