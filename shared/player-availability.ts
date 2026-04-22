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

  // Special statuses take precedence — these are roster-situation signals Sleeper does track reliably
  if (status === "Injured Reserve") return "injured_reserve";
  if (status === "Physically Unable to Perform" || status === "Non Football Injury") return "pup";
  if (status === "Practice Squad") return "practice_squad";

  // Team presence is the reliable signal for Active vs FA/Retired.
  // Sleeper's `status` field is noisy — it reports Thielen, Carr, Cooper as "Active" despite being FA/retired.
  if (team) return "active";

  // No team. Use ranking-source coverage to distinguish UFA-who-still-has-value
  // (Deebo, Jennings in April) from retired/washed (Thielen, Cooper).
  if (hasMarketValue) return "unsigned_fa";
  return status ? "retired_washed" : "unknown";
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
