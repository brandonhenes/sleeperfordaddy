import type { Dispatch, Ref, SetStateAction } from "react";
import OpponentCard from "../../components/OpponentCard";
import OpponentDetail from "../../components/OpponentDetail";
import { formatDateTime } from "../../lib/format";
import type { ExploitAngle, LeaguePowerRanking, OpponentProfile, OpponentProfilesResponse } from "@shared/types";

export interface ScoutProfileWithScore {
  profile: OpponentProfile;
  exploitability: number;
}

function getActivityWeight(level: OpponentProfile["activityLevel"]): number {
  if (level === "hyperactive") return 100;
  if (level === "active") return 80;
  if (level === "moderate") return 50;
  if (level === "passive") return 20;
  return 0;
}

function getTendencyStrength(profile: OpponentProfile): number {
  const acquired = Object.values(profile.positionsAcquired);
  const sold = Object.values(profile.positionsSold);
  const acquiredSpread = acquired.length > 0 ? Math.max(...acquired) - Math.min(...acquired) : 0;
  const soldSpread = sold.length > 0 ? Math.max(...sold) - Math.min(...sold) : 0;
  const ageWeight =
    profile.ageBias === "youth_chaser" || profile.ageBias === "win_now_buyer"
      ? 30
      : profile.ageBias === "leans_young" || profile.ageBias === "leans_vet"
        ? 15
        : 0;
  const pickWeight =
    profile.pickTendency === "hoarder" || profile.pickTendency === "spender"
      ? 20
      : profile.pickTendency === "accumulator" || profile.pickTendency === "seller"
        ? 10
        : 0;
  return Math.min(100, acquiredSpread * 8 + soldSpread * 6 + ageWeight + pickWeight);
}

function getRosterGapScore(profile: OpponentProfile, league: LeaguePowerRanking | undefined): number {
  const roster = league?.rosters.find((entry) => entry.roster_id === profile.rosterId);
  const slotGrades = roster?.lineup?.slot_grades ?? [];
  let score = 0;
  for (const grade of slotGrades) {
    if (grade.grade === "hole") score += 22;
    else if (grade.grade === "weak") score += 12;
    else if (grade.grade === "average") score += 4;
  }
  return Math.min(100, score);
}

function getExploitability(profile: OpponentProfile, league: LeaguePowerRanking | undefined): number {
  const activityWeight = getActivityWeight(profile.activityLevel);
  const tendencyStrength = getTendencyStrength(profile);
  const rosterGapScore = getRosterGapScore(profile, league);
  return Math.round(
    activityWeight * 0.4 + tendencyStrength * 0.3 + rosterGapScore * 0.3
  );
}

export function scoreScoutProfiles(
  profiles: OpponentProfile[],
  league: LeaguePowerRanking | undefined
): ScoutProfileWithScore[] {
  return profiles
    .map((profile) => ({
      profile,
      exploitability: getExploitability(profile, league),
    }))
    .sort((a, b) => b.exploitability - a.exploitability);
}

interface ScoutPanelProps {
  username: string;
  leagues: LeaguePowerRanking[] | undefined;
  leaguesLoading: boolean;
  selectedLeague: string;
  setSelectedLeague: Dispatch<SetStateAction<string>>;
  scoutRouteWarning: string | null;
  scoutProfilesWithScores: ScoutProfileWithScore[];
  selectedScoutRosterId: number | null;
  selectedScoutProfile: OpponentProfile | null;
  scoutProfilesData: OpponentProfilesResponse | undefined;
  scoutProfilesLoading: boolean;
  scoutProfilesError: unknown;
  onRefreshProfiles: () => void;
  refreshProfilesPending: boolean;
  exploitAngles: ExploitAngle[];
  exploitAnglesLoading: boolean;
  exploitAnglesError: unknown;
  scoutDetailRef: Ref<HTMLDivElement>;
  onOpenExploit: (rosterId: number) => void;
  onFindTrades: () => void;
  onCloseDetail: () => void;
}

