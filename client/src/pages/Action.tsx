import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import SyncGate from "../components/SyncGate";
import {
  Card,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  PlayerLink,
  PositionBadge,
  ResponsiveTable,
  SectionHeader,
  Tag,
  TrendArrow,
  type ResponsiveTableColumn,
} from "../components/ui";
import { dirColor } from "../lib/position-colors";
import { useCurrentUsername } from "../hooks/use-current-user";
import {
  useSellCandidates,
  useBuyOpportunities,
  type SellCandidate,
  type BuyOpportunity,
} from "../hooks/use-action";

function exposureLabel(player: SellCandidate): string {
  const exposure = player.total_leagues > 0
    ? ((player.league_count / player.total_leagues) * 100).toFixed(0)
    : "0";
  return `${player.league_count}/${player.total_leagues} (${exposure}%)`;
}

function SellCandidatesSection({ username }: { username: string }) {
  const { data, isLoading, error } = useSellCandidates(username);
  const columns: ResponsiveTableColumn<SellCandidate>[] = [
    {
      key: "player",
      header: "Player",
      render: (player) => <PlayerLink name={player.player_name} />,
    },
    {
      key: "position",
      header: "Pos",
      render: (player) => <PositionBadge position={player.position} />,
    },
    {
      key: "team",
      header: "Team",
      render: (player) => <span style={{ color: "var(--text-muted)" }}>{player.team ?? "-"}</span>,
    },
    {
      key: "signal",
      header: "Signal",
      render: (player) => player.composite_tag ? <Tag tag={player.composite_tag} /> : <span>-</span>,
    },
    {
      key: "exposure",
      header: "Exposure",
      align: "right",
      render: (player) => (
        <span className="font-mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {exposureLabel(player)}
        </span>
      ),
    },
    {
      key: "edge",
      header: "Edge",
      align: "right",
      render: (player) => (
        <span className="font-mono" style={{ fontSize: 13, color: "var(--amber)", fontWeight: 800 }}>
          {player.edge_score != null ? player.edge_score.toFixed(1) : "-"}
        </span>
      ),
    },
    {
      key: "trend",
      header: "30D",
      align: "right",
      render: (player) => <TrendArrow value={player.trend_30day} />,
    },
  ];

  if (isLoading) return <LoadingSkeleton label="Loading sell candidates" rows={4} />;
  if (error) {
    return (
      <ErrorState
        title="Could not load sell candidates"
        message={(error as Error).message}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <Card className="edge-state-card">
        <p>No sell candidates. Your portfolio looks clean.</p>
      </Card>
    );
  }

  return (
    <ResponsiveTable
      rows={data}
      columns={columns}
      getRowKey={(player, index) => `${player.player_name}-${index}`}
    />
  );
}

function BuyCard({ opp: o }: { opp: BuyOpportunity }) {
  const color = dirColor(o.direction);
  const leagueLabel =
    o.owned_leagues === 0
      ? `Add in 0/${o.total_leagues} leagues`
      : `Own in ${o.owned_leagues}/${o.total_leagues} leagues`;

  return (
    <Card
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.8,
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            color,
          }}
        >
          BUY
        </span>
        <PlayerLink name={o.player_name} style={{ fontSize: 15 }} />
        {o.position && <PositionBadge position={o.position} />}
        {o.team && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{o.team}</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {o.edge_score != null && (
          <span
            className="font-mono"
            style={{ fontSize: 14, fontWeight: 600, color: "var(--amber)" }}
          >
            {o.edge_score.toFixed(1)}
          </span>
        )}
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {leagueLabel}
        </span>
      </div>

      {o.rationale && (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-dim)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {o.rationale}
        </p>
      )}
    </Card>
  );
}

function BuyOpportunitiesSection({ username }: { username: string }) {
  const { data, isLoading, error } = useBuyOpportunities(username);

  if (isLoading) return <LoadingSkeleton label="Loading buy opportunities" rows={4} />;
  if (error) {
    return (
      <ErrorState
        title="Could not load buy opportunities"
        message={(error as Error).message}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <Card className="edge-state-card">
        <p>No buy recommendations right now.</p>
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {data.map((o, i) => (
        <BuyCard key={`${o.player_name}-${i}`} opp={o} />
      ))}
    </div>
  );
}

export default function Action() {
  const { username } = useCurrentUsername();

  return (
    <AppShell>
      <PageHeader
        title="Action Engine"
        subtitle="Sell high, buy low - matched to your portfolio."
        actions={<FreshnessBar />}
      />

      <SyncGate username={username}>
        <SectionHeader
          num="01"
          icon="Sell"
          title="SELL CANDIDATES"
          subtitle="Trending down or over-exposed - consider moving these"
        />
        <SellCandidatesSection username={username} />

        <SectionHeader
          num="02"
          icon="Buy"
          title="BUY OPPORTUNITIES"
          subtitle="Newsletter BUY recs you do not own or are underweight on"
        />
        <BuyOpportunitiesSection username={username} />
      </SyncGate>
    </AppShell>
  );
}
