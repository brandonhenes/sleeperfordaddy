import {
  describeAvailability,
  type PlayerAvailability,
} from "../../../../shared/player-availability";

const TONE_STYLES: Record<string, { bg: string; color: string }> = {
  neutral: { bg: "rgba(148,163,184,0.15)", color: "var(--text-muted)" },
  info: { bg: "rgba(96,165,250,0.15)", color: "var(--blue)" },
  warning: { bg: "rgba(245,158,11,0.18)", color: "var(--amber)" },
  muted: { bg: "rgba(148,163,184,0.12)", color: "var(--text-dim)" },
  danger: { bg: "rgba(239,68,68,0.18)", color: "var(--red)" },
};

interface Props {
  availability: PlayerAvailability;
}

export default function PlayerStatusBadge({ availability }: Props) {
  const desc = describeAvailability(availability);
  if (!desc) return null;
  const style = TONE_STYLES[desc.tone] ?? TONE_STYLES.neutral;
  return (
    <span
      title={desc.tooltip}
      style={{
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 0.8,
        background: style.bg,
        color: style.color,
        flexShrink: 0,
      }}
    >
      {desc.label}
    </span>
  );
}
