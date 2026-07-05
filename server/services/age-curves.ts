// ─── Types ───

import type { AgeCurveStatus } from "../../shared/types.js";

export type { AgeCurveStatus };

// ─── Curve Definitions ───

interface CurveDef {
  prime: [number, number];
  entries: [number | [number, number], number, "Ascent" | "Prime" | "Decline" | "Cliff"][];
}

const CURVES: Record<string, CurveDef> = {
  RB: {
    prime: [23, 26],
    entries: [
      [20, 60, "Ascent"],
      [21, 75, "Ascent"],
      [22, 90, "Ascent"],
      [[23, 26], 100, "Prime"],
      [27, 85, "Decline"],
      [28, 70, "Decline"],
      // 29+ handled as default cliff
    ],
  },
  WR: {
    prime: [24, 28],
    entries: [
      [21, 70, "Ascent"],
      [22, 80, "Ascent"],
      [23, 90, "Ascent"],
      [[24, 28], 100, "Prime"],
      [[29, 30], 85, "Decline"],
      [31, 70, "Decline"],
    ],
  },
  TE: {
    prime: [25, 30],
    entries: [
      [21, 60, "Ascent"],
      [22, 70, "Ascent"],
      [23, 80, "Ascent"],
      [24, 85, "Ascent"],
      [[25, 30], 100, "Prime"],
      [[31, 32], 80, "Decline"],
    ],
  },
  QB: {
    prime: [26, 33],
    entries: [
      [21, 70, "Ascent"],
      [22, 75, "Ascent"],
      [23, 80, "Ascent"],
      [24, 85, "Ascent"],
      [25, 90, "Ascent"],
      [[26, 33], 100, "Prime"],
      [[34, 36], 85, "Decline"],
    ],
  },
};

// Cliff scores per position
const CLIFF_SCORES: Record<string, number> = { RB: 45, WR: 45, TE: 45, QB: 55 };

// ─── Lookup ───

function lookupCurve(
  pos: string,
  age: number
): { score: number; zone: "Ascent" | "Prime" | "Decline" | "Cliff" } | null {
  const curve = CURVES[pos];
  if (!curve) return null;

  for (const [ageSpec, score, zone] of curve.entries) {
    if (typeof ageSpec === "number") {
      if (age === ageSpec) return { score, zone };
    } else {
      if (age >= ageSpec[0] && age <= ageSpec[1]) return { score, zone };
    }
  }

  // Below curve minimum -> early ascent
  const firstAge = curve.entries[0][0];
  const minAge = typeof firstAge === "number" ? firstAge : firstAge[0];
  if (age < minAge) return { score: 50, zone: "Ascent" };

  // Above curve maximum -> cliff
  return { score: CLIFF_SCORES[pos] ?? 45, zone: "Cliff" };
}

// ─── Color Assignment ───

function zoneColor(
  zone: "Ascent" | "Prime" | "Decline" | "Cliff" | "Unknown",
  score: number
): "blue" | "green" | "gold" | "orange" | "red" | "gray" {
  if (zone === "Ascent") return score < 75 ? "blue" : "green";
  if (zone === "Prime") return "gold";
  if (zone === "Decline") return "orange";
  if (zone === "Cliff") return "red";
  return "gray";
}

// ─── Public API ───

export function getAgeCurveStatus(position: string, age: number | null): AgeCurveStatus {
  const pos = position?.toUpperCase();
  const curve = CURVES[pos];

  if (age == null || !Number.isFinite(age) || !curve) {
    return {
      age, position: pos ?? position, score: 0,
      zone: "Unknown", color: "gray", label: "Unknown",
      prime_start: null, prime_end: null, dot_pct: 0,
    };
  }

  const intAge = Math.floor(age);
  const result = lookupCurve(pos, intAge)!;

  const label =
    result.zone === "Prime"
      ? `Prime (${curve.prime[0]}-${curve.prime[1]})`
      : `${result.zone} (${intAge})`;

  return {
    age: intAge,
    position: pos,
    score: result.score,
    zone: result.zone,
    color: zoneColor(result.zone, result.score),
    label,
    prime_start: curve.prime[0],
    prime_end: curve.prime[1],
    dot_pct: Math.max(0, Math.min(1, result.score / 100)),
  };
}
