import { useState } from "react";
import { Calculator } from "lucide-react";
import { PickBadge, PlayerLink, PositionBadge } from "../../components/ui";
import type { EvaluatedAsset, ShopOpportunity, TradeAssetInput } from "@shared/types";
import { TradeHealthList } from "./PartnerCard";
import { humanize } from "../../lib/format";
import { buildTradeCalculatorUrl } from "../../lib/trade-calculator-url";

function evaluatedAssetToTradeInput(asset: EvaluatedAsset): TradeAssetInput {
  if (asset.asset_type === "player" || asset.player_id) {
    return { type: "player", player_id: asset.player_id ?? undefined };
  }
  const pick = asset.pick_breakdown ?? null;
  return {
    type: "pick",
    pick_season: pick?.season,
    pick_round: pick?.round,
    pick_tier: pick?.tier,
    pick_slot: pick?.pickSlot ?? null,
    pick_label: pick?.pickLabel ?? asset.label,
    pick_original_owner_id: null,
  };
}

function AssetChip({ asset }: { asset: EvaluatedAsset }) {
  const isPick = asset.position == null;
  const pickBreakdown = asset.pick_breakdown ?? null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12, minWidth: 0 }}>
      <span style={{
        background: asset.edge_score >= 80 ? "var(--green)" : asset.edge_score >= 60 ? "var(--amber)" : asset.edge_score >= 45 ? "var(--text-muted)" : "var(--red)",
        color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "1px 5px", minWidth: 24, textAlign: "center", flexShrink: 0,
      }}>
        {Math.round(asset.edge_score)}
      </span>
      {asset.trade_power > 0 && (
        <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
          TP:{asset.trade_power.toFixed(1)}
        </span>
      )}
      {isPick && <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 10, flexShrink: 0 }}>PICK</span>}
      {asset.position && <PositionBadge position={asset.position} />}
      {pickBreakdown ? (
        <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
          <PickBadge pick={pickBreakdown} compact />
        </div>
      ) : (
        <PlayerLink name={asset.label} style={{ flex: 1, minWidth: 0, fontWeight: 500, overflowWrap: "anywhere" }} />
      )}
    </div>
  );
}

function shopDecision(opp: ShopOpportunity): {
  label: "Pursue" | "Tweak" | "Ignore";
  reason: string;
  nextAction: string;
  color: string;
} {
  const acceptance = opp.acceptance.probability ?? 0;
  const hasBlock = opp.healthCheck.some((warning) => warning.type === "block");
  const strongFit = opp.strategy_fit === "strong" || opp.opportunity_score >= 70;

  if (hasBlock || (opp.fairness === "lopsided" && opp.delta_tp > 1_500)) {
    return {
      label: "Ignore",
      reason: hasBlock ? "A quality rule is blocking this shop idea." : "You are giving up too much value for this return.",
      nextAction: "Use this only as a player-interest signal, not an offer.",
      color: "var(--red)",
    };
  }

  if (strongFit && acceptance >= 45 && opp.delta_tp <= 1_000) {
    return {
      label: "Pursue",
      reason: "The market value, acceptance read, and strategy fit are aligned enough to work.",
      nextAction: "Open it in Calculator and tune the final asset.",
      color: "var(--green)",
    };
  }

  return {
    label: "Tweak",
    reason: acceptance < 35 ? "The buyer interest exists, but the acceptance signal is weak." : "The idea is close, but the price needs tuning.",
    nextAction: acceptance < 35 ? "Try a different buyer or add value back." : "Use Calculator to make the package cleaner.",
    color: "var(--amber)",
  };
}

