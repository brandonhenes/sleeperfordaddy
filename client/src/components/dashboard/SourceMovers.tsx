import { posColor } from "../../lib/position-colors";
import { PlayerLink } from "../ui";
import type { DashboardData, SourceMover } from "../../hooks/use-dashboard";

function MoverRow({ m, direction }: { m: SourceMover; direction: "up" | "down" }) {
  const changeColor = direction === "up" ? "#22c55e" : "#ef4444";
  const arrow = direction === "up" ? "\u2191" : "\u2193";
  const sign = direction === "up" ? "+" : "";
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "8px 0", gap: 8 }}>
      <PlayerLink name={m.full_name} style={{ fontSize: 13 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: posColor(m.position) }}>{m.position}</span>
      <span className="font-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {m.previous_score.toFixed(1)} {arrow} {m.current_score.toFixed(1)}
      </span>
      <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: changeColor, minWidth: 36, textAlign: "right" }}>
        ({sign}{m.change.toFixed(1)})
      </span>
      <span style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
        {m.leagues_owned}L
      </span>
    </div>
  );
}

export default function SourceMovers({ movers }: { movers: DashboardData["source_movers"] }) {
  if (!movers.has_data) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        Tracking started. Movers will appear after the next data sync.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", letterSpacing: 1, marginBottom: 8 }}>RISERS</div>
        {movers.risers.length === 0
          ? <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No significant risers</div>
          : movers.risers.map((m) => <MoverRow key={m.player_id} m={m} direction="up" />)
        }
      </div>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", letterSpacing: 1, marginBottom: 8 }}>FALLERS</div>
        {movers.fallers.length === 0
          ? <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No significant fallers</div>
          : movers.fallers.map((m) => <MoverRow key={m.player_id} m={m} direction="down" />)
        }
      </div>
    </div>
  );
}
