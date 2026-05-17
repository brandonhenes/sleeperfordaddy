import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import OpponentCard from "../components/OpponentCard";
import OpponentDetail from "../components/OpponentDetail";
import { PickBadge, PlayerLink } from "../components/ui";
import { useEnsureUser } from "../hooks/use-ensure-user";
import { usePowerRankings, type LeaguePowerRanking } from "../hooks/use-power-rankings";
import { useTradeSuggestions, useShopPlayer } from "../hooks/use-trade-finder";
import { useAcquisition } from "../hooks/use-acquisition";
import {
  useOpponentExploits,
  useOpponentProfiles,
  useRefreshOpponentProfiles,
} from "../hooks/use-opponent-profiles";
import { usePortfolio } from "../hooks/use-portfolio";
import { apiFetch } from "../lib/api";
import { classStrengthQueryParams } from "../lib/pick-strengths";
import { buildTradeFinderUrl, parseTradeFinderQuery } from "../lib/trade-finder-url";
import type {
  PickValue,
  TradeSuggestion,
  TradePackage,
  TradePackageAsset,
  AcquisitionOpportunity,
  OpponentPerspective,
  ShopOpportunity,
  EvaluatedAsset,
  OpponentProfile,
  TradeHealthWarning,
} from "../../../shared/types";

interface LeaguePicksResponse {
  picks: PickValue[];
  totalPickValue: number;
  picksByRound: Record<string, PickValue[]>;
}

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

function acceptanceColor(label: "Likely" | "Possible" | "Unlikely" | "Hard"): string {
  if (label === "Likely") return "var(--green)";
  if (label === "Possible") return "var(--amber)";
  if (label === "Unlikely") return "#f97316";
  return "var(--red)";
}

