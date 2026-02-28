interface SectionHeaderProps {
  icon: string;
  num?: string;
  title: string;
  subtitle?: string;
}

export default function SectionHeader({
  icon,
  num,
  title,
  subtitle,
}: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "32px 0 16px",
        padding: "12px 16px",
        background: "linear-gradient(135deg, var(--dark-base), var(--card))",
        borderRadius: 10,
        borderLeft: "4px solid var(--amber)",
      }}
    >
      {num && (
        <span
          style={{
            fontSize: 11,
            color: "var(--amber)",
            fontWeight: 700,
            letterSpacing: 1.5,
          }}
        >
          {num}
        </span>
      )}
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <div
          style={{
            fontSize: 16,
            color: "var(--text)",
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
