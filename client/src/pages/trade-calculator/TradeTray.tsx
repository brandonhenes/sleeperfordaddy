import { useEffect, type ReactNode } from "react";
import { ChevronUp, X } from "lucide-react";
import { fairnessLabel, formatTradeValue } from "../../lib/format";
import type { TradeEvaluation } from "@shared/types";

function fairnessTone(fairness: TradeEvaluation["fairness"]): { color: string; bg: string } {
  if (fairness === "fair") return { color: "var(--dark)", bg: "var(--green)" };
  if (fairness === "slight_edge") return { color: "var(--dark)", bg: "var(--warning)" };
  return { color: "#fff", bg: "var(--red)" };
}

function sideSummary(labels: string[]): string {
  if (labels.length === 0) return "Nothing yet";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1} more`;
}

export function TradeTray({
  result,
  isPending,
  sendLabels,
  receiveLabels,
  onOpen,
}: {
  result: TradeEvaluation | undefined;
  isPending: boolean;
  sendLabels: string[];
  receiveLabels: string[];
  onOpen: () => void;
}) {
  const sendTotal = result ? (result.sideA.total_context_trade_value ?? result.sideA.total_trade_power) : null;
  const receiveTotal = result ? (result.sideB.total_context_trade_value ?? result.sideB.total_trade_power) : null;
  const tone = result ? fairnessTone(result.fairness) : null;

  return (
    <>
      <button type="button" className="tc-tray" onClick={onOpen} aria-label="Review trade details">
        <span className="tc-tray-side">
          <span className="label-line" style={{ color: "var(--red)" }}>YOU SEND · {sendLabels.length}</span>
          <span className="value-line" style={{ color: sendTotal != null ? "var(--text)" : "var(--text-muted)" }}>
            {sendTotal != null ? formatTradeValue(sendTotal) : "—"}
          </span>
          <span className="count-line">{sideSummary(sendLabels)}</span>
        </span>
        <span className="tc-tray-mid">
          {result && tone ? (
            <span className="tc-tray-verdict" style={{ background: tone.bg, color: tone.color }}>
              {fairnessLabel(result.fairness)}
            </span>
          ) : (
            <span
              className={isPending ? "tc-tray-verdict animate-pulse" : "tc-tray-verdict"}
              style={{ background: "var(--card-hover)", color: "var(--text-dim)" }}
            >
              {isPending ? "EVALUATING" : "BUILD TRADE"}
            </span>
          )}
          <span className="tc-tray-hint">
            <ChevronUp size={11} /> Details
          </span>
        </span>
        <span className="tc-tray-side receive">
          <span className="label-line" style={{ color: "var(--green)" }}>YOU GET · {receiveLabels.length}</span>
          <span className="value-line" style={{ color: receiveTotal != null ? "var(--text)" : "var(--text-muted)" }}>
            {receiveTotal != null ? formatTradeValue(receiveTotal) : "—"}
          </span>
          <span className="count-line">{sideSummary(receiveLabels)}</span>
        </span>
      </button>
      <div className="tc-tray-spacer" aria-hidden />
    </>
  );
}

export function TradeSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="tc-sheet-backdrop" onClick={onClose} aria-hidden />
      <div className="tc-sheet" role="dialog" aria-modal="true" aria-label="Trade details">
        <div className="tc-sheet-grab">
          <button type="button" className="tc-sheet-close" onClick={onClose} aria-label="Close trade details">
            <X size={15} />
          </button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>{children}</div>
      </div>
    </>
  );
}
