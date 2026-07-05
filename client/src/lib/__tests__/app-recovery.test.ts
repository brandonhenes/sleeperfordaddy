import { describe, expect, it } from "vitest";
import { isRecoverableAppLoadError } from "../app-recovery";

describe("app recovery", () => {
  it("detects stale dynamic import and chunk failures", () => {
    expect(isRecoverableAppLoadError(new Error("Failed to fetch dynamically imported module"))).toBe(true);
    expect(isRecoverableAppLoadError(new Error("Loading chunk 17 failed"))).toBe(true);
    expect(isRecoverableAppLoadError("ChunkLoadError: route bundle missing")).toBe(true);
  });

  it("does not classify normal render errors as recoverable app loads", () => {
    expect(isRecoverableAppLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isRecoverableAppLoadError("Request failed with status 500")).toBe(false);
  });
});
