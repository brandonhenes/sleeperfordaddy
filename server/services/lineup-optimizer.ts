import type { AgeCurveStatus } from "./age-curves.js";

// ─── Types ───

export interface PlayerForSlot {
  player_id: string;
  full_name: string;
  position: string;
  edge_score: number;
  age: number | null;
  age_curve: AgeCurveStatus;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
}

export interface SlottedPlayer extends PlayerForSlot {
  slot: string;
  slot_label: string;
  is_starter: boolean;
}

export interface SlotGrade {
  slot_label: string;
  avg_score: number;
  grade: "elite" | "strong" | "average" | "weak" | "hole";
  count: number;
}

export interface OptimizedLineup {
  starters: SlottedPlayer[];
  bench: SlottedPlayer[];
  slot_grades: SlotGrade[];
}

// ─── Slot Eligibility ───

const EXCLUDED_SLOTS = new Set(["DEF", "K", "BN", "IR", "TAXI"]);
const STARTER_SLOT_WHITELIST = new Set([
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "RB/WR/TE",
  "SUPER_FLEX",
  "QB/RB/WR/TE",
  "REC_FLEX",
  "WR/TE",
]);

function isEligible(playerPos: string, slot: string): boolean {
  switch (slot) {
    case "QB": return playerPos === "QB";
    case "RB": return playerPos === "RB";
    case "WR": return playerPos === "WR";
    case "TE": return playerPos === "TE";
    case "FLEX":
    case "RB/WR/TE":
      return playerPos === "RB" || playerPos === "WR" || playerPos === "TE";
    case "SUPER_FLEX":
    case "QB/RB/WR/TE":
      return playerPos === "QB" || playerPos === "RB" || playerPos === "WR" || playerPos === "TE";
    case "REC_FLEX":
    case "WR/TE":
      return playerPos === "WR" || playerPos === "TE";
    default:
      // Unknown slot — treat as FLEX
      return false;
  }
}

// ─── Slot Naming ───

function normalizeSlotLabel(slot: string): string {
  if (slot === "SUPER_FLEX" || slot === "QB/RB/WR/TE") return "SF";
  if (slot === "FLEX" || slot === "RB/WR/TE") return "FLEX";
  if (slot === "REC_FLEX" || slot === "WR/TE") return "REC";
  return slot;
}

function nameSlots(rawSlots: string[]): { slot: string; label: string }[] {
  const starterSlots = rawSlots.filter(
    (s) => !EXCLUDED_SLOTS.has(s) && STARTER_SLOT_WHITELIST.has(s)
  );
  const counts: Record<string, number> = {};
  const result: { slot: string; label: string }[] = [];

  for (const raw of starterSlots) {
    const label = normalizeSlotLabel(raw);
    counts[label] = (counts[label] ?? 0) + 1;
  }

  const idx: Record<string, number> = {};
  for (const raw of starterSlots) {
    const label = normalizeSlotLabel(raw);
    idx[label] = (idx[label] ?? 0) + 1;
    const name = counts[label] > 1 ? `${label}${idx[label]}` : label;
    result.push({ slot: name, label });
  }

  return result;
}

// ─── Grade Thresholds ───

function computeGrade(avg: number): SlotGrade["grade"] {
  if (avg >= 88) return "elite";
  if (avg >= 78) return "strong";
  if (avg >= 68) return "average";
  if (avg >= 55) return "weak";
  return "hole";
}

// ─── Main Optimizer ───

export function optimizeLineup(
  players: PlayerForSlot[],
  rosterPositions: string[]
): OptimizedLineup {
  if (players.length === 0) {
    return { starters: [], bench: [], slot_grades: [] };
  }

  const sorted = [...players].sort((a, b) => b.edge_score - a.edge_score);
  const namedSlots = nameSlots(rosterPositions);
  const used = new Set<string>();

  const starters: SlottedPlayer[] = [];

  // Greedy fill: for each slot, find best available eligible player
  for (const { slot, label } of namedSlots) {
    const best = sorted.find((p) => !used.has(p.player_id) && isEligible(p.position, label === "SF" ? "SUPER_FLEX" : label === "REC" ? "REC_FLEX" : label));
    if (best) {
      used.add(best.player_id);
      starters.push({ ...best, slot, slot_label: label, is_starter: true });
    }
  }

  // Bench: all unslotted players, sorted by edge_score descending
  const bench: SlottedPlayer[] = sorted
    .filter((p) => !used.has(p.player_id))
    .map((p) => ({ ...p, slot: "BN", slot_label: "BN", is_starter: false }));

  // Slot grades: group starters by position
  const posGroups: Record<string, number[]> = { QB: [], RB: [], WR: [], TE: [] };

  for (const s of starters) {
    const pos = s.position;
    if (posGroups[pos]) posGroups[pos].push(s.edge_score);
  }

  const slot_grades: SlotGrade[] = [];
  for (const [pos, scores] of Object.entries(posGroups)) {
    if (scores.length === 0) continue;
    const avg = Math.round((scores.reduce((a, v) => a + v, 0) / scores.length) * 10) / 10;
    slot_grades.push({
      slot_label: pos,
      avg_score: avg,
      grade: computeGrade(avg),
      count: scores.length,
    });
  }

  // Sort grades in standard position order
  const posOrder = ["QB", "RB", "WR", "TE"];
  slot_grades.sort((a, b) => posOrder.indexOf(a.slot_label) - posOrder.indexOf(b.slot_label));

  return { starters, bench, slot_grades };
}
