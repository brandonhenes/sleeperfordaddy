import { getLeagueDrafts, getDraftPicks } from "../sleeper/drafts.js";
import { getProspects } from "./market.js";
import { getPowerRankings } from "./power-rankings.js";

export interface LiveDraftState {
  draft_id: string;
  league_id: string;
  league_name: string;
  league_mode: "sf" | "1qb";
  status: string;
  total_rounds: number;
  total_rosters: number;
  picks_made: LiveDraftPickMade[];
  current_pick: number;
  on_the_clock: {
    roster_id: number;
    display_name: string;
    is_user: boolean;
    needs: { position: string; grade: string }[];
  } | null;
  best_available: BestAvailableProspect[];
  user_recommendation: string | null;
}

export interface LiveDraftPickMade {
  pick_number: number;
  round: number;
  pick_in_round: number;
  player_name: string;
  player_id: string;
  position: string | null;
  roster_id: number;
  display_name: string;
  is_user_pick: boolean;
}

export interface BestAvailableProspect {
  player_name: string;
  position: string;
  tier: string;
  positional_rank: number;
  school: string | null;
  consensus_comp: string | null;
  fit_for_user: string | null;
}

export interface ActiveDraftSummary {
  draft_id: string;
  league_id: string;
  league_name: string;
  status: string;
  season: string;
  picks_made: number;
  total_picks: number;
}

export async function getActiveDrafts(username: string): Promise<ActiveDraftSummary[]> {
  const allLeagues = await getPowerRankings(username);
  const results: ActiveDraftSummary[] = [];

  for (const league of allLeagues) {
    try {
      const drafts = await getLeagueDrafts(league.league_id);
      for (const draft of drafts) {
        if (draft.season !== "2026") continue;
        const rounds = Number((draft.settings as Record<string, unknown> | undefined)?.rounds ?? 4);
        if (rounds > 8) continue;
        if (draft.status !== "drafting" && draft.status !== "pre_draft") continue;

        const picks = draft.status === "drafting" ? await getDraftPicks(draft.draft_id) : [];
        results.push({
          draft_id: draft.draft_id,
          league_id: league.league_id,
          league_name: league.league_name,
          status: draft.status,
          season: draft.season,
          picks_made: picks.length,
          total_picks: rounds * league.rosters.length,
        });
      }
    } catch (err) {
      console.error(`[live-draft] Error checking drafts for ${league.league_id}:`, err);
    }
  }

  return results;
}

