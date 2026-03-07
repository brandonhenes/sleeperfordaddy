export interface AcceptanceResult {
  probability: number;
  label: "Likely" | "Possible" | "Unlikely" | "Hard";
  accept_reasons: string[];
  reject_reasons: string[];
}

export function computeAcceptance(params: {
  fairness: "fair" | "slight_edge" | "lopsided";
  delta: number;
  sendAssets: { player_id?: string | null; position?: string | null }[];
  receiveAssets: { player_id?: string | null; position?: string | null }[];
  opponent: {
    archetype: string;
    needs: string[];
    top_player_ids_by_pos: Record<string, string>;
    behavior: {
      total_trades: number;
      recent_trades: number;
      preferred_structure: string;
      is_active: boolean;
      last_trade_days_ago: number | null;
      bias_flags: string[];
      top_acquired_positions: string[];
    } | null;
  } | null;
}): AcceptanceResult | null {
  const { fairness, delta, sendAssets, receiveAssets, opponent } = params;
  if (!opponent || sendAssets.length === 0 || receiveAssets.length === 0) return null;

  let prob = 50;
  const accept: string[] = [];
  const reject: string[] = [];
  const behavior = opponent.behavior;

  if (fairness === "fair") {
    prob += 15;
    accept.push("Trade power is balanced");
  } else if (fairness === "slight_edge") {
    if (delta > 0) {
      prob += 20;
      accept.push("You're slightly overpaying. They get the better end.");
    } else {
      prob -= 8;
      reject.push("They're giving up slightly more value");
    }
  } else if (fairness === "lopsided") {
    if (delta > 0) {
      prob += 30;
      accept.push("Massive overpay in their favor. They'll take this immediately.");
    } else {
      prob -= 35;
      reject.push("Significantly underpaying. They won't consider this.");
    }
  }

  const sendPositions = sendAssets.map((a) => a.position).filter(Boolean) as string[];
  const fillsNeed = sendPositions.some((pos) => opponent.needs.includes(pos));
  if (fillsNeed) { prob += 15; accept.push("Fills a real positional need"); }
  else { prob -= 5; reject.push("Does not address a clear need"); }

  const theirTopIds = Object.values(opponent.top_player_ids_by_pos);
  const receivingTheirBest = receiveAssets.some((a) => a.player_id && theirTopIds.includes(a.player_id));
  if (receivingTheirBest) { prob -= 15; reject.push("Targeting their top starter. Hard to pry loose."); }

  if (behavior && behavior.total_trades >= 3) {
    if (sendAssets.length > 1 && behavior.preferred_structure === "1-for-1") {
      prob -= 12; reject.push("They prefer 1-for-1, not packages");
    }
    if (sendAssets.length === 1 && receiveAssets.length === 1 && behavior.preferred_structure === "1-for-1") {
      prob += 8; accept.push("Matches their 1-for-1 preference");
    }
    if (sendAssets.length > 1 && behavior.preferred_structure === "packages") {
      prob += 5; accept.push("Comfortable with multi-asset deals");
    }
    if (!behavior.is_active) {
      prob -= 10; reject.push(`Inactive for ${behavior.last_trade_days_ago ?? "90+"}+ days`);
    }
    if (behavior.recent_trades >= 3) { prob += 5; accept.push("Very active trader"); }
    const matchesHistory = sendPositions.some((pos) => behavior.top_acquired_positions.includes(pos));
    if (matchesHistory) { prob += 5; accept.push("Historically acquires this position"); }
  } else if (!behavior || behavior.total_trades === 0) {
    prob -= 10; reject.push("No trade history. Hard to engage.");
  }

  if (opponent.archetype === "Rebuilder" || opponent.archetype === "Productive Struggle") {
    accept.push("Rebuilders move proven assets for future value");
  }
  if (opponent.archetype === "Dynasty Juggernaut") { prob -= 5; reject.push("Juggernauts rarely need to trade"); }

  prob = Math.max(5, Math.min(95, prob));
  let label: AcceptanceResult["label"];
  if (prob >= 60) label = "Likely";
  else if (prob >= 40) label = "Possible";
  else if (prob >= 25) label = "Unlikely";
  else label = "Hard";

  return { probability: prob, label, accept_reasons: accept, reject_reasons: reject };
}
