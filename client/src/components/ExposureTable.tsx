import type { PortfolioPlayer } from "../hooks/use-portfolio";
import { ExposureBar } from "./ui";
import { PlayerLink } from "./ui";
import EdgeScoreBadge from "./EdgeScoreBadge";
import { posColor } from "../lib/position-colors";

const ZONE_COLORS: Record<string, string> = {
  Prime: "#f59e0b", Ascent: "#22c55e", Decline: "#f97316", Cliff: "#ef4444",
};

interface ExposureTableProps {
  players: PortfolioPlayer[];
}

export default function ExposureTable({ players }: ExposureTableProps) {
  if (players.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        No player exposure data found
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "12px 16px", borderBottom: "1px solid var(--border)", gap: 8, alignItems: "center" }}>
        {COLUMNS.map((h) => (
          <span key={h} style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: 1 }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      {players.map((p) => (
        <div key={p.player_id} style={{ display: "grid", gridTemplateColumns: GRID, padding: "10px 16px", borderBottom: "1px solid rgba(51,65,85,0.13)", gap: 8, alignItems: "center" }}>
          {/* Player */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
            <PlayerLink name={p.full_name} style={{ fontSize: 13, fontWeight: 600 }} />
          </div>

          {/* Pos */}
          <span style={{ color: posColor(p.position), fontWeight: 600, fontSize: 12 }}>{p.position}</span>

          {/* Age */}
          <div>
            {p.age != null ? (
              <span style={{ fontSize: 12, color: ZONE_COLORS[p.age_zone ?? ""] ?? "var(--text-dim)" }}>
                {p.age}{p.age_zone ? ` · ${p.age_zone}` : ""}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>—</span>
            )}
          </div>

          {/* Edge Score */}
          <EdgeScoreBadge score={p.edge_score} />

          {/* Sources */}
          <div className="font-mono" style={{ display: "flex", gap: 6, fontSize: 11 }}>
            {p.fc_score != null && <span style={{ color: "var(--amber)" }}>{p.fc_score}</span>}
            {p.ktc_score != null && <span style={{ color: "#3b82f6" }}>{p.ktc_score}</span>}
            {p.fp_score != null && <span style={{ color: "#7c3aed" }}>{p.fp_score}</span>}
            {p.sources_available === 0 && <span style={{ color: "var(--text-dim)" }}>—</span>}
          </div>

          {/* Leagues */}
          <span className="font-mono" style={{ fontSize: 12, fontWeight: 600 }}>
            {p.leagues_owned}/{p.total_leagues}
          </span>

          {/* Exposure */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ExposureBar leagueCount={p.leagues_owned} totalLeagues={p.total_leagues} showLabel={false} />
            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>{p.pct}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const COLUMNS = ["PLAYER", "POS", "AGE", "EDGE", "FC / KTC / FP", "LEAGUES", "EXPOSURE"];
const GRID = "2fr 50px 90px 44px 110px 70px 100px";
