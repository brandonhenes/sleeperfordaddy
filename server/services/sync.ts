import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { SEASONS, SLEEPER_CONCURRENCY, TRANSACTION_ROUNDS } from "../../shared/constants.js";
import { getUser } from "../sleeper/users.js";
import { getUserLeagues, getLeagueUsers, getLeague } from "../sleeper/leagues.js";
import { getLeagueRosters } from "../sleeper/rosters.js";
import { getLeagueMatchups } from "../sleeper/matchups.js";
import { getLeagueTransactions } from "../sleeper/transactions.js";
import { getNflState, getAllPlayers } from "../sleeper/players.js";
import { clearSleeperCache } from "../sleeper/client.js";
import { getDraftPicks, getLeagueDrafts, getTradedPicks } from "../sleeper/drafts.js";
import { db } from "../db/connection.js";
import {
  createSyncJob,
  updateSyncJob,
  getLatestSyncJob,
} from "../db/queries/sync.js";
import { upsertUser } from "../db/queries/users.js";
import {
  upsertLeague,
  upsertUserLeague,
  upsertLeagueUser,
} from "../db/queries/leagues.js";
import { upsertRoster, replaceAllLeagueRosters } from "../db/queries/rosters.js";
import { upsertTrade, upsertTradeAsset } from "../db/queries/trades.js";
import { upsertH2H } from "../db/queries/h2h.js";
import { bulkUpsertPlayers } from "../db/queries/players.js";
import { league_draft_orders, league_traded_picks } from "../db/schema.js";
import { buildLeagueGroups } from "./league-groups.js";
import { seedInjuryBaselines } from "../db/seeds/injury-baselines.js";
import { capturePlayerValueSnapshots } from "./value-snapshots.js";
import { captureTeamValueSnapshots } from "./team-snapshots.js";
import { syncNflverseStats } from "./sync-nflverse-stats.js";
import { syncNflDraftHistory } from "./sync-nfl-draft.js";
import { syncLeagueDraftResults } from "./sync-league-drafts.js";
import { captureDraftBoardSnapshot } from "./sync-draft-board-snapshot.js";
import { syncProspectEnrichment, generateScoutingReports } from "./sync-prospect-enrichment.js";
import { clearDynastyLeagueCache, isDynastyLeagueFromSleeperSettings } from "./dynasty-leagues.js";
import { clearPowerRankingsCache } from "./power-rankings.js";
import { clearGlobalScaleCache } from "./composite-values.js";
import { clearOverviewCache } from "./overview.js";
import { clearDashboardCache } from "./dashboard.js";
import { clearPortfolioCache } from "./portfolio.js";
import { clearActionCache } from "./action.js";
import { clearArbitrageCache } from "./arbitrage.js";
import { backfillLeagueMatchups } from "./matchup-backfill.js";
import { gradeLeagueTrades } from "./trade-intelligence.js";
import type {
  SleeperLeague,
  SleeperRoster,
  SleeperMatchup,
  SleeperTransaction,
} from "../../shared/types.js";
import { SYNC_STALE_MINUTES } from "../../shared/constants.js";

// Prevent duplicate syncs for the same user
const syncLocks = new Map<string, boolean>();
const MIN_SYNC_INTERVAL = 30_000; // 30 second cooldown
const lastSyncStart = new Map<string, number>();
type SyncScope = "full" | "latest";

// Player data cache timestamp
let playersLastSynced = 0;
const PLAYER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if a sync is needed (stale > 10 min or never synced).
 * Returns the latest sync job if one exists.
 */
export async function checkSyncStatus(username: string) {
  const latest = await getLatestSyncJob(username);
  if (!latest) {
    return { needsSync: true, syncJob: null };
  }

  const ageMinutes = (Date.now() - latest.updated_at) / 60_000;
  const isRunning = latest.status === "running";
  if (isRunning) {
    if (ageMinutes <= SYNC_STALE_MINUTES) {
      return { needsSync: false, syncJob: latest };
    }
    await updateSyncJob(latest.job_id, {
      status: "failed",
      error: "Sync timed out and was marked stale",
    });
    return { needsSync: true, syncJob: null };
  }

  const isStale = ageMinutes > SYNC_STALE_MINUTES;

  return {
    needsSync: isStale || latest.status === "failed",
    syncJob: latest,
  };
}

