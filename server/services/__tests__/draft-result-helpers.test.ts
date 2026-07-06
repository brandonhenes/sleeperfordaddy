import { describe, expect, it } from "vitest";
import { resolveDraftPickRosterId } from "../draft-result-helpers.js";

describe("resolveDraftPickRosterId", () => {
  it("uses the direct Sleeper roster id when present", () => {
    expect(
      resolveDraftPickRosterId(
        { roster_id: 7, draft_slot: 2, picked_by: "owner-2" },
        { slot_to_roster_id: { "2": 12 } },
        new Map([["owner-2", 20]])
      )
    ).toBe(7);
  });

  it("falls back to slot_to_roster_id when Sleeper omits roster_id", () => {
    expect(
      resolveDraftPickRosterId(
        { roster_id: null, draft_slot: 2, picked_by: "owner-2" },
        { slot_to_roster_id: { "2": 12 } },
        new Map([["owner-2", 20]])
      )
    ).toBe(12);
  });

  it("falls back to picked_by owner mapping when slot mapping is missing", () => {
    expect(
      resolveDraftPickRosterId(
        { roster_id: null, draft_slot: 2, picked_by: "owner-2" },
        { slot_to_roster_id: null },
        new Map([["owner-2", 20]])
      )
    ).toBe(20);
  });

  it("returns null when no reliable roster mapping exists", () => {
    expect(
      resolveDraftPickRosterId(
        { roster_id: null, draft_slot: 2, picked_by: "owner-2" },
        { slot_to_roster_id: null },
        new Map()
      )
    ).toBeNull();
  });
});
