import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import ClassStrengthSettings from "../components/ClassStrengthSettings";
import { useCurrentUsername } from "../hooks/use-current-user";
import { useSettings } from "../hooks/use-settings";
import {
  DEFAULT_SOURCE_WEIGHTS,
  fromSettingsPayload,
  getStoredWeights,
  isDefaultSourceWeights,
  toSettingsPayload,
  type SourceWeights,
  writeStoredWeights,
} from "../lib/weights";

const PRESETS: { label: string; desc: string; weights: SourceWeights }[] = [
  { label: "Default", desc: "Balanced default blend", weights: DEFAULT_SOURCE_WEIGHTS },
  { label: "Equal", desc: "All sources weighted equally", weights: { fc: 33, ktc: 33, dp: 33 } },
  { label: "Market-First", desc: "Emphasize market sentiment", weights: { fc: 45, ktc: 45, dp: 10 } },
  { label: "Model-First", desc: "Emphasize DynastyProcess model scores", weights: { fc: 15, ktc: 15, dp: 70 } },
];

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 20,
} as const;

export default function Settings() {
  const { username } = useCurrentUsername();
  const { weights: savedWeights, isLoading, isSaving, saveWeights } = useSettings(username);
  const [weights, setWeights] = useState<SourceWeights>(getStoredWeights);

  const serverWeights = useMemo(
    () => fromSettingsPayload(savedWeights),
    [savedWeights]
  );

  useEffect(() => {
    if (!username) {
      writeStoredWeights(weights);
      return;
    }
    if (isLoading) return;
    setWeights(serverWeights);
    writeStoredWeights(serverWeights);
  }, [isLoading, serverWeights, username]);

  useEffect(() => {
    writeStoredWeights(weights);
    if (!username || isLoading) return;

    const next = toSettingsPayload(weights);
    const current = toSettingsPayload(serverWeights);
    if (
      next.fc_weight === current.fc_weight &&
      next.ktc_weight === current.ktc_weight &&
      next.dp_weight === current.dp_weight
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      saveWeights(next);
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [isLoading, saveWeights, serverWeights, username, weights]);

  const total = weights.fc + weights.ktc + weights.dp;

  function pct(value: number) {
    if (total === 0) return "0%";
    return `${Math.round((value / total) * 100)}%`;
  }

  function isPreset(preset: SourceWeights) {
    return Math.abs(weights.fc - preset.fc) < 0.01
      && Math.abs(weights.ktc - preset.ktc) < 0.01
      && Math.abs(weights.dp - preset.dp) < 0.01;
  }

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Settings</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Save your Edge Score blend and apply it across live score views
        </p>
      </div>

      {!username && (
        <div style={{ ...cardStyle, marginTop: 16, color: "var(--text-dim)", fontSize: 12 }}>
          No username is currently loaded. These weights will be used locally until you open a user-specific page.
        </div>
      )}

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 12 }}>
          PRESETS
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setWeights({ ...preset.weights })}
              style={{
                background: isPreset(preset.weights) ? "var(--amber)" : "var(--dark-base)",
                color: isPreset(preset.weights) ? "var(--dark-base)" : "var(--text-dim)",
                border: `1px solid ${isPreset(preset.weights) ? "var(--amber)" : "var(--border)"}`,
                borderRadius: 8,
                padding: "10px 18px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
              }}
            >
              <div>{preset.label}</div>
              <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>{preset.desc}</div>
            </button>
          ))}
        </div>
      </div>

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
              value={Math.round(weights[key])}
              onChange={(e) => setWeights((prev) => ({ ...prev, [key]: parseInt(e.target.value, 10) }))}
              style={{
                width: "100%",
                accentColor: color,
                cursor: "pointer",
              }}
            />
          </div>
        ))}
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
          Weights are normalized when computing Edge Scores, so the blend still works if the sliders do not total 100.
        </div>
      </div>

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
          {isSaving ? "Saving weights..." : "Weights are saved per user and used by the major live Edge Score views."}
          {isDefaultSourceWeights(weights) ? " Default blend is FC 35 / KTC 20 / DP 45." : ""}
        </div>
      </div>

      <ClassStrengthSettings />
    </AppShell>
  );
}
