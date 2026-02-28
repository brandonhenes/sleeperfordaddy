import type { PortfolioPlayer } from "../hooks/use-portfolio";
import { Tag, TrendArrow, ExposureBar } from "./ui";
import { posColor } from "../lib/position-colors";

interface ExposureTableProps {
  players: PortfolioPlayer[];
}

const COLUMNS = ["PLAYER", "POS", "TEAM", "LEAGUES", "EXPOSURE", "FC VALUE", "30D TREND"];
const GRID = "2fr 60px 50px 80px 90px 80px 100px";

export default function ExposureTable({ players }: ExposureTableProps) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          padding: "12px 20px",
          borderBottom: "1px solid var(--border)",
          gap: 12,
        }}
      >
        {COLUMNS.map((h) => (
          <span
            key={h}
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      {players.map((p) => (
        <div
          key={p.player_name}
          style={{
            display: "grid",
            gridTemplateColumns: GRID,
            padding: "12px 20px",
            borderBottom: "1px solid rgba(51,65,85,0.13)",
            gap: 12,
            alignItems: "center",
          }}
        >
          {/* PLAYER + Tag */}
          <div>
            <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>
              {p.player_name}
            </span>
            {p.composite_tag && (
              <div style={{ marginTop: 2 }}>
                <Tag tag={p.composite_tag} />
              </div>
            )}
          </div>

          {/* POS */}
          <span
            style={{
              color: posColor(p.position || ""),
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {p.position}
          </span>

          {/* TEAM */}
          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
            {p.team}
          </span>

          {/* LEAGUES */}
          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            {p.league_count}/{p.total_leagues}
          </span>

          {/* EXPOSURE bar */}
          <ExposureBar
            leagueCount={p.league_count}
            totalLeagues={p.total_leagues}
          />

          {/* FC VALUE */}
          <span
            className="font-mono"
            style={{
              color: "var(--text)",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {p.dynasty_value != null
              ? p.dynasty_value.toLocaleString()
              : "—"}
          </span>

          {/* 30D TREND */}
          <TrendArrow value={p.trend_30day} />
        </div>
      ))}

      {players.length === 0 && (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          No player exposure data found
        </div>
      )}
    </div>
  );
}
