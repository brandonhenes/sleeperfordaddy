import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  getScoringMultiplier,
  normalizeScoringSettings,
} from "./scoring-adjuster.js";

type ValueSource = "fantasycalc" | "dynastyprocess";
type ValueVerdict = "won" | "lost" | "push" | null;

const PLAYER_STAT_COLUMNS = [
  "pass_att",
  "pass_cmp",
  "pass_yd",
  "pass_td",
  "pass_int",
  "pass_2pt",
  "pass_fd",
  "pass_sack",
  "pass_cmp_40p",
  "pass_td_40p",
  "pass_td_50p",
  "pass_inc",
  "rush_att",
  "rush_yd",
  "rush_td",
  "rush_2pt",
  "rush_fd",
  "rush_40p",
  "rush_td_40p",
  "rush_td_50p",
  "rec",
  "rec_yd",
  "rec_td",
  "rec_2pt",
  "rec_fd",
  "rec_0_4",
  "rec_5_9",
  "rec_10_19",
  "rec_20_29",
  "rec_30_39",
  "rec_40p",
  "rec_td_40p",
  "rec_td_50p",
  "fum",
  "fum_lost",
  "bonus_rush_yd_100",
  "bonus_rush_yd_200",
  "bonus_rec_yd_100",
  "bonus_rec_yd_200",
  "bonus_pass_yd_300",
  "bonus_pass_yd_400",
  "bonus_pass_cmp_25",
  "bonus_rush_att_20",
  "bonus_rush_rec_yd_100",
  "bonus_rush_rec_yd_200",
  "bonus_fd_rb",
  "bonus_fd_wr",
  "bonus_fd_te",
  "bonus_fd_qb",
] as const;

type PlayerStatColumn = (typeof PLAYER_STAT_COLUMNS)[number];
type PlayerStatRecord = Record<PlayerStatColumn, number>;

interface PlayerMeta {
  player_id: string;
  full_name: string | null;
  position: string | null;
  team: string | null;
}

interface PlayerStatsRow {
  player_id: string;
  season: number;
  position: string | null;
  team: string | null;
  [key: string]: unknown;
}

interface LeagueRow {
  league_id: string;
  season: number;
  previous_league_id: string | null;
  roster_positions: string[] | null;
  scoring_settings: Record<string, unknown> | null;
}

interface RosterRow {
  league_id: string;
  roster_id: number;
  owner_id: string;
}

interface TradeAssetRow {
  trade_id: string;
  league_id: string;
  roster_id: number;
  direction: "gave" | "received";
  asset_type: "player" | "pick" | "waiver_budget";
  asset_key: string;
  asset_name: string | null;
  created_at_ms: number | string;
  counterparty_roster_ids: string | null;
  season: number;
}

interface MatchupRow {
  league_id: string;
  season: number;
  week: number;
  roster_id: number;
  player_id: string;
  points: number;
  is_starter: boolean | null;
  opponent_roster_id: number | null;
  opponent_total: number | null;
  league_median: number | null;
  roster_total: number | null;
}

interface TeamWeekSummary {
  league_id: string;
  season: number;
  week: number;
  roster_id: number;
  roster_total: number;
  opponent_total: number;
  league_median: number;
  rows: MatchupRow[];
}

interface ValuePoint {
  snapshot_date: string;
  value: number;
}

interface ValueIndex {
  bySleeperId: Map<string, ValuePoint[]>;
  byName: Map<string, ValuePoint[]>;
  latestBySleeperId: Map<string, number>;
  latestByName: Map<string, number>;
}

interface TradeSeasonRowInput {
  seasonNumber: number;
  seasonYear: number;
  winsWith: number;
  winsWithout: number;
  winImpact: number;
  medianWith: number;
  medianWithout: number;
  pointsReceived: number;
  pointsGave: number;
  keyAssetsReceived: string[];
  keyAssetsGave: string[];
}

interface SeasonOutcomeSummary {
  seasons: TradeSeasonRowInput[];
  winsWithTrade: number;
  winsWithoutTrade: number;
  winImpact: number;
  medianWeeksWith: number;
  medianWeeksWithout: number;
  medianImpact: number;
  pointsReceivedAssets: number;
  pointsGaveAssets: number;
  starterRatePct: number;
}

interface ValueDeltaResult {
  valueGaveAtTrade: number;
  valueReceivedAtTrade: number;
  valueGaveCurrent: number;
  valueReceivedCurrent: number;
  valueDeltaPct: number;
  valueVerdict: ValueVerdict;
  valueSource: ValueSource;
  scoringAdjusted: boolean;
}

interface TradeSeasonContext {
  timeline: LeagueRow[];
  ownerIdByLeagueRoster: Map<string, string>;
  rosterIdByLeagueOwner: Map<string, number>;
  teamWeeks: Map<string, TeamWeekSummary>;
  playerWeekPoints: Map<string, number>;
}

interface OwnerProfileAssetRow {
  roster_id: number;
  position: string | null;
  age: number | null;
}

interface OwnerProfileOutcomeRow {
  trade_id: string;
  league_id: string;
  roster_id: number;
  counterparty_roster_id: number;
  value_delta_pct: number | null;
  value_verdict: string | null;
  win_impact: number | null;
  trade_date: string | Date | null;
}

interface OwnerRosterInfoRow {
  roster_id: number;
  owner_id: string | null;
  display_name: string | null;
  team_name: string | null;
}

const DP_TO_FC_SCALE = 2.2;

const fantasycalcIndex: ValueIndex = createValueIndex();
const dynastyprocessIndex: ValueIndex = createValueIndex();
const playerStatsMap = new Map<string, Map<number, PlayerStatRecord>>();
const playerMetaMap = new Map<string, PlayerMeta>();
const pickToPlayerMap = new Map<string, { sleeperId: string; playerName: string; position: string | null }>();

let valuesLoaded = false;
let loadPromise: Promise<void> | null = null;

function createValueIndex(): ValueIndex {
  return {
    bySleeperId: new Map(),
    byName: new Map(),
    latestBySleeperId: new Map(),
    latestByName: new Map(),
  };
}

function clearValueIndex(index: ValueIndex): void {
  index.bySleeperId.clear();
  index.byName.clear();
  index.latestBySleeperId.clear();
  index.latestByName.clear();
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getNameKeys(name: string | null | undefined): string[] {
  if (!name) return [];
  const normalized = normalizeName(name);
  const stripped = normalized.replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, "");
  return [...new Set([normalized, stripped].filter(Boolean))];
}

