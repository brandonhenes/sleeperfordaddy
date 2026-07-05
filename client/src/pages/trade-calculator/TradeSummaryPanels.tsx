import EdgeScoreBadge from "../../components/EdgeScoreBadge";
import { PickBadge } from "../../components/ui";
import type { AcceptanceResult } from "../../lib/acceptance";
import {
  acceptanceColor,
  fairnessLabel,
  formatSignedTradeValue,
  formatTradeValue,
  warningColors,
} from "../../lib/format";
import type {
  EvaluatedAsset,
  TradeEvaluation,
  TradeHealthWarning,
  TradeValuationWarning,
} from "@shared/types";
import type { OpponentContext } from "./types";

function fairnessColor(f: TradeEvaluation["fairness"]): string {
  if (f === "fair") return "var(--green)";
  if (f === "slight_edge") return "var(--amber)";
  return "var(--red)";
}

function winnerLabel(winner: TradeEvaluation["winner"]): string {
  if (winner === "even") return "Even";
  if (winner === "sideA") return "Side A (you send)";
  return "Side B (you get)";
}

function winnerColor(winner: TradeEvaluation["winner"]): string {
  if (winner === "sideA") return "var(--red)";
  if (winner === "sideB") return "var(--green)";
  return "var(--text-dim)";
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

function valuationWarningColors(severity: TradeValuationWarning["severity"]) {
  if (severity === "block") {
    return {
      background: "rgba(239,68,68,0.12)",
      border: "1px solid rgba(239,68,68,0.28)",
      color: "#fca5a5",
      label: "#f87171",
    };
  }
  if (severity === "warning") {
    return {
      background: "rgba(245,158,11,0.12)",
      border: "1px solid rgba(245,158,11,0.28)",
      color: "#fcd34d",
      label: "#fbbf24",
    };
  }
  return {
    background: "rgba(96,165,250,0.10)",
    border: "1px solid rgba(96,165,250,0.22)",
    color: "#bfdbfe",
    label: "#93c5fd",
  };
}

function ValuationWarningPanel({ warnings }: { warnings: TradeValuationWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", color: "#fbbf24", fontSize: 11, fontWeight: 800 }}>
        Valuation warnings ({warnings.length})
      </summary>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {warnings.map((warning, index) => {
          const colors = valuationWarningColors(warning.severity);
          return (
            <div
              key={`${warning.type}-${warning.asset_key ?? "trade"}-${index}`}
              style={{
                background: colors.background,
                border: colors.border,
                borderRadius: 8,
                padding: "9px 10px",
              }}
            >
              <div style={{ color: colors.label, fontSize: 10, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>
                {warning.type.replaceAll("_", " ")}
              </div>
              <div style={{ color: colors.color, fontSize: 12, lineHeight: 1.45 }}>{warning.message}</div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

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

function EvalMetric({
  label,
  value,
  color = "var(--text)",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: "var(--text-muted)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color, whiteSpace: "normal", overflowWrap: "break-word" }}>
        {value}
      </div>
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

export function EvalBar({
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

  const sendTotal = result.sideA.total_context_trade_value ?? result.sideA.total_trade_power;
  const receiveTotal = result.sideB.total_context_trade_value ?? result.sideB.total_trade_power;
  const total = Math.max(1, sendTotal + receiveTotal);
  const sendPct = (sendTotal / total) * 100;
  const deltaLabel = result.delta > 0
    ? `You overpay by ${formatTradeValue(Math.abs(result.delta))}`
    : result.delta < 0
      ? `You underpay by ${formatTradeValue(Math.abs(result.delta))}`
      : "Even trade value";
  const deltaColor = result.delta > 0 ? "var(--red)" : result.delta < 0 ? "var(--green)" : "var(--text-dim)";
  const winner = result.winner ?? "even";
  const percentGap = result.percent_gap ?? 0;
  const valueAdjustment = result.value_adjustment ?? 0;
  const valueAdjustmentSide = result.value_adjustment_side ?? "none";
  const neededToEvenLabel = result.needed_to_even?.label ?? "No meaningful sweetener needed.";
  const valueAdjustmentColor =
    valueAdjustmentSide === "sideA"
      ? "var(--red)"
      : valueAdjustmentSide === "sideB"
        ? "var(--green)"
        : "var(--text-dim)";

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
        <span>You Send {formatTradeValue(sendTotal)}</span>
        <span>You Get {formatTradeValue(receiveTotal)}</span>
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: "var(--dark-base)" }}>
        <div style={{ width: `${sendPct}%`, background: "#ef4444" }} />
        <div style={{ flex: 1, background: "#22c55e" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8, marginTop: 10 }}>
        <EvalMetric label="Winner" value={winnerLabel(winner)} color={winnerColor(winner)} />
        <EvalMetric label="Gap" value={`${percentGap.toFixed(1)}%`} color={fairnessColor(result.fairness)} />
        <EvalMetric label="Value adj" value={formatSignedTradeValue(valueAdjustment)} color={valueAdjustmentColor} />
      </div>
      <div style={{ marginTop: 8, background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.22)", borderRadius: 8, padding: "9px 10px", color: "#bfdbfe", fontSize: 12, lineHeight: 1.45 }}>
        {neededToEvenLabel}
      </div>
      {result.valuation_comparison && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 11, fontWeight: 800 }}>
            Valuation comparison
          </summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 8 }}>
            <EvalMetric
              label="Current"
              value={`${formatTradeValue(result.valuation_comparison.current.sideA_total)} / ${formatTradeValue(result.valuation_comparison.current.sideB_total)}`}
            />
            <EvalMetric
              label="Raw KTC"
              value={`${formatTradeValue(result.valuation_comparison.raw_ktc.sideA_total)} / ${formatTradeValue(result.valuation_comparison.raw_ktc.sideB_total)}`}
            />
            <EvalMetric
              label="League \u00ce\u201d"
              value={`${formatSignedTradeValue(result.valuation_comparison.league_adjustment.sideA_delta)} / ${formatSignedTradeValue(result.valuation_comparison.league_adjustment.sideB_delta)}`}
              color="var(--blue)"
            />
            <EvalMetric
              label="Context \u00ce\u201d"
              value={`${formatSignedTradeValue(result.valuation_comparison.package_context_adjustment.sideA_delta)} / ${formatSignedTradeValue(result.valuation_comparison.package_context_adjustment.sideB_delta)}`}
              color="var(--purple)"
            />
          </div>
        </details>
      )}
      {result.consolidation_warning && (
        <div style={{ marginTop: 8, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.28)", borderRadius: 8, padding: "9px 10px" }}>
          <div style={{ color: "#fbbf24", fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }}>Consolidation</div>
          <div style={{ color: "#fcd34d", fontSize: 12, lineHeight: 1.45 }}>{result.consolidation_warning}</div>
        </div>
      )}
      {result.valuation_explanations?.length ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 11, fontWeight: 800 }}>
            Why this result?
          </summary>
          <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
            {result.valuation_explanations.map((explanation, index) => (
              <div key={`${explanation}-${index}`} style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.45 }}>
                {explanation}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <ValuationWarningPanel warnings={result.warnings ?? []} />
      <TradeHealthPanel warnings={result.healthCheck} />
    </div>
  );
}

export function AcceptanceBadge({
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--green)", marginBottom: 4 }}>ACCEPT SIGNALS</div>
          {acceptance.accept_reasons.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No strong acceptance signals yet.</div>}
          {acceptance.accept_reasons.map((r, i) => <div key={`a-${i}`} style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>{"\u00e2\u20ac\u00a2"} {r}</div>)}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--red)", marginBottom: 4 }}>REJECT SIGNALS</div>
          {acceptance.reject_reasons.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No major resistance flags.</div>}
          {acceptance.reject_reasons.map((r, i) => <div key={`r-${i}`} style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>{"\u00e2\u20ac\u00a2"} {r}</div>)}
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