export default function ScoutPanel({
  leagues,
  leaguesLoading,
  selectedLeague,
  setSelectedLeague,
  scoutRouteWarning,
  scoutProfilesWithScores,
  selectedScoutRosterId,
  selectedScoutProfile,
  scoutProfilesData,
  scoutProfilesLoading,
  scoutProfilesError,
  onRefreshProfiles,
  refreshProfilesPending,
  exploitAngles,
  exploitAnglesLoading,
  exploitAnglesError,
  scoutDetailRef,
  onOpenExploit,
  onFindTrades,
  onCloseDetail,
}: ScoutPanelProps) {
  const scoutProfilesErrorMessage =
    scoutProfilesError instanceof Error ? scoutProfilesError.message : "Failed to load opponent profiles.";
  const exploitAnglesErrorMessage =
    exploitAnglesError instanceof Error ? exploitAnglesError.message : "Failed to load exploit angles.";

  return (
    <div>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Select League</label>
            {leaguesLoading ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}><span className="animate-pulse">Loading leagues...</span></div>
            ) : (
              <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)} style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, cursor: "pointer" }}>
                <option value="">Choose a league...</option>
                {leagues?.map((league) => <option key={league.league_id} value={league.league_id}>{league.league_name} ({league.mode.toUpperCase()}{league.scoring_label ? ` | ${league.scoring_label}` : ""})</option>)}
              </select>
            )}
          </div>

          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
            <button
              type="button"
              onClick={onRefreshProfiles}
              disabled={!selectedLeague || refreshProfilesPending}
              style={{
                border: "1px solid rgba(61,139,253,0.35)",
                background: "rgba(61,139,253,0.14)",
                color: "var(--amber)",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 12,
                fontWeight: 800,
                cursor: !selectedLeague || refreshProfilesPending ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: !selectedLeague ? 0.6 : 1,
              }}
            >
              {refreshProfilesPending ? "Refreshing..." : "Refresh Profiles"}
            </button>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Last profiled: {formatDateTime(scoutProfilesData?.lastProfiled ?? null)}
              </span>
              {scoutProfilesData?.isStale && (
                <span style={{ background: "rgba(61,139,253,0.16)", color: "#fbbf24", borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 800 }}>
                  Stale data
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {scoutRouteWarning && (
        <div style={{ background: "rgba(61,139,253,0.1)", border: "1px solid rgba(61,139,253,0.25)", borderRadius: 10, padding: "12px 16px", marginTop: 12, color: "var(--amber)", fontSize: 12, lineHeight: 1.5 }}>
          {scoutRouteWarning}
        </div>
      )}

      {!selectedLeague && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Select a league above to scout opponent tendencies.
        </div>
      )}

      {selectedLeague && scoutProfilesLoading && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
          <span className="animate-pulse" style={{ color: "var(--amber)", fontSize: 14 }}>
            Building opponent profiles...
          </span>
        </div>
      )}

      {selectedLeague && Boolean(scoutProfilesError) && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "24px 20px", marginTop: 16, color: "var(--red)", fontSize: 13 }}>
          {scoutProfilesErrorMessage}
        </div>
      )}

      {selectedLeague && !scoutProfilesLoading && !scoutProfilesError && scoutProfilesWithScores.length === 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          No opponent profiles are available yet. Refresh profiles to build the first pass from Sleeper history.
        </div>
      )}

      {selectedLeague && scoutProfilesWithScores.length > 0 && (
        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {scoutProfilesWithScores.map(({ profile, exploitability }) => (
              <OpponentCard
                key={profile.rosterId}
                profile={profile}
                exploitability={exploitability}
                selected={profile.rosterId === selectedScoutRosterId}
                onExploit={() => onOpenExploit(profile.rosterId)}
              />
            ))}
          </div>

          {selectedScoutProfile && (
            <div ref={scoutDetailRef} tabIndex={-1} style={{ outline: "none" }}>
              {Boolean(exploitAnglesError) && (
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, color: "var(--red)", fontSize: 12, lineHeight: 1.5 }}>
                  {exploitAnglesErrorMessage}
                </div>
              )}
              <OpponentDetail
                profile={selectedScoutProfile}
                angles={exploitAngles}
                isLoading={exploitAnglesLoading}
                onFindTrades={onFindTrades}
                onClose={onCloseDetail}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