function addPoint(index: Map<string, ValuePoint[]>, key: string | null | undefined, point: ValuePoint): void {
  if (!key) return;
  const bucket = index.get(key) ?? [];
  bucket.push(point);
  index.set(key, bucket);
}

function setLatest(index: Map<string, number>, key: string | null | undefined, point: ValuePoint): void {
  if (!key) return;
  const current = index.get(key);
  if (current == null || point.value !== current) {
    index.set(key, point.value);
  }
}

function registerValue(
  index: ValueIndex,
  sleeperId: string | null,
  playerName: string,
  point: ValuePoint
): void {
  if (sleeperId) {
    addPoint(index.bySleeperId, sleeperId, point);
    setLatest(index.latestBySleeperId, sleeperId, point);
  }
  for (const key of getNameKeys(playerName)) {
    addPoint(index.byName, key, point);
    setLatest(index.latestByName, key, point);
  }
}

function finalizeValueIndex(index: ValueIndex): void {
  for (const bucket of index.bySleeperId.values()) {
    bucket.sort((left, right) => left.snapshot_date.localeCompare(right.snapshot_date));
  }
  for (const bucket of index.byName.values()) {
    bucket.sort((left, right) => left.snapshot_date.localeCompare(right.snapshot_date));
  }
}

function getValueAtDateFromPoints(points: ValuePoint[] | undefined, dateStr: string): number | null {
  if (!points || points.length === 0) return null;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].snapshot_date <= dateStr) {
      return points[i].value;
    }
  }
  return null;
}

function getValueAtDate(
  source: ValueSource,
  sleeperId: string | null,
  playerName: string | null,
  dateStr: string
): number | null {
  const index = source === "fantasycalc" ? fantasycalcIndex : dynastyprocessIndex;
  if (sleeperId) {
    const byId = getValueAtDateFromPoints(index.bySleeperId.get(sleeperId), dateStr);
    if (byId != null) return byId;
  }
  for (const key of getNameKeys(playerName)) {
    const byName = getValueAtDateFromPoints(index.byName.get(key), dateStr);
    if (byName != null) return byName;
  }
  return null;
}

function getLatestValue(
  source: ValueSource,
  sleeperId: string | null,
  playerName: string | null
): number | null {
  const index = source === "fantasycalc" ? fantasycalcIndex : dynastyprocessIndex;
  if (sleeperId) {
    const byId = index.latestBySleeperId.get(sleeperId);
    if (byId != null) return byId;
  }
  for (const key of getNameKeys(playerName)) {
    const byName = index.latestByName.get(key);
    if (byName != null) return byName;
  }
  return null;
}

function getFcCurrentValue(
  sleeperId: string | null,
  playerName: string | null
): number | null {
  return getLatestValue("fantasycalc", sleeperId, playerName);
}

function parseCounterpartyRosterIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as number[];
    return Array.isArray(parsed)
      ? parsed.filter((value) => Number.isFinite(value)).map((value) => Number(value))
      : [];
  } catch {
    return [];
  }
}

function getTradeDate(assets: TradeAssetRow[]): Date {
  const timestamp = Number(assets[0]?.created_at_ms ?? Date.now());
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
}

function getDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getPickName(assetKey: string): string | null {
  const [yearRaw, roundRaw] = assetKey.split("_");
  const year = yearRaw?.trim();
  const round = Number(roundRaw);
  if (!year || !Number.isFinite(round)) return null;
  const ordinal =
    round === 1 ? "1st" : round === 2 ? "2nd" : round === 3 ? "3rd" : `${round}th`;
  return `${year} ${ordinal}`;
}

function getRelevantStatsSeason(playerId: string, tradeDate: Date): number | null {
  const seasons = playerStatsMap.get(playerId);
  if (!seasons || seasons.size === 0) return null;

  const target = tradeDate.getUTCFullYear() - 1;
  const ordered = [...seasons.keys()].sort((left, right) => right - left);
  const prior = ordered.find((season) => season <= target);
  return prior ?? ordered[0] ?? null;
}

function getPlayerStats(playerId: string, season: number | null): Record<string, number> | null {
  if (season == null) return null;
  return playerStatsMap.get(playerId)?.get(season) ?? null;
}

