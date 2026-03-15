import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "../components/AppShell";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import FreshnessBar from "../components/FreshnessBar";
import { PickBadge } from "../components/ui";
import { posColor } from "../lib/position-colors";
import { useEvaluateTrade } from "../hooks/use-trade-calculator";
import {
  usePowerRankings,
  type CoreAsset,
  type RosterRanking,
  type ScoredPick,
} from "../hooks/use-power-rankings";
import { apiFetch } from "../lib/api";
import { computeAcceptance, type AcceptanceResult } from "../lib/acceptance";
import type {
  EvaluatedAsset,
  TradeAssetInput,
  TradeEvaluation,
  TradeHealthWarning,
} from "../../../shared/types";

type Side = "send" | "receive";
type PickTier = "early" | "mid" | "late";

interface SearchAsset {
  type: "player";
  player_id: string;
  label: string;
  position: string;
  team: string | null;
}

interface AcceptanceAssetView extends EvaluatedAsset {
  age?: number | null;
  age_curve_zone?: string | null;
}

interface OpponentBehavior {
  total_trades: number;
  recent_trades: number;
  preferred_structure: string;
  is_active: boolean;
  last_trade_days_ago: number | null;
  bias_flags: string[];
  top_acquired_positions: string[];
}

interface OpponentContext {
  roster_id: number;
  display_name: string;
  team_name: string | null;
  archetype: string;
  needs: string[];
  surplus: string[];
  top_player_ids_by_pos: Record<string, string>;
  behavior: OpponentBehavior | null;
}

interface OpponentContextResponse {
  league_id: string;
  opponents: OpponentContext[];
}

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const YEAR = new Date().getFullYear();
const PICK_YEARS = [String(YEAR), String(YEAR + 1), String(YEAR + 2)];

function assetKey(a: TradeAssetInput): string {
  if (a.type === "player") {
    return `p:${a.player_id}`;
  }
  const ownerKey = a.pick_original_owner_id != null ? `|${a.pick_original_owner_id}` : "";
  if (a.pick_slot != null) {
    return `k:${a.pick_season}|${a.pick_round}|${a.pick_slot}${ownerKey}`;
  }
  return `k:${a.pick_season}|${a.pick_round}|${a.pick_tier ?? "mid"}${ownerKey}`;
}

function pickToAsset(pick: ScoredPick): TradeAssetInput {
  return {
    type: "pick",
    pick_season: pick.season,
    pick_round: pick.round,
    pick_tier: pick.tier,
    pick_slot: pick.pick_slot ?? null,
    pick_label: pickDisplay(pick),
    pick_original_owner_id: pick.original_owner_id,
  };
}

function pickKey(pick: ScoredPick): string {
  if (pick.pick_slot != null) {
    return `k:${pick.season}|${pick.round}|${pick.pick_slot}|${pick.original_owner_id}`;
  }
  return `k:${pick.season}|${pick.round}|${pick.tier}|${pick.original_owner_id}`;
}

function pickDisplay(pick: ScoredPick): string {
  if (pick.pick_slot != null) {
    return `${pick.season} ${pick.round}.${String(pick.pick_slot).padStart(2, "0")}`;
  }
  return pick.label;
}

function fairnessColor(f: TradeEvaluation["fairness"]): string {
  if (f === "fair") return "var(--green)";
  if (f === "slight_edge") return "var(--amber)";
  return "var(--red)";
}

function fairnessLabel(f: TradeEvaluation["fairness"]): string {
  if (f === "fair") return "FAIR";
  if (f === "slight_edge") return "SLIGHT EDGE";
  return "LOPSIDED";
}

function acceptanceColor(label: AcceptanceResult["label"]): string {
  if (label === "Likely") return "var(--green)";
  if (label === "Possible") return "var(--amber)";
  if (label === "Unlikely") return "#f97316";
  return "var(--red)";
}

