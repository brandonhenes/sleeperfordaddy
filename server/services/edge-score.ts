// ─── Types ───

export interface EdgeScore {
  score: number;           // 39-99, or 0 if unscored
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  sources_used: number;
}

interface PlayerInput {
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
  const valid = values.filter((v) => v > 0);
  if (valid.length < 2) return null;

  let max: number;
  let floor: number;

  if (override && override.max > override.floor && override.floor > 0) {
    max = override.max;
    floor = override.floor;
  } else {
    const sorted = [...valid].sort((a, b) => a - b);
    max = sorted[sorted.length - 1];
    // 5th percentile from bottom = "barely rosterable" line
    const floorIdx = Math.floor(sorted.length * 0.05);
    floor = sorted[floorIdx];
  }

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
  return Math.max(39, Math.min(99, Math.round(39 + raw * 60)));
}

// ─── Main ───

export function computeEdgeScores(
  players: PlayerInput[],
  scaleOverride?: {
    fc?: { floor: number; max: number };
    ktc?: { floor: number; max: number };
    dp?: { floor: number; max: number };
  }
): Map<string, EdgeScore> {
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

    const scores = [fcScore, ktcScore, dpScore].filter(
      (s): s is number => s != null
    );
    const sourcesUsed = scores.length;

    let score = 0;
    if (sourcesUsed > 0) {
      score = Math.round(
        scores.reduce((s, v) => s + v, 0) / sourcesUsed
      );
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
