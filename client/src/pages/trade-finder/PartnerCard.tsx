import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PickBadge, PlayerLink, PositionBadge } from "../../components/ui";
import {
  acceptanceColor,
  fairnessLabel,
  humanize,
  warningColors,
} from "../../lib/format";
import { buildTradeCalculatorUrl } from "../../lib/trade-calculator-url";
import { buildTradeFinderUrl } from "../../lib/trade-finder-url";
import type {
  TradeHealthWarning,
  TradeFinderConstraint,
  TradeFinderSearchDepth,
  TradePackage,
  TradePackageAsset,
  TradePartnerTarget,
  TradeSuggestion,
  TradeAssetInput,
  TradeStrategyType,
} from "@shared/types";

function opportunityLabel(type: TradePackage["opportunity_type"]): string | null {
  if (!type) return null;
  const labels: Record<NonNullable<TradePackage["opportunity_type"]>, string> = {
    buy_target: "Buy Target",
    sell_player: "Sell for Youth",
    consolidate: "Consolidate",
    deconsolidate: "Deconsolidate",
    need_based: "Need-Based",
    player_plus_pick: "Player + Pick",
    pick_sweetener: "Pick Sweetener",
    pick_swap: "Pick Swap",
  };
  return labels[type];
}

function qualityTierLabel(tier: TradePackage["quality_tier"]): string | null {
  if (!tier) return null;
  if (tier === "low_confidence") return "Low Confidence";
  return humanize(tier);
}

export function TradeHealthList({ warnings }: { warnings: TradeHealthWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
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

function leagueRatingColor(score: number): string {
  if (score >= 85) return "var(--green)";
  if (score >= 70) return "var(--amber)";
  if (score >= 55) return "var(--text-muted)";
  return "var(--red)";
}

function AssetRow({ asset }: { asset: TradePackageAsset }) {
  const adjustedDiff =
    asset.league_adjusted_score != null ? asset.league_adjusted_score - asset.edge_score : 0;
  const pickBreakdown = asset.pick_breakdown ?? null;
  const rating = asset.league_rating ?? null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 13, flexWrap: "wrap" }}>
      <span
        style={{
          display: "inline-block",
          background: asset.edge_score >= 80 ? "var(--green)" : asset.edge_score >= 60 ? "var(--amber)" : asset.edge_score >= 45 ? "var(--text-muted)" : "var(--red)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          borderRadius: 4,
          padding: "1px 6px",
          minWidth: 28,
          textAlign: "center",
        }}
      >
        {Math.round(asset.edge_score)}
      </span>
      {asset.trade_power > 0 && (
        <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
          TP:{asset.trade_power.toFixed(1)}
        </span>
      )}
      {asset.asset_type === "pick" && <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 10 }}>PICK</span>}
      {asset.position && <PositionBadge position={asset.position} />}
      {pickBreakdown ? (
        <div style={{ flex: 1 }}>
          <PickBadge pick={pickBreakdown} compact />
        </div>
      ) : (
        <PlayerLink name={asset.label} style={{ flex: 1, fontWeight: 500 }} />
      )}
      {asset.league_adjusted_score != null && Math.abs(adjustedDiff) >= 1 && (
        <span
          style={{
            fontSize: 10,
            color: adjustedDiff > 0 ? "var(--green)" : "var(--red)",
            fontWeight: 600,
            width: "100%",
            paddingLeft: 36,
          }}
        >
          {adjustedDiff > 0 ? "+" : ""}
          {adjustedDiff.toFixed(1)} in this league
        </span>
      )}
      {rating && (
        <span
          style={{
            fontSize: 10,
            color: leagueRatingColor(rating.rating),
            fontWeight: 700,
            width: "100%",
            paddingLeft: 36,
          }}
        >
          LR {rating.rating} {rating.grade}
          {rating.league_value_delta_pct !== 0 && (
            <>
              {" "}
              ({rating.league_value_delta_pct > 0 ? "+" : ""}
              {rating.league_value_delta_pct.toFixed(1)}%)
            </>
          )}
          {rating.tags.length > 0 ? ` | ${rating.tags.slice(0, 2).join(", ")}` : ""}
        </span>
      )}
    </div>
  );
}

