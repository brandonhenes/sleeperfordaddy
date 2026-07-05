import EdgeScoreBadge from "../EdgeScoreBadge";
import { PlayerLink } from "../ui";
import type { ActionFeedItem } from "@shared/types";

const CARD_ACCENTS: Record<
  ActionFeedItem["type"],
  { bg: string; border: string; label: string; color: string }
> = {
  sell_high: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", label: "SELL HIGH", color: "#ef4444" },
  buy_low: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", label: "BUY LOW", color: "#22c55e" },
  roster_move: { bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)", label: "ROSTER MOVE", color: "#3b82f6" },
  exposure_alert: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", label: "EXPOSURE ALERT", color: "#f59e0b" },
};

export default function ActionsFeed({ items }: { items: ActionFeedItem[] }) {
  if (items.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {items.map((item, i) => {
        const accent = CARD_ACCENTS[item.type];
        return (
          <div
            key={i}
            style={{
              flex: "1 1 260px",
              background: accent.bg,
              border: `1px solid ${accent.border}`,
              borderRadius: 12,
              padding: "16px 18px",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  color: accent.color,
                  textTransform: "uppercase",
                }}
              >
                {accent.label}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <PlayerLink name={item.player_name} style={{ fontSize: 14 }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                {item.position}
              </span>
              <EdgeScoreBadge score={item.edge_score} size="sm" />
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px", lineHeight: 1.4 }}>
              {item.signal}
            </p>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {item.leagues.join(", ")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
