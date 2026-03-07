import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import { PlayerLink } from "../components/ui";
import { useEnsureUser } from "../hooks/use-ensure-user";
import { usePowerRankings } from "../hooks/use-power-rankings";
import { useTradeSuggestions, useShopPlayer } from "../hooks/use-trade-finder";
import { useAcquisition } from "../hooks/use-acquisition";
import { usePortfolio } from "../hooks/use-portfolio";
import { apiFetch } from "../lib/api";
import type {
  TradeSuggestion,
  TradePackage,
  TradePackageAsset,
  AcquisitionOpportunity,
  OpponentPerspective,
  ShopOpportunity,
  EvaluatedAsset,
} from "../../../shared/types";

const POS_COLOR: Record<string, string> = {
  QB: "#e15241",
  RB: "#54b948",
  WR: "#539bf5",
  TE: "#f0a33b",
};

function posColor(position: string): string {
  return POS_COLOR[position] ?? "var(--text-muted)";
}

function fairnessLabel(fairness: string): string {
  if (fairness === "fair") return "FAIR";
  if (fairness === "slight_edge") return "SLIGHT EDGE";
  return "LOPSIDED";
}

function acceptanceColor(label: "Likely" | "Possible" | "Unlikely" | "Hard"): string {
  if (label === "Likely") return "var(--green)";
  if (label === "Possible") return "var(--amber)";
  if (label === "Unlikely") return "#f97316";
  return "var(--red)";
}

function AssetRow({ asset }: { asset: TradePackageAsset }) {
  const adjustedDiff =
    asset.league_adjusted_score != null ? asset.league_adjusted_score - asset.edge_score : 0;
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
      {asset.position && <span style={{ color: posColor(asset.position), fontWeight: 700, fontSize: 10 }}>{asset.position}</span>}
      <PlayerLink name={asset.label} style={{ flex: 1, fontWeight: 500 }} />
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
    </div>
  );
}

function PackageView({ pkg }: { pkg: TradePackage }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              {pkg.acceptance.accept_reasons.slice(0, 2).map((r, i) => (
                <div key={`acc-${i}`} style={{ fontSize: 11, color: "var(--green)", lineHeight: 1.5 }}>
                  • {r}
                </div>
              ))}
            </div>
            <div>
              {pkg.acceptance.reject_reasons.slice(0, 2).map((r, i) => (
                <div key={`rej-${i}`} style={{ fontSize: 11, color: "var(--red)", lineHeight: 1.5 }}>
                  • {r}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12, fontSize: 12 }}>
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
        <div style={{ marginTop: 10, padding: "8px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, fontSize: 12, color: "var(--amber)" }}>
          {pkg.sweetener_hint}
        </div>
      )}
    </div>
  );
}

function PartnerCard({ suggestion }: { suggestion: TradeSuggestion }) {
  const [open, setOpen] = useState(false);
  const [activePackage, setActivePackage] = useState(0);
  const { partner, packages } = suggestion;
  const pkg = packages[activePackage];

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontFamily: "inherit" }}
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
        <div style={{ flex: 1, textAlign: "left" }}>
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
        <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 300, textAlign: "right" }}>{partner.compatibility_reason}</div>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{open ? "▲" : "▼"}</span>
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

