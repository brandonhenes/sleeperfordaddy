import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import {
  getPowerRankings,
} from "./power-rankings.js";
import type {
  AcquisitionResult,
  AcquisitionTarget,
  AcquisitionOpportunity,
  AcquisitionDifficulty,
  AcquisitionOffer,
  CoreAsset,
  LeaguePowerRanking,
  OpponentPerspective,
  RosterRanking,
  ScoredPick,
  TradePackageAsset,
  TradeComp,
  TradeValuationWarning,
} from "../../shared/types.js";
import { resolvePlayer } from "./player-resolver.js";
import { evaluateOpportunityPackage } from "./trade-opportunity-valuation.js";
import type { ClassStrengthMap } from "./pick-values.js";
import type { SourceWeights } from "./edge-score.js";
import { recommendationRejectReason } from "./trade-recommendation-quality.js";
import {
  applyTradeStrategyMetadata,
  classifyTradeStrategy,
} from "./trade-strategy-thesis.js";

// ─── Constants ───

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Pos = (typeof POSITIONS)[number];
const MIN_STARTERS: Record<Pos, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };
const MIN_EDGE = 40;
const ACQUISITION_CACHE_TTL_MS = 5 * 60 * 1000;
const ACQUISITION_LEAGUE_CONCURRENCY = 4;

const ARCHETYPE_WANTS: Record<string, string> = {
  "Dynasty Juggernaut": "depth and future insurance",
  "All-In Contender": "win-now upgrades at any cost",
  "Fragile Contender": "young replacements before their window closes",
  "Productive Struggle": "young assets and draft picks",
  Rebuilder: "draft picks and young prospects above all else",
  "Dead Zone": "any direction that breaks the stalemate",
  Competitor: "small upgrades to push into contention",
};

type AcquisitionCacheEntry = {
  expiresAt: number;
  data?: AcquisitionResult;
  promise?: Promise<AcquisitionResult>;
};

interface AcquisitionFinderOptions {
  maxOpportunities?: number;
}

const acquisitionCache = new Map<string, AcquisitionCacheEntry>();

function acquisitionCacheKey(
  username: string,
  lookup: string,
  classStrengths?: ClassStrengthMap,
  weights?: SourceWeights,
  options: AcquisitionFinderOptions = {}
): string {
  return JSON.stringify({
    username: username.toLowerCase(),
    lookup: lookup.toLowerCase(),
    classStrengths: classStrengths ?? null,
    weights: weights ?? null,
    maxOpportunities: options.maxOpportunities ?? null,
  });
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) break;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── Helpers ───

function assetFromPlayer(a: CoreAsset): TradePackageAsset {
  return {
    player_id: a.player_id,
    asset_type: "player",
    label: a.full_name,
    position: a.position,
    edge_score: a.edge_score,
    trade_power: 0,
    fc_score: a.fc_score,
    ktc_score: a.ktc_score,
    dp_score: a.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    ppg: a.ppg,
    source_agreement: a.source_agreement,
  };
}

function assetFromPick(p: ScoredPick): TradePackageAsset {
  return {
    asset_type: "pick",
    pick_season: p.season,
    pick_round: p.round,
    pick_tier: p.tier,
    pick_slot: p.pick_slot,
    pick_original_owner_id: p.original_owner_id,
    label: p.label,
    position: null,
    edge_score: p.edge_score,
    trade_power: 0,
    fc_score: null,
    ktc_score: p.ktc_score,
    dp_score: p.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: "high",
  };
}

