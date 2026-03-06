import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "../components/AppShell";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import ShareButton from "../components/ShareButton";
import { posColor } from "../lib/position-colors";
import { useEvaluateTrade } from "../hooks/use-trade-calculator";
import { usePowerRankings } from "../hooks/use-power-rankings";
import { apiFetch } from "../lib/api";
import type { TradeAssetInput, EvaluatedAsset, TradeEvaluation } from "../../../shared/types";

type Side = "A" | "B";

interface SearchAsset {
  type: "player";
  player_id: string;
  label: string;
  position: string;
  team: string | null;
}

const YEAR = new Date().getFullYear();
const PICK_YEARS = [String(YEAR), String(YEAR + 1), String(YEAR + 2)];

// ─── Helpers ───

function fairnessColor(fairness: TradeEvaluation["fairness"]): string {
  if (fairness === "fair") return "#22c55e";
  if (fairness === "slight_edge") return "#f59e0b";
  return "#ef4444";
}

function fairnessLabel(fairness: TradeEvaluation["fairness"]): string {
  if (fairness === "fair") return "FAIR";
  if (fairness === "slight_edge") return "SLIGHT EDGE";
  return "LOPSIDED";
}

function agreementColor(agr: "high" | "medium" | "low"): string {
  if (agr === "high") return "#22c55e";
  if (agr === "medium") return "#f59e0b";
  return "#ef4444";
}

function agreementLabel(agr: "high" | "medium" | "low"): string {
  if (agr === "high") return "Agree";
  if (agr === "medium") return "Mixed";
  return "Disagree";
}

function sourceOutlier(a: EvaluatedAsset): string | null {
  const scores = [
    { name: "FC", v: a.fc_score },
    { name: "KTC", v: a.ktc_score },
    { name: "FP", v: a.dp_score },
  ].filter((s) => s.v != null) as { name: string; v: number }[];
  if (scores.length < 2) return null;
  const avg = scores.reduce((s, x) => s + x.v, 0) / scores.length;
  let maxDev = 0;
  let outlier = "";
  for (const s of scores) {
    const dev = Math.abs(s.v - avg);
    if (dev > maxDev) { maxDev = dev; outlier = s.name; }
  }
  if (maxDev < 8) return null;
  const o = scores.find((s) => s.name === outlier);
  if (!o) return null;
  return `${outlier} ${o.v > avg ? "higher" : "lower"}`;
}

function pickLabel(a: TradeAssetInput): string {
  const tier = (a.pick_tier ?? "mid").charAt(0).toUpperCase() + (a.pick_tier ?? "mid").slice(1);
  const rnd = a.pick_round === 1 ? "1st" : a.pick_round === 2 ? "2nd" : a.pick_round === 3 ? "3rd" : `R${a.pick_round}`;
  return `${a.pick_season} ${tier} ${rnd}`;
}

function buildShareText(result: TradeEvaluation): string {
  const lines = [`[The Edge] Trade Eval`];
  lines.push(`Side A (${result.sideA.total_edge.toFixed(1)} edge): ${result.sideA.assets.map((a) => a.label).join(", ")}`);
  lines.push(`Side B (${result.sideB.total_edge.toFixed(1)} edge): ${result.sideB.assets.map((a) => a.label).join(", ")}`);
  const winner = result.delta > 0 ? "A" : result.delta < 0 ? "B" : "Even";
  lines.push(`${winner} wins by ${Math.abs(result.delta).toFixed(1)} points. Fairness: ${result.fairness}`);
  return lines.join("\n");
}

// ─── Inline score display ───

function ScoreCell({ label, value }: { label: string; value: number | null }) {
  return (
    <span style={{ fontSize: 10, color: value != null ? "var(--text-dim)" : "var(--text-muted)" }}>
      <span style={{ fontWeight: 600 }}>{label}</span>{" "}
      <span className="font-mono" style={{ fontWeight: 700 }}>{value != null ? Math.round(value) : "N/A"}</span>
    </span>
  );
}

// ─── Asset Row (in result) ───

