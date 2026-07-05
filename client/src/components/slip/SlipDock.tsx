import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronUp, Copy, ExternalLink, Bookmark, Trash2, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { acceptanceBand, bandColor, useSlip, type SlipLeg } from "../../lib/slip";
import { computeAcceptance, type AcceptanceResult } from "../../lib/acceptance";
import { fairnessLabel, formatTradeValue } from "../../lib/format";
import { posColor } from "../../lib/position-colors";
import { useCurrentUsername } from "../../hooks/use-current-user";
import { usePowerRankings } from "../../hooks/use-power-rankings";
import { useEvaluateTrade } from "../../hooks/use-trade-calculator";
import { buildTradeMessage } from "../../pages/trade-calculator/trade-message";
import type { OpponentContextResponse } from "../../pages/trade-calculator/types";
import type { TradeEvaluation } from "@shared/types";

function fairnessTint(fairness: string | null): string {
  if (fairness === "fair") return "var(--green)";
  if (fairness === "slight_edge") return "var(--warning)";
  if (fairness === "lopsided") return "var(--red)";
  return "var(--text-muted)";
}

function LegRow({
  leg,
  value,
  onRemove,
}: {
  leg: SlipLeg;
  value: number | null;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid rgba(35,41,54,0.6)" }}>
      {leg.position ? (
        <span style={{ color: posColor(leg.position), fontSize: 10, fontWeight: 800, width: 24, flexShrink: 0 }}>{leg.position}</span>
      ) : (
        <span style={{ color: "#06b6d4", fontSize: 10, fontWeight: 800, width: 24, flexShrink: 0 }}>PK</span>
      )}
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {leg.label}
      </span>
      {value != null && (
        <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>{formatTradeValue(value)}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${leg.label}`}
        style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: 2, display: "grid" }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

export default function SlipDock() {
  const [location] = useLocation();
  const { username } = useCurrentUsername();
  const slip = useSlip();
  const {
    legs, leagueId, opponentRosterId, sheetOpen, verdict, toggleLeg, removeLeg,
    clearSlip, setLeague, setOpponent, openSlip, closeSlip, setVerdict, saveTicket,
  } = slip;

  const [copied, setCopied] = useState(false);
  const { data: leagues = [] } = usePowerRankings(legs.length > 0 || sheetOpen ? username : "", false);
  const league = leagues.find((l) => l.league_id === leagueId);

  const { data: opponentData } = useQuery<OpponentContextResponse>({
    queryKey: ["opponent-context", username, leagueId, false],
    queryFn: () => apiFetch(`/api/trade/opponent-context/${encodeURIComponent(username)}/${encodeURIComponent(leagueId)}`),
    enabled: !!username && !!leagueId && sheetOpen,
    staleTime: 5 * 60 * 1000,
  });
  const opponents = opponentData?.opponents ?? [];
  const activeOpponent = opponents.find((o) => o.roster_id === opponentRosterId) ?? null;

  const sendLegs = legs.filter((l) => l.side === "send");
  const receiveLegs = legs.filter((l) => l.side === "receive");
  const hasBothSides = sendLegs.length > 0 && receiveLegs.length > 0;

  const evalMutation = useEvaluateTrade();
  const evalRef = useRef(evalMutation);
  evalRef.current = evalMutation;

  const legsSignature = useMemo(
    () => JSON.stringify({ s: sendLegs.map((l) => l.asset), r: receiveLegs.map((l) => l.asset), leagueId }),
    [sendLegs, receiveLegs, leagueId]
  );

  useEffect(() => {
    if (!hasBothSides) {
      evalRef.current.reset();
      setVerdict({ band: null, probability: null, fairness: null });
      return;
    }
    const timer = window.setTimeout(() => {
      evalRef.current.mutate({
        sideA: sendLegs.map((l) => l.asset),
        sideB: receiveLegs.map((l) => l.asset),
        mode: league?.mode ?? "sf",
        leagueId: leagueId || undefined,
        valuationMode: "ktc_league",
      });
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legsSignature, hasBothSides, league?.mode]);

  const result: TradeEvaluation | undefined = evalMutation.data;

  const acceptance: AcceptanceResult | null = useMemo(() => {
    if (!result || !activeOpponent) return null;
    return computeAcceptance({
      fairness: result.fairness,
      delta: result.delta,
      sendAssets: result.sideA.assets,
      receiveAssets: result.sideB.assets,
      opponent: activeOpponent,
    });
  }, [result, activeOpponent]);

  useEffect(() => {
    const probability = acceptance?.probability ?? null;
    setVerdict({
      band: acceptanceBand(probability),
      probability,
      fairness: result?.fairness ?? null,
    });
  }, [acceptance, result?.fairness, setVerdict]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const onCalculatorPage = location.startsWith("/trade-calculator");
  const showPill = legs.length > 0 && !sheetOpen && !onCalculatorPage;

  const sendTotal = result ? (result.sideA.total_context_trade_value ?? result.sideA.total_trade_power) : null;
  const receiveTotal = result ? (result.sideB.total_context_trade_value ?? result.sideB.total_trade_power) : null;
  const sendAssetValues = result?.sideA.assets ?? [];
  const receiveAssetValues = result?.sideB.assets ?? [];

  function legValue(leg: SlipLeg, sideAssets: typeof sendAssetValues, index: number): number | null {
    const byIndex = sideAssets[index];
    if (byIndex) return byIndex.context_trade_value ?? byIndex.trade_power;
    return null;
  }

  function pitch() {
    if (!result) return;
    const msg = buildTradeMessage(
      result,
      result.sideA.assets.map((a) => a.label),
      result.sideB.assets.map((a) => a.label),
      activeOpponent,
      acceptance
    );
    navigator.clipboard.writeText(msg);
    setCopied(true);
    if (league) {
      saveTicket({ leagueName: league.league_name, opponentName: activeOpponent?.display_name ?? null, status: "pitched" });
    }
  }

  return (
    <>
      {showPill && (
        <button type="button" className="slip-pill" onClick={openSlip} aria-label="Open trade slip">
          <span className="slip-pill-count">{legs.length}</span>
          <span style={{ fontWeight: 800, letterSpacing: "0.04em" }}>SLIP</span>
          {verdict.band ? (
            <span className="font-mono" style={{ color: bandColor(verdict.band), fontWeight: 800 }}>{verdict.band}</span>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.7)" }}>{sendLegs.length} give · {receiveLegs.length} get</span>
          )}
          <ChevronUp size={13} aria-hidden />
        </button>
      )}

      {sheetOpen && (
        <>
          <div className="tc-sheet-backdrop" onClick={closeSlip} aria-hidden />
          <div className="tc-sheet" role="dialog" aria-modal="true" aria-label="Trade slip">
            <div className="tc-sheet-grab">
              <button type="button" className="tc-sheet-close" onClick={closeSlip} aria-label="Close slip">
                <X size={15} />
              </button>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>Trade slip</div>
                {legs.length > 0 && (
                  <button type="button" onClick={clearSlip} style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", borderRadius: 7, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Clear
                  </button>
                )}
              </div>

              <div>
                <label className="edge-field-label" htmlFor="slip-league">League</label>
                <select id="slip-league" style={{ width: "100%" }} value={leagueId} onChange={(e) => setLeague(e.target.value)}>
                  <option value="">No league (raw market pricing)</option>
                  {leagues.map((l) => (
                    <option key={l.league_id} value={l.league_id}>
                      {l.league_name} ({l.mode.toUpperCase()}{l.scoring_label ? ` | ${l.scoring_label}` : ""})
                    </option>
                  ))}
                </select>
              </div>

              {leagueId && opponents.length > 0 && (
                <div>
                  <span className="edge-field-label">Trade partner</span>
                  <div className="opp-row">
                    {opponents.map((o) => {
                      const active = o.roster_id === opponentRosterId;
                      return (
                        <button
                          key={o.roster_id}
                          type="button"
                          className={`opp-chip${active ? " active" : ""}`}
                          onClick={() => setOpponent(active ? null : o.roster_id)}
                          style={{ minWidth: 120, gridTemplateColumns: "minmax(0, 1fr)" }}
                        >
                          <span className="opp-name">{o.display_name}</span>
                          <span className="opp-needs">{o.archetype}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="slip-ticket">
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ color: "var(--red)", fontSize: 10, fontWeight: 900, letterSpacing: "0.08em" }}>YOU SEND</span>
                    {sendTotal != null && <span className="font-mono" style={{ color: "var(--red)", fontSize: 12, fontWeight: 800 }}>{formatTradeValue(sendTotal)}</span>}
                  </div>
                  {sendLegs.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 11, padding: "6px 0" }}>Nothing yet — add from any roster or ticket.</div>}
                  {sendLegs.map((leg, i) => (
                    <LegRow key={`s-${i}`} leg={leg} value={legValue(leg, sendAssetValues, i)} onRemove={() => removeLeg(legs.indexOf(leg))} />
                  ))}
                </div>
                <div style={{ borderTop: "1px dashed var(--border)", margin: "10px 0" }} />
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ color: "var(--green)", fontSize: 10, fontWeight: 900, letterSpacing: "0.08em" }}>YOU GET</span>
                    {receiveTotal != null && <span className="font-mono" style={{ color: "var(--green)", fontSize: 12, fontWeight: 800 }}>{formatTradeValue(receiveTotal)}</span>}
                  </div>
                  {receiveLegs.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 11, padding: "6px 0" }}>Nothing yet.</div>}
                  {receiveLegs.map((leg, i) => (
                    <LegRow key={`r-${i}`} leg={leg} value={legValue(leg, receiveAssetValues, i)} onRemove={() => removeLeg(legs.indexOf(leg))} />
                  ))}
                </div>
              </div>

              {hasBothSides && (
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                  {evalMutation.isPending && !result && (
                    <div className="animate-pulse" style={{ color: "var(--accent)", fontSize: 12, fontWeight: 700 }}>Pricing...</div>
                  )}
                  {result && (
                    <>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ background: fairnessTint(result.fairness), color: "var(--dark)", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 800 }}>
                          {fairnessLabel(result.fairness)}
                        </span>
                        {verdict.band && (
                          <span style={{ border: `1px solid ${bandColor(verdict.band)}`, color: bandColor(verdict.band), borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>
                            {verdict.band}{verdict.probability != null ? ` · ${Math.round(verdict.probability)}%` : ""}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: result.delta > 0 ? "var(--red)" : result.delta < 0 ? "var(--green)" : "var(--text-dim)", fontWeight: 700 }}>
                          {result.delta > 0 ? `You overpay ${formatTradeValue(Math.abs(result.delta))}` : result.delta < 0 ? `You underpay ${formatTradeValue(Math.abs(result.delta))}` : "Dead even"}
                        </span>
                      </div>
                      {!activeOpponent && leagueId && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Pick a partner above to see how likely they say yes.</div>
                      )}
                      {acceptance && (acceptance.accept_reasons[0] || acceptance.reject_reasons[0]) && (
                        <div style={{ display: "grid", gap: 3 }}>
                          {acceptance.accept_reasons[0] && <div style={{ fontSize: 11, color: "var(--green)", lineHeight: 1.4 }}>+ {acceptance.accept_reasons[0]}</div>}
                          {acceptance.reject_reasons[0] && <div style={{ fontSize: 11, color: "var(--red)", lineHeight: 1.4 }}>- {acceptance.reject_reasons[0]}</div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={pitch}
                  disabled={!result}
                  className="edge-primary-button"
                  style={{ flex: 1, minWidth: 150, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: result ? 1 : 0.5 }}
                >
                  <Copy size={14} aria-hidden /> {copied ? "Copied — paste it in Sleeper" : "Pitch it"}
                </button>
                {leagueId && (
                  <a
                    href={`https://sleeper.app/leagues/${leagueId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="edge-secondary-button"
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none", lineHeight: "40px" }}
                  >
                    <ExternalLink size={14} aria-hidden /> Sleeper
                  </a>
                )}
                {league && hasBothSides && (
                  <button
                    type="button"
                    className="edge-secondary-button"
                    style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
                    onClick={() => saveTicket({ leagueName: league.league_name, opponentName: activeOpponent?.display_name ?? null, status: "open" })}
                  >
                    <Bookmark size={14} aria-hidden /> Save
                  </button>
                )}
              </div>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 10.5, lineHeight: 1.45 }}>
                Pitch copies a ready-to-send message. The deal itself gets made in Sleeper — likelihood bands are the model's read, not a promise.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function SlipTicketRow({ id, onLoad }: { id: string; onLoad: () => void }) {
  const { tickets, removeTicket } = useSlip();
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return null;
  const gives = ticket.legs.filter((l) => l.side === "send").map((l) => l.label);
  const gets = ticket.legs.filter((l) => l.side === "receive").map((l) => l.label);
  return (
    <div className="ticket-row">
      <button type="button" onClick={onLoad} style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: "var(--text)", textAlign: "left", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.league_name}</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: ticket.status === "pitched" ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }}>
            {ticket.status === "pitched" ? "PITCHED" : "OPEN"}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--red)" }}>{gives.join(", ") || "—"}</span>
          {" → "}
          <span style={{ color: "var(--green)" }}>{gets.join(", ") || "—"}</span>
          {ticket.opponent_name ? ` · ${ticket.opponent_name}` : ""}
        </div>
      </button>
      <button type="button" onClick={() => removeTicket(ticket.id)} aria-label="Delete ticket" style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: 4, display: "grid" }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
