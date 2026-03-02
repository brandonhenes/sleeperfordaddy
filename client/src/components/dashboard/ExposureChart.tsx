import EdgeScoreBadge from "../EdgeScoreBadge";
import { posColor } from "../../lib/position-colors";
import type { ExposureEntry } from "../../hooks/use-dashboard";

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
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.full_name}
          </span>
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
