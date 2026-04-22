interface Props {
  total: number | null | undefined;
  ppg: number | null | undefined;
  weeks: number | null | undefined;
  season?: number | null;
}

/**
 * Displays raw fantasy points the player scored in THIS league's scoring for
 * the most recent completed season. Small compact badge that sits next to the
 * Edge score and SourceBadge.
 */
export default function LeaguePointsBadge({ total, ppg, weeks, season }: Props) {
  if (total == null || ppg == null || weeks == null || weeks === 0) {
    return (
      <span
        title={`No ${season ?? "last-season"} scoring data`}
        style={{
          fontSize: 10,
          color: "var(--text-dim)",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {"\u2014"}
      </span>
    );
  }

  const totalRounded = Math.round(total);
  const ppgRounded = Math.round(ppg * 10) / 10;

  return (
    <span
      title={`${totalRounded} pts across ${weeks} weeks (${ppgRounded} ppg) in this league's scoring — ${season ?? ""} season`}
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 4,
        fontSize: 11,
        fontFamily: "var(--font-mono, monospace)",
        whiteSpace: "nowrap",
        color: "var(--text)",
      }}
    >
      <span style={{ fontWeight: 700 }}>{totalRounded}</span>
      <span style={{ fontSize: 9, color: "var(--text-dim)" }}>pts</span>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>/</span>
      <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{ppgRounded}</span>
      <span style={{ fontSize: 9, color: "var(--text-dim)" }}>pg</span>
    </span>
  );
}
