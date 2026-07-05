import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import EmptyState from "../components/EmptyState";
import FreshnessBar from "../components/FreshnessBar";
import LeaderboardTab from "../components/LeaderboardTab";
import SyncGate from "../components/SyncGate";
import TradeGradesTab from "../components/TradeGradesTab";
import {
  Card,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  TabBar,
  type TabBarItem,
} from "../components/ui";
import { useCurrentUsername } from "../hooks/use-current-user";
import { useTradeIntelligenceChains } from "../hooks/use-trade-intelligence";
import { useTradeHistory } from "../hooks/use-trade-history";

const mainTabs = ["Trade Grades", "Leaderboard"] as const;
type MainTab = (typeof mainTabs)[number];
const MAIN_TABS: TabBarItem<MainTab>[] = mainTabs.map((tab) => ({
  key: tab,
  label: tab,
}));

export default function TradeHistory() {
  const { username } = useCurrentUsername();

  return (
    <AppShell>
      <TradeHistoryHeader />
      <SyncGate
        username={username}
        checkingLabel="Checking if trade history data is available..."
        syncingDescription="First-time sync may take a minute. Pulling league and trade data from Sleeper."
      >
        <TradeHistoryReady username={username} />
      </SyncGate>
    </AppShell>
  );
}

function TradeHistoryHeader() {
  return (
    <PageHeader
      title="Trade Execution Tracker"
      subtitle="Win rate and value tracking across all leagues"
      actions={<FreshnessBar />}
    />
  );
}

function TradeHistoryReady({ username }: { username: string }) {
  const { data, isLoading, error } = useTradeHistory(username);
  const chainsQuery = useTradeIntelligenceChains(
    username
  );
  const [activeTab, setActiveTab] = useState<MainTab>("Trade Grades");
  const [selectedChainId, setSelectedChainId] = useState("");
  const [intelLeagueId, setIntelLeagueId] = useState("");

  const chains = useMemo(() => chainsQuery.data ?? [], [chainsQuery.data]);
  const selectedChain = useMemo(
    () => chains.find((chain) => chain.root_id === selectedChainId) ?? null,
    [chains, selectedChainId]
  );
  const selectedSeason = useMemo(
    () =>
      selectedChain?.seasons.find((season) => season.league_id === intelLeagueId) ??
      selectedChain?.seasons[0] ??
      null,
    [selectedChain, intelLeagueId]
  );

  useEffect(() => {
    if (chains.length === 0) {
      if (selectedChainId) setSelectedChainId("");
      return;
    }

    if (!chains.some((chain) => chain.root_id === selectedChainId)) {
      setSelectedChainId(chains[0].root_id);
    }
  }, [chains, selectedChainId]);

  useEffect(() => {
    if (!selectedChain) {
      if (intelLeagueId) setIntelLeagueId("");
      return;
    }

    if (!selectedChain.seasons.some((season) => season.league_id === intelLeagueId)) {
      setIntelLeagueId(selectedChain.seasons[0]?.league_id ?? "");
    }
  }, [selectedChain, intelLeagueId]);

  const intelLeagueName = useMemo(() => {
    if (!selectedChain) return "";
    if (!selectedSeason) return selectedChain.name;
    return `${selectedChain.name} (${selectedSeason.season})`;
  }, [selectedChain, selectedSeason]);

  if (isLoading || chainsQuery.isLoading) {
    return <LoadingSkeleton label="Loading trade history" rows={3} />;
  }

  if (error || chainsQuery.error || !data) {
    return (
      <ErrorState
        title="Could not load trade history"
        message={
          (error as Error)?.message ??
          (chainsQuery.error as Error)?.message ??
          "Unable to load trade history."
        }
      />
    );
  }

  if (data.trades.length === 0) {
    return <EmptyState title="No trades found for this user yet." />;
  }

  if (chains.length === 0) {
    return <EmptyState title="No league chains found for this user yet." />;
  }

  return (
    <>
      <TabBar
        tabs={MAIN_TABS}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="Trade history views"
      />

      <Card
        style={{
          display: "grid",
          gap: 12,
          marginBottom: 20,
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        }}
      >
        <div>
          <div style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>
            LEAGUE
          </div>
          <select
            value={selectedChainId}
            onChange={(event) => {
              const nextRootId = event.target.value;
              const nextChain =
                chains.find((chain) => chain.root_id === nextRootId) ?? null;
              setSelectedChainId(nextRootId);
              setIntelLeagueId(nextChain?.seasons[0]?.league_id ?? "");
            }}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "var(--dark-base)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            {chains.map((chain) => (
              <option key={chain.root_id} value={chain.root_id}>
                {chain.name}
              </option>
            ))}
          </select>
        </div>

        {selectedChain ? (
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>
              YEAR
            </div>
            <select
              value={intelLeagueId}
              onChange={(event) => setIntelLeagueId(event.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--dark-base)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 13,
                fontFamily: "inherit",
              }}
            >
              {selectedChain.seasons.map((season) => (
                <option key={season.league_id} value={season.league_id}>
                  {season.season}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </Card>

      {activeTab === "Trade Grades" && (
        <TradeGradesTab selectedLeagueId={intelLeagueId} leagueName={intelLeagueName} username={username ?? ""} />
      )}

      {activeTab === "Leaderboard" && (
        <LeaderboardTab selectedLeagueId={intelLeagueId} />
      )}
    </>
  );
}
