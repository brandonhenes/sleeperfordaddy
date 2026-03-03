import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { SectionHeader, PlayerLink } from "../components/ui";
import { posColor } from "../lib/position-colors";
import {
  useLeagueDetail,
  type StandingsEntry,
  type RosterPlayer,
  type TradeEntry,
} from "../hooks/use-league-detail";

// ─── Standings ───

function StandingsTable({ standings }: { standings: StandingsEntry[] }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 11 }}>
            <th style={{ padding: "10px 16px", textAlign: "left" }}>#</th>
            <th style={{ padding: "10px 16px", textAlign: "left" }}>Team</th>
            <th style={{ padding: "10px 16px", textAlign: "right" }}>Record</th>
            <th style={{ padding: "10px 16px", textAlign: "right" }}>PF</th>
            <th style={{ padding: "10px 16px", textAlign: "right" }}>PA</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const record = `${s.wins}-${s.losses}${s.ties > 0 ? `-${s.ties}` : ""}`;
            const winning = s.wins > s.losses;
            return (
              <tr key={s.owner_id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 16px", color: "var(--text-muted)" }}>{i + 1}</td>
                <td style={{ padding: "10px 16px", fontWeight: 600 }}>
                  {s.team_name || s.display_name || s.owner_id}
                </td>
                <td
                  className="font-mono"
                  style={{
                    padding: "10px 16px",
                    textAlign: "right",
                    fontWeight: 700,
                    color: winning ? "var(--green)" : s.wins < s.losses ? "var(--red)" : "var(--text-muted)",
                  }}
                >
                  {record}
                </td>
                <td className="font-mono" style={{ padding: "10px 16px", textAlign: "right" }}>
                  {s.fpts.toFixed(1)}
                </td>
                <td className="font-mono" style={{ padding: "10px 16px", textAlign: "right", color: "var(--text-muted)" }}>
                  {s.fpts_against.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── My Roster ───

function RosterTable({ players }: { players: RosterPlayer[] }) {
  if (players.length === 0) return <EmptyCard label="No roster data" />;
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {players.map((p, i) => (
        <div
          key={`${p.player_name}-${i}`}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            gap: 10,
          }}
        >
          {p.position && (
            <span style={{ fontSize: 11, fontWeight: 700, color: posColor(p.position), minWidth: 28 }}>
              {p.position}
            </span>
          )}
          {p.player_name ? <PlayerLink name={p.player_name} /> : <span style={{ color: "var(--text-muted)" }}>Unknown</span>}
          {p.team && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.team}</span>
          )}
          {p.dynasty_value != null && (
            <span
              className="font-mono"
              style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "var(--amber)" }}
            >
              {p.dynasty_value.toLocaleString()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Recent Trades ───

function TradeCard({ trade }: { trade: TradeEntry }) {
  const date = new Date(trade.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 18px",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>{date}</div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {trade.sides.map((side) => (
          <div key={side.roster_id} style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              {side.display_name || `Roster ${side.roster_id}`}
            </div>
            {side.received.length > 0 && (
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "var(--green)", fontWeight: 600 }}>Received: </span>
                {side.received.join(", ")}
              </div>
            )}
            {side.gave.length > 0 && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color: "var(--red)", fontWeight: 600 }}>Gave: </span>
                {side.gave.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentTrades({ trades }: { trades: TradeEntry[] }) {
  if (trades.length === 0) return <EmptyCard label="No recent trades" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {trades.map((t) => (
        <TradeCard key={t.transaction_id} trade={t} />
      ))}
    </div>
  );
}

// ─── Page ───

export default function LeagueDetail() {
  const { username, leagueId } = useParams<{ username: string; leagueId: string }>();
  const { data, isLoading, error } = useLeagueDetail(leagueId, username);

  if (isLoading) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Loading...</h1>
        </div>
        <div
          className="animate-pulse"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            height: 300,
            marginTop: 24,
          }}
        />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>League</h1>
        </div>
        <EmptyCard label={error ? (error as Error).message : "League not found"} />
      </AppShell>
    );
  }

  const { league, standings, roster, recent_trades } = data;
  const rosterTotal = roster.reduce((sum, p) => sum + (p.dynasty_value ?? 0), 0);

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{league.name}</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          {league.season} &middot; {league.total_rosters} teams &middot; {league.status}
        </p>
      </div>

      <SectionHeader num="01" icon="📊" title="STANDINGS" />
      <StandingsTable standings={standings} />

      <SectionHeader
        num="02"
        icon="🏈"
        title="MY ROSTER"
        subtitle={`${roster.length} players \u00b7 ${rosterTotal.toLocaleString()} total value`}
      />
      <RosterTable players={roster} />

      <SectionHeader num="03" icon="🔄" title="RECENT TRADES" />
      <RecentTrades trades={recent_trades} />
    </AppShell>
  );
}

// ─── Shared ───

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
