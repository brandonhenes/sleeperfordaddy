import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import type {
  TradeAgingRow,
  TradeGrade,
  TradeGradedAsset,
  TradeHistoryResponse,
  TradeHistoryStats,
} from "../../shared/types.js";

interface UserRow {
  user_id: string;
}

interface UserRosterRow {
  league_id: string;
  roster_id: number;
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
}

interface TradeAgingSourceRow {
  trade_id: string;
  trade_date: string;
  days_since_trade: number;
  direction: "gave" | "received";
  asset_type: "player" | "pick";
  asset_key: string;
  asset_name: string | null;
  position: string | null;
  fc_value_at_trade: number | null;
  fc_value_now: number | null;
  fc_value_change: number | null;
  league_id: string;
  league_name: string;
}

interface LeagueRow {
  league_id: string;
  name: string;
}

interface LeagueRosterRow {
  league_id: string;
  roster_id: number;
  owner_id: string;
}

interface LeagueUserRow {
  league_id: string;
  user_id: string;
  display_name: string | null;
  team_name: string | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function toTimestamp(value: number | string): number | null {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toWhole(value: number): number {
  return Math.round(value);
}

function gradeFromTotals(received: number, gave: number): "win" | "loss" | "push" {
  if (received > gave * 1.1) return "win";
  if (gave > received * 1.1) return "loss";
  return "push";
}

function emptyStats(): TradeHistoryStats {
  return {
    total_trades: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    win_rate: 0,
    total_value_gained: 0,
    avg_value_per_trade: 0,
    best_trade: null,
    worst_trade: null,
    by_position: [],
    by_league: [],
    by_month: [],
  };
}

function parseCounterpartyIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as number[];
    return Array.isArray(parsed) ? parsed.filter((value) => Number.isFinite(value)) : [];
  } catch {
    return [];
  }
}

async function getUserIdForUsername(username: string): Promise<string | null> {
  const userRows = await db.execute(sql`
    SELECT user_id
    FROM users
    WHERE LOWER(username) = LOWER(${username})
    LIMIT 1
  `);
  return (userRows as unknown as UserRow[])[0]?.user_id ?? null;
}

export async function getTradeAging(username: string): Promise<TradeAgingRow[]> {
  const userId = await getUserIdForUsername(username);
  if (!userId) return [];

  const rows = await db.execute(sql`
    SELECT
      ta.trade_id,
      ta.trade_date::text AS trade_date,
      ta.days_since_trade::int AS days_since_trade,
      ta.direction,
      ta.asset_type,
      ta.asset_key,
      ta.asset_name,
      ta.position,
      ta.value_at_trade::real AS fc_value_at_trade,
      ta.value_now::real AS fc_value_now,
      ta.value_change::real AS fc_value_change,
      COALESCE(t.league_id, ta.league_id) AS league_id,
      COALESCE(l.name, 'Unknown League') AS league_name
    FROM v_trade_aging ta
    LEFT JOIN trades t ON t.transaction_id = ta.trade_id
    LEFT JOIN leagues l ON l.league_id = COALESCE(t.league_id, ta.league_id)
    JOIN user_leagues ul
      ON ul.league_id = COALESCE(t.league_id, ta.league_id)
      AND ul.user_id = ${userId}
    WHERE ta.roster_id IN (
      SELECT roster_id
      FROM rosters
      WHERE league_id = COALESCE(t.league_id, ta.league_id)
        AND owner_id = ${userId}
    )
    ORDER BY ta.trade_date DESC, ta.trade_id DESC, ta.direction ASC, ta.asset_name ASC NULLS LAST
  `);

  return rows as unknown as TradeAgingRow[];
}

