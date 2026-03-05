import { Link } from "wouter";

interface EmptyStateProps {
  title: string;
  action?: string;
  actionLink?: string;
}

export default function EmptyState({ title, action, actionLink }: EmptyStateProps) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "56px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ color: "var(--text-muted)", fontSize: 15, fontWeight: 500 }}>
        {title}
      </div>
      {action && actionLink && (
        <Link href={actionLink}>
          <button
            style={{
              marginTop: 16,
              padding: "8px 20px",
              background: "var(--amber)",
              color: "var(--dark-base)",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {action}
          </button>
        </Link>
      )}
    </div>
  );
}
