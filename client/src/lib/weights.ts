const STORAGE_KEY = "edge-source-weights";

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

function normalizeStoredWeights(value: unknown): SourceWeights {
  if (!value || typeof value !== "object") return { ...DEFAULT_SOURCE_WEIGHTS };

  const raw = value as Partial<Record<keyof SourceWeights, unknown>>;
  const fc = Number(raw.fc);
  const ktc = Number(raw.ktc);
  const dp = Number(raw.dp);

  if (![fc, ktc, dp].every((entry) => Number.isFinite(entry) && entry >= 0)) {
    return { ...DEFAULT_SOURCE_WEIGHTS };
  }

  if (fc === 1 && ktc === 1 && dp === 1) {
    return { ...DEFAULT_SOURCE_WEIGHTS };
  }

  if (Math.max(fc, ktc, dp) <= 1) {
    const migrated = {
      fc: Math.round(fc * 100),
      ktc: Math.round(ktc * 100),
      dp: Math.round(dp * 100),
    };
    if (migrated.fc + migrated.ktc + migrated.dp > 0) {
      return migrated;
    }
  }

  if (fc + ktc + dp <= 0) {
    return { ...DEFAULT_SOURCE_WEIGHTS };
  }

  return { fc, ktc, dp };
}

export function getStoredWeights(): SourceWeights {
  if (typeof window === "undefined") return { ...DEFAULT_SOURCE_WEIGHTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeStoredWeights(JSON.parse(raw));
    }
  } catch {
    // ignore malformed storage
  }
  return { ...DEFAULT_SOURCE_WEIGHTS };
}

export function writeStoredWeights(weights: SourceWeights) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeStoredWeights(weights)));
}

export function isDefaultSourceWeights(weights: SourceWeights): boolean {
  const normalized = normalizeStoredWeights(weights);
  return normalized.fc === DEFAULT_SOURCE_WEIGHTS.fc
    && normalized.ktc === DEFAULT_SOURCE_WEIGHTS.ktc
    && normalized.dp === DEFAULT_SOURCE_WEIGHTS.dp;
}

export function weightQueryParams(): string {
  const w = getStoredWeights();
  if (isDefaultSourceWeights(w)) return "";
  return `&fc_w=${w.fc}&ktc_w=${w.ktc}&dp_w=${w.dp}`;
}

export function toSettingsPayload(weights: SourceWeights) {
  const normalized = normalizeStoredWeights(weights);
  return {
    fc_weight: normalized.fc,
    ktc_weight: normalized.ktc,
    dp_weight: normalized.dp,
  };
}

export function fromSettingsPayload(payload?: {
  fc_weight: number;
  ktc_weight: number;
  dp_weight: number;
} | null): SourceWeights {
  if (!payload) return { ...DEFAULT_SOURCE_WEIGHTS };
  return normalizeStoredWeights({
    fc: payload.fc_weight,
    ktc: payload.ktc_weight,
    dp: payload.dp_weight,
  });
}
