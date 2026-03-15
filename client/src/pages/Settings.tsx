import { useState, useEffect } from "react";
import AppShell from "../components/AppShell";
import ClassStrengthSettings from "../components/ClassStrengthSettings";

interface Weights {
  fc: number;
  ktc: number;
  dp: number;
}

const PRESETS: { label: string; desc: string; weights: Weights }[] = [
  { label: "Equal", desc: "All sources weighted equally", weights: { fc: 1, ktc: 1, dp: 1 } },
  { label: "Market-First", desc: "Emphasize crowd-sourced market values", weights: { fc: 0.35, ktc: 0.35, dp: 0.3 } },
  { label: "Model-First", desc: "Emphasize DynastyProcess model scores", weights: { fc: 0.15, ktc: 0.15, dp: 0.7 } },
];

const STORAGE_KEY = "edge-source-weights";

function loadWeights(): Weights {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.fc === "number" && typeof parsed.ktc === "number" && typeof parsed.dp === "number") {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return { fc: 1, ktc: 1, dp: 1 };
}

function saveWeights(w: Weights) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
}

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 20,
} as const;

export default function Settings() {
  const [weights, setWeights] = useState<Weights>(loadWeights);

  useEffect(() => {
    saveWeights(weights);
  }, [weights]);

  const total = weights.fc + weights.ktc + weights.dp;

  function pct(val: number) {
    if (total === 0) return "0%";
    return `${Math.round((val / total) * 100)}%`;
  }

  function isPreset(p: Weights) {
    return Math.abs(weights.fc - p.fc) < 0.01 && Math.abs(weights.ktc - p.ktc) < 0.01 && Math.abs(weights.dp - p.dp) < 0.01;
  }

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Settings</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Customize how Edge Scores are calculated across sources
        </p>
      </div>

      {/* Presets */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 12 }}>
          PRESETS
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setWeights({ ...p.weights })}
              style={{
                background: isPreset(p.weights) ? "var(--amber)" : "var(--dark-base)",
                color: isPreset(p.weights) ? "var(--dark-base)" : "var(--text-dim)",
                border: `1px solid ${isPreset(p.weights) ? "var(--amber)" : "var(--border)"}`,
                borderRadius: 8,
                padding: "10px 18px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
              }}
            >
              <div>{p.label}</div>
              <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 16 }}>
          CUSTOM WEIGHTS
        </div>
        {([
          { key: "fc" as const, label: "FantasyCalc", color: "#3b82f6" },
          { key: "ktc" as const, label: "KeepTradeCut", color: "#22c55e" },
          { key: "dp" as const, label: "DynastyProcess", color: "#f59e0b" },
        ]).map(({ key, label, color }) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{label}</span>
              <span style={{ fontSize: 12, color, fontWeight: 700 }}>{pct(weights[key])}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(weights[key] * 100)}
              onChange={(e) => setWeights((prev) => ({ ...prev, [key]: parseInt(e.target.value) / 100 }))}
              style={{
                width: "100%",
                accentColor: color,
                cursor: "pointer",
              }}
            />
          </div>
        ))}
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
          Weights are normalized when computing Edge Scores. Changes apply to all pages automatically.
        </div>
      </div>

      {/* Preview */}
      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 12 }}>
          CURRENT MIX
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {([
            { key: "fc" as const, label: "FC", color: "#3b82f6" },
            { key: "ktc" as const, label: "KTC", color: "#22c55e" },
            { key: "dp" as const, label: "DP", color: "#f59e0b" },
          ]).map(({ key, label, color }) => (
            <div key={key} style={{ textAlign: "center", flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{pct(weights[key])}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Custom weights currently apply to Trade Calculator, Player Detail, and Waiver Wire.
          Power Rankings and Dashboard use the default equal weighting for cache efficiency.
        </div>
      </div>

      <ClassStrengthSettings />
    </AppShell>
  );
}