function VerdictBadge({ verdict }: { verdict: OpponentPerspective["verdict"] }) {
  const map = {
    likely_accept: { bg: "#22c55e", label: "Likely Accept" },
    might_accept: { bg: "#f59e0b", label: "Might Accept" },
    unlikely: { bg: "#f97316", label: "Unlikely" },
    no_chance: { bg: "#ef4444", label: "No Chance" },
  };
  const v = map[verdict];
  return <span style={{ background: v.bg, color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{v.label}</span>;
}

function AcquisitionCard({ opportunity }: { opportunity: AcquisitionOpportunity }) {
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
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{open ? "▲" : "▼"}</span>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: 0.5, marginBottom: 6, borderBottom: "2px solid #ef4444", paddingBottom: 4 }}>
                    YOU SEND ({offer.send_total.toFixed(1)})
                  </div>
                  {offer.you_send.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                      <span style={{ background: "var(--amber)", color: "#000", fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "1px 5px", minWidth: 24, textAlign: "center" }}>{Math.round(a.edge_score)}</span>
                      {a.asset_type === "pick" && <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 9 }}>PICK</span>}
                      <span style={{ flex: 1, fontWeight: 500 }}>{a.label}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", letterSpacing: 0.5, marginBottom: 6, borderBottom: "2px solid #22c55e", paddingBottom: 4 }}>
                    YOU GET ({offer.receive_total.toFixed(1)})
                  </div>
                  {offer.you_receive.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                      <span style={{ background: "var(--green)", color: "#000", fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "1px 5px", minWidth: 24, textAlign: "center" }}>{Math.round(a.edge_score)}</span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <VerdictBadge verdict={offer.their_perspective.verdict} />
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{offer.their_perspective.verdict_reason}</span>
              </div>

              {offer.sweetener_hint && (
                <div style={{ marginTop: 8, padding: "8px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, fontSize: 12, color: "var(--amber)" }}>
                  {offer.sweetener_hint}
                </div>
              )}

              <div style={{ marginTop: 14, background: "var(--dark-base)", borderRadius: 10, border: "1px solid var(--border)", padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#3b82f6", letterSpacing: 0.5, marginBottom: 10 }}>THEIR PERSPECTIVE</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 10 }}>{offer.their_perspective.archetype_analysis}</div>

                {offer.their_perspective.lineup_before.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
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

function AssetChip({ asset }: { asset: EvaluatedAsset }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
      <span style={{
        background: asset.edge_score >= 80 ? "var(--green)" : asset.edge_score >= 60 ? "var(--amber)" : asset.edge_score >= 45 ? "var(--text-muted)" : "var(--red)",
        color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "1px 5px", minWidth: 24, textAlign: "center",
      }}>
        {Math.round(asset.edge_score)}
      </span>
      {asset.trade_power > 0 && (
        <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
          TP:{asset.trade_power.toFixed(1)}
        </span>
      )}
      {asset.position && <span style={{ color: posColor(asset.position), fontWeight: 700, fontSize: 10 }}>{asset.position}</span>}
      <PlayerLink name={asset.label} style={{ flex: 1, fontWeight: 500 }} />
    </div>
  );
}

function ShopOpportunityCard({ opp }: { opp: ShopOpportunity }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{opp.league_name}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginLeft: 8, padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
            {opp.your_archetype}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: opp.opportunity_score >= 70 ? "var(--green)" : opp.opportunity_score >= 50 ? "var(--amber)" : "var(--text-muted)" }}>
          {opp.opportunity_score}/100
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "2px solid #ef4444", paddingBottom: 4, marginBottom: 6 }}>
            You Send
          </div>
          <AssetChip asset={opp.you_send} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "2px solid #22c55e", paddingBottom: 4, marginBottom: 6 }}>
            You Receive from {opp.from_team}
          </div>
          {opp.you_receive.map((a, i) => (
            <AssetChip key={i} asset={a} />
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 10, background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
        <div>
          <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>Why they buy: </span>
          {opp.buyer_motivation}
        </div>
        {opp.source_edge && (
          <div>
            <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>Value edge: </span>
            {opp.source_edge}
          </div>
        )}
        <div>
          <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>Window fit: </span>
          {opp.window_match}
        </div>
        <div>
          <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>Roster impact: </span>
          {opp.roster_impact.net_summary}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 12 }}>
        <span style={{
          color: opp.fairness === "fair" ? "var(--green)" : opp.fairness === "slight_edge" ? "var(--amber)" : "var(--red)",
          fontWeight: 600, textTransform: "uppercase", fontSize: 11,
        }}>
          {opp.fairness === "fair" ? "Fair" : opp.fairness === "slight_edge" ? "Slight Edge" : "Lopsided"} Trade
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          Delta: {opp.delta > 0 ? "+" : ""}{opp.delta.toFixed(1)} edge
        </span>
      </div>
    </div>
  );
}

