import { useEffect, useState } from "react";
import {
  classStrengthSeasons,
  DEFAULT_CLASS_STRENGTHS,
  getStoredClassStrengths,
  saveClassStrengths,
  type ClassStrengthSettings as ClassStrengthValues,
} from "../lib/pick-strengths";

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 20,
} as const;

function seasonLabel(season: string, index: number): string {
  if (index === classStrengthSeasons().length - 1) return `${season}+`;
  return season;
}

export default function ClassStrengthSettings() {
  const [values, setValues] = useState<ClassStrengthValues>(getStoredClassStrengths);

  useEffect(() => {
    saveClassStrengths(values);
  }, [values]);

  return (
    <div style={{ ...cardStyle, marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 16 }}>
        ROOKIE CLASS STRENGTH
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        {classStrengthSeasons().map((season, index) => {
          const value = values[season] ?? DEFAULT_CLASS_STRENGTHS[season];
          return (
            <div key={season}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{seasonLabel(season, index)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Default {DEFAULT_CLASS_STRENGTHS[season].toFixed(2)}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--amber)" }}>x{value.toFixed(2)}</div>
              </div>
              <input
                type="range"
                min={70}
                max={150}
                value={Math.round(value * 100)}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [season]: parseInt(event.target.value, 10) / 100,
                  }))
                }
                style={{ width: "100%", accentColor: "var(--amber)", cursor: "pointer" }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 12, lineHeight: 1.6 }}>
        Pick values = Base x Future Year Discount x Class Strength. The future discount drops 0.1 per year (2027 = 0.9, 2028 = 0.8, 2029 = 0.7). Class strength is your adjustment on top of that.
      </div>
    </div>
  );
}
