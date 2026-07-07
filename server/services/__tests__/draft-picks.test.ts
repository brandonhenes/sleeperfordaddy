import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getLeagueDrafts: vi.fn(),
  getDraftPicks: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({
  db: { execute: mocks.execute },
}));

vi.mock("../../sleeper/drafts.js", () => ({
  getLeagueDrafts: mocks.getLeagueDrafts,
  getDraftPicks: mocks.getDraftPicks,
}));

import {
  buildDraftPickInventory,
  getCompletedRookieDraftSeasons,
  mergeLiveCompletedDraftSeasonsByLeague,
  mergeCompletedDraftSeasons,
  type SleeperTradedPick,
} from "../draft-picks.js";

describe("draft pick inventory", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.getLeagueDrafts.mockReset();
    mocks.getDraftPicks.mockReset();
  });

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

  it("merges completed draft seasons from live and persisted sources", () => {
    const seasons = mergeCompletedDraftSeasons(
      new Set(["2026", ""]),
      ["2027", " 2028 "]
    );

    expect([...seasons].sort()).toEqual(["2026", "2027", "2028"]);
  });

  it("fills missing current completed draft seasons from live Sleeper status", async () => {
    mocks.getLeagueDrafts.mockResolvedValueOnce([
      { season: "2026", status: "complete", settings: { rounds: 4 } },
      { season: "2025", status: "complete", settings: { rounds: 20 } },
    ]);

    const seasons = await mergeLiveCompletedDraftSeasonsByLeague(
      [
        { leagueId: "already-persisted", currentSeason: "2026" },
        { leagueId: "missing-persisted", currentSeason: "2026" },
      ],
      new Map([["already-persisted", new Set(["2026"])]]),
      { concurrency: 1 }
    );

    expect(mocks.getLeagueDrafts).toHaveBeenCalledTimes(1);
    expect(mocks.getLeagueDrafts).toHaveBeenCalledWith("missing-persisted");
    expect([...(seasons.get("already-persisted") ?? [])]).toEqual(["2026"]);
    expect([...(seasons.get("missing-persisted") ?? [])]).toEqual(["2026"]);
  });

  it("uses persisted draft results when Sleeper completed draft lookup fails", async () => {
    mocks.getLeagueDrafts.mockRejectedValue(new Error("Sleeper unavailable"));
    mocks.execute
      .mockResolvedValueOnce([{ table_name: "league_draft_results" }])
      .mockResolvedValueOnce([{ season: "2026" }]);

    const seasons = await getCompletedRookieDraftSeasons("league-1");

    expect([...seasons]).toEqual(["2026"]);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("combines live completed drafts with persisted completed draft results", async () => {
    mocks.getLeagueDrafts.mockResolvedValue([
      { season: "2026", status: "complete", settings: { rounds: 4 } },
      { season: "2027", status: "drafting", settings: { rounds: 4 } },
      { season: "2025", status: "complete", settings: { rounds: 20 } },
    ]);
    mocks.execute
      .mockResolvedValueOnce([{ table_name: "league_draft_results" }])
      .mockResolvedValueOnce([{ season: "2027" }]);

    const seasons = await getCompletedRookieDraftSeasons("league-1");

    expect([...seasons].sort()).toEqual(["2026", "2027"]);
  });
});
