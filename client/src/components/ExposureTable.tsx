import { Link } from "wouter";
import type { PortfolioPlayer } from "../hooks/use-portfolio";
import { ExposureBar } from "./ui";
import PlayerLink from "./ui/PlayerLink";
import EdgeScoreBadge from "./EdgeScoreBadge";
import { posColor } from "../lib/position-colors";

const ZONE_COLORS: Record<string, string> = {
  Prime: "#f59e0b",
  Ascent: "#22c55e",
  Decline: "#f97316",
  Cliff: "#ef4444",
};

const COLUMNS = ["PLAYER", "POS", "AGE", "EDGE", "SOURCES", "SIGNAL", "LEAGUES", "EXPOSURE", ""];
const GRID = "2fr 45px 85px 44px 100px 70px 65px 95px 36px";

interface ExposureTableProps {
  players: PortfolioPlayer[];
}

export default function ExposureTable({ players }: ExposureTableProps) {
  const username =
    typeof window !== "undefined" ? localStorage.getItem("edge_username") ?? "" : "";

  if (players.length === 0) {
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
        No player exposure data found
      </div>
    );
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          gap: 8,
          alignItems: "center",
        }}
      >
        {COLUMNS.map((h) => (
          <span
            key={h}
            style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: 1 }}
          >
            {h}
          </span>
        ))}
      </div>

      {players.map((p) => (
        <div
          key={p.player_id}
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            padding: "10px 16px",
            borderBottom: "1px solid rgba(51,65,85,0.13)",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
            {p.action_needed && (
              <span
                title={p.action_needed.reason}
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  padding: "1px 4px",
                  borderRadius: 3,
                  background:
                    p.action_needed.type === "risk" ? "rgba(239,68,68,0.2)" : "rgba(107,114,128,0.2)",
                  color: p.action_needed.type === "risk" ? "#ef4444" : "#6b7280",
                  flexShrink: 0,
                }}
              >
                {p.action_needed.type === "risk" ? "\u26A0" : "\u{1F480}"}
              </span>
            )}
            <PlayerLink name={p.full_name} style={{ fontSize: 13 }} />
          </div>

          <span style={{ color: posColor(p.position), fontWeight: 600, fontSize: 12 }}>{p.position}</span>

          <div>
            {p.age != null ? (
              <span style={{ fontSize: 12, color: ZONE_COLORS[p.age_zone ?? ""] ?? "var(--text-dim)" }}>
                {p.age}
                {p.age_zone ? ` \u00B7 ${p.age_zone}` : ""}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{"\u2014"}</span>
            )}
          </div>

          <EdgeScoreBadge score={p.edge_score} />

          <div className="font-mono" style={{ display: "flex", gap: 6, fontSize: 11 }}>
            {p.fc_score != null && <span style={{ color: "var(--amber)" }}>{p.fc_score.toFixed(1)}</span>}
            {p.ktc_score != null && <span style={{ color: "#3b82f6" }}>{p.ktc_score.toFixed(1)}</span>}
            {p.fp_score != null && <span style={{ color: "#7c3aed" }}>{p.fp_score.toFixed(1)}</span>}
            {p.sources_available === 0 && <span style={{ color: "var(--text-dim)" }}>{"\u2014"}</span>}
          </div>

          <div style={{ textAlign: "center" }}>
            {p.disagreement_direction === "sell_signal" && (
              <span
                title={`Crowd overvalues by ${Math.round(Math.abs(p.ktc_vs_experts ?? 0))}pts`}
                style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}
              >
                {"\u25BC"}
              </span>
            )}
            {p.disagreement_direction === "buy_signal" && (
              <span
                title={`Experts see ${Math.round(Math.abs(p.ktc_vs_experts ?? 0))}pts more value`}
                style={{ color: "#22c55e", fontSize: 13, fontWeight: 700 }}
              >
                {"\u25B2"}
              </span>
            )}
            {(p.disagreement_direction === "neutral" || p.disagreement_direction == null) && (
              <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{"\u2014"}</span>
            )}
          </div>

          <span className="font-mono" style={{ fontSize: 12, fontWeight: 600 }}>
            {p.leagues_owned}/{p.total_leagues}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ExposureBar leagueCount={p.leagues_owned} totalLeagues={p.total_leagues} showLabel={false} />
            <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {p.pct}%
            </span>
          </div>

          <Link
            href={`/trade-finder/${encodeURIComponent(username)}?mode=shop&player=${encodeURIComponent(p.player_id)}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "rgba(245,158,11,0.1)",
              border: "1px solid rgba(245,158,11,0.2)",
              color: "var(--amber)",
              fontSize: 12,
              textDecoration: "none",
              cursor: "pointer",
            }}
            title="Shop this player"
          >
            {"\u{1F504}"}
          </Link>
        </div>
      ))}
    </div>
  );
}
