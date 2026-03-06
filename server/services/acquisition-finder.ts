import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import {
  getPowerRankings,
  type RosterRanking,
  type CoreAsset,
  type LeaguePowerRanking,
} from "./power-rankings.js";
import type { ScoredPick } from "./draft-picks.js";
import type {
  AcquisitionResult,
  AcquisitionTarget,
  AcquisitionOpportunity,
  AcquisitionDifficulty,
  AcquisitionOffer,
  OpponentPerspective,
  TradePackageAsset,
  TradeComp,
} from "../../shared/types.js";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";
import { resolvePlayer } from "./player-resolver.js";

// ─── Constants ───

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Pos = (typeof POSITIONS)[number];
const MIN_STARTERS: Record<Pos, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };
const MIN_EDGE = 40;

const ARCHETYPE_WANTS: Record<string, string> = {
  "Dynasty Juggernaut": "depth and future insurance",
  "All-In Contender": "win-now upgrades at any cost",
  "Fragile Contender": "young replacements before their window closes",
  "Productive Struggle": "young assets and draft picks",
  Rebuilder: "draft picks and young prospects above all else",
  "Dead Zone": "any direction that breaks the stalemate",
  Competitor: "small upgrades to push into contention",
};

// ─── Helpers ───

function assetFromPlayer(a: CoreAsset): TradePackageAsset {
  return {
    asset_type: "player",
    label: a.full_name,
    position: a.position,
    edge_score: a.edge_score,
    fc_score: a.fc_score,
    ktc_score: a.ktc_score,
    dp_score: a.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: a.source_agreement,
  };
}

function assetFromPick(p: ScoredPick): TradePackageAsset {
  return {
    asset_type: "pick",
    label: p.label,
    position: null,
    edge_score: p.edge_score,
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

// ─── Main Export ───

export async function findAcquisitionPackages(
  username: string,
  playerId: string
): Promise<AcquisitionResult> {
  const lookup = decodeURIComponent(playerId).trim();
  const pm = await resolvePlayer(lookup);
  if (!pm) return { target: { player_id: "", player_name: playerId, position: "", team: null, age: null, edge_score: 0 }, opportunities: [], summary: `Player not found.` };

  // 2. Get all power rankings
  const allLeagues = await getPowerRankings(username);
  if (allLeagues.length === 0) {
    return {
      target: { player_id: pm.player_id, player_name: pm.full_name, position: pm.position, team: pm.team, age: pm.age, edge_score: 0 },
      opportunities: [],
      summary: "No leagues found. Sync your account first.",
    };
  }

  // 3. Find the target in each league's rosters
  const opportunities: AcquisitionOpportunity[] = [];
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

    // Find user's roster in this league
    const userRoster = league.rosters.find((r) => r.is_user);
    if (!userRoster) continue;

    // Score difficulty
    const difficulty = scoreDifficulty(targetAsset, ownerRoster, league.mode);

    // Generate packages
    const packages = generateAcquisitionOffers(
      userRoster, ownerRoster, targetAsset, difficulty
    );

    // Get trade comps for this league
    const comps = tradeHistory.get(league.league_id) ?? [];

    opportunities.push({
      league_id: league.league_id,
      league_name: league.league_name,
      league_mode: league.mode,
      owner: {
        roster_id: ownerRoster.roster_id,
        display_name: ownerRoster.display_name,
        archetype: ownerRoster.archetype,
      },
      difficulty,
      packages,
      trade_history: comps.slice(0, 3),
    });
  }

  // Sort by difficulty (easiest first)
  opportunities.sort((a, b) => a.difficulty.score - b.difficulty.score);

  // Build summary
  const total = opportunities.length;
  const easiest = opportunities[0];
  let summary = `${pm.full_name} is owned in ${total} of your leagues (not counting leagues where you own them).`;
  if (easiest) {
    summary += ` Easiest to acquire from ${easiest.owner.display_name} in ${easiest.league_name} (${easiest.owner.archetype}, ${easiest.difficulty.positional_importance}).`;
  }

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
  };
}
