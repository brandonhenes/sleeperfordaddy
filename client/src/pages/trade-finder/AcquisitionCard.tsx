import { useState } from "react";
import VerdictBadge from "../../components/VerdictBadge";
import { fairnessLabel, formatTradeValue } from "../../lib/format";
import type { AcquisitionOpportunity } from "@shared/types";

function DifficultyBadge({ difficulty }: { difficulty: AcquisitionOpportunity["difficulty"] }) {
  const colors = {
    easy: { bg: "#22c55e", text: "#fff" },
    moderate: { bg: "#f59e0b", text: "#000" },
    hard: { bg: "#f97316", text: "#fff" },
    near_impossible: { bg: "#ef4444", text: "#fff" },
  };
  const labels = { easy: "Easy", moderate: "Moderate", hard: "Hard", near_impossible: "Near Impossible" };
  const c = colors[difficulty.label];
  return (
    <span style={{ background: c.bg, color: c.text, padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
      {labels[difficulty.label]} ({difficulty.score})
    </span>
  );
}

export default function AcquisitionCard({ opportunity }: { opportunity: AcquisitionOpportunity }) {
  const [open, setOpen] = useState(false);
  const [activeOffer, setActiveOffer] = useState(0);
  const { owner, difficulty, packages, trade_history } = opportunity;
  const offer = packages[activeOffer];

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontFamily: "inherit" }}
      >
        <DifficultyBadge difficulty={difficulty} />
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{owner.display_name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{opportunity.league_name} | {owner.archetype} | {difficulty.positional_importance}</div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", maxWidth: 200 }}>{packages.length} offer{packages.length !== 1 ? "s" : ""}</div>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{open ? "\u00e2\u2013\u00b2" : "\u00e2\u2013\u00bc"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12, lineHeight: 1.6 }}>{difficulty.reasons.join(" | ")}</div>

          {packages.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {packages.map((p, i) => (
                <button
                  key={`${p.label}-${i}`}
                  onClick={() => setActiveOffer(i)}
                  style={{ background: activeOffer === i ? "var(--amber)" : "var(--dark-base)", color: activeOffer === i ? "var(--dark-base)" : "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {offer && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: 0.5, marginBottom: 6, borderBottom: "2px solid #ef4444", paddingBottom: 4 }}>
                    YOU SEND (TV {formatTradeValue(offer.send_total)})
                  </div>
                  {offer.you_send.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                      <span style={{ background: "var(--amber)", color: "#000", fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "1px 5px", minWidth: 24, textAlign: "center" }}>{Math.round(a.edge_score)}</span>
                      {a.asset_type === "pick" && <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 9 }}>PICK</span>}
                      <span style={{ flex: 1, fontWeight: 500 }}>{a.label}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: 10 }}>TV {formatTradeValue(a.context_trade_value ?? a.trade_power)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", letterSpacing: 0.5, marginBottom: 6, borderBottom: "2px solid #22c55e", paddingBottom: 4 }}>
                    YOU GET (TV {formatTradeValue(offer.receive_total)})
                  </div>
                  {offer.you_receive.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                      <span style={{ background: "var(--green)", color: "#000", fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "1px 5px", minWidth: 24, textAlign: "center" }}>{Math.round(a.edge_score)}</span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{a.label}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: 10 }}>TV {formatTradeValue(a.context_trade_value ?? a.trade_power)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, marginTop: 12, padding: "8px 0", color: offer.delta >= 0 ? "var(--green)" : "var(--red)" }}>
                KTC League: {offer.delta >= 0 ? "you get value" : "you overpay"} by TV {formatTradeValue(Math.abs(offer.delta))}
                <span style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 500, marginLeft: 6 }}>
                  ({fairnessLabel(offer.fairness)})
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <VerdictBadge verdict={offer.their_perspective.verdict} />
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{offer.their_perspective.verdict_reason}</span>
              </div>

              {offer.sweetener_hint && (
                <div style={{ marginTop: 8, padding: "8px 14px", background: "rgba(61,139,253,0.08)", border: "1px solid rgba(61,139,253,0.2)", borderRadius: 8, fontSize: 12, color: "var(--amber)" }}>
                  {offer.sweetener_hint}
                </div>
              )}

              <div style={{ marginTop: 14, background: "var(--dark-base)", borderRadius: 10, border: "1px solid var(--border)", padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#3b82f6", letterSpacing: 0.5, marginBottom: 10 }}>THEIR PERSPECTIVE</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 10 }}>{offer.their_perspective.archetype_analysis}</div>

                {offer.their_perspective.lineup_before.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>THEIR LINEUP BEFORE</div>
                      {offer.their_perspective.lineup_before.map((l, i) => <div key={i} style={{ fontSize: 11, color: "var(--text-dim)", padding: "2px 0" }}>{l.position}: {l.player} ({Math.round(l.edge_score)})</div>)}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>THEIR LINEUP AFTER</div>
                      {offer.their_perspective.lineup_after.map((l, i) => <div key={i} style={{ fontSize: 11, color: "var(--text-dim)", padding: "2px 0" }}>{l.position}: {l.player} ({Math.round(l.edge_score)})</div>)}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 600, color: offer.their_perspective.net_starter_value_change >= 0 ? "var(--green)" : "var(--red)" }}>
                  Net starter value: {offer.their_perspective.net_starter_value_change >= 0 ? "+" : ""}{offer.their_perspective.net_starter_value_change.toFixed(1)} edge
                </div>

                {offer.their_perspective.needs_addressed.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {offer.their_perspective.needs_addressed.map((n, i) => <span key={i} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "rgba(34,197,94,0.12)", color: "var(--green)" }}>{n}</span>)}
                  </div>
                )}
                {offer.their_perspective.needs_still_open.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {offer.their_perspective.needs_still_open.map((n, i) => <span key={i} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "rgba(239,68,68,0.12)", color: "var(--red)" }}>{n}</span>)}
                  </div>
                )}
              </div>

              {trade_history.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 6 }}>
                    PREVIOUS TRADES FOR THIS PLAYER
                  </div>
                  {trade_history.map((t, i) => (
                    <div key={i} style={{ fontSize: 11, color: "var(--text-dim)", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--text-muted)" }}>{t.date}</span> in {t.league_name}: Gave {t.gave.join(", ")} | Got {t.received.join(", ")}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {packages.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "16px 0" }}>No viable packages found from your roster in this league. You may not have enough assets to offer.</div>}
        </div>
      )}
    </div>
  );
}
