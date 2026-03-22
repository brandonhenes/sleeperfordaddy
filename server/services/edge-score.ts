// ─── Types ───

export interface EdgeScore {
  score: number;           // 39-99, or 0 if unscored
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  sources_used: number;
}

export interface PlayerInput {
  sleeper_id: string;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
}

// ─── Log-Scale Math ───

interface SourceParams {
  logMax: number;
  logFloor: number;
}

function computeSourceParams(
  values: number[],
  override?: { floor: number; max: number }
): SourceParams | null {
  if (override && override.max > override.floor && override.floor > 0) {
    const logMax = Math.log(override.max);
    const logFloor = Math.log(override.floor);
    if (logMax > logFloor) {
      return { logMax, logFloor };
    }
  }

  const valid = values.filter((v) => v > 0);
  if (valid.length < 2) return null;

  let max: number;
  let floor: number;
  const sorted = [...valid].sort((a, b) => a - b);
  max = sorted[sorted.length - 1];
  // 5th percentile from bottom = "barely rosterable" line
  const floorIdx = Math.floor(sorted.length * 0.05);
  floor = sorted[floorIdx];

  if (floor <= 0 || max <= floor) return null;
  const logMax = Math.log(max);
  const logFloor = Math.log(floor);
  if (logMax <= logFloor) return null;

  return { logMax, logFloor };
}

function scoreValue(value: number, params: SourceParams): number {
  if (value <= 0) return 39;
  const logVal = Math.log(value);
  const raw = (logVal - params.logFloor) / (params.logMax - params.logFloor);
  return Math.max(39, Math.min(99, Math.round((39 + raw * 60) * 10) / 10));
}

// ─── Main ───

export interface SourceWeights {
  fc: number;
  ktc: number;
  dp: number;
}

export const DEFAULT_SOURCE_WEIGHTS: SourceWeights = {
  fc: 35,
  ktc: 20,
  dp: 45,
};

export function normalizeSourceWeights(
  weights?: Partial<SourceWeights> | null
): SourceWeights {
  const fc = Number(weights?.fc);
  const ktc = Number(weights?.ktc);
  const dp = Number(weights?.dp);

  if (![fc, ktc, dp].every((value) => Number.isFinite(value) && value >= 0)) {
    return { ...DEFAULT_SOURCE_WEIGHTS };
  }

  if (fc + ktc + dp <= 0) {
    return { ...DEFAULT_SOURCE_WEIGHTS };
  }

  return { fc, ktc, dp };
}

export function areDefaultSourceWeights(
  weights?: Partial<SourceWeights> | null
): boolean {
  const normalized = normalizeSourceWeights(weights);
  return normalized.fc === DEFAULT_SOURCE_WEIGHTS.fc
    && normalized.ktc === DEFAULT_SOURCE_WEIGHTS.ktc
    && normalized.dp === DEFAULT_SOURCE_WEIGHTS.dp;
}

export function sourceWeightsKey(
  weights?: Partial<SourceWeights> | null
): string {
  const normalized = normalizeSourceWeights(weights);
  return `${normalized.fc}-${normalized.ktc}-${normalized.dp}`;
}

export function computeEdgeScores(
  players: PlayerInput[],
  scaleOverride?: {
    fc?: { floor: number; max: number };
    ktc?: { floor: number; max: number };
    dp?: { floor: number; max: number };
  },
  weights?: SourceWeights
): Map<string, EdgeScore> {
  const effectiveWeights = normalizeSourceWeights(weights);
  // Compute per-source scale parameters from all players
  const fcParams = computeSourceParams(
    players.map((p) => p.fc_value).filter((v): v is number => v != null),
    scaleOverride?.fc
  );
  const ktcParams = computeSourceParams(
    players.map((p) => p.ktc_value).filter((v): v is number => v != null),
    scaleOverride?.ktc
  );
  const dpParams = computeSourceParams(
    players.map((p) => p.dp_value).filter((v): v is number => v != null),
    scaleOverride?.dp
  );

  const result = new Map<string, EdgeScore>();

  for (const p of players) {
    const fcScore =
      p.fc_value != null && p.fc_value > 0 && fcParams
        ? scoreValue(p.fc_value, fcParams)
        : null;
    const ktcScore =
      p.ktc_value != null && p.ktc_value > 0 && ktcParams
        ? scoreValue(p.ktc_value, ktcParams)
        : null;
    const dpScore =
      p.dp_value != null && p.dp_value > 0 && dpParams
        ? scoreValue(p.dp_value, dpParams)
        : null;

    const scored: { value: number; weight: number }[] = [];
    if (fcScore != null) scored.push({ value: fcScore, weight: effectiveWeights.fc });
    if (ktcScore != null) scored.push({ value: ktcScore, weight: effectiveWeights.ktc });
    if (dpScore != null) scored.push({ value: dpScore, weight: effectiveWeights.dp });
    const sourcesUsed = scored.length;

    let score = 0;
    if (sourcesUsed > 0) {
      const totalWeight = scored.reduce((s, e) => s + e.weight, 0);
      score = totalWeight > 0
        ? Math.round((scored.reduce((s, e) => s + e.value * e.weight, 0) / totalWeight) * 10) / 10
        : Math.round((scored.reduce((s, e) => s + e.value, 0) / sourcesUsed) * 10) / 10;
      score = Math.max(39, Math.min(99, score));
    }

    result.set(p.sleeper_id, {
      score,
      fc_score: fcScore,
      ktc_score: ktcScore,
      dp_score: dpScore,
      sources_used: sourcesUsed,
    });
  }

  return result;
}
