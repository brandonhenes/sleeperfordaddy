import { useState } from "react";
import EdgeScoreBadge from "../../components/EdgeScoreBadge";
import { PositionBadge } from "../../components/ui";
import type { CoreAsset, RosterRanking, ScoredPick } from "@shared/types";
import { pickDisplay, pickKey } from "./picks";

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;

function PlayerRow({
  player,
  isStarter,
  isUsed,
  onClick,
}: {
  player: CoreAsset;
  isStarter: boolean;
  isUsed: boolean;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const background = isUsed
    ? "rgba(148,163,184,0.14)"
    : isHovered
      ? "rgba(245,158,11,0.08)"
      : "transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: "100%",
        border: "none",
        borderTop: "1px solid var(--border)",
        background,
        color: "var(--text)",
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "7px 12px",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        opacity: isUsed ? 0.65 : 1,
        transition: "background 0.1s ease",
      }}
    >
      <span style={{ fontSize: 9, width: 38, color: isStarter ? "var(--green)" : "var(--text-muted)", fontWeight: 700 }}>
        {isStarter ? "START" : "BENCH"}
      </span>
      <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{player.full_name}</span>
      {player.age != null && <span style={{ color: "var(--text-muted)", fontSize: 10 }}>Age {player.age}</span>}
      <EdgeScoreBadge score={Math.round(player.edge_score)} size="sm" />
      {isUsed && <span style={{ color: "var(--amber)", fontSize: 9, fontWeight: 700 }}>REMOVE</span>}
    </button>
  );
}

function PositionGroup({
  position,
  players,
  starterIds,
  usedPlayerIds,
  onPlayerClick,
}: {
  position: string;
  players: CoreAsset[];
  starterIds: Set<string>;
  usedPlayerIds: Set<string>;
  onPlayerClick: (player: CoreAsset) => void;
}) {
  const [showBench, setShowBench] = useState(false);
  const starters = players.filter((player) => starterIds.has(player.player_id));
  const bench = players.filter((player) => !starterIds.has(player.player_id));

  return (
    <div>
      <div style={{ background: "var(--dark-base)", fontSize: 11, fontWeight: 800, padding: "8px 12px" }}>
        <PositionBadge position={position} />
      </div>
      {starters.map((player) => (
        <PlayerRow
          key={player.player_id}
          player={player}
          isStarter
          isUsed={usedPlayerIds.has(player.player_id)}
          onClick={() => onPlayerClick(player)}
        />
      ))}
      {bench.length > 0 && (
        <button
          type="button"
          onClick={() => setShowBench((current) => !current)}
          style={{
            width: "100%",
            border: "none",
            borderTop: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-muted)",
            padding: "6px 12px",
            textAlign: "center",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {showBench ? "Hide" : "Show"} {bench.length} bench
        </button>
      )}
      {showBench && bench.map((player) => (
        <PlayerRow
          key={player.player_id}
          player={player}
          isStarter={false}
          isUsed={usedPlayerIds.has(player.player_id)}
          onClick={() => onPlayerClick(player)}
        />
      ))}
    </div>
  );
}

interface RosterGridProps {
  roster: RosterRanking | null;
  usedPlayerIds: Set<string>;
  usedPickKeys: Set<string>;
  onPlayerClick: (p: CoreAsset) => void;
  onPickClick: (p: ScoredPick) => void;
}

export default function RosterGrid({
  roster,
  usedPlayerIds,
  usedPickKeys,
  onPlayerClick,
  onPickClick,
}: RosterGridProps) {
  if (!roster) return <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, color: "var(--text-muted)", fontSize: 12 }}>Select opponent to load roster.</div>;

  const starterIds = new Set((roster.lineup?.starters ?? []).map((p) => p.player_id));
  const picks = [...(roster.draft_picks ?? [])]
    .filter((pick) => pick.edge_score > 0)
    .sort((a, b) => b.edge_score - a.edge_score);

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      {POSITIONS.map((pos) => {
        const players = roster.core_assets
          .filter((p) => p.position === pos)
          .sort((a, b) => {
            const as = starterIds.has(a.player_id) ? 1 : 0;
            const bs = starterIds.has(b.player_id) ? 1 : 0;
            if (as !== bs) return bs - as;
            return b.edge_score - a.edge_score;
          });
        if (!players.length) return null;
        return (
          <PositionGroup
            key={`${roster.roster_id}-${pos}`}
            position={pos}
            players={players}
            starterIds={starterIds}
            usedPlayerIds={usedPlayerIds}
            onPlayerClick={onPlayerClick}
          />
        );
      })}
      <div>
        <div style={{ background: "var(--dark-base)", color: "#06b6d4", fontSize: 11, fontWeight: 800, padding: "8px 12px" }}>PICKS</div>
        {!picks.length && <div style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 12 }}>No picks available.</div>}
        {picks.map((pick) => {
          const used = usedPickKeys.has(pickKey(pick));
          return (
            <button type="button" key={pickKey(pick)} onClick={() => onPickClick(pick)} style={{ width: "100%", border: "none", borderTop: "1px solid var(--border)", background: used ? "rgba(148,163,184,0.14)" : "transparent", color: "var(--text)", display: "flex", gap: 8, alignItems: "center", padding: "7px 12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", opacity: used ? 0.65 : 1 }}>
              <span style={{ fontSize: 9, width: 28, color: "#06b6d4", fontWeight: 700 }}>PICK</span>
              <span style={{ flex: 1, fontSize: 12 }}>{pickDisplay(pick)}</span>
              <EdgeScoreBadge score={Math.round(pick.edge_score)} size="sm" />
              {used && <span style={{ color: "var(--amber)", fontSize: 9, fontWeight: 700 }}>REMOVE</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
