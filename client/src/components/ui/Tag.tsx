const TAG_MAP: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE_STARTER: {
    bg: "rgba(96,165,250,0.15)",
    text: "var(--blue)",
    label: "STARTER",
  },
  BENCH_STASH: {
    bg: "rgba(148,163,184,0.15)",
    text: "var(--text-dim)",
    label: "STASH",
  },
  SPECULATIVE: {
    bg: "rgba(148,163,184,0.15)",
    text: "var(--text-muted)",
    label: "SPEC",
  },
  ROSTER_CLOG: {
    bg: "rgba(248,113,113,0.15)",
    text: "var(--red)",
    label: "CLOG",
  },
  TRENDING_UP: {
    bg: "rgba(74,222,128,0.15)",
    text: "var(--green)",
    label: "TRENDING UP",
  },
  TRENDING_DOWN: {
    bg: "rgba(248,113,113,0.15)",
    text: "var(--red)",
    label: "TRENDING DOWN",
  },
  HIGH_EXPOSURE_RISK: {
    bg: "rgba(248,113,113,0.15)",
    text: "var(--red)",
    label: "HIGH EXPOSURE",
  },
  LOW_EXPOSURE_UPSIDE: {
    bg: "rgba(245,158,11,0.15)",
    text: "var(--amber)",
    label: "LOW EXPOSURE",
  },
};

interface TagProps {
  tag: string;
}

export default function Tag({ tag }: TagProps) {
  const t = TAG_MAP[tag] || TAG_MAP.SPECULATIVE;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        background: t.bg,
        color: t.text,
      }}
    >
      {t.label}
    </span>
  );
}
