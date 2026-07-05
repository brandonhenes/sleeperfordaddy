import { PickBadge } from "../../components/ui";
import type { PickValue } from "@shared/types";

export interface LeaguePicksResponse {
  picks: PickValue[];
  totalPickValue: number;
  picksByRound: Record<string, PickValue[]>;
}

export default function PickInventoryPanel({
  data,
  isLoading,
}: {
  data: LeaguePicksResponse | undefined;
  isLoading: boolean;
}) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Pick Inventory
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
            Current direct pick value across the league
          </div>
        </div>
        {data && (
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--amber)" }}>
            Total Edge {Math.round(data.totalPickValue)}
          </div>
        )}
      </div>
      {isLoading && (
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
          <span className="animate-pulse">Loading pick values...</span>
        </div>
      )}
      {!isLoading && (!data || data.picks.length === 0) && (
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No owned picks found in this league.</div>
      )}
      {data && data.picks.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.picks.map((pick) => (
            <PickBadge
              key={`${pick.season}-${pick.round}-${pick.pickSlot}-${pick.originalOwnerRosterId ?? "x"}`}
              pick={pick}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