function AssetRow({ asset }: { asset: EvaluatedAsset }) {
  const outlier = sourceOutlier(asset);
  const adjustedDiff =
    asset.league_adjusted_score != null ? asset.league_adjusted_score - asset.edge_score : 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderBottom: "1px solid var(--border)",
        fontSize: 12,
        flexWrap: "wrap",
      }}
    >
      <EdgeScoreBadge score={Math.round(asset.edge_score)} size="sm" />
      <span style={{ flex: 1, fontWeight: 500, minWidth: 100 }}>{asset.label}</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <ScoreCell label="FC" value={asset.fc_score} />
        <ScoreCell label="KTC" value={asset.ktc_score} />
        <ScoreCell label="FP" value={asset.dp_score} />
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: agreementColor(asset.source_agreement),
            padding: "2px 6px",
            borderRadius: 4,
            border: `1px solid ${agreementColor(asset.source_agreement)}`,
          }}
        >
          {agreementLabel(asset.source_agreement)}
        </span>
      </div>
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
          {Math.round(asset.league_adjusted_score)} in this league ({adjustedDiff > 0 ? "+" : ""}
          {adjustedDiff.toFixed(1)})
          {asset.scoring_delta_ppg != null ? ` · ${asset.scoring_delta_ppg > 0 ? "+" : ""}${asset.scoring_delta_ppg.toFixed(2)} ppg` : ""}
        </span>
      )}
      {outlier && (
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic", width: "100%", paddingLeft: 36 }}>
          {outlier}
        </span>
      )}
    </div>
  );
}

// ─── Delta bar ───

function DeltaBar({ delta, totalA, totalB }: { delta: number; totalA: number; totalB: number }) {
  const total = totalA + totalB;
  if (total === 0) return null;
  const pctA = (totalA / total) * 100;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
        <span style={{ flex: 1 }}>Side A: {totalA.toFixed(1)}</span>
        <span style={{ textAlign: "right" }}>Side B: {totalB.toFixed(1)}</span>
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden" }}>
        <div style={{ width: `${pctA}%`, background: "#3b82f6", transition: "width 0.3s" }} />
        <div style={{ flex: 1, background: "#8b5cf6" }} />
      </div>
      {delta !== 0 && (
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          {delta > 0 ? "Side A" : "Side B"} wins by {Math.abs(delta).toFixed(1)} points
        </div>
      )}
    </div>
  );
}

// ─── Side panel asset display ───

function SideAsset({
  asset,
  label,
  onRemove,
}: {
  asset: TradeAssetInput;
  label: string;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
        borderBottom: "1px solid var(--border)",
        fontSize: 13,
      }}
    >
      {asset.type === "player" ? (
        <span style={{ fontWeight: 500, flex: 1 }}>{label}</span>
      ) : (
        <>
          <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 10 }}>PICK</span>
          <span style={{ fontWeight: 500, flex: 1 }}>{pickLabel(asset)}</span>
        </>
      )}
      <button
        onClick={onRemove}
        style={{
          background: "transparent",
          color: "#ef4444",
          border: "1px solid #ef4444",
          borderRadius: 6,
          padding: "2px 8px",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        X
      </button>
    </div>
  );
}

// ─── Page ───

