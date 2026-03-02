import { jget } from "../sleeper/client.js";
import { getLeagueDrafts } from "../sleeper/drafts.js";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

// ─── Types ───

interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number;        // original draft slot owner
  owner_id: number;         // current owner
  previous_owner_id: number;
}

export interface DraftPick {
  season: string;
  round: number;
  roster_id: number;          // current owner
  original_owner_id: number;  // whose draft slot
}

export interface TieredPick {
  season: string;
  round: number;
  roster_id: number;
  original_owner_id: number;
  tier: "early" | "mid" | "late";
  label: string;
}

export interface ScoredPick {
  season: string;
  round: number;
  roster_id: number;
  original_owner_id: number;
  tier: "early" | "mid" | "late";
  label: string;
  ktc_value: number | null;
  dp_value: number | null;
  edge_score: number;
  ktc_score: number | null;
  dp_score: number | null;
}

const ROUND_NAMES: Record<number, string> = {
  1: "1st", 2: "2nd", 3: "3rd", 4: "4th",
};

const MAX_ROUNDS = 4;

// ─── Build Item 1: Build Complete Draft Pick Inventory ───

export async function getLeagueDraftPicks(
  leagueId: string,
  totalRosters: number,
  draftRounds: number
): Promise<DraftPick[]> {
  const raw = await jget<SleeperTradedPick[]>(
    `/league/${leagueId}/traded_picks`
  );

  const rounds = Math.min(draftRounds, MAX_ROUNDS);
  const currentYear = new Date().getFullYear();
  const seasons = [currentYear, currentYear + 1, currentYear + 2];

  // Default: every roster owns their own pick for each round/season
  const picks = new Map<string, DraftPick>();
  for (const season of seasons) {
    for (let round = 1; round <= rounds; round++) {
      for (let rid = 1; rid <= totalRosters; rid++) {
        picks.set(`${season}|${round}|${rid}`, {
          season: String(season),
          round,
          roster_id: rid,
          original_owner_id: rid,
        });
      }
    }
  }

  // Apply trades: transfer ownership
  if (raw) {
    for (const t of raw) {
      const season = parseInt(t.season, 10);
      if (season < currentYear || season > currentYear + 2) continue;
      const key = `${t.season}|${t.round}|${t.roster_id}`;
      const pick = picks.get(key);
      if (pick) {
        pick.roster_id = t.owner_id; // current owner
      }
    }
  }

  return [...picks.values()];
}

// ─── Build Item 1b: Fetch Rookie Draft Order ───

/**
 * Fetches the current-year rookie draft order for a league.
 * Returns a Map of user_id → pick_position (1-based), or null if unavailable.
 */
export async function getRookieDraftOrder(
  leagueId: string
): Promise<Map<string, number> | null> {
  const drafts = await getLeagueDrafts(leagueId);
  const currentYear = String(new Date().getFullYear());

  // Find the rookie draft: current season, not complete, ≤ 5 rounds
  const rookieDraft = drafts.find(
    (d) =>
      d.season === currentYear &&
      d.status !== "complete" &&
      Number(d.settings?.rounds ?? 99) <= 5
  );
  if (!rookieDraft?.draft_order) return null;

  const order = new Map<string, number>();
  for (const [userId, pos] of Object.entries(rookieDraft.draft_order)) {
    order.set(userId, pos as number);
  }
  return order;
}

// ─── Build Item 2: Classify Picks ───

/**
 * For current-year picks with known draft order: exact position label ("1.03").
 * For future picks or unknown order: tier estimate label ("2027 Early 1st").
 *
 * @param draftOrder - Map of roster_id → pick_position (1-based) for current year.
 */
