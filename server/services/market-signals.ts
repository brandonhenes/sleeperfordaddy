import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import type { MarketSignal, SignalSummary, SignalType } from "../../shared/types.js";
import { computeEdgeScores } from "./edge-score.js";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";

// ─── Tunable Thresholds ───

const GAP_THRESHOLD = 8;         // minimum score gap for a signal
const CONSENSUS_SPREAD = 4;      // max spread for consensus lock
const MIN_EDGE_SCORE = 50;       // ignore deep stashes
const MIN_SIGNAL_STRENGTH = 30;  // don't surface weak signals
const d1 = (n: number) => Math.round(n * 10) / 10;

// ─── Types ───


// ─── Signal Detection ───

function detectSignal(
  fc: number | null,
  ktc: number | null,
  fp: number | null
): { signal: SignalType; strength: number; action: string; reason: string } {
  const none = { signal: "NONE" as const, strength: 0, action: "MONITOR", reason: "" };

  // Signal 1: Smart Money vs Dumb Money (FC vs KTC)
  if (fc != null && ktc != null) {
    const gap = fc - ktc;
    if (gap >= GAP_THRESHOLD) {
      return {
        signal: "SMART_MONEY_BUY",
        strength: Math.min(100, gap * 5),
        action: "BUY",
        reason: `Real trade values ${d1(gap)} pts above crowd sentiment. Managers are paying more than the crowd thinks this player is worth. The crowd tends to catch up.`,
      };
    }
    if (gap <= -GAP_THRESHOLD) {
      return {
        signal: "HYPE_SELL",
        strength: Math.min(100, Math.abs(gap) * 5),
        action: "SELL",
        reason: `Crowd hype is ${d1(Math.abs(gap))} pts above actual trade values. People think this player is worth more than what managers are actually paying. Sell into the hype.`,
      };
    }
  }

  // Signal 2: Expert vs Crowd (FP vs KTC)
  if (fp != null && ktc != null) {
    const gap = fp - ktc;
    if (gap >= GAP_THRESHOLD) {
      return {
        signal: "EXPERT_BUY",
        strength: Math.min(100, gap * 5),
        action: "BUY",
        reason: `Top analysts rank this player ${d1(gap)} pts above the crowd. Expert consensus tends to predict future value better than crowd sentiment.`,
      };
    }
    if (gap <= -GAP_THRESHOLD) {
      const scores = [fc, ktc, fp].filter((s): s is number => s != null);
      if (fp === Math.min(...scores)) {
        return {
          signal: "EXPERT_FADE",
          strength: Math.min(100, Math.abs(gap) * 5),
          action: "SELL",
          reason: `Top analysts are fading this player (${d1(Math.abs(gap))} pts below crowd). Expert downgrades often precede value drops.`,
        };
      }
    }
  }

  // Signal 3: Consensus Lock
  const scores = [fc, ktc, fp].filter((s): s is number => s != null);
  if (scores.length >= 2) {
    const spread = Math.max(...scores) - Math.min(...scores);
    if (spread <= CONSENSUS_SPREAD) {
      return {
        signal: "CONSENSUS_LOCK",
        strength: Math.max(0, 100 - spread * 25),
        action: "HOLD",
        reason: `All sources agree within ${d1(spread)} points. This player is fairly valued. Don't overpay in trades. Look for disagreement players instead.`,
      };
    }
  }

  return none;
}

// ─── Main Query ───

export async function getMarketSignals(
  playerIds?: string[]
): Promise<MarketSignal[]> {
  // Query all players with values from at least 2 sources
  let whereClause = sql`WHERE pm.position IN ('QB','RB','WR','TE')`;
  if (playerIds && playerIds.length > 0) {
    const idFrags = playerIds.map((id) => sql`${id}`);
    whereClause = sql`WHERE pm.player_id IN (${sql.join(idFrags, sql`, `)})`;
  }

  const rows = await db.execute(sql`
    SELECT
      pm.player_id, pm.full_name, pm.position, pm.team,
      fc.dynasty_value AS fc_value,
      ktc.value_sf AS ktc_value,
      dp.value_2qb AS fp_value
    FROM players_master pm
    LEFT JOIN fantasycalc_daily fc
      ON fc.sleeper_id = pm.player_id
      AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    LEFT JOIN ktc_values ktc ON ktc.sleeper_id = pm.player_id
    LEFT JOIN dynastyprocess_values dp ON dp.sleeper_id = pm.player_id
    ${whereClause}
  `);

  type Row = {
    player_id: string;
    full_name: string;
    position: string;
    team: string | null;
    fc_value: number | null;
    ktc_value: number | null;
    fp_value: number | null;
  };
  const rawRows = rows as unknown as Row[];

  // Compute edge scores for all players
  const inputs = rawRows.map((r) => ({
    sleeper_id: r.player_id,
    fc_value: r.fc_value ?? null,
    ktc_value: r.ktc_value ?? null,
    dp_value: r.fp_value ?? null,
  }));
  const edgeMap = computeEdgeScores(inputs);

  const signals: MarketSignal[] = [];

  for (const r of rawRows) {
    const edge = edgeMap.get(r.player_id);
    if (!edge || edge.score < MIN_EDGE_SCORE) continue;
    if (edge.sources_used < 2) continue;

    const fc = edge.fc_score ?? null;
    const ktc = edge.ktc_score ?? null;
    const fp = edge.dp_score ?? null; // dp_score = FP score (same table)

    const { signal, strength, action, reason } = detectSignal(fc, ktc, fp);
    if (signal === "NONE" || strength < MIN_SIGNAL_STRENGTH) continue;

    signals.push({
      player_id: r.player_id,
      full_name: r.full_name,
      position: r.position,
      team: r.team,
      edge_score: edge.score,
      fc_score: fc,
      ktc_score: ktc,
      fp_score: fp,
      fc_value: r.fc_value,
      ktc_value: r.ktc_value,
      fp_value: r.fp_value,
      signal,
      signal_strength: strength,
      action,
      reason,
    });
  }

  signals.sort((a, b) => b.signal_strength - a.signal_strength);
  return signals;
}

// ─── Summary ───

export function summarizeSignals(signals: MarketSignal[]): SignalSummary {
  const buys = signals.filter((s) => s.action === "BUY");
  const sells = signals.filter((s) => s.action === "SELL");

  return {
    total_players_analyzed: signals.length,
    smart_money_buys: signals.filter((s) => s.signal === "SMART_MONEY_BUY").length,
    hype_sells: signals.filter((s) => s.signal === "HYPE_SELL").length,
    expert_buys: signals.filter((s) => s.signal === "EXPERT_BUY").length,
    expert_fades: signals.filter((s) => s.signal === "EXPERT_FADE").length,
    consensus_locks: signals.filter((s) => s.signal === "CONSENSUS_LOCK").length,
    top_buy: buys[0] ?? null,
    top_sell: sells[0] ?? null,
  };
}

// ─── User-Owned Filter ───

export async function getUserOwnedPlayerIds(username: string): Promise<string[]> {
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  const dynastyLeagueIds = await getDynastyLeagueIdsForUserLatestSeason(userId);
  if (dynastyLeagueIds.length === 0) return [];
  const leagueIdFrags = dynastyLeagueIds.map((id) => sql`${id}`);
  const inClause = sql.join(leagueIdFrags, sql`, `);

  const rows = await db.execute(sql`
    SELECT DISTINCT rp.player_id
    FROM roster_players rp
    WHERE rp.owner_id = ${userId}
      AND rp.league_id IN (${inClause})
  `);
  return (rows as unknown as { player_id: string }[]).map((r) => r.player_id);
}