export default function TradeCalculator() {
  const [mode, setMode] = useState<"sf" | "1qb">("sf");
  const [selectedLeague, setSelectedLeague] = useState("");
  const [sideA, setSideA] = useState<TradeAssetInput[]>([]);
  const [sideB, setSideB] = useState<TradeAssetInput[]>([]);
  const [labelsA, setLabelsA] = useState<string[]>([]);
  const [labelsB, setLabelsB] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [activeSide, setActiveSide] = useState<Side>("A");

  const [pickSeason, setPickSeason] = useState(PICK_YEARS[0]);
  const [pickRound, setPickRound] = useState(1);
  const [pickTier, setPickTier] = useState<"early" | "mid" | "late">("mid");

  const evalMutation = useEvaluateTrade();
  const storedUsername = typeof window !== "undefined" ? localStorage.getItem("edge_username") ?? "" : "";
  const { data: leagues = [] } = usePowerRankings(storedUsername);

  const { data: searchResults = [], isLoading: searchLoading } = useQuery<SearchAsset[]>({
    queryKey: ["trade-asset-search", search],
    enabled: search.trim().length >= 2,
    queryFn: () =>
      apiFetch(`/api/trade/assets?q=${encodeURIComponent(search.trim())}&limit=12`),
  });

  const hasBothSides = sideA.length > 0 && sideB.length > 0;
  const orderedResults = useMemo(
    () =>
      searchResults.filter(
        (r) =>
          !sideA.some((a) => a.player_id === r.player_id) &&
          !sideB.some((a) => a.player_id === r.player_id)
      ),
    [searchResults, sideA, sideB]
  );

  function addPlayer(player: SearchAsset) {
    const next: TradeAssetInput = { type: "player", player_id: player.player_id };
    if (activeSide === "A") {
      setSideA((prev) => [...prev, next]);
      setLabelsA((prev) => [...prev, player.label]);
    } else {
      setSideB((prev) => [...prev, next]);
      setLabelsB((prev) => [...prev, player.label]);
    }
  }

  function addPick() {
    const next: TradeAssetInput = {
      type: "pick",
      pick_season: pickSeason,
      pick_round: pickRound,
      pick_tier: pickTier,
    };
    if (activeSide === "A") {
      setSideA((prev) => [...prev, next]);
      setLabelsA((prev) => [...prev, pickLabel(next)]);
    } else {
      setSideB((prev) => [...prev, next]);
      setLabelsB((prev) => [...prev, pickLabel(next)]);
    }
  }

  function removeAsset(side: Side, idx: number) {
    if (side === "A") {
      setSideA((prev) => prev.filter((_, i) => i !== idx));
      setLabelsA((prev) => prev.filter((_, i) => i !== idx));
    } else {
      setSideB((prev) => prev.filter((_, i) => i !== idx));
      setLabelsB((prev) => prev.filter((_, i) => i !== idx));
    }
  }

  function evaluate() {
    if (!hasBothSides) return;
    evalMutation.mutate({ sideA, sideB, mode, leagueId: selectedLeague || undefined });
  }

  const result = evalMutation.data;

  const selectStyle = {
    background: "var(--card)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "inherit",
  };

  const sideBtnBase: React.CSSProperties = {
    padding: "8px 20px",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <AppShell>
      {/* Header */}
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Calculator</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Multi-source dynasty trade evaluator with FC + KTC + FP breakdown
        </p>
      </div>

      {/* Mode selector */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
        <label style={{ fontSize: 12, color: "var(--text-muted)" }}>League</label>
        <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)} style={selectStyle}>
          <option value="">No league context</option>
          {leagues.map((l) => (
            <option key={l.league_id} value={l.league_id}>
              {l.league_name} ({l.mode.toUpperCase()}{l.scoring_label ? ` · ${l.scoring_label}` : ""})
            </option>
          ))}
        </select>
        <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Mode</label>
        <select value={mode} onChange={(e) => setMode(e.target.value as "sf" | "1qb")} style={selectStyle}>
          <option value="sf">Superflex</option>
          <option value="1qb">1QB</option>
        </select>
      </div>

      {/* Side toggle + Search */}
      <div style={{ marginTop: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: "32px" }}>Add to:</span>
          <button
            onClick={() => setActiveSide("A")}
            style={{
              ...sideBtnBase,
              background: activeSide === "A" ? "#3b82f6" : "var(--dark-base)",
              color: activeSide === "A" ? "#fff" : "var(--text-muted)",
            }}
          >
            Side A
          </button>
          <button
            onClick={() => setActiveSide("B")}
            style={{
              ...sideBtnBase,
              background: activeSide === "B" ? "#8b5cf6" : "var(--dark-base)",
              color: activeSide === "B" ? "#fff" : "var(--text-muted)",
            }}
          >
            Side B
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player name..."
          style={{
            width: "100%",
            background: "var(--dark-base)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 14,
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />

        <div style={{ marginTop: 8, display: "grid", gap: 4, maxHeight: 240, overflowY: "auto" }}>
          {searchLoading && <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 4 }}>Searching...</div>}
          {!searchLoading && search.trim().length >= 2 && orderedResults.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 4 }}>No results</div>
          )}
          {orderedResults.map((r) => (
            <button
              key={r.player_id}
              onClick={() => addPlayer(r)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 10px",
                background: "none",
                color: "var(--text)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                textAlign: "left",
                width: "100%",
              }}
            >
              <span
                style={{
                  color: posColor(r.position),
                  fontWeight: 700,
                  fontSize: 11,
                  width: 24,
                }}
              >
                {r.position}
              </span>
              <span style={{ flex: 1 }}>{r.label}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: activeSide === "A" ? "#3b82f6" : "#8b5cf6",
                }}
              >
                + {activeSide}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Add Pick */}
      <div style={{ marginTop: 12, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Add Pick:</span>
          <select value={pickSeason} onChange={(e) => setPickSeason(e.target.value)} style={selectStyle}>
            {PICK_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={pickRound} onChange={(e) => setPickRound(Number(e.target.value))} style={selectStyle}>
            {[1, 2, 3, 4].map((r) => <option key={r} value={r}>Round {r}</option>)}
          </select>
          <select value={pickTier} onChange={(e) => setPickTier(e.target.value as "early" | "mid" | "late")} style={selectStyle}>
            <option value="early">Early</option>
            <option value="mid">Mid</option>
            <option value="late">Late</option>
          </select>
          <button
            onClick={addPick}
            style={{
              ...sideBtnBase,
              background: activeSide === "A" ? "#3b82f6" : "#8b5cf6",
              color: "#fff",
            }}
          >
            Add Pick to {activeSide}
          </button>
        </div>
      </div>

      {/* Side panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        {/* Side A */}
        <div style={{ background: "var(--card)", border: "2px solid #3b82f6", borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px", color: "#3b82f6" }}>
            Side A Gives ({sideA.length})
          </h2>
          {sideA.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "12px 0" }}>
              No assets yet - search above to add players
            </div>
          )}
          {sideA.map((a, i) => (
            <SideAsset key={`a-${i}`} asset={a} label={labelsA[i] ?? ""} onRemove={() => removeAsset("A", i)} />
          ))}
        </div>

        {/* Side B */}
        <div style={{ background: "var(--card)", border: "2px solid #8b5cf6", borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px", color: "#8b5cf6" }}>
            Side B Gives ({sideB.length})
          </h2>
          {sideB.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "12px 0" }}>
              No assets yet - search above to add players
            </div>
          )}
          {sideB.map((a, i) => (
            <SideAsset key={`b-${i}`} asset={a} label={labelsB[i] ?? ""} onRemove={() => removeAsset("B", i)} />
          ))}
        </div>
      </div>

      {/* Evaluate button */}
      <div style={{ marginTop: 16 }}>
        <button
          disabled={!hasBothSides || evalMutation.isPending}
          onClick={evaluate}
          style={{
            width: "100%",
            background: hasBothSides ? "var(--amber)" : "var(--border)",
            color: hasBothSides ? "var(--dark-base)" : "var(--text-muted)",
            border: "none",
            borderRadius: 10,
            padding: "14px",
            fontWeight: 700,
            fontSize: 15,
            cursor: hasBothSides ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {evalMutation.isPending ? "Evaluating..." : "Evaluate Trade"}
        </button>
      </div>

      {/* Result */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 20, marginTop: 16 }}>
        {!result && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "20px 0" }}>
            Add assets to both sides, then evaluate.
          </div>
        )}
        {result && (
          <div>
            {/* Fairness header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    background: fairnessColor(result.fairness),
                    color: result.fairness === "fair" ? "#000" : "#fff",
                    padding: "6px 14px",
                    borderRadius: 8,
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  {fairnessLabel(result.fairness)}
                </span>
                {result.delta !== 0 && (
                  <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
                    {result.delta > 0 ? "Side A" : "Side B"} wins by{" "}
                    <strong style={{ color: "var(--text)" }}>{Math.abs(result.delta).toFixed(1)}</strong> points
                  </span>
                )}
              </div>
              <ShareButton textSummary={buildShareText(result)} />
            </div>

            {/* Delta bar */}
            <DeltaBar delta={result.delta} totalA={result.sideA.total_edge} totalB={result.sideB.total_edge} />

            {/* Per-side asset breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", marginBottom: 6 }}>
                  SIDE A - {result.sideA.total_edge.toFixed(1)} total
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {result.sideA.assets.map((a, i) => (
                    <AssetRow key={`ra-${i}`} asset={a} />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6", marginBottom: 6 }}>
                  SIDE B - {result.sideB.total_edge.toFixed(1)} total
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  {result.sideB.assets.map((a, i) => (
                    <AssetRow key={`rb-${i}`} asset={a} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
