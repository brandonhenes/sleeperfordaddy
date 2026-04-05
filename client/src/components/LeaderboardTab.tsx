import { useMemo, useState } from "react";
import EmptyState from "./EmptyState";
import { SectionHeader } from "./ui";
import { useTradeIntelligenceLeaderboard } from "../hooks/use-trade-intelligence";
import type { OwnerProfile } from "../../../shared/types";

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

function formatSigned(value: number, suffix = ""): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
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
    return sortDirection === "desc" ? " \u2193" : " \u2191";
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
            <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5 }}>
              TENDENCY
            </th>
            <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5 }}>
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
                  background: profile.soft_target_score > 70 ? "rgba(245, 158, 11, 0.06)" : "transparent",
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
                        <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2 }}>Soft target</div>
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

interface LeaderboardTabProps {
  selectedLeagueId: string;
}

export default function LeaderboardTab({ selectedLeagueId }: LeaderboardTabProps) {
  const [sortKey, setSortKey] = useState<LeaderboardSortKey>("trade_win_rate_impact");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const leaderboardQuery = useTradeIntelligenceLeaderboard(
    selectedLeagueId || undefined,
    true
  );

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

  if (!selectedLeagueId) {
    return <EmptyState title="Select a league to view the leaderboard." />;
  }

  return (
    <div>
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
  );
}
