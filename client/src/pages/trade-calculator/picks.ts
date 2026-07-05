import type { ScoredPick } from "../../hooks/use-power-rankings";
import type { TradeAssetInput } from "@shared/types";

const YEAR = new Date().getFullYear();

export const PICK_YEARS = [String(YEAR), String(YEAR + 1), String(YEAR + 2)];

export function pickDisplay(pick: ScoredPick): string {
  if (pick.pick_slot != null) {
    return `${pick.season} ${pick.round}.${String(pick.pick_slot).padStart(2, "0")}`;
  }
  return pick.label;
}

export function pickToAsset(pick: ScoredPick): TradeAssetInput {
  return {
    type: "pick",
    pick_season: pick.season,
    pick_round: pick.round,
    pick_tier: pick.tier,
    pick_slot: pick.pick_slot ?? null,
    pick_label: pickDisplay(pick),
    pick_original_owner_id: pick.original_owner_id,
  };
}

export function pickKey(pick: ScoredPick): string {
  if (pick.pick_slot != null) {
    return `k:${pick.season}|${pick.round}|${pick.pick_slot}|${pick.original_owner_id}`;
  }
  return `k:${pick.season}|${pick.round}|${pick.tier}|${pick.original_owner_id}`;
}

export function pickSlotLabel(round: number, slot: number): string {
  return `${round}.${String(slot).padStart(2, "0")}`;
}
