import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import AppShell from "../components/AppShell";
import EmptyState from "../components/EmptyState";
import FreshnessBar from "../components/FreshnessBar";
import TradeCard from "../components/TradeCard";
import { SectionHeader, StatCard } from "../components/ui";
import { useEnsureUser } from "../hooks/use-ensure-user";
import { usePowerRankings } from "../hooks/use-power-rankings";
import {
  useTradeIntelligenceLeaderboard,
  useTradeIntelligenceLeague,
  useTradeIntelligenceTradeDetail,
  useTradeIntelligenceUserTrades,
} from "../hooks/use-trade-intelligence";
import type {
  OwnerProfile,
  TradeIntelligenceRoster,
  TradeOutcome,
  TradeOutcomeSeason,
} from "../../../shared/types";

type TabKey = "grades" | "leaderboard" | "my-trades";
type LeaderboardSortKey =
  | "display_name"
  | "total_trades"
  | "trade_win_rate_impact"
  | "cumulative_win_impact"
  | "trade_win_rate_value"
  | "soft_target_score";

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
} as const;

const selectStyle = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--dark-base)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
} as const;

function formatSigned(value: number, suffix = ""): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function buildRosterNameMap(rosters: TradeIntelligenceRoster[] | undefined) {
  return new Map<number, string>(
    (rosters ?? []).map((roster) => [roster.roster_id, roster.display_name])
  );
}

function averageWinImpact(outcomes: TradeOutcome[] | undefined): number {
  if (!outcomes || outcomes.length === 0) return 0;
  return outcomes.reduce((sum, outcome) => sum + outcome.win_impact, 0) / outcomes.length;
}

function getTradeKey(outcome: TradeOutcome): string {
  return `${outcome.league_id}:${outcome.trade_id}:${outcome.id}`;
}

function getPositionPillColor(position: string): { background: string; color: string; border: string } {
  const colors: Record<string, { background: string; color: string; border: string }> = {
    QB: { background: "rgba(96, 165, 250, 0.14)", color: "#93c5fd", border: "rgba(96, 165, 250, 0.3)" },
    RB: { background: "rgba(34, 197, 94, 0.14)", color: "#4ade80", border: "rgba(34, 197, 94, 0.3)" },
    WR: { background: "rgba(249, 115, 22, 0.14)", color: "#fb923c", border: "rgba(249, 115, 22, 0.3)" },
    TE: { background: "rgba(168, 85, 247, 0.14)", color: "#c084fc", border: "rgba(168, 85, 247, 0.3)" },
  };
  return (
    colors[position] ?? {
      background: "rgba(148, 163, 184, 0.14)",
      color: "#cbd5e1",
      border: "rgba(148, 163, 184, 0.28)",
    }
  );
}

function sortProfiles(
  profiles: OwnerProfile[],
  key: LeaderboardSortKey,
  direction: "asc" | "desc"
) {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...profiles].sort((left, right) => {
    if (key === "display_name") {
      return left.display_name.localeCompare(right.display_name) * multiplier;
    }

    const leftValue = left[key];
    const rightValue = right[key];
    return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * multiplier;
  });
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center", color: "var(--amber)" }}>
      <span className="animate-pulse">{label}</span>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div style={{ ...cardStyle, padding: "24px 20px", color: "var(--red)", fontSize: 13 }}>
      {message}
    </div>
  );
}

function TradeCardSkeleton() {
  return (
    <div className="animate-pulse" style={{ ...cardStyle, height: 290 }} />
  );
}

