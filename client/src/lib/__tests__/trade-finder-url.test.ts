import { describe, expect, it } from "vitest";
import { buildTradeFinderUrl, parseTradeFinderQuery } from "../trade-finder-url";

describe("trade finder URL helpers", () => {
  it("parses scout deep links with league and opponent", () => {
    const parsed = parseTradeFinderQuery("?mode=scout&league=12345&opponent=7");

    expect(parsed).toMatchObject({
      mode: "scout",
      leagueId: "12345",
      opponentRosterId: 7,
      invalidOpponentParam: null,
    });
  });

  it("supports rosterId as a defensive opponent alias", () => {
    const parsed = parseTradeFinderQuery("mode=scout&league=abc&rosterId=3");

    expect(parsed.opponentRosterId).toBe(3);
  });

  it("supports opponentRosterId as a defensive opponent alias", () => {
    const parsed = parseTradeFinderQuery("mode=find&league=abc&opponentRosterId=6");

    expect(parsed.mode).toBe("find");
    expect(parsed.opponentRosterId).toBe(6);
  });

  it("keeps missing params null instead of throwing", () => {
    const parsed = parseTradeFinderQuery("?mode=scout");

    expect(parsed.mode).toBe("scout");
    expect(parsed.leagueId).toBeNull();
    expect(parsed.opponentRosterId).toBeNull();
    expect(parsed.invalidOpponentParam).toBeNull();
  });

  it("flags invalid opponent params", () => {
    const parsed = parseTradeFinderQuery("?mode=scout&league=123&opponent=nope");

    expect(parsed.opponentRosterId).toBeNull();
    expect(parsed.invalidOpponentParam).toBe("nope");
  });

  it("builds scout exploit deep links", () => {
    const url = buildTradeFinderUrl("Brandon Henes", {
      mode: "scout",
      leagueId: "league-1",
      opponentRosterId: 12,
    });

    expect(url).toBe("/trade-finder/Brandon%20Henes?mode=scout&league=league-1&opponent=12");
  });

  it("round-trips find steering controls", () => {
    const url = buildTradeFinderUrl("Brandon Henes", {
      mode: "find",
      leagueId: "league-1",
      opponentRosterId: 12,
      targetPlayerId: "player-9",
      avoidTargetPlayerIds: ["player-1", "player-2"],
      constraints: ["more_realistic", "no_qbs"],
      strategyFocus: "tier_down",
      searchDepth: "deep",
    });

    const parsed = parseTradeFinderQuery(url.split("?")[1]);

    expect(parsed).toMatchObject({
      mode: "find",
      leagueId: "league-1",
      opponentRosterId: 12,
      targetPlayerId: "player-9",
      avoidTargetPlayerIds: ["player-1", "player-2"],
      constraints: ["more_realistic", "no_qbs"],
      strategyFocus: "tier_down",
      searchDepth: "deep",
    });
  });
});
