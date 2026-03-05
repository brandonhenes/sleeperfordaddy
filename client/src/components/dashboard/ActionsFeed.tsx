import { Link } from "wouter";
import { posColor } from "../../lib/position-colors";
import type { ActionFeedItem } from "../../hooks/use-dashboard";

const CARD_ACCENTS: Record<ActionFeedItem["type"], { bg: string; border: string; label: string; color: string }> = {
  sell_high: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", label: "SELL HIGH", color: "#ef4444" },
  buy_low: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", label: "BUY LOW", color: "#22c55e" },
  roster_move: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)", label: "ROSTER MOVE", color: "#3b82f6" },
};

export default function ActionsFeed({ actions }: { actions: ActionFeedItem[] }) {
  if (actions.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: `repeat(${Math.min(actions.length, 3)}, 1fr)` }}>
      {actions.map((a, i) => {
        const accent = CARD_ACCENTS[a.type];
        return (
          <div
            key={i}
            style={{
              background: accent.bg,
              border: `1px solid ${accent.border}`,
              borderRadius: 10,
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1,
                  color: accent.color,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: "rgba(0,0,0,0.2)",
                }}
              >
                {accent.label}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {a.leagues[0]}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Link href={`/player/${encodeURIComponent(a.player_name)}`}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  {a.player_name}
                </span>
              </Link>
              <span style={{ fontSize: 11, fontWeight: 600, color: posColor(a.position) }}>
                {a.position}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 13,
                  fontWeight: 700,
                  color: accent.color,
                }}
                className="font-mono"
              >
                {Math.round(a.edge_score)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>
              {a.signal}
            </div>
          </div>
        );
      })}
    </div>
  );
}
