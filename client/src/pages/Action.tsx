import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { SectionHeader, Tag, TrendArrow, PlayerLink } from "../components/ui";
import { posColor, dirColor } from "../lib/position-colors";
import {
  useSellCandidates,
  useBuyOpportunities,
  type SellCandidate,
  type BuyOpportunity,
} from "../hooks/use-action";

function SellRow({ player: p }: { player: SellCandidate }) {
  const exposure =
    p.total_leagues > 0
      ? ((p.league_count / p.total_leagues) * 100).toFixed(0)
      : "0";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        gap: 12,
      }}
    >
      {p.composite_tag && <Tag tag={p.composite_tag} />}
      <span style={{ minWidth: 140 }}>
        <PlayerLink name={p.player_name} />
      </span>
      <span
        style={{ fontSize: 12, fontWeight: 600, color: posColor(p.position ?? "") }}
      >
        {p.position}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.team}</span>
      <span
        className="font-mono"
        style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: "auto" }}
      >
        {p.league_count}/{p.total_leagues} ({exposure}%)
      </span>
      <span
        className="font-mono"
        style={{ fontSize: 13, color: "var(--amber)", minWidth: 60, textAlign: "right" }}
      >
        {p.edge_score ?? "-"}
      </span>
      <span style={{ minWidth: 80, textAlign: "right" }}>
        <TrendArrow value={p.trend_30day} />
      </span>
    </div>
  );
}

function SellCandidatesSection({ username }: { username: string }) {
  const { data, isLoading, error } = useSellCandidates(username);

  if (isLoading) return <SkeletonCard />;
  if (error) return <ErrorCard message={(error as Error).message} />;
  if (!data || data.length === 0) {
    return <EmptyCard label="No sell candidates - your portfolio looks clean" />;
  }

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {data.map((p, i) => (
        <SellRow key={`${p.player_name}-${i}`} player={p} />
      ))}
    </div>
  );
}

function BuyCard({ opp: o }: { opp: BuyOpportunity }) {
  const color = dirColor(o.direction);
  const leagueLabel =
    o.owned_leagues === 0
      ? `Add in 0/${o.total_leagues} leagues`
      : `Own in ${o.owned_leagues}/${o.total_leagues} leagues`;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            color,
          }}
        >
          BUY
        </span>
        <PlayerLink name={o.player_name} style={{ fontSize: 15 }} />
        {o.position && (
          <span style={{ fontSize: 12, fontWeight: 600, color: posColor(o.position) }}>
            {o.position}
          </span>
        )}
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
            {o.edge_score}
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
    </div>
  );
}

function BuyOpportunitiesSection({ username }: { username: string }) {
  const { data, isLoading, error } = useBuyOpportunities(username);

  if (isLoading) return <SkeletonCard />;
  if (error) return <ErrorCard message={(error as Error).message} />;
  if (!data || data.length === 0) {
    return <EmptyCard label="No buy recommendations right now" />;
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
  const { username } = useParams<{ username: string }>();

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          Action Engine
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Sell high, buy low - matched to your portfolio
        </p>
      </div>

      <SectionHeader
        num="01"
        icon="Sell"
        title="SELL CANDIDATES"
        subtitle="Trending down or over-exposed - consider moving these"
      />
      <SellCandidatesSection username={username ?? ""} />

      <SectionHeader
        num="02"
        icon="Buy"
        title="BUY OPPORTUNITIES"
        subtitle="Newsletter BUY recs you do not own or are underweight on"
      />
      <BuyOpportunitiesSection username={username ?? ""} />
    </AppShell>
  );
}

function SkeletonCard() {
  return (
    <div
      className="animate-pulse"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        height: 200,
      }}
    />
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 40,
        textAlign: "center",
        color: "var(--red)",
      }}
    >
      Error: {message}
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 40,
        textAlign: "center",
        color: "var(--text-muted)",
      }}
    >
      {label}
    </div>
  );
}
