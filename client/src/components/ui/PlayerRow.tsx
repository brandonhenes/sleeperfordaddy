import type { ReactNode } from "react";
import PositionBadge from "./PositionBadge";

interface PlayerRowProps {
  name: string;
  position?: string | null;
  team?: string | null;
  meta?: ReactNode;
  value?: ReactNode;
  action?: ReactNode;
}

export default function PlayerRow({
  name,
  position,
  team,
  meta,
  value,
  action,
}: PlayerRowProps) {
  return (
    <div className="edge-player-row">
      <div className="edge-player-main">
        {position && <PositionBadge position={position} />}
        <div className="edge-player-copy">
          <div className="edge-player-name">{name}</div>
          {(team || meta) && (
            <div className="edge-player-meta">
              {team && <span>{team}</span>}
              {meta}
            </div>
          )}
        </div>
      </div>
      {(value || action) && (
        <div className="edge-player-side">
          {value}
          {action}
        </div>
      )}
    </div>
  );
}