function isRunningJobStale(job: { status: string; updated_at: number }): boolean {
  if (job.status !== "running") return false;
  const ageMinutes = (Date.now() - job.updated_at) / 60_000;
  return ageMinutes > SYNC_STALE_MINUTES;
}

/**
 * Start a background sync job for a username.
 * Returns immediately with the job_id; sync runs in the background.
 */
export async function startSync(
  username: string,
  options?: { force?: boolean; scope?: SyncScope; leagueId?: string }
): Promise<{ jobId: string; alreadyRunning: boolean }> {
  const key = username.toLowerCase();
  const force = options?.force === true;
  const scope: SyncScope = options?.scope === "latest" ? "latest" : "full";
  const leagueId = options?.leagueId?.trim() || undefined;
  const latest = await getLatestSyncJob(username);

  if (latest && isRunningJobStale(latest)) {
    await updateSyncJob(latest.job_id, {
      status: "failed",
      error: "Sync timed out and was marked stale",
    });
    syncLocks.delete(key);
  }

  // Check if already running
  if (syncLocks.get(key)) {
    const existing = await getLatestSyncJob(username);
    if (existing && existing.status === "running") {
      return { jobId: existing.job_id, alreadyRunning: true };
    }
    syncLocks.delete(key);
  }

  // Enforce cooldown
  const lastStart = lastSyncStart.get(key);
  if (!force && lastStart && Date.now() - lastStart < MIN_SYNC_INTERVAL) {
    const existing = await getLatestSyncJob(username);
    if (existing) {
      return { jobId: existing.job_id, alreadyRunning: false };
    }
  }

  const jobId = randomUUID();
  await createSyncJob(jobId, username);
  syncLocks.set(key, true);
  lastSyncStart.set(key, Date.now());

  // Run sync in background (don't await)
  runSync(jobId, username, scope, leagueId).catch((err) => {
    console.error(`[sync] Fatal error for ${username}:`, err);
    updateSyncJob(jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    }).catch(console.error);
  }).finally(() => {
    syncLocks.delete(key);
  });

  return { jobId, alreadyRunning: false };
}

/**
 * The main sync pipeline.
 */
