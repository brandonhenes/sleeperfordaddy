const STORAGE_KEY = "edge-source-weights";

interface Weights {
  fc: number;
  ktc: number;
  dp: number;
}

export function getStoredWeights(): Weights {
  if (typeof window === "undefined") return { fc: 1, ktc: 1, dp: 1 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.fc === "number" && typeof parsed.ktc === "number" && typeof parsed.dp === "number") {
        return parsed;
      }
    }
  } catch {
    // ignore malformed storage
  }
  return { fc: 1, ktc: 1, dp: 1 };
}

export function weightQueryParams(): string {
  const w = getStoredWeights();
  if (w.fc === 1 && w.ktc === 1 && w.dp === 1) return "";
  return `&fc_w=${w.fc}&ktc_w=${w.ktc}&dp_w=${w.dp}`;
}
