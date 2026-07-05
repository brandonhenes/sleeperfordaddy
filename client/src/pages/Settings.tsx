import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import ClassStrengthSettings from "../components/ClassStrengthSettings";
import { Card, PageHeader, SegmentedControl } from "../components/ui";
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

  const activePreset = PRESETS.find((preset) => isPreset(preset.weights))?.label ?? null;

  function applyPreset(label: string) {
    const preset = PRESETS.find((item) => item.label === label);
    if (preset) setWeights({ ...preset.weights });
  }

  return (
    <AppShell>
      <PageHeader
        title="Settings"
        subtitle="Save your Edge Score blend and apply it across live score views"
      />

      {!username && (
        <Card className="mt-4 text-xs text-[var(--text-dim)]">
          No username is currently loaded. These weights will be used locally until you open a user-specific page.
        </Card>
      )}

      <Card className="mt-4">
        <div className="label mb-3">Presets</div>
        <SegmentedControl
          items={PRESETS.map((preset) => ({
            key: preset.label,
            label: preset.label,
            description: preset.desc,
          }))}
          value={activePreset}
          onChange={applyPreset}
          ariaLabel="Source weight presets"
        />
      </Card>

      <Card className="mt-3">
        <div className="label mb-4">Custom Weights</div>
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
      </Card>

      <Card className="mt-3">
        <div className="label mb-3">Current Mix</div>
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
      </Card>

      <Card className="mt-3">
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          {isSaving ? "Saving weights..." : "Weights are saved per user and used by the major live Edge Score views."}
          {isDefaultSourceWeights(weights) ? " Default blend is FC 35 / KTC 20 / DP 45." : ""}
        </div>
      </Card>

      <ClassStrengthSettings />
    </AppShell>
  );
}
