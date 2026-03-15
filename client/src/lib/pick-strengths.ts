export interface ClassStrengthSettings {
  [season: string]: number;
}

const YEAR = new Date().getFullYear();
const STORAGE_KEY = "edge-pick-class-strengths";

export const DEFAULT_CLASS_STRENGTHS: ClassStrengthSettings = {
  [String(YEAR)]: 1.0,
  [String(YEAR + 1)]: 1.15,
  [String(YEAR + 2)]: 1.1,
  [String(YEAR + 3)]: 1.0,
};

export function classStrengthSeasons(): string[] {
  return [String(YEAR), String(YEAR + 1), String(YEAR + 2), String(YEAR + 3)];
}

function clamp(value: number): number {
  return Math.min(1.5, Math.max(0.7, value));
}

export function getStoredClassStrengths(): ClassStrengthSettings {
  if (typeof window === "undefined") return { ...DEFAULT_CLASS_STRENGTHS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CLASS_STRENGTHS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: ClassStrengthSettings = { ...DEFAULT_CLASS_STRENGTHS };
    for (const season of classStrengthSeasons()) {
      const value = parsed[season];
      if (typeof value === "number" && Number.isFinite(value)) {
        out[season] = clamp(value);
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_CLASS_STRENGTHS };
  }
}

export function saveClassStrengths(values: ClassStrengthSettings) {
  if (typeof window === "undefined") return;
  const normalized: ClassStrengthSettings = { ...DEFAULT_CLASS_STRENGTHS };
  for (const season of classStrengthSeasons()) {
    const value = values[season];
    normalized[season] = typeof value === "number" && Number.isFinite(value)
      ? clamp(value)
      : DEFAULT_CLASS_STRENGTHS[season];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function classStrengthQueryParams(): string {
  const strengths = getStoredClassStrengths();
  let query = "";
  for (const season of classStrengthSeasons()) {
    const value = strengths[season];
    if (value === DEFAULT_CLASS_STRENGTHS[season]) continue;
    query += `&cs_${season}=${value}`;
  }
  return query;
}
