interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

export default function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "20px 24px",
        flex: 1,
        minWidth: 160,
      }}
    >
      <div className="label" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: accent || "var(--text)",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
