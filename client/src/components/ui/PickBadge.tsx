import type { PickValue, TradePickBreakdown } from "@shared/types";

type PickLike = PickValue | TradePickBreakdown;

const ROUND_STYLES: Record<number, { background: string; border: string; color: string }> = {
  1: {
    background: "rgba(245,158,11,0.14)",
    border: "1px solid rgba(245,158,11,0.28)",
    color: "#fbbf24",
  },
  2: {
    background: "rgba(148,163,184,0.16)",
    border: "1px solid rgba(148,163,184,0.28)",
    color: "#cbd5e1",
  },
  3: {
    background: "rgba(180,83,9,0.16)",
    border: "1px solid rgba(180,83,9,0.28)",
    color: "#fdba74",
  },
  4: {
    background: "rgba(107,114,128,0.16)",
    border: "1px solid rgba(107,114,128,0.28)",
    color: "#d1d5db",
  },
};

function tierLabel(tier: PickLike["tier"]): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function fallbackLabel(pick: PickLike): string {
  const explicit = "pickLabel" in pick ? pick.pickLabel : null;
  if (explicit) return explicit;
  return `${pick.season} ${tierLabel(pick.tier)} ${pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `R${pick.round}`}`;
}

export default function PickBadge({
  pick,
  compact = false,
}: {
  pick: PickLike;
  compact?: boolean;
}) {
  const style = ROUND_STYLES[pick.round] ?? ROUND_STYLES[4];
  const tooltip = [
    `Tier: ${tierLabel(pick.tier)}`,
    `Projected slot: ${pick.round}.${String(pick.pickSlot).padStart(2, "0")}`,
    `Base Edge: ${pick.baseEdgeValue.toFixed(1)}`,
    `Year discount: x${pick.futureYearDiscount.toFixed(2)}`,
    `Class modifier: x${pick.classStrengthModifier.toFixed(2)}`,
    pick.projectedProspect ? `Prospect: ${pick.projectedProspect}` : null,
    pick.prospectTier != null ? `Prospect tier: ${pick.prospectTier}` : null,
  ].filter(Boolean).join(" | ");

  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 6 : 8,
        borderRadius: 999,
        padding: compact ? "4px 10px" : "6px 12px",
        background: style.background,
        border: style.border,
        color: style.color,
        fontSize: compact ? 11 : 12,
        fontWeight: 700,
        flexWrap: "wrap",
      }}
    >
      <span>{fallbackLabel(pick)}</span>
      <span style={{ opacity: 0.8, fontSize: compact ? 10 : 11 }}>
        {tierLabel(pick.tier)}
      </span>
      <span style={{ color: "#f8fafc", fontSize: compact ? 10 : 11 }}>
        Edge {Math.round(pick.finalValue)}
      </span>
    </span>
  );
}