export function estimatePickTiers(
  picks: DraftPick[],
  rosterPower: Map<number, number>,
  draftOrder?: Map<number, number>
): TieredPick[] {
  const currentYear = String(new Date().getFullYear());

  return picks.map((p) => {
    const pos = draftOrder?.get(p.original_owner_id);

    // Current year with known draft position → exact label
    if (p.season === currentYear && pos != null) {
      const tier = tierFromPosition(pos, draftOrder?.size ?? 12);
      return {
        ...p,
        tier,
        label: `${p.round}.${String(pos).padStart(2, "0")}`,
      };
    }

    // Future years or unknown position → tier estimate
    const power = rosterPower.get(p.original_owner_id);
    let tier: "early" | "mid" | "late" = "mid";
    if (power != null) {
      if (power <= 33) tier = "early";
      else if (power > 66) tier = "late";
    }

    const roundName = ROUND_NAMES[p.round] ?? `R${p.round}`;
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

    return {
      ...p,
      tier,
      label: `${p.season} ${tierLabel} ${roundName}`,
    };
  });
}

/** Derive tier from exact draft position for value matching. */
function tierFromPosition(
  pos: number,
  leagueSize: number
): "early" | "mid" | "late" {
  const third = leagueSize / 3;
  if (pos <= third) return "early";
  if (pos > third * 2) return "late";
  return "mid";
}

// ─── Build Item 3: Match Picks to Values ───

export async function scoreDraftPicks(
  tieredPicks: TieredPick[],
  mode: "sf" | "1qb"
): Promise<ScoredPick[]> {
  if (tieredPicks.length === 0) return [];

  // Query all pick values from KTC and DP in parallel
  const [ktcRows, dpRows] = await Promise.all([
    db.execute(sql`
      SELECT player_name, pick_season, pick_round, pick_tier,
             value_1qb, value_sf
      FROM ktc_values WHERE is_pick = true
    `),
    db.execute(sql`
      SELECT player_name, value_1qb, value_2qb
      FROM dynastyprocess_values WHERE is_pick = true
    `),
  ]);

  type KtcPickRow = {
    player_name: string;
    pick_season: number | null;
    pick_round: number | null;
    pick_tier: string | null;
    value_1qb: number;
    value_sf: number;
  };
  type DpPickRow = {
    player_name: string;
    value_1qb: number;
    value_2qb: number;
  };

  // KTC lookup: "2026|early|1" → value, fallback "2026||1" (no tier)
  const ktcMap = new Map<string, number>();
  for (const r of ktcRows as unknown as KtcPickRow[]) {
    const val = mode === "sf" ? r.value_sf : r.value_1qb;
    if (r.pick_season != null && r.pick_round != null) {
      const tier = (r.pick_tier ?? "").toLowerCase();
      ktcMap.set(`${r.pick_season}|${tier}|${r.pick_round}`, val);
      // Store generic (no tier) as fallback — keep highest value
      const genKey = `${r.pick_season}||${r.pick_round}`;
      if (!ktcMap.has(genKey)) {
        ktcMap.set(genKey, val);
      }
    }
  }

  // DP lookup by normalized name: "2027 early 1st" → value
  const dpMap = new Map<string, number>();
  for (const r of dpRows as unknown as DpPickRow[]) {
    const val = mode === "sf" ? r.value_2qb : r.value_1qb;
    dpMap.set(r.player_name.toLowerCase().trim(), val);
  }

  return tieredPicks.map((p) => {
    // KTC: exact tier match → generic fallback
    const ktcValue =
      ktcMap.get(`${p.season}|${p.tier}|${p.round}`) ??
      ktcMap.get(`${p.season}||${p.round}`) ??
      null;

    // DP: tiered name → generic fallback
    const roundName = ROUND_NAMES[p.round] ?? `R${p.round}`;
    const tierLabel = p.tier.charAt(0).toUpperCase() + p.tier.slice(1);
    const dpValue =
      dpMap.get(`${p.season} ${tierLabel} ${roundName}`.toLowerCase()) ??
      dpMap.get(`${p.season} ${roundName}`.toLowerCase()) ??
      null;

    return {
      ...p,
      ktc_value: ktcValue,
      dp_value: dpValue,
      // Edge scores filled in by orchestrator (scored in same pool as players)
      edge_score: 0,
      ktc_score: null,
      dp_score: null,
    };
  });
}