function totalEdge(assets: TradePackageAsset[]): number {
  return assets.reduce((s, a) => s + a.edge_score, 0);
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

function fairness(delta: number): "fair" | "slight_edge" | "lopsided" {
  const abs = Math.abs(delta);
  if (abs <= 5) return "fair";
  if (abs <= 15) return "slight_edge";
  return "lopsided";
}

function valueSweetenerHint(offer: AcquisitionOffer): string | null {
  if (offer.delta >= 1_500) {
    return "KTC League says you are light; add a meaningful player or pick to make this realistic.";
  }
  if (offer.delta >= 600) {
    return "KTC League says you may need a smaller sweetener to close the gap.";
  }
  if (offer.delta <= -1_500) {
    return "KTC League says this is a real overpay; try lowering one piece before sending it.";
  }
  return offer.sweetener_hint;
}

interface AcquisitionStrategyContext {
  userArchetype?: string;
  ownerArchetype?: string;
}

export async function valueAcquisitionOfferWithKtcLeague(
  offer: AcquisitionOffer,
  leagueId: string,
  mode: "sf" | "1qb",
  classStrengths?: ClassStrengthMap,
  evaluatePackage = evaluateOpportunityPackage,
  weights?: SourceWeights,
  strategyContext: AcquisitionStrategyContext = {}
): Promise<AcquisitionOffer> {
  try {
    const valuation = await evaluatePackage({
      send: offer.you_send,
      receive: offer.you_receive,
      leagueId,
      mode,
      valueType: "dynasty",
      classStrengths,
      weights,
    });
    const valued: AcquisitionOffer = {
      ...offer,
      you_send: valuation.sendAssets,
      you_receive: valuation.receiveAssets,
      send_total: valuation.sendContextTradeValue,
      receive_total: valuation.receiveContextTradeValue,
      delta: valuation.delta,
      fairness: valuation.fairness,
      send_edge: valuation.sendEdge,
      receive_edge: valuation.receiveEdge,
      delta_edge: valuation.deltaEdge,
      send_base_market_value: valuation.sendBaseMarketValue,
      receive_base_market_value: valuation.receiveBaseMarketValue,
      send_league_market_value: valuation.sendLeagueMarketValue,
      receive_league_market_value: valuation.receiveLeagueMarketValue,
      send_context_trade_value: valuation.sendContextTradeValue,
      receive_context_trade_value: valuation.receiveContextTradeValue,
      valuation_edge: valuation.delta,
      valuation_percent_gap: valuation.percentGap,
      valuation_warnings: valuation.warnings,
      valuation_explanations: valuation.valuationExplanations,
    };
    const strategy = classifyTradeStrategy({
      sendAssets: valued.you_send,
      receiveAssets: valued.you_receive,
      userArchetype: strategyContext.userArchetype,
      opponentArchetype: strategyContext.ownerArchetype,
      valueEdgeForUser: valued.valuation_edge ?? valued.delta,
      percentGap: valued.valuation_percent_gap,
      fairness: valued.fairness,
      addressesMyNeed: true,
      addressesTheirNeed: valued.their_perspective.needs_addressed.length > 0,
      acceptanceProbability: valued.acceptance_likelihood,
      managerSignals: [valued.their_perspective.verdict].filter(Boolean),
      mode,
      pickOnlyMaterial: false,
    });
    return {
      ...applyTradeStrategyMetadata(valued, strategy),
      sweetener_hint: valueSweetenerHint(valued),
    };
  } catch (err) {
    const warning: TradeValuationWarning = {
      type: "missing_data",
      severity: "warning",
      side: null,
      message: "KTC League valuation could not finish for this package; showing the generated starting point.",
    };
    const fallbackStrategy = classifyTradeStrategy({
      sendAssets: offer.you_send,
      receiveAssets: offer.you_receive,
      userArchetype: strategyContext.userArchetype,
      opponentArchetype: strategyContext.ownerArchetype,
      valueEdgeForUser: offer.valuation_edge ?? offer.delta,
      percentGap: offer.valuation_percent_gap,
      fairness: offer.fairness,
      addressesMyNeed: true,
      addressesTheirNeed: offer.their_perspective.needs_addressed.length > 0,
      acceptanceProbability: offer.acceptance_likelihood,
      managerSignals: [offer.their_perspective.verdict].filter(Boolean),
      mode,
      pickOnlyMaterial: false,
    });
    return applyTradeStrategyMetadata({
      ...offer,
      valuation_warnings: [...(offer.valuation_warnings ?? []), warning],
      valuation_explanations: [
        ...(offer.valuation_explanations ?? []),
        err instanceof Error ? `KTC League valuation failed: ${err.message}` : "KTC League valuation failed.",
      ],
    }, fallbackStrategy);
  }
}

async function valueAcquisitionOffersForLeague(
  offers: AcquisitionOffer[],
  leagueId: string,
  mode: "sf" | "1qb",
  classStrengths?: ClassStrengthMap,
  weights?: SourceWeights,
  strategyContext: AcquisitionStrategyContext = {}
): Promise<AcquisitionOffer[]> {
  const valued = await Promise.all(
    offers.map((offer) =>
      valueAcquisitionOfferWithKtcLeague(
        offer,
        leagueId,
        mode,
        classStrengths,
        evaluateOpportunityPackage,
        weights,
        strategyContext
      )
    )
  );

  return filterAcquisitionRecommendationOffers(valued).sort(
    (a, b) =>
      (b.strategy_score ?? 0) - (a.strategy_score ?? 0) ||
      b.acceptance_likelihood - a.acceptance_likelihood
  );
}

export function filterAcquisitionRecommendationOffers(offers: AcquisitionOffer[]): AcquisitionOffer[] {
  return offers.filter((offer) =>
    !recommendationRejectReason({
      valueEdgeForUser: offer.valuation_edge ?? offer.delta,
      percentGap: offer.valuation_percent_gap,
      fairness: offer.fairness,
      sendAssets: offer.you_send,
      receiveAssets: offer.you_receive,
    }) &&
    !(offer.strategy_fit === "bad" && (offer.valuation_edge ?? offer.delta) < 1_500)
  );
}

// ─── Acquisition Difficulty Scoring ───

function scoreDifficulty(
  target: CoreAsset,
  ownerRoster: RosterRanking,
  leagueMode: "sf" | "1qb"
): AcquisitionDifficulty {
  const pos = target.position as Pos;
  const reasons: string[] = [];
  let score = 0;

  // 1. Positional importance (0-30)
  const posPlayers = ownerRoster.core_assets
    .filter((a) => a.position === pos)
    .sort((a, b) => b.edge_score - a.edge_score);
  const rank = posPlayers.findIndex((a) => a.player_id === target.player_id) + 1;
  const isStarter = rank <= (MIN_STARTERS[pos] ?? 1);
  let posImportance = "";

  if (rank === 1) {
    score += 30;
    posImportance = `Their ${pos}1 (top starter)`;
    reasons.push(`This is their best ${pos}`);
  } else if (isStarter) {
    score += 20;
    posImportance = `Their ${pos}${rank} (starter)`;
    reasons.push(`Starter-level ${pos} for them`);
  } else {
    score += 5;
    posImportance = `Their ${pos}${rank} (bench depth)`;
    reasons.push(`Depth piece, not critical to their lineup`);
  }

  // SF QB premium
  if (pos === "QB" && leagueMode === "sf" && rank <= 2) {
    score += 10;
    reasons.push("QBs are premium in Superflex");
  }

  // 2. Replacement gap (0-30)
  const nextManUp = posPlayers[rank]; // player after the target
  const replacementGap = nextManUp
    ? target.edge_score - nextManUp.edge_score
    : target.edge_score; // no replacement at all

  if (replacementGap >= 20) {
    score += 30;
    reasons.push(`${Math.round(replacementGap)} point drop to their next ${pos}`);
  } else if (replacementGap >= 10) {
    score += 20;
    reasons.push(`${Math.round(replacementGap)} point replacement gap`);
  } else {
    score += 10;
    reasons.push(`Only ${Math.round(replacementGap)} point replacement gap`);
  }

  // 3. Archetype resistance (0-20)
  const arch = ownerRoster.archetype;
  const isVeteran = (target.age ?? 25) >= 27;
  const isYoung = (target.age ?? 25) <= 24;

  if (arch === "Rebuilder" || arch === "Productive Struggle") {
    if (isVeteran) {
      score += 3;
      reasons.push(`${arch} may want to sell aging players`);
    } else if (isYoung) {
      score += 15;
      reasons.push(`${arch} wants to keep young building blocks`);
    } else {
      score += 8;
    }
  } else if (arch.includes("Contender") || arch === "Dynasty Juggernaut") {
    if (isStarter) {
      score += 20;
      reasons.push(`${arch} won't sell starters during their window`);
    } else {
      score += 8;
      reasons.push(`${arch} might trade depth for upgrades elsewhere`);
    }
  } else {
    score += 10;
  }

  // 4. Value tier (0-20)
  if (target.edge_score >= 90) {
    score += 20;
    reasons.push("Elite dynasty asset (90+ edge)");
  } else if (target.edge_score >= 80) {
    score += 15;
    reasons.push("High-value asset (80+ edge)");
  } else if (target.edge_score >= 70) {
    score += 10;
  } else {
    score += 5;
  }

  const total = Math.min(100, score);
  const label: AcquisitionDifficulty["label"] =
    total <= 25 ? "easy" :
    total <= 50 ? "moderate" :
    total <= 75 ? "hard" :
    "near_impossible";

  return {
    score: total,
    label,
    reasons,
    positional_importance: posImportance,
    replacement_gap: r1(replacementGap),
    archetype_resistance: `${arch}: wants ${ARCHETYPE_WANTS[arch] ?? "flexibility"}`,
  };
}

// ─── Opponent Perspective (Feature #9) ───

function buildPerspective(
  ownerRoster: RosterRanking,
  target: CoreAsset,
  theySend: TradePackageAsset[], // what they give up (includes the target)
  theyReceive: TradePackageAsset[], // what they get
  difficulty: AcquisitionDifficulty
): OpponentPerspective {
  const pos = target.position as Pos;

  // Build before/after lineup snapshot for affected positions
  const affectedPositions = new Set<string>();
  for (const a of [...theySend, ...theyReceive]) {
    if (a.position) affectedPositions.add(a.position);
  }

  const givenNames = new Set(theySend.map((a) => a.label));
  const lineupBefore: OpponentPerspective["lineup_before"] = [];
  const lineupAfter: OpponentPerspective["lineup_after"] = [];

  for (const p of [...affectedPositions]) {
    const starters = ownerRoster.lineup.starters
      .filter((s) => s.position === p)
      .sort((a, b) => b.edge_score - a.edge_score);

    // Before: current starters at this position
    for (const s of starters.slice(0, 2)) {
      lineupBefore.push({ position: p, player: s.full_name, edge_score: s.edge_score });
    }

    // After: remove given players, add received players, re-sort
    const remaining = starters.filter((s) => !givenNames.has(s.full_name));
    const received = theyReceive
      .filter((a) => a.position === p)
      .map((a) => ({ full_name: a.label, edge_score: a.edge_score }));
    const afterPool = [
      ...remaining.map((s) => ({ name: s.full_name, score: s.edge_score })),
      ...received.map((a) => ({ name: a.full_name, score: a.edge_score })),
    ].sort((a, b) => b.score - a.score);

    for (const a of afterPool.slice(0, 2)) {
      lineupAfter.push({ position: p, player: a.name, edge_score: a.score });
    }
  }

  // Calculate net starter value change
  const beforeTotal = lineupBefore.reduce((s, a) => s + a.edge_score, 0);
  const afterTotal = lineupAfter.reduce((s, a) => s + a.edge_score, 0);
  const netChange = r1(afterTotal - beforeTotal);

  // Positions upgraded vs downgraded
  const upgraded: string[] = [];
  const downgraded: string[] = [];
  for (const p of [...affectedPositions]) {
    const beforeBest = lineupBefore.filter((l) => l.position === p).sort((a, b) => b.edge_score - a.edge_score)[0];
    const afterBest = lineupAfter.filter((l) => l.position === p).sort((a, b) => b.edge_score - a.edge_score)[0];
    if (!beforeBest || !afterBest) continue;
    if (afterBest.edge_score > beforeBest.edge_score + 3) upgraded.push(p);
    else if (afterBest.edge_score < beforeBest.edge_score - 3) downgraded.push(p);
  }

  // Needs analysis
  const arch = ownerRoster.archetype;
  const receivedPicks = theyReceive.filter((a) => a.asset_type === "pick").length;
  const receivedPlayers = theyReceive.filter((a) => a.asset_type === "player");

  const needsAddressed: string[] = [];
  const needsStillOpen: string[] = [];

  // Check which of their weak positions we're filling
  const slotGrades = ownerRoster.lineup.slot_grades;
  for (const g of slotGrades) {
    if (g.grade === "hole" || g.grade === "weak") {
      const receivedAtPos = receivedPlayers.filter((a) => a.position === g.slot_label);
      if (receivedAtPos.length > 0) {
        needsAddressed.push(`Fills ${g.slot_label} ${g.grade}`);
      } else {
        needsStillOpen.push(`Still ${g.grade} at ${g.slot_label}`);
      }
    }
  }
  if (receivedPicks > 0) {
    needsAddressed.push(`Gains ${receivedPicks} draft pick${receivedPicks > 1 ? "s" : ""}`);
  }

  // Archetype-specific analysis
  let archAnalysis = "";
  if (arch === "Rebuilder" || arch === "Productive Struggle") {
    if (receivedPicks > 0) {
      archAnalysis = `As a ${arch}, getting ${receivedPicks} pick${receivedPicks > 1 ? "s" : ""} accelerates the rebuild. ${target.full_name} is a sell candidate for them if the return is right.`;
    } else {
      archAnalysis = `As a ${arch}, they ideally want picks. Offering only players may not align with their strategy unless the players are young and high-upside.`;
    }
  } else if (arch.includes("Contender") || arch === "Dynasty Juggernaut") {
    if (upgraded.length > 0 && downgraded.length <= upgraded.length) {
      archAnalysis = `As a ${arch}, they need to keep winning. This trade ${upgraded.length > 0 ? "upgrades " + upgraded.join("/") : ""}, which could help their championship push.`;
    } else {
      archAnalysis = `As a ${arch}, losing ${target.full_name} hurts their ${pos} depth. They need a compelling reason to weaken a contending roster.`;
    }
  } else {
    archAnalysis = `As a ${arch}, they're flexible. The key question is whether this package moves them closer to contention or provides enough future value to justify the loss.`;
  }

  // Verdict
  let verdict: OpponentPerspective["verdict"] = "might_accept";
  let verdictReason = "";

  if (difficulty.label === "near_impossible") {
    verdict = "no_chance";
    verdictReason = `${target.full_name} is too important to their roster. They have no viable replacement and are competing now.`;
  } else if (difficulty.label === "hard") {
    if (netChange >= 0 && needsAddressed.length > 0) {
      verdict = "might_accept";
      verdictReason = `Hard to pry away, but this package addresses their needs and maintains roster value.`;
    } else {
      verdict = "unlikely";
      verdictReason = `They'd be downgrading without clear upside. Would need a stronger offer.`;
    }
  } else if (difficulty.label === "moderate") {
    if (needsAddressed.length > 0 || receivedPicks > 0) {
      verdict = "likely_accept";
      verdictReason = `Fair value with clear positional benefit for them. Good chance they accept.`;
    } else {
      verdict = "might_accept";
      verdictReason = `Value is close to fair, but doesn't directly fill a need.`;
    }
  } else {
    verdict = "likely_accept";
    verdictReason = `${target.full_name} is expendable depth for them. This is a straightforward deal.`;
  }

  return {
    lineup_before: lineupBefore,
    lineup_after: lineupAfter,
    positions_upgraded: upgraded,
    positions_downgraded: downgraded,
    net_starter_value_change: netChange,
    archetype_analysis: archAnalysis,
    needs_addressed: needsAddressed,
    needs_still_open: needsStillOpen,
    verdict,
    verdict_reason: verdictReason,
  };
}

// ─── Package Generation ───

function generateAcquisitionOffers(
  userRoster: RosterRanking,
  ownerRoster: RosterRanking,
  target: CoreAsset,
  difficulty: AcquisitionDifficulty
): AcquisitionOffer[] {
  const offers: AcquisitionOffer[] = [];
  const targetAsset = assetFromPlayer(target);
  const targetValue = target.edge_score;
  const pos = target.position as Pos;

  // What does the owner need?
  const ownerSlotGrades = ownerRoster.lineup.slot_grades;
  const ownerWeakPositions = ownerSlotGrades
    .filter((g) => g.grade === "hole" || g.grade === "weak")
    .map((g) => g.slot_label);

  // User's available assets (excluding users own starters at positions they need)
  const userAssets = userRoster.core_assets
    .filter((a) => a.edge_score >= MIN_EDGE && POSITIONS.includes(a.position as Pos))
    .sort((a, b) => b.edge_score - a.edge_score);

  const userPicks = (userRoster.draft_picks ?? [])
    .filter((p) => p.edge_score > 0)
    .sort((a, b) => b.edge_score - a.edge_score);

  // Overpay multiplier based on difficulty
  const overpayFactor =
    difficulty.label === "near_impossible" ? 1.25 :
    difficulty.label === "hard" ? 1.12 :
    difficulty.label === "moderate" ? 1.0 :
    0.95;

  const targetCost = targetValue * overpayFactor;

  // ─── Offer 1: Balanced player swap ───
  // Find user player at a position the owner needs, close in value
  for (const weakPos of ownerWeakPositions) {
    const candidates = userAssets.filter(
      (a) => a.position === weakPos && a.edge_score >= targetValue * 0.7
    );
    if (candidates.length === 0) continue;

    // Pick the one closest to target value (with overpay factor)
    const best = candidates.reduce((prev, curr) =>
      Math.abs(curr.edge_score - targetCost) < Math.abs(prev.edge_score - targetCost) ? curr : prev
    );

    const send = [assetFromPlayer(best)];
    const receive = [targetAsset];
    const delta = totalEdge(receive) - totalEdge(send);
    const f = fairness(delta);

    if (f === "lopsided" && delta > 15) continue; // we're overpaying too much

    const perspective = buildPerspective(ownerRoster, target, receive, send, difficulty);

    offers.push({
      type: "balanced",
      label: `${weakPos}-for-${pos} Swap`,
      acceptance_likelihood: perspective.verdict === "likely_accept" ? 75
        : perspective.verdict === "might_accept" ? 50 : 25,
      you_send: send,
      you_receive: receive,
      send_total: r1(totalEdge(send)),
      receive_total: r1(totalEdge(receive)),
      delta: r1(delta),
      fairness: f,
      sweetener_hint: Math.abs(delta) > 5 && Math.abs(delta) <= 12
        ? `Add a late-round pick to ${delta > 0 ? "sweeten" : "balance"}`
        : null,
      their_perspective: perspective,
    });
    break; // one balanced offer
  }

  // ─── Offer 2: Consolidation (2 players for target) ───
  {
    const sendCandidates: CoreAsset[] = [];
    const usedPos = new Set<string>();

    // Prefer positions the owner needs
    const sortedPositions = [...POSITIONS].sort((a, b) => {
      const aWeak = ownerWeakPositions.includes(a) ? 0 : 1;
      const bWeak = ownerWeakPositions.includes(b) ? 0 : 1;
      return aWeak - bWeak;
    });

    for (const p of sortedPositions) {
      if (usedPos.size >= 2) break;
      if (p === pos) continue; // don't send same position back unless they need it
      const available = userAssets.filter(
        (a) => a.position === p && !sendCandidates.some((s) => s.player_id === a.player_id)
      );
      if (available.length === 0) continue;
      sendCandidates.push(available[0]);
      usedPos.add(p);
    }

    // Also try same position if owner doesn't need it (depth consolidation)
    if (sendCandidates.length < 2) {
      const samePos = userAssets.filter(
        (a) => !sendCandidates.some((s) => s.player_id === a.player_id) && a.edge_score >= MIN_EDGE
      );
      for (const a of samePos) {
        if (sendCandidates.length >= 2) break;
        sendCandidates.push(a);
      }
    }

    if (sendCandidates.length >= 2) {
      const send = sendCandidates.slice(0, 2).map(assetFromPlayer);
      const receive = [targetAsset];
      const delta = totalEdge(receive) - totalEdge(send);
      const f = fairness(delta);

      if (!(f === "lopsided" && delta > 15)) {
        const perspective = buildPerspective(ownerRoster, target, receive, send, difficulty);

        offers.push({
          type: "consolidation",
          label: "2-for-1 Package",
          acceptance_likelihood: perspective.verdict === "likely_accept" ? 70
            : perspective.verdict === "might_accept" ? 45 : 20,
          you_send: send,
          you_receive: receive,
          send_total: r1(totalEdge(send)),
          receive_total: r1(totalEdge(receive)),
          delta: r1(delta),
          fairness: f,
          sweetener_hint: delta < -5
            ? `Consider adding a mid-round pick to close the gap`
            : delta > 10
              ? `You may be overpaying. Try swapping in a lower-tier player.`
              : null,
          their_perspective: perspective,
        });
      }
    }
  }

  // ─── Offer 3: Picks + player package ───
  if (userPicks.length > 0) {
    const send: TradePackageAsset[] = [];
    let sendVal = 0;

    // Add best pick
    send.push(assetFromPick(userPicks[0]));
    sendVal += userPicks[0].edge_score;

    // Add more to reach target cost
    if (sendVal < targetCost * 0.7) {
      // Try second pick
      if (userPicks.length > 1) {
        send.push(assetFromPick(userPicks[1]));
        sendVal += userPicks[1].edge_score;
      }
    }

    // Still short? Add a depth player at a position they need
    if (sendVal < targetCost * 0.8) {
      for (const weakPos of ownerWeakPositions) {
        const depth = userAssets.filter(
          (a) => a.position === weakPos && a.edge_score >= MIN_EDGE && a.edge_score <= targetValue * 0.6
        );
        if (depth.length > 0) {
          send.push(assetFromPlayer(depth[0]));
          sendVal += depth[0].edge_score;
          break;
        }
      }
    }

    if (sendVal >= targetValue * 0.6) {
      const receive = [targetAsset];
      const delta = totalEdge(receive) - totalEdge(send);
      const f = fairness(delta);

      const perspective = buildPerspective(ownerRoster, target, receive, send, difficulty);

      offers.push({
        type: "picks_heavy",
        label: "Draft Capital Package",
        acceptance_likelihood: perspective.verdict === "likely_accept" ? 65
          : perspective.verdict === "might_accept" ? 40 : 15,
        you_send: send,
        you_receive: receive,
        send_total: r1(totalEdge(send)),
        receive_total: r1(totalEdge(receive)),
        delta: r1(delta),
        fairness: f,
        sweetener_hint: delta < -8
          ? `Upgrade the pick round or add another future asset`
          : null,
        their_perspective: perspective,
      });
    }
  }

  // ─── Offer 4: Overpay package (for hard/near_impossible targets) ───
  if (difficulty.label === "hard" || difficulty.label === "near_impossible") {
    const send: TradePackageAsset[] = [];

    // Best pick + best player at their weak position + another pick
    if (userPicks.length > 0) send.push(assetFromPick(userPicks[0]));
    for (const weakPos of ownerWeakPositions) {
      const best = userAssets.find(
        (a) => a.position === weakPos && a.edge_score >= 60
      );
      if (best) { send.push(assetFromPlayer(best)); break; }
    }
    if (userPicks.length > 1) send.push(assetFromPick(userPicks[1]));

    if (send.length >= 2) {
      const receive = [targetAsset];
      const delta = totalEdge(receive) - totalEdge(send);

      const perspective = buildPerspective(ownerRoster, target, receive, send, difficulty);

      offers.push({
        type: "overpay",
        label: "Premium Overpay",
        acceptance_likelihood: perspective.verdict === "likely_accept" ? 55
          : perspective.verdict === "might_accept" ? 35 : 15,
        you_send: send,
        you_receive: receive,
        send_total: r1(totalEdge(send)),
        receive_total: r1(totalEdge(receive)),
        delta: r1(delta),
        fairness: fairness(delta),
        sweetener_hint: difficulty.label === "near_impossible"
          ? `This is a franchise-level player for them. Even this may not be enough.`
          : null,
        their_perspective: perspective,
      });
    }
  }

  // Sort by acceptance likelihood
  offers.sort((a, b) => b.acceptance_likelihood - a.acceptance_likelihood);
  return offers.slice(0, 3);
}

// ─── Trade History Lookup ───

async function getTradeHistory(
  playerName: string,
  leagueIds: string[]
): Promise<Map<string, TradeComp[]>> {
  if (leagueIds.length === 0) return new Map();

  const frags = leagueIds.map((id) => sql`${id}`);
  const inClause = sql.join(frags, sql`, `);

  const rows = await db.execute(sql`
    SELECT ta.trade_id, ta.league_id, ta.asset_key, ta.asset_name,
           ta.asset_type, ta.direction, ta.roster_id, ta.created_at_ms,
           l.name AS league_name
    FROM trade_assets ta
    JOIN leagues l ON l.league_id = ta.league_id
    WHERE ta.league_id IN (${inClause})
      AND ta.trade_id IN (
        SELECT DISTINCT trade_id FROM trade_assets
        WHERE asset_type = 'player' AND asset_name = ${playerName}
      )
    ORDER BY ta.created_at_ms DESC
  `);

  type Row = {
    trade_id: string; league_id: string; asset_key: string;
    asset_name: string | null; asset_type: string; direction: string;
    roster_id: number; created_at_ms: number; league_name: string;
  };

  const tradesByLeague = new Map<string, TradeComp[]>();

  // Group by trade_id, then build comps
  const tradeMap = new Map<string, { league_id: string; league_name: string; created_at_ms: number; gave: string[]; received: string[] }>();

  for (const r of rows as unknown as Row[]) {
    const entry = tradeMap.get(r.trade_id) ?? {
      league_id: r.league_id,
      league_name: r.league_name,
      created_at_ms: r.created_at_ms,
      gave: [],
      received: [],
    };

    // We want to show from the perspective of whoever gave up the target player
    const label = r.asset_name ?? r.asset_key;
    // Find the roster that gave the target player in this trade
    if (label.toLowerCase() === playerName.toLowerCase() && r.direction === "gave") {
      // This roster gave the target; their "received" are what the target cost
    }
    entry[r.direction === "gave" ? "gave" : "received"].push(label);
    tradeMap.set(r.trade_id, entry);
  }

  for (const [, t] of tradeMap) {
    const comp: TradeComp = {
      league_name: t.league_name,
      date: new Date(t.created_at_ms).toISOString().slice(0, 10),
      gave: t.gave,
      received: t.received,
    };
    const arr = tradesByLeague.get(t.league_id) ?? [];
    arr.push(comp);
    tradesByLeague.set(t.league_id, arr);
  }

  return tradesByLeague;
}

function bestOfferScore(opportunity: AcquisitionOpportunity): number {
  const best = opportunity.packages[0];
  if (!best) return Number.NEGATIVE_INFINITY;
  return (
    (best.strategy_score ?? 0) * 2 +
    best.acceptance_likelihood +
    (best.valuation_edge ?? best.delta) / 100
  );
}

export function rankAcquisitionOpportunities(
  opportunities: AcquisitionOpportunity[]
): AcquisitionOpportunity[] {
  return opportunities
    .filter((opportunity) => opportunity.packages.length > 0)
    .sort((a, b) =>
      a.difficulty.score - b.difficulty.score ||
      bestOfferScore(b) - bestOfferScore(a)
    );
}

export function buildAcquisitionSummary(
  playerName: string,
  ownedLeagueCount: number,
  opportunities: AcquisitionOpportunity[],
  shownCount = opportunities.length
): string {
  let summary = `${playerName} is owned in ${ownedLeagueCount} of your leagues (not counting leagues where you own them).`;
  if (opportunities.length > 0) {
    const easiest = opportunities[0];
    if (shownCount < opportunities.length) {
      summary += ` Showing the best ${shownCount} of ${opportunities.length} viable starting offers.`;
    } else {
      summary += ` ${opportunities.length} leagues produced viable starting offers.`;
    }
    summary += ` Easiest viable path is ${easiest.owner.display_name} in ${easiest.league_name} (${easiest.owner.archetype}, ${easiest.difficulty.positional_importance}).`;
  } else {
    summary += " No viable starting offers were generated from your current rosters.";
  }
  return summary;
}

// ─── Main Export ───

export async function findAcquisitionPackages(
  username: string,
  playerId: string,
  classStrengths?: ClassStrengthMap,
  weights?: SourceWeights,
  options: AcquisitionFinderOptions = {}
): Promise<AcquisitionResult> {
  const lookup = decodeURIComponent(playerId).trim();
  const key = acquisitionCacheKey(username, lookup, classStrengths, weights, options);
  const now = Date.now();
  const cached = acquisitionCache.get(key);
  if (cached?.data && cached.expiresAt > now) {
    return cached.data;
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const promise = findAcquisitionPackagesUncached(username, lookup, classStrengths, weights, options)
    .then((data) => {
      acquisitionCache.set(key, {
        expiresAt: Date.now() + ACQUISITION_CACHE_TTL_MS,
        data,
      });
      return data;
    })
    .catch((error: unknown) => {
      acquisitionCache.delete(key);
      throw error;
    });

  acquisitionCache.set(key, {
    expiresAt: now + ACQUISITION_CACHE_TTL_MS,
    promise,
  });
  return promise;
}

async function findAcquisitionPackagesUncached(
  username: string,
  lookup: string,
  classStrengths?: ClassStrengthMap,
  weights?: SourceWeights,
  options: AcquisitionFinderOptions = {}
): Promise<AcquisitionResult> {
  const pm = await resolvePlayer(lookup);
  if (!pm) return { target: { player_id: "", player_name: lookup, position: "", team: null, age: null, edge_score: 0 }, opportunities: [], summary: `Player not found.` };

  // 2. Get all power rankings
  const allLeagues = await getPowerRankings(username, "dynasty", weights, undefined, {
    forceDbOnly: true,
    skipLeaguePoints: true,
  });
  if (allLeagues.length === 0) {
    return {
      target: { player_id: pm.player_id, player_name: pm.full_name, position: pm.position, team: pm.team, age: pm.age, edge_score: 0 },
      opportunities: [],
      summary: "No leagues found. Sync your account first.",
    };
  }

  // 3. Find the target in each league's rosters
  const candidates: Array<{
    league: LeaguePowerRanking;
    ownerRoster: RosterRanking;
    userRoster: RosterRanking;
    targetAsset: CoreAsset;
    difficulty: AcquisitionDifficulty;
    generatedPackages: AcquisitionOffer[];
  }> = [];
  let ownedLeagueCount = 0;
  let targetEdgeScore = 0;
  const leagueIds = allLeagues.map((l) => l.league_id);

  // Get trade history in bulk
  const tradeHistory = await getTradeHistory(pm.full_name, leagueIds);

  for (const league of allLeagues) {
    // Find which roster owns this player
    let ownerRoster: RosterRanking | undefined;
    let targetAsset: CoreAsset | undefined;

    for (const roster of league.rosters) {
      if (roster.is_user) continue; // skip user's own roster
      const found = roster.core_assets.find(
        (a) => a.player_id === pm.player_id
      );
      if (found) {
        ownerRoster = roster;
        targetAsset = found;
        if (targetEdgeScore <= 0) targetEdgeScore = found.edge_score;
        break;
      }
    }

    if (!ownerRoster || !targetAsset) continue;
    ownedLeagueCount += 1;

    // Find user's roster in this league
    const userRoster = league.rosters.find((r) => r.is_user);
    if (!userRoster) continue;

    // Score difficulty
    const difficulty = scoreDifficulty(targetAsset, ownerRoster, league.mode);

    // Generate packages first, then value them through the shared KTC League trade pipeline.
    const generatedPackages = generateAcquisitionOffers(
      userRoster, ownerRoster, targetAsset, difficulty
    );
    if (generatedPackages.length === 0) continue;

    candidates.push({
      league,
      ownerRoster,
      userRoster,
      targetAsset,
      difficulty,
      generatedPackages,
    });
  }

  candidates.sort((a, b) => a.difficulty.score - b.difficulty.score);

  const candidateLimit = options.maxOpportunities
    ? Math.min(candidates.length, options.maxOpportunities)
    : candidates.length;
  const candidatesToValue = candidates.slice(0, candidateLimit);

  const valuedOpportunities = await mapLimit(
    candidatesToValue,
    ACQUISITION_LEAGUE_CONCURRENCY,
    async (candidate) => {
      const packages = await valueAcquisitionOffersForLeague(
        candidate.generatedPackages,
        candidate.league.league_id,
        candidate.league.mode,
        classStrengths,
        weights,
        {
          userArchetype: candidate.userRoster.archetype,
          ownerArchetype: candidate.ownerRoster.archetype,
        }
      );

      const comps = tradeHistory.get(candidate.league.league_id) ?? [];

      return {
        league_id: candidate.league.league_id,
        league_name: candidate.league.league_name,
        league_mode: candidate.league.mode,
        owner: {
          roster_id: candidate.ownerRoster.roster_id,
          display_name: candidate.ownerRoster.display_name,
          archetype: candidate.ownerRoster.archetype,
        },
        difficulty: candidate.difficulty,
        packages,
        trade_history: comps.slice(0, 3),
      };
    }
  );

  const rankedOpportunities = rankAcquisitionOpportunities(valuedOpportunities);
  const opportunities = options.maxOpportunities
    ? rankedOpportunities.slice(0, options.maxOpportunities)
    : rankedOpportunities;
  const partialResults = candidateLimit < candidates.length || opportunities.length < rankedOpportunities.length;
  const summary = buildAcquisitionSummary(
    pm.full_name,
    ownedLeagueCount,
    rankedOpportunities,
    opportunities.length
  );

  return {
    target: {
      player_id: pm.player_id,
      player_name: pm.full_name,
      position: pm.position,
      team: pm.team,
      age: pm.age,
      edge_score: targetEdgeScore,
    },
    opportunities,
    summary,
    partial_results: partialResults || undefined,
    total_opportunities: partialResults ? candidates.length : rankedOpportunities.length,
    warnings: partialResults
      ? [`Showing the fastest ${opportunities.length} acquisition paths first. Load the full board to evaluate every owner.`]
      : undefined,
  };
}