function LeaderboardTable({
  profiles,
  sortKey,
  sortDirection,
  onSort,
}: {
  profiles: OwnerProfile[];
  sortKey: LeaderboardSortKey;
  sortDirection: "asc" | "desc";
  onSort: (key: LeaderboardSortKey) => void;
}) {
  const sortedProfiles = useMemo(
    () => sortProfiles(profiles, sortKey, sortDirection),
    [profiles, sortDirection, sortKey]
  );

  function arrow(key: LeaderboardSortKey) {
    if (sortKey !== key) return "";
    return sortDirection === "desc" ? " ↓" : " ↑";
  }

  return (
    <div style={{ ...cardStyle, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
        <thead>
          <tr style={{ background: "rgba(15, 23, 42, 0.85)" }}>
            {[
              { key: "display_name", label: "Owner" },
              { key: "total_trades", label: "Trades" },
              { key: "trade_win_rate_impact", label: "Impact Win Rate" },
              { key: "cumulative_win_impact", label: "Cum Win Impact" },
              { key: "trade_win_rate_value", label: "Value Win Rate" },
              { key: "soft_target_score", label: "Soft Target" },
            ].map((column) => (
              <th
                key={column.key}
                style={{
                  padding: "12px 14px",
                  textAlign: column.key === "display_name" ? "left" : "right",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  letterSpacing: 0.5,
                }}
              >
                <button
                  type="button"
                  onClick={() => onSort(column.key as LeaderboardSortKey)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                    fontWeight: 700,
                    padding: 0,
                  }}
                >
                  {column.label.toUpperCase()}
                  {arrow(column.key as LeaderboardSortKey)}
                </button>
              </th>
            ))}
            <th
              style={{
                padding: "12px 14px",
                textAlign: "left",
                fontSize: 11,
                color: "var(--text-muted)",
                letterSpacing: 0.5,
              }}
            >
              TENDENCY
            </th>
            <th
              style={{
                padding: "12px 14px",
                textAlign: "left",
                fontSize: 11,
                color: "var(--text-muted)",
                letterSpacing: 0.5,
              }}
            >
              TOP POSITIONS
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedProfiles.map((profile, index) => {
            const tendencyColor =
              profile.youth_vet_bias === "youth"
                ? { background: "rgba(34, 197, 94, 0.14)", color: "#4ade80", border: "rgba(34, 197, 94, 0.3)" }
                : profile.youth_vet_bias === "veteran"
                  ? { background: "rgba(249, 115, 22, 0.14)", color: "#fb923c", border: "rgba(249, 115, 22, 0.3)" }
                  : { background: "rgba(148, 163, 184, 0.14)", color: "#cbd5e1", border: "rgba(148, 163, 184, 0.28)" };

            return (
              <tr
                key={`${profile.league_id}-${profile.roster_id}`}
                style={{
                  borderTop: "1px solid var(--border)",
                  background:
                    profile.soft_target_score > 70
                      ? "rgba(245, 158, 11, 0.06)"
                      : "transparent",
                }}
              >
                <td style={{ padding: "14px", fontSize: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="font-mono" style={{ color: "var(--text-muted)", minWidth: 26 }}>
                      #{index + 1}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{profile.display_name}</div>
                      {profile.soft_target_score > 70 && (
                        <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2 }}>
                          Soft target
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding: "14px", fontSize: 13, textAlign: "right", color: "var(--text-dim)" }}>
                  {profile.total_trades}
                </td>
                <td style={{ padding: "14px", fontSize: 13, textAlign: "right", color: profile.trade_win_rate_impact >= 50 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                  {profile.trade_win_rate_impact.toFixed(1)}%
                </td>
                <td style={{ padding: "14px", fontSize: 13, textAlign: "right", color: profile.cumulative_win_impact >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                  {formatSigned(profile.cumulative_win_impact)}
                </td>
                <td style={{ padding: "14px", fontSize: 13, textAlign: "right", color: profile.trade_win_rate_value >= 50 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                  {profile.trade_win_rate_value.toFixed(1)}%
                </td>
                <td style={{ padding: "14px", fontSize: 13, textAlign: "right" }}>
                  <span style={{ color: profile.soft_target_score > 70 ? "var(--amber)" : "var(--text-dim)", fontWeight: 700 }}>
                    {profile.soft_target_score.toFixed(0)}
                  </span>
                </td>
                <td style={{ padding: "14px", fontSize: 13 }}>
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: tendencyColor.background,
                      border: `1px solid ${tendencyColor.border}`,
                      color: tendencyColor.color,
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: "capitalize",
                    }}
                  >
                    {profile.youth_vet_bias}
                  </span>
                </td>
                <td style={{ padding: "14px", fontSize: 13 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {profile.top_positions_acquired.length > 0 ? (
                      profile.top_positions_acquired.map((position) => {
                        const colors = getPositionPillColor(position);
                        return (
                          <span
                            key={`${profile.roster_id}-${position}`}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: colors.background,
                              border: `1px solid ${colors.border}`,
                              color: colors.color,
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                          >
                            {position}
                          </span>
                        );
                      })
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>None</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TradeIntelligence() {
  const params = useParams<{ leagueId?: string }>();
  const selectedLeagueId = params.leagueId ? decodeURIComponent(params.leagueId) : "";
  const storedUser =
    typeof window !== "undefined" ? localStorage.getItem("edge_username") ?? "" : "";
  const username = storedUser;
  const [, setLocation] = useLocation();
  const { phase, syncProgress, errorMsg, retry } = useEnsureUser(username || undefined);
  const [tab, setTab] = useState<TabKey>("grades");
  const [sortKey, setSortKey] = useState<LeaderboardSortKey>("trade_win_rate_impact");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expandedTrade, setExpandedTrade] = useState<{
    key: string;
    outcomeId: number;
    tradeId: string;
    leagueId: string;
  } | null>(null);

  const { data: leagues, isLoading: leaguesLoading, error: leaguesError } = usePowerRankings(
    phase === "ready" ? username : ""
  );
  const selectedLeagueMeta = leagues?.find((league) => league.league_id === selectedLeagueId) ?? null;

  useEffect(() => {
    if (phase !== "ready" || !leagues || leagues.length === 0) {
      return;
    }

    if (!selectedLeagueId || !selectedLeagueMeta) {
      setLocation(`/trade-intelligence/${encodeURIComponent(leagues[0].league_id)}`);
    }
  }, [leagues, phase, selectedLeagueId, selectedLeagueMeta, setLocation]);

  useEffect(() => {
    setExpandedTrade(null);
  }, [selectedLeagueId, tab]);

  const leagueQuery = useTradeIntelligenceLeague(
    phase === "ready" && selectedLeagueMeta ? selectedLeagueId : undefined
  );
  const leaderboardQuery = useTradeIntelligenceLeaderboard(
    phase === "ready" && selectedLeagueMeta ? selectedLeagueId : undefined,
    true
  );
  const userTradesQuery = useTradeIntelligenceUserTrades(
    phase === "ready" ? username : undefined,
    tab === "my-trades"
  );
  const tradeDetailQuery = useTradeIntelligenceTradeDetail(
    phase === "ready" ? expandedTrade?.leagueId : undefined,
    expandedTrade?.tradeId,
    !!expandedTrade
  );

  const rosterNames = useMemo(
    () => buildRosterNameMap(leagueQuery.data?.rosters),
    [leagueQuery.data?.rosters]
  );
  const userRosterNames = useMemo(
    () => buildRosterNameMap(userTradesQuery.data?.rosters),
    [userTradesQuery.data?.rosters]
  );

  const summaryStats = useMemo(() => {
    const outcomes = leagueQuery.data?.outcomes ?? [];
    const profiles = leaderboardQuery.data?.profiles ?? [];
    return {
      totalTrades: outcomes.length,
      avgImpact: averageWinImpact(outcomes),
      scoringAdjustedCount: outcomes.filter((outcome) => outcome.scoring_adjusted).length,
      softTargets: profiles.filter((profile) => profile.soft_target_score > 70).length,
    };
  }, [leaderboardQuery.data?.profiles, leagueQuery.data?.outcomes]);

  const groupedUserTrades = useMemo(() => {
    const grouped = new Map<string, { leagueId: string; leagueName: string; outcomes: TradeOutcome[] }>();

    for (const outcome of userTradesQuery.data?.outcomes ?? []) {
      const leagueName = outcome.league_name ?? outcome.league_id;
      const current = grouped.get(outcome.league_id) ?? {
        leagueId: outcome.league_id,
        leagueName,
        outcomes: [],
      };
      current.outcomes.push(outcome);
      grouped.set(outcome.league_id, current);
    }

    return [...grouped.values()].sort((left, right) => {
      const leftDate = left.outcomes[0]?.trade_date ?? "";
      const rightDate = right.outcomes[0]?.trade_date ?? "";
      return rightDate.localeCompare(leftDate);
    });
  }, [userTradesQuery.data?.outcomes]);

  function toggleTrade(outcome: TradeOutcome) {
    const key = getTradeKey(outcome);
    setExpandedTrade((current) => {
      if (current?.key === key) return null;
      return {
        key,
        outcomeId: outcome.id,
        tradeId: outcome.trade_id,
        leagueId: outcome.league_id,
      };
    });
  }

  function seasonsForOutcome(outcomeId: number): TradeOutcomeSeason[] | undefined {
    if (!tradeDetailQuery.data || expandedTrade?.outcomeId !== outcomeId) {
      return undefined;
    }

    return tradeDetailQuery.data.seasons.filter(
      (season) => season.trade_outcome_id === outcomeId
    );
  }

  function handleSort(key: LeaderboardSortKey) {
    setSortKey((current) => {
      if (current === key) {
        setSortDirection((direction) => (direction === "desc" ? "asc" : "desc"));
        return current;
      }

      setSortDirection("desc");
      return key;
    });
  }

  if (!username) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Intelligence</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Retroactive trade grades, owner tendencies, and aging reports
          </p>
        </div>
        <EmptyState
          title="Open a synced profile first to view trade intelligence."
          action="Go Home"
          actionLink="/"
        />
      </AppShell>
    );
  }

  if (phase === "checking" || phase === "syncing") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Intelligence</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Retroactive trade grades, owner tendencies, and aging reports
          </p>
        </div>
        <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--amber)" }}>
            <span className="animate-pulse">
              {phase === "checking"
                ? `Looking up ${username}...`
                : `Syncing ${username}'s leagues${syncProgress ? ` (${syncProgress.done}/${syncProgress.total})` : "..."}`}
            </span>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
            {phase === "syncing"
              ? "Trade grades rely on synced league, asset, and matchup data."
              : "Checking if trade intelligence data is available..."}
          </p>
        </div>
      </AppShell>
    );
  }

  if (phase === "error") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Intelligence</h1>
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

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Intelligence</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Retroactive trade grades, owner tendencies, and how trades aged over time
        </p>
        <FreshnessBar leagueId={selectedLeagueId || undefined} />
      </div>

      {leaguesLoading ? (
        <LoadingBlock label="Loading leagues..." />
      ) : leaguesError ? (
        <ErrorBlock message={(leaguesError as Error).message || "Failed to load leagues."} />
      ) : !leagues || leagues.length === 0 ? (
        <EmptyState title="No leagues found. Sync your account first." />
      ) : !selectedLeagueMeta ? (
        <LoadingBlock label="Loading league..." />
      ) : (
        <>
          <div style={{ ...cardStyle, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", letterSpacing: 0.6, textTransform: "uppercase" }}>
              League
            </div>
            <select
              value={selectedLeagueId}
              onChange={(event) =>
                setLocation(
                  `/trade-intelligence/${encodeURIComponent(event.target.value)}`
                )
              }
              style={{ ...selectStyle, marginTop: 10 }}
            >
              {leagues.map((league) => (
                <option key={league.league_id} value={league.league_id}>
                  {league.league_name} ({league.mode.toUpperCase()}
                  {league.scoring_label ? ` | ${league.scoring_label}` : ""})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 16 }}>
            <StatCard label="Graded Trades" value={summaryStats.totalTrades} />
            <StatCard
              label="Avg Win Impact"
              value={formatSigned(summaryStats.avgImpact)}
              accent={summaryStats.avgImpact >= 0 ? "var(--green)" : "var(--red)"}
            />
            <StatCard
              label="Scoring Adjusted"
              value={summaryStats.scoringAdjustedCount}
              sub="League-specific values"
              accent="var(--amber)"
            />
            <StatCard
              label="Soft Targets"
              value={summaryStats.softTargets}
              sub="Profiles above 70"
              accent={summaryStats.softTargets > 0 ? "var(--amber)" : "var(--text)"}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 24 }}>
            {[
              { key: "grades", label: "Trade Grades" },
              { key: "leaderboard", label: "Leaderboard" },
              { key: "my-trades", label: "My Trades" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key as TabKey)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border:
                    tab === item.key
                      ? "2px solid var(--amber)"
                      : "1px solid var(--border)",
                  background:
                    tab === item.key ? "rgba(245, 158, 11, 0.12)" : "var(--card)",
                  color:
                    tab === item.key ? "var(--amber)" : "var(--text-muted)",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: 0.4,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "grades" && (
            <div style={{ marginTop: 24 }}>
              <SectionHeader
                icon="TI"
                title="Trade Grades"
                subtitle={`${selectedLeagueMeta.league_name} trade outcomes from each manager's perspective`}
              />

              {tradeDetailQuery.error && expandedTrade ? (
                <div style={{ marginBottom: 12 }}>
                  <ErrorBlock message="Failed to load the expanded season breakdown for this trade." />
                </div>
              ) : null}

              {leagueQuery.isLoading ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {[1, 2, 3].map((value) => (
                    <TradeCardSkeleton key={value} />
                  ))}
                </div>
              ) : leagueQuery.error ? (
                <ErrorBlock message={(leagueQuery.error as Error).message || "Failed to load graded trades."} />
              ) : (leagueQuery.data?.outcomes.length ?? 0) === 0 ? (
                <EmptyState title="No graded trades yet. Trades will be graded automatically during sync." />
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {leagueQuery.data!.outcomes.map((outcome) => {
                    const expanded = expandedTrade?.key === getTradeKey(outcome);
                    return (
                      <TradeCard
                        key={getTradeKey(outcome)}
                        outcome={outcome}
                        assets={leagueQuery.data!.assets}
                        rosterNames={rosterNames}
                        expanded={expanded}
                        onToggle={() => toggleTrade(outcome)}
                        seasons={expanded ? seasonsForOutcome(outcome.id) : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "leaderboard" && (
            <div style={{ marginTop: 24 }}>
              <SectionHeader
                icon="LB"
                title="League Leaderboard"
                subtitle="Ranked by trade impact first, with value win rate and soft targets alongside it"
              />

              {leaderboardQuery.isLoading ? (
                <LoadingBlock label="Loading owner leaderboard..." />
              ) : leaderboardQuery.error ? (
                <ErrorBlock message={(leaderboardQuery.error as Error).message || "Failed to load owner profiles."} />
              ) : (leaderboardQuery.data?.profiles.length ?? 0) === 0 ? (
                <EmptyState title="No owner trade profiles are available for this league yet." />
              ) : (
                <LeaderboardTable
                  profiles={leaderboardQuery.data!.profiles}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
              )}
            </div>
          )}

          {tab === "my-trades" && (
            <div style={{ marginTop: 24 }}>
              <SectionHeader
                icon="MT"
                title="My Trades"
                subtitle="Your graded trades across every synced league"
              />

              {tradeDetailQuery.error && expandedTrade ? (
                <div style={{ marginBottom: 12 }}>
                  <ErrorBlock message="Failed to load the expanded season breakdown for this trade." />
                </div>
              ) : null}

              {userTradesQuery.isLoading ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {[1, 2, 3].map((value) => (
                    <TradeCardSkeleton key={`user-${value}`} />
                  ))}
                </div>
              ) : userTradesQuery.error ? (
                <ErrorBlock message={(userTradesQuery.error as Error).message || "Failed to load your trades."} />
              ) : groupedUserTrades.length === 0 ? (
                <EmptyState title="No graded trades across your leagues yet." />
              ) : (
                <div style={{ display: "grid", gap: 20 }}>
                  {groupedUserTrades.map((group) => (
                    <div key={group.leagueId}>
                      <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 800 }}>
                        {group.leagueName}
                      </div>
                      <div style={{ display: "grid", gap: 12 }}>
                        {group.outcomes.map((outcome) => {
                          const expanded = expandedTrade?.key === getTradeKey(outcome);
                          return (
                            <TradeCard
                              key={getTradeKey(outcome)}
                              outcome={outcome}
                              assets={userTradesQuery.data!.assets}
                              rosterNames={userRosterNames}
                              expanded={expanded}
                              onToggle={() => toggleTrade(outcome)}
                              seasons={expanded ? seasonsForOutcome(outcome.id) : undefined}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