export async function getLiveDraftState(
  username: string,
  draftId: string,
  leagueId: string,
): Promise<LiveDraftState | null> {
  const allLeagues = await getPowerRankings(username);
  const league = allLeagues.find((l) => l.league_id === leagueId);
  if (!league) return null;

  const drafts = await getLeagueDrafts(leagueId);
  const draft = drafts.find((d) => d.draft_id === draftId);
  if (!draft) return null;

  const totalRounds = Number((draft.settings as Record<string, unknown> | undefined)?.rounds ?? 4);
  const totalRosters = league.rosters.length;
  const rawPicks = await getDraftPicks(draftId);

  const nameMap = new Map<number, string>();
  const isUserMap = new Map<number, boolean>();
  for (const r of league.rosters) {
    nameMap.set(r.roster_id, r.display_name);
    isUserMap.set(r.roster_id, r.is_user);
  }

  const picksMade: LiveDraftPickMade[] = rawPicks
    .sort((a, b) => a.pick_no - b.pick_no)
    .map((p) => ({
      pick_number: p.pick_no,
      round: p.round,
      pick_in_round: p.draft_slot,
      player_name: `${p.metadata.first_name ?? ""} ${p.metadata.last_name ?? ""}`.trim() || p.player_id,
      player_id: p.player_id,
      position: p.metadata.position ?? null,
      roster_id: p.roster_id,
      display_name: nameMap.get(p.roster_id) ?? `Roster ${p.roster_id}`,
      is_user_pick: isUserMap.get(p.roster_id) ?? false,
    }));

  const currentPick = picksMade.length + 1;
  const totalPicks = totalRounds * totalRosters;

  let onTheClock: LiveDraftState["on_the_clock"] = null;
  if (currentPick <= totalPicks && draft.status === "drafting") {
    const pickInRound = ((currentPick - 1) % totalRosters) + 1;
    let clockRosterId: number | null = null;
    if (draft.slot_to_roster_id) {
      clockRosterId = Number(draft.slot_to_roster_id[String(pickInRound)]) || null;
    }

    if (clockRosterId != null) {
      const clockRoster = league.rosters.find((r) => r.roster_id === clockRosterId);
      if (clockRoster) {
        onTheClock = {
          roster_id: clockRosterId,
          display_name: clockRoster.display_name,
          is_user: clockRoster.is_user,
          needs: (clockRoster.lineup?.slot_grades ?? [])
            .filter((sg) => ["QB", "RB", "WR", "TE"].includes(sg.slot_label))
            .filter((sg) => sg.grade === "hole" || sg.grade === "weak")
            .map((sg) => ({ position: sg.slot_label, grade: sg.grade })),
        };
      }
    }
  }

  const rawProspects = await getProspects();
  const pickedPlayerNames = new Set(picksMade.map((p) => p.player_name.toLowerCase()));
  const userRoster = league.rosters.find((r) => r.is_user);
  const userNeeds = new Set(
    (userRoster?.lineup?.slot_grades ?? [])
      .filter((sg) => sg.grade === "hole" || sg.grade === "weak")
      .map((sg) => sg.slot_label),
  );
  const tierOrder: Record<string, number> = { elite: 0, day1: 1, day2: 2, day3: 3, flier: 4 };

  const bestAvailable: BestAvailableProspect[] = rawProspects
    .filter((p) => !pickedPlayerNames.has(p.player_name.toLowerCase()))
    .sort((a, b) => {
      const ta = tierOrder[(a.tier ?? "flier").toLowerCase()] ?? 4;
      const tb = tierOrder[(b.tier ?? "flier").toLowerCase()] ?? 4;
      if (ta !== tb) return ta - tb;
      return (a.fp_rank ?? a.fantasypros_rank ?? 999) - (b.fp_rank ?? b.fantasypros_rank ?? 999);
    })
    .slice(0, 15)
    .map((p) => ({
      player_name: p.player_name,
      position: p.position ?? "?",
      tier: (p.tier ?? "flier").toLowerCase(),
      positional_rank: p.fp_rank ?? p.fantasypros_rank ?? 99,
      school: p.school,
      consensus_comp: p.consensus_comp ?? (p.all_comps?.[0]?.comp ?? null),
      fit_for_user: userNeeds.has(p.position ?? "")
        ? `Fills your ${p.position} ${userRoster?.lineup?.slot_grades?.find((sg) => sg.slot_label === p.position)?.grade ?? "need"}`
        : null,
    }));

  let userRecommendation: string | null = null;
  if (onTheClock?.is_user && bestAvailable.length > 0) {
    const fit = bestAvailable.find((p) => p.fit_for_user);
    userRecommendation = fit
      ? `Recommended: ${fit.player_name} (${fit.position}). ${fit.fit_for_user}.`
      : `Best available: ${bestAvailable[0].player_name} (${bestAvailable[0].position}). Best talent on the board.`;
  }

  return {
    draft_id: draftId,
    league_id: leagueId,
    league_name: league.league_name,
    league_mode: league.mode,
    status: draft.status,
    total_rounds: totalRounds,
    total_rosters: totalRosters,
    picks_made: picksMade,
    current_pick: currentPick,
    on_the_clock: onTheClock,
    best_available: bestAvailable,
    user_recommendation: userRecommendation,
  };
}
