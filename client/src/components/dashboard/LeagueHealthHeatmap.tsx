import type { LeagueHealth, SlotGradeInfo } from "../../hooks/use-dashboard";

function gradeColor(score: number): string {
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#f59e0b";
  return "#ef4444";
}

const ARCH_COLORS: Record<string, string> = {
  "Dynasty Juggernaut": "#f59e0b",
  "All-In Contender": "#3b82f6",
  "Fragile Contender": "#f97316",
  "Productive Struggle": "#22c55e",
  Rebuilder: "#a855f7",
  "Dead Zone": "#ef4444",
  Competitor: "#64748b",
};

function GradeCell({ grade }: { grade: SlotGradeInfo }) {
  const color = gradeColor(grade.avg_score);
  return (
    <td style={{ textAlign: "center", padding: "8px 6px" }}>
      <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color }}>
        {grade.avg_score > 0 ? grade.avg_score : "—"}
      </span>
    </td>
  );
}

export default function LeagueHealthHeatmap({
  leagues,
  showArchetype = true,
}: {
  leagues: LeagueHealth[];
  showArchetype?: boolean;
}) {
  if (leagues.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        No league data
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, letterSpacing: 0.5 }}>League</th>
            <th style={{ textAlign: "center", padding: "10px 6px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>QB</th>
            <th style={{ textAlign: "center", padding: "10px 6px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>RB</th>
            <th style={{ textAlign: "center", padding: "10px 6px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>WR</th>
            <th style={{ textAlign: "center", padding: "10px 6px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>TE</th>
            {showArchetype && (
              <th style={{ textAlign: "center", padding: "10px 6px", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>Type</th>
            )}
          </tr>
        </thead>
        <tbody>
          {leagues.map((l) => (
            <tr key={l.league_id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 16px", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.league_name}
              </td>
              <GradeCell grade={l.qb_grade} />
              <GradeCell grade={l.rb_grade} />
              <GradeCell grade={l.wr_grade} />
              <GradeCell grade={l.te_grade} />
              {showArchetype && (
                <td style={{ textAlign: "center", padding: "8px 6px" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: ARCH_COLORS[l.archetype] ?? "#94a3b8" }}>
                    {l.archetype}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
