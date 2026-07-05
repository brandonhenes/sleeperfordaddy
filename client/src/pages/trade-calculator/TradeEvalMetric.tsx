type EvalMetricProps = {
  label: string;
  value: string;
  color?: string;
};

export function EvalMetric({ label, value, color = "var(--text)" }: EvalMetricProps) {
  return (
    <div style={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: "var(--text-muted)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color, whiteSpace: "normal", overflowWrap: "break-word" }}>
        {value}
      </div>
    </div>
  );
}