export async function getTradeHistory(username: string): Promise<TradeHistoryResponse> {
  const userId = await getUserIdForUsername(username);
  if (!userId) return { trades: [], stats: emptyStats() };

  const userRosterRows = await db.execute(sql`
    SELECT league_id, roster_id
    FROM rosters
    WHERE owner_id = ${userId}
  `);
  const userRosters = userRosterRows as unknown as UserRosterRow[];
  if (userRosters.length === 0) return { trades: [], stats: emptyStats() };

  const tradeAssetFilters = userRosters.map((roster) => sql`(league_id = ${roster.league_id} AND roster_id = ${roster.roster_id})`);
  const leagueIds = [...new Set(userRosters.map((roster) => roster.league_id))];
  const leagueIdSql = sql.join(leagueIds.map((leagueId) => sql`${leagueId}`), sql`, `);

  const tradeAssetRows = await db.execute(sql`
    SELECT trade_id, league_id, roster_id, direction, asset_type, asset_key, asset_name, created_at_ms, counterparty_roster_ids
    FROM trade_assets
    WHERE ${sql.join(tradeAssetFilters, sql` OR `)}
    ORDER BY created_at_ms DESC, trade_id DESC
  `);
  const userTradeAssets = (tradeAssetRows as unknown as TradeAssetRow[]).filter(
    (asset) => asset.asset_type === "player" || asset.asset_type === "pick"
  );
  if (userTradeAssets.length === 0) return { trades: [], stats: emptyStats() };

  const agingRows = (await getTradeAging(username)) as TradeAgingSourceRow[];
  if (agingRows.length === 0) return { trades: [], stats: emptyStats() };

  const tradeMap = new Map<string, {
    league_id: string;
    created_at_ms: number;
    partner_roster_ids: Set<number>;
  }>();

  for (const asset of userTradeAssets) {
    const createdAtMs = toTimestamp(asset.created_at_ms);
    if (createdAtMs == null) continue;
    const trade = tradeMap.get(asset.trade_id) ?? {
      league_id: asset.league_id,
      created_at_ms: createdAtMs,
      partner_roster_ids: new Set<number>(),
    };
    if (createdAtMs > trade.created_at_ms) {
      trade.created_at_ms = createdAtMs;
    }
    for (const rosterId of parseCounterpartyIds(asset.counterparty_roster_ids)) {
      trade.partner_roster_ids.add(rosterId);
    }
    tradeMap.set(asset.trade_id, trade);
  }

  const [leagueRows, leagueRosterRows, leagueUserRows] = await Promise.all([
    db.execute(sql`
      SELECT league_id, name
      FROM leagues
      WHERE league_id IN (${leagueIdSql})
    `),
    db.execute(sql`
      SELECT league_id, roster_id, owner_id
      FROM rosters
      WHERE league_id IN (${leagueIdSql})
    `),
    db.execute(sql`
      SELECT league_id, user_id, display_name, team_name
      FROM league_users
      WHERE league_id IN (${leagueIdSql})
    `),
  ]);

  const leagueNameMap = new Map<string, string>();
  for (const row of leagueRows as unknown as LeagueRow[]) {
    leagueNameMap.set(row.league_id, row.name);
  }

  const ownerByLeagueRoster = new Map<string, string>();
  for (const row of leagueRosterRows as unknown as LeagueRosterRow[]) {
    ownerByLeagueRoster.set(`${row.league_id}:${row.roster_id}`, row.owner_id);
  }

  const partnerNameMap = new Map<string, string>();
  for (const row of leagueUserRows as unknown as LeagueUserRow[]) {
    partnerNameMap.set(
      `${row.league_id}:${row.user_id}`,
      row.display_name?.trim() || row.team_name?.trim() || row.user_id
    );
  }

  const trades: TradeGrade[] = [];
  const agingByTrade = new Map<string, TradeAgingSourceRow[]>();
  for (const row of agingRows) {
    const current = agingByTrade.get(row.trade_id) ?? [];
    current.push(row);
    agingByTrade.set(row.trade_id, current);
  }

  for (const [tradeId, trade] of tradeMap.entries()) {
    const agingAssets = agingByTrade.get(tradeId);
    if (!agingAssets || agingAssets.length === 0) continue;

    const tradeDate = agingAssets[0]?.trade_date ?? toDateStr(trade.created_at_ms);
    const gave: TradeGradedAsset[] = [];
    const received: TradeGradedAsset[] = [];

    for (const asset of agingAssets) {
      const gradedAsset: TradeGradedAsset = {
        asset_type: asset.asset_type,
        asset_key: asset.asset_key,
        label: asset.asset_name ?? asset.asset_key,
        position: asset.position ?? null,
        value_at_trade: asset.fc_value_at_trade,
        value_now: asset.fc_value_now,
        value_change: toWhole(asset.fc_value_change ?? 0),
      };

      if (asset.direction === "gave") {
        gave.push(gradedAsset);
      } else {
        received.push(gradedAsset);
      }
    }

    if (gave.length === 0 && received.length === 0) continue;

    const gaveThen = toWhole(gave.reduce((sum, asset) => sum + (asset.value_at_trade ?? 0), 0));
    const gaveNow = toWhole(gave.reduce((sum, asset) => sum + (asset.value_now ?? 0), 0));
    const receivedThen = toWhole(received.reduce((sum, asset) => sum + (asset.value_at_trade ?? 0), 0));
    const receivedNow = toWhole(received.reduce((sum, asset) => sum + (asset.value_now ?? 0), 0));
    const netValueChange = receivedNow - gaveNow;

    const partnerNames = [...trade.partner_roster_ids]
      .map((rosterId) => ownerByLeagueRoster.get(`${trade.league_id}:${rosterId}`))
      .filter((ownerId): ownerId is string => !!ownerId)
      .map((ownerId) => partnerNameMap.get(`${trade.league_id}:${ownerId}`) ?? ownerId)
      .filter((name, index, list) => list.indexOf(name) === index);

    trades.push({
      trade_id: tradeId,
      league_id: trade.league_id,
      league_name: leagueNameMap.get(trade.league_id) ?? "Unknown League",
      trade_date: tradeDate,
      trade_timestamp: trade.created_at_ms,
      gave,
      received,
      gave_total_then: gaveThen,
      gave_total_now: gaveNow,
      received_total_then: receivedThen,
      received_total_now: receivedNow,
      net_value_change: netValueChange,
      grade: gradeFromTotals(receivedNow, gaveNow),
      grade_magnitude: Math.abs(netValueChange),
      partner_names: partnerNames.length > 0 ? partnerNames : ["Trade Partner"],
    });
  }

  trades.sort((left, right) => right.trade_timestamp - left.trade_timestamp);

  return {
    trades,
    stats: computeStats(trades),
  };
}

