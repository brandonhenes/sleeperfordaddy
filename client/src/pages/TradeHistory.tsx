import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import EmptyState from "../components/EmptyState";
import FreshnessBar from "../components/FreshnessBar";
import LeaderboardTab from "../components/LeaderboardTab";
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
    <AppShell
      requireSync
      syncGate={{
        checkingLabel: "Checking if trade history data is available...",
        syncingDescription: "First-time sync may take a minute. Pulling league and trade data from Sleeper.",
      }}
    >
      <TradeHistoryHeader />
      <TradeHistoryReady username={username} />
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
  const fallbackLeagues = useMemo(() => data?.stats.by_league ?? [], [data?.stats.by_league]);
  const usingFallbackLeagues = chains.length === 0 && fallbackLeagues.length > 0;
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
    if (usingFallbackLeagues) {
      if (!fallbackLeagues.some((league) => league.league_id === intelLeagueId)) {
        setIntelLeagueId(fallbackLeagues[0]?.league_id ?? "");
      }
      return;
    }

    if (!selectedChain) {
      if (intelLeagueId) setIntelLeagueId("");
      return;
    }

    if (!selectedChain.seasons.some((season) => season.league_id === intelLeagueId)) {
      setIntelLeagueId(selectedChain.seasons[0]?.league_id ?? "");
    }
  }, [fallbackLeagues, intelLeagueId, selectedChain, usingFallbackLeagues]);

  const intelLeagueName = useMemo(() => {
    if (usingFallbackLeagues) {
      return fallbackLeagues.find((league) => league.league_id === intelLeagueId)?.league_name ?? "";
    }
    if (!selectedChain) return "";
    if (!selectedSeason) return selectedChain.name;
    return `${selectedChain.name} (${selectedSeason.season})`;
  }, [fallbackLeagues, intelLeagueId, selectedChain, selectedSeason, usingFallbackLeagues]);

  if (isLoading) {
    return <LoadingSkeleton label="Loading trade history" rows={3} />;
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Could not load trade history"
        message={
          (error as Error)?.message ??
          "Unable to load trade history."
        }
      />
    );
  }

  if (data.trades.length === 0) {
    return <EmptyState title="No trades found for this user yet." />;
  }

  if (chainsQuery.error && !usingFallbackLeagues) {
    return (
      <ErrorState
        title="Could not load league filters"
        message={(chainsQuery.error as Error)?.message ?? "Unable to load league history filters."}
      />
    );
  }

  if (chains.length === 0 && !usingFallbackLeagues && !chainsQuery.isLoading) {
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
            value={usingFallbackLeagues ? intelLeagueId : selectedChainId}
            onChange={(event) => {
              if (usingFallbackLeagues) {
                setIntelLeagueId(event.target.value);
                return;
              }
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
            {usingFallbackLeagues
              ? fallbackLeagues.map((league) => (
                <option key={league.league_id} value={league.league_id}>
                  {league.league_name}
                </option>
              ))
              : chains.map((chain) => (
                <option key={chain.root_id} value={chain.root_id}>
                  {chain.name}
                </option>
              ))}
          </select>
          {chainsQuery.isLoading && (
            <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 11 }}>
              Loading league-year history in the background...
            </div>
          )}
        </div>

        {selectedChain && !usingFallbackLeagues ? (
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
