export const BASELINE_SCORING: Record<string, number> = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  pass_2pt: 2,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  fum_lost: -2,
  fum: 0,
};

export function normalizeScoringSettings(
  scoringSettings: Record<string, unknown> | null | undefined
): Record<string, number> {
  if (!scoringSettings) return {};

  const normalized: Record<string, number> = {};
  for (const [key, raw] of Object.entries(scoringSettings)) {
    const value =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw)
          : NaN;
    if (Number.isFinite(value)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function calculateFantasyPoints(
  stats: Record<string, number>,
  scoringSettings: Record<string, number>,
  position: string
): number {
  let total = 0;

  for (const [key, statValue] of Object.entries(stats)) {
    if (statValue == null || statValue === 0) continue;

    let multiplier = scoringSettings[key] ?? 0;

    if (key === "rec" && position === "TE" && scoringSettings["bonus_rec_te"]) {
      multiplier += scoringSettings["bonus_rec_te"];
    }
    if (key === "rec" && position === "RB" && scoringSettings["bonus_rec_rb"]) {
      multiplier += scoringSettings["bonus_rec_rb"];
    }
    if (key === "rec" && position === "WR" && scoringSettings["bonus_rec_wr"]) {
      multiplier += scoringSettings["bonus_rec_wr"];
    }

    total += statValue * multiplier;
  }

  return total;
}

export function getScoringMultiplier(
  stats: Record<string, number>,
  leagueScoringSettings: Record<string, number>,
  position: string
): number {
  const baselinePoints = calculateFantasyPoints(stats, BASELINE_SCORING, position);
  const leaguePoints = calculateFantasyPoints(
    stats,
    leagueScoringSettings,
    position
  );

  if (baselinePoints <= 0) return 1;
  return leaguePoints / baselinePoints;
}
