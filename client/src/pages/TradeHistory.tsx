import { useMemo, useState } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import EmptyState from "../components/EmptyState";
import FreshnessBar from "../components/FreshnessBar";
import LeaderboardTab from "../components/LeaderboardTab";
import TradeGradesTab from "../components/TradeGradesTab";
import { useEnsureUser } from "../hooks/use-ensure-user";
import { useTradeHistory } from "../hooks/use-trade-history";

const mainTabs = ["Trade Grades", "Leaderboard"] as const;
type MainTab = (typeof mainTabs)[number];

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
} as const;

export default function TradeHistory() {
  const { username } = useParams<{ username: string }>();
  const { phase, syncProgress, errorMsg, retry } = useEnsureUser(username);
  const { data, isLoading, error } = useTradeHistory(phase === "ready" ? username : undefined);
  const [activeTab, setActiveTab] = useState<MainTab>("Trade Grades");
  const [intelLeagueId, setIntelLeagueId] = useState("");

  const leagueOptions = useMemo(() => data?.stats.by_league ?? [], [data?.stats.by_league]);

  const intelLeagueName = useMemo(() => {
    if (!intelLeagueId) return "";
    const match = leagueOptions.find((l) => l.league_id === intelLeagueId);
    return match?.league_name ?? "";
  }, [intelLeagueId, leagueOptions]);

  if (phase === "checking" || phase === "syncing") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
        </div>
        <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--amber)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span className="animate-pulse">.</span>
            {phase === "checking"
              ? `Looking up ${username}...`
              : `Syncing ${username}'s leagues${syncProgress ? ` (${syncProgress.done}/${syncProgress.total})` : "..."}`}
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
            {phase === "syncing"
              ? "First-time sync may take a minute. Pulling league and trade data from Sleeper."
              : "Checking if trade history data is available..."}
          </p>
        </div>
      </AppShell>
    );
  }

  if (phase === "error") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
        </div>
        <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--red)", fontSize: 14, margin: 0 }}>
            {errorMsg || "Something went wrong."}
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              marginTop: 16,
              background: "linear-gradient(135deg, var(--amber), var(--amber-dark))",
              color: "var(--dark-base)",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Try Again
          </button>
        </div>
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
        </div>
        <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center", color: "var(--amber)" }}>
          <span className="animate-pulse">Loading trade history...</span>
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
        </div>
        <div style={{ ...cardStyle, padding: "32px 24px", color: "var(--red)", fontSize: 14 }}>
          {(error as Error)?.message ?? "Unable to load trade history."}
        </div>
      </AppShell>
    );
  }

  if (data.trades.length === 0) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Win rate and value tracking across all leagues
          </p>
          <FreshnessBar />
        </div>
        <EmptyState title="No trades found for this user yet." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Win rate and value tracking across all leagues
        </p>
        <FreshnessBar />
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
        {mainTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--green)" : "2px solid transparent",
              color: activeTab === tab ? "var(--text)" : "var(--text-muted)",
              fontSize: 14,
              fontWeight: activeTab === tab ? 700 : 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        <select
          value={intelLeagueId}
          onChange={(event) => setIntelLeagueId(event.target.value)}
          style={{
            padding: "10px 12px",
            background: "var(--dark-base)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          <option value="">Select League</option>
          {leagueOptions.map((league) => (
            <option key={league.league_id} value={league.league_id}>{league.league_name}</option>
          ))}
        </select>
      </div>

      {activeTab === "Trade Grades" && (
        <TradeGradesTab selectedLeagueId={intelLeagueId} leagueName={intelLeagueName} username={username ?? ""} />
      )}

      {activeTab === "Leaderboard" && (
        <LeaderboardTab selectedLeagueId={intelLeagueId} />
      )}
    </AppShell>
  );
}
