import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export interface ManagerBehavior {
  roster_id: number;
  total_trades: number;
  recent_trades: number;
  preferred_structure: "1-for-1" | "packages" | "pick-heavy" | "mixed";
  is_active: boolean;
  last_trade_days_ago: number | null;
  bias_flags: string[];
  top_acquired_positions: string[];
}

export interface AcceptanceAnalysis {
  probability: number;
  label: "Likely" | "Possible" | "Unlikely" | "Hard";
  accept_reasons: string[];
  reject_reasons: string[];
}

export interface OpponentContext {
  roster_id: number;
  display_name: string;
  team_name: string | null;
  archetype: string;
  needs: string[];
  surplus: string[];
  top_player_ids_by_pos: Record<string, string>;
  behavior: ManagerBehavior | null;
}

type TradeAssetRow = {
  trade_id: string;
  roster_id: number;
  direction: "gave" | "received";
  asset_type: "player" | "pick" | "waiver_budget";
  created_at_ms: number;
};

type AcquiredPlayerRow = {
  roster_id: number;
  position: string | null;
  age: number | null;
};

interface PerTradeShape {
  gave_count: number;
  received_count: number;
  includes_pick: boolean;
  created_at_ms: number;
}

function classifyStructure(
  oneForOneRate: number,
  packageRate: number,
  pickHeavyRate: number
): ManagerBehavior["preferred_structure"] {
  if (oneForOneRate >= 0.55) return "1-for-1";
  if (packageRate >= 0.4) return "packages";
  if (pickHeavyRate >= 0.4) return "pick-heavy";
  return "mixed";
}

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function addUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

function applyQualityAdjustments(
  probability: number,
  accept: string[],
  reject: string[],
  sendEdges: number[],
  receiveEdges: number[],
): number {
  const bestSend = sendEdges.length ? Math.max(...sendEdges) : 0;
  const bestReceive = receiveEdges.length ? Math.max(...receiveEdges) : 0;

  if (bestReceive > 0 && bestSend > 0) {
    const qualityGap = bestReceive - bestSend;
    if (qualityGap >= 20) {
      probability -= 20;
      reject.push(`Your best asset (${bestSend.toFixed(0)}) is far below theirs (${bestReceive.toFixed(0)}). Feels like a lowball.`);
    } else if (qualityGap >= 10) {
      probability -= 8;
      reject.push("Quality gap between top assets on each side");
    } else if (qualityGap <= -10) {
      probability += 10;
      accept.push("Your top asset outclasses what you're asking for");
    }
  }

  const lowQualityCount = sendEdges.filter((edge) => edge < 55).length;
  if (lowQualityCount >= 2) {
    probability -= 12;
    reject.push(`Sending ${lowQualityCount} low-value assets. Nobody wants roster cloggers.`);
  } else if (lowQualityCount === 1 && sendEdges.length > 1) {
    probability -= 5;
    reject.push("Includes a low-value throw-in that adds roster bloat");
  }

  return probability;
}

