import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getDynastyLeagueIdsForUserLatestSeason: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({
  db: { execute: mocks.execute },
}));

vi.mock("../dynasty-leagues.js", () => ({
  getDynastyLeagueIdsForUserLatestSeason: mocks.getDynastyLeagueIdsForUserLatestSeason,
}));

import { getInjuredPlayers } from "../injury-tracker.js";

function sqlText(value: unknown): string {
  if (value == null || typeof value === "string") return "";
  if (Array.isArray(value)) return value.map(sqlText).join("");
  if (typeof value !== "object") return "";

  const withValue = value as { value?: unknown; queryChunks?: unknown };
  if (Array.isArray(withValue.value)) {
    return withValue.value.join("");
  }
  if (Array.isArray(withValue.queryChunks)) {
    return withValue.queryChunks.map(sqlText).join("");
  }
  return "";
}

describe("injury tracker service", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.getDynastyLeagueIdsForUserLatestSeason.mockReset();
  });

  it("scopes injured player exposure to the user's current dynasty rosters", async () => {
    mocks.getDynastyLeagueIdsForUserLatestSeason.mockResolvedValue(["league-1", "league-2", "league-3"]);
    mocks.execute
      .mockResolvedValueOnce([{ user_id: "user-1" }])
      .mockResolvedValueOnce([
        {
          full_name: "Test Player",
          position: "WR",
          team: "MIN",
          injury_type: "Hamstring",
          injury_date: "2026-06-01",
          expected_return_date: null,
          estimated_healthy_date: "2026-08-01",
          return_label: "Training camp",
          avg_recovery_weeks: 3,
          recovery_pace: "On track",
          expected_return_weeks: 3,
          notes: "Expected back for camp",
          status: "active",
          created_at: "2026-06-01",
          updated_at: "2026-06-02",
          player_id: "player-1",
          current_team: "MIN",
          league_count: 2,
        },
      ]);

    const result = await getInjuredPlayers("henes35");

    expect(mocks.getDynastyLeagueIdsForUserLatestSeason).toHaveBeenCalledWith("user-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      player_id: "player-1",
      league_count: 2,
      total_leagues: 3,
      exposure_pct: 67,
    });

    const exposureQuery = sqlText(mocks.execute.mock.calls[1]?.[0]);
    expect(exposureQuery).toContain("JOIN roster_players rp");
    expect(exposureQuery).toContain("rp.owner_id =");
    expect(exposureQuery).toContain("rp.league_id IN");
    expect(exposureQuery).not.toContain("JOIN user_leagues");
  });
});