function PackageView({ pkg }: { pkg: TradePackage }) {
  const oppLabel = opportunityLabel(pkg.opportunity_type);
  const tierLabel = qualityTierLabel(pkg.quality_tier);
  const qualityLabel = pkg.package_quality_label
    ? humanize(pkg.package_quality_label)
    : null;

  return (
    <div>
      {(oppLabel || tierLabel || qualityLabel || pkg.strategy_label || pkg.is_pick_only != null) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {pkg.strategy_label && (
            <span style={{ fontSize: 10, fontWeight: 800, color: "#3b82f6", border: "1px solid rgba(59,130,246,0.35)", borderRadius: 999, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>
              {pkg.strategy_label}
            </span>
          )}
          {pkg.strategy_fit && (
            <span style={{ fontSize: 10, fontWeight: 800, color: pkg.strategy_fit === "strong" ? "var(--green)" : pkg.strategy_fit === "reasonable" ? "var(--amber)" : pkg.strategy_fit === "thin" ? "var(--text-muted)" : "var(--red)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>
              {humanize(pkg.strategy_fit)} Thesis
            </span>
          )}
          {oppLabel && (
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--amber)", border: "1px solid rgba(61,139,253,0.35)", borderRadius: 999, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>
              {oppLabel}
            </span>
          )}
          {tierLabel && (
            <span style={{ fontSize: 10, fontWeight: 800, color: pkg.quality_tier === "strong" ? "var(--green)" : pkg.quality_tier === "speculative" ? "var(--amber)" : "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>
              {tierLabel}
            </span>
          )}
          {qualityLabel && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>
              {qualityLabel}
            </span>
          )}
          {pkg.is_pick_only && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#06b6d4", border: "1px solid rgba(6,182,212,0.32)", borderRadius: 999, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Pick Only
            </span>
          )}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: 0.5, marginBottom: 8, borderBottom: "2px solid #ef4444", paddingBottom: 4 }}>
            YOU SEND ({pkg.send_total.toFixed(1)} TP)
            <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
              ({pkg.send_edge.toFixed(1)} edge)
            </span>
            {pkg.package_penalty_pct_send > 0 && (
              <span style={{ color: "var(--red)", fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
                ({pkg.package_penalty_pct_send}% pkg penalty)
              </span>
            )}
          </div>
          {pkg.you_send.map((asset, i) => <AssetRow key={`send-${i}-${asset.label}`} asset={asset} />)}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", letterSpacing: 0.5, marginBottom: 8, borderBottom: "2px solid #22c55e", paddingBottom: 4 }}>
            YOU RECEIVE ({pkg.receive_total.toFixed(1)} TP)
            <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
              ({pkg.receive_edge.toFixed(1)} edge)
            </span>
            {pkg.package_penalty_pct_receive > 0 && (
              <span style={{ color: "var(--red)", fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
                ({pkg.package_penalty_pct_receive}% pkg penalty)
              </span>
            )}
          </div>
          {pkg.you_receive.map((asset, i) => <AssetRow key={`receive-${i}-${asset.label}`} asset={asset} />)}
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, marginTop: 12, padding: "8px 0", color: pkg.delta >= 0 ? "var(--green)" : "var(--red)" }}>
        {pkg.delta >= 0 ? "You win" : "You overpay"} by {Math.abs(pkg.delta).toFixed(1)} TP
        <span style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 500, marginLeft: 6 }}>
          (raw edge: {pkg.delta_edge > 0 ? "+" : ""}{pkg.delta_edge.toFixed(1)})
        </span>
        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600 }}>({fairnessLabel(pkg.fairness)})</span>
      </div>

      <TradeHealthList warnings={pkg.healthCheck} />

      {pkg.trade_thesis && (
        <div style={{ marginTop: 10, background: "rgba(61,139,253,0.08)", border: "1px solid rgba(61,139,253,0.22)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#3b82f6", letterSpacing: 0.5, marginBottom: 4 }}>TRADE THESIS</div>
          <div>{pkg.trade_thesis}</div>
          {pkg.strategy_warnings && pkg.strategy_warnings.length > 0 && (
            <div style={{ marginTop: 6, color: "var(--amber)", fontSize: 11 }}>
              {pkg.strategy_warnings.slice(0, 2).join(" | ")}
            </div>
          )}
        </div>
      )}

      {pkg.acceptance && (
        <div style={{ marginTop: 10, background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>
              ACCEPTANCE SIGNAL
            </div>
            <span style={{ background: acceptanceColor(pkg.acceptance.label), color: pkg.acceptance.label === "Possible" ? "var(--dark-base)" : "#fff", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 800 }}>
              {pkg.acceptance.label} ({Math.round(pkg.acceptance.probability)}%)
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div>
              {pkg.acceptance.accept_reasons.slice(0, 2).map((r, i) => (
                <div key={`acc-${i}`} style={{ fontSize: 11, color: "var(--green)", lineHeight: 1.5 }}>
                  - {r}
                </div>
              ))}
            </div>
            <div>
              {pkg.acceptance.reject_reasons.slice(0, 2).map((r, i) => (
                <div key={`rej-${i}`} style={{ fontSize: 11, color: "var(--red)", lineHeight: 1.5 }}>
                  - {r}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12, fontSize: 12 }}>
        <div style={{ background: "var(--dark-base)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--amber)", marginBottom: 4, letterSpacing: 0.5 }}>WHY YOU DO IT</div>
          <div style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>{pkg.why_you_do_it}</div>
        </div>
        <div style={{ background: "var(--dark-base)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", marginBottom: 4, letterSpacing: 0.5 }}>WHY THEY ACCEPT</div>
          <div style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>{pkg.why_they_accept}</div>
        </div>
      </div>

      {pkg.sweetener_hint && (
        <div style={{ marginTop: 10, padding: "8px 14px", background: "rgba(61,139,253,0.08)", border: "1px solid rgba(61,139,253,0.2)", borderRadius: 8, fontSize: 12, color: "var(--amber)" }}>
          {pkg.sweetener_hint}
        </div>
      )}
    </div>
  );
}

interface PartnerCardSteering {
  targetPlayerId: string | null;
  setTargetPlayerId: Dispatch<SetStateAction<string | null>>;
  avoidTargetPlayerIds: string[];
  setAvoidTargetPlayerIds: Dispatch<SetStateAction<string[]>>;
  laneConstraints: TradeFinderConstraint[];
  setLaneConstraints: Dispatch<SetStateAction<TradeFinderConstraint[]>>;
  strategyFocus: TradeStrategyType | null;
  setStrategyFocus: Dispatch<SetStateAction<TradeStrategyType | null>>;
  searchDepth: TradeFinderSearchDepth;
  setSearchDepth: Dispatch<SetStateAction<TradeFinderSearchDepth>>;
  partnerTargets: TradePartnerTarget[];
  partnerTargetsLoading: boolean;
  leagueId: string;
  opponentRosterId: number | null;
}

const constraintLabels: Array<{ value: TradeFinderConstraint; label: string }> = [
  { value: "cheaper", label: "Cheaper" },
  { value: "no_firsts", label: "No 1sts" },
  { value: "more_picks_back", label: "More picks back" },
  { value: "only_qb_tier_down", label: "QB tier-down" },
  { value: "no_qbs", label: "No QB trades" },
  { value: "no_picks", label: "No picks" },
  { value: "same_position_return", label: "Same-position return" },
  { value: "no_aging_rbs", label: "No aging RBs" },
  { value: "win_now_only", label: "Win-now only" },
  { value: "more_realistic", label: "More realistic" },
];

const strategyLabels: Array<{ value: TradeStrategyType; label: string }> = [
  { value: "consolidation", label: "Consolidate" },
  { value: "tier_down", label: "Tier down" },
  { value: "win_now_buy", label: "Win-now" },
  { value: "productive_struggle", label: "Productive struggle" },
  { value: "pick_arbitrage", label: "Pick arbitrage" },
  { value: "position_arbitrage", label: "Position edge" },
  { value: "roster_spot_arbitrage", label: "Roster spots" },
  { value: "liquidity_upgrade", label: "Liquidity" },
  { value: "market_value", label: "Pure value" },
];

const strategyDescriptions: Record<TradeStrategyType, string> = {
  consolidation: "Trade 2-4 smaller pieces for one better weekly starter.",
  tier_down: "Move one premium asset for a lesser same-position anchor plus added value.",
  buy_low: "Target a temporarily discounted player before the market warms up.",
  sell_high: "Move a player after a value spike before the market cools.",
  win_now_buy: "Buy immediate points, usually older production, when the title window matters.",
  rebuild_sell: "Turn fragile current production into younger or more liquid value.",
  productive_struggle: "Sell short-term points while staying competitive enough to matter.",
  pick_arbitrage: "Use draft-pick timing and hype cycles, without empty pick-swap spam.",
  position_arbitrage: "Exploit SF, TEP, scoring, and positional scarcity.",
  roster_fit_trade: "Swap surplus for a need on both teams.",
  roster_spot_arbitrage: "Turn bench clutter into one asset you can actually start.",
  manager_exploit: "Shape the offer around what this manager tends to overvalue.",
  liquidity_upgrade: "Trade into assets that are easier to flip later.",
  market_value: "Chase raw market value and optionality over roster fit.",
};

function strategyLabel(value: TradeStrategyType | null): string {
  if (!value) return "Any trade shape";
  return strategyLabels.find((strategy) => strategy.value === value)?.label ?? humanize(value);
}

function strategyDescription(value: TradeStrategyType | null): string {
  if (!value) return "Show the best realistic lanes first, then let you narrow from there.";
  return strategyDescriptions[value];
}

function assetShort(asset: TradePackageAsset): string {
  if (asset.asset_type === "pick") return asset.label;
  return asset.label;
}

function assetSummary(assets: TradePackageAsset[], max = 2): string {
  if (assets.length === 0) return "No assets";
  const shown = assets.slice(0, max).map(assetShort);
  const extra = assets.length - shown.length;
  return extra > 0 ? `${shown.join(" + ")} + ${extra} more` : shown.join(" + ");
}

function primaryReceiveAsset(pkg: TradePackage): TradePackageAsset | null {
  const players = pkg.you_receive.filter((asset) => asset.asset_type === "player");
  const candidates = players.length > 0 ? players : pkg.you_receive;
  return [...candidates].sort((a, b) => b.edge_score - a.edge_score)[0] ?? null;
}

function receivePlayerIds(pkg: TradePackage): string[] {
  return pkg.you_receive
    .filter((asset) => asset.asset_type === "player" && asset.player_id)
    .map((asset) => String(asset.player_id));
}

function packageAssetToTradeInput(asset: TradePackageAsset): TradeAssetInput {
  if (asset.asset_type === "player") {
    return { type: "player", player_id: asset.player_id ?? undefined };
  }
  return {
    type: "pick",
    pick_season: asset.pick_season,
    pick_round: asset.pick_round,
    pick_tier: asset.pick_tier,
    pick_slot: asset.pick_slot,
    pick_label: asset.label,
    pick_original_owner_id: asset.pick_original_owner_id,
  };
}

function normalizeStrategyFocus(strategy: TradeStrategyType | null | undefined): TradeStrategyType | null {
  if (!strategy) return null;
  if (strategy === "rebuild_sell" || strategy === "productive_struggle") return "tier_down";
  if (strategy === "roster_spot_arbitrage") return "consolidation";
  if (strategy === "roster_fit_trade") return "position_arbitrage";
  return strategy;
}

function componentColor(value: number | undefined): string {
  if (value == null) return "var(--text-muted)";
  if (value >= 70) return "var(--green)";
  if (value >= 45) return "var(--amber)";
  return "var(--text-muted)";
}

function laneTitle(pkg: TradePackage): string {
  const target = primaryReceiveAsset(pkg);
  const strategy = pkg.strategy_label || opportunityLabel(pkg.opportunity_type) || pkg.label;
  return target ? `${strategy}: ${target.label}` : strategy;
}

function laneConfidence(pkg: TradePackage): string {
  if (pkg.quality_tier === "low_confidence") return "Thin";
  if (pkg.quality_tier === "strong") return "Strong";
  if (pkg.quality_tier === "speculative") return "Maybe";
  if (pkg.acceptance?.label) return pkg.acceptance.label;
  return "Thin";
}

type TradeDecision = "pursue" | "tweak" | "ignore";

function tradeDecision(pkg: TradePackage): {
  decision: TradeDecision;
  label: string;
  reason: string;
  nextAction: string;
  color: string;
} {
  const acceptance = pkg.acceptance?.probability ?? 0;
  const valueEdge = pkg.valuation_edge ?? pkg.delta;
  const hasBlock = pkg.healthCheck.some((warning) => warning.type === "block");
  const usefulShape = Boolean(pkg.has_anchor_asset || pkg.addresses_my_need || pkg.addresses_their_need || pkg.strategy_fit === "strong");

  if (hasBlock || pkg.package_quality_label === "poor" || (pkg.quality_tier === "low_confidence" && !usefulShape)) {
    return {
      decision: "ignore",
      label: "Ignore",
      reason: hasBlock ? "A hard quality rule is blocking this lane." : "The package shape is too thin to pursue.",
      nextAction: "Use Not this player or Find more like this.",
      color: "var(--text-muted)",
    };
  }

  if (pkg.fairness === "lopsided" && valueEdge < -1_500) {
    return {
      decision: "ignore",
      label: "Ignore",
      reason: "You are paying too much for this shape.",
      nextAction: "Make it cheaper before using calculator time.",
      color: "var(--red)",
    };
  }

  if (pkg.quality_tier === "strong" && acceptance >= 35 && valueEdge >= -1_000) {
    return {
      decision: "pursue",
      label: "Pursue",
      reason: "The value, shape, and acceptance signals are aligned enough to work.",
      nextAction: "Open it in Calculator and tune the last asset.",
      color: "var(--green)",
    };
  }

  return {
    decision: "tweak",
    label: "Tweak",
    reason: acceptance < 25 ? "The idea is useful, but acceptance is weak." : "The lane is close, but the price or shape needs work.",
    nextAction: acceptance < 25 ? "Add value or switch the target." : "Try Cheaper, No picks, or Same-position return.",
    color: "var(--amber)",
  };
}

export function shouldShowAsDefaultTradeLane(pkg: TradePackage): boolean {
  return tradeDecision(pkg).decision !== "ignore";
}

function addUniqueConstraint(
  setter: Dispatch<SetStateAction<TradeFinderConstraint[]>>,
  constraint: TradeFinderConstraint
) {
  setter((current) => current.includes(constraint) ? current : [...current, constraint]);
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((entry) => bSet.has(entry));
}

function LaneAssetBox({
  label,
  assets,
  side,
}: {
  label: string;
  assets: TradePackageAsset[];
  side: "send" | "receive";
}) {
  return (
    <div style={{ border: "1px solid var(--border)", borderLeft: `3px solid ${side === "send" ? "#ef4444" : "#22c55e"}`, borderRadius: 10, padding: 12, background: "var(--dark-base)" }}>
      <div style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      {assets.map((asset, index) => (
        <div key={`${side}-${asset.label}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderTop: index === 0 ? "none" : "1px solid var(--border)", fontSize: 12, alignItems: "center" }}>
          <span style={{ fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.label}</span>
          <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{asset.position ?? "Pick"} {Math.round(asset.edge_score)}</span>
        </div>
      ))}
    </div>
  );
}

function FeedbackAction({
  label,
  onClick,
  href,
  disabled,
  primary = false,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  const style = {
    border: primary ? "1px solid rgba(59,130,246,0.65)" : "1px solid var(--border)",
    background: primary ? "rgba(59,130,246,0.14)" : "var(--dark-base)",
    color: disabled ? "var(--text-muted)" : primary ? "#93c5fd" : "var(--text-dim)",
    borderRadius: 999,
    padding: "8px 11px",
    fontSize: 11,
    fontWeight: 900,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    opacity: disabled ? 0.55 : 1,
  } satisfies React.CSSProperties;

  if (href && !disabled) {
    return <a href={href} style={style}>{label}</a>;
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {label}
    </button>
  );
}

function SteeringPanel({
  steering,
  packages,
  activePackage,
}: {
  steering: PartnerCardSteering;
  packages: TradePackage[];
  activePackage: TradePackage | null;
}) {
  const [targetSearch, setTargetSearch] = useState("");
  const [draftTargetPlayerId, setDraftTargetPlayerId] = useState<string | null>(steering.targetPlayerId);
  const [draftAvoidTargetPlayerIds, setDraftAvoidTargetPlayerIds] = useState<string[]>(steering.avoidTargetPlayerIds);
  const [draftLaneConstraints, setDraftLaneConstraints] = useState<TradeFinderConstraint[]>(steering.laneConstraints);
  const [draftStrategyFocus, setDraftStrategyFocus] = useState<TradeStrategyType | null>(steering.strategyFocus);
  const [draftSearchDepth, setDraftSearchDepth] = useState<TradeFinderSearchDepth>(steering.searchDepth);
  const steeringAvoidKey = steering.avoidTargetPlayerIds.join("|");
  const steeringConstraintKey = steering.laneConstraints.join("|");
  const selectedTarget = steering.partnerTargets.find((target) => target.player_id === draftTargetPlayerId) ?? null;
  const hasDraftChanges =
    draftTargetPlayerId !== steering.targetPlayerId ||
    !sameStringSet(draftAvoidTargetPlayerIds, steering.avoidTargetPlayerIds) ||
    !sameStringSet(draftLaneConstraints, steering.laneConstraints) ||
    draftStrategyFocus !== steering.strategyFocus ||
    draftSearchDepth !== steering.searchDepth;
  const visibleTargets = useMemo(() => {
    const needle = targetSearch.trim().toLowerCase();
    if (!needle) return selectedTarget ? [selectedTarget] : [];
    const base = needle
      ? steering.partnerTargets.filter((target) =>
          `${target.full_name} ${target.position} ${target.tags.join(" ")}`.toLowerCase().includes(needle)
        )
      : [];
    return base.slice(0, 8);
  }, [selectedTarget, steering.partnerTargets, targetSearch]);

  useEffect(() => {
    setDraftTargetPlayerId(steering.targetPlayerId);
    setDraftAvoidTargetPlayerIds(steering.avoidTargetPlayerIds);
    setDraftLaneConstraints(steering.laneConstraints);
    setDraftStrategyFocus(steering.strategyFocus);
    setDraftSearchDepth(steering.searchDepth);
  }, [
    steering.targetPlayerId,
    steeringAvoidKey,
    steeringConstraintKey,
    steering.strategyFocus,
    steering.searchDepth,
  ]);

  function toggleConstraint(value: TradeFinderConstraint) {
    setDraftLaneConstraints((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value]
    );
  }

  function applyDraft() {
    steering.setTargetPlayerId(draftTargetPlayerId);
    steering.setAvoidTargetPlayerIds(draftAvoidTargetPlayerIds);
    steering.setLaneConstraints(draftLaneConstraints);
    steering.setStrategyFocus(draftStrategyFocus);
    steering.setSearchDepth(draftSearchDepth);
  }

  function findDifferentTargets() {
    const ids = [...new Set(packages.flatMap(receivePlayerIds))];
    steering.setTargetPlayerId(null);
    steering.setAvoidTargetPlayerIds(ids);
    steering.setSearchDepth("deep");
  }

  function findSameStrategyDifferentTarget() {
    const ids = [...new Set((activePackage ? [activePackage] : packages).flatMap(receivePlayerIds))];
    const nextStrategy = normalizeStrategyFocus(activePackage?.strategy_type ?? steering.strategyFocus);
    if (nextStrategy) steering.setStrategyFocus(nextStrategy);
    steering.setTargetPlayerId(null);
    steering.setAvoidTargetPlayerIds(ids);
    steering.setSearchDepth("deep");
  }

  function clearSteering() {
    steering.setTargetPlayerId(null);
    steering.setAvoidTargetPlayerIds([]);
    steering.setLaneConstraints([]);
    steering.setStrategyFocus(null);
    steering.setSearchDepth("quick");
    setDraftTargetPlayerId(null);
    setDraftAvoidTargetPlayerIds([]);
    setDraftLaneConstraints([]);
    setDraftStrategyFocus(null);
    setDraftSearchDepth("quick");
    setTargetSearch("");
  }

  return (
    <div style={{ border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.08)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#93c5fd", textTransform: "uppercase" }}>Steer the search</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            {selectedTarget ? `Ready to target ${selectedTarget.full_name}` : draftAvoidTargetPlayerIds.length > 0 ? "Ready to avoid current receive targets" : "Pick a goal, target, or filter, then tap Go."}
          </div>
        </div>
        <button
          type="button"
          onClick={clearSteering}
          style={{ border: "1px solid var(--border)", background: "var(--dark-base)", color: "var(--text-muted)", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
        >
          Back to default lanes
        </button>
      </div>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Target from their roster</span>
        <select
          value={draftTargetPlayerId ?? ""}
          onChange={(event) => {
            setDraftTargetPlayerId(event.target.value || null);
            setDraftAvoidTargetPlayerIds([]);
          }}
          disabled={steering.partnerTargetsLoading || steering.partnerTargets.length === 0}
          style={{ width: "100%", minHeight: 40, border: "1px solid var(--border)", background: "var(--dark-base)", color: "var(--text)", borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
        >
          <option value="">
            {steering.partnerTargetsLoading
              ? "Loading their roster..."
              : steering.partnerTargets.length === 0
                ? "No targetable players loaded"
                : "Any player on their roster"}
          </option>
          {steering.partnerTargets.map((target) => (
            <option key={target.player_id} value={target.player_id}>
              {target.full_name} ({target.position} {Math.round(target.edge_score)}{target.tags.length > 0 ? ` - ${target.tags.slice(0, 2).join(", ")}` : ""})
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "none" }}>
        <input
          value={targetSearch}
          onChange={(event) => setTargetSearch(event.target.value)}
          placeholder={
            steering.partnerTargetsLoading
              ? "Loading their roster..."
              : steering.partnerTargets.length === 0
                ? "No targetable players loaded"
                : "Search a player to target..."
          }
          disabled={steering.partnerTargetsLoading || steering.partnerTargets.length === 0}
          style={{ width: "100%", minHeight: 40, border: "1px solid var(--border)", background: "var(--dark-base)", color: "var(--text)", borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
        />
        {visibleTargets.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 7 }}>
            {visibleTargets.map((target) => {
              const active = target.player_id === draftTargetPlayerId;
              return (
                <button
                  key={target.player_id}
                  type="button"
                  onClick={() => {
                    setDraftTargetPlayerId(active ? null : target.player_id);
                    setDraftAvoidTargetPlayerIds([]);
                  }}
                  style={{ textAlign: "left", border: active ? "1px solid rgba(34,197,94,0.75)" : "1px solid var(--border)", background: active ? "rgba(34,197,94,0.13)" : "rgba(7,8,11,0.55)", color: "var(--text)", borderRadius: 9, padding: 9, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                >
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target.full_name}</span>
                  <span style={{ display: "block", color: "var(--text-muted)", marginTop: 2 }}>{target.position} {Math.round(target.edge_score)}{target.tags[0] ? ` · ${target.tags[0]}` : ""}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "end", marginTop: 10 }}>
        <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Goal</span>
          <select
            value={draftStrategyFocus ?? ""}
            onChange={(event) => setDraftStrategyFocus((event.target.value || null) as TradeStrategyType | null)}
            style={{ width: "100%", minHeight: 38, border: "1px solid var(--border)", background: "var(--dark-base)", color: "var(--text)", borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 800, fontFamily: "inherit" }}
          >
            <option value="">Any trade shape</option>
            {strategyLabels.map((strategy) => (
              <option key={strategy.value} value={strategy.value}>
                {strategy.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setDraftSearchDepth((current) => current === "deep" ? "quick" : "deep")}
          style={{ border: draftSearchDepth === "deep" ? "1px solid rgba(34,197,94,0.65)" : "1px solid rgba(59,130,246,0.45)", background: draftSearchDepth === "deep" ? "rgba(34,197,94,0.13)" : "rgba(59,130,246,0.12)", color: draftSearchDepth === "deep" ? "var(--green)" : "#93c5fd", borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
        >
          {draftSearchDepth === "deep" ? "Deep search on" : "Expand search"}
        </button>
      </div>

      <div style={{ marginTop: 8, border: "1px solid rgba(59,130,246,0.18)", background: "rgba(7,8,11,0.38)", borderRadius: 9, padding: "9px 10px", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.45 }}>
        <span style={{ color: "var(--text)", fontWeight: 900 }}>{strategyLabel(draftStrategyFocus)}:</span>{" "}
        {strategyDescription(draftStrategyFocus)}
      </div>

      <select
        value={draftTargetPlayerId ?? ""}
        onChange={(event) => {
          setDraftTargetPlayerId(event.target.value || null);
          setDraftAvoidTargetPlayerIds([]);
        }}
        disabled={steering.partnerTargetsLoading || steering.partnerTargets.length === 0}
        style={{ display: "none", width: "100%", minHeight: 40, border: "1px solid var(--border)", background: "var(--dark-base)", color: "var(--text)", borderRadius: 9, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}
      >
        <option value="">
          {steering.partnerTargetsLoading
            ? "Loading their roster..."
            : steering.partnerTargets.length === 0
              ? "No targetable players loaded"
              : "Target a player on this team..."}
        </option>
        {steering.partnerTargets.map((target) => (
          <option key={target.player_id} value={target.player_id}>
            {target.full_name} ({target.position} {Math.round(target.edge_score)}{target.tags.length > 0 ? ` · ${target.tags.slice(0, 2).join(", ")}` : ""})
          </option>
        ))}
      </select>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button
          type="button"
          onClick={applyDraft}
          style={{ border: "1px solid rgba(59,130,246,0.75)", background: "rgba(59,130,246,0.18)", color: "#bfdbfe", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 950, cursor: "pointer", fontFamily: "inherit" }}
        >
          {hasDraftChanges ? "Go find lanes" : "Go again"}
        </button>
        <button
          type="button"
          onClick={findSameStrategyDifferentTarget}
          style={{ border: "1px solid rgba(34,197,94,0.55)", background: "rgba(34,197,94,0.12)", color: "var(--green)", borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
        >
          Same strategy, new target
        </button>
        <button
          type="button"
          onClick={findDifferentTargets}
          style={{ border: "1px solid rgba(59,130,246,0.45)", background: "rgba(59,130,246,0.12)", color: "#93c5fd", borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
        >
          Different targets
        </button>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 11, fontWeight: 900, padding: "6px 0" }}>
          More filters{draftLaneConstraints.length > 0 ? ` (${draftLaneConstraints.length})` : ""}
        </summary>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {constraintLabels.map((constraint) => {
            const active = draftLaneConstraints.includes(constraint.value);
            return (
              <button
                key={constraint.value}
                type="button"
                onClick={() => toggleConstraint(constraint.value)}
                style={{ border: active ? "1px solid rgba(59,130,246,0.65)" : "1px solid var(--border)", background: active ? "rgba(59,130,246,0.18)" : "var(--dark-base)", color: active ? "#93c5fd" : "var(--text-muted)", borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
              >
                {constraint.label}
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}

export default function PartnerCard({
  suggestion,
  username,
  leagueId,
  steering,
}: {
  suggestion: TradeSuggestion;
  username: string;
  leagueId: string;
  steering?: PartnerCardSteering;
}) {
  const [open, setOpen] = useState(() => Boolean(steering));
  const [activePackage, setActivePackage] = useState(0);
  const { partner, packages } = suggestion;
  const pkg = packages[Math.min(activePackage, Math.max(0, packages.length - 1))];
  const decision = pkg ? tradeDecision(pkg) : null;
  const activeStrategy = normalizeStrategyFocus(pkg?.strategy_type);
  const activeReceivePlayerIds = pkg ? receivePlayerIds(pkg) : [];
  const returnToFinderUrl = buildTradeFinderUrl(username, {
    mode: "find",
    leagueId,
    opponentRosterId: partner.roster_id,
    targetPlayerId: steering?.targetPlayerId ?? null,
    avoidTargetPlayerIds: steering?.avoidTargetPlayerIds ?? [],
    constraints: steering?.laneConstraints ?? [],
    strategyFocus: steering?.strategyFocus ?? activeStrategy,
    searchDepth: steering?.searchDepth ?? "deep",
  });
  const calculatorUrl = pkg
    ? buildTradeCalculatorUrl({
        username,
        leagueId,
        opponentRosterId: partner.roster_id,
        returnTo: returnToFinderUrl,
        send: pkg.you_send.map(packageAssetToTradeInput),
        receive: pkg.you_receive.map(packageAssetToTradeInput),
        sendLabels: pkg.you_send.map((asset) => asset.label),
        receiveLabels: pkg.you_receive.map((asset) => asset.label),
      })
    : "/trade-calculator";
  const finderUrl = (state: {
    strategyFocus?: TradeStrategyType | null;
    avoidTargetPlayerIds?: string[];
    constraints?: TradeFinderConstraint[];
  }) => buildTradeFinderUrl(username, {
    mode: "find",
    leagueId,
    opponentRosterId: partner.roster_id,
    strategyFocus: state.strategyFocus ?? activeStrategy,
    avoidTargetPlayerIds: state.avoidTargetPlayerIds,
    constraints: state.constraints,
    searchDepth: "deep",
  });

  function findMoreLikeThis() {
    if (!steering) return;
    if (activeStrategy) steering.setStrategyFocus(activeStrategy);
    steering.setSearchDepth("deep");
  }

  function avoidCurrentReceivePlayers() {
    if (!steering || activeReceivePlayerIds.length === 0) return;
    steering.setTargetPlayerId(null);
    steering.setAvoidTargetPlayerIds((current) => [...new Set([...current, ...activeReceivePlayerIds])]);
    steering.setSearchDepth("deep");
  }

  function applyConstraint(constraint: TradeFinderConstraint) {
    if (!steering) return;
    addUniqueConstraint(steering.setLaneConstraints, constraint);
    steering.setSearchDepth("deep");
  }

  useEffect(() => {
    if (activePackage > packages.length - 1) setActivePackage(0);
  }, [activePackage, packages.length]);

  useEffect(() => {
    if (steering) setOpen(true);
  }, [steering]);

  return (
    <div className="trade-partner-card" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="trade-partner-summary"
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontFamily: "inherit", flexWrap: "wrap" }}
      >
        <div
          className="trade-partner-score"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: partner.compatibility_score >= 60 ? "var(--green)" : partner.compatibility_score >= 30 ? "var(--amber)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          {partner.compatibility_score}
        </div>
        <div style={{ flex: "1 1 180px", textAlign: "left", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{partner.display_name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {partner.archetype} | {packages.length} package{packages.length !== 1 ? "s" : ""} | {partner.recent_trades}/{partner.total_trades} recent trades
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 999, padding: "1px 7px" }}>
              {partner.preferred_structure}
            </span>
            {(partner.bias_flags ?? []).slice(0, 3).map((flag) => (
              <span key={flag} style={{ fontSize: 10, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 999, padding: "1px 7px" }}>
                {flag}
              </span>
            ))}
          </div>
        </div>
        {pkg?.trade_type && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-muted)",
              padding: "2px 8px",
              borderRadius: 4,
              background: "rgba(255,255,255,0.05)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              whiteSpace: "nowrap",
            }}
          >
            {pkg.trade_type.replace(/-/g, " ")}
          </span>
        )}
        <div className="trade-partner-reason" style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 300, flex: "1 1 220px", textAlign: "right", lineHeight: 1.4 }}>{partner.compatibility_reason}</div>
        <span style={{ color: "var(--text-muted)", marginLeft: 8, display: "inline-flex" }}>
          {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </span>
      </button>

      {open && (
        <div className="trade-partner-body" style={{ padding: "0 18px 18px" }}>
          {pkg && (
            <div>
              {decision && (
                <div className="trade-lane-decision" style={{ border: `1px solid ${decision.color}`, background: "var(--dark-base)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: decision.color, fontSize: 14, fontWeight: 950, textTransform: "uppercase" }}>
                          {decision.label}
                        </span>
                        <span style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 800 }}>
                          {pkg.strategy_label ?? opportunityLabel(pkg.opportunity_type) ?? "Trade lane"}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, color: "var(--text-dim)", fontSize: 12, lineHeight: 1.45 }}>
                        {decision.reason}
                      </div>
                      <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
                        Next: {decision.nextAction}
                      </div>
                    </div>
                    <a
                      href={calculatorUrl}
                      style={{ alignSelf: "center", border: "1px solid rgba(59,130,246,0.65)", background: "rgba(59,130,246,0.14)", color: "#93c5fd", borderRadius: 10, padding: "9px 12px", fontSize: 12, fontWeight: 900, textDecoration: "none", whiteSpace: "nowrap" }}
                    >
                      Open Calculator
                    </a>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <FeedbackAction
                      label="Find more like this"
                      onClick={steering ? findMoreLikeThis : undefined}
                      href={!steering ? finderUrl({ strategyFocus: activeStrategy }) : undefined}
                      primary
                    />
                    <FeedbackAction
                      label="Not this player"
                      onClick={steering ? avoidCurrentReceivePlayers : undefined}
                      href={!steering ? finderUrl({ avoidTargetPlayerIds: activeReceivePlayerIds }) : undefined}
                      disabled={activeReceivePlayerIds.length === 0}
                    />
                    <FeedbackAction
                      label="Cheaper"
                      onClick={steering ? () => applyConstraint("cheaper") : undefined}
                      href={!steering ? finderUrl({ constraints: ["cheaper"] }) : undefined}
                    />
                    <FeedbackAction
                      label="No picks"
                      onClick={steering ? () => applyConstraint("no_picks") : undefined}
                      href={!steering ? finderUrl({ constraints: ["no_picks"] }) : undefined}
                    />
                    <FeedbackAction
                      label="Add same-position player"
                      onClick={steering ? () => applyConstraint("same_position_return") : undefined}
                      href={!steering ? finderUrl({ constraints: ["same_position_return"] }) : undefined}
                    />
                    <FeedbackAction
                      label="Make it realistic"
                      onClick={steering ? () => applyConstraint("more_realistic") : undefined}
                      href={!steering ? finderUrl({ constraints: ["more_realistic"] }) : undefined}
                    />
                  </div>
                </div>
              )}

              {packages.length > 1 && (
                <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                  {packages.map((p, i) => {
                    const active = activePackage === i;
                    const confidence = laneConfidence(p);
                    return (
                      <button
                        key={`package-lane-${i}-${p.type}`}
                        onClick={() => setActivePackage(i)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          background: active ? "rgba(59,130,246,0.12)" : "var(--dark-base)",
                          color: "var(--text)",
                          border: active ? "1px solid rgba(59,130,246,0.65)" : "1px solid var(--border)",
                          borderRadius: 10,
                          padding: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 7 }}>
                          <span style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {laneTitle(p)}
                          </span>
                          <span style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "3px 8px", color: confidence === "Likely" || confidence === "Strong" ? "var(--green)" : confidence === "Hard" || confidence === "Thin" ? "var(--text-muted)" : "var(--amber)", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap", textTransform: "uppercase" }}>
                            {confidence}
                          </span>
                        </div>
                        <div style={{ display: "grid", gap: 3, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.35 }}>
                          <span>Send: {assetSummary(p.you_send, 2)}</span>
                          <span>Get: {assetSummary(p.you_receive, 2)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {steering && <SteeringPanel steering={steering} packages={packages} activePackage={pkg ?? null} />}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <LaneAssetBox label="You Send" assets={pkg.you_send} side="send" />
                <LaneAssetBox label="You Get" assets={pkg.you_receive} side="receive" />
              </div>

              <div style={{ border: "1px solid var(--border)", background: "var(--dark-base)", borderRadius: 10, padding: 12, marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#93c5fd", textTransform: "uppercase", marginBottom: 6 }}>
                  Why this lane exists
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  {pkg.trade_thesis ?? pkg.why_you_do_it}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 10 }}>
                <div style={{ border: "1px solid var(--border)", background: "var(--dark-base)", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 900, textTransform: "uppercase" }}>Value</div>
                  <div style={{ marginTop: 4, fontSize: 13, fontWeight: 900, color: pkg.delta >= 0 ? "var(--green)" : "var(--red)" }}>
                    {pkg.delta >= 0 ? "You win" : "You overpay"} by {Math.abs(pkg.delta).toFixed(0)} TP
                  </div>
                </div>
                <div style={{ border: "1px solid var(--border)", background: "var(--dark-base)", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 900, textTransform: "uppercase" }}>Acceptance</div>
                  <div style={{ marginTop: 4, fontSize: 13, fontWeight: 900 }}>
                    {pkg.acceptance ? `${pkg.acceptance.label} (${Math.round(pkg.acceptance.probability)}%)` : humanize(pkg.quality_tier ?? "speculative")}
                  </div>
                </div>
              </div>

              {pkg.ranking_components && (
                <div style={{ border: "1px solid var(--border)", background: "var(--dark-base)", borderRadius: 10, padding: 12, marginTop: 10 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 900, textTransform: "uppercase", marginBottom: 8 }}>Lane score</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                    {[
                      ["Value", pkg.ranking_components.valuation_edge],
                      ["Fit", pkg.ranking_components.roster_fit],
                      ["Accept", pkg.ranking_components.acceptance_likelihood],
                      ["Liquid", pkg.ranking_components.liquidity],
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: componentColor(Number(value)) }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 12, fontWeight: 900, padding: "8px 0" }}>
                  Full valuation details
                </summary>
                <PackageView pkg={pkg} />
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
