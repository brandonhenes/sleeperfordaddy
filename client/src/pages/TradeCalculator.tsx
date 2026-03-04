import { useState } from "react";
import AppShell from "../components/AppShell";

export default function TradeCalculator() {
  const [_sideA] = useState<string[]>([]);
  const [_sideB] = useState<string[]>([]);

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          Trade Calculator
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Compare trade values across FantasyCalc, KTC, and Dynasty Process
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 16 }}>
        {/* Side A */}
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 24,
            minHeight: 300,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Side A</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Add players and picks...
          </p>
        </div>

        {/* Side B */}
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 24,
            minHeight: 300,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Side B</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Add players and picks...
          </p>
        </div>
      </div>

      {/* Evaluation result area */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 24,
          marginTop: 16,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Add assets to both sides to see evaluation
      </div>
    </AppShell>
  );
}