function warningColors(type: TradeHealthWarning["type"]) {
  if (type === "block") {
    return {
      background: "rgba(239,68,68,0.12)",
      border: "1px solid rgba(239,68,68,0.28)",
      color: "#fca5a5",
      label: "#f87171",
    };
  }
  return {
    background: "rgba(245,158,11,0.12)",
    border: "1px solid rgba(245,158,11,0.28)",
    color: "#fcd34d",
    label: "#fbbf24",
  };
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getActivityWeight(level: OpponentProfile["activityLevel"]): number {
  if (level === "hyperactive") return 100;
  if (level === "active") return 80;
  if (level === "moderate") return 50;
  if (level === "passive") return 20;
  return 0;
}

function getTendencyStrength(profile: OpponentProfile): number {
  const acquired = Object.values(profile.positionsAcquired);
  const sold = Object.values(profile.positionsSold);
  const acquiredSpread = acquired.length > 0 ? Math.max(...acquired) - Math.min(...acquired) : 0;
  const soldSpread = sold.length > 0 ? Math.max(...sold) - Math.min(...sold) : 0;
  const ageWeight =
    profile.ageBias === "youth_chaser" || profile.ageBias === "win_now_buyer"
      ? 30
      : profile.ageBias === "leans_young" || profile.ageBias === "leans_vet"
        ? 15
        : 0;
  const pickWeight =
    profile.pickTendency === "hoarder" || profile.pickTendency === "spender"
      ? 20
      : profile.pickTendency === "accumulator" || profile.pickTendency === "seller"
        ? 10
        : 0;
  return Math.min(100, acquiredSpread * 8 + soldSpread * 6 + ageWeight + pickWeight);
}

function getRosterGapScore(profile: OpponentProfile, league: LeaguePowerRanking | undefined): number {
  const roster = league?.rosters.find((entry) => entry.roster_id === profile.rosterId);
  const slotGrades = roster?.lineup?.slot_grades ?? [];
  let score = 0;
  for (const grade of slotGrades) {
    if (grade.grade === "hole") score += 22;
    else if (grade.grade === "weak") score += 12;
    else if (grade.grade === "average") score += 4;
  }
  return Math.min(100, score);
}

function getExploitability(profile: OpponentProfile, league: LeaguePowerRanking | undefined): number {
  const activityWeight = getActivityWeight(profile.activityLevel);
  const tendencyStrength = getTendencyStrength(profile);
  const rosterGapScore = getRosterGapScore(profile, league);
  return Math.round(
    activityWeight * 0.4 + tendencyStrength * 0.3 + rosterGapScore * 0.3
  );
}

function TradeHealthList({ warnings }: { warnings: TradeHealthWarning[] }) {
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

function AssetRow({ asset }: { asset: TradePackageAsset }) {
  const adjustedDiff =
    asset.league_adjusted_score != null ? asset.league_adjusted_score - asset.edge_score : 0;
  const pickBreakdown = asset.pick_breakdown ?? null;
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
      {(oppLabel || tierLabel || qualityLabel || pkg.is_pick_only != null) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {oppLabel && (
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--amber)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 999, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>
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
  const isPick = asset.position == null;
  const pickBreakdown = asset.pick_breakdown ?? null;
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
      {isPick && <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 10 }}>PICK</span>}
      {asset.position && <span style={{ color: posColor(asset.position), fontWeight: 700, fontSize: 10 }}>{asset.position}</span>}
      {pickBreakdown ? (
        <div style={{ flex: 1 }}>
          <PickBadge pick={pickBreakdown} compact />
        </div>
      ) : (
        <PlayerLink name={asset.label} style={{ flex: 1, fontWeight: 500 }} />
      )}
    </div>
  );
}

function ShopOpportunityCard({ opp }: { opp: ShopOpportunity }) {
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
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{opp.league_name}</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "rgba(245,158,11,0.1)", color: "var(--amber)" }}>
            {opp.path_label}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
            {opp.from_archetype}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: opp.opportunity_score >= 60 ? "var(--green)" : opp.opportunity_score >= 40 ? "var(--amber)" : "var(--text-muted)" }}>
          {opp.opportunity_score}/100
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "2px solid #ef4444", paddingBottom: 4, marginBottom: 6 }}>
            You Send ({sendContextValue.toFixed(1)} TP)
          </div>
          {opp.you_send.map((a, i) => (
            <AssetChip key={`send-${i}-${a.label}`} asset={a} />
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "2px solid #22c55e", paddingBottom: 4, marginBottom: 6 }}>
            You Receive from {opp.from_team} ({receiveContextValue.toFixed(1)} TP)
          </div>
          {opp.you_receive.map((a, i) => (
            <AssetChip key={`receive-${i}-${a.label}`} asset={a} />
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 10, background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
        <div>
          <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>Why you do it: </span>
          {opp.why_you_do_it}
        </div>
        <div>
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
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{opp.buyer_motivation}</span>
        </div>
        {opp.acceptance.accept_reasons.length > 0 && (
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 2 }}>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>Accept: </span>
            {opp.acceptance.accept_reasons.join(" | ")}
          </div>
        )}
        {opp.acceptance.reject_reasons.length > 0 && (
          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
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

function PickInventoryPanel({
  data,
  isLoading,
}: {
  data: LeaguePicksResponse | undefined;
  isLoading: boolean;
}) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Pick Inventory
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
            Current direct pick value across the league
          </div>
        </div>
        {data && (
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--amber)" }}>
            Total Edge {Math.round(data.totalPickValue)}
          </div>
        )}
      </div>
      {isLoading && (
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
          <span className="animate-pulse">Loading pick values...</span>
        </div>
      )}
      {!isLoading && (!data || data.picks.length === 0) && (
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No owned picks found in this league.</div>
      )}
      {data && data.picks.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.picks.map((pick) => (
            <PickBadge
              key={`${pick.season}-${pick.round}-${pick.pickSlot}-${pick.originalOwnerRosterId ?? "x"}`}
              pick={pick}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TradeFinder() {
  const { username } = useParams<{ username: string }>();
  const { phase } = useEnsureUser(username);
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [mode, setMode] = useState<"find" | "acquire" | "shop" | "scout">("find");
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<{ name: string; id: string } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [shopAmbition, setShopAmbition] = useState(2);
  const [showShopRedraft, setShowShopRedraft] = useState(false);
  const [shopPathFilter, setShopPathFilter] = useState<string | null>(null);
  const [selectedScoutRosterId, setSelectedScoutRosterId] = useState<number | null>(null);
  const [pendingScoutRosterId, setPendingScoutRosterId] = useState<number | null>(null);
  const [scoutRouteWarning, setScoutRouteWarning] = useState<string | null>(null);
  const scoutDetailRef = useRef<HTMLDivElement | null>(null);

  const { data: leagues, isLoading: leaguesLoading } = usePowerRankings(phase === "ready" ? username : "", showShopRedraft);
  const { data: suggestions, isLoading: suggestionsLoading, error: suggestionsError } = useTradeSuggestions(phase === "ready" ? username : "", selectedLeague);
  const { data: portfolio } = usePortfolio(phase === "ready" ? username : undefined);
  const selectedLeagueData = leagues?.find((league) => league.league_id === selectedLeague);
  const classStrengthSuffix = classStrengthQueryParams();
  const leaguePicksQuery = useQuery<LeaguePicksResponse>({
    queryKey: ["league-picks", username, selectedLeague, classStrengthSuffix],
    queryFn: () =>
      apiFetch(
        `/api/picks/${encodeURIComponent(selectedLeague)}/${encodeURIComponent(username)}${classStrengthSuffix ? `?${classStrengthSuffix.slice(1)}` : ""}`
      ),
    enabled: phase === "ready" && mode === "find" && !!selectedLeague,
    staleTime: 60 * 1000,
  });
  const scoutProfilesQuery = useOpponentProfiles(
    phase === "ready" && mode === "scout" ? username : "",
    mode === "scout" ? selectedLeague : ""
  );
  const refreshProfilesMutation = useRefreshOpponentProfiles();
  const exploitAnglesQuery = useOpponentExploits(
    phase === "ready" && mode === "scout" ? username : "",
    mode === "scout" ? selectedLeague : "",
    mode === "scout" ? selectedScoutRosterId : null
  );

  const { data: targetResults = [] } = useQuery<{ player_id: string; label: string; position: string; team: string | null }[]>({
    queryKey: ["acquire-search", targetSearch],
    enabled: mode === "acquire" && targetSearch.trim().length >= 2,
    queryFn: () => apiFetch(`/api/trade/assets?q=${encodeURIComponent(targetSearch.trim())}&limit=8`),
  });

  const { data: acquisitionData, isLoading: acquisitionLoading } = useAcquisition(phase === "ready" ? username : "", selectedTarget);
  const { data: shopResult, isLoading: shopLoading } = useShopPlayer(
    phase === "ready" ? username ?? "" : "",
    mode === "shop" ? selectedPlayer : "",
    shopAmbition,
    showShopRedraft
  );
  const filteredShopResults = shopResult?.opportunities.filter((o) => !shopPathFilter || o.path === shopPathFilter) ?? [];
  const scoutProfilesWithScores = (scoutProfilesQuery.data?.profiles ?? [])
    .map((profile) => ({
      profile,
      exploitability: getExploitability(profile, selectedLeagueData),
    }))
    .sort((a, b) => b.exploitability - a.exploitability);
  const selectedScoutProfile =
    scoutProfilesWithScores.find(({ profile }) => profile.rosterId === selectedScoutRosterId)?.profile ?? null;
  const filteredSuggestions = (suggestions ?? []).filter(
    (suggestion) =>
      selectedScoutRosterId == null || suggestion.partner.roster_id === selectedScoutRosterId
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const routeState = parseTradeFinderQuery(window.location.search);

    if (routeState.leagueId) {
      setSelectedLeague(routeState.leagueId);
    }

    if (routeState.mode === "shop" && routeState.playerId) {
      setMode("shop");
      setSelectedPlayer(routeState.playerId);
      return;
    }

    if (routeState.mode === "scout") {
      setMode("scout");
      if (!routeState.leagueId) {
        setScoutRouteWarning("Scout link is missing a league. Select a league to continue.");
      }
      if (routeState.invalidOpponentParam) {
        setScoutRouteWarning(`Scout link has an invalid opponent id: ${routeState.invalidOpponentParam}.`);
      } else if (routeState.opponentRosterId != null) {
        setSelectedScoutRosterId(routeState.opponentRosterId);
        setPendingScoutRosterId(routeState.opponentRosterId);
      } else {
        setScoutRouteWarning("Scout link is missing an opponent. Select an opponent card below.");
      }
      return;
    }

    if (routeState.mode === "find" || routeState.mode === "acquire") {
      setMode(routeState.mode);
    }
  }, []);

  useEffect(() => {
    if (pendingScoutRosterId != null) return;
    setSelectedScoutRosterId(null);
    setScoutRouteWarning(null);
  }, [pendingScoutRosterId, selectedLeague]);

  useEffect(() => {
    if (mode !== "scout") return;
    if (scoutProfilesWithScores.length === 0) {
      if (pendingScoutRosterId == null) setSelectedScoutRosterId(null);
      return;
    }
    if (
      pendingScoutRosterId != null &&
      !scoutProfilesWithScores.some(({ profile }) => profile.rosterId === pendingScoutRosterId)
    ) {
      setScoutRouteWarning(`Opponent roster ${pendingScoutRosterId} was not found in this league.`);
      setPendingScoutRosterId(null);
      setSelectedScoutRosterId(null);
      return;
    }
    if (
      selectedScoutRosterId == null ||
      !scoutProfilesWithScores.some(({ profile }) => profile.rosterId === selectedScoutRosterId)
    ) {
      if (scoutRouteWarning) return;
      setSelectedScoutRosterId(scoutProfilesWithScores[0].profile.rosterId);
      return;
    }
    if (pendingScoutRosterId === selectedScoutRosterId) {
      setPendingScoutRosterId(null);
      setScoutRouteWarning(null);
    }
  }, [mode, pendingScoutRosterId, scoutProfilesWithScores, scoutRouteWarning, selectedScoutRosterId]);

  useEffect(() => {
    if (mode !== "scout" || !selectedScoutProfile) return;
    const id = window.setTimeout(() => {
      scoutDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      scoutDetailRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [mode, selectedScoutProfile?.rosterId]);

  function openExploitLink(rosterId: number) {
    if (!selectedLeague || !username) {
      setScoutRouteWarning("Select a league before opening exploit angles.");
      return;
    }
    setMode("scout");
    setSelectedScoutRosterId(rosterId);
    setPendingScoutRosterId(null);
    setScoutRouteWarning(null);
    if (typeof window !== "undefined") {
      const url = buildTradeFinderUrl(username, {
        mode: "scout",
        leagueId: selectedLeague,
        opponentRosterId: rosterId,
      });
      window.history.pushState(null, "", url);
    }
  }

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
        <FreshnessBar leagueId={selectedLeague || undefined} />
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16, marginTop: 8, flexWrap: "wrap" }}>
        {([
          { key: "find" as const, label: "Find Trades" },
          { key: "acquire" as const, label: "What Would It Take?" },
          { key: "shop" as const, label: "Shop a Player" },
          { key: "scout" as const, label: "Scout Opponents" },
        ]).map((m) => (
          <button
            key={m.key}
            onClick={() => { setMode(m.key); setSelectedTarget(null); setSelectedPlayer(""); setShopPathFilter(null); if (m.key !== "scout") setScoutRouteWarning(null); }}
            style={{ background: "transparent", border: "none", borderBottom: mode === m.key ? "2px solid var(--amber)" : "2px solid transparent", color: mode === m.key ? "var(--amber)" : "var(--text-muted)", padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3, transition: "color 0.15s, border-color 0.15s", fontFamily: "inherit", flex: "1 1 auto", minWidth: 0 }}
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

          {selectedScoutProfile && (
            <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "12px 16px", marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                Filtering trade suggestions to <span style={{ color: "var(--amber)", fontWeight: 700 }}>{selectedScoutProfile.displayName}</span> from Scout Opponents.
              </div>
              <button
                type="button"
                onClick={() => setSelectedScoutRosterId(null)}
                style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Clear Filter
              </button>
            </div>
          )}

          {selectedLeague && (
            <PickInventoryPanel
              data={leaguePicksQuery.data}
              isLoading={leaguePicksQuery.isLoading}
            />
          )}

          {!selectedLeague && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Select a league above to find trade opportunities</div>}
          {selectedLeague && suggestionsLoading && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}><div style={{ color: "var(--amber)", fontSize: 14 }}><span className="animate-pulse">Analyzing rosters and building package variants...</span></div></div>}
          {selectedLeague && suggestionsError && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--red)", fontSize: 13 }}>Failed to load trade suggestions. Try again later.</div>}

          {selectedLeague && !suggestionsLoading && suggestions && suggestions.length === 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>No strong fits found for this league</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>No valid speculative packages survived the quality checks. Try the Trade Calculator for custom scenarios.</p>
              <Link href="/trade-calculator" style={{ display: "inline-block", marginTop: 12, padding: "8px 16px", background: "linear-gradient(135deg, var(--amber), var(--amber-dark))", color: "var(--dark-base)", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Open Trade Calculator</Link>
            </div>
          )}

          {selectedLeague && !suggestionsLoading && suggestions && suggestions.length > 0 && filteredSuggestions.length === 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>No suggested packages for this opponent</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Try clearing the scout filter or open the Trade Calculator for a custom build.</p>
            </div>
          )}

          {selectedLeague && !suggestionsLoading && suggestions && filteredSuggestions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{filteredSuggestions.length} partner{filteredSuggestions.length !== 1 ? "s" : ""} found</span>
              </div>
              {filteredSuggestions.map((suggestion, i) => <PartnerCard key={`${suggestion.partner.roster_id}-${i}`} suggestion={suggestion} />)}
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
              <button
                type="button"
                onClick={() => setShowShopRedraft((current) => !current)}
                style={{
                  marginBottom: 12,
                  borderRadius: 999,
                  padding: "7px 12px",
                  border: `1px solid ${showShopRedraft ? "#60a5fa" : "var(--border)"}`,
                  background: showShopRedraft ? "rgba(96,165,250,0.14)" : "transparent",
                  color: showShopRedraft ? "#93c5fd" : "var(--text-muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {showShopRedraft ? "Redraft On" : "Redraft Off"}
              </button>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Select a Player to Shop
              </label>
            <select
              value={selectedPlayer}
              onChange={(e) => { setSelectedPlayer(e.target.value); setShopPathFilter(null); }}
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

          {selectedPlayer && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginTop: 8, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Trade Ambition:</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { value: 1, label: "Conservative", desc: "Even swaps, small adds" },
                  { value: 2, label: "Moderate", desc: "Player + pick packages" },
                  { value: 3, label: "Aggressive", desc: "Big packages, reach for studs" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setShopAmbition(opt.value)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      border: shopAmbition === opt.value ? "2px solid var(--amber)" : "1px solid var(--border)",
                      background: shopAmbition === opt.value ? "rgba(245,158,11,0.1)" : "transparent",
                      color: shopAmbition === opt.value ? "var(--amber)" : "var(--text-muted)",
                    }}
                    title={opt.desc}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

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
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {[
                  { key: null, label: `All (${shopResult.opportunities.length})` },
                  { key: "even_swap", label: `Even Swaps (${shopResult.opportunities.filter((o) => o.path === "even_swap").length})` },
                  { key: "they_add_pick", label: `They Add Pick (${shopResult.opportunities.filter((o) => o.path === "they_add_pick").length})` },
                  { key: "you_upgrade", label: `You Upgrade (${shopResult.opportunities.filter((o) => o.path === "you_upgrade").length})` },
                  { key: "sell_for_pieces", label: `Sell for Pieces (${shopResult.opportunities.filter((o) => o.path === "sell_for_pieces").length})` },
                ].map((f) => (
                  <button
                    key={f.key ?? "all"}
                    onClick={() => setShopPathFilter(f.key)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      border: shopPathFilter === f.key ? "1px solid var(--amber)" : "1px solid var(--border)",
                      background: shopPathFilter === f.key ? "rgba(245,158,11,0.1)" : "transparent",
                      color: shopPathFilter === f.key ? "var(--amber)" : "var(--text-muted)",
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {filteredShopResults.map((opp, i) => (
                <ShopOpportunityCard key={`${opp.league_id}-${i}`} opp={opp} />
              ))}
              {filteredShopResults.length === 0 && (
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No trade packages match the current path filter.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "scout" && (
        <div>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Select League</label>
                {leaguesLoading ? (
                  <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}><span className="animate-pulse">Loading leagues...</span></div>
                ) : (
                  <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)} style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, cursor: "pointer" }}>
                    <option value="">Choose a league...</option>
                    {leagues?.map((league) => <option key={league.league_id} value={league.league_id}>{league.league_name} ({league.mode.toUpperCase()}{league.scoring_label ? ` | ${league.scoring_label}` : ""})</option>)}
                  </select>
                )}
              </div>

              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedLeague || phase !== "ready") return;
                    refreshProfilesMutation.mutate({ leagueId: selectedLeague, username });
                  }}
                  disabled={!selectedLeague || refreshProfilesMutation.isPending}
                  style={{
                    border: "1px solid rgba(245,158,11,0.35)",
                    background: "rgba(245,158,11,0.14)",
                    color: "var(--amber)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: !selectedLeague || refreshProfilesMutation.isPending ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: !selectedLeague ? 0.6 : 1,
                  }}
                >
                  {refreshProfilesMutation.isPending ? "Refreshing..." : "Refresh Profiles"}
                </button>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Last profiled: {formatDateTime(scoutProfilesQuery.data?.lastProfiled ?? null)}
                  </span>
                  {scoutProfilesQuery.data?.isStale && (
                    <span style={{ background: "rgba(245,158,11,0.16)", color: "#fbbf24", borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 800 }}>
                      Stale data
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {scoutRouteWarning && (
            <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "12px 16px", marginTop: 12, color: "var(--amber)", fontSize: 12, lineHeight: 1.5 }}>
              {scoutRouteWarning}
            </div>
          )}

          {!selectedLeague && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Select a league above to scout opponent tendencies.
            </div>
          )}

          {selectedLeague && scoutProfilesQuery.isLoading && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
              <span className="animate-pulse" style={{ color: "var(--amber)", fontSize: 14 }}>
                Building opponent profiles...
              </span>
            </div>
          )}

          {selectedLeague && scoutProfilesQuery.error && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "24px 20px", marginTop: 16, color: "var(--red)", fontSize: 13 }}>
              {(scoutProfilesQuery.error as Error).message || "Failed to load opponent profiles."}
            </div>
          )}

          {selectedLeague && !scoutProfilesQuery.isLoading && !scoutProfilesQuery.error && scoutProfilesWithScores.length === 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No opponent profiles are available yet. Refresh profiles to build the first pass from Sleeper history.
            </div>
          )}

          {selectedLeague && scoutProfilesWithScores.length > 0 && (
            <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                {scoutProfilesWithScores.map(({ profile, exploitability }) => (
                  <OpponentCard
                    key={profile.rosterId}
                    profile={profile}
                    exploitability={exploitability}
                    selected={profile.rosterId === selectedScoutRosterId}
                    onExploit={() => openExploitLink(profile.rosterId)}
                  />
                ))}
              </div>

              {selectedScoutProfile && (
                <div ref={scoutDetailRef} tabIndex={-1} style={{ outline: "none" }}>
                  {exploitAnglesQuery.error && (
                    <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, color: "var(--red)", fontSize: 12, lineHeight: 1.5 }}>
                      {(exploitAnglesQuery.error as Error).message || "Failed to load exploit angles."}
                    </div>
                  )}
                  <OpponentDetail
                    profile={selectedScoutProfile}
                    angles={exploitAnglesQuery.data?.angles ?? []}
                    isLoading={exploitAnglesQuery.isLoading}
                    onFindTrades={() => {
                      setMode("find");
                      setSelectedScoutRosterId(selectedScoutProfile.rosterId);
                    }}
                    onClose={() => {
                      setSelectedScoutRosterId(null);
                      setScoutRouteWarning(null);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}


