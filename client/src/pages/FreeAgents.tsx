import { useState } from "react";
import AppShell from "../components/AppShell";
import { ArbitrageContent } from "./Arbitrage";
import { WaiverContent } from "./WaiverWire";

type Tab = "arbitrage" | "waivers";

export default function FreeAgents() {
  const [tab, setTab] = useState<Tab>("arbitrage");

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Free Agents</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Cross-league arbitrage and league waiver wire
        </p>
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        {([
          { key: "arbitrage" as Tab, label: "Cross-League Arbitrage" },
          { key: "waivers" as Tab, label: "Waiver Wire" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: tab === t.key ? "2px solid var(--amber)" : "2px solid transparent",
              color: tab === t.key ? "var(--amber)" : "var(--text-muted)",
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 0.3,
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "arbitrage" && <ArbitrageContent />}
      {tab === "waivers" && <WaiverContent />}
    </AppShell>
  );
}
