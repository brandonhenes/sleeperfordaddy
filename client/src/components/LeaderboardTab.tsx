import { useMemo, useState } from "react";
import EmptyState from "./EmptyState";
import {
  ErrorState,
  LoadingSkeleton,
  ResponsiveTable,
  SectionHeader,
  type ResponsiveTableColumn,
} from "./ui";
import { useTradeIntelligenceLeaderboard } from "../hooks/use-trade-intelligence";
import type { OwnerProfile } from "@shared/types";

type LeaderboardSortKey =
  | "display_name"
  | "total_trades"
  | "trade_win_rate_impact"
  | "cumulative_win_impact"
  | "trade_win_rate_value"
  | "soft_target_score";

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
  return <LoadingSkeleton label={label} rows={4} />;
}

function ErrorBlock({ message }: { message: string }) {
  return <ErrorState title="Could not load owner profiles" message={message} />;
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

  function SortHeader({ sort, label }: { sort: LeaderboardSortKey; label: string }) {
    return (
      <button
        type="button"
        onClick={() => onSort(sort)}
        style={{
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "inherit",
          fontWeight: 700,
          padding: 0,
          textAlign: "inherit",
        }}
      >
        {label}
        {arrow(sort)}
      </button>
    );
  }

  const columns: ResponsiveTableColumn<OwnerProfile>[] = [
    {
      key: "owner",
      header: <SortHeader sort="display_name" label="Owner" />,
      cardLabel: "Owner",
      render: (profile) => {
        const rank = sortedProfiles.findIndex((item) => item.roster_id === profile.roster_id) + 1;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="font-mono" style={{ color: "var(--text-muted)", minWidth: 26 }}>
              #{rank}
            </span>
            <div>
              <div style={{ fontWeight: 700 }}>{profile.display_name}</div>
              {profile.soft_target_score > 70 && (
                <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2 }}>Soft target</div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "trades",
      header: <SortHeader sort="total_trades" label="Trades" />,
      cardLabel: "Trades",
      align: "right",
      render: (profile) => <span style={{ color: "var(--text-dim)" }}>{profile.total_trades}</span>,
    },
    {
      key: "impact_win_rate",
      header: <SortHeader sort="trade_win_rate_impact" label="Impact Win Rate" />,
      cardLabel: "Impact Win Rate",
      align: "right",
      render: (profile) => (
        <span style={{ color: profile.trade_win_rate_impact >= 50 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
          {profile.trade_win_rate_impact.toFixed(1)}%
        </span>
      ),
    },
    {
      key: "cumulative_win_impact",
      header: <SortHeader sort="cumulative_win_impact" label="Cum Win Impact" />,
      cardLabel: "Cum Win Impact",
      align: "right",
      render: (profile) => (
        <span style={{ color: profile.cumulative_win_impact >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
          {formatSigned(profile.cumulative_win_impact)}
        </span>
      ),
    },
    {
      key: "value_win_rate",
      header: <SortHeader sort="trade_win_rate_value" label="Value Win Rate" />,
      cardLabel: "Value Win Rate",
      align: "right",
      render: (profile) => (
        <span style={{ color: profile.trade_win_rate_value >= 50 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
          {profile.trade_win_rate_value.toFixed(1)}%
        </span>
      ),
    },
    {
      key: "soft_target",
      header: <SortHeader sort="soft_target_score" label="Soft Target" />,
      cardLabel: "Soft Target",
      align: "right",
      render: (profile) => (
        <span style={{ color: profile.soft_target_score > 70 ? "var(--amber)" : "var(--text-dim)", fontWeight: 700 }}>
          {profile.soft_target_score.toFixed(0)}
        </span>
      ),
    },
    {
      key: "tendency",
      header: "Tendency",
      render: (profile) => {
        const tendencyColor =
          profile.youth_vet_bias === "youth"
            ? { background: "rgba(34, 197, 94, 0.14)", color: "#4ade80", border: "rgba(34, 197, 94, 0.3)" }
            : profile.youth_vet_bias === "veteran"
              ? { background: "rgba(249, 115, 22, 0.14)", color: "#fb923c", border: "rgba(249, 115, 22, 0.3)" }
              : { background: "rgba(148, 163, 184, 0.14)", color: "#cbd5e1", border: "rgba(148, 163, 184, 0.28)" };

        return (
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
        );
      },
    },
    {
      key: "positions",
      header: "Top Positions",
      render: (profile) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
      ),
    },
  ];

  return (
    <ResponsiveTable
      rows={sortedProfiles}
      columns={columns}
      getRowKey={(profile) => `${profile.league_id}-${profile.roster_id}`}
    />
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
