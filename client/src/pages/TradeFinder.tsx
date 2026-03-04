import { useState } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";

export default function TradeFinder() {
  const { username } = useParams<{ username: string }>();
  const [_selectedLeague] = useState<string>("");

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          Trade Finder
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          AI-suggested trades based on roster composition, needs, and value arbitrage
        </p>
      </div>

      {/* League selector placeholder */}
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
          Select a league to find trade opportunities for {username}...
        </span>
      </div>

      {/* Trade suggestions placeholder */}
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
        }}
      >
        Select a league above to see trade suggestions
      </div>
    </AppShell>
  );
}
