import type { AcceptanceResult } from "../../lib/acceptance";
import type { TradeEvaluation } from "@shared/types";
import type { OpponentContext } from "./types";

export function buildTradeMessage(
  result: TradeEvaluation,
  sendLabels: string[],
  receiveLabels: string[],
  opponent: OpponentContext | null,
  acceptance: AcceptanceResult | null
): string {
  const lines: string[] = [];
  lines.push("Hey, would you consider:");
  lines.push("");
  lines.push("My:");
  for (const label of sendLabels) lines.push(`  ${label}`);
  lines.push("For your:");
  for (const label of receiveLabels) lines.push(`  ${label}`);
  lines.push("");

  if (acceptance && acceptance.accept_reasons.length > 0) {
    const compelling = acceptance.accept_reasons.filter(
      (reason) => !reason.includes("Trade power") && !reason.includes("trade value") && !reason.includes("overpay")
    );
    if (compelling.length > 0) lines.push(`${compelling[0]}.`);
  }

  if (opponent) {
    const sendPositions = result.sideA.assets
      .map((asset) => asset.position)
      .filter((position): position is string => position != null);
    const matchedNeed = sendPositions.find((position) => opponent.needs.includes(position));
    if (matchedNeed) lines.push(`This gets you ${matchedNeed} help you could use.`);
  }

  return lines.join("\n");
}
