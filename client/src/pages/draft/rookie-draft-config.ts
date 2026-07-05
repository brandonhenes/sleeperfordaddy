export const TIER_ORDER = ["elite", "day1", "day2", "day3", "flier"] as const;
export type TierKey = (typeof TIER_ORDER)[number];

export interface TierConfig {
  bg: string;
  text: string;
  label: string;
  border: string;
  headerBg: string;
}

export const TIER_CONFIG: Record<string, TierConfig> = {
  elite: { bg: "rgba(245,158,11,0.08)", text: "var(--warning)", label: "ELITE", border: "rgba(245,158,11,0.3)", headerBg: "rgba(245,158,11,0.12)" },
  ELITE: { bg: "rgba(245,158,11,0.08)", text: "var(--warning)", label: "ELITE", border: "rgba(245,158,11,0.3)", headerBg: "rgba(245,158,11,0.12)" },
  day1: { bg: "rgba(96,165,250,0.08)", text: "var(--blue)", label: "DAY 1", border: "rgba(96,165,250,0.3)", headerBg: "rgba(96,165,250,0.12)" },
  DAY1: { bg: "rgba(96,165,250,0.08)", text: "var(--blue)", label: "DAY 1", border: "rgba(96,165,250,0.3)", headerBg: "rgba(96,165,250,0.12)" },
  day2: { bg: "rgba(74,222,128,0.08)", text: "var(--green)", label: "DAY 2", border: "rgba(74,222,128,0.3)", headerBg: "rgba(74,222,128,0.12)" },
  DAY2: { bg: "rgba(74,222,128,0.08)", text: "var(--green)", label: "DAY 2", border: "rgba(74,222,128,0.3)", headerBg: "rgba(74,222,128,0.12)" },
  day3: { bg: "rgba(152,162,179,0.08)", text: "var(--text-dim)", label: "DAY 3", border: "rgba(152,162,179,0.3)", headerBg: "rgba(152,162,179,0.12)" },
  DAY3: { bg: "rgba(152,162,179,0.08)", text: "var(--text-dim)", label: "DAY 3", border: "rgba(152,162,179,0.3)", headerBg: "rgba(152,162,179,0.12)" },
  flier: { bg: "rgba(107,114,128,0.06)", text: "var(--text-muted)", label: "FLIER", border: "rgba(107,114,128,0.2)", headerBg: "rgba(107,114,128,0.08)" },
};

export const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE"] as const;
export const WATCHLIST_KEY = "edge-draft-watchlist";
export const MYBOARD_KEY = "edge-draft-myboard";

export interface MyBoardState {
  [prospectName: string]: string;
}
