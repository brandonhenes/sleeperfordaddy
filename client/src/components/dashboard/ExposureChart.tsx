import EdgeScoreBadge from "../EdgeScoreBadge";
import { PlayerLink } from "../ui";
import { posColor } from "../../lib/position-colors";
import type { ExposureEntry } from "@shared/types";

export default function ExposureChart({ players }: { players: ExposureEntry[] }) {
  if (players.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        No exposure data
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      {players.slice(0, 15).map((p, i) => (
        <div
          key={p.player_id}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 16px",
            borderBottom: i < Math.min(players.length, 15) - 1 ? "1px solid var(--border)" : "none",
            gap: 10,
          }}
        >
          <PlayerLink name={p.full_name} style={{ fontSize: 13 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: posColor(p.position) }}>{p.position}</span>
          <EdgeScoreBadge score={p.edge_score} />
          <span className="font-mono" style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 55, textAlign: "right" }}>
            {p.leagues_owned}/{p.total_leagues}
          </span>
          <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)", minWidth: 36, textAlign: "right" }}>
            {p.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}
