import { useState } from "react";
import AppShell from "../components/AppShell";
import RecommendationsTab from "../components/market/RecommendationsTab";
import ProspectBoardTab from "../components/market/ProspectBoardTab";
import ValueMoversTab from "../components/market/ValueMoversTab";

type Tab = "recs" | "prospects" | "movers";

const TABS: { key: Tab; label: string }[] = [
  { key: "recs", label: "Buy / Sell / Hold" },
  { key: "prospects", label: "Prospect Board" },
  { key: "movers", label: "Value Movers" },
];

export default function Market() {
  const [activeTab, setActiveTab] = useState<Tab>("recs");

  return (
    <AppShell>
      {/* Header */}
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          Market Intelligence
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Dynasty Daily's data, interactive
        </p>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom:
                activeTab === tab.key
                  ? "2px solid var(--amber)"
                  : "2px solid transparent",
              color:
                activeTab === tab.key ? "var(--amber)" : "var(--text-muted)",
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 0.3,
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "recs" && <RecommendationsTab />}
      {activeTab === "prospects" && <ProspectBoardTab />}
      {activeTab === "movers" && <ValueMoversTab />}
    </AppShell>
  );
}
