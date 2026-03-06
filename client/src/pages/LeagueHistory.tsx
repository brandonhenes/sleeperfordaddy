import { useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import AppShell from "../components/AppShell";
import { SectionHeader } from "../components/ui";
import { useOverview } from "../hooks/use-sleeper";
import { useLeagueHistory } from "../hooks/use-league-history";
import type {
  LeagueHistoryData,
  LeagueHistorySeason,
  LeagueGroup,
} from "../../../shared/types";

// ─── Constants ───

const TEAM_COLORS = [
  "#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#14b8a6", "#84cc16",
  "#a855f7", "#64748b",
];

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
} as const;

// ─── Group Selector ───

function GroupSelector({
  groups,
  selected,
  onChange,
}: {
  groups: LeagueGroup[];
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ ...cardStyle, padding: 16, marginTop: 16 }}>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "var(--dark-base)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 14,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        <option value="" disabled>
          Select a league group...
        </option>
        {groups.map((g) => (
          <option key={g.group_id} value={g.group_id}>
            {g.name} ({g.min_season}–{g.max_season})
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Summary Cards ───

function SummaryCards({ data }: { data: LeagueHistoryData }) {
  const seasonCount = data.seasons.length;
  const allOwners = new Set<string>();
  for (const s of data.seasons) for (const t of s.teams) allOwners.add(t.owner_id);

  const latestSeason = data.seasons[data.seasons.length - 1];
  const champion = latestSeason?.teams.find((t) => t.finish_place === 1);

  return (
    <div
      style={{
        ...cardStyle,
        padding: "16px 20px",
        marginTop: 16,
        display: "flex",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--amber)" }}>{seasonCount}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Seasons</div>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{allOwners.size}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Unique owners</div>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          {latestSeason?.teams.length ?? 0}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Current teams</div>
      </div>
      {champion && (
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {latestSeason.season} Champion
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{champion.display_name}</div>
        </div>
      )}
    </div>
  );
}

// ─── Team Value Chart ───

function TeamValueChart({ data }: { data: LeagueHistoryData }) {
  const { chartData, owners } = useMemo(() => {
    const ownerMap = new Map<string, string>();
    for (const season of data.seasons) {
      for (const team of season.teams) {
        if (!ownerMap.has(team.owner_id)) {
          ownerMap.set(team.owner_id, team.display_name);
        }
      }
    }

    const dateMap = new Map<string, Record<string, number>>();
    for (const season of data.seasons) {
      for (const team of season.teams) {
        for (const snap of team.snapshots) {
          const existing = dateMap.get(snap.snapshot_date) ?? {};
          existing[team.owner_id] = snap.total_edge;
          dateMap.set(snap.snapshot_date, existing);
        }
      }
    }

    const sorted = [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date: new Date(date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "2-digit",
        }),
        ...values,
      }));

    return { chartData: sorted, owners: [...ownerMap.entries()] };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div
        style={{
          ...cardStyle,
          padding: 40,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
          minHeight: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        No snapshot data yet. Snapshots are captured during each sync.
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, padding: "16px 8px 8px" }}>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData}>
          <CartesianGrid stroke="rgba(51,65,85,0.2)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            tickLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: "var(--dark-base)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--text-muted)" }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {owners.map(([ownerId, displayName], i) => (
            <Line
              key={ownerId}
              type="monotone"
              dataKey={ownerId}
              name={displayName}
              stroke={TEAM_COLORS[i % TEAM_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Season Table ───

const thStyle = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 600 as const,
  color: "var(--text-muted)",
  letterSpacing: 0.5,
  textAlign: "center" as const,
};

const tdStyle = {
  padding: "10px 12px",
  textAlign: "center" as const,
};

function SeasonTable({
  season,
  defaultExpanded,
}: {
  season: LeagueHistorySeason;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  return (
    <div style={cardStyle}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }}>{season.season}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
          {season.teams.length} teams
        </span>
        {season.teams.find((t) => t.finish_place === 1) && (
          <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600 }}>
            Champ: {season.teams.find((t) => t.finish_place === 1)!.display_name}
          </span>
        )}
        <span
          style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 12 }}
        >
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "0 16px 16px", overflow: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ ...thStyle, textAlign: "left" }}>#</th>
                <th style={{ ...thStyle, textAlign: "left" }}>TEAM</th>
                <th style={thStyle}>W</th>
                <th style={thStyle}>L</th>
                <th style={thStyle}>PF</th>
                <th style={thStyle}>FINISH</th>
                <th style={thStyle}>EDGE</th>
                <th style={thStyle}>ARCHETYPE</th>
              </tr>
            </thead>
            <tbody>
              {season.teams.map((team, i) => {
                const latestSnap = team.snapshots[team.snapshots.length - 1];
                return (
                  <tr
                    key={team.owner_id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "left",
                        color: "var(--text-muted)",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      style={{ ...tdStyle, textAlign: "left", fontWeight: 600 }}
                    >
                      {team.display_name}
                    </td>
                    <td style={tdStyle}>{team.wins}</td>
                    <td style={tdStyle}>{team.losses}</td>
                    <td style={tdStyle}>{Math.round(team.fpts)}</td>
                    <td style={tdStyle}>
                      {team.finish_place === 1 ? (
                        <span style={{ color: "var(--amber)", fontWeight: 700 }}>
                          1st
                        </span>
                      ) : team.finish_place ? (
                        ordinal(team.finish_place)
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>–</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {latestSnap ? (
                        Math.round(latestSnap.total_edge)
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>–</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {latestSnap?.archetype ? (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: "rgba(245,158,11,0.12)",
                            color: "var(--amber)",
                            fontWeight: 600,
                          }}
                        >
                          {latestSnap.archetype}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Page ───

export default function LeagueHistory() {
  const { username } = useParams<{ username: string }>();
  const { data: overview, isLoading: overviewLoading } = useOverview(username);
  const groups = overview?.league_groups ?? [];
  const [selectedGroupId, setSelectedGroupId] = useState("");

  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].group_id);
    }
  }, [groups, selectedGroupId]);

  const { data: historyData, isLoading: historyLoading } =
    useLeagueHistory(selectedGroupId);

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          League History
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Track team value, records, and trends across seasons
        </p>
      </div>

      {overviewLoading ? (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {[1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{ ...cardStyle, height: 60 }}
            />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div
          style={{
            ...cardStyle,
            padding: 40,
            marginTop: 16,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          No league groups found. Sync your account first.
        </div>
      ) : (
        <>
          <GroupSelector
            groups={groups}
            selected={selectedGroupId}
            onChange={setSelectedGroupId}
          />

          {historyLoading ? (
            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse"
                  style={{ ...cardStyle, height: 80 }}
                />
              ))}
            </div>
          ) : historyData && historyData.seasons.length > 0 ? (
            <>
              <SummaryCards data={historyData} />

              <SectionHeader
                icon=""
                title="Team Value Over Time"
                subtitle="Total edge score trend across syncs"
              />
              <TeamValueChart data={historyData} />

              <SectionHeader
                icon=""
                title="Season-by-Season"
                subtitle="Records and standings"
              />
              <div style={{ display: "grid", gap: 12 }}>
                {[...historyData.seasons].reverse().map((s, i) => (
                  <SeasonTable
                    key={s.league_id}
                    season={s}
                    defaultExpanded={i === 0}
                  />
                ))}
              </div>
            </>
          ) : selectedGroupId ? (
            <div
              style={{
                ...cardStyle,
                padding: "40px 24px",
                marginTop: 16,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              No historical data yet. Snapshots are captured during each sync.
              Check back after your next sync completes.
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
