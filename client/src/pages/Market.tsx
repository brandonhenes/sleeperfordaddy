import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import AppShell from "../components/AppShell";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import FreshnessBar from "../components/FreshnessBar";
import ArbitrageContent from "../components/free-agents/ArbitrageContent";
import WaiverContent from "../components/free-agents/WaiverContent";
import ValueMoversTab from "../components/market/ValueMoversTab";
import {
  Card,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  PositionBadge,
  SegmentedControl,
  TabBar,
  type SegmentedControlItem,
  type TabBarItem,
} from "../components/ui";
import { useCurrentUsername } from "../hooks/use-current-user";
import {
  useMarketSignals,
} from "../hooks/use-market-signals";
import type { SignalType } from "@shared/types";

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
  const { data, isLoading, error } = useMarketSignals(username || undefined);
  const [sigFilter, setSigFilter] = useState<SignalType | null>(null);

  const signals = (data ?? []).filter((s) => !sigFilter || s.signal === sigFilter);
  const counts = {
    smartMoney: (data ?? []).filter((s) => s.signal === "SMART_MONEY_BUY").length,
    hype: (data ?? []).filter((s) => s.signal === "HYPE_SELL").length,
    expert: (data ?? []).filter((s) => s.signal === "EXPERT_BUY").length,
    locked: (data ?? []).filter((s) => s.signal === "CONSENSUS_LOCK").length,
  };
  const signalFilters: SegmentedControlItem<SignalType>[] = [
    { key: "SMART_MONEY_BUY", label: "Smart Money", description: counts.smartMoney },
    { key: "HYPE_SELL", label: "Hype Sell", description: counts.hype },
    { key: "EXPERT_BUY", label: "Expert Buy", description: counts.expert },
    { key: "CONSENSUS_LOCK", label: "Locked", description: counts.locked },
  ];

  if (isLoading) {
    return <LoadingSkeleton label="Loading market signals" rows={4} />;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load market signals"
        message={(error as Error).message}
      />
    );
  }

  return (
    <div>
      <SegmentedControl
        items={signalFilters}
        value={sigFilter}
        onChange={(next) => setSigFilter((current) => current === next ? null : next)}
        ariaLabel="Signal filter"
      />

      <div style={{ fontSize: 12, color: "var(--text-dim)", margin: "14px 0 10px" }}>
        {signals.length} signal{signals.length !== 1 ? "s" : ""}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {signals.map((sig) => {
          const style = SIGNAL_STYLES[sig.signal] ?? SIGNAL_STYLES.CONSENSUS_LOCK;
          return (
            <Card
              key={sig.player_id}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                <EdgeScoreBadge score={sig.edge_score} size="md" />
                <span style={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 140 }}>{sig.full_name}</span>
                <PositionBadge position={sig.position} />
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
            </Card>
          );
        })}
      </div>
      {signals.length === 0 && (
        <Card className="edge-state-card">
          <p>No signals found.</p>
        </Card>
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
  const { username: effectiveUser } = useCurrentUsername();
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
    <AppShell requireSync>
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