export default function TradeFinder() {
  const { username } = useParams<{ username: string }>();
  const { phase } = useEnsureUser(username);
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [mode, setMode] = useState<"find" | "acquire" | "shop">("find");
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<{ name: string; id: string } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState("");

  const { data: leagues, isLoading: leaguesLoading } = usePowerRankings(phase === "ready" ? username : "");
  const { data: suggestions, isLoading: suggestionsLoading, error: suggestionsError } = useTradeSuggestions(phase === "ready" ? username : "", selectedLeague);
  const { data: portfolio } = usePortfolio(phase === "ready" ? username : undefined);

  const { data: targetResults = [] } = useQuery<{ player_id: string; label: string; position: string; team: string | null }[]>({
    queryKey: ["acquire-search", targetSearch],
    enabled: mode === "acquire" && targetSearch.trim().length >= 2,
    queryFn: () => apiFetch(`/api/trade/assets?q=${encodeURIComponent(targetSearch.trim())}&limit=8`),
  });

  const { data: acquisitionData, isLoading: acquisitionLoading } = useAcquisition(phase === "ready" ? username : "", selectedTarget);
  const { data: shopResult, isLoading: shopLoading } = useShopPlayer(
    phase === "ready" ? username ?? "" : "",
    mode === "shop" ? selectedPlayer : ""
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("mode");
    const urlPlayer = params.get("player");
    const urlLeague = params.get("league");

    if (urlLeague) {
      setSelectedLeague(urlLeague);
    }
    if (urlMode === "shop" && urlPlayer) {
      setMode("shop");
      setSelectedPlayer(urlPlayer);
    }
  }, []);

  if (phase === "checking" || phase === "syncing") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Finder</h1>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "var(--amber)", fontSize: 14 }}>
          <span className="animate-pulse">Loading...</span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Finder</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Suggested trades and acquisition plans based on roster composition, archetypes, and draft capital
        </p>
        <FreshnessBar />
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16, marginTop: 8 }}>
        {([
          { key: "find" as const, label: "Find Trades" },
          { key: "acquire" as const, label: "What Would It Take?" },
          { key: "shop" as const, label: "Shop a Player" },
        ]).map((m) => (
          <button
            key={m.key}
            onClick={() => { setMode(m.key); setSelectedTarget(null); setSelectedPlayer(""); }}
            style={{ background: "transparent", border: "none", borderBottom: mode === m.key ? "2px solid var(--amber)" : "2px solid transparent", color: mode === m.key ? "var(--amber)" : "var(--text-muted)", padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3, transition: "color 0.15s, border-color 0.15s", fontFamily: "inherit" }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "find" && (
        <>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Select League</label>
            {leaguesLoading ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}><span className="animate-pulse">Loading leagues...</span></div>
            ) : (
              <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)} style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, cursor: "pointer" }}>
                <option value="">Choose a league...</option>
                {leagues?.map((league) => <option key={league.league_id} value={league.league_id}>{league.league_name} ({league.mode.toUpperCase()}{league.scoring_label ? ` · ${league.scoring_label}` : ""})</option>)}
              </select>
            )}
          </div>

          {!selectedLeague && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Select a league above to find trade opportunities</div>}
          {selectedLeague && suggestionsLoading && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}><div style={{ color: "var(--amber)", fontSize: 14 }}><span className="animate-pulse">Analyzing rosters and building package variants...</span></div></div>}
          {selectedLeague && suggestionsError && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--red)", fontSize: 13 }}>Failed to load trade suggestions. Try again later.</div>}

          {selectedLeague && !suggestionsLoading && suggestions && suggestions.length === 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>No trade partner fits found for this league</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>This can happen if there is limited need overlap. Try the Trade Calculator for custom scenarios.</p>
              <Link href="/trade-calculator" style={{ display: "inline-block", marginTop: 12, padding: "8px 16px", background: "linear-gradient(135deg, var(--amber), var(--amber-dark))", color: "var(--dark-base)", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Open Trade Calculator</Link>
            </div>
          )}

          {selectedLeague && !suggestionsLoading && suggestions && suggestions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{suggestions.length} partner{suggestions.length !== 1 ? "s" : ""} found</span>
              </div>
              {suggestions.map((suggestion, i) => <PartnerCard key={`${suggestion.partner.roster_id}-${i}`} suggestion={suggestion} />)}
            </div>
          )}
        </>
      )}

      {mode === "acquire" && (
        <div>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: 0.5 }}>WHO DO YOU WANT?</label>
            <input value={targetSearch} onChange={(e) => { setTargetSearch(e.target.value); setSelectedTarget(null); }} placeholder="Search for a player..." style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            {targetResults.length > 0 && !selectedTarget && (
              <div style={{ marginTop: 8, display: "grid", gap: 4, maxHeight: 240, overflowY: "auto" }}>
                {targetResults.map((r) => (
                  <button key={r.player_id} onClick={() => { setSelectedTarget({ name: r.label, id: r.player_id }); setTargetSearch(r.label); }} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", background: "none", color: "var(--text)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left", width: "100%" }}>
                    <span style={{ fontWeight: 700, fontSize: 11, width: 24 }}>{r.position}</span>
                    <span style={{ flex: 1 }}>{r.label}</span>
                    {r.team && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.team}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {acquisitionLoading && selectedTarget && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}><span className="animate-pulse" style={{ color: "var(--amber)", fontSize: 14 }}>Analyzing acquisition options across all leagues...</span></div>}

          {acquisitionData && !acquisitionLoading && (
            <div style={{ marginTop: 16 }}>
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>{acquisitionData.summary}</div>
              {acquisitionData.opportunities.length === 0 && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>This player is not owned by anyone else in your leagues (or you own them in every league).</div>}
              {acquisitionData.opportunities.map((opp) => <AcquisitionCard key={opp.league_id} opportunity={opp} />)}
            </div>
          )}
        </div>
      )}

      {mode === "shop" && (
        <div>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Select a Player to Shop
            </label>
            <select
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, cursor: "pointer" }}
            >
              <option value="">Choose a player...</option>
              {["QB", "RB", "WR", "TE"].map((pos) => {
                const posPlayers = portfolio?.players
                  ?.filter((p) => p.position === pos)
                  ?.sort((a, b) => b.edge_score - a.edge_score) ?? [];
                if (posPlayers.length === 0) return null;
                return (
                  <optgroup key={pos} label={pos}>
                    {posPlayers.map((p) => (
                      <option key={p.player_id} value={p.player_id}>
                        {p.full_name} (Edge {Math.round(p.edge_score)}) — {p.leagues_owned} league{p.leagues_owned !== 1 ? "s" : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {selectedPlayer && shopLoading && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
              <span className="animate-pulse" style={{ color: "var(--amber)", fontSize: 14 }}>
                Scanning all leagues for the best deals...
              </span>
            </div>
          )}

          {selectedPlayer && shopResult && !shopLoading && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {shopResult.player_name} owned in {shopResult.leagues_owned} league{shopResult.leagues_owned !== 1 ? "s" : ""} — {shopResult.opportunities.length} opportunit{shopResult.opportunities.length !== 1 ? "ies" : "y"} found
                </span>
              </div>
              {shopResult.opportunities.map((opp, i) => (
                <ShopOpportunityCard key={`${opp.league_id}-${i}`} opp={opp} />
              ))}
              {shopResult.opportunities.length === 0 && (
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No good trade opportunities found for this player across your leagues.
                  This can happen if no opponents have matching needs or fair return assets.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
