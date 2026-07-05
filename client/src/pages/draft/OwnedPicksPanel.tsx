import type { AggregateNeed, DraftPickContext, RookieDraftContext } from "@shared/types";
import PickCard from "./PickCard";

type OwnedPicksPanelProps = {
  draftContext: RookieDraftContext | undefined;
};

export default function OwnedPicksPanel({ draftContext }: OwnedPicksPanelProps) {
  if (!draftContext || draftContext.picks_2026.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 20px",
        marginTop: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Your 2026 Picks</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
            {draftContext.picks_2026.length} pick{draftContext.picks_2026.length !== 1 ? "s" : ""} across {draftContext.total_leagues} leagues
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {draftContext.aggregate_needs
            .filter((need: AggregateNeed) => need.overall_urgency !== "low")
            .map((need: AggregateNeed) => (
              <span
                key={need.position}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: need.overall_urgency === "critical" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                  color: need.overall_urgency === "critical" ? "var(--red)" : "var(--amber)",
                  border: `1px solid ${
                    need.overall_urgency === "critical" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"
                  }`,
                }}
              >
                {need.position}: {need.overall_urgency === "critical" ? "NEED" : "WANT"}
                {need.leagues_with_hole > 0 && ` (${need.leagues_with_hole} holes)`}
              </span>
            ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {draftContext.picks_2026.map((pick: DraftPickContext, index: number) => (
          <PickCard key={`${pick.league_id}-${pick.round}-${pick.tier}-${index}`} pick={pick} />
        ))}
      </div>
    </div>
  );
}