export default function ShopOpportunityCard({ opp, username }: { opp: ShopOpportunity; username: string }) {
  const [showValuation, setShowValuation] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const sendContextValue = opp.send_context_trade_value ?? opp.send_total_tp;
  const receiveContextValue = opp.receive_context_trade_value ?? opp.receive_total_tp;
  const valuationEdge = opp.valuation_edge ?? (receiveContextValue - sendContextValue);
  const decision = shopDecision(opp);
  const calculatorUrl = buildTradeCalculatorUrl({
    username,
    leagueId: opp.league_id,
    send: opp.you_send.map(evaluatedAssetToTradeInput),
    receive: opp.you_receive.map(evaluatedAssetToTradeInput),
    sendLabels: opp.you_send.map((asset) => asset.label),
    receiveLabels: opp.you_receive.map((asset) => asset.label),
  });
  const hasValuationDetails =
    opp.send_base_market_value != null ||
    opp.receive_base_market_value != null ||
    opp.valuation_warnings?.length ||
    opp.valuation_explanations?.length;

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 12, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: "1 1 240px", minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>{opp.league_name}</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "rgba(61,139,253,0.1)", color: "var(--amber)" }}>
            {opp.path_label}
          </span>
          {opp.strategy_label && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, background: "rgba(59,130,246,0.12)", color: "#3b82f6", textTransform: "uppercase" }}>
              {opp.strategy_label}
            </span>
          )}
          {opp.strategy_fit && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.05)", color: opp.strategy_fit === "strong" ? "var(--green)" : opp.strategy_fit === "reasonable" ? "var(--amber)" : opp.strategy_fit === "thin" ? "var(--text-muted)" : "var(--red)", textTransform: "uppercase" }}>
              {humanize(opp.strategy_fit)}
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
            {opp.from_archetype}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: opp.opportunity_score >= 60 ? "var(--green)" : opp.opportunity_score >= 40 ? "var(--amber)" : "var(--text-muted)", flexShrink: 0 }}>
          {opp.opportunity_score}/100
        </span>
      </div>

      <div style={{ border: `1px solid ${decision.color}`, background: "var(--dark-base)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ minWidth: 0, flex: "1 1 190px" }}>
            <div style={{ color: decision.color, fontSize: 14, fontWeight: 950, textTransform: "uppercase" }}>{decision.label}</div>
            <div style={{ marginTop: 5, color: "var(--text-dim)", fontSize: 12, lineHeight: 1.45 }}>{decision.reason}</div>
            <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>Next: {decision.nextAction}</div>
          </div>
          <a
            href={calculatorUrl}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid rgba(59,130,246,0.65)", background: "rgba(59,130,246,0.14)", color: "#93c5fd", borderRadius: 10, padding: "8px 10px", fontSize: 12, fontWeight: 900, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            <Calculator size={14} aria-hidden />
            Open Calculator
          </a>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "2px solid #ef4444", paddingBottom: 4, marginBottom: 6 }}>
            You Send ({sendContextValue.toFixed(1)} TP)
          </div>
          {opp.you_send.map((a, i) => (
            <AssetChip key={`send-${i}-${a.label}`} asset={a} />
          ))}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "2px solid #22c55e", paddingBottom: 4, marginBottom: 6 }}>
            You Receive from {opp.from_team} ({receiveContextValue.toFixed(1)} TP)
          </div>
          {opp.you_receive.map((a, i) => (
            <AssetChip key={`receive-${i}-${a.label}`} asset={a} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 12 }}>
        <span style={{
          color: opp.fairness === "fair" ? "var(--green)" : opp.fairness === "slight_edge" ? "var(--amber)" : "var(--red)",
          fontWeight: 600, textTransform: "uppercase", fontSize: 11,
        }}>
          {opp.fairness === "fair" ? "Fair" : opp.fairness === "slight_edge" ? "Slight Edge" : "Lopsided"}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {opp.delta_tp > 0 ? "You overpay" : opp.delta_tp < 0 ? "You underpay" : "Even"} by {Math.abs(opp.delta_tp).toFixed(1)} TP
        </span>
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((current) => !current)}
        style={{ marginTop: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)", color: "var(--text-muted)", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
      >
        {showDetails ? "Hide details" : "Show thesis and risk"}
      </button>

      {showDetails && (
        <div style={{ marginTop: 10 }}>
          {opp.trade_thesis && (
            <div style={{ marginBottom: 10, padding: 10, background: "rgba(61,139,253,0.08)", border: "1px solid rgba(61,139,253,0.22)", borderRadius: 8, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5, overflowWrap: "anywhere" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#3b82f6", letterSpacing: 0.5, marginBottom: 4 }}>TRADE THESIS</div>
              <div>{opp.trade_thesis}</div>
              {opp.strategy_warnings && opp.strategy_warnings.length > 0 && (
                <div style={{ marginTop: 6, color: "var(--amber)", fontSize: 10 }}>
                  {opp.strategy_warnings.slice(0, 2).join(" | ")}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 8, padding: 10, background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5, overflowWrap: "anywhere" }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>Why you do it: </span>
              {opp.why_you_do_it}
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>Why they accept: </span>
              {opp.why_they_accept}
            </div>
          </div>

          <div style={{ marginTop: 8, padding: 10, background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 11,
                fontWeight: 800,
                padding: "3px 8px",
                borderRadius: 4,
                background: opp.acceptance.label === "Likely" ? "rgba(34,197,94,0.15)" : opp.acceptance.label === "Possible" ? "rgba(61,139,253,0.15)" : "rgba(239,68,68,0.15)",
                color: opp.acceptance.label === "Likely" ? "#22c55e" : opp.acceptance.label === "Possible" ? "#f59e0b" : "#ef4444",
              }}>
                {opp.acceptance.label} ({opp.acceptance.probability}%)
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 0, overflowWrap: "anywhere" }}>{opp.buyer_motivation}</span>
            </div>
            {opp.acceptance.accept_reasons.length > 0 && (
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 2, overflowWrap: "anywhere" }}>
                <span style={{ color: "var(--green)", fontWeight: 700 }}>Accept: </span>
                {opp.acceptance.accept_reasons.join(" | ")}
              </div>
            )}
            {opp.acceptance.reject_reasons.length > 0 && (
              <div style={{ fontSize: 10, color: "var(--text-dim)", overflowWrap: "anywhere" }}>
                <span style={{ color: "var(--red)", fontWeight: 700 }}>Risk: </span>
                {opp.acceptance.reject_reasons.join(" | ")}
              </div>
            )}
          </div>

          <TradeHealthList warnings={opp.healthCheck} />
        </div>
      )}

      {hasValuationDetails && showDetails && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setShowValuation((current) => !current)}
            style={{
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.03)",
              color: "var(--text-muted)",
              borderRadius: 6,
              padding: "5px 8px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {showValuation ? "Hide valuation details" : "Show valuation details"}
          </button>
          {showValuation && (
            <div style={{ marginTop: 8, padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "rgba(255,255,255,0.02)", fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 8 }}>
                <div>
                  <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>Base: </span>
                  {Math.round(opp.send_base_market_value ?? 0)} sent / {Math.round(opp.receive_base_market_value ?? 0)} received
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>League: </span>
                  {Math.round(opp.send_league_market_value ?? 0)} sent / {Math.round(opp.receive_league_market_value ?? 0)} received
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>Context edge: </span>
                  {valuationEdge > 0 ? "+" : ""}{valuationEdge.toFixed(1)}
                </div>
              </div>
              {opp.valuation_warnings && opp.valuation_warnings.length > 0 && (
                <div style={{ marginBottom: 6, color: "var(--amber)" }}>
                  {opp.valuation_warnings.slice(0, 2).map((warning) => warning.message).join(" | ")}
                </div>
              )}
              {opp.valuation_explanations && opp.valuation_explanations.length > 0 && (
                <div>
                  {opp.valuation_explanations.slice(0, 2).join(" | ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
