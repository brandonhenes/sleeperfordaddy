import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import EdgeScoreBadge from "../EdgeScoreBadge";
import FreshnessBar from "../FreshnessBar";
import {
  Card,
  ErrorState,
  LoadingSkeleton,
  PlayerLink,
  PositionBadge,
  ResponsiveTable,
  SegmentedControl,
  type ResponsiveTableColumn,
} from "../ui";
import { useOverview } from "../../hooks/use-sleeper";
import { useWaiverWire, type WaiverPlayer } from "../../hooks/use-waiver-wire";
import { readStoredUsername } from "../../lib/current-user";

type PosFilter = "ALL" | "QB" | "RB" | "WR" | "TE";

function LeagueSelector({
  leagues,
  selected,
  onChange,
}: {
  leagues: { league_id: string; name: string }[];
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <Card className="mt-4">
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
        <option value="" disabled>Select a league...</option>
        {leagues.map((league) => (
          <option key={league.league_id} value={league.league_id}>
            {league.name}
          </option>
        ))}
      </select>
    </Card>
  );
}

function PlayerCell({ player }: { player: WaiverPlayer }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <PlayerLink name={player.full_name} />
      {player.hidden_gem && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            padding: "1px 5px",
            borderRadius: 3,
            background: "rgba(245,158,11,0.15)",
            color: "var(--amber)",
            letterSpacing: 0.5,
          }}
        >
          GEM
        </span>
      )}
    </div>
  );
}

function AgreementLabel({ value }: { value: WaiverPlayer["source_agreement"] }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: value === "high" ? "#22c55e" : value === "medium" ? "#eab308" : "#ef4444",
      }}
    >
      {value.toUpperCase()}
    </span>
  );
}

function CurveLabel({ zone }: { zone: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: zone === "Ascent" ? "#22c55e" : zone === "Peak" ? "#f59e0b" : "#ef4444",
      }}
    >
      {zone}
    </span>
  );
}

function WaiverTable({ players, filter }: { players: WaiverPlayer[]; filter: PosFilter }) {
  const filtered = filter === "ALL" ? players : players.filter((player) => player.position === filter);
  const columns: ResponsiveTableColumn<WaiverPlayer>[] = [
    {
      key: "player",
      header: "Player",
      render: (player) => <PlayerCell player={player} />,
    },
    {
      key: "position",
      header: "Pos",
      render: (player) => <PositionBadge position={player.position} />,
    },
    {
      key: "team",
      header: "Team",
      render: (player) => <span style={{ color: "var(--text-muted)" }}>{player.team}</span>,
    },
    {
      key: "age",
      header: "Age",
      align: "right",
      render: (player) => <span style={{ color: "var(--text-dim)" }}>{player.age ?? "-"}</span>,
    },
    {
      key: "edge",
      header: "Edge",
      align: "right",
      render: (player) => <EdgeScoreBadge score={player.edge_score} />,
    },
    {
      key: "fc",
      header: "FC",
      align: "right",
      render: (player) => <span style={{ color: "var(--text-dim)" }}>{player.fc_score != null ? player.fc_score.toFixed(1) : "-"}</span>,
    },
    {
      key: "ktc",
      header: "KTC",
      align: "right",
      render: (player) => <span style={{ color: "var(--text-dim)" }}>{player.ktc_score != null ? player.ktc_score.toFixed(1) : "-"}</span>,
    },
    {
      key: "dp",
      header: "DP",
      align: "right",
      render: (player) => <span style={{ color: "var(--text-dim)" }}>{player.dp_score != null ? player.dp_score.toFixed(1) : "-"}</span>,
    },
    {
      key: "agreement",
      header: "Agreement",
      align: "right",
      render: (player) => <AgreementLabel value={player.source_agreement} />,
    },
    {
      key: "curve",
      header: "Curve",
      align: "right",
      render: (player) => <CurveLabel zone={player.age_curve.zone} />,
    },
  ];

  if (filtered.length === 0) {
    return (
      <Card className="edge-state-card">
        <p>No free agents found{filter !== "ALL" ? ` at ${filter}` : ""}.</p>
      </Card>
    );
  }

  return (
    <ResponsiveTable
      rows={filtered}
      columns={columns}
      getRowKey={(player) => player.player_id}
    />
  );
}

export default function WaiverContent({ username: usernameProp }: { username?: string }) {
  const params = useParams<{ username: string }>();
  const username = usernameProp ?? params.username ?? readStoredUsername();
  const { data: overview, isLoading: overviewLoading, error: overviewError } = useOverview(username);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");
  const [posFilter, setPosFilter] = useState<PosFilter>("ALL");

  const leagues = useMemo(() => {
    const rows: { league_id: string; name: string }[] = [];
    if (overview?.league_groups) {
      for (const group of overview.league_groups) {
        if (group.leagues.length > 0) {
          rows.push({ league_id: group.leagues[group.leagues.length - 1], name: group.name });
        }
      }
    }
    return rows;
  }, [overview?.league_groups]);

  useEffect(() => {
    if (leagues.length > 0 && !selectedLeagueId) {
      setSelectedLeagueId(leagues[0].league_id);
    }
  }, [leagues, selectedLeagueId]);

  const { data: waiverData, isLoading: waiverLoading, error: waiverError } = useWaiverWire(selectedLeagueId);
  const players = waiverData?.players ?? [];
  const warning = waiverData?.warning ?? null;

  if (overviewLoading) {
    return <LoadingSkeleton label="Loading leagues" rows={1} />;
  }

  if (overviewError) {
    return (
      <ErrorState
        title="Could not load leagues"
        message={(overviewError as Error).message}
      />
    );
  }

  if (leagues.length === 0) {
    return (
      <Card className="edge-state-card mt-4">
        <p>No leagues found. Sync your account first.</p>
      </Card>
    );
  }

  return (
    <>
      <FreshnessBar leagueId={selectedLeagueId || undefined} />
      <LeagueSelector leagues={leagues} selected={selectedLeagueId} onChange={setSelectedLeagueId} />

      <div style={{ marginTop: 12 }}>
        <SegmentedControl
          items={(["ALL", "QB", "RB", "WR", "TE"] as PosFilter[]).map((pos) => ({
            key: pos,
            label: pos,
          }))}
          value={posFilter}
          onChange={setPosFilter}
          ariaLabel="Position filter"
        />
      </div>

      {warning && (
        <Card
          style={{
            marginTop: 12,
            borderColor: "#f59e0b",
            background: "rgba(245,158,11,0.12)",
            color: "#fde68a",
            fontSize: 13,
          }}
        >
          {warning}
        </Card>
      )}

      <div style={{ marginTop: 12 }}>
        {waiverError ? (
          <ErrorState
            title="Could not load waiver wire"
            message={(waiverError as Error).message}
          />
        ) : waiverLoading ? (
          <LoadingSkeleton label="Loading waiver wire" rows={3} />
        ) : (
          <WaiverTable players={players} filter={posFilter} />
        )}
      </div>
    </>
  );
}