function estimateStartWeek(tradeDate: Date, seasonYear: number): number {
  const tradeYear = tradeDate.getUTCFullYear();
  if (tradeYear < seasonYear) return 1;
  if (tradeYear > seasonYear) return Number.MAX_SAFE_INTEGER;

  const seasonStart = Date.UTC(seasonYear, 8, 1);
  if (tradeDate.getTime() < seasonStart) return 1;

  const week = Math.floor((tradeDate.getTime() - seasonStart) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return clamp(week, 1, 18);
}

function buildTeamWeekMap(rows: MatchupRow[]): Map<string, TeamWeekSummary> {
  const map = new Map<string, TeamWeekSummary>();
  for (const row of rows) {
    const key = `${row.league_id}:${row.season}:${row.week}:${row.roster_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(key, {
      league_id: row.league_id,
      season: row.season,
      week: row.week,
      roster_id: row.roster_id,
      roster_total: row.roster_total ?? 0,
      opponent_total: row.opponent_total ?? 0,
      league_median: row.league_median ?? 0,
      rows: [row],
    });
  }
  return map;
}

function buildPlayerWeekPointsMap(rows: MatchupRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.league_id}:${row.season}:${row.week}:${row.player_id}`;
    map.set(key, row.points);
  }
  return map;
}

async function loadLeagueRows(): Promise<LeagueRow[]> {
  const rows = await db.execute(sql`
    SELECT league_id, season, previous_league_id, roster_positions, scoring_settings
    FROM leagues
  `);
  return rows as unknown as LeagueRow[];
}

function getLeagueTimeline(leagueId: string, leagueRows: LeagueRow[]): LeagueRow[] {
  const byId = new Map(leagueRows.map((row) => [row.league_id, row]));
  const children = new Map<string, LeagueRow[]>();
  for (const row of leagueRows) {
    if (!row.previous_league_id) continue;
    const bucket = children.get(row.previous_league_id) ?? [];
    bucket.push(row);
    children.set(row.previous_league_id, bucket);
  }

  let root = byId.get(leagueId) ?? null;
  while (root?.previous_league_id && byId.has(root.previous_league_id)) {
    root = byId.get(root.previous_league_id) ?? root;
  }
  if (!root) return [];

  const timeline: LeagueRow[] = [];
  const seen = new Set<string>();
  let current: LeagueRow | null = root;
  while (current && !seen.has(current.league_id)) {
    timeline.push(current);
    seen.add(current.league_id);
    const next: LeagueRow | undefined = (children.get(current.league_id) ?? [])
      .filter((row) => !seen.has(row.league_id))
      .sort((left, right) => left.season - right.season)[0];
    current = next ?? null;
  }

  return timeline.sort((left, right) => left.season - right.season);
}

async function loadTradeSeasonContext(
  leagueId: string,
  leagueRows: LeagueRow[]
): Promise<TradeSeasonContext> {
  const timeline = getLeagueTimeline(leagueId, leagueRows);
  const leagueIds = [...new Set(timeline.map((row) => row.league_id))];
  if (leagueIds.length === 0) {
    return {
      timeline: [],
      ownerIdByLeagueRoster: new Map(),
      rosterIdByLeagueOwner: new Map(),
      teamWeeks: new Map(),
      playerWeekPoints: new Map(),
    };
  }

  const leagueIdSql = sql.join(leagueIds.map((id) => sql`${id}`), sql`, `);
  const [rosterRowsRaw, matchupRowsRaw] = await Promise.all([
    db.execute(sql`
      SELECT league_id, roster_id, owner_id
      FROM rosters
      WHERE league_id IN (${leagueIdSql})
    `),
    db.execute(sql`
      SELECT
        league_id,
        season,
        week,
        roster_id,
        player_id,
        points::real AS points,
        is_starter,
        opponent_roster_id,
        opponent_total::real AS opponent_total,
        league_median::real AS league_median,
        roster_total::real AS roster_total
      FROM weekly_matchup_scores
      WHERE league_id IN (${leagueIdSql})
    `),
  ]);

  const ownerIdByLeagueRoster = new Map<string, string>();
  const rosterIdByLeagueOwner = new Map<string, number>();
  for (const row of rosterRowsRaw as unknown as RosterRow[]) {
    ownerIdByLeagueRoster.set(`${row.league_id}:${row.roster_id}`, row.owner_id);
    rosterIdByLeagueOwner.set(`${row.league_id}:${row.owner_id}`, row.roster_id);
  }

  const matchupRows = matchupRowsRaw as unknown as MatchupRow[];
  return {
    timeline,
    ownerIdByLeagueRoster,
    rosterIdByLeagueOwner,
    teamWeeks: buildTeamWeekMap(matchupRows),
    playerWeekPoints: buildPlayerWeekPointsMap(matchupRows),
  };
}

function getLeagueRow(leagueId: string, leagueRows: LeagueRow[]): LeagueRow | null {
  return leagueRows.find((row) => row.league_id === leagueId) ?? null;
}

function determineValueSource(
  assets: TradeAssetRow[],
  tradeDate: Date
): ValueSource {
  const dateStr = getDateString(tradeDate);
  const coverage = {
    fantasycalc: 0,
    dynastyprocess: 0,
  } as Record<ValueSource, number>;

  for (const source of ["fantasycalc", "dynastyprocess"] as ValueSource[]) {
    for (const asset of assets) {
      if (asset.asset_type === "waiver_budget") continue;

      const name =
        asset.asset_type === "pick"
          ? getPickName(asset.asset_key)
          : playerMetaMap.get(asset.asset_key)?.full_name ?? asset.asset_name ?? asset.asset_key;

      const sleeperId = asset.asset_type === "player" ? asset.asset_key : null;
      if (getValueAtDate(source, sleeperId, name, dateStr) != null) coverage[source] += 1;
      if (getLatestValue(source, sleeperId, name) != null) coverage[source] += 1;
    }
  }

  return coverage.dynastyprocess > coverage.fantasycalc
    ? "dynastyprocess"
    : "fantasycalc";
}

function computeValueDelta(
  assets: TradeAssetRow[],
  tradeDate: Date,
  league: LeagueRow | null
): ValueDeltaResult {
  const dateStr = getDateString(tradeDate);
  const atTradeSource = determineValueSource(assets, tradeDate);
  const scoringSettings = normalizeScoringSettings(league?.scoring_settings ?? null);
  const leagueId = assets[0]?.league_id ?? "";

  let valueGaveAtTrade = 0;
  let valueReceivedAtTrade = 0;
  let valueGaveCurrent = 0;
  let valueReceivedCurrent = 0;
  let scoringAdjusted = false;

  for (const asset of assets) {
    if (asset.asset_type === "waiver_budget") continue;

    let rawAtTrade = 0;
    let rawCurrent = 0;
    let multiplier = 1;

    if (asset.asset_type === "pick") {
      const pickName = getPickName(asset.asset_key);
      rawAtTrade = getValueAtDate(atTradeSource, null, pickName, dateStr) ?? 0;
      // Normalize DP at-trade values to FC scale
      if (atTradeSource === "dynastyprocess") rawAtTrade *= DP_TO_FC_SCALE;

      // Current value: resolve drafted pick to player FC value, else generic FC pick
      const draftKey = `${leagueId}:${asset.asset_key}`;
      const drafted = pickToPlayerMap.get(draftKey);
      if (drafted) {
        let playerMultiplier = 1;
        if (league && Object.keys(scoringSettings).length > 0) {
          const season = getRelevantStatsSeason(drafted.sleeperId, tradeDate);
          const stats = getPlayerStats(drafted.sleeperId, season);
          if (stats && drafted.position) {
            playerMultiplier = getScoringMultiplier(stats, scoringSettings, drafted.position);
            scoringAdjusted = true;
          }
        }
        rawCurrent = (getFcCurrentValue(drafted.sleeperId, drafted.playerName) ?? 0) * playerMultiplier;
      } else {
        rawCurrent = getFcCurrentValue(null, pickName) ?? 0;
      }
    } else {
      const meta = playerMetaMap.get(asset.asset_key);
      const assetName = meta?.full_name ?? asset.asset_name ?? asset.asset_key;
      rawAtTrade = getValueAtDate(atTradeSource, asset.asset_key, assetName, dateStr) ?? 0;
      // Normalize DP at-trade values to FC scale
      if (atTradeSource === "dynastyprocess") rawAtTrade *= DP_TO_FC_SCALE;

      // Current value: ALWAYS FC
      rawCurrent = getFcCurrentValue(asset.asset_key, assetName) ?? 0;

      if (league && Object.keys(scoringSettings).length > 0) {
        const season = getRelevantStatsSeason(asset.asset_key, tradeDate);
        const stats = getPlayerStats(asset.asset_key, season);
        const position = meta?.position ?? null;
        if (stats && position) {
          multiplier = getScoringMultiplier(stats, scoringSettings, position);
          scoringAdjusted = true;
        }
      }
    }

    const adjustedAtTrade = rawAtTrade * multiplier;
    const adjustedCurrent = rawCurrent * multiplier;

    if (asset.direction === "gave") {
      valueGaveAtTrade += adjustedAtTrade;
      valueGaveCurrent += adjustedCurrent;
    } else {
      valueReceivedAtTrade += adjustedAtTrade;
      valueReceivedCurrent += adjustedCurrent;
    }
  }

  // Verdict: ratio of FC current values (same scale, apples to apples)
  let valueDeltaPct = 0;
  let valueVerdict: ValueVerdict = null;

  if (valueReceivedCurrent > 0 || valueGaveCurrent > 0) {
    const denominator = Math.max(valueReceivedCurrent, valueGaveCurrent, 1);
    valueDeltaPct = clamp(
      ((valueReceivedCurrent - valueGaveCurrent) / denominator) * 100,
      -200,
      200
    );
    const ratio = valueReceivedCurrent / Math.max(valueGaveCurrent, 1);
    if (ratio > 1.15) valueVerdict = "won";
    else if (ratio < 0.87) valueVerdict = "lost";
    else valueVerdict = "push";
  }

  return {
    valueGaveAtTrade: round1(valueGaveAtTrade),
    valueReceivedAtTrade: round1(valueReceivedAtTrade),
    valueGaveCurrent: round1(valueGaveCurrent),
    valueReceivedCurrent: round1(valueReceivedCurrent),
    valueDeltaPct: round1(valueDeltaPct),
    valueVerdict,
    valueSource: atTradeSource,
    scoringAdjusted,
  };
}

function computeSeasonOutcomes(
  rosterId: number,
  assets: TradeAssetRow[],
  tradeDate: Date,
  seasonContext: TradeSeasonContext
): SeasonOutcomeSummary {
  const receivedPlayers = assets
    .filter((asset) => asset.asset_type === "player" && asset.direction === "received")
    .map((asset) => asset.asset_key);
  const gavePlayers = assets
    .filter((asset) => asset.asset_type === "player" && asset.direction === "gave")
    .map((asset) => asset.asset_key);

  const baseLeagueId = assets[0]?.league_id ?? "";
  const ownerId = seasonContext.ownerIdByLeagueRoster.get(`${baseLeagueId}:${rosterId}`) ?? null;
  if (!ownerId || seasonContext.timeline.length === 0) {
    return {
      seasons: [],
      winsWithTrade: 0,
      winsWithoutTrade: 0,
      winImpact: 0,
      medianWeeksWith: 0,
      medianWeeksWithout: 0,
      medianImpact: 0,
      pointsReceivedAssets: 0,
      pointsGaveAssets: 0,
      starterRatePct: 0,
    };
  }

  let seasonNumber = 0;
  const seasons: TradeSeasonRowInput[] = [];
  let winsWithTrade = 0;
  let winsWithoutTrade = 0;
  let medianWeeksWith = 0;
  let medianWeeksWithout = 0;
  let pointsReceivedAssets = 0;
  let pointsGaveAssets = 0;
  let receivedRows = 0;
  let receivedStartedRows = 0;

  for (const league of seasonContext.timeline) {
    const seasonRosterId = seasonContext.rosterIdByLeagueOwner.get(
      `${league.league_id}:${ownerId}`
    );
    if (seasonRosterId == null) continue;

    const startWeek = league.league_id === baseLeagueId
      ? estimateStartWeek(tradeDate, league.season)
      : 1;

    let seasonWinsWith = 0;
    let seasonWinsWithout = 0;
    let seasonMedianWith = 0;
    let seasonMedianWithout = 0;
    let seasonPointsReceived = 0;
    let seasonPointsGave = 0;
    const receivedByAsset = new Map<string, number>();
    const gaveByAsset = new Map<string, number>();

    for (let week = startWeek; week <= 18; week += 1) {
      const summary = seasonContext.teamWeeks.get(
        `${league.league_id}:${league.season}:${week}:${seasonRosterId}`
      );
      if (!summary) continue;

      const receivedStartPoints = summary.rows
        .filter((row) => receivedPlayers.includes(row.player_id) && row.is_starter === true)
        .reduce((sum, row) => sum + row.points, 0);

      for (const row of summary.rows) {
        if (!receivedPlayers.includes(row.player_id)) continue;
        receivedRows += 1;
        if (row.is_starter) receivedStartedRows += 1;
        seasonPointsReceived += row.points;
        receivedByAsset.set(
          row.player_id,
          (receivedByAsset.get(row.player_id) ?? 0) + row.points
        );
      }

      let gaveWeekPoints = 0;
      for (const playerId of gavePlayers) {
        const points =
          seasonContext.playerWeekPoints.get(
            `${league.league_id}:${league.season}:${week}:${playerId}`
          ) ?? 0;
        gaveWeekPoints += points;
        if (points > 0) {
          seasonPointsGave += points;
          gaveByAsset.set(playerId, (gaveByAsset.get(playerId) ?? 0) + points);
        }
      }

      if (summary.roster_total > summary.opponent_total) seasonWinsWith += 1;
      if (summary.roster_total > summary.league_median) seasonMedianWith += 1;

      const hypotheticalWithout = summary.roster_total - receivedStartPoints + gaveWeekPoints;
      if (hypotheticalWithout > summary.opponent_total) seasonWinsWithout += 1;
      if (hypotheticalWithout > summary.league_median) seasonMedianWithout += 1;
    }

    if (
      seasonWinsWith === 0 &&
      seasonWinsWithout === 0 &&
      seasonMedianWith === 0 &&
      seasonMedianWithout === 0 &&
      seasonPointsReceived === 0 &&
      seasonPointsGave === 0
    ) {
      continue;
    }

    seasonNumber += 1;
    winsWithTrade += seasonWinsWith;
    winsWithoutTrade += seasonWinsWithout;
    medianWeeksWith += seasonMedianWith;
    medianWeeksWithout += seasonMedianWithout;
    pointsReceivedAssets += seasonPointsReceived;
    pointsGaveAssets += seasonPointsGave;

    const topReceived = [...receivedByAsset.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([playerId]) => playerMetaMap.get(playerId)?.full_name ?? playerId);
    const topGave = [...gaveByAsset.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([playerId]) => playerMetaMap.get(playerId)?.full_name ?? playerId);

    seasons.push({
      seasonNumber,
      seasonYear: league.season,
      winsWith: seasonWinsWith,
      winsWithout: seasonWinsWithout,
      winImpact: seasonWinsWith - seasonWinsWithout,
      medianWith: seasonMedianWith,
      medianWithout: seasonMedianWithout,
      pointsReceived: round1(seasonPointsReceived),
      pointsGave: round1(seasonPointsGave),
      keyAssetsReceived: topReceived,
      keyAssetsGave: topGave,
    });
  }

  const starterRatePct =
    receivedRows > 0 ? round1((receivedStartedRows / receivedRows) * 100) : 0;

  return {
    seasons,
    winsWithTrade,
    winsWithoutTrade,
    winImpact: winsWithTrade - winsWithoutTrade,
    medianWeeksWith,
    medianWeeksWithout,
    medianImpact: medianWeeksWith - medianWeeksWithout,
    pointsReceivedAssets: round1(pointsReceivedAssets),
    pointsGaveAssets: round1(pointsGaveAssets),
    starterRatePct,
  };
}

async function upsertTradeOutcome(
  tradeId: string,
  leagueId: string,
  rosterId: number,
  counterpartyRosterId: number,
  tradeDate: Date,
  valueDelta: ValueDeltaResult,
  seasonSummary: SeasonOutcomeSummary
): Promise<number | null> {
  const tradeDateIso = tradeDate.toISOString();
  const gradedThroughDate = getDateString(new Date());

  const rows = await db.execute(sql`
    INSERT INTO trade_outcomes (
      trade_id,
      league_id,
      roster_id,
      counterparty_roster_id,
      value_gave_at_trade,
      value_received_at_trade,
      value_gave_current,
      value_received_current,
      value_delta_pct,
      value_verdict,
      wins_with_trade,
      wins_without_trade,
      win_impact,
      median_weeks_with,
      median_weeks_without,
      median_impact,
      points_received_assets,
      points_gave_assets,
      starter_rate_pct,
      trade_date,
      seasons_graded,
      is_final,
      graded_through_date,
      value_source,
      scoring_adjusted,
      updated_at
    )
    VALUES (
      ${tradeId},
      ${leagueId},
      ${rosterId},
      ${counterpartyRosterId},
      ${valueDelta.valueGaveAtTrade},
      ${valueDelta.valueReceivedAtTrade},
      ${valueDelta.valueGaveCurrent},
      ${valueDelta.valueReceivedCurrent},
      ${valueDelta.valueDeltaPct},
      ${valueDelta.valueVerdict},
      ${seasonSummary.winsWithTrade},
      ${seasonSummary.winsWithoutTrade},
      ${seasonSummary.winImpact},
      ${seasonSummary.medianWeeksWith},
      ${seasonSummary.medianWeeksWithout},
      ${seasonSummary.medianImpact},
      ${seasonSummary.pointsReceivedAssets},
      ${seasonSummary.pointsGaveAssets},
      ${seasonSummary.starterRatePct},
      ${tradeDateIso},
      ${seasonSummary.seasons.length},
      ${seasonSummary.seasons.length >= 3},
      ${gradedThroughDate},
      ${valueDelta.valueSource},
      ${valueDelta.scoringAdjusted},
      NOW()
    )
    ON CONFLICT (trade_id, roster_id, counterparty_roster_id)
    DO UPDATE SET
      league_id = EXCLUDED.league_id,
      value_gave_at_trade = EXCLUDED.value_gave_at_trade,
      value_received_at_trade = EXCLUDED.value_received_at_trade,
      value_gave_current = EXCLUDED.value_gave_current,
      value_received_current = EXCLUDED.value_received_current,
      value_delta_pct = EXCLUDED.value_delta_pct,
      value_verdict = EXCLUDED.value_verdict,
      wins_with_trade = EXCLUDED.wins_with_trade,
      wins_without_trade = EXCLUDED.wins_without_trade,
      win_impact = EXCLUDED.win_impact,
      median_weeks_with = EXCLUDED.median_weeks_with,
      median_weeks_without = EXCLUDED.median_weeks_without,
      median_impact = EXCLUDED.median_impact,
      points_received_assets = EXCLUDED.points_received_assets,
      points_gave_assets = EXCLUDED.points_gave_assets,
      starter_rate_pct = EXCLUDED.starter_rate_pct,
      trade_date = EXCLUDED.trade_date,
      seasons_graded = EXCLUDED.seasons_graded,
      is_final = EXCLUDED.is_final,
      graded_through_date = EXCLUDED.graded_through_date,
      value_source = EXCLUDED.value_source,
      scoring_adjusted = EXCLUDED.scoring_adjusted,
      updated_at = NOW()
    RETURNING id
  `);

  const outcomeId = (rows as unknown as Array<{ id: number }>)[0]?.id;
  if (!outcomeId) {
    return null;
  }

  await db.execute(sql`
    DELETE FROM trade_outcome_seasons
    WHERE trade_outcome_id = ${outcomeId}
  `);

  if (seasonSummary.seasons.length > 0) {
    const values = seasonSummary.seasons.map(
      (season) => sql`(
        ${outcomeId},
        ${season.seasonNumber},
        ${season.seasonYear},
        ${season.winsWith},
        ${season.winsWithout},
        ${season.winImpact},
        ${season.medianWith},
        ${season.medianWithout},
        ${season.pointsReceived},
        ${season.pointsGave},
        ${valueDelta.valueDeltaPct},
        ${JSON.stringify(season.keyAssetsReceived)}::jsonb,
        ${JSON.stringify(season.keyAssetsGave)}::jsonb
      )`
    );

    await db.execute(sql`
      INSERT INTO trade_outcome_seasons (
        trade_outcome_id,
        season_number,
        season_year,
        wins_with,
        wins_without,
        win_impact,
        median_with,
        median_without,
        points_received,
        points_gave,
        value_delta_pct,
        key_assets_received,
        key_assets_gave
      )
      VALUES ${sql.join(values, sql`, `)}
    `);
  }

  return outcomeId;
}

async function gradeTradeFromData(
  tradeId: string,
  assets: TradeAssetRow[],
  leagueRows: LeagueRow[],
  seasonContext: TradeSeasonContext
): Promise<void> {
  if (assets.length === 0) return;

  const tradeDate = getTradeDate(assets);
  const leagueId = assets[0].league_id;
  const league = getLeagueRow(leagueId, leagueRows);
  const rosterIds = [...new Set(assets.map((asset) => asset.roster_id))];

  for (const rosterId of rosterIds) {
    const rosterAssets = assets.filter(
      (asset) =>
        asset.roster_id === rosterId &&
        (asset.asset_type === "player" || asset.asset_type === "pick")
    );
    if (rosterAssets.length === 0) continue;

    const counterpartyRosterIds = [
      ...new Set(
        rosterAssets.flatMap((asset) => parseCounterpartyRosterIds(asset.counterparty_roster_ids))
      ),
    ].filter((id) => id !== rosterId);

    const counterparties =
      counterpartyRosterIds.length > 0
        ? counterpartyRosterIds
        : rosterIds.filter((id) => id !== rosterId);
    if (counterparties.length === 0) continue;

    const valueDelta = computeValueDelta(rosterAssets, tradeDate, league);
    const seasonSummary = computeSeasonOutcomes(
      rosterId,
      rosterAssets,
      tradeDate,
      seasonContext
    );

    for (const counterpartyRosterId of counterparties) {
      await upsertTradeOutcome(
        tradeId,
        leagueId,
        rosterId,
        counterpartyRosterId,
        tradeDate,
        valueDelta,
        seasonSummary
      );
    }
  }
}

function buildTextArraySql(values: string[]) {
  if (values.length === 0) return sql.raw("ARRAY[]::text[]");
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

function buildTradeSummary(row: OwnerProfileOutcomeRow): string {
  const delta = row.value_delta_pct == null ? "n/a" : `${round1(row.value_delta_pct)}%`;
  const impact = row.win_impact ?? 0;
  return `${row.trade_id}: value ${delta}, win impact ${impact >= 0 ? "+" : ""}${impact}`;
}

export async function buildOwnerProfiles(leagueId: string): Promise<number> {
  const [outcomeRowsRaw, assetRowsRaw, rosterInfoRaw] = await Promise.all([
    db.execute(sql`
      SELECT
        trade_id,
        league_id,
        roster_id,
        counterparty_roster_id,
        value_delta_pct::real AS value_delta_pct,
        value_verdict,
        win_impact,
        trade_date
      FROM trade_outcomes
      WHERE league_id = ${leagueId}
    `),
    db.execute(sql`
      SELECT
        ta.roster_id,
        pm.position,
        pm.age
      FROM trade_assets ta
      LEFT JOIN players_master pm
        ON pm.player_id = ta.asset_key
      WHERE ta.league_id = ${leagueId}
        AND ta.asset_type = 'player'
        AND ta.direction = 'received'
    `),
    db.execute(sql`
      SELECT
        r.roster_id,
        r.owner_id,
        lu.display_name,
        lu.team_name
      FROM rosters r
      LEFT JOIN league_users lu
        ON lu.league_id = r.league_id
       AND lu.user_id = r.owner_id
      WHERE r.league_id = ${leagueId}
    `),
  ]);

  const outcomeRows = outcomeRowsRaw as unknown as OwnerProfileOutcomeRow[];
  const assetRows = assetRowsRaw as unknown as OwnerProfileAssetRow[];
  const rosterInfo = rosterInfoRaw as unknown as OwnerRosterInfoRow[];

  await db.execute(sql`
    DELETE FROM owner_tendency_profiles
    WHERE league_id = ${leagueId}
  `);

  if (outcomeRows.length === 0) return 0;

  const rosterInfoMap = new Map<number, OwnerRosterInfoRow>();
  for (const row of rosterInfo) {
    rosterInfoMap.set(row.roster_id, row);
  }

  const assetRowsByRoster = new Map<number, OwnerProfileAssetRow[]>();
  for (const row of assetRows) {
    const bucket = assetRowsByRoster.get(row.roster_id) ?? [];
    bucket.push(row);
    assetRowsByRoster.set(row.roster_id, bucket);
  }

  const byRoster = new Map<number, OwnerProfileOutcomeRow[]>();
  for (const row of outcomeRows) {
    const bucket = byRoster.get(row.roster_id) ?? [];
    bucket.push(row);
    byRoster.set(row.roster_id, bucket);
  }

  let inserted = 0;
  for (const [rosterId, rows] of byRoster.entries()) {
    const info = rosterInfoMap.get(rosterId);
    const assetsForRoster = assetRowsByRoster.get(rosterId) ?? [];

    const totalTrades = rows.length;
    const decidedValueRows = rows.filter(
      (row) => row.value_verdict === "won" || row.value_verdict === "lost"
    );
    const valueWins = rows.filter((row) => row.value_verdict === "won").length;
    const impactRows = rows.filter((row) => row.win_impact != null);
    const impactWins = rows.filter((row) => (row.win_impact ?? 0) > 0).length;
    const cumulativeWinImpact = rows.reduce((sum, row) => sum + (row.win_impact ?? 0), 0);
    const cumulativeValueDelta = round1(
      rows.reduce((sum, row) => sum + (row.value_delta_pct ?? 0), 0)
    );

    const ages = assetsForRoster
      .map((row) => row.age)
      .filter((age): age is number => age != null && Number.isFinite(age));
    const avgAcquiredAge =
      ages.length > 0
        ? round1(ages.reduce((sum, age) => sum + age, 0) / ages.length)
        : null;
    const youthVetBias =
      avgAcquiredAge == null
        ? "balanced"
        : avgAcquiredAge <= 25.5
          ? "youth"
          : avgAcquiredAge >= 27.5
            ? "veteran"
            : "balanced";

    const positionCounts = new Map<string, number>();
    for (const asset of assetsForRoster) {
      if (!asset.position) continue;
      positionCounts.set(asset.position, (positionCounts.get(asset.position) ?? 0) + 1);
    }
    const topPositionsAcquired = [...positionCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([position]) => position);

    const tradeYears = new Set(
      rows
        .map((row) => row.trade_date)
        .filter(Boolean)
        .map((value) => new Date(value as string | Date).getUTCFullYear())
    );
    const tradesPerSeason = round1(totalTrades / Math.max(tradeYears.size, 1));

    const counterpartyCounts = new Map<number, number>();
    for (const row of rows) {
      counterpartyCounts.set(
        row.counterparty_roster_id,
        (counterpartyCounts.get(row.counterparty_roster_id) ?? 0) + 1
      );
    }
    const mostCommonPartnerRosterId =
      [...counterpartyCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

    const bestTrade =
      [...rows].sort(
        (left, right) =>
          (right.value_delta_pct ?? Number.NEGATIVE_INFINITY) -
          (left.value_delta_pct ?? Number.NEGATIVE_INFINITY)
      )[0] ?? null;
    const worstTrade =
      [...rows].sort(
        (left, right) =>
          (left.value_delta_pct ?? Number.POSITIVE_INFINITY) -
          (right.value_delta_pct ?? Number.POSITIVE_INFINITY)
      )[0] ?? null;

    const valueWinRate =
      decidedValueRows.length > 0 ? round1((valueWins / decidedValueRows.length) * 100) : 0;
    const impactWinRate =
      impactRows.length > 0 ? round1((impactWins / impactRows.length) * 100) : 0;
    const softTargetScore = round1(
      clamp(
        tradesPerSeason * 8 + (100 - valueWinRate) * 0.35 + (100 - impactWinRate) * 0.25,
        0,
        100
      )
    );

    await db.execute(sql`
      INSERT INTO owner_tendency_profiles (
        league_id,
        roster_id,
        owner_id,
        display_name,
        total_trades,
        trade_win_rate_value,
        trade_win_rate_impact,
        cumulative_win_impact,
        cumulative_value_delta,
        avg_acquired_age,
        youth_vet_bias,
        top_positions_acquired,
        trades_per_season,
        most_common_partner_roster_id,
        soft_target_score,
        best_trade_id,
        best_trade_summary,
        worst_trade_id,
        worst_trade_summary,
        updated_at
      )
      VALUES (
        ${leagueId},
        ${rosterId},
        ${info?.owner_id ?? null},
        ${info?.display_name?.trim() || info?.team_name?.trim() || info?.owner_id || `Roster ${rosterId}`},
        ${totalTrades},
        ${valueWinRate},
        ${impactWinRate},
        ${cumulativeWinImpact},
        ${cumulativeValueDelta},
        ${avgAcquiredAge},
        ${youthVetBias},
        ${buildTextArraySql(topPositionsAcquired)},
        ${tradesPerSeason},
        ${mostCommonPartnerRosterId},
        ${softTargetScore},
        ${bestTrade?.trade_id ?? null},
        ${bestTrade ? buildTradeSummary(bestTrade) : null},
        ${worstTrade?.trade_id ?? null},
        ${worstTrade ? buildTradeSummary(worstTrade) : null},
        NOW()
      )
      ON CONFLICT (league_id, roster_id)
      DO UPDATE SET
        owner_id = EXCLUDED.owner_id,
        display_name = EXCLUDED.display_name,
        total_trades = EXCLUDED.total_trades,
        trade_win_rate_value = EXCLUDED.trade_win_rate_value,
        trade_win_rate_impact = EXCLUDED.trade_win_rate_impact,
        cumulative_win_impact = EXCLUDED.cumulative_win_impact,
        cumulative_value_delta = EXCLUDED.cumulative_value_delta,
        avg_acquired_age = EXCLUDED.avg_acquired_age,
        youth_vet_bias = EXCLUDED.youth_vet_bias,
        top_positions_acquired = EXCLUDED.top_positions_acquired,
        trades_per_season = EXCLUDED.trades_per_season,
        most_common_partner_roster_id = EXCLUDED.most_common_partner_roster_id,
        soft_target_score = EXCLUDED.soft_target_score,
        best_trade_id = EXCLUDED.best_trade_id,
        best_trade_summary = EXCLUDED.best_trade_summary,
        worst_trade_id = EXCLUDED.worst_trade_id,
        worst_trade_summary = EXCLUDED.worst_trade_summary,
        updated_at = NOW()
    `);

    inserted += 1;
  }

  return inserted;
}

export async function clearTradeIntelligenceCache(): Promise<void> {
  clearValueIndex(fantasycalcIndex);
  clearValueIndex(dynastyprocessIndex);
  playerStatsMap.clear();
  playerMetaMap.clear();
  valuesLoaded = false;
  loadPromise = null;
}

export async function loadAllValues(force = false): Promise<void> {
  if (valuesLoaded && !force) return;
  if (loadPromise && !force) {
    await loadPromise;
    return;
  }

  loadPromise = (async () => {
    clearValueIndex(fantasycalcIndex);
    clearValueIndex(dynastyprocessIndex);
    playerStatsMap.clear();
    playerMetaMap.clear();
    pickToPlayerMap.clear();

    const [fcRowsRaw, dpRowsRaw, playerRowsRaw, statsRowsRaw, draftResultsRaw] = await Promise.all([
      db.execute(sql`
        SELECT
          snapshot_date::text AS snapshot_date,
          player_name,
          sleeper_id,
          dynasty_value::real AS dynasty_value
        FROM fantasycalc_daily
        WHERE dynasty_value IS NOT NULL
      `),
      db.execute(sql`
        SELECT
          snapshot_date::text AS snapshot_date,
          player_name,
          sleeper_id,
          value_2qb::real AS value_2qb
        FROM dp_historical_values
        WHERE value_2qb IS NOT NULL
      `),
      db.execute(sql`
        SELECT player_id, full_name, position, team
        FROM players_master
      `),
      db.execute(sql`
        SELECT
          player_id,
          season,
          position,
          team,
          pass_att,
          pass_cmp,
          pass_yd,
          pass_td,
          pass_int,
          pass_2pt,
          pass_fd,
          pass_sack,
          pass_cmp_40p,
          pass_td_40p,
          pass_td_50p,
          pass_inc,
          rush_att,
          rush_yd,
          rush_td,
          rush_2pt,
          rush_fd,
          rush_40p,
          rush_td_40p,
          rush_td_50p,
          rec,
          rec_yd,
          rec_td,
          rec_2pt,
          rec_fd,
          rec_0_4,
          rec_5_9,
          rec_10_19,
          rec_20_29,
          rec_30_39,
          rec_40p,
          rec_td_40p,
          rec_td_50p,
          fum,
          fum_lost,
          bonus_rush_yd_100,
          bonus_rush_yd_200,
          bonus_rec_yd_100,
          bonus_rec_yd_200,
          bonus_pass_yd_300,
          bonus_pass_yd_400,
          bonus_pass_cmp_25,
          bonus_rush_att_20,
          bonus_rush_rec_yd_100,
          bonus_rush_rec_yd_200,
          bonus_fd_rb,
          bonus_fd_wr,
          bonus_fd_te,
          bonus_fd_qb
        FROM player_season_stats
      `),
      db.execute(sql`
        SELECT league_id, season, round, roster_id, player_id, player_name, position
        FROM league_draft_results
      `),
    ]);

    for (const row of playerRowsRaw as unknown as PlayerMeta[]) {
      playerMetaMap.set(row.player_id, row);
    }

    for (const row of fcRowsRaw as unknown as Array<{
      snapshot_date: string;
      player_name: string;
      sleeper_id: string | null;
      dynasty_value: number;
    }>) {
      registerValue(
        fantasycalcIndex,
        row.sleeper_id,
        row.player_name,
        {
          snapshot_date: row.snapshot_date,
          value: toNumber(row.dynasty_value),
        }
      );
    }

    for (const row of dpRowsRaw as unknown as Array<{
      snapshot_date: string;
      player_name: string;
      sleeper_id: string | null;
      value_2qb: number;
    }>) {
      registerValue(
        dynastyprocessIndex,
        row.sleeper_id,
        row.player_name,
        {
          snapshot_date: row.snapshot_date,
          value: toNumber(row.value_2qb),
        }
      );
    }

    for (const row of statsRowsRaw as unknown as PlayerStatsRow[]) {
      const seasonMap = playerStatsMap.get(row.player_id) ?? new Map<number, PlayerStatRecord>();
      const statRecord = Object.fromEntries(
        PLAYER_STAT_COLUMNS.map((column) => [column, toNumber(row[column])])
      ) as PlayerStatRecord;
      seasonMap.set(row.season, statRecord);
      playerStatsMap.set(row.player_id, seasonMap);
    }

    for (const row of draftResultsRaw as unknown as Array<{
      league_id: string;
      season: string;
      round: number;
      roster_id: number;
      player_id: string;
      player_name: string;
      position: string | null;
    }>) {
      const key = `${row.league_id}:${row.season}_${row.round}_${row.roster_id}`;
      pickToPlayerMap.set(key, {
        sleeperId: row.player_id,
        playerName: row.player_name,
        position: row.position,
      });
    }

    finalizeValueIndex(fantasycalcIndex);
    finalizeValueIndex(dynastyprocessIndex);
    valuesLoaded = true;
  })();

  try {
    await loadPromise;
  } catch (error) {
    loadPromise = null;
    valuesLoaded = false;
    throw error;
  }
}

export async function gradeLeagueTrades(
  leagueId: string
): Promise<{ graded: number; skipped: number }> {
  await loadAllValues();

  const leagueRows = await loadLeagueRows();
  const seasonContext = await loadTradeSeasonContext(leagueId, leagueRows);
  const allAssetsRaw = await db.execute(sql`
    SELECT
      trade_id,
      league_id,
      roster_id,
      direction,
      asset_type,
      asset_key,
      asset_name,
      created_at_ms,
      counterparty_roster_ids,
      season
    FROM trade_assets
    WHERE league_id = ${leagueId}
  `);

  const allAssets = allAssetsRaw as unknown as TradeAssetRow[];
  if (allAssets.length === 0) return { graded: 0, skipped: 0 };

  const finalRowsRaw = await db.execute(sql`
    SELECT DISTINCT trade_id
    FROM trade_outcomes
    WHERE league_id = ${leagueId}
      AND is_final = true
  `);
  const finalTradeIds = new Set(
    (finalRowsRaw as unknown as Array<{ trade_id: string }>).map((row) => row.trade_id)
  );

  const byTrade = new Map<string, TradeAssetRow[]>();
  for (const asset of allAssets) {
    const bucket = byTrade.get(asset.trade_id) ?? [];
    bucket.push(asset);
    byTrade.set(asset.trade_id, bucket);
  }

  let graded = 0;
  let skipped = 0;
  for (const [tradeId, assets] of byTrade.entries()) {
    if (finalTradeIds.has(tradeId)) {
      skipped += 1;
      continue;
    }

    try {
      await gradeTradeFromData(tradeId, assets, leagueRows, seasonContext);
      graded += 1;
    } catch (error) {
      console.error(`[trade-intelligence] Error grading trade ${tradeId}:`, error);
    }
  }

  await buildOwnerProfiles(leagueId);
  return { graded, skipped };
}

export async function gradeAllTrades(
  options: { leagueId?: string } = {}
): Promise<{ graded: number; skipped: number; leagues: number }> {
  await loadAllValues();

  const leagueRows = await loadLeagueRows();
  const assetsRaw = options.leagueId
    ? await db.execute(sql`
        SELECT
          trade_id,
          league_id,
          roster_id,
          direction,
          asset_type,
          asset_key,
          asset_name,
          created_at_ms,
          counterparty_roster_ids,
          season
        FROM trade_assets
        WHERE league_id = ${options.leagueId}
      `)
    : await db.execute(sql`
        SELECT
          trade_id,
          league_id,
          roster_id,
          direction,
          asset_type,
          asset_key,
          asset_name,
          created_at_ms,
          counterparty_roster_ids,
          season
        FROM trade_assets
      `);

  const assets = assetsRaw as unknown as TradeAssetRow[];
  if (assets.length === 0) {
    return { graded: 0, skipped: 0, leagues: 0 };
  }

  const assetsByLeague = new Map<string, Map<string, TradeAssetRow[]>>();
  for (const asset of assets) {
    const byTrade = assetsByLeague.get(asset.league_id) ?? new Map<string, TradeAssetRow[]>();
    const bucket = byTrade.get(asset.trade_id) ?? [];
    bucket.push(asset);
    byTrade.set(asset.trade_id, bucket);
    assetsByLeague.set(asset.league_id, byTrade);
  }

  let graded = 0;
  for (const [leagueId, byTrade] of assetsByLeague.entries()) {
    const seasonContext = await loadTradeSeasonContext(leagueId, leagueRows);
    for (const [tradeId, tradeAssets] of byTrade.entries()) {
      try {
        await gradeTradeFromData(tradeId, tradeAssets, leagueRows, seasonContext);
        graded += 1;
      } catch (error) {
        console.error(`[trade-intelligence] Error grading trade ${tradeId}:`, error);
      }
    }
    await buildOwnerProfiles(leagueId);
  }

  return {
    graded,
    skipped: 0,
    leagues: assetsByLeague.size,
  };
}
