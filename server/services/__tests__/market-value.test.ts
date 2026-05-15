import { describe, expect, it } from "vitest";
import { calculateMarketValueFromSources } from "../market-value.js";
import type { GlobalScaleParams } from "../composite-values.js";

const scale: GlobalScaleParams = {
  fc: { floor: 1, max: 10_000 },
  ktc: { floor: 1, max: 10_000 },
  dp: { floor: 1, max: 10_000 },
};

describe("calculateMarketValueFromSources", () => {
  it("blends usable raw market sources with configured weights", () => {
    const result = calculateMarketValueFromSources(
      {
        edgeScore: 80,
        fcValue: 8_000,
        ktcValue: 6_000,
        dpValue: null,
      },
      scale,
      { fc: 60, ktc: 40, dp: 0 }
    );

    expect(result.marketValueSource).toBe("raw_sources");
    expect(result.marketValue).toBe(7_200);
    expect(result.sourceMarketValues.fc).toBe(8_000);
    expect(result.sourceMarketValues.ktc).toBe(6_000);
    expect(result.calculationReasons[0]).toContain("blended 2");
  });

  it("falls back to Edge value with an explainable warning when sources are missing", () => {
    const result = calculateMarketValueFromSources(
      {
        edgeScore: 70,
        fcValue: null,
        ktcValue: null,
        dpValue: null,
      },
      scale
    );

    expect(result.marketValueSource).toBe("edge_fallback");
    expect(result.marketValue).toBeGreaterThan(0);
    expect(result.fallbackWarnings).toContain("No usable raw market sources were available; Edge fallback was used.");
  });
});
