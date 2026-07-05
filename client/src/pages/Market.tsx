import { useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import AppShell from "../components/AppShell";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import FreshnessBar from "../components/FreshnessBar";
import ArbitrageContent from "../components/free-agents/ArbitrageContent";
import WaiverContent from "../components/free-agents/WaiverContent";
import ValueMoversTab from "../components/market/ValueMoversTab";
import { PageHeader, TabBar, type TabBarItem } from "../components/ui";
import { readStoredUsername } from "../lib/current-user";
import { posColor } from "../lib/position-colors";
import {
  useMarketSignals,
  type SignalType,
} from "../hooks/use-market-signals";

type Tab = "movers" | "signals" | "free-agents";
type FreeAgentTab = "arbitrage" | "waivers";

const TABS: TabBarItem<Tab>[] = [
  { key: "movers", label: "Movers" },
  { key: "signals", label: "Signals" },
  { key: "free-agents", label: "Free Agents" },
];

const FREE_AGENT_TABS: TabBarItem<FreeAgentTab>[] = [
  { key: "arbitrage", label: "Cross-League" },
  { key: "waivers", label: "Waiver Wire" },
];

const SIGNAL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  SMART_MONEY_BUY: { bg: "#16a34a", text: "#fff", label: "Smart Money Buy" },
  HYPE_SELL: { bg: "#dc2626", text: "#fff", label: "Hype Sell" },
  EXPERT_BUY: { bg: "#7c3aed", text: "#fff", label: "Expert Buy" },
  EXPERT_FADE: { bg: "#ea580c", text: "#fff", label: "Expert Fade" },
  CONSENSUS_LOCK: { bg: "#64748b", text: "#fff", label: "Locked Value" },
};

function parseTab(search: string): Tab {
  const tab = new URLSearchParams(search).get("tab");
  return tab === "signals" || tab === "free-agents" ? tab : "movers";
}

function parseFreeAgentTab(search: string): FreeAgentTab {
  const tab = new URLSearchParams(search).get("fa");
  return tab === "waivers" ? "waivers" : "arbitrage";
}

function pathFromLocation(location: string): string {
  return location.split("?")[0] || "/market";
}

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
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                <EdgeScoreBadge score={sig.edge_score} size="md" />
                <span style={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 140 }}>{sig.full_name}</span>
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

function FreeAgentsPanel({
  username,
  active,
  onChange,
}: {
  username: string;
  active: FreeAgentTab;
  onChange: (tab: FreeAgentTab) => void;
}) {
  return (
    <>
      <div className="edge-subtabbar" role="tablist" aria-label="Free agent views">
        {FREE_AGENT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`edge-subtab ${active === tab.key ? "active" : ""}`}
            onClick={() => onChange(tab.key)}
            role="tab"
            aria-selected={active === tab.key}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active === "arbitrage" && <ArbitrageContent username={username} />}
      {active === "waivers" && <WaiverContent username={username} />}
    </>
  );
}

export default function Market() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const { username } = useParams<{ username: string }>();
  const effectiveUser = username ?? readStoredUsername();
  const activeTab = parseTab(search);
  const activeFreeAgentTab = parseFreeAgentTab(search);

  function updateTab(tab: Tab) {
    const params = new URLSearchParams(search);
    params.set("tab", tab);
    if (tab !== "free-agents") params.delete("fa");
    setLocation(`${pathFromLocation(location)}?${params.toString()}`);
  }

  function updateFreeAgentTab(tab: FreeAgentTab) {
    const params = new URLSearchParams(search);
    params.set("tab", "free-agents");
    params.set("fa", tab);
    setLocation(`${pathFromLocation(location)}?${params.toString()}`);
  }

  return (
    <AppShell>
      <PageHeader
        title="Market"
        subtitle="Movers, signals, and free-agent angles in one place."
        actions={<FreshnessBar />}
      />

      <TabBar tabs={TABS} active={activeTab} onChange={updateTab} ariaLabel="Market views" />

      {activeTab === "movers" && <ValueMoversTab />}
      {activeTab === "signals" && <SignalsTab username={effectiveUser} />}
      {activeTab === "free-agents" && (
        <FreeAgentsPanel
          username={effectiveUser}
          active={activeFreeAgentTab}
          onChange={updateFreeAgentTab}
        />
      )}
    </AppShell>
  );
}
