interface AgeCurveData {
  age: number | null;
  position: string;
  score: number;
  zone: string;
  color: string;
  label: string;
  dot_pct: number;
}

const SEGMENT_COLORS = [
  "#3b82f6", // blue - early ascent
  "#22c55e", // green - late ascent
  "#f59e0b", // gold - prime
  "#f97316", // orange - decline
  "#ef4444", // red - cliff
];

export default function AgeScaleBar({ ageCurve }: { ageCurve: AgeCurveData }) {
  const dotLeft = `${Math.max(2, Math.min(98, ageCurve.dot_pct * 100))}%`;

  return (
    <div style={{ width: 120 }}>
      {/* Bar */}
      <div
        style={{
          position: "relative",
          height: 12,
          borderRadius: 6,
          overflow: "visible",
          display: "flex",
        }}
      >
        {SEGMENT_COLORS.map((color, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: color,
              borderRadius:
                i === 0 ? "6px 0 0 6px" : i === 4 ? "0 6px 6px 0" : 0,
            }}
          />
        ))}
        {/* Dot */}
        <div
          style={{
            position: "absolute",
            left: dotLeft,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "white",
            border: "2px solid #1e293b",
            boxShadow: "0 0 3px rgba(0,0,0,0.5)",
          }}
        />
      </div>
      {/* Label */}
      <div
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          marginTop: 3,
          whiteSpace: "nowrap",
        }}
      >
        {ageCurve.age != null
          ? `Age ${ageCurve.age} (${ageCurve.position}) - ${ageCurve.zone} - ${ageCurve.score}/100`
          : "Unknown"}
      </div>
    </div>
  );
}
