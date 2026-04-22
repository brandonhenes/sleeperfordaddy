/**
 * Derived player availability state used to render badges and decide whether
 * a player contributes to portfolio value totals. Combines Sleeper's coarse
 * `status` field with team + ranking-source coverage to distinguish:
 *
 *   - active players on an NFL roster
 *   - IR/PUP/Practice Squad (temporarily out, still valuable)
 *   - unsigned UFAs the market still values (Deebo Samuel in April)
 *   - retired / washed players with no remaining market value
 */

export type PlayerAvailability =
  | "active"
  | "injured_reserve"
  | "pup"
  | "practice_squad"
  | "unsigned_fa"
  | "retired_washed"
  | "unknown";

export interface AvailabilityInput {
  status: string | null | undefined;
  team: string | null | undefined;
  sources_available: number;
}

export function getPlayerAvailability(input: AvailabilityInput): PlayerAvailability {
  const status = input.status ?? null;
  const team = input.team && input.team.trim() !== "" ? input.team : null;
  const hasMarketValue = input.sources_available > 0;

  if (status === "Injured Reserve") return "injured_reserve";
  if (status === "Physically Unable to Perform" || status === "Non Football Injury") return "pup";
  if (status === "Practice Squad") return "practice_squad";

  if (status === "Active") {
    // On an active roster. Missing team is unusual but we still treat as active.
    return "active";
  }

  if (status === "Inactive") {
    // Sleeper lumps UFAs, retirees, and cuts as "Inactive". Use ranking-source
    // coverage to distinguish: if FC/DP/FP still price the player, the market
    // considers them valuable (unsigned UFA). If everyone has dropped them,
    // they're retired/washed.
    return hasMarketValue ? "unsigned_fa" : "retired_washed";
  }

  // Null / unrecognized status — fall back to coverage heuristic
  if (!status) {
    return hasMarketValue ? "active" : "unknown";
  }

  return "unknown";
}

/**
 * Should this player's value roll up into portfolio totals?
 * Retired/washed and Unknown-no-value players are excluded; everyone else counts.
 */
export function contributesToPortfolioValue(availability: PlayerAvailability): boolean {
  return availability !== "retired_washed" && availability !== "unknown";
}

export interface AvailabilityBadge {
  label: string;
  tone: "neutral" | "info" | "warning" | "muted" | "danger";
  tooltip: string;
}

export function describeAvailability(availability: PlayerAvailability): AvailabilityBadge | null {
  switch (availability) {
    case "active":
      return null; // No badge for the normal case
    case "injured_reserve":
      return { label: "IR", tone: "warning", tooltip: "Injured Reserve — still counts toward team value" };
    case "pup":
      return { label: "PUP", tone: "warning", tooltip: "PUP / NFI — still counts toward team value" };
    case "practice_squad":
      return { label: "PS", tone: "info", tooltip: "Practice Squad" };
    case "unsigned_fa":
      return { label: "UFA", tone: "info", tooltip: "Unsigned free agent — market still values them" };
    case "retired_washed":
      return { label: "INACTIVE", tone: "muted", tooltip: "No team + no market value — excluded from totals" };
    case "unknown":
      return { label: "?", tone: "muted", tooltip: "Status unknown" };
  }
}
