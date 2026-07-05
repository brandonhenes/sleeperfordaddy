import type {
  CoreAsset,
  OptimizedLineup,
  SlotGrade,
  SlottedPlayer,
} from "../../shared/types.js";

// ─── Types ───

export type PlayerForSlot = CoreAsset;

// ─── Slot Eligibility ───

const EXCLUDED_SLOTS = new Set(["DEF", "K", "BN", "IR", "TAXI"]);

function getFlexEligiblePositions(slot: string): Set<string> {
  const s = slot.toUpperCase();
  const out = new Set<string>();

  // Common Sleeper aliases
  if (s === "OP") return new Set(["QB", "RB", "WR", "TE"]);
  if (s === "SUPER_FLEX" || s === "QB/RB/WR/TE") return new Set(["QB", "RB", "WR", "TE"]);
  if (s === "REC_FLEX" || s === "WR/TE") return new Set(["WR", "TE"]);
  if (s === "FLEX" || s === "RB/WR/TE") return new Set(["RB", "WR", "TE"]);

  // Handle variants like WRRB_FLEX, RBWRTE_FLEX, etc.
  if (s.includes("FLEX")) {
    if (s.includes("QB")) out.add("QB");
    if (s.includes("RB")) out.add("RB");
    if (s.includes("WR")) out.add("WR");
    if (s.includes("TE")) out.add("TE");
    // Generic FLEX fallback when tokens are ambiguous
    if (out.size === 0) return new Set(["RB", "WR", "TE"]);
  }
  return out;
}

function isStarterSlot(slot: string): boolean {
  if (EXCLUDED_SLOTS.has(slot)) return false;
  if (slot === "QB" || slot === "RB" || slot === "WR" || slot === "TE") return true;
  return getFlexEligiblePositions(slot).size > 0;
}

function isEligible(playerPos: string, slot: string): boolean {
  const s = slot.toUpperCase();
  switch (s) {
    case "QB": return playerPos === "QB";
    case "RB": return playerPos === "RB";
    case "WR": return playerPos === "WR";
    case "TE": return playerPos === "TE";
    default:
      return getFlexEligiblePositions(s).has(playerPos);
  }
}

// ─── Slot Naming ───

function normalizeSlotLabel(slot: string): string {
  const s = slot.toUpperCase();
  if (s === "SUPER_FLEX" || s === "QB/RB/WR/TE" || s === "OP") return "SF";
  if (s === "REC_FLEX" || s === "WR/TE") return "REC";
  const flex = getFlexEligiblePositions(s);
  if (flex.size > 0) {
    if (flex.has("RB") && flex.has("WR") && !flex.has("TE") && !flex.has("QB")) return "W/R";
    return "FLEX";
  }
  return slot;
}

function nameSlots(rawSlots: string[]): { slot: string; label: string; raw: string }[] {
  const starterSlots = rawSlots.filter((s) => isStarterSlot(s));
  const counts: Record<string, number> = {};
  const result: { slot: string; label: string; raw: string }[] = [];

  for (const raw of starterSlots) {
    const label = normalizeSlotLabel(raw);
    counts[label] = (counts[label] ?? 0) + 1;
  }

  const idx: Record<string, number> = {};
  for (const raw of starterSlots) {
    const label = normalizeSlotLabel(raw);
    idx[label] = (idx[label] ?? 0) + 1;
    const name = counts[label] > 1 ? `${label}${idx[label]}` : label;
    result.push({ slot: name, label, raw });
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

// ─── Slot Fill Order ───

/** Fewer eligible positions = more constrained = fill first. */
function slotFlexibility(rawSlot: string): number {
  const s = rawSlot.toUpperCase();
  if (s === "QB" || s === "RB" || s === "WR" || s === "TE") return 0; // position-locked
  const eligible = getFlexEligiblePositions(s);
  if (eligible.size === 0) return 0;
  return eligible.size; // 2 = REC_FLEX, 3 = FLEX, 4 = SUPER_FLEX/OP
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

  // Sort slots: position-locked first, then flex from most restrictive to least.
  // Stable sort preserves original order within the same flexibility level.
  const fillOrder = [...namedSlots].sort(
    (a, b) => slotFlexibility(a.raw) - slotFlexibility(b.raw)
  );

  // Greedy fill using the RAW slot name for eligibility checks
  for (const { slot, label, raw } of fillOrder) {
    const best = sorted.find((p) => !used.has(p.player_id) && isEligible(p.position, raw));
    if (best) {
      used.add(best.player_id);
      starters.push({ ...best, slot, slot_label: label, is_starter: true });
    }
  }

  // Re-sort starters to match the original rosterPositions display order
  const slotOrder = new Map(namedSlots.map((s, i) => [s.slot, i]));
  starters.sort((a, b) => (slotOrder.get(a.slot) ?? 99) - (slotOrder.get(b.slot) ?? 99));

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
