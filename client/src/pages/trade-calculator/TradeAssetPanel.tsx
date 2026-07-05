import EdgeScoreBadge from "../../components/EdgeScoreBadge";
import { PickBadge } from "../../components/ui";
import { formatTradeValue } from "../../lib/format";
import type { EvaluatedAsset, TradeEvaluation } from "@shared/types";
import { EvalMetric } from "./TradeEvalMetric";

function ratingTone(score: number): string {
  if (score >= 85) return "var(--green)";
  if (score >= 70) return "var(--amber)";
  if (score >= 55) return "var(--text-muted)";
  return "var(--red)";
}

function LeagueRatingPanel({ rating }: { rating: EvaluatedAsset["league_rating"] }) {
  if (!rating) return null;
  const components: Array<{
    label: string;
    component: NonNullable<EvaluatedAsset["league_rating"]>["scoring_fit"];
  }> = [
    { label: "Scoring", component: rating.scoring_fit },
    { label: "Scarcity", component: rating.lineup_scarcity },
    { label: "Projection", component: rating.projection_value },
    { label: "Age", component: rating.age_window },
    { label: "Liquidity", component: rating.liquidity },
    { label: "Risk", component: rating.risk },
  ];

  return (
    <div style={{ display: "grid", gap: 7, border: "1px solid rgba(96,165,250,0.22)", background: "rgba(30,64,175,0.10)", borderRadius: 8, padding: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase" }}>
          League Rating
        </span>
        <span style={{ color: ratingTone(rating.rating), fontSize: 15, fontWeight: 900 }}>
          {rating.rating} {rating.grade}
        </span>
        <span style={{ color: rating.league_value_delta >= 0 ? "var(--green)" : "var(--red)", fontSize: 10, fontWeight: 800 }}>
          {rating.league_value_delta >= 0 ? "+" : ""}
          {rating.league_value_delta_pct.toFixed(1)}%
        </span>
      </div>
      {rating.tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {rating.tags.slice(0, 4).map((tag) => (
            <span key={tag} style={{ border: "1px solid var(--border)", borderRadius: 5, padding: "1px 5px", color: "var(--text)", fontSize: 9, fontWeight: 800 }}>
              {tag}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(82px, 1fr))", gap: 5 }}>
        {components.map(({ label, component }) => (
          <div key={label} title={component.reason} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "5px 6px", background: "rgba(255,255,255,0.03)" }}>
            <div style={{ color: "var(--text-muted)", fontSize: 9, fontWeight: 800 }}>{label}</div>
            <div style={{ color: ratingTone(component.score), fontSize: 12, fontWeight: 900 }}>{component.grade}</div>
          </div>
        ))}
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: 10, lineHeight: 1.4 }}>{rating.summary}</div>
    </div>
  );
}

function AssetValuationDetails({ asset }: { asset: EvaluatedAsset }) {
  const sources = asset.source_market_values;
  const reasons = asset.adjustment_reasons ?? [];
  const warnings = asset.fallback_warnings ?? [];

  return (
    <details style={{ marginTop: 2 }}>
      <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 10, fontWeight: 700 }}>
        Valuation details
      </summary>
      <div style={{ display: "grid", gap: 8, marginTop: 6, background: "rgba(15,23,42,0.45)", border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: 6 }}>
          <EvalMetric label="Base" value={formatTradeValue(asset.base_market_value)} />
          <EvalMetric label="League" value={formatTradeValue(asset.league_market_value)} />
          <EvalMetric label="Trade" value={formatTradeValue(asset.context_trade_value ?? asset.trade_power)} />
        </div>
        <LeagueRatingPanel rating={asset.league_rating} />
        {sources && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5, overflowWrap: "anywhere" }}>
            Sources: FC {formatTradeValue(sources.fc)} | KTC {formatTradeValue(sources.ktc)} | DP {formatTradeValue(sources.dp)} | Edge fallback {formatTradeValue(sources.edge_fallback)}
          </div>
        )}
        {reasons.length > 0 && (
          <div style={{ display: "grid", gap: 4 }}>
            {reasons.map((reason, index) => (
              <div key={`${reason.stage}-${index}`} style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.45 }}>
                <strong style={{ color: "var(--text)" }}>{reason.stage.replaceAll("_", " ")}:</strong> {reason.reason}
              </div>
            ))}
          </div>
        )}
        {warnings.length > 0 && (
          <div style={{ display: "grid", gap: 4 }}>
            {warnings.map((warning, index) => (
              <div key={`${warning}-${index}`} style={{ fontSize: 10, color: "#fcd34d", lineHeight: 1.45 }}>{warning}</div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export function TradePanel({
  title,
  color,
  labels,
  side,
  onRemove,
  onClear,
}: {
  title: string;
  color: string;
  labels: string[];
  side: TradeEvaluation["sideA"] | TradeEvaluation["sideB"] | null;
  onRemove: (idx: number) => void;
  onClear: () => void;
}) {
  const evaluated = side?.assets ?? null;

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
          <div key={`${label}-${idx}`} style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 8, borderBottom: "1px solid var(--border)", padding: "7px 0" }}>
            {asset ? <EdgeScoreBadge score={Math.round(asset.edge_score)} size="sm" /> : <span style={{ width: 32 }} />}
            <div style={{ flex: 1, display: "grid", gap: 4 }}>
              {asset?.pick_breakdown ? (
                <>
                  <PickBadge pick={asset.pick_breakdown} compact />
                  <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.4 }}>
                    Slot {asset.pick_breakdown.round}.{String(asset.pick_breakdown.pickSlot).padStart(2, "0")} | Base {asset.pick_breakdown.baseEdgeValue.toFixed(1)} | Year x{asset.pick_breakdown.futureYearDiscount.toFixed(2)} | Class x{asset.pick_breakdown.classStrengthModifier.toFixed(2)}
                    {asset.pick_breakdown.projectedProspect ? ` | ${asset.pick_breakdown.projectedProspect}` : ""}
                    {asset.pick_breakdown.prospectTier != null ? ` (Tier ${asset.pick_breakdown.prospectTier})` : ""}
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 12 }}>{asset?.label ?? label}</span>
              )}
            </div>
            {asset && (
              <div style={{ display: "grid", gap: 3, justifyItems: "end", minWidth: 58 }}>
                <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  TV {formatTradeValue(asset.context_trade_value ?? asset.trade_power)}
                </span>
                <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  {asset.asset_type ?? (asset.player_id ? "player" : "pick")}
                </span>
              </div>
            )}
            <button type="button" onClick={() => onRemove(idx)} style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--red)", borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>X</button>
            {asset && (
              <div style={{ width: "100%", minWidth: 0, paddingLeft: 40 }}>
                <AssetValuationDetails asset={asset} />
              </div>
            )}
          </div>
        );
      })}
      {!!labels.length && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)", display: "flex", gap: 14, flexWrap: "wrap" }}>
          {side ? (
            <>
              <span>Base: <strong style={{ color: "var(--text)" }}>{formatTradeValue(side.total_base_market_value)}</strong></span>
              <span>League: <strong style={{ color: "var(--text)" }}>{formatTradeValue(side.total_league_market_value)}</strong></span>
              <span>Trade Value: <strong style={{ color: "var(--text)" }}>{formatTradeValue(side.total_context_trade_value ?? side.total_trade_power)}</strong></span>
              <span>Package: <strong style={{ color: "var(--text)" }}>{side.package_penalty_pct}%</strong></span>
            </>
          ) : (
            <span>{labels.length} asset{labels.length === 1 ? "" : "s"} selected. Backend valuation will load when both sides are complete.</span>
          )}
        </div>
      )}
      {side?.adjustment_explanation && (
        <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
          {side.adjustment_explanation}
        </div>
      )}
    </div>
  );
}
