import type { DraftPickContext, PickValueReference } from "@shared/types";

const TIER_PICK_MAP: Record<string, { round: number; tier: string }[]> = {
  elite: [{ round: 1, tier: "early" }],
  day1: [{ round: 1, tier: "mid" }, { round: 1, tier: "late" }],
  day2: [{ round: 2, tier: "early" }, { round: 2, tier: "mid" }],
  day3: [{ round: 2, tier: "late" }, { round: 3, tier: "early" }],
  flier: [{ round: 3, tier: "mid" }, { round: 3, tier: "late" }],
};

interface TierPickValueOverlayProps {
  tier: string;
  pickValues: PickValueReference[];
  userPicks2026: DraftPickContext[];
}

export default function TierPickValueOverlay({
  tier,
  pickValues,
  userPicks2026,
}: TierPickValueOverlayProps) {
  const pickRefs = TIER_PICK_MAP[tier] ?? [];
  const values = pickRefs
    .map((ref) => pickValues.find(
      (pv) => pv.season === 2026 && pv.round === ref.round && pv.tier === ref.tier
    ))
    .filter((v): v is PickValueReference => !!v);

  if (values.length === 0) return null;

  const minVal = Math.min(...values.map((v) => v.ktc_sf));
  const maxVal = Math.max(...values.map((v) => v.ktc_sf));
  const valStr = minVal === maxVal
    ? `~${minVal.toLocaleString()} KTC`
    : `${minVal.toLocaleString()} - ${maxVal.toLocaleString()} KTC`;

  const userPicksHere = userPicks2026.filter((p) =>
    pickRefs.some((ref) => p.round === ref.round && p.tier === ref.tier)
  );

  return (
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
      <span className="font-mono" style={{ color: "var(--text-dim)" }}>
        Pick value: {valStr}
      </span>
      {userPicksHere.length > 0 && (
        <span style={{
          background: "var(--amber)",
          color: "var(--dark-base)",
          padding: "2px 8px",
          borderRadius: 4,
          fontWeight: 700,
          fontSize: 10,
        }}>
          YOU PICK HERE ({userPicksHere.length})
        </span>
      )}
    </div>
  );
}
