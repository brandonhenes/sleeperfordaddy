import { useState } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";

type Tab = "injuries" | "buying";

export default function InjuryTracker() {
  const { username } = useParams<{ username: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("injuries");

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          Injury Tracker
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Monitor injuries across your portfolio and find buying windows
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {(["injuries", "buying"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? "var(--amber)" : "var(--card)",
              color: activeTab === tab ? "var(--dark-base)" : "var(--text-dim)",
              border: `1px solid ${activeTab === tab ? "var(--amber)" : "var(--border)"}`,
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 0.3,
            }}
          >
            {tab === "injuries" ? "My Injuries" : "Buying Windows"}
          </button>
        ))}
      </div>

      {/* Content area */}
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
        {activeTab === "injuries"
          ? `No injured players found for ${username ?? "user"}`
          : "No buying windows detected"}
      </div>
    </AppShell>
  );
}
