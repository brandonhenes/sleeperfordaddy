import { useState } from "react";
import { PickBadge, PlayerLink, PositionBadge } from "../../components/ui";
import type { EvaluatedAsset, ShopOpportunity } from "@shared/types";
import { TradeHealthList } from "./PartnerCard";

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

export default function ShopOpportunityCard({ opp }: { opp: ShopOpportunity }) {
  const [showValuation, setShowValuation] = useState(false);
  const sendContextValue = opp.send_context_trade_value ?? opp.send_total_tp;
  const receiveContextValue = opp.receive_context_trade_value ?? opp.receive_total_tp;
  const valuationEdge = opp.valuation_edge ?? (receiveContextValue - sendContextValue);
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
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "rgba(245,158,11,0.1)", color: "var(--amber)" }}>
            {opp.path_label}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
            {opp.from_archetype}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: opp.opportunity_score >= 60 ? "var(--green)" : opp.opportunity_score >= 40 ? "var(--amber)" : "var(--text-muted)", flexShrink: 0 }}>
          {opp.opportunity_score}/100
        </span>
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
            background: opp.acceptance.label === "Likely" ? "rgba(34,197,94,0.15)" : opp.acceptance.label === "Possible" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
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

      {hasValuationDetails && (
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
