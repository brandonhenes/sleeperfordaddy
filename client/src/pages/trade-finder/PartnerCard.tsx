import { useState } from "react";
import { PickBadge, PlayerLink, PositionBadge } from "../../components/ui";
import {
  acceptanceColor,
  fairnessLabel,
  humanize,
  warningColors,
} from "../../lib/format";
import type {
  TradeHealthWarning,
  TradePackage,
  TradePackageAsset,
  TradeSuggestion,
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

export default function PartnerCard({ suggestion }: { suggestion: TradeSuggestion }) {
  const [open, setOpen] = useState(false);
  const [activePackage, setActivePackage] = useState(0);
  const { partner, packages } = suggestion;
  const pkg = packages[activePackage];

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontFamily: "inherit", flexWrap: "wrap" }}
      >
        <div
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
        <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 300, flex: "1 1 220px", textAlign: "right", lineHeight: 1.4 }}>{partner.compatibility_reason}</div>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{open ? "\u00e2\u2013\u00b2" : "\u00e2\u2013\u00bc"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          {packages.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {packages.map((p, i) => (
                <button
                  key={`package-tab-${i}-${p.type}`}
                  onClick={() => setActivePackage(i)}
                  style={{ background: activePackage === i ? "var(--amber)" : "var(--dark-base)", color: activePackage === i ? "var(--dark-base)" : "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {pkg && <PackageView pkg={pkg} />}
        </div>
      )}
    </div>
  );
}
