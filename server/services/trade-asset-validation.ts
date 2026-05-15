import type { TradeAssetInput, TradeValuationWarning } from "../../shared/types.js";

type TradeSide = "sideA" | "sideB";

export function tradeAssetKey(asset: TradeAssetInput): string {
  if (asset.type === "player") {
    return `player:${asset.player_id ?? "unknown"}`;
  }
  const ownerKey = asset.pick_original_owner_id != null ? `:${asset.pick_original_owner_id}` : "";
  if (asset.pick_slot != null && asset.pick_slot > 0) {
    return `pick:${asset.pick_season ?? "unknown"}:${asset.pick_round ?? 1}:slot:${asset.pick_slot}${ownerKey}`;
  }
  return `pick:${asset.pick_season ?? "unknown"}:${asset.pick_round ?? 1}:tier:${asset.pick_tier ?? "mid"}${ownerKey}`;
}

function duplicateWarnings(
  assets: TradeAssetInput[],
  side: TradeSide
): TradeValuationWarning[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const key = tradeAssetKey(asset);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([assetKey]) => ({
      type: "duplicate_asset" as const,
      severity: "warning" as const,
      side,
      asset_key: assetKey,
      message: `Duplicate asset detected on ${side === "sideA" ? "Side A" : "Side B"}: ${assetKey}.`,
    }));
}

export function validateTradeAssets(
  sideA: TradeAssetInput[],
  sideB: TradeAssetInput[]
): TradeValuationWarning[] {
  const warnings: TradeValuationWarning[] = [];

  if (sideA.length === 0) {
    warnings.push({
      type: "empty_side",
      severity: "block",
      side: "sideA",
      message: "Side A is empty; both sides are required for trade evaluation.",
    });
  }
  if (sideB.length === 0) {
    warnings.push({
      type: "empty_side",
      severity: "block",
      side: "sideB",
      message: "Side B is empty; both sides are required for trade evaluation.",
    });
  }

  warnings.push(...duplicateWarnings(sideA, "sideA"));
  warnings.push(...duplicateWarnings(sideB, "sideB"));

  const sideAKeys = new Set(sideA.map(tradeAssetKey));
  for (const asset of sideB) {
    const key = tradeAssetKey(asset);
    if (sideAKeys.has(key)) {
      warnings.push({
        type: "duplicate_asset",
        severity: "warning",
        side: "both",
        asset_key: key,
        message: `The same asset appears on both sides: ${key}.`,
      });
    }
  }

  return warnings;
}
