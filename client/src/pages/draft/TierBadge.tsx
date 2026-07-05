import { TIER_CONFIG } from "./rookie-draft-config";

export default function TierBadge({ tier }: { tier: string | null }) {
  const cfg = TIER_CONFIG[(tier ?? "flier").toLowerCase()] ?? TIER_CONFIG.flier;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, background: cfg.bg, color: cfg.text }}>
      {cfg.label}
    </span>
  );
}
