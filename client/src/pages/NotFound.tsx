import { Link } from "wouter";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--dark)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <h1
        className="font-mono"
        style={{ fontSize: 48, fontWeight: 800, color: "var(--amber)" }}
      >
        404
      </h1>
      <p style={{ color: "var(--text-muted)" }}>Page not found</p>
      <Link href="/">
        <span
          style={{
            color: "var(--amber)",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Back to The Edge
        </span>
      </Link>
    </div>
  );
}