function warningColors(type: TradeHealthWarning["type"]) {
  if (type === "block") {
    return {
      background: "rgba(239,68,68,0.12)",
      border: "1px solid rgba(239,68,68,0.28)",
      color: "#fca5a5",
      label: "#f87171",
    };
  }
  return {
    background: "rgba(245,158,11,0.12)",
    border: "1px solid rgba(245,158,11,0.28)",
    color: "#fcd34d",
    label: "#fbbf24",
  };
}

function TradeHealthPanel({ warnings }: { warnings: TradeHealthWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      {warnings.map((warning, index) => {
        const colors = warningColors(warning.type);
        return (
          <div
            key={`${warning.rule}-${index}`}
            style={{
              background: colors.background,
              border: colors.border,
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <div
              style={{
                color: colors.label,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              {warning.type} | {warning.rule}
            </div>
            <div style={{ color: colors.color, fontSize: 12, lineHeight: 1.5 }}>
              {warning.message}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function packagePenalty(count: number): number {
  return count <= 1 ? 0 : (count - 1) * 1.5;
}

function buildTradeMessage(
  result: TradeEvaluation,
  sendLabels: string[],
  receiveLabels: string[],
  opponent: OpponentContext | null,
  acceptance: AcceptanceResult | null
): string {
  const lines: string[] = [];
  lines.push("Hey, would you consider:");
  lines.push("");
  lines.push("My:");
  for (const label of sendLabels) lines.push(`  ${label}`);
  lines.push("For your:");
  for (const label of receiveLabels) lines.push(`  ${label}`);
  lines.push("");

  if (acceptance && acceptance.accept_reasons.length > 0) {
    const compelling = acceptance.accept_reasons.filter(
      (reason) => !reason.includes("Trade power") && !reason.includes("overpay")
    );
    if (compelling.length > 0) lines.push(`${compelling[0]}.`);
  }

  if (opponent) {
    const sendPositions = result.sideA.assets
      .map((asset) => asset.position)
      .filter((position): position is string => position != null);
    const matchedNeed = sendPositions.find((position) => opponent.needs.includes(position));
    if (matchedNeed) lines.push(`This gets you ${matchedNeed} help you could use.`);
  }

  return lines.join("\n");
}

function EvalBar({
  result,
  acceptance,
  hasBothSides,
  isPending,
}: {
  result: TradeEvaluation | undefined;
  acceptance: AcceptanceResult | null;
  hasBothSides: boolean;
  isPending: boolean;
}) {
  if (!hasBothSides) {
    return <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, color: "var(--text-muted)", fontSize: 13 }}>Click players below to build a trade.</div>;
  }
  if (!result && isPending) {
    return <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, color: "var(--amber)", fontSize: 13 }}><span className="animate-pulse">Evaluating trade...</span></div>;
  }
  if (!result) return null;

  const sendTotal = result.sideA.total_trade_power;
  const receiveTotal = result.sideB.total_trade_power;
  const total = Math.max(1, sendTotal + receiveTotal);
  const sendPct = (sendTotal / total) * 100;
  const deltaLabel = result.delta > 0
    ? `You overpay by ${Math.abs(result.delta).toFixed(1)} TP`
    : result.delta < 0
      ? `You underpay by ${Math.abs(result.delta).toFixed(1)} TP`
      : "Even trade power";
  const deltaColor = result.delta > 0 ? "var(--red)" : result.delta < 0 ? "var(--green)" : "var(--text-dim)";

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ background: fairnessColor(result.fairness), color: result.fairness === "fair" ? "var(--dark-base)" : "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 800 }}>
            {fairnessLabel(result.fairness)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: deltaColor }}>
            {deltaLabel}
          </span>
        </div>
        {acceptance && (
          <span style={{ background: acceptanceColor(acceptance.label), color: acceptance.label === "Possible" ? "var(--dark-base)" : "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 800 }}>
            {acceptance.label} ({Math.round(acceptance.probability)}%)
          </span>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
        <span>You Send {sendTotal.toFixed(1)} TP</span>
        <span>You Get {receiveTotal.toFixed(1)} TP</span>
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: "var(--dark-base)" }}>
        <div style={{ width: `${sendPct}%`, background: "#ef4444" }} />
        <div style={{ flex: 1, background: "#22c55e" }} />
      </div>
      <TradeHealthPanel warnings={result.healthCheck} />
    </div>
  );
}

function AcceptanceBadge({
  acceptance,
  opponent,
}: {
  acceptance: AcceptanceResult | null;
  opponent: OpponentContext | null;
}) {
  if (!opponent) return null;
  if (!acceptance) {
    return <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, color: "var(--text-muted)", fontSize: 12 }}>Select assets on both sides to see acceptance analysis for {opponent.display_name}.</div>;
  }
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Acceptance vs {opponent.display_name}</div>
        <span style={{ background: acceptanceColor(acceptance.label), color: acceptance.label === "Possible" ? "var(--dark-base)" : "#fff", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 800 }}>
          {acceptance.label} ({Math.round(acceptance.probability)}%)
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--green)", marginBottom: 4 }}>ACCEPT SIGNALS</div>
          {acceptance.accept_reasons.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No strong acceptance signals yet.</div>}
          {acceptance.accept_reasons.map((r, i) => <div key={`a-${i}`} style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>• {r}</div>)}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--red)", marginBottom: 4 }}>REJECT SIGNALS</div>
          {acceptance.reject_reasons.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No major resistance flags.</div>}
          {acceptance.reject_reasons.map((r, i) => <div key={`r-${i}`} style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>• {r}</div>)}
        </div>
      </div>
      {opponent.behavior?.bias_flags?.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {opponent.behavior.bias_flags.map((f) => (
            <span key={f} style={{ fontSize: 10, border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px", color: "var(--text-dim)" }}>{f}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TradePanel({
  title,
  color,
  labels,
  evaluated,
  onRemove,
  onClear,
}: {
  title: string;
  color: string;
  labels: string[];
  evaluated: EvaluatedAsset[] | null;
  onRemove: (idx: number) => void;
  onClear: () => void;
}) {
  const totalEdge = evaluated?.reduce((s, a) => s + a.edge_score, 0) ?? 0;
  const penalty = packagePenalty(labels.length);
  const totalTp = Math.max(0, totalEdge - penalty);

  return (
    <div style={{ background: "var(--card)", border: `1px solid ${color}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ color, fontSize: 12, fontWeight: 800 }}>{title}</div>
        <button type="button" onClick={onClear} disabled={labels.length === 0} style={{ border: "1px solid var(--border)", background: "var(--dark-base)", color: "var(--text-dim)", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: labels.length ? "pointer" : "not-allowed", fontFamily: "inherit" }}>Clear All</button>
      </div>
      {!labels.length && <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No assets selected.</div>}
      {labels.map((label, idx) => {
        const asset = evaluated?.[idx];
        return (
          <div key={`${label}-${idx}`} style={{ display: "flex", alignItems: "flex-start", gap: 8, borderBottom: "1px solid var(--border)", padding: "7px 0" }}>
            {asset ? <EdgeScoreBadge score={Math.round(asset.edge_score)} size="sm" /> : <span style={{ width: 32 }} />}
            <div style={{ flex: 1, display: "grid", gap: 4 }}>
              {asset?.pick_breakdown ? (
                <>
                  <PickBadge pick={asset.pick_breakdown} compact />
                  <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.4 }}>
                    Slot {asset.pick_breakdown.round}.{String(asset.pick_breakdown.pickSlot).padStart(2, "0")} | Base {asset.pick_breakdown.baseEdgeValue.toFixed(1)} | x{asset.pick_breakdown.classStrengthModifier.toFixed(2)}
                    {asset.pick_breakdown.projectedProspect ? ` | ${asset.pick_breakdown.projectedProspect}` : ""}
                    {asset.pick_breakdown.prospectTier != null ? ` (Tier ${asset.pick_breakdown.prospectTier})` : ""}
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 12 }}>{asset?.label ?? label}</span>
              )}
            </div>
            {asset && <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>TP {Math.round(asset.trade_power)}</span>}
            <button type="button" onClick={() => onRemove(idx)} style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--red)", borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>X</button>
          </div>
        );
      })}
      {!!labels.length && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)", display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>Total Edge: <strong style={{ color: "var(--text)" }}>{totalEdge.toFixed(1)}</strong></span>
          <span>Package Penalty: <strong style={{ color: "var(--text)" }}>{penalty.toFixed(1)}</strong></span>
          <span>Trade Power: <strong style={{ color: "var(--text)" }}>{totalTp.toFixed(1)}</strong></span>
        </div>
      )}
    </div>
  );
}

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
      <div style={{ background: "var(--dark-base)", color: posColor(position), fontSize: 11, fontWeight: 800, padding: "8px 12px" }}>
        {position}
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

function VacuumSearchColumn({
  title,
  color,
  search,
  onSearchChange,
  results,
  isLoading,
  onAddPlayer,
  pickSeason,
  onPickSeasonChange,
  pickRound,
  onPickRoundChange,
  pickTier,
  onPickTierChange,
  onAddPick,
  addPickLabel,
}: {
  title: string;
  color: string;
  search: string;
  onSearchChange: (value: string) => void;
  results: SearchAsset[];
  isLoading: boolean;
  onAddPlayer: (player: SearchAsset) => void;
  pickSeason: string;
  onPickSeasonChange: (value: string) => void;
  pickRound: number;
  onPickRoundChange: (value: number) => void;
  pickTier: PickTier;
  onPickTierChange: (value: PickTier) => void;
  onAddPick: () => void;
  addPickLabel: string;
}) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ color, fontSize: 12, fontWeight: 800, marginBottom: 10 }}>{title}</div>
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search for player..."
        style={{ width: "100%", boxSizing: "border-box", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "9px 12px", fontFamily: "inherit", fontSize: 13 }}
      />
      <div style={{ marginTop: 8, display: "grid", gap: 4, maxHeight: 320, overflowY: "auto" }}>
        {isLoading && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Searching...</div>}
        {!isLoading && search.trim().length >= 2 && !results.length && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No results.</div>}
        {results.map((player) => (
          <button
            key={player.player_id}
            type="button"
            onClick={() => onAddPlayer(player)}
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, background: "transparent", color: "var(--text)", display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
          >
            <span style={{ fontSize: 10, fontWeight: 800, width: 22, color: posColor(player.position) }}>{player.position}</span>
            <span style={{ flex: 1, fontSize: 12 }}>{player.label}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>+ {addPickLabel === "Send Pick" ? "SEND" : "GET"}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>Add Pick:</span>
        <select value={pickSeason} onChange={(event) => onPickSeasonChange(event.target.value)} style={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }}>{PICK_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</select>
        <select value={pickRound} onChange={(event) => onPickRoundChange(Number(event.target.value))} style={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }}>{[1, 2, 3, 4].map((round) => <option key={round} value={round}>Round {round}</option>)}</select>
        <select value={pickTier} onChange={(event) => onPickTierChange(event.target.value as PickTier)} style={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }}>
          <option value="early">Early</option>
          <option value="mid">Mid</option>
          <option value="late">Late</option>
        </select>
        <button type="button" onClick={onAddPick} style={{ background: color, border: "none", borderRadius: 7, color: "#fff", padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ {addPickLabel}</button>
      </div>
    </div>
  );
}

function RosterGrid({
  roster,
  usedPlayerIds,
  usedPickKeys,
  onPlayerClick,
  onPickClick,
}: {
  roster: RosterRanking | null;
  usedPlayerIds: Set<string>;
  usedPickKeys: Set<string>;
  onPlayerClick: (p: CoreAsset) => void;
  onPickClick: (p: ScoredPick) => void;
}) {
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

export default function TradeCalculator() {
  const [selectedLeague, setSelectedLeague] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<number | null>(null);
  const [sendAssets, setSendAssets] = useState<TradeAssetInput[]>([]);
  const [receiveAssets, setReceiveAssets] = useState<TradeAssetInput[]>([]);
  const [sendLabels, setSendLabels] = useState<string[]>([]);
  const [receiveLabels, setReceiveLabels] = useState<string[]>([]);
  const [sendSearch, setSendSearch] = useState("");
  const [receiveSearch, setReceiveSearch] = useState("");
  const [sendPickSeason, setSendPickSeason] = useState(PICK_YEARS[0]);
  const [sendPickRound, setSendPickRound] = useState(1);
  const [sendPickTier, setSendPickTier] = useState<PickTier>("mid");
  const [receivePickSeason, setReceivePickSeason] = useState(PICK_YEARS[0]);
  const [receivePickRound, setReceivePickRound] = useState(1);
  const [receivePickTier, setReceivePickTier] = useState<PickTier>("mid");
  const [copied, setCopied] = useState(false);
  const [isCompactLeagueLayout, setIsCompactLeagueLayout] = useState(() => (
    typeof window !== "undefined" ? window.innerWidth < 1180 : false
  ));

  const storedUsername = typeof window !== "undefined" ? localStorage.getItem("edge_username") ?? "" : "";
  const { data: leagues = [] } = usePowerRankings(storedUsername);
  const selectedLeagueData = leagues.find((l) => l.league_id === selectedLeague);
  const userRoster = selectedLeagueData?.rosters.find((r) => r.is_user) ?? null;
  const oppRoster = selectedLeagueData?.rosters.find((r) => r.roster_id === selectedOpponent) ?? null;

  const { data: opponentData } = useQuery<OpponentContextResponse>({
    queryKey: ["opponent-context", storedUsername, selectedLeague],
    queryFn: () => apiFetch(`/api/trade/opponent-context/${encodeURIComponent(storedUsername)}/${encodeURIComponent(selectedLeague)}`),
    enabled: !!storedUsername && !!selectedLeague,
    staleTime: 5 * 60 * 1000,
  });
  const opponents = opponentData?.opponents ?? [];
  const activeOpponent = opponents.find((o) => o.roster_id === selectedOpponent) ?? null;

  const { data: sendSearchResults = [], isLoading: sendSearchLoading } = useQuery<SearchAsset[]>({
    queryKey: ["trade-calc-search", "send", sendSearch],
    queryFn: () => apiFetch(`/api/trade/assets?q=${encodeURIComponent(sendSearch.trim())}&limit=12`),
    enabled: !selectedLeague && sendSearch.trim().length >= 2,
  });
  const { data: receiveSearchResults = [], isLoading: receiveSearchLoading } = useQuery<SearchAsset[]>({
    queryKey: ["trade-calc-search", "receive", receiveSearch],
    queryFn: () => apiFetch(`/api/trade/assets?q=${encodeURIComponent(receiveSearch.trim())}&limit=12`),
    enabled: !selectedLeague && receiveSearch.trim().length >= 2,
  });

  useEffect(() => {
    setSelectedOpponent(null);
    setSendAssets([]);
    setReceiveAssets([]);
    setSendLabels([]);
    setReceiveLabels([]);
  }, [selectedLeague]);

  useEffect(() => {
    if (opponents.length > 0 && !selectedOpponent) {
      const best = [...opponents].sort((a, b) => (b.behavior?.recent_trades ?? 0) - (a.behavior?.recent_trades ?? 0) || b.needs.length - a.needs.length)[0];
      if (best) setSelectedOpponent(best.roster_id);
    }
  }, [opponents, selectedOpponent]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncLayout = () => setIsCompactLeagueLayout(window.innerWidth < 1180);
    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => window.removeEventListener("resize", syncLayout);
  }, []);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const evalMutation = useEvaluateTrade();
  const hasBothSides = sendAssets.length > 0 && receiveAssets.length > 0;

  useEffect(() => {
    if (!hasBothSides) {
      evalMutation.reset();
      return;
    }
    const mode = selectedLeagueData?.mode ?? "sf";
    const timer = setTimeout(() => {
      evalMutation.mutate({ sideA: sendAssets, sideB: receiveAssets, mode, leagueId: selectedLeague || undefined });
    }, 400);
    return () => clearTimeout(timer);
  }, [sendAssets, receiveAssets, selectedLeague, selectedLeagueData?.mode]);

  const result = evalMutation.data;
  const userCoreAssetMap = useMemo(() => new Map((userRoster?.core_assets ?? []).map((asset) => [asset.player_id, asset])), [userRoster]);
  const oppCoreAssetMap = useMemo(() => new Map((oppRoster?.core_assets ?? []).map((asset) => [asset.player_id, asset])), [oppRoster]);
  const liveAcceptance = useMemo(() => {
    if (!result || !activeOpponent) return null;
    const sendAcceptanceAssets: AcceptanceAssetView[] = result.sideA.assets.map((asset) => {
      const meta = asset.player_id ? userCoreAssetMap.get(asset.player_id) : undefined;
      return {
        ...asset,
        age: meta?.age ?? null,
        age_curve_zone: meta?.age_curve?.zone ?? null,
      };
    });
    const receiveAcceptanceAssets: AcceptanceAssetView[] = result.sideB.assets.map((asset) => {
      const meta = asset.player_id ? oppCoreAssetMap.get(asset.player_id) : undefined;
      return {
        ...asset,
        age: meta?.age ?? null,
        age_curve_zone: meta?.age_curve?.zone ?? null,
      };
    });
    return computeAcceptance({
      fairness: result.fairness,
      delta: result.delta,
      sendAssets: sendAcceptanceAssets,
      receiveAssets: receiveAcceptanceAssets,
      opponent: activeOpponent,
    });
  }, [result, activeOpponent, userCoreAssetMap, oppCoreAssetMap]);

  const sendPlayerIds = useMemo(() => new Set(sendAssets.filter((a): a is TradeAssetInput & { type: "player"; player_id: string } => a.type === "player" && !!a.player_id).map((a) => a.player_id)), [sendAssets]);
  const receivePlayerIds = useMemo(() => new Set(receiveAssets.filter((a): a is TradeAssetInput & { type: "player"; player_id: string } => a.type === "player" && !!a.player_id).map((a) => a.player_id)), [receiveAssets]);
  const sendPickKeys = useMemo(() => new Set(sendAssets.filter((a) => a.type === "pick").map((a) => assetKey(a))), [sendAssets]);
  const receivePickKeys = useMemo(() => new Set(receiveAssets.filter((a) => a.type === "pick").map((a) => assetKey(a))), [receiveAssets]);

  function removeSend(idx: number) {
    setSendAssets((p) => p.filter((_, i) => i !== idx));
    setSendLabels((p) => p.filter((_, i) => i !== idx));
  }
  function removeReceive(idx: number) {
    setReceiveAssets((p) => p.filter((_, i) => i !== idx));
    setReceiveLabels((p) => p.filter((_, i) => i !== idx));
  }
  function clearSide(side: Side) {
    if (side === "send") {
      setSendAssets([]);
      setSendLabels([]);
    } else {
      setReceiveAssets([]);
      setReceiveLabels([]);
    }
  }
  function toggleAsset(side: Side, a: TradeAssetInput, label: string) {
    const key = assetKey(a);
    if (side === "send") {
      const idx = sendAssets.findIndex((x) => assetKey(x) === key);
      if (idx >= 0) return removeSend(idx);
      if (receiveAssets.some((x) => assetKey(x) === key)) return;
      setSendAssets((p) => [...p, a]);
      setSendLabels((p) => [...p, label]);
      return;
    }
    const idx = receiveAssets.findIndex((x) => assetKey(x) === key);
    if (idx >= 0) return removeReceive(idx);
    if (sendAssets.some((x) => assetKey(x) === key)) return;
    setReceiveAssets((p) => [...p, a]);
    setReceiveLabels((p) => [...p, label]);
  }
  function addFromRoster(player: CoreAsset, side: Side) {
    toggleAsset(side, { type: "player", player_id: player.player_id }, `${player.full_name} (${player.position})`);
  }
  function addPick(pick: ScoredPick, side: Side) {
    toggleAsset(side, pickToAsset(pick), pickDisplay(pick));
  }
  function addVacuumPick(side: Side) {
    const pickSeason = side === "send" ? sendPickSeason : receivePickSeason;
    const pickRound = side === "send" ? sendPickRound : receivePickRound;
    const pickTier = side === "send" ? sendPickTier : receivePickTier;
    const roundLabel = pickRound === 1 ? "1st" : pickRound === 2 ? "2nd" : pickRound === 3 ? "3rd" : `R${pickRound}`;
    const tierLabel = `${pickTier.charAt(0).toUpperCase()}${pickTier.slice(1)}`;
    const label = `${pickSeason} ${tierLabel} ${roundLabel}`;
    toggleAsset(side, { type: "pick", pick_season: pickSeason, pick_round: pickRound, pick_tier: pickTier, pick_label: label }, label);
  }

  const leagueColumns = isCompactLeagueLayout ? "1fr" : "minmax(0, 1fr) 320px minmax(0, 1fr)";
  const rosterPaneStyle = {
    maxHeight: isCompactLeagueLayout ? "none" : "70vh",
    overflowY: isCompactLeagueLayout ? "visible" : "auto",
  } as const;
  const centerPaneStyle = {
    position: isCompactLeagueLayout ? "static" : "sticky",
    top: isCompactLeagueLayout ? undefined : 80,
    maxHeight: isCompactLeagueLayout ? "none" : "85vh",
    overflowY: isCompactLeagueLayout ? "visible" : "auto",
    display: "grid",
    gap: 12,
    alignSelf: "start",
  } as const;

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Calculator</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Click your roster and your opponent roster. Evaluation and acceptance update live.</p>
        <FreshnessBar leagueId={selectedLeague || undefined} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 700 }}>LEAGUE</div>
          <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)} style={{ width: "100%", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}>
            <option value="">No league selected (vacuum mode)</option>
            {leagues.map((l) => <option key={l.league_id} value={l.league_id}>{l.league_name} ({l.mode.toUpperCase()}{l.scoring_label ? ` · ${l.scoring_label}` : ""})</option>)}
          </select>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 700 }}>OPPONENT</div>
          <select value={selectedOpponent ?? ""} onChange={(e) => setSelectedOpponent(e.target.value ? Number(e.target.value) : null)} disabled={!selectedLeague || opponents.length === 0} style={{ width: "100%", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", padding: "8px 10px", fontFamily: "inherit", fontSize: 13, opacity: !selectedLeague ? 0.6 : 1 }}>
            <option value="">{selectedLeague ? "Select opponent..." : "Select a league first"}</option>
            {opponents.map((o) => <option key={o.roster_id} value={o.roster_id}>{o.display_name}{o.team_name ? ` (${o.team_name})` : ""} | {o.archetype}</option>)}
          </select>
        </div>
      </div>

      {!selectedLeague && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: leagueColumns, gap: 12, alignItems: "start" }}>
          <div style={{ ...rosterPaneStyle, display: "grid", gap: 12, alignSelf: "start", order: 1 }}>
            <VacuumSearchColumn
              title="YOU SEND"
              color="#ef4444"
              search={sendSearch}
              onSearchChange={setSendSearch}
              results={sendSearchResults}
              isLoading={sendSearchLoading}
              onAddPlayer={(player) => toggleAsset("send", { type: "player", player_id: player.player_id }, player.label)}
              pickSeason={sendPickSeason}
              onPickSeasonChange={setSendPickSeason}
              pickRound={sendPickRound}
              onPickRoundChange={setSendPickRound}
              pickTier={sendPickTier}
              onPickTierChange={setSendPickTier}
              onAddPick={() => addVacuumPick("send")}
              addPickLabel="Send Pick"
            />
          </div>
          <div style={{ ...centerPaneStyle, order: 2 }}>
            <TradePanel title="YOU SEND" color="#ef4444" labels={sendLabels} evaluated={result?.sideA.assets ?? null} onRemove={removeSend} onClear={() => clearSide("send")} />
            <EvalBar result={result} acceptance={null} hasBothSides={hasBothSides} isPending={evalMutation.isPending} />
            <TradePanel title="YOU GET" color="#22c55e" labels={receiveLabels} evaluated={result?.sideB.assets ?? null} onRemove={removeReceive} onClear={() => clearSide("receive")} />
          </div>
          <div style={{ ...rosterPaneStyle, display: "grid", gap: 12, alignSelf: "start", order: 3 }}>
            <VacuumSearchColumn
              title="YOU GET"
              color="#22c55e"
              search={receiveSearch}
              onSearchChange={setReceiveSearch}
              results={receiveSearchResults}
              isLoading={receiveSearchLoading}
              onAddPlayer={(player) => toggleAsset("receive", { type: "player", player_id: player.player_id }, player.label)}
              pickSeason={receivePickSeason}
              onPickSeasonChange={setReceivePickSeason}
              pickRound={receivePickRound}
              onPickRoundChange={setReceivePickRound}
              pickTier={receivePickTier}
              onPickTierChange={setReceivePickTier}
              onAddPick={() => addVacuumPick("receive")}
              addPickLabel="Get Pick"
            />
          </div>
        </div>
      )}

      {selectedLeague && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: leagueColumns, gap: 12, alignItems: "start" }}>
          <div style={{ ...rosterPaneStyle, order: isCompactLeagueLayout ? 2 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><div style={{ color: "#ef4444", fontSize: 12, fontWeight: 800 }}>YOUR ROSTER</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{userRoster?.display_name ?? "-"}</div></div>
            <RosterGrid roster={userRoster} usedPlayerIds={sendPlayerIds} usedPickKeys={sendPickKeys} onPlayerClick={(p) => addFromRoster(p, "send")} onPickClick={(p) => addPick(p, "send")} />
          </div>
          <div style={{ ...centerPaneStyle, order: isCompactLeagueLayout ? 1 : 2 }}>
            <TradePanel title="YOU SEND" color="#ef4444" labels={sendLabels} evaluated={result?.sideA.assets ?? null} onRemove={removeSend} onClear={() => clearSide("send")} />
            <EvalBar result={result} acceptance={liveAcceptance} hasBothSides={hasBothSides} isPending={evalMutation.isPending} />
            <TradePanel title="YOU GET" color="#22c55e" labels={receiveLabels} evaluated={result?.sideB.assets ?? null} onRemove={removeReceive} onClear={() => clearSide("receive")} />
            <AcceptanceBadge acceptance={liveAcceptance} opponent={activeOpponent} />
            {result && selectedLeague && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a
                  href={`https://sleeper.app/leagues/${selectedLeague}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 16px",
                    borderRadius: 8,
                    background: "rgba(55, 65, 81, 0.5)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  Open in Sleeper
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const msg = buildTradeMessage(
                      result,
                      result.sideA.assets.map((asset) => asset.label),
                      result.sideB.assets.map((asset) => asset.label),
                      activeOpponent,
                      liveAcceptance
                    );
                    navigator.clipboard.writeText(msg);
                    setCopied(true);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 16px",
                    borderRadius: 8,
                    background: "rgba(245,158,11,0.15)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    color: "var(--amber)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {copied ? "Copied!" : "Copy Trade Message"}
                </button>
              </div>
            )}
          </div>
          <div style={{ ...rosterPaneStyle, order: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><div style={{ color: "#22c55e", fontSize: 12, fontWeight: 800 }}>THEIR ROSTER</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{oppRoster?.display_name ?? "Select opponent"}</div></div>
            <RosterGrid roster={oppRoster} usedPlayerIds={receivePlayerIds} usedPickKeys={receivePickKeys} onPlayerClick={(p) => addFromRoster(p, "receive")} onPickClick={(p) => addPick(p, "receive")} />
          </div>
        </div>
      )}

    </AppShell>
  );
}
