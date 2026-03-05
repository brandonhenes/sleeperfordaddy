import { getFreeAgentGaps } from "./arbitrage.js";
import { getInjuredPlayers } from "./injury-tracker.js";
import { getBuyingWindows } from "./injury-tracker.js";

export interface Notification {
  id: string;
  type: "arbitrage" | "disagreement" | "injury" | "buying_window";
  title: string;
  message: string;
  player_name: string;
  position: string;
  severity: "high" | "medium" | "low";
}

export async function getNotifications(username: string): Promise<Notification[]> {
  const results: Notification[] = [];

  const [gaps, injured, windows] = await Promise.all([
    getFreeAgentGaps(username).catch(() => []),
    getInjuredPlayers(username).catch(() => []),
    getBuyingWindows(username).catch(() => []),
  ]);

  // Arbitrage alerts: high edge score + available in 2+ leagues
  for (const g of gaps) {
    if (g.edge_score >= 70 && g.free_count >= 2) {
      results.push({
        id: `arb-${g.player_id}`,
        type: "arbitrage",
        title: "Arbitrage Opportunity",
        message: `${g.full_name} (Edge ${Math.round(g.edge_score)}) is free in ${g.free_count} of your leagues`,
        player_name: g.full_name,
        position: g.position,
        severity: g.edge_score >= 80 ? "high" : "medium",
      });
    }
  }

  // Injury alerts: recently injured owned players
  for (const p of injured) {
    if (p.injury_start_date) {
      const daysSince = Math.floor(
        (Date.now() - new Date(p.injury_start_date).getTime()) / 86_400_000
      );
      if (daysSince <= 7) {
        results.push({
          id: `inj-${p.player_id}`,
          type: "injury",
          title: "New Injury",
          message: `${p.full_name} (${p.injury_status}) — ${p.injury_body_part ?? "unknown"}`,
          player_name: p.full_name,
          position: p.position,
          severity: p.injury_status === "IR" || p.injury_status === "PUP" ? "high" : "medium",
        });
      }
    }
  }

  // Source disagreement: owned players with low agreement + decent edge
  for (const p of injured) {
    if (p.value_change_pct != null && Math.abs(p.value_change_pct) >= 15 && p.current_edge_score >= 60) {
      results.push({
        id: `dis-${p.player_id}`,
        type: "disagreement",
        title: "Value Shift",
        message: `${p.full_name} edge score changed ${p.value_change_pct > 0 ? "+" : ""}${p.value_change_pct}%`,
        player_name: p.full_name,
        position: p.position,
        severity: Math.abs(p.value_change_pct) >= 25 ? "high" : "medium",
      });
    }
  }

  // Buying windows: high opportunity injured players on other rosters
  for (const w of windows) {
    if (w.opportunity_score >= 70) {
      results.push({
        id: `buy-${w.player.player_id}`,
        type: "buying_window",
        title: "Buying Window",
        message: `${w.player.full_name} (opp score ${w.opportunity_score}) — ${w.buy_reasons[0] ?? "value dip"}`,
        player_name: w.player.full_name,
        position: w.player.position,
        severity: w.opportunity_score >= 85 ? "high" : "medium",
      });
    }
  }

  // Sort: high severity first, then by type
  const sevOrder = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return results.slice(0, 20);
}
