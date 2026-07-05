import type { OpponentProfile } from "@shared/types";

const ACTIVITY_STYLES: Record<OpponentProfile["activityLevel"], { bg: string; color: string }> = {
  hyperactive: { bg: "rgba(34,197,94,0.18)", color: "#4ade80" },
  active: { bg: "rgba(59,130,246,0.18)", color: "#60a5fa" },
  moderate: { bg: "rgba(61,139,253,0.18)", color: "#fbbf24" },
  passive: { bg: "rgba(152,162,179,0.18)", color: "#cbd5e1" },
  inactive: { bg: "rgba(239,68,68,0.18)", color: "#f87171" },
};

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function topPosition(record: Record<string, number>): string | null {
  const top = Object.entries(record).sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? null;
}

export default function OpponentCard({
  profile,
  exploitability,
  selected,
  onExploit,
}: {
  profile: OpponentProfile;
  exploitability: number;
  selected: boolean;
  onExploit: () => void;
}) {
  const topBought = topPosition(profile.positionsAcquired);
  const topSold = topPosition(profile.positionsSold);
  const activityStyle = ACTIVITY_STYLES[profile.activityLevel];
  const pickDelta = profile.picksAcquired - profile.picksSold;

  return (
    <div
      style={{
        background: selected ? "rgba(61,139,253,0.08)" : "var(--card)",
        border: selected ? "1px solid rgba(61,139,253,0.45)" : "1px solid var(--border)",
        borderRadius: 14,
        padding: 16,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{profile.displayName}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {profile.totalTrades} trades | {profile.totalWaiverMoves} waiver moves
          </div>
        </div>
        <div
          style={{
            background:
              exploitability >= 70
                ? "rgba(239,68,68,0.2)"
                : exploitability >= 45
                  ? "rgba(61,139,253,0.2)"
                  : "rgba(59,130,246,0.2)",
            color:
              exploitability >= 70
                ? "#fca5a5"
                : exploitability >= 45
                  ? "#fcd34d"
                  : "#93c5fd",
            borderRadius: 999,
            padding: "5px 10px",
            fontSize: 11,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          Exploit {exploitability}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            background: activityStyle.bg,
            color: activityStyle.color,
            borderRadius: 999,
            padding: "4px 8px",
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          {humanize(profile.activityLevel)}
        </span>
        <span style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "4px 8px", fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>
          {humanize(profile.ageBias)}
        </span>
        <span style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "4px 8px", fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>
          {humanize(profile.pickTendency)} {pickDelta === 0 ? "" : pickDelta > 0 ? `+${pickDelta}` : `${pickDelta}`}
        </span>
      </div>

      <div style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
        <div>{topBought ? `Loves ${topBought}s` : "No strong acquisition bias yet"}</div>
        <div>{topSold ? `Sells ${topSold}s` : "No clear sell tendency yet"}</div>
      </div>

      <button
        type="button"
        onClick={onExploit}
        style={{
          border: "1px solid rgba(61,139,253,0.35)",
          background: "rgba(61,139,253,0.14)",
          color: "var(--amber)",
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Exploit
      </button>
    </div>
  );
}
