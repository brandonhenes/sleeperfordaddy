import type { Dispatch, SetStateAction } from "react";
import type { AcquisitionDepth } from "../../hooks/use-acquisition";
import type { AcquisitionResult } from "@shared/types";
import AcquisitionCard from "./AcquisitionCard";

export interface AcquisitionSearchResult {
  player_id: string;
  label: string;
  position: string;
  team: string | null;
}

export interface SelectedAcquisitionTarget {
  name: string;
  id: string;
}

interface AcquisitionPanelProps {
  username: string;
  targetSearch: string;
  setTargetSearch: Dispatch<SetStateAction<string>>;
  selectedTarget: SelectedAcquisitionTarget | null;
  setSelectedTarget: Dispatch<SetStateAction<SelectedAcquisitionTarget | null>>;
  acquisitionDepth: AcquisitionDepth;
  setAcquisitionDepth: Dispatch<SetStateAction<AcquisitionDepth>>;
  targetResults: AcquisitionSearchResult[];
  acquisitionData: AcquisitionResult | undefined;
  acquisitionLoading: boolean;
}

export default function AcquisitionPanel({
  username,
  targetSearch,
  setTargetSearch,
  selectedTarget,
  setSelectedTarget,
  acquisitionDepth,
  setAcquisitionDepth,
  targetResults,
  acquisitionData,
  acquisitionLoading,
}: AcquisitionPanelProps) {
  return (
    <div>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: 0.5 }}>WHO DO YOU WANT?</label>
        <input
          value={targetSearch}
          onChange={(e) => {
            setTargetSearch(e.target.value);
            setSelectedTarget(null);
            setAcquisitionDepth("quick");
          }}
          placeholder="Search for a player..."
          style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
        />
        {targetResults.length > 0 && !selectedTarget && (
          <div style={{ marginTop: 8, display: "grid", gap: 4, maxHeight: 240, overflowY: "auto" }}>
            {targetResults.map((result) => (
              <button
                key={result.player_id}
                onClick={() => {
                  setSelectedTarget({ name: result.label, id: result.player_id });
                  setTargetSearch(result.label);
                  setAcquisitionDepth("quick");
                }}
                style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", background: "none", color: "var(--text)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left", width: "100%" }}
              >
                <span style={{ fontWeight: 700, fontSize: 11, width: 24 }}>{result.position}</span>
                <span style={{ flex: 1 }}>{result.label}</span>
                {result.team && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{result.team}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {acquisitionLoading && selectedTarget && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
          <span className="animate-pulse" style={{ color: "var(--amber)", fontSize: 14 }}>
            {acquisitionDepth === "quick" ? "Finding the best acquisition paths first..." : "Loading the full acquisition board..."}
          </span>
        </div>
      )}

      {acquisitionData && !acquisitionLoading && (
        <div style={{ marginTop: 16 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>{acquisitionData.summary}</div>
          {acquisitionData.partial_results && (
            <div style={{ background: "rgba(61,139,253,0.08)", border: "1px solid rgba(61,139,253,0.24)", borderRadius: 10, padding: "12px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-dim)" }}>
              <span>{acquisitionData.warnings?.[0] ?? "Showing the fastest acquisition paths first."}</span>
              <button
                type="button"
                onClick={() => setAcquisitionDepth("full")}
                style={{ border: "1px solid rgba(59,130,246,0.65)", background: "rgba(59,130,246,0.14)", color: "#93c5fd", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
              >
                Load full board
              </button>
            </div>
          )}
          {acquisitionData.opportunities.length === 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              This player is not owned by anyone else in your leagues (or you own them in every league).
            </div>
          )}
          {acquisitionData.opportunities.map((opportunity) => (
            <AcquisitionCard key={opportunity.league_id} opportunity={opportunity} username={username} />
          ))}
        </div>
      )}
    </div>
  );
}
