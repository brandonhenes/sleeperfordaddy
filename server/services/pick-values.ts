import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import type {
  PickValue,
  RookieADP,
  TradeAssetInput,
  TradePickBreakdown,
} from "../../shared/types.js";
import type { ScoredPick } from "./draft-picks.js";
import { computeRookieADP } from "./sync-league-drafts.js";

export interface ClassStrengthMap {
  [season: string]: number;
}

type PickTier = "early" | "mid" | "late";

const CURRENT_SEASON = new Date().getFullYear();
const UNKNOWN_CLASS_MODIFIER = 0.85;
const DEFAULT_CLASS_STRENGTHS: ClassStrengthMap = {
  [String(CURRENT_SEASON)]: 1.0,
  [String(CURRENT_SEASON + 1)]: 1.3,
  [String(CURRENT_SEASON + 2)]: 1.15,
  [String(CURRENT_SEASON + 3)]: UNKNOWN_CLASS_MODIFIER,
};

const ROUND_NAMES: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
};

const SLOT_VALUES_12_TEAM: Record<number, number[]> = {
  1: [92, 85, 84, 83, 83, 78, 77, 76, 75, 74, 73, 73],
  2: [72, 71, 70, 69, 69, 68, 68, 67, 67, 66, 66, 65],
  3: [65, 64, 63, 62, 61, 60, 59, 58, 58, 57, 56, 55],
  4: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
};

const rookieBoardCache = new Map<string, Promise<RookieADP[]>>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits = 1): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function tierFromSlot(slot: number, leagueSize: number): PickTier {
  const firstBoundary = Math.ceil(leagueSize / 3);
  const secondBoundary = Math.ceil((leagueSize * 2) / 3);
  if (slot <= firstBoundary) return "early";
  if (slot > secondBoundary) return "late";
  return "mid";
}

function representativeSlotForTier(tier: PickTier, leagueSize: number): number {
  const firstBoundary = Math.ceil(leagueSize / 3);
  const secondBoundary = Math.ceil((leagueSize * 2) / 3);
  if (tier === "early") return Math.max(1, Math.round((1 + firstBoundary) / 2));
  if (tier === "mid") return Math.max(firstBoundary + 1, Math.round((firstBoundary + 1 + secondBoundary) / 2));
  return Math.max(secondBoundary + 1, Math.round((secondBoundary + 1 + leagueSize) / 2));
}

function normalizeSlot(slot: number, leagueSize: number): number {
  if (leagueSize <= 1) return 1;
  if (leagueSize === 12) return clamp(slot, 1, 12);
  const pct = (clamp(slot, 1, leagueSize) - 1) / (leagueSize - 1);
  return clamp(Math.round(1 + pct * 11), 1, 12);
}

function baseValueForSlot(round: number, slot: number, leagueSize: number): number {
  if (round >= 5) {
    return clamp(29 - (round - 5) * 4, 10, 29);
  }
  const roundValues = SLOT_VALUES_12_TEAM[round] ?? SLOT_VALUES_12_TEAM[4];
  const normalizedSlot = normalizeSlot(slot, leagueSize);
  return roundValues[normalizedSlot - 1] ?? 0;
}

