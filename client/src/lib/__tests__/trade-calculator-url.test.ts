import { describe, expect, it } from "vitest";
import { buildTradeCalculatorUrl, parseTradeCalculatorQuery } from "../trade-calculator-url";

describe("trade calculator URL helpers", () => {
  it("round-trips a finder lane into calculator state", () => {
    const url = buildTradeCalculatorUrl({
      username: "henes35",
      leagueId: "league-1",
      opponentRosterId: 6,
      send: [
        { type: "player", player_id: "p1" },
        { type: "pick", pick_season: "2027", pick_round: 1, pick_tier: "late", pick_label: "2027 Late 1st" },
      ],
      receive: [{ type: "player", player_id: "p2" }],
      sendLabels: ["Kyler Murray", "2027 Late 1st"],
      receiveLabels: ["Lamar Jackson"],
      returnTo: "/trade-finder/henes35?mode=find&league=league-1&opponent=6&strategy=tier_down",
    });

    const parsed = parseTradeCalculatorQuery(url.split("?")[1]);

    expect(parsed.leagueId).toBe("league-1");
    expect(parsed.username).toBe("henes35");
    expect(parsed.opponentRosterId).toBe(6);
    expect(parsed.send).toHaveLength(2);
    expect(parsed.receive).toEqual([{ type: "player", player_id: "p2" }]);
    expect(parsed.sendLabels).toEqual(["Kyler Murray", "2027 Late 1st"]);
    expect(parsed.receiveLabels).toEqual(["Lamar Jackson"]);
    expect(parsed.returnTo).toBe("/trade-finder/henes35?mode=find&league=league-1&opponent=6&strategy=tier_down");
  });

  it("ignores malformed package payloads", () => {
    const parsed = parseTradeCalculatorQuery("?league=abc&send=nope&receive=%7Bbad");

    expect(parsed.leagueId).toBe("abc");
    expect(parsed.send).toEqual([]);
    expect(parsed.receive).toEqual([]);
  });

  it("accepts a single asset object defensively", () => {
    const parsed = parseTradeCalculatorQuery(
      `?send=${encodeURIComponent(JSON.stringify({ type: "player", player_id: "4046" }))}&sendLabels=${encodeURIComponent(JSON.stringify("Christian McCaffrey"))}`
    );

    expect(parsed.send).toEqual([{ type: "player", player_id: "4046" }]);
    expect(parsed.sendLabels).toEqual(["Christian McCaffrey"]);
  });

  it("drops non-local return paths", () => {
    const url = buildTradeCalculatorUrl({
      returnTo: "https://example.com/trade-finder",
      send: [{ type: "player", player_id: "4046" }],
    });

    const parsed = parseTradeCalculatorQuery(`${url.split("?")[1] ?? ""}&returnTo=//evil.test`);

    expect(url).not.toContain("returnTo=");
    expect(parsed.returnTo).toBeNull();
  });
});
