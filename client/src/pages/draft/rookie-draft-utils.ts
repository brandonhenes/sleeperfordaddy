import type { Prospect } from "@shared/types";
import { MYBOARD_KEY, WATCHLIST_KEY, type MyBoardState } from "./rookie-draft-config";

export function cleanText(val: string | null | undefined): string | null {
  if (val == null) return null;
  const t = val.trim();
  if (!t || t.toLowerCase() === "null") return null;
  return t;
}

export function scoutingReport(p: Prospect): string | null {
  return cleanText(p.scouting_notes) ?? cleanText(p.fp_scouting_notes) ?? cleanText(p.notes);
}

export function formatMarketNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return "-";
  return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
}

export function loadWatchlist(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    // Ignore malformed local storage.
  }
  return new Set();
}

export function loadMyBoard(): MyBoardState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MYBOARD_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore malformed local storage.
  }
  return {};
}
