import { StatCard } from "../ui";
import EdgeScoreBadge from "../EdgeScoreBadge";
import type { DashboardData } from "../../hooks/use-dashboard";

const ARCHETYPE_INLINE_COLORS: Record<string, string> = {
  "Dynasty Juggernaut": "#f59e0b",
  "All-In Contender": "#3b82f6",
  "Fragile Contender": "#f97316",
  "Productive Struggle": "#22c55e",
  Rebuilder: "#a855f7",
  "Dead Zone": "#ef4444",
  Competitor: "#64748b",
};

export default function EmpireOverview({
  empire,
  showArchetypes = true,
}: {
  empire: DashboardData["empire"];
  showArchetypes?: boolean;
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <StatCard label="Leagues" value={empire.total_leagues} />
        <StatCard
          label="Avg Starter Score"
          value={empire.avg_starter_score.toFixed(1)}
          accent={empire.avg_starter_score >= 80 ? "var(--green)" : empire.avg_starter_score >= 70 ? "var(--amber)" : "var(--red)"}
        />
        <StatCard
          label="Strongest"
          value={empire.strongest_league.avg_score.toFixed(1)}
          sub={empire.strongest_league.name}
          accent="var(--green)"
        />
        <StatCard
          label="Weakest"
          value={empire.weakest_league.avg_score.toFixed(1)}
          sub={empire.weakest_league.name}
          accent="var(--red)"
        />
      </div>
      {showArchetypes && empire.archetypes.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {empire.archetypes.map((a, i) => (
            <span key={a.name}>
              {i > 0 && <span style={{ color: "var(--text-muted)", margin: "0 2px" }}>|</span>}
              <span style={{ fontWeight: 700, color: ARCHETYPE_INLINE_COLORS[a.name] ?? "#94a3b8" }}>
                {a.count} {a.name}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
