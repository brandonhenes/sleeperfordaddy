import { useState } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import ValueMoversTab from "../components/market/ValueMoversTab";
import { posColor } from "../lib/position-colors";
import {
  useMarketSignals,
  type SignalType,
} from "../hooks/use-market-signals";

type Tab = "movers" | "signals";

const TABS: { key: Tab; label: string }[] = [
  { key: "movers", label: "Value Movers" },
  { key: "signals", label: "Signals" },
];

const SIGNAL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  SMART_MONEY_BUY: { bg: "#16a34a", text: "#fff", label: "Smart Money Buy" },
  HYPE_SELL: { bg: "#dc2626", text: "#fff", label: "Hype Sell" },
  EXPERT_BUY: { bg: "#7c3aed", text: "#fff", label: "Expert Buy" },
  EXPERT_FADE: { bg: "#ea580c", text: "#fff", label: "Expert Fade" },
  CONSENSUS_LOCK: { bg: "#64748b", text: "#fff", label: "Locked Value" },
};

function SignalsTab({ username }: { username: string }) {
  const { data, isLoading } = useMarketSignals(username || undefined);
  const [sigFilter, setSigFilter] = useState<SignalType | null>(null);

  const signals = (data ?? []).filter((s) => !sigFilter || s.signal === sigFilter);
  const counts = {
    smartMoney: (data ?? []).filter((s) => s.signal === "SMART_MONEY_BUY").length,
    hype: (data ?? []).filter((s) => s.signal === "HYPE_SELL").length,
    expert: (data ?? []).filter((s) => s.signal === "EXPERT_BUY").length,
    locked: (data ?? []).filter((s) => s.signal === "CONSENSUS_LOCK").length,
  };

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        Loading signals...
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { key: "SMART_MONEY_BUY" as SignalType, label: "Smart Money", count: counts.smartMoney, color: "#16a34a" },
          { key: "HYPE_SELL" as SignalType, label: "Hype Sell", count: counts.hype, color: "#dc2626" },
          { key: "EXPERT_BUY" as SignalType, label: "Expert Buy", count: counts.expert, color: "#7c3aed" },
          { key: "CONSENSUS_LOCK" as SignalType, label: "Locked", count: counts.locked, color: "#64748b" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setSigFilter(sigFilter === s.key ? null : s.key)}
            style={{
              background: "var(--card)",
              border: sigFilter === s.key ? `2px solid ${s.color}` : "1px solid var(--border)",
              borderRadius: 10,
              padding: "14px 18px",
              flex: 1,
              minWidth: 120,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{s.label}</div>
            <div className="font-mono" style={{ fontSize: 22, fontWeight: 800, color: s.color }}>
              {s.count}
            </div>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        {signals.length} signal{signals.length !== 1 ? "s" : ""}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {signals.map((sig) => {
          const style = SIGNAL_STYLES[sig.signal] ?? SIGNAL_STYLES.CONSENSUS_LOCK;
          return (
            <div
              key={sig.player_id}
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "14px 18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <EdgeScoreBadge score={sig.edge_score} size="md" />
                <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{sig.full_name}</span>
                <span style={{ color: posColor(sig.position), fontWeight: 700, fontSize: 11 }}>
                  {sig.position}
                </span>
                <span
                  className="font-mono"
                  style={{
                    background: style.bg,
                    color: style.text,
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {style.label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                {sig.reason}
              </div>
            </div>
          );
        })}
      </div>
      {signals.length === 0 && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 40,
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          No signals found
        </div>
      )}
    </div>
  );
}

export default function Market() {
  const [activeTab, setActiveTab] = useState<Tab>("movers");
  const { username } = useParams<{ username: string }>();
  const storedUser = typeof window !== "undefined" ? localStorage.getItem("edge_username") ?? "" : "";
  const effectiveUser = username ?? storedUser;

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
        <FreshnessBar />
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
      {activeTab === "movers" && <ValueMoversTab />}
      {activeTab === "signals" && <SignalsTab username={effectiveUser} />}
    </AppShell>
  );
}
