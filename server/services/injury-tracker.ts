import type { InjuredPlayerView, BuyingWindow } from "../../shared/types.js";

// ─── Main ───

export async function getInjuredPlayers(
  username: string
): Promise<InjuredPlayerView[]> {
  // TODO: join players_master injury fields with roster_players,
  // calculate return dates and value drops
  return [];
}

export async function getBuyingWindows(
  username: string
): Promise<BuyingWindow[]> {
  // TODO: subset of injured players where buying window is active
  return [];
}
