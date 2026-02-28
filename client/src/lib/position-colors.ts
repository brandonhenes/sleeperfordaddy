const POS_COLORS: Record<string, string> = {
  QB: "var(--pos-qb)",
  RB: "var(--pos-rb)",
  WR: "var(--pos-wr)",
  TE: "var(--pos-te)",
};

export function posColor(pos: string): string {
  return POS_COLORS[pos.toUpperCase()] || "var(--text-dim)";
}

const DIR_COLORS: Record<string, string> = {
  BUY: "var(--green)",
  SELL: "var(--red)",
  HOLD: "var(--amber)",
  MONITOR: "var(--blue)",
  DROP: "var(--red)",
};

export function dirColor(dir: string): string {
  return DIR_COLORS[dir.toUpperCase()] || "var(--text-muted)";
}
