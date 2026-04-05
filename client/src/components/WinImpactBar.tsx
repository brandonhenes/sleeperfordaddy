interface WinImpactBarProps {
  value: number;
}

function impactColor(value: number): string {
  if (value > 0) return "#22c55e";
  if (value < 0) return "#ef4444";
  return "#94a3b8";
}

function impactLabel(value: number): string {
  if (value > 0) return "Helped";
  if (value < 0) return "Hurt";
  return "Flat";
}

function formatImpact(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export default function WinImpactBar({ value }: WinImpactBarProps) {
  const color = impactColor(value);
  const widthPct = Math.min(100, Math.max(6, Math.abs(value) * 12));

  return (
    <div
      title={`This trade flipped ${Math.abs(value).toFixed(1)} losses into wins (or wins into losses) based on actual weekly matchup scores.`}
      style={{ display: "grid", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>
          {impactLabel(value)}
        </span>
        <span className="font-mono" style={{ fontSize: 12, fontWeight: 800, color }}>
          {formatImpact(value)}
        </span>
      </div>

      <div
        style={{
          position: "relative",
          height: 10,
          borderRadius: 999,
          background: "rgba(15, 23, 42, 0.9)",
          border: "1px solid rgba(51, 65, 85, 0.7)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: "rgba(148, 163, 184, 0.45)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 1,
            bottom: 1,
            borderRadius: 999,
            background: color,
            opacity: value === 0 ? 0.55 : 0.9,
            width: `${widthPct / 2}%`,
            left: value >= 0 ? "50%" : `calc(50% - ${widthPct / 2}%)`,
          }}
        />
      </div>
    </div>
  );
}
