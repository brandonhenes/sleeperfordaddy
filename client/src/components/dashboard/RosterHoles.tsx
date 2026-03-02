import EdgeScoreBadge from "../EdgeScoreBadge";
import { posColor } from "../../lib/position-colors";
import type { RosterHole } from "../../hooks/use-dashboard";

function slotLabelColor(score: number): string {
  if (score < 65) return "#ef4444";
  if (score < 75) return "#f97316";
  return "var(--text-muted)";
}

export default function RosterHoles({ holes }: { holes: RosterHole[] }) {
  if (holes.length === 0) {
    return <EmptySection label="No roster holes found" />;
  }
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      {holes.map((h, i) => (
        <div
          key={`${h.league_id}-${h.slot_label}-${i}`}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 16px",
            borderBottom: i < holes.length - 1 ? "1px solid var(--border)" : "none",
            gap: 10,
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 12, fontWeight: 700, color: slotLabelColor(h.edge_score), minWidth: 28 }}
          >
            {h.slot_label}
          </span>
          <span style={{ fontSize: 13, color: "var(--text-muted)", minWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {h.league_name}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {h.player_name}
          </span>
          <EdgeScoreBadge score={h.edge_score} />
        </div>
      ))}
    </div>
  );
}

function EmptySection({ label }: { label: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}