async function runSync(
  jobId: string,
  username: string,
  scope: SyncScope,
  leagueId?: string
) {
  console.log(`[sync] Starting sync for ${username} (job ${jobId})`);

  // Step 1: Resolve user
  await updateSyncJob(jobId, { step: "resolving_user", detail: username });
  const sleeperUser = await getUser(username);
  if (!sleeperUser) {
    await updateSyncJob(jobId, {
      status: "failed",
      error: `User "${username}" not found on Sleeper`,
    });
    return;
  }

  await upsertUser({
    user_id: sleeperUser.user_id,
    username: sleeperUser.username,
    display_name: sleeperUser.display_name,
    avatar: sleeperUser.avatar,
  });

  // Step 2: Get current NFL state
  const nflState = await getNflState();
  const currentSeason = nflState
    ? parseInt(nflState.season, 10)
    : new Date().getFullYear();

  // Step 3: Fetch leagues across all seasons
  await updateSyncJob(jobId, {
    step: "fetching_leagues",
    detail:
      leagueId
        ? `League sync (${leagueId})`
        : scope === "latest"
        ? `Latest season sync (${currentSeason})`
        : `Seasons ${SEASONS[0]}-${currentSeason}`,
  });

  const allLeagues = leagueId
    ? await fetchSpecificLeague(leagueId)
    : await fetchLeaguesForScope(sleeperUser.user_id, currentSeason, scope);

  const uniqueLeagues = dedupeLeagues(allLeagues).filter((l) =>
    isDynastyLeagueFromSleeperSettings(l.settings)
  );
  console.log(
    `[sync] Found ${uniqueLeagues.length} unique leagues for ${username}`
  );

  await updateSyncJob(jobId, {
    step: "processing_leagues",
    leagues_total: uniqueLeagues.length,
    leagues_done: 0,
  });

  // Step 4: Process each league with concurrency limit
  let leaguesDone = 0;

  await runWithConcurrency(
    uniqueLeagues,
    SLEEPER_CONCURRENCY,
    async (league) => {
      try {
        await processLeague(league, sleeperUser.user_id);
      } catch (err) {
        console.error(
          `[sync] Error processing league ${league.league_id}:`,
          err
        );
      }

      leaguesDone++;
      if (leaguesDone % 5 === 0 || leaguesDone === uniqueLeagues.length) {
        await updateSyncJob(jobId, {
          leagues_done: leaguesDone,
          detail: `${leaguesDone}/${uniqueLeagues.length} leagues`,
        });
      }
    }
  );

  if (scope === "latest" || leagueId) {
    clearSleeperCache();
    clearDynastyLeagueCache(sleeperUser.user_id);
    clearGlobalScaleCache();
    clearPowerRankingsCache(username);
    clearOverviewCache(username);
    clearDashboardCache(username);
    clearPortfolioCache(username);
    clearActionCache(username);
    clearArbitrageCache(username);

    await updateSyncJob(jobId, {
      status: "completed",
      step: "done",
      leagues_done: uniqueLeagues.length,
      detail: leagueId
        ? `Synced league ${leagueId}`
        : `Synced ${uniqueLeagues.length} latest-season leagues`,
    });

    console.log(
      `[sync] Completed ${leagueId ? "single-league" : "latest-season"} sync for ${username}`
    );
    return;
  }

  // Step 5: Sync player data (daily cache)
  if (Date.now() - playersLastSynced > PLAYER_CACHE_TTL) {
    await updateSyncJob(jobId, {
      step: "syncing_players",
      detail: "Updating player database...",
    });

    try {
      const playersData = await getAllPlayers();
      const playersList = Object.entries(playersData)
        .filter(([, p]) => p && typeof p === "object")
        .map(([playerId, p]) => {
          const raw = p as unknown as Record<string, unknown>;
          return {
            player_id: playerId,
            full_name: p.full_name ?? p.first_name + " " + p.last_name,
            first_name: p.first_name,
            last_name: p.last_name,
            position: p.position,
            team: p.team,
            status: p.status ?? null,
            age: p.age ?? null,
            years_exp: null,
            injury_status: (typeof raw.injury_status === "string" ? raw.injury_status : null),
            injury_body_part: (typeof raw.injury_body_part === "string" ? raw.injury_body_part : null),
            injury_start_date: (typeof raw.injury_start_date === "string" ? raw.injury_start_date : null),
            injury_notes: (typeof raw.injury_notes === "string" ? raw.injury_notes : null),
          };
        });
      await bulkUpsertPlayers(playersList);
      playersLastSynced = Date.now();
      console.log(`[sync] Synced ${playersList.length} players`);

      // Seed injury recovery baselines (idempotent upsert)
      try {
        await seedInjuryBaselines();
      } catch (err) {
        console.error("[sync] Error seeding injury baselines:", err);
      }
      try {
        await syncNflverseStats();
      } catch (err) {
        console.error("[sync] Error syncing nflverse stats:", err);
      }
    } catch (err) {
      console.error("[sync] Error syncing players:", err);
      // Non-fatal, continue
    }
  }

  // Step 6: Capture player value snapshots (for injury buying windows)
  await updateSyncJob(jobId, {
    step: "value_snapshots",
    detail: "Capturing player value snapshots...",
  });

  try {
    await capturePlayerValueSnapshots(sleeperUser.user_id);
  } catch (err) {
    console.error("[sync] Error capturing value snapshots:", err);
  }

  // Step 7: Compute league groups
  await updateSyncJob(jobId, {
    step: "grouping",
    detail: "Computing league groups...",
  });

  try {
    await buildLeagueGroups(sleeperUser.user_id);
  } catch (err) {
    console.error("[sync] Error computing league groups:", err);
  }

  // Step 8: Capture team value snapshots (for league history)
  await updateSyncJob(jobId, {
    step: "team_snapshots",
    detail: "Capturing team value snapshots...",
  });

  try {
    await captureTeamValueSnapshots(sleeperUser.user_id);
  } catch (err) {
    console.error("[sync] Error capturing team value snapshots:", err);
  }

  // Step 9: Draft data pipelines
  try {
    await syncNflDraftHistory();
  } catch (err) {
    console.error("[sync] Error syncing NFL draft history:", err);
  }

  try {
    await syncLeagueDraftResults(username);
  } catch (err) {
    console.error("[sync] Error syncing league draft results:", err);
  }

  try {
    await captureDraftBoardSnapshot();
  } catch (err) {
    console.error("[sync] Error capturing draft board snapshot:", err);
  }

  // Step 10: Prospect data enrichment
  try {
    const enrichStats = await syncProspectEnrichment();
    console.log("[sync] Prospect enrichment:", enrichStats);
  } catch (err) {
    console.error("[sync] Error enriching prospects:", err);
  }

  // Step 11: AI scouting report generation (only when key is set)
  try {
    await generateScoutingReports();
  } catch (err) {
    console.error("[sync] Error generating scouting reports:", err);
  }

  clearSleeperCache();
  clearDynastyLeagueCache(sleeperUser.user_id);
  clearGlobalScaleCache();
  clearPowerRankingsCache(username);
  clearOverviewCache(username);
  clearDashboardCache(username);
  clearPortfolioCache(username);
  clearActionCache(username);
  clearArbitrageCache(username);

  // Step 12: Done
  await updateSyncJob(jobId, {
    status: "completed",
    step: "done",
    leagues_done: uniqueLeagues.length,
    detail: `Synced ${uniqueLeagues.length} leagues`,
  });

  console.log(`[sync] Completed sync for ${username}`);
}

