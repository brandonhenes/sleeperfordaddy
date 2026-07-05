import type { AcceptanceResult } from "../../lib/acceptance";
import {
  acceptanceColor,
  fairnessLabel,
  formatSignedTradeValue,
  formatTradeValue,
  warningColors,
} from "../../lib/format";
import type {
  TradeEvaluation,
  TradeHealthWarning,
  TradeValuationWarning,
} from "@shared/types";
import type { OpponentContext } from "./types";
import { EvalMetric } from "./TradeEvalMetric";

export { TradePanel } from "./TradeAssetPanel";

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
              label="League Delta"
              value={`${formatSignedTradeValue(result.valuation_comparison.league_adjustment.sideA_delta)} / ${formatSignedTradeValue(result.valuation_comparison.league_adjustment.sideB_delta)}`}
              color="var(--blue)"
            />
            <EvalMetric
              label="Context Delta"
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
          {acceptance.accept_reasons.map((r, i) => <div key={`a-${i}`} style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>- {r}</div>)}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--red)", marginBottom: 4 }}>REJECT SIGNALS</div>
          {acceptance.reject_reasons.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No major resistance flags.</div>}
          {acceptance.reject_reasons.map((r, i) => <div key={`r-${i}`} style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>- {r}</div>)}
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
