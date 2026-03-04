import { useState } from "react";
import AppShell from "../components/AppShell";

export default function LeagueHistory() {
  const [_selectedGroup] = useState<string>("");

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          League History
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Track team value, records, and trends across seasons
        </p>
      </div>

      {/* League group selector placeholder */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 16,
          marginTop: 16,
        }}
      >
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Select a league group...
        </span>
      </div>

      {/* Chart area placeholder */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 40,
          marginTop: 16,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
          minHeight: 300,
        }}
      >
        Select a league group to see historical trends
      </div>

      {/* Season table placeholder */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 24,
          marginTop: 16,
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Season-by-season breakdown will appear here
      </div>
    </AppShell>
  );
}
