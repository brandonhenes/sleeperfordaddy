import { PlayerLink } from "../../components/ui";
import type { Prospect } from "../../hooks/use-market";
import { posColor } from "../../lib/position-colors";
import TierBadge from "./TierBadge";

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;

type PositionalProspectsViewProps = {
  byPosition: Record<string, Prospect[]>;
};

export default function PositionalProspectsView({ byPosition }: PositionalProspectsViewProps) {
  return (
    <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {POSITIONS.map((pos) => {
        const prospects = byPosition[pos] ?? [];
        if (prospects.length === 0) return null;

        return (
          <div
            key={pos}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}
          >
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 16, color: posColor(pos) }}>{pos}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {prospects.length} prospects
              </span>
            </div>
            {prospects.map((p, i) => (
              <div
                key={p.player_name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 16px",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 13,
                }}
              >
                <span
                  className="font-mono"
                  style={{ width: 24, fontWeight: 700, color: "var(--text-muted)", textAlign: "center" }}
                >
                  {p.fp_rank ?? p.fantasypros_rank ?? i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <PlayerLink name={p.player_name} style={{ fontSize: 13 }} />
                  {p.school && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{p.school}</span>}
                </div>
                <TierBadge tier={p.tier} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
