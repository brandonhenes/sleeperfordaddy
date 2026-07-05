import type { Prospect } from "@shared/types";
import type { ProspectRanking } from "@shared/types";
import type { DraftPickContext, PickValueReference } from "@shared/types";
import ProspectCard from "./ProspectCard";
import { TIER_CONFIG, TIER_ORDER } from "./rookie-draft-config";
import TierPickValueOverlay from "./TierPickValueOverlay";

type BigBoardViewProps = {
  byTier: Record<string, Prospect[]>;
  overallRanks: Map<string, number>;
  compareList: string[];
  watchlist: Set<string>;
  rankingsMap: Map<string, ProspectRanking>;
  pickValues?: PickValueReference[];
  userPicks2026?: DraftPickContext[];
  onToggleCompare: (name: string) => void;
  onToggleWatch: (name: string) => void;
};

export default function BigBoardView({
  byTier,
  overallRanks,
  compareList,
  watchlist,
  rankingsMap,
  pickValues,
  userPicks2026,
  onToggleCompare,
  onToggleWatch,
}: BigBoardViewProps) {
  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 20 }}>
      {TIER_ORDER.map((tier) => {
        const prospects = byTier[tier];
        if (!prospects || prospects.length === 0) return null;
        const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.flier;

        return (
          <div key={tier} style={{ border: `1px solid ${cfg.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div
              style={{
                background: cfg.headerBg,
                padding: "10px 18px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderBottom: `1px solid ${cfg.border}`,
              }}
            >
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1,
                  background: cfg.bg,
                  color: cfg.text,
                  border: `1px solid ${cfg.border}`,
                }}
              >
                {cfg.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {prospects.length} prospect{prospects.length !== 1 ? "s" : ""}
              </span>
              {pickValues && userPicks2026 && (
                <TierPickValueOverlay tier={tier} pickValues={pickValues} userPicks2026={userPicks2026} />
              )}
            </div>

            <div style={{ background: cfg.bg }}>
              {prospects.map((p) => (
                <ProspectCard
                  key={p.player_name}
                  prospect={p}
                  overallRank={overallRanks.get(p.player_name) ?? 0}
                  tierColor={cfg.text}
                  isComparing={compareList.includes(p.player_name)}
                  onToggleCompare={() => onToggleCompare(p.player_name)}
                  isWatched={watchlist.has(p.player_name)}
                  onToggleWatch={() => onToggleWatch(p.player_name)}
                  ranking={rankingsMap.get(p.player_name.toLowerCase())}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
