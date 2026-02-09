import { eq } from "drizzle-orm";
import { db } from "../connection.js";
import { trades, trade_assets } from "../schema.js";

export async function upsertTrade(trade: {
  transaction_id: string;
  league_id: string;
  status: string;
  created_at: number;
  roster_ids: string | null;
  adds: string | null;
  drops: string | null;
  draft_picks: string | null;
  waiver_budget: string | null;
}) {
  await db
    .insert(trades)
    .values({ ...trade, updated_at: Date.now() })
    .onConflictDoNothing();
}

export async function upsertTradeAsset(asset: {
  trade_id: string;
  league_id: string;
  season: number;
  created_at_ms: number;
  roster_id: number;
  counterparty_roster_ids: string | null;
  asset_type: string;
  asset_key: string;
  asset_name: string | null;
  direction: string;
}) {
  await db
    .insert(trade_assets)
    .values({ ...asset, updated_at: Date.now() })
    .onConflictDoNothing();
}

export async function getTradesForLeague(leagueId: string) {
  return db
    .select()
    .from(trades)
    .where(eq(trades.league_id, leagueId));
}
