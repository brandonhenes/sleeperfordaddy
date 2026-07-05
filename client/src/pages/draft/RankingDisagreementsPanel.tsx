import type { Prospect } from "@shared/types";
import { TIER_CONFIG } from "./rookie-draft-config";

type DisagreementSection = {
  title: string;
  arrow: string;
  color: string;
  bg: string;
  border: string;
  items: Prospect[];
  label: string;
};

type RankingDisagreementsPanelProps = {
  sleeperDisagreements: Prospect[];
  fadingDisagreements: Prospect[];
};

export default function RankingDisagreementsPanel({
  sleeperDisagreements,
  fadingDisagreements,
}: RankingDisagreementsPanelProps) {
  const sections: DisagreementSection[] = [
    {
      title: "SLEEPER",
      arrow: "\u2191",
      color: "#22c55e",
      bg: "rgba(34,197,94,0.08)",
      border: "rgba(34,197,94,0.25)",
      items: sleeperDisagreements,
      label: "PFF/market data suggests undervalued",
    },
    {
      title: "FADING",
      arrow: "\u2193",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.25)",
      items: fadingDisagreements,
      label: "PFF/market data suggests overvalued",
    },
  ].filter((section) => section.items.length > 0);

  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  if (total === 0) return null;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 18px",
        marginTop: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 10 }}>
        RANKING DISAGREEMENTS ({total})
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {sections.map((section) => (
          <div
            key={section.title}
            style={{ background: "var(--dark-base)", border: `1px solid ${section.border}`, borderRadius: 8, padding: "10px 12px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: section.color, fontSize: 11, fontWeight: 700 }}>
              <span>{section.arrow}</span>
              <span>{section.title}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {section.items.map((prospect) => (
                <div
                  key={prospect.player_name}
                  style={{ background: section.bg, border: `1px solid ${section.border}`, borderRadius: 8, padding: "8px 10px" }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{prospect.player_name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
                    {(TIER_CONFIG[prospect.tier ?? "flier"]?.label ?? (prospect.tier ?? "FLIER")).toUpperCase()} tier
                  </div>
                  <div style={{ fontSize: 10, color: section.color, marginTop: 2, lineHeight: 1.4 }}>
                    {prospect.player_name} -- {section.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
