import { posColor } from "../../lib/position-colors";

interface PositionBadgeProps {
  position: string | null | undefined;
  label?: string;
}

export default function PositionBadge({ position, label }: PositionBadgeProps) {
  const normalized = position?.trim().toUpperCase() || "NA";
  return (
    <span
      className="edge-position-badge"
      style={{ color: posColor(normalized) }}
    >
      {label ?? normalized}
    </span>
  );
}
