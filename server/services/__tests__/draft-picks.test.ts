import { describe, expect, it } from "vitest";
import {
  buildDraftPickInventory,
  type SleeperTradedPick,
} from "../draft-picks.js";

describe("draft pick inventory", () => {
  it("omits picks for completed draft seasons because they have become players", () => {
    const picks = buildDraftPickInventory(12, 3, [], {
      currentYear: 2026,
      completedDraftSeasons: new Set(["2026"]),
    });

    expect(picks.some((pick) => pick.season === "2026")).toBe(false);
    expect(picks.some((pick) => pick.season === "2027")).toBe(true);
    expect(picks.some((pick) => pick.season === "2028")).toBe(true);
  });

  it("keeps current-year picks when the draft has not completed", () => {
    const picks = buildDraftPickInventory(12, 3, [], {
      currentYear: 2026,
      completedDraftSeasons: new Set(),
    });

    expect(picks.some((pick) => pick.season === "2026")).toBe(true);
  });

  it("preserves future traded pick ownership while ignoring completed-season trades", () => {
    const tradedPicks: SleeperTradedPick[] = [
      {
        season: "2026",
        round: 1,
        roster_id: 5,
        owner_id: 7,
        previous_owner_id: 5,
      },
      {
        season: "2027",
        round: 1,
        roster_id: 5,
        owner_id: 7,
        previous_owner_id: 5,
      },
    ];

    const picks = buildDraftPickInventory(12, 3, tradedPicks, {
      currentYear: 2026,
      completedDraftSeasons: new Set(["2026"]),
    });

    expect(
      picks.find((pick) => pick.season === "2026" && pick.original_owner_id === 5)
    ).toBeUndefined();
    expect(
      picks.find((pick) => pick.season === "2027" && pick.original_owner_id === 5 && pick.round === 1)
        ?.roster_id
    ).toBe(7);
  });
});
