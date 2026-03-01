// ─── Types ───

export interface ArchetypeResult {
  archetype: string;
  reasons: string[];
}

// ─── Percentile Rank ───

export function percentileRank(values: number[], value: number): number {
  if (values.length <= 1) return 50;
  const below = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return ((below + (equal - 1) / 2) / (values.length - 1)) * 100;
}

// ─── Archetype Classification ───

export function classifyTeam(
  power_pct: number,
  draft_pct: number,
  window_pct: number,
  maxpf_pct?: number
): ArchetypeResult {
  const reasons: string[] = [];

  // Build reason strings
  reasons.push(`Power ${Math.round(power_pct)}th pct${power_pct > 75 ? " (elite starters)" : power_pct < 30 ? " (weak starters)" : ""}`);
  reasons.push(`Window ${Math.round(window_pct)}th pct${window_pct > 70 ? " (young core)" : window_pct < 40 ? " (aging core)" : ""}`);
  reasons.push(`Draft ${Math.round(draft_pct)}th pct${draft_pct > 70 ? " (loaded ammo)" : draft_pct < 40 ? " (low ammo)" : ""}`);
  if (maxpf_pct != null) {
    reasons.push(`MaxPF ${Math.round(maxpf_pct)}th pct${maxpf_pct < 40 ? " (intentional tank profile)" : ""}`);
  }

  // Apply rules in order — first match wins
  if (power_pct > 80 && window_pct > 70)
    return { archetype: "Dynasty Juggernaut", reasons };

  if (power_pct > 75 && draft_pct < 40)
    return { archetype: "All-In Contender", reasons };

  if (power_pct > 70 && window_pct < 40)
    return { archetype: "Fragile Contender", reasons };

  const effectivePower = maxpf_pct ?? power_pct;
  if (effectivePower < 40 && draft_pct > 70 && window_pct > 60)
    return { archetype: "Productive Struggle", reasons };

  if (power_pct < 30)
    return { archetype: "Rebuilder", reasons };

  if (power_pct >= 40 && power_pct <= 60 && draft_pct < 50 && window_pct < 50)
    return { archetype: "Dead Zone", reasons };

  return { archetype: "Competitor", reasons };
}
