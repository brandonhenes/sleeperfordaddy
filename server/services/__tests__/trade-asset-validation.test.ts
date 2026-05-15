import { describe, expect, it } from "vitest";
import { tradeAssetKey, validateTradeAssets } from "../trade-asset-validation.js";

describe("trade asset validation", () => {
  it("warns for empty sides and duplicate assets", () => {
    const warnings = validateTradeAssets(
      [{ type: "player", player_id: "123" }, { type: "player", player_id: "123" }],
      []
    );

    expect(warnings.some((warning) => warning.type === "empty_side")).toBe(true);
    expect(warnings.some((warning) => warning.type === "duplicate_asset")).toBe(true);
  });

  it("keeps exact-slot picks distinct from tier picks", () => {
    const exact = tradeAssetKey({
      type: "pick",
      pick_season: "2026",
      pick_round: 1,
      pick_slot: 2,
    });
    const tier = tradeAssetKey({
      type: "pick",
      pick_season: "2026",
      pick_round: 1,
      pick_tier: "early",
    });

    expect(exact).toBe("pick:2026:1:slot:2");
    expect(tier).toBe("pick:2026:1:tier:early");
    expect(exact).not.toBe(tier);
  });
});
