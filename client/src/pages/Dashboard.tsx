import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { StatCard, SectionHeader, Tag, ExposureBar, PlayerLink } from "../components/ui";
import { posColor, dirColor } from "../lib/position-colors";
import {
  useDashboard,
  type DashboardRec,
  type ExposureAlert,
  type LeagueSummary,
} from "../hooks/use-dashboard";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function today(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Action Items ───

function RecRow({ rec }: { rec: DashboardRec }) {
  const color = dirColor(rec.direction);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        gap: 10,
      }}
    >
      <span
        style={{
          padding: "3px 10px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.8,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          color,
          minWidth: 44,
          textAlign: "center",
        }}
      >
        {rec.direction}
      </span>
      <PlayerLink name={rec.player_name} />
      {rec.position && (
        <span style={{ fontSize: 12, fontWeight: 600, color: posColor(rec.position) }}>
          {rec.position}
        </span>
      )}
      {rec.team && (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{rec.team}</span>
      )}
      {rec.fc_at_rec != null && (
        <span
          className="font-mono"
          style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "var(--amber)" }}
        >
          {rec.fc_at_rec.toLocaleString()}
        </span>
      )}
    </div>
  );
}

function ActionItems({ recs }: { recs: DashboardRec[] }) {
  if (recs.length === 0) return <EmptyCard label="No recommendations yet" />;
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {recs.map((r) => (
        <RecRow key={r.id} rec={r} />
      ))}
    </div>
  );
}

// ─── Exposure Alerts ───

function AlertRow({ player: p }: { player: ExposureAlert }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        gap: 10,
      }}
    >
      <span style={{ minWidth: 130 }}>
        <PlayerLink name={p.player_name} />
      </span>
      {p.composite_tag && <Tag tag={p.composite_tag} />}
      <span style={{ fontSize: 12, fontWeight: 600, color: posColor(p.position ?? "") }}>
        {p.position}
      </span>
      <span
        className="font-mono"
        style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: "auto" }}
      >
        {p.league_count}/{p.total_leagues}
      </span>
      <ExposureBar leagueCount={p.league_count} totalLeagues={p.total_leagues} />
      {p.dynasty_value != null && (
        <span
          className="font-mono"
          style={{ fontSize: 13, color: "var(--amber)", minWidth: 55, textAlign: "right" }}
        >
          {p.dynasty_value.toLocaleString()}
        </span>
      )}
    </div>
  );
}

function ExposureAlerts({ alerts }: { alerts: ExposureAlert[] }) {
  if (alerts.length === 0) return <EmptyCard label="No high-exposure alerts" />;
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {alerts.map((p, i) => (
        <AlertRow key={`${p.player_name}-${i}`} player={p} />
      ))}
    </div>
  );
}

// ─── Leagues Grid ───

function LeagueGridCard({ league: l }: { league: LeagueSummary }) {
  const record = `${l.wins}-${l.losses}${l.ties > 0 ? `-${l.ties}` : ""}`;
  const total = l.wins + l.losses + l.ties;
  const winPct = total > 0 ? (l.wins / total).toFixed(3) : ".000";
  const winning = l.wins > l.losses;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "16px 20px",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{l.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          className="font-mono"
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: winning ? "var(--green)" : l.wins < l.losses ? "var(--red)" : "var(--text-muted)",
          }}
        >
          {record}
        </span>
        <span className="font-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {winPct}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
        {l.total_rosters} teams
        {l.fpts > 0 && <span style={{ marginLeft: 12 }}>{l.fpts.toFixed(1)} PF</span>}
      </div>
    </div>
  );
}

function LeaguesGrid({ leagues }: { leagues: LeagueSummary[] }) {
  if (leagues.length === 0) return <EmptyCard label="No leagues found" />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
      {leagues.map((l) => <LeagueGridCard key={l.league_id} league={l} />)}
    </div>
  );
}

// ─── Page ───

export default function Dashboard() {
  const { username } = useParams<{ username: string }>();
  const { data, isLoading, error } = useDashboard(username);

  if (isLoading) return <AppShell><LoadingSkeleton username={username} /></AppShell>;
  if (error || !data) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        </div>
        <EmptyCard label={error ? (error as Error).message : "No data found. Try syncing first."} />
      </AppShell>
    );
  }

  const { stats, top_recs, exposure_alerts, leagues } = data;

  return (
    <AppShell>
      {/* Greeting */}
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          {greeting()}, {username}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>{today()}</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        <StatCard label="Portfolio Value" value={stats.portfolio_value.toLocaleString()} accent="var(--amber)" />
        <StatCard label="Active Leagues" value={stats.league_count} />
        <StatCard label="Unique Players" value={stats.unique_players} />
        <StatCard label="Open Recs" value={stats.open_recs} accent="var(--blue)" />
      </div>

      {/* Action Items */}
      <SectionHeader num="01" icon="📋" title="ACTION ITEMS" subtitle="Latest buy/sell/hold from Dynasty Daily" />
      <ActionItems recs={top_recs} />

      {/* Exposure Alerts */}
      <SectionHeader num="02" icon="⚠️" title="EXPOSURE ALERTS" subtitle="Players you own in 7+ leagues" />
      <ExposureAlerts alerts={exposure_alerts} />

      {/* Leagues */}
      <SectionHeader num="03" icon="🏆" title="MY LEAGUES" subtitle={`${leagues.length} dynasty leagues`} />
      <LeaguesGrid leagues={leagues} />
    </AppShell>
  );
}

// ─── Shared ───

const skel = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10 } as const;

function LoadingSkeleton({ username }: { username: string | undefined }) {
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{greeting()}, {username}</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Loading...</p>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse" style={{ ...skel, flex: 1, minWidth: 140, height: 100 }} />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse" style={{ ...skel, height: 160, marginTop: 32 }} />
      ))}
    </>
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
