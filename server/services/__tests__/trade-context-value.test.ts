import { describe, expect, it } from "vitest";
import {
  calculateTradeContext,
  packageDiscountIndicatorPct,
  retainedPackageMarketValue,
} from "../trade-context-value.js";

describe("trade context value", () => {
  it("rewards a one-elite-asset side against a package of smaller assets", () => {
    const result = calculateTradeContext([9_500], [3_500, 3_200, 2_800]);

    expect(result.sideA.finalTotal).toBeGreaterThan(result.sideB.finalTotal);
    expect(result.valueAdjustmentSide).toBe("sideA");
    expect(result.consolidationWarning).toContain("Package discount");
    expect(result.sideB.packagePenaltyPct).toBeGreaterThan(0);
  });

  it("uses shared package discount helpers for compatibility callers", () => {
    expect(packageDiscountIndicatorPct(1)).toBe(0);
    expect(packageDiscountIndicatorPct(3)).toBeGreaterThan(0);
    expect(retainedPackageMarketValue([5_000, 4_000, 3_000])).toBe(9_150);
  });
});
