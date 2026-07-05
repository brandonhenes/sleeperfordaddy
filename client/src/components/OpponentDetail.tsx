import type { ExploitAngle, OpponentProfile } from "@shared/types";

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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function confidenceStyle(confidence: ExploitAngle["confidence"]) {
  if (confidence === "high") {
    return { bg: "rgba(34,197,94,0.16)", color: "#4ade80" };
  }
  if (confidence === "medium") {
    return { bg: "rgba(245,158,11,0.16)", color: "#fbbf24" };
  }
  return { bg: "rgba(148,163,184,0.16)", color: "#cbd5e1" };
}

export default function OpponentDetail({
  profile,
  angles,
  isLoading,
  onFindTrades,
  onClose,
}: {
  profile: OpponentProfile;
  angles: ExploitAngle[];
  isLoading: boolean;
  onFindTrades: () => void;
  onClose: () => void;
}) {
  const topBought = topPosition(profile.positionsAcquired);
  const topSold = topPosition(profile.positionsSold);
  const pickDelta = profile.picksAcquired - profile.picksSold;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
        display: "grid",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{profile.displayName}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Profiled {formatDate(profile.profiledAt)} | {profile.seasonsAnalyzed} season{profile.seasonsAnalyzed !== 1 ? "s" : ""} analyzed
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {profile.isStale && (
            <span
              style={{
                background: "rgba(245,158,11,0.16)",
                color: "#fbbf24",
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              Stale data
            </span>
          )}
          <button
            type="button"
            onClick={onFindTrades}
            style={{
              border: "1px solid rgba(245,158,11,0.35)",
              background: "rgba(245,158,11,0.14)",
              color: "var(--amber)",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Find Trades
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Close
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <div style={{ background: "var(--dark-base)", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, marginBottom: 6 }}>ACTIVITY</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{humanize(profile.activityLevel)}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
            {profile.totalTrades} trades | {profile.totalWaiverMoves} waiver moves
          </div>
        </div>
        <div style={{ background: "var(--dark-base)", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, marginBottom: 6 }}>AGE BIAS</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{humanize(profile.ageBias)}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
            Acquires {profile.avgAgeAcquired ?? "n/a"} | Sells {profile.avgAgeSold ?? "n/a"}
          </div>
        </div>
        <div style={{ background: "var(--dark-base)", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, marginBottom: 6 }}>PICKS</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{humanize(profile.pickTendency)}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
            {profile.picksAcquired} in | {profile.picksSold} out | net {pickDelta > 0 ? `+${pickDelta}` : pickDelta}
          </div>
        </div>
        <div style={{ background: "var(--dark-base)", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, marginBottom: 6 }}>POSITION TELL</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{topBought ? `Buys ${topBought}` : "Neutral buyer"}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
            {topSold ? `Most often sells ${topSold}` : "No strong sell signal yet"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div style={{ background: "var(--dark-base)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--amber)", marginBottom: 10 }}>TENDENCY SNAPSHOT</div>
          <div style={{ display: "grid", gap: 8, fontSize: 12, color: "var(--text-dim)" }}>
            <div>Top acquired positions: {Object.entries(profile.positionsAcquired).slice(0, 3).map(([pos, count]) => `${pos} (${count})`).join(", ") || "None yet"}</div>
            <div>Top sold positions: {Object.entries(profile.positionsSold).slice(0, 3).map(([pos, count]) => `${pos} (${count})`).join(", ") || "None yet"}</div>
            <div>Waiver targets: {Object.entries(profile.waiverTargets).slice(0, 3).map(([pos, count]) => `${pos} (${count})`).join(", ") || "None yet"}</div>
            <div>Top trade partners: {Object.entries(profile.tradePartners).slice(0, 3).map(([rosterId, count]) => `Roster ${rosterId} (${count})`).join(", ") || "None yet"}</div>
          </div>
        </div>

        <div style={{ background: "var(--dark-base)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#60a5fa", marginBottom: 10 }}>EXPLOIT ANGLES</div>
          {isLoading && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              <span className="animate-pulse">Building exploit angles...</span>
            </div>
          )}
          {!isLoading && angles.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              No strong exploit angles yet for this roster.
            </div>
          )}
          {!isLoading && angles.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              {angles.map((angle, index) => {
                const style = confidenceStyle(angle.confidence);
                return (
                  <div key={`${angle.strategy}-${index}`} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{angle.strategy}</div>
                      <span style={{ background: style.bg, color: style.color, borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 800 }}>
                        {humanize(angle.confidence)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--amber)", fontWeight: 700, marginTop: 6 }}>{angle.offer}</div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, marginTop: 6 }}>{angle.reasoning}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      Exploiting: {angle.tendencyExploited}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: "var(--dark-base)", borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--green)", marginBottom: 10 }}>RECENT TRADES</div>
        {profile.recentTrades.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No completed trades found in the sampled seasons.</div>
        )}
        {profile.recentTrades.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {profile.recentTrades.map((trade) => (
              <div key={trade.transactionId} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>
                    {trade.partnerDisplayName ?? "Unknown partner"} | {trade.season}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatDate(trade.date)}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "var(--green)", marginBottom: 4 }}>ACQUIRED</div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
                      {trade.acquired.join(", ") || "None"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#f87171", marginBottom: 4 }}>SOLD</div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
                      {trade.sold.join(", ") || "None"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