function baseValueForTier(round: number, tier: PickTier, leagueSize: number): number {
  if (round >= 5) return baseValueForSlot(round, 1, leagueSize);
  const start =
    tier === "early"
      ? 1
      : tier === "mid"
        ? Math.ceil(leagueSize / 3) + 1
        : Math.ceil((leagueSize * 2) / 3) + 1;
  const end =
    tier === "early"
      ? Math.ceil(leagueSize / 3)
      : tier === "mid"
        ? Math.ceil((leagueSize * 2) / 3)
        : leagueSize;
  const values: number[] = [];
  for (let slot = start; slot <= end; slot++) {
    values.push(baseValueForSlot(round, slot, leagueSize));
  }
  if (values.length === 0) {
    return baseValueForSlot(round, representativeSlotForTier(tier, leagueSize), leagueSize);
  }
  return roundTo(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function pickLabel(season: string, round: number, slot: number, tier: PickTier, exactSlot: boolean): string {
  if (exactSlot) {
    return `${season} ${round}.${String(slot).padStart(2, "0")}`;
  }
  const roundName = ROUND_NAMES[round] ?? `R${round}`;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  return `${season} ${tierLabel} ${roundName}`;
}

function normalizeTier(asset: { pick_tier?: PickTier | null; tier?: PickTier | null }, slot: number, leagueSize: number): PickTier {
  return asset.pick_tier ?? asset.tier ?? tierFromSlot(slot, leagueSize);
}

function seasonModifier(
  season: string,
  overrides?: ClassStrengthMap
): number {
  const directOverride = overrides?.[season];
  if (typeof directOverride === "number" && Number.isFinite(directOverride)) {
    return clamp(directOverride, 0.7, 1.5);
  }
  const numericSeason = Number(season);
  if (!Number.isFinite(numericSeason)) {
    return UNKNOWN_CLASS_MODIFIER;
  }
  if (numericSeason >= CURRENT_SEASON + 3) {
    const fallback = overrides?.[String(CURRENT_SEASON + 3)] ?? DEFAULT_CLASS_STRENGTHS[String(CURRENT_SEASON + 3)];
    return clamp(fallback, 0.7, 1.5);
  }
  const fallback = DEFAULT_CLASS_STRENGTHS[season] ?? UNKNOWN_CLASS_MODIFIER;
  return clamp(fallback, 0.7, 1.5);
}

export function getClassStrengthModifier(
  season: string,
  overrides?: ClassStrengthMap
): number {
  return seasonModifier(season, overrides);
}

async function loadRookieBoardFromTable(season: string): Promise<RookieADP[]> {
  try {
    const rows = await db.execute(sql`
      SELECT
        season,
        player_name,
        position,
        college,
        adp_rank::float AS adp_rank,
        adp_high,
        adp_low,
        tier,
        nfl_team,
        nfl_draft_round,
        nfl_draft_pick,
        nfl_draft_capital_grade,
        landing_spot_grade,
        edge_equivalent::float AS edge_equivalent,
        source,
        updated_at::text AS updated_at
      FROM rookie_adp
      WHERE season = ${season}
      ORDER BY adp_rank ASC, player_name ASC
    `);
    return (rows as unknown as Array<{
      season: string;
      player_name: string;
      position: string;
      college: string | null;
      adp_rank: number;
      adp_high: number | null;
      adp_low: number | null;
      tier: number;
      nfl_team: string | null;
      nfl_draft_round: number | null;
      nfl_draft_pick: number | null;
      nfl_draft_capital_grade: string | null;
      landing_spot_grade: string | null;
      edge_equivalent: number | null;
      source: string | null;
      updated_at: string | null;
    }>).map((row) => ({
      season: row.season,
      playerName: row.player_name,
      position: row.position,
      college: row.college,
      adpRank: row.adp_rank,
      adpHigh: row.adp_high,
      adpLow: row.adp_low,
      tier: row.tier,
      nflTeam: row.nfl_team,
      nflDraftRound: row.nfl_draft_round,
      nflDraftPick: row.nfl_draft_pick,
      nflDraftCapitalGrade: row.nfl_draft_capital_grade,
      landingSpotGrade: row.landing_spot_grade,
      edgeEquivalent: row.edge_equivalent,
      source: row.source,
      updatedAt: row.updated_at,
    }));
  } catch {
    return [];
  }
}

async function loadRookieBoardFromProspects(season: string): Promise<RookieADP[]> {
  if (Number(season) !== CURRENT_SEASON) return [];
  try {
    const rows = await db.execute(sql`
      SELECT
        pr.player_name,
        COALESCE(pr.position, p26.position) AS position,
        p26.school AS college,
        pr.fp_ecr_sf::float AS fp_ecr_sf,
        pr.dp_ecr_sf::float AS dp_ecr_sf,
        pr.dp_value_sf::float AS dp_value_sf,
        pr.source,
        pr.snapshot_date::text AS snapshot_date
      FROM prospect_rankings_daily pr
      LEFT JOIN prospects_2026 p26 ON LOWER(pr.player_name) = LOWER(p26.player_name)
      WHERE pr.snapshot_date = (SELECT MAX(snapshot_date) FROM prospect_rankings_daily)
      ORDER BY
        COALESCE(pr.fp_ecr_sf, pr.dp_ecr_sf, 9999) ASC,
        COALESCE(pr.dp_value_sf, 0) DESC,
        pr.player_name ASC
    `);

    const mapped = (rows as unknown as Array<{
      player_name: string;
      position: string | null;
      college: string | null;
      fp_ecr_sf: number | null;
      dp_ecr_sf: number | null;
      dp_value_sf: number | null;
      source: string | null;
      snapshot_date: string | null;
    }>)
      .filter((row) => !!row.player_name && !!row.position)
      .map((row, index) => {
        const adpRank = row.fp_ecr_sf ?? row.dp_ecr_sf ?? index + 1;
        const rank = index + 1;
        const tier =
          rank <= 5 ? 1 :
          rank <= 12 ? 2 :
          rank <= 24 ? 3 :
          rank <= 36 ? 4 : 5;
        return {
          season,
          playerName: row.player_name,
          position: row.position ?? "WR",
          college: row.college,
          adpRank,
          adpHigh: null,
          adpLow: null,
          tier,
          nflTeam: null,
          nflDraftRound: null,
          nflDraftPick: null,
          nflDraftCapitalGrade: null,
          landingSpotGrade: null,
          edgeEquivalent: row.dp_value_sf != null ? roundTo(row.dp_value_sf) : null,
          source: row.source ?? "prospect_rankings_daily",
          updatedAt: row.snapshot_date,
        } satisfies RookieADP;
      });

    return mapped;
  } catch {
    return [];
  }
}

async function loadRookieBoardFromDraftResults(season: string): Promise<RookieADP[]> {
  try {
    const rows = await computeRookieADP(season);
    return rows.map((row, index) => {
      const rank = index + 1;
      return {
        season,
        playerName: row.player_name,
        position: row.position ?? "WR",
        college: null,
        adpRank: row.avg_pick,
        adpHigh: row.min_pick,
        adpLow: row.max_pick,
        tier:
          rank <= 5 ? 1 :
          rank <= 12 ? 2 :
          rank <= 24 ? 3 :
          rank <= 36 ? 4 : 5,
        nflTeam: null,
        nflDraftRound: null,
        nflDraftPick: null,
        nflDraftCapitalGrade: null,
        landingSpotGrade: null,
        edgeEquivalent: null,
        source: "league_draft_results",
        updatedAt: null,
      };
    });
  } catch {
    return [];
  }
}

export async function getRookieBoard(season: string): Promise<RookieADP[]> {
  const cacheKey = season;
  if (!rookieBoardCache.has(cacheKey)) {
    rookieBoardCache.set(cacheKey, (async () => {
      const tableRows = await loadRookieBoardFromTable(season);
      if (tableRows.length > 0) return tableRows;

      const prospectRows = await loadRookieBoardFromProspects(season);
      if (prospectRows.length > 0) return prospectRows;

      return loadRookieBoardFromDraftResults(season);
    })());
  }
  return rookieBoardCache.get(cacheKey) ?? Promise.resolve([]);
}

export async function getProjectedProspect(
  season: string,
  adpSlot: number
): Promise<RookieADP | null> {
  const board = await getRookieBoard(season);
  if (board.length === 0) return null;
  const sorted = [...board].sort((a, b) => a.adpRank - b.adpRank);
  const idx = clamp(Math.round(adpSlot) - 1, 0, sorted.length - 1);
  return sorted[idx] ?? null;
}

export async function getTradePickBreakdown(
  asset: Pick<
    TradeAssetInput,
    "pick_season" | "pick_round" | "pick_tier" | "pick_slot" | "pick_label" | "pick_original_owner_id"
  > & {
    roster_id?: number | null;
    tier?: PickTier | null;
    label?: string;
  },
  options: {
    leagueSize?: number;
    format?: "sf" | "1qb";
    classStrengths?: ClassStrengthMap;
  } = {}
): Promise<TradePickBreakdown> {
  const season = asset.pick_season ?? String(CURRENT_SEASON);
  const round = Number(asset.pick_round ?? 1);
  const leagueSize = Math.max(8, options.leagueSize ?? 12);
  const exactSlot = asset.pick_slot != null && asset.pick_slot > 0;
  const pickSlot = exactSlot
    ? clamp(asset.pick_slot ?? 1, 1, leagueSize)
    : representativeSlotForTier(
        normalizeTier(asset, representativeSlotForTier(asset.pick_tier ?? asset.tier ?? "mid", leagueSize), leagueSize),
        leagueSize
      );
  const tier = normalizeTier(asset, pickSlot, leagueSize);
  const baseEdgeValue = exactSlot
    ? baseValueForSlot(round, pickSlot, leagueSize)
    : baseValueForTier(round, tier, leagueSize);
  const classStrengthModifier = seasonModifier(season, options.classStrengths);
  const finalValue = roundTo(clamp(baseEdgeValue * classStrengthModifier, 0, 99));
  const projectedProspect = await getProjectedProspect(
    season,
    (round - 1) * leagueSize + pickSlot
  );

  return {
    season,
    round,
    pickSlot,
    tier,
    baseEdgeValue,
    classStrengthModifier,
    finalValue,
    projectedProspect: projectedProspect?.playerName ?? null,
    prospectTier: projectedProspect?.tier ?? null,
    pickLabel: asset.pick_label ?? asset.label ?? pickLabel(season, round, pickSlot, tier, exactSlot),
  };
}

export async function enrichScoredPick(
  pick: ScoredPick,
  options: {
    leagueSize?: number;
    format?: "sf" | "1qb";
    classStrengths?: ClassStrengthMap;
  } = {}
): Promise<ScoredPick & { pick_breakdown: TradePickBreakdown }> {
  const pick_breakdown = await getTradePickBreakdown(
    {
      pick_season: pick.season,
      pick_round: pick.round,
      pick_tier: pick.tier,
      pick_slot: pick.pick_slot,
      pick_label: pick.label,
      pick_original_owner_id: pick.original_owner_id,
      roster_id: pick.roster_id,
      tier: pick.tier,
      label: pick.label,
    },
    options
  );

  return {
    ...pick,
    label: pick_breakdown.pickLabel,
    edge_score: pick_breakdown.finalValue,
    pick_breakdown,
  };
}

export async function toPickValue(
  pick: ScoredPick,
  options: {
    leagueSize?: number;
    format?: "sf" | "1qb";
    classStrengths?: ClassStrengthMap;
  } = {}
): Promise<PickValue> {
  const breakdown = await getTradePickBreakdown(
    {
      pick_season: pick.season,
      pick_round: pick.round,
      pick_tier: pick.tier,
      pick_slot: pick.pick_slot,
      pick_label: pick.label,
      pick_original_owner_id: pick.original_owner_id,
      roster_id: pick.roster_id,
      tier: pick.tier,
      label: pick.label,
    },
    options
  );

  return {
    season: breakdown.season,
    round: breakdown.round,
    pickSlot: breakdown.pickSlot,
    originalOwnerRosterId: pick.original_owner_id,
    currentOwnerRosterId: pick.roster_id,
    tier: breakdown.tier,
    baseEdgeValue: breakdown.baseEdgeValue,
    classStrengthModifier: breakdown.classStrengthModifier,
    finalValue: breakdown.finalValue,
    projectedProspect: breakdown.projectedProspect,
    prospectTier: breakdown.prospectTier,
    pickLabel: breakdown.pickLabel,
  };
}

export async function updatePickValues(
  season: string,
  leagueSize: number,
  format: "sf" | "1qb",
  classStrength: number
): Promise<void> {
  const tiers: PickTier[] = ["early", "mid", "late"];
  const statements = [];
  for (const round of [1, 2, 3, 4]) {
    for (const tier of tiers) {
      const edgeEquivalent = baseValueForTier(round, tier, leagueSize);
      statements.push(sql`
        INSERT INTO pick_values (
          season,
          round,
          pick_tier,
          league_size,
          format,
          edge_equivalent,
          class_strength_modifier,
          notes
        ) VALUES (
          ${season},
          ${round},
          ${tier},
          ${leagueSize},
          ${format},
          ${edgeEquivalent},
          ${classStrength},
          ${round === 1 && tier === "mid" ? "Includes the 1.05/1.06 cliff compression" : null}
        )
        ON CONFLICT (season, round, pick_tier, league_size, format) DO UPDATE SET
          edge_equivalent = EXCLUDED.edge_equivalent,
          class_strength_modifier = EXCLUDED.class_strength_modifier,
          notes = EXCLUDED.notes,
          updated_at = NOW()
      `);
    }
  }
  for (const statement of statements) {
    await db.execute(statement);
  }
}
