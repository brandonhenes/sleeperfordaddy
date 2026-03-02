import { jget } from "../sleeper/client.js";
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

// ─── Build Item 1: Fetch Draft Picks from Sleeper ───

export async function getLeagueDraftPicks(
  leagueId: string
): Promise<DraftPick[]> {
  const raw = await jget<SleeperTradedPick[]>(
    `/league/${leagueId}/traded_picks`
  );
  if (!raw) return [];

  const currentYear = new Date().getFullYear();

  return raw
    .filter((p) => {
      const season = parseInt(p.season, 10);
      return season >= currentYear && season <= currentYear + 3;
    })
    .map((p) => ({
      season: p.season,
      round: p.round,
      roster_id: p.owner_id,            // current owner
      original_owner_id: p.roster_id,   // whose draft slot
    }));
}

// ─── Build Item 2: Estimate Pick Tiers ───

export function estimatePickTiers(
  picks: DraftPick[],
  rosterPower: Map<number, number>
): TieredPick[] {
  return picks.map((p) => {
    const power = rosterPower.get(p.original_owner_id);
    let tier: "early" | "mid" | "late" = "mid"; // default if unknown
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