function computeStats(trades: TradeGrade[]): TradeHistoryStats {
  if (trades.length === 0) return emptyStats();

  const wins = trades.filter((trade) => trade.grade === "win").length;
  const losses = trades.filter((trade) => trade.grade === "loss").length;
  const pushes = trades.filter((trade) => trade.grade === "push").length;
  const decidedTrades = wins + losses;
  const totalValueGained = toWhole(trades.reduce((sum, trade) => sum + trade.net_value_change, 0));
  const avgValuePerTrade = toWhole(totalValueGained / trades.length);

  const bestTrade = [...trades].sort((left, right) => right.net_value_change - left.net_value_change)[0] ?? null;
  const worstTrade = [...trades].sort((left, right) => left.net_value_change - right.net_value_change)[0] ?? null;

  const positionMap = new Map<string, { trades: number; net_value: number }>();
  for (const trade of trades) {
    const positions = new Set(
      [...trade.gave, ...trade.received]
        .map((asset) => asset.position)
        .filter((position): position is string => !!position)
    );
    for (const position of positions) {
      const current = positionMap.get(position) ?? { trades: 0, net_value: 0 };
      current.trades += 1;
      current.net_value += trade.net_value_change;
      positionMap.set(position, current);
    }
  }

  const byPosition = [...positionMap.entries()]
    .map(([position, values]) => ({
      position,
      trades: values.trades,
      net_value: toWhole(values.net_value),
    }))
    .sort((left, right) => right.net_value - left.net_value);

  const leagueMap = new Map<string, { league_name: string; trades: number; wins: number; losses: number; net_value: number }>();
  for (const trade of trades) {
    const current = leagueMap.get(trade.league_id) ?? {
      league_name: trade.league_name,
      trades: 0,
      wins: 0,
      losses: 0,
      net_value: 0,
    };
    current.trades += 1;
    current.net_value += trade.net_value_change;
    if (trade.grade === "win") current.wins += 1;
    if (trade.grade === "loss") current.losses += 1;
    leagueMap.set(trade.league_id, current);
  }

  const byLeague = [...leagueMap.entries()]
    .map(([league_id, values]) => {
      const decided = values.wins + values.losses;
      return {
        league_id,
        league_name: values.league_name,
        trades: values.trades,
        win_rate: decided > 0 ? round1((values.wins / decided) * 100) : 0,
        net_value: toWhole(values.net_value),
      };
    })
    .sort((left, right) => right.net_value - left.net_value);

  const monthMap = new Map<string, { trades: number; wins: number; losses: number; net_value: number }>();
  for (const trade of trades) {
    const month = trade.trade_date.slice(0, 7);
    const current = monthMap.get(month) ?? { trades: 0, wins: 0, losses: 0, net_value: 0 };
    current.trades += 1;
    current.net_value += trade.net_value_change;
    if (trade.grade === "win") current.wins += 1;
    if (trade.grade === "loss") current.losses += 1;
    monthMap.set(month, current);
  }

  const byMonth = [...monthMap.entries()]
    .map(([month, values]) => {
      const decided = values.wins + values.losses;
      return {
        month,
        trades: values.trades,
        win_rate: decided > 0 ? round1((values.wins / decided) * 100) : 0,
        net_value: toWhole(values.net_value),
      };
    })
    .sort((left, right) => left.month.localeCompare(right.month));

  return {
    total_trades: trades.length,
    wins,
    losses,
    pushes,
    win_rate: decidedTrades > 0 ? round1((wins / decidedTrades) * 100) : 0,
    total_value_gained: totalValueGained,
    avg_value_per_trade: avgValuePerTrade,
    best_trade: bestTrade,
    worst_trade: worstTrade,
    by_position: byPosition,
    by_league: byLeague,
    by_month: byMonth,
  };
}