export async function buildLeagueBehaviors(
  leagueId: string
): Promise<Map<number, ManagerBehavior>> {
  const [assetRowsRaw, acquiredRowsRaw] = await Promise.all([
    db.execute(sql`
      SELECT trade_id, roster_id, direction, asset_type, created_at_ms
      FROM trade_assets
      WHERE league_id = ${leagueId}
      ORDER BY created_at_ms DESC
    `),
    db.execute(sql`
      SELECT ta.roster_id, pm.position, pm.age
      FROM trade_assets ta
      LEFT JOIN players_master pm ON pm.player_id = ta.asset_key
      WHERE ta.league_id = ${leagueId}
        AND ta.asset_type = 'player'
        AND ta.direction = 'received'
    `),
  ]);

  const assetRows = assetRowsRaw as unknown as TradeAssetRow[];
  const acquiredRows = acquiredRowsRaw as unknown as AcquiredPlayerRow[];
  const now = Date.now();
  const recentMs = 90 * 24 * 60 * 60 * 1000;

  const perRosterTrades = new Map<number, Map<string, PerTradeShape>>();
  for (const row of assetRows) {
    const trades = perRosterTrades.get(row.roster_id) ?? new Map<string, PerTradeShape>();
    const shape = trades.get(row.trade_id) ?? {
      gave_count: 0,
      received_count: 0,
      includes_pick: false,
      created_at_ms: row.created_at_ms,
    };
    if (row.direction === "gave") shape.gave_count += 1;
    if (row.direction === "received") shape.received_count += 1;
    if (row.asset_type === "pick") shape.includes_pick = true;
    if (row.created_at_ms > shape.created_at_ms) shape.created_at_ms = row.created_at_ms;
    trades.set(row.trade_id, shape);
    perRosterTrades.set(row.roster_id, trades);
  }

  const acquiredPosCounts = new Map<number, Map<string, number>>();
  const acquiredAgeStats = new Map<number, { sum: number; count: number }>();
  for (const row of acquiredRows) {
    const pos = (row.position ?? "").toUpperCase();
    if (pos) {
      const m = acquiredPosCounts.get(row.roster_id) ?? new Map<string, number>();
      m.set(pos, (m.get(pos) ?? 0) + 1);
      acquiredPosCounts.set(row.roster_id, m);
    }
    if (row.age != null) {
      const stats = acquiredAgeStats.get(row.roster_id) ?? { sum: 0, count: 0 };
      stats.sum += row.age;
      stats.count += 1;
      acquiredAgeStats.set(row.roster_id, stats);
    }
  }

  const behaviorMap = new Map<number, ManagerBehavior>();
  for (const [rosterId, tradeMap] of perRosterTrades.entries()) {
    const shapes = [...tradeMap.values()];
    const totalTrades = shapes.length;
    const oneForOnes = shapes.filter((t) => t.gave_count === 1 && t.received_count === 1).length;
    const packageDeals = shapes.filter((t) => t.gave_count + t.received_count >= 4).length;
    const pickDeals = shapes.filter((t) => t.includes_pick).length;
    const recentTrades = shapes.filter((t) => now - t.created_at_ms <= recentMs).length;

    const lastTradeMs = shapes.reduce((m, t) => Math.max(m, t.created_at_ms), 0);
    const lastTradeDaysAgo = lastTradeMs > 0
      ? Math.floor((now - lastTradeMs) / (24 * 60 * 60 * 1000))
      : null;

    const oneForOneRate = totalTrades > 0 ? oneForOnes / totalTrades : 0;
    const packageRate = totalTrades > 0 ? packageDeals / totalTrades : 0;
    const pickHeavyRate = totalTrades > 0 ? pickDeals / totalTrades : 0;
    const preferredStructure = classifyStructure(oneForOneRate, packageRate, pickHeavyRate);

    const posMap = acquiredPosCounts.get(rosterId) ?? new Map<string, number>();
    const sortedPositions = [...posMap.entries()].sort((a, b) => b[1] - a[1]);
    const topAcquiredPositions = sortedPositions.slice(0, 3).map(([p]) => p);

    const biasFlags: string[] = [];
    if (preferredStructure === "1-for-1") addUnique(biasFlags, "prefers_1_for_1");
    if (preferredStructure === "packages") addUnique(biasFlags, "package_friendly");
    if (pickHeavyRate >= 0.45) addUnique(biasFlags, "pick_heavy_trader");
    if (recentTrades >= 4) addUnique(biasFlags, "very_active");
    if (lastTradeDaysAgo != null && lastTradeDaysAgo >= 120) addUnique(biasFlags, "inactive_manager");
    if (sortedPositions[0] && sortedPositions[0][1] >= 4) {
      addUnique(biasFlags, `position_focus_${sortedPositions[0][0]}`);
    }

    const age = acquiredAgeStats.get(rosterId);
    if (age && age.count >= 4) {
      const avg = age.sum / age.count;
      if (avg <= 24.5) addUnique(biasFlags, "youth_buyer");
      if (avg >= 28.5) addUnique(biasFlags, "veteran_buyer");
    }

    behaviorMap.set(rosterId, {
      roster_id: rosterId,
      total_trades: totalTrades,
      recent_trades: recentTrades,
      preferred_structure: preferredStructure,
      is_active: recentTrades > 0 || (lastTradeDaysAgo != null && lastTradeDaysAgo <= 90),
      last_trade_days_ago: lastTradeDaysAgo,
      bias_flags: biasFlags,
      top_acquired_positions: topAcquiredPositions,
    });
  }

  return behaviorMap;
}

