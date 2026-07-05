import { Link } from "wouter";
import { ShoppingBag } from "lucide-react";
import type { PortfolioPlayer } from "@shared/types";
import {
  ExposureBar,
  PlayerLink,
  PositionBadge,
  ResponsiveTable,
  type ResponsiveTableColumn,
} from "./ui";
import PlayerStatusBadge from "./ui/PlayerStatusBadge";
import EdgeScoreBadge from "./EdgeScoreBadge";
import { useCurrentUser } from "./CurrentUserContext";

const ZONE_COLORS: Record<string, string> = {
  Prime: "#f59e0b",
  Ascent: "#22c55e",
  Decline: "#f97316",
  Cliff: "#ef4444",
};

interface ExposureTableProps {
  players: PortfolioPlayer[];
}

export default function ExposureTable({ players }: ExposureTableProps) {
  const { username } = useCurrentUser();

  const columns: ResponsiveTableColumn<PortfolioPlayer>[] = [
    {
      key: "player",
      header: "Player",
      render: (p) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
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
              {p.action_needed.type === "risk" ? "!" : "Fade"}
            </span>
          )}
          <PlayerLink name={p.full_name} style={{ fontSize: 13 }} />
          <PlayerStatusBadge availability={p.availability} />
        </div>
      ),
    },
    {
      key: "position",
      header: "Pos",
      render: (p) => <PositionBadge position={p.position} />,
    },
    {
      key: "age",
      header: "Age",
      render: (p) =>
        p.age != null ? (
          <span style={{ fontSize: 12, color: ZONE_COLORS[p.age_zone ?? ""] ?? "var(--text-dim)" }}>
            {p.age}
            {p.age_zone ? ` \u00B7 ${p.age_zone}` : ""}
          </span>
        ) : (
          <span style={{ color: "var(--text-dim)" }}>{"\u2014"}</span>
        ),
    },
    {
      key: "edge",
      header: "Edge",
      render: (p) => <EdgeScoreBadge score={p.edge_score} />,
    },
    {
      key: "sources",
      header: "Sources",
      render: (p) => (
        <div className="font-mono" style={{ display: "flex", gap: 6, fontSize: 11, justifyContent: "flex-end" }}>
          {p.fc_score != null && <span style={{ color: "var(--amber)" }}>{p.fc_score.toFixed(1)}</span>}
          {p.ktc_score != null && <span style={{ color: "#3b82f6" }}>{p.ktc_score.toFixed(1)}</span>}
          {p.fp_score != null && <span style={{ color: "#7c3aed" }}>{p.fp_score.toFixed(1)}</span>}
          {p.sources_available === 0 && <span style={{ color: "var(--text-dim)" }}>{"\u2014"}</span>}
        </div>
      ),
      align: "right",
    },
    {
      key: "signal",
      header: "Signal",
      render: (p) => (
        <div style={{ textAlign: "center" }}>
          {p.disagreement_direction === "sell_signal" && (
            <span
              title={`Crowd overvalues by ${Math.round(Math.abs(p.ktc_vs_experts ?? 0))}pts`}
              style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}
            >
              SELL
            </span>
          )}
          {p.disagreement_direction === "buy_signal" && (
            <span
              title={`Experts see ${Math.round(Math.abs(p.ktc_vs_experts ?? 0))}pts more value`}
              style={{ color: "#22c55e", fontSize: 13, fontWeight: 700 }}
            >
              BUY
            </span>
          )}
          {(p.disagreement_direction === "neutral" || p.disagreement_direction == null) && (
            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{"\u2014"}</span>
          )}
        </div>
      ),
    },
    {
      key: "leagues",
      header: "Leagues",
      render: (p) => (
        <span className="font-mono" style={{ fontSize: 12, fontWeight: 600 }}>
          {p.leagues_owned}/{p.total_leagues}
        </span>
      ),
      align: "right",
    },
    {
      key: "exposure",
      header: "Exposure",
      render: (p) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 90 }}>
          <ExposureBar leagueCount={p.leagues_owned} totalLeagues={p.total_leagues} showLabel={false} />
          <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {p.pct}%
          </span>
        </div>
      ),
      align: "right",
    },
    {
      key: "shop",
      header: "",
      cardLabel: "Action",
      render: (p) => (
        <Link
          href={`/trade-finder/${encodeURIComponent(username)}?mode=shop&player=${encodeURIComponent(p.player_id)}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "var(--amber)",
            textDecoration: "none",
          }}
          title="Shop this player"
          aria-label={`Shop ${p.full_name}`}
        >
          <ShoppingBag size={15} strokeWidth={2.4} />
        </Link>
      ),
      align: "right",
    },
  ];

  return (
    <ResponsiveTable
      rows={players}
      columns={columns}
      getRowKey={(p) => p.player_id}
      emptyLabel="No player exposure data found."
    />
  );
}