/**
 * Process a single league: store metadata, rosters, users, matchups, trades.
 */
async function processLeague(league: SleeperLeague, userId: string) {
  const season = parseInt(league.season, 10);
  const leagueType =
    typeof league.settings?.type === "number"
      ? (league.settings.type as number)
      : null;

  // Store league
  await upsertLeague({
    league_id: league.league_id,
    name: league.name,
    season,
    sport: league.sport,
    status: league.status,
    total_rosters: league.total_rosters,
    previous_league_id: league.previous_league_id,
    league_type: leagueType,
    group_id: null, // Will be set by league grouping service
    raw_json: JSON.stringify(league),
    roster_positions: league.roster_positions ?? null,
    draft_rounds: Number(league.settings?.draft_rounds) || 4,
    scoring_settings: league.scoring_settings ?? null,
  });

  // Store user-league mapping
  await upsertUserLeague(userId, league.league_id);

  // Fetch and store league users
  const leagueMembers = await getLeagueUsers(league.league_id);
  for (const member of leagueMembers) {
    const meta = (member.metadata ?? {}) as Record<string, unknown>;
    const teamNameRaw = meta.team_name;
    const teamName =
      typeof teamNameRaw === "string" && teamNameRaw.trim().length > 0
        ? teamNameRaw.trim()
        : null;

    await upsertLeagueUser({
      league_id: league.league_id,
      user_id: member.user_id,
      display_name: member.display_name,
      team_name: teamName,
    });
  }

  // Fetch and store rosters - collect ALL data first, then batch write
  const rosterList = await getLeagueRosters(league.league_id);
  const allPlayers: { owner_id: string; player_id: string }[] = [];

  for (const roster of rosterList) {
    // Use roster_id as fallback owner for orphan rosters so their players
    // still exist in roster_players for league-level queries like waivers.
    const effectiveOwnerId = roster.owner_id || `orphan_${roster.roster_id}`;

    const fpts =
      (roster.settings.fpts ?? 0) +
      (roster.settings.fpts_decimal ?? 0) / 100;
    const fptsAgainst =
      (roster.settings.fpts_against ?? 0) +
      (roster.settings.fpts_against_decimal ?? 0) / 100;

    await upsertRoster({
      league_id: league.league_id,
      owner_id: effectiveOwnerId,
      roster_id: roster.roster_id,
      wins: roster.settings.wins ?? 0,
      losses: roster.settings.losses ?? 0,
      ties: roster.settings.ties ?? 0,
      fpts,
      fpts_against: fptsAgainst,
    });

    // Collect players for batch insert
    for (const pid of roster.players ?? []) {
      allPlayers.push({ owner_id: effectiveOwnerId, player_id: pid });
    }
  }

  // Single atomic replace: delete ALL league roster_players, then batch insert
  await replaceAllLeagueRosters(league.league_id, allPlayers);

  // Store traded picks for read-time use
  try {
    const tradedPicks = await getTradedPicks(league.league_id);
    await db
      .delete(league_traded_picks)
      .where(eq(league_traded_picks.league_id, league.league_id));
    if (tradedPicks.length > 0) {
      await db.insert(league_traded_picks).values(
        tradedPicks.map((tp) => ({
          league_id: league.league_id,
          season: tp.season,
          round: tp.round,
          roster_id: tp.roster_id,
          owner_id: tp.owner_id,
          previous_owner_id: tp.previous_owner_id,
        }))
      );
    }
  } catch (err) {
    console.error(`[sync] Error storing traded picks for ${league.league_id}:`, err);
  }

  // Resolve and store draft order for read-time use
  try {
    await syncDraftOrder(league.league_id, rosterList);
  } catch (err) {
    console.error(`[sync] Error resolving draft order for ${league.league_id}:`, err);
  }

  // Fetch and store matchups (for H2H calculation)
  await processMatchups(league.league_id, userId, rosterList);

  // Fetch and store trades
  await processTrades(league.league_id, season);

  try {
    const matchupCountRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM weekly_matchup_scores
      WHERE league_id = ${league.league_id}
    `);
    const matchupCount = Number(
      (matchupCountRows as unknown as Array<{ cnt: number | string }>)[0]?.cnt ?? 0
    );

    if (matchupCount === 0) {
      console.log(`[sync] No matchup data for ${league.league_id}, pulling from Sleeper...`);
      await backfillLeagueMatchups(league.league_id);
    }
  } catch (err) {
    console.error(`[sync] Matchup backfill failed for ${league.league_id}:`, err);
  }

  try {
    const result = await gradeLeagueTrades(league.league_id);
    console.log(
      `[sync] Graded ${result.graded} trades for league ${league.league_id} (${result.skipped} final, skipped)`
    );
  } catch (err) {
    console.error(`[sync] Trade grading failed for ${league.league_id}:`, err);
  }
}

/**
 * Fetch matchups and compute H2H records for the user in this league.
 */
async function processMatchups(
  leagueId: string,
  userId: string,
  rosterList: SleeperRoster[]
) {
  // Find user's roster_id
  const myRoster = rosterList.find((r) => r.owner_id === userId);
  if (!myRoster) return;

  const myRosterId = myRoster.roster_id;

  // Build roster_id -> owner_id map
  const rosterOwnerMap = new Map<number, string>();
  for (const r of rosterList) {
    if (r.owner_id) {
      rosterOwnerMap.set(r.roster_id, r.owner_id);
    }
  }

  // Track H2H records: opponent_owner_id -> {wins, losses, ties, pf, pa, games}
  const h2h = new Map<
    string,
    { wins: number; losses: number; ties: number; pf: number; pa: number; games: number }
  >();

  // Fetch weeks 1-18 (regular season + some playoff weeks)
  for (let week = 1; week <= 18; week++) {
    const matchups = await getLeagueMatchups(leagueId, week);
    if (!matchups || matchups.length === 0) break;

    // Find my matchup
    const myMatchup = matchups.find((m) => m.roster_id === myRosterId);
    if (!myMatchup || myMatchup.matchup_id === null) continue;

    // Find opponent
    const oppMatchup = matchups.find(
      (m) =>
        m.matchup_id === myMatchup.matchup_id &&
        m.roster_id !== myRosterId
    );
    if (!oppMatchup) continue;

    const oppOwnerId = rosterOwnerMap.get(oppMatchup.roster_id);
    if (!oppOwnerId) continue;

    const existing = h2h.get(oppOwnerId) ?? {
      wins: 0,
      losses: 0,
      ties: 0,
      pf: 0,
      pa: 0,
      games: 0,
    };

    existing.pf += myMatchup.points ?? 0;
    existing.pa += oppMatchup.points ?? 0;
    existing.games += 1;

    if ((myMatchup.points ?? 0) > (oppMatchup.points ?? 0)) {
      existing.wins += 1;
    } else if ((myMatchup.points ?? 0) < (oppMatchup.points ?? 0)) {
      existing.losses += 1;
    } else {
      existing.ties += 1;
    }

    h2h.set(oppOwnerId, existing);
  }

  // Store H2H records
  for (const [oppOwnerId, record] of h2h) {
    await upsertH2H({
      league_id: leagueId,
      my_owner_id: userId,
      opp_owner_id: oppOwnerId,
      ...record,
    });
  }
}

/**
 * Fetch transactions and store trades for a league.
 */
async function processTrades(leagueId: string, season: number) {
  for (const round of TRANSACTION_ROUNDS) {
    const transactions = await getLeagueTransactions(leagueId, round);
    if (!transactions || transactions.length === 0) continue;

    for (const tx of transactions) {
      if (tx.type !== "trade") continue;

      await upsertTrade({
        transaction_id: tx.transaction_id,
        league_id: leagueId,
        status: tx.status,
        created_at: tx.status_updated,
        roster_ids: JSON.stringify(tx.roster_ids),
        adds: tx.adds ? JSON.stringify(tx.adds) : null,
        drops: tx.drops ? JSON.stringify(tx.drops) : null,
        draft_picks: tx.draft_picks ? JSON.stringify(tx.draft_picks) : null,
        waiver_budget: tx.waiver_budget
          ? JSON.stringify(tx.waiver_budget)
          : null,
      });

      // Normalize trade assets
      await normalizeTradeAssets(tx, leagueId, season);
    }
  }
}

/**
 * Break a trade transaction into individual assets for analysis.
 */
async function normalizeTradeAssets(
  tx: SleeperTransaction,
  leagueId: string,
  season: number
) {
  const rosterIds = tx.roster_ids;
  if (!rosterIds || rosterIds.length < 2) return;

  // Process player adds (player was received by the roster)
  if (tx.adds) {
    for (const [playerId, rosterId] of Object.entries(tx.adds)) {
      const counterparties = rosterIds.filter((r) => r !== Number(rosterId));
      await upsertTradeAsset({
        trade_id: tx.transaction_id,
        league_id: leagueId,
        season,
        created_at_ms: tx.status_updated,
        roster_id: Number(rosterId),
        counterparty_roster_ids: JSON.stringify(counterparties),
        asset_type: "player",
        asset_key: playerId,
        asset_name: null,
        direction: "received",
      });
    }
  }

  // Process player drops (player was given away)
  if (tx.drops) {
    for (const [playerId, rosterId] of Object.entries(tx.drops)) {
      const counterparties = rosterIds.filter((r) => r !== Number(rosterId));
      await upsertTradeAsset({
        trade_id: tx.transaction_id,
        league_id: leagueId,
        season,
        created_at_ms: tx.status_updated,
        roster_id: Number(rosterId),
        counterparty_roster_ids: JSON.stringify(counterparties),
        asset_type: "player",
        asset_key: playerId,
        asset_name: null,
        direction: "gave",
      });
    }
  }

  // Process draft picks
  if (tx.draft_picks) {
    for (const pick of tx.draft_picks) {
      const pickKey = `${pick.season}_${pick.round}_${pick.roster_id}`;

      // The current owner received this pick
      await upsertTradeAsset({
        trade_id: tx.transaction_id,
        league_id: leagueId,
        season,
        created_at_ms: tx.status_updated,
        roster_id: pick.owner_id,
        counterparty_roster_ids: JSON.stringify([pick.previous_owner_id]),
        asset_type: "pick",
        asset_key: pickKey,
        asset_name: `${pick.season} Round ${pick.round}`,
        direction: "received",
      });

      // The previous owner gave this pick
      await upsertTradeAsset({
        trade_id: tx.transaction_id,
        league_id: leagueId,
        season,
        created_at_ms: tx.status_updated,
        roster_id: pick.previous_owner_id,
        counterparty_roster_ids: JSON.stringify([pick.owner_id]),
        asset_type: "pick",
        asset_key: pickKey,
        asset_name: `${pick.season} Round ${pick.round}`,
        direction: "gave",
      });
    }
  }
}

// ─── Helpers ───

async function syncDraftOrder(leagueId: string, rosterList: SleeperRoster[]) {
  const drafts = await getLeagueDrafts(leagueId);
  const currentYear = String(new Date().getFullYear());

  const currentYearDrafts = drafts
    .filter((d) => d.season === currentYear && Number(d.settings?.rounds ?? 99) <= 8)
    .sort((a, b) => Number(a.settings?.rounds ?? 99) - Number(b.settings?.rounds ?? 99));

  const rookieDraft = currentYearDrafts.find((d) => !!d.slot_to_roster_id || !!d.draft_order)
    ?? currentYearDrafts[0];

  if (!rookieDraft) return;

  let order: Map<number, number> | null = null;

  if (rookieDraft.slot_to_roster_id) {
    const byRoster = new Map<number, number>();
    for (const [slotRaw, rosterRaw] of Object.entries(rookieDraft.slot_to_roster_id)) {
      const slot = Number(slotRaw);
      const rosterId = Number(rosterRaw);
      if (Number.isFinite(slot) && Number.isFinite(rosterId)) {
        byRoster.set(rosterId, slot);
      }
    }
    if (byRoster.size > 0) order = byRoster;
  }

  if (!order && rookieDraft.draft_order) {
    const ownerToRoster = new Map<string, number>();
    for (const r of rosterList) {
      if (r.owner_id) ownerToRoster.set(r.owner_id, r.roster_id);
    }
    const mapped = new Map<number, number>();
    for (const [userId, posRaw] of Object.entries(rookieDraft.draft_order)) {
      const rosterId = ownerToRoster.get(userId);
      const pos = Number(posRaw);
      if (rosterId != null && Number.isFinite(pos)) {
        mapped.set(rosterId, pos);
      }
    }
    if (mapped.size > 0) order = mapped;
  }

  if (!order) {
    const picks = await getDraftPicks(rookieDraft.draft_id);
    if (picks && picks.length > 0) {
      const firstRound = picks
        .filter((p) => Number(p.round) === 1)
        .sort((a, b) => Number(a.pick_no) - Number(b.pick_no));
      if (firstRound.length > 0) {
        const byRoster = new Map<number, number>();
        for (const p of firstRound) {
          const rosterId = Number(p.roster_id);
          const slot = Number(p.draft_slot);
          if (Number.isFinite(rosterId) && Number.isFinite(slot) && !byRoster.has(rosterId)) {
            byRoster.set(rosterId, slot);
          }
        }
        if (byRoster.size > 0) order = byRoster;
      }
    }
  }

  if (!order || order.size === 0) return;

  await db.delete(league_draft_orders).where(
    and(
      eq(league_draft_orders.league_id, leagueId),
      eq(league_draft_orders.season, currentYear)
    )
  );

  await db.insert(league_draft_orders).values(
    [...order.entries()].map(([rosterId, position]) => ({
      league_id: leagueId,
      season: currentYear,
      roster_id: rosterId,
      draft_position: position,
    }))
  );
}

function dedupeLeagues(leagues: SleeperLeague[]): SleeperLeague[] {
  const seen = new Set<string>();
  return leagues.filter((l) => {
    if (seen.has(l.league_id)) return false;
    seen.add(l.league_id);
    return true;
  });
}

async function fetchLeaguesForScope(
  userId: string,
  currentSeason: number,
  scope: SyncScope
): Promise<SleeperLeague[]> {
  if (scope === "full") {
    const allLeagues: SleeperLeague[] = [];
    const seasonsToFetch = SEASONS.filter((s) => s <= currentSeason);
    for (const season of seasonsToFetch) {
      const seasonLeagues = await getUserLeagues(userId, season);
      allLeagues.push(...seasonLeagues);
    }
    return allLeagues;
  }

  const candidateSeasons = [currentSeason, currentSeason - 1, currentSeason - 2]
    .filter((season, idx, arr) => season >= SEASONS[0] && arr.indexOf(season) === idx);

  for (const season of candidateSeasons) {
    const seasonLeagues = await getUserLeagues(userId, season);
    const dynastyLeagues = seasonLeagues.filter((l) =>
      isDynastyLeagueFromSleeperSettings(l.settings)
    );
    if (dynastyLeagues.length > 0) {
      return dynastyLeagues;
    }
  }

  return [];
}

async function fetchSpecificLeague(leagueId: string): Promise<SleeperLeague[]> {
  const league = await getLeague(leagueId);
  if (!league) return [];
  return [league];
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
) {
  const queue = [...items];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    while (running.length < limit && queue.length > 0) {
      const item = queue.shift()!;
      const promise = fn(item).then(() => {
        running.splice(running.indexOf(promise), 1);
      });
      running.push(promise);
    }

    if (running.length > 0) {
      await Promise.race(running);
    }
  }
}
