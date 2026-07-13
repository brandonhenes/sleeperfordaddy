import { describe, expect, it } from "vitest";
import {
  buildCompactPlayerWeekPoints,
  buildCompactTeamWeekMap,
} from "../trade-matchup-context.js";

describe("compact trade matchup context", () => {
  it("stores one team summary while preserving roster and starter membership", () => {
    const map = buildCompactTeamWeekMap([
      {
        league_id: "league-1",
        season: 2025,
        week: 1,
        roster_id: 3,
        player_ids: ["qb-1", "rb-1", "wr-1"],
        starter_ids: ["qb-1", "rb-1"],
        opponent_roster_id: 4,
        opponent_total: 101.5,
        league_median: 98.2,
        roster_total: 112.4,
      },
    ]);

    const summary = map.get("league-1:2025:1:3");
    expect(summary?.roster_total).toBe(112.4);
    expect(summary?.playerIds.has("wr-1")).toBe(true);
    expect(summary?.starterIds.has("wr-1")).toBe(false);
    expect(summary?.starterIds.has("qb-1")).toBe(true);
  });

  it("uses the exact point map assigned to each league scoring profile", () => {
    const points = buildCompactPlayerWeekPoints(
      [
        { league_id: "ppr", profile_id: 1 },
        { league_id: "half-ppr", profile_id: 2 },
      ],
      [
        { profile_id: 1, season: 2025, week: 1, points: { "wr-1": 22 } },
        { profile_id: 2, season: 2025, week: 1, points: { "wr-1": 15 } },
      ],
      ["wr-1"]
    );

    expect(points.get("ppr:2025:1:wr-1")).toBe(22);
    expect(points.get("half-ppr:2025:1:wr-1")).toBe(15);
  });

  it("preserves exact special-position points in the same profile map", () => {
    const points = buildCompactPlayerWeekPoints(
      [{ league_id: "idp", profile_id: 3 }],
      [
        {
          profile_id: 3,
          season: 2025,
          week: 2,
          points: { "lb-1": 14.75 },
        },
      ],
      ["lb-1"]
    );

    expect(points.get("idp:2025:2:lb-1")).toBe(14.75);
  });

  it("applies a league-specific override when nominally shared profiles disagree", () => {
    const points = buildCompactPlayerWeekPoints(
      [
        { league_id: "league-a", profile_id: 4 },
        { league_id: "league-b", profile_id: 4 },
      ],
      [{ profile_id: 4, season: 2025, week: 3, points: { "wr-1": 12 } }],
      ["wr-1"],
      [{ league_id: "league-b", season: 2025, week: 3, points: { "wr-1": 15 } }]
    );

    expect(points.get("league-a:2025:3:wr-1")).toBe(12);
    expect(points.get("league-b:2025:3:wr-1")).toBe(15);
  });
});
