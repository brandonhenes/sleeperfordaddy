import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getCompositeValues } from "./composite-values.js";
import { getAgeCurveStatus, type AgeCurveStatus } from "./age-curves.js";
import type { SourceWeights } from "./edge-score.js";
import { getLeagueRosters } from "../sleeper/rosters.js";
import { scoreAgreement } from "../lib/score-agreement.js";

export interface WaiverPlayer {
  player_id: string;
  full_name: string;
  position: string;
  team: string;
  age: number | null;
  edge_score: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  source_agreement: "high" | "medium" | "low";
  age_curve: AgeCurveStatus;
  hidden_gem: boolean;
}

export interface WaiverWireResult {
  players: WaiverPlayer[];
  warning: string | null;
}

function addIds(target: Set<string>, ids: string[] | null | undefined) {
  if (!ids) return;
  for (const id of ids) {
    if (id && id !== "0") target.add(id);
  }
}

async function getLeagueRosteredPlayerIds(
  leagueId: string
): Promise<{ ids: Set<string>; warning: string | null }> {
  const dbRows = await db.execute(sql`
    SELECT DISTINCT rp.player_id
    FROM roster_players rp
    WHERE rp.league_id = ${leagueId}
  `);
  const dbIds = new Set(
    (dbRows as unknown as { player_id: string }[]).map((r) => r.player_id)
  );

  const liveIds = new Set<string>();
  try {
    const rosters = await getLeagueRosters(leagueId);
    for (const roster of rosters) {
      addIds(liveIds, roster.players);
      addIds(liveIds, roster.reserve);
      addIds(liveIds, roster.taxi);
      addIds(liveIds, roster.starters);
    }
  } catch (err) {
    console.warn(`[waiver-wire] Failed to fetch live rosters for ${leagueId}:`, err);
  }

  const ids = liveIds.size > 0
    ? new Set([...dbIds, ...liveIds])
    : dbIds;

  const warningParts: string[] = [];
  if (liveIds.size > dbIds.size) {
    warningParts.push(
      `Using live Sleeper rosters to exclude ${liveIds.size - dbIds.size} additional rostered players missing from local sync.`
    );
  }
  if (ids.size < 50) {
    warningParts.push(
      `Only ${ids.size} rostered players found. Roster data may not have synced for this league. Try re-syncing from Settings.`
    );
  }

  return {
    ids,
    warning: warningParts.length > 0 ? warningParts.join(" ") : null,
  };
}

export async function getWaiverWire(leagueId: string, weights?: SourceWeights): Promise<WaiverWireResult> {
  const { ids: rosteredIds, warning: rosterWarning } =
    await getLeagueRosteredPlayerIds(leagueId);

  if (rosteredIds.size < 50) {
    console.warn(
      `[waiver-wire] Only ${rosteredIds.size} rostered players for league ${leagueId}. Data may be incomplete.`
    );
    return {
      players: [],
      warning: rosterWarning,
    };
  }

  const rosteredIdList = [...rosteredIds];
  const exclusionClause = rosteredIdList.length > 0
    ? sql`AND pm.player_id NOT IN (${sql.join(rosteredIdList.map((id) => sql`${id}`), sql`, `)})`
    : sql``;

  // Get all NFL-rostered skill players NOT on any roster in this league
  const freeRows = await db.execute(sql`
    SELECT pm.player_id, pm.full_name, pm.position, pm.team, pm.age
    FROM players_master pm
    WHERE pm.position IN ('QB', 'RB', 'WR', 'TE')
      AND pm.team IS NOT NULL
      ${exclusionClause}
    ORDER BY pm.full_name
  `);

  type PR = { player_id: string; full_name: string; position: string; team: string; age: number | null };
  const players = freeRows as unknown as PR[];
  if (players.length === 0) return { players: [], warning: null };

  // Detect SF mode from league settings
  const leagueRow = await db.execute(sql`
    SELECT raw_json FROM leagues WHERE league_id = ${leagueId} LIMIT 1
  `);
  let mode: "sf" | "1qb" = "sf";
  try {
    const raw = (leagueRow as unknown as { raw_json: string | null }[])[0]?.raw_json;
    if (raw) {
      const parsed = JSON.parse(raw);
      const pos = parsed.roster_positions as string[] | undefined;
      if (pos && !pos.includes("SUPER_FLEX") && pos.filter((p: string) => p === "QB").length < 2) {
        mode = "1qb";
      }
    }
  } catch { /* default sf */ }

  const playerIds = players.map((p) => p.player_id);
  const compMap = await getCompositeValues(playerIds, mode, weights);

  const results: WaiverPlayer[] = [];
  let excludedIncomplete = 0;
  for (const p of players) {
    const comp = compMap.get(p.player_id);
    if (!comp || comp.edge_score <= 0) continue;
    if (comp.sources_available < 2) {
      excludedIncomplete++;
      continue;
    }

    const ageCurve = getAgeCurveStatus(p.position, p.age);

    // Hidden gem: DP score significantly higher than KTC score (model loves, market doesn't)
    const hiddenGem =
      comp.dp_score != null &&
      comp.ktc_score != null &&
      comp.dp_score - comp.ktc_score >= 10;

    results.push({
      player_id: p.player_id,
      full_name: p.full_name,
      position: p.position,
      team: p.team,
      age: p.age,
      edge_score: comp.edge_score,
      fc_score: comp.fc_score ?? null,
      ktc_score: comp.ktc_score ?? null,
      dp_score: comp.dp_score ?? null,
      source_agreement: comp.source_agreement ?? scoreAgreement([comp.fc_score ?? null, comp.ktc_score ?? null, comp.dp_score ?? null]),
      age_curve: ageCurve,
      hidden_gem: hiddenGem,
    });
  }

  results.sort((a, b) => b.edge_score - a.edge_score);
  const warningParts = [];
  if (rosterWarning) warningParts.push(rosterWarning);
  if (excludedIncomplete > 0) {
    warningParts.push(
      `Excluded ${excludedIncomplete} free agents with incomplete market coverage (fewer than 2 value sources).`
    );
  }

  return {
    players: results.slice(0, 50),
    warning: warningParts.length > 0 ? warningParts.join(" ") : null,
  };
}
