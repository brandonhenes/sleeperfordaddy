interface TrendArrowProps {
  value: number | null | undefined;
}

export default function TrendArrow({ value }: TrendArrowProps) {
  if (value == null || value === 0) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }

  const up = value > 0;

  return (
    <span
      className="font-mono"
      style={{
        color: up ? "var(--green)" : "var(--red)",
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(value)}
    </span>
  );
}
