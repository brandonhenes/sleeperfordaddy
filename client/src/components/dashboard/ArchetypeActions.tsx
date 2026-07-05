import { useState } from "react";
import type { ArchetypeAction } from "@shared/types";

const ARCH_COLORS: Record<string, { bg: string; text: string }> = {
  "Dynasty Juggernaut": { bg: "#f59e0b", text: "#000" },
  "All-In Contender": { bg: "#3b82f6", text: "#fff" },
  "Fragile Contender": { bg: "#f97316", text: "#fff" },
  "Productive Struggle": { bg: "#22c55e", text: "#fff" },
  Rebuilder: { bg: "#a855f7", text: "#fff" },
  "Dead Zone": { bg: "#ef4444", text: "#fff" },
  Competitor: { bg: "#64748b", text: "#fff" },
};

function ActionCard({ action }: { action: ArchetypeAction }) {
  const [open, setOpen] = useState(false);
  const colors = ARCH_COLORS[action.archetype] ?? { bg: "#64748b", text: "#fff" };

  return (
    <div
      style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "var(--text)",
        }}
      >
        <span
          className="font-mono"
          style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: colors.bg, color: colors.text, whiteSpace: "nowrap" }}
        >
          {action.archetype}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {action.leagues.length} league{action.leagues.length !== 1 ? "s" : ""}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)" }}>
          {open ? "\u25B2" : "\u25BC"}
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 14px" }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
            {action.strategy}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {action.leagues.map((l) => (
              <span
                key={l.league_id}
                style={{ fontSize: 12, color: "var(--text-dim)", background: "var(--dark-base)", padding: "3px 8px", borderRadius: 4 }}
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ArchetypeActions({ actions }: { actions: ArchetypeAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {actions.map((a) => (
        <ActionCard key={a.archetype} action={a} />
      ))}
    </div>
  );
}
