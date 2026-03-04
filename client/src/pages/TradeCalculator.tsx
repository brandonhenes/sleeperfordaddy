import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "../components/AppShell";
import { useEvaluateTrade } from "../hooks/use-trade-calculator";
import { apiFetch } from "../lib/api";
import type { TradeAssetInput } from "../../../shared/types";

type Side = "A" | "B";

interface SearchAsset {
  type: "player";
  player_id: string;
  label: string;
}

const YEAR = new Date().getFullYear();
const PICK_YEARS = [String(YEAR), String(YEAR + 1), String(YEAR + 2)];

function fairnessColor(fairness: "fair" | "slight_edge" | "lopsided"): string {
  if (fairness === "fair") return "#22c55e";
  if (fairness === "slight_edge") return "#f59e0b";
  return "#ef4444";
}

function assetLabel(asset: TradeAssetInput): string {
  if (asset.type === "player") return asset.player_id ?? "Player";
  return `${asset.pick_season} ${asset.pick_tier ?? "mid"} ${asset.pick_round}`;
}

export default function TradeCalculator() {
  const [mode, setMode] = useState<"sf" | "1qb">("sf");
  const [sideA, setSideA] = useState<TradeAssetInput[]>([]);
  const [sideB, setSideB] = useState<TradeAssetInput[]>([]);
  const [search, setSearch] = useState("");

  const [pickSeason, setPickSeason] = useState(PICK_YEARS[0]);
  const [pickRound, setPickRound] = useState(1);
  const [pickTier, setPickTier] = useState<"early" | "mid" | "late">("mid");

  const evalMutation = useEvaluateTrade();

  const { data: searchResults = [], isLoading: searchLoading } = useQuery<SearchAsset[]>({
    queryKey: ["trade-asset-search", search],
    enabled: search.trim().length >= 2,
    queryFn: () =>
      apiFetch(`/api/trade/assets?q=${encodeURIComponent(search.trim())}&limit=12`),
  });

  const hasBothSides = sideA.length > 0 && sideB.length > 0;
  const orderedResults = useMemo(
    () => searchResults.filter((r) => !sideA.some((a) => a.player_id === r.player_id) && !sideB.some((a) => a.player_id === r.player_id)),
    [searchResults, sideA, sideB]
  );

  function addPlayer(side: Side, playerId: string) {
    const next = { type: "player", player_id: playerId } as TradeAssetInput;
    if (side === "A") setSideA((prev) => [...prev, next]);
    else setSideB((prev) => [...prev, next]);
  }

  function addPick(side: Side) {
    const next: TradeAssetInput = {
      type: "pick",
      pick_season: pickSeason,
      pick_round: pickRound,
      pick_tier: pickTier,
    };
    if (side === "A") setSideA((prev) => [...prev, next]);
    else setSideB((prev) => [...prev, next]);
  }

  function removeAsset(side: Side, idx: number) {
    if (side === "A") setSideA((prev) => prev.filter((_, i) => i !== idx));
    else setSideB((prev) => prev.filter((_, i) => i !== idx));
  }

  function evaluate() {
    if (!hasBothSides) return;
    evalMutation.mutate({ sideA, sideB, mode });
  }

  const result = evalMutation.data;

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Calculator</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Add players/picks to each side and evaluate with live dynasty values.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Mode</label>
        <select value={mode} onChange={(e) => setMode(e.target.value as "sf" | "1qb")} style={{ background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
          <option value="sf">Superflex</option>
          <option value="1qb">1QB</option>
        </select>
      </div>

      <div style={{ marginTop: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Player Search</div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player name..."
          style={{ width: "100%", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14 }}
        />
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {searchLoading && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Searching...</div>}
          {!searchLoading && search.trim().length >= 2 && orderedResults.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No results</div>
          )}
          {orderedResults.map((r) => (
            <div key={r.player_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
              <span style={{ fontSize: 13 }}>{r.label}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => addPlayer("A", r.player_id)} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}>Add A</button>
                <button onClick={() => addPlayer("B", r.player_id)} style={{ background: "#6d28d9", color: "#fff", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}>Add B</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Add Pick</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={pickSeason} onChange={(e) => setPickSeason(e.target.value)} style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
            {PICK_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={pickRound} onChange={(e) => setPickRound(Number(e.target.value))} style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
            {[1, 2, 3, 4].map((r) => <option key={r} value={r}>Round {r}</option>)}
          </select>
          <select value={pickTier} onChange={(e) => setPickTier(e.target.value as "early" | "mid" | "late")} style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
            <option value="early">Early</option>
            <option value="mid">Mid</option>
            <option value="late">Late</option>
          </select>
          <button onClick={() => addPick("A")} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>Add Pick A</button>
          <button onClick={() => addPick("B")} style={{ background: "#6d28d9", color: "#fff", border: "none", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>Add Pick B</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, marginTop: 16 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Side A Gives</h2>
          {sideA.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No assets yet</div>}
          {sideA.map((a, i) => (
            <div key={`a-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 13 }}>
              <span>{assetLabel(a)}</span>
              <button onClick={() => removeAsset("A", i)} style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>Remove</button>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Side B Gives</h2>
          {sideB.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No assets yet</div>}
          {sideB.map((a, i) => (
            <div key={`b-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 13 }}>
              <span>{assetLabel(a)}</span>
              <button onClick={() => removeAsset("B", i)} style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>Remove</button>
            </div>
          ))}
        </div>
      </div>

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
            padding: "12px 14px",
            fontWeight: 700,
            cursor: hasBothSides ? "pointer" : "not-allowed",
          }}
        >
          {evalMutation.isPending ? "Evaluating..." : "Evaluate Trade"}
        </button>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 16 }}>
        {!result && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Add assets to both sides, then evaluate.
          </div>
        )}
        {result && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>
                Side A: {result.sideA.total_edge.toFixed(1)} | Side B: {result.sideB.total_edge.toFixed(1)}
              </div>
              <div style={{ color: fairnessColor(result.fairness), fontWeight: 700 }}>
                {result.fairness.toUpperCase()} ({result.delta > 0 ? "A +" : result.delta < 0 ? "B +" : "Even"}{Math.abs(result.delta).toFixed(1)})
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <div>
                {result.sideA.assets.map((a, i) => (
                  <div key={`ra-${i}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span>{a.label}</span>
                    <span style={{ fontWeight: 700 }}>{a.edge_score}</span>
                  </div>
                ))}
              </div>
              <div>
                {result.sideB.assets.map((a, i) => (
                  <div key={`rb-${i}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span>{a.label}</span>
                    <span style={{ fontWeight: 700 }}>{a.edge_score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