export function estimateAcceptance(params: {
  fairness: "fair" | "slight_edge" | "lopsided";
  delta: number;
  sendAssets: { player_id?: string | null; position?: string | null; label?: string }[];
  receiveAssets: { player_id?: string | null; position?: string | null; label?: string }[];
  sendEdges: number[];
  receiveEdges: number[];
  opponent: {
    archetype: string;
    needs: string[];
    top_player_ids_by_pos: Record<string, string>;
    behavior: ManagerBehavior | null;
  } | null;
}): AcceptanceAnalysis | null {
  const { fairness, delta, sendAssets, receiveAssets, sendEdges, receiveEdges, opponent } = params;
  if (!opponent || sendAssets.length === 0 || receiveAssets.length === 0) return null;

  let prob = 50;
  const accept: string[] = [];
  const reject: string[] = [];
  const behavior = opponent.behavior;

  if (fairness === "fair") {
    prob += 15;
    accept.push("Trade power is balanced");
  } else if (fairness === "slight_edge") {
    if (delta > 0) {
      prob += 20;
      accept.push("You're slightly overpaying. They get the better end.");
    } else {
      prob -= 8;
      reject.push("They're giving up slightly more value");
    }
  } else if (fairness === "lopsided") {
    if (delta > 0) {
      prob += 30;
      accept.push("Massive overpay in their favor. They'll take this immediately.");
    } else {
      prob -= 35;
      reject.push("Significantly underpaying. They won't consider this.");
    }
  }

  const sendPositions = sendAssets.map((a) => a.position).filter((x): x is string => !!x);
  const fillsNeed = sendPositions.some((pos) => opponent.needs.includes(pos));
  if (fillsNeed) {
    prob += 15;
    accept.push("Fills a real positional need");
  } else {
    prob -= 5;
    reject.push("Does not address a clear need");
  }

  const theirTopIds = Object.values(opponent.top_player_ids_by_pos);
  const receivingTheirBest = receiveAssets.some((a) => a.player_id && theirTopIds.includes(a.player_id));
  if (receivingTheirBest) {
    prob -= 15;
    reject.push("Targets their top starter");
  }

  if (behavior && behavior.total_trades >= 3) {
    if (sendAssets.length > 1 && behavior.preferred_structure === "1-for-1") {
      prob -= 12;
      reject.push("They prefer 1-for-1 deals");
    }
    if (sendAssets.length === 1 && receiveAssets.length === 1 && behavior.preferred_structure === "1-for-1") {
      prob += 8;
      accept.push("Matches their 1-for-1 preference");
    }
    if (sendAssets.length > 1 && behavior.preferred_structure === "packages") {
      prob += 5;
      accept.push("Comfortable with multi-asset packages");
    }
    if (!behavior.is_active) {
      prob -= 10;
      reject.push(`Inactive for ${behavior.last_trade_days_ago ?? "90+"}+ days`);
    }
    if (behavior.recent_trades >= 3) {
      prob += 5;
      accept.push("Very active trader");
    }
    const matchesHistory = sendPositions.some((pos) => behavior.top_acquired_positions.includes(pos));
    if (matchesHistory) {
      prob += 5;
      accept.push("Historically acquires this position");
    }
  } else if (!behavior || behavior.total_trades === 0) {
    prob -= 10;
    reject.push("No trade history");
  }

  prob = applyQualityAdjustments(prob, accept, reject, sendEdges, receiveEdges);

  if (opponent.archetype === "Rebuilder" || opponent.archetype === "Productive Struggle") {
    accept.push("Rebuild archetype can move producers for long-term value");
  }
  if (opponent.archetype === "Dynasty Juggernaut") {
    prob -= 5;
    reject.push("Juggernauts rarely need to trade");
  }

  prob = clamp(5, prob, 95);
  let label: AcceptanceAnalysis["label"];
  if (prob >= 60) label = "Likely";
  else if (prob >= 40) label = "Possible";
  else if (prob >= 25) label = "Unlikely";
  else label = "Hard";

  return {
    probability: prob,
    label,
    accept_reasons: accept,
    reject_reasons: reject,
  };
}

export function buildAcceptReason(
  acceptance: AcceptanceAnalysis | null,
  fallback: string
): string {
  if (!acceptance) return fallback;
  if (acceptance.accept_reasons.length > 0) {
    const positives = acceptance.accept_reasons.slice(0, 2).join(". ");
    const caution = acceptance.reject_reasons[0];
    return caution ? `${positives}. Watchout: ${caution}.` : `${positives}.`;
  }
  return fallback;
}
