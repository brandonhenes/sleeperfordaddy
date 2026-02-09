import type { SleeperPlayer, SleeperNflState } from "../../shared/types.js";
import { jget } from "./client.js";

/**
 * GET /players/nfl — Bulk player data (~10k entries).
 * Cache this aggressively — it rarely changes.
 */
export async function getAllPlayers(): Promise<Record<string, SleeperPlayer>> {
  const result = await jget<Record<string, SleeperPlayer>>("/players/nfl");
  return result ?? {};
}

/** GET /state/nfl — Current NFL state (season, week) */
export async function getNflState(): Promise<SleeperNflState | null> {
  return jget<SleeperNflState>("/state/nfl");
}
