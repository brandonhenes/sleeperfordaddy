import { useState, useMemo } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { StatCard } from "../components/ui";
import { posColor } from "../lib/position-colors";
import { useRosterGrades, type LeagueGrades, type PositionGrade } from "../hooks/use-roster-grades";

type SortKey = "overall" | "league";
const POSITIONS = ["QB", "RB", "WR", "TE"];

const GRADE_COLORS: Record<string, string> = {
  A: "var(--green)", B: "var(--blue)", C: "var(--amber)", D: "var(--text-muted)", F: "var(--red)",
};

function gradeColor(g: string) { return GRADE_COLORS[g] ?? "var(--text-muted)"; }

const FLAG_STYLES: Record<string, { bg: string; color: string }> = {
  HOARDING: { bg: "rgba(245,158,11,0.15)", color: "var(--amber)" },
  ONE_DEEP: { bg: "rgba(239,68,68,0.15)", color: "var(--red)" },
  DEAD_WEIGHT: { bg: "rgba(148,163,184,0.15)", color: "var(--text-dim)" },
  SURPLUS: { bg: "rgba(74,222,128,0.15)", color: "var(--green)" },
};

// ─── Grade Badge ───

function GradeBadge({ grade, size = "md" }: { grade: string; size?: "sm" | "md" | "lg" }) {
  const px = size === "lg" ? 20 : size === "md" ? 14 : 10;
  const fs = size === "lg" ? 22 : size === "md" ? 16 : 12;
  return (
    <span
      className="font-mono"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: px * 2.2, height: px * 2.2, borderRadius: 8, fontSize: fs, fontWeight: 800,
        background: `color-mix(in srgb, ${gradeColor(grade)} 15%, transparent)`,
        color: gradeColor(grade), border: `1px solid ${gradeColor(grade)}`,
      }}
    >
      {grade}
    </span>
  );
}

// ─── Position Grade Cell ───

function PosCell({ pos, pg }: { pos: string; pg: PositionGrade }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 80 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: posColor(pos), letterSpacing: 1 }}>{pos}</span>
      <GradeBadge grade={pg.grade} />
      <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
        {pg.starter_value.toLocaleString()}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{pg.depth} deep</span>
      {pg.flags.length > 0 && (
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
          {pg.flags.map((f) => {
            const s = FLAG_STYLES[f] ?? FLAG_STYLES.DEAD_WEIGHT;
            return (
              <span key={f} style={{ padding: "1px 6px", borderRadius: 3, fontSize: 8, fontWeight: 700, background: s.bg, color: s.color, letterSpacing: 0.5 }}>
                {f.replace("_", " ")}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── League Card ───

function LeagueCard({ league: l }: { league: LeagueGrades }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <GradeBadge grade={l.overall_grade} size="lg" />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{l.league_name}</div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{l.total_rosters} teams</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-around" }}>
        {POSITIONS.map((pos) => (
          <PosCell key={pos} pos={pos} pg={l.grades[pos] ?? { grade: "F", starter_value: 0, depth: 0, flags: [] }} />
        ))}
      </div>
    </div>
  );
}

// ─── Sort Toggle ───

function SortBar({ active, onChange }: { active: SortKey; onChange: (k: SortKey) => void }) {
  const opts: { key: SortKey; label: string }[] = [
    { key: "overall", label: "Overall Grade" },
    { key: "league", label: "League Name" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.5 }}>SORT</span>
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            background: active === o.key ? "var(--amber)" : "var(--card)",
            color: active === o.key ? "var(--dark-base)" : "var(--text-dim)",
            border: `1px solid ${active === o.key ? "var(--amber)" : "var(--border)"}`,
            borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Summary Stats ───

function SummaryCards({ leagues }: { leagues: LeagueGrades[] }) {
  const aCount = leagues.filter((l) => l.overall_grade === "A").length;
  const fCount = leagues.filter((l) => l.overall_grade === "F").length;

  // Weakest position: most F/D grades across all leagues
  const posCounts: Record<string, number> = {};
  for (const l of leagues) {
    for (const pos of POSITIONS) {
      const g = l.grades[pos]?.grade;
      if (g === "F" || g === "D") posCounts[pos] = (posCounts[pos] ?? 0) + 1;
    }
  }
  const weakest = Object.entries(posCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
      <StatCard label="A Grades" value={aCount} accent="var(--green)" />
      <StatCard label="F Grades" value={fCount} accent="var(--red)" />
      <StatCard
        label="Weakest Position"
        value={weakest ? `${weakest[0]} (${weakest[1]} weak)` : "—"}
        accent="var(--amber)"
      />
      <StatCard label="Leagues Graded" value={leagues.length} />
    </div>
  );
}

// ─── Page ───

export default function RosterGrades() {
  const { username } = useParams<{ username: string }>();
  const { data, isLoading, error } = useRosterGrades(username ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("overall");

  const gradeVal: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

  const sorted = useMemo(() => {
    if (!data?.leagues) return [];
    const list = [...data.leagues];
    if (sortKey === "league") list.sort((a, b) => a.league_name.localeCompare(b.league_name));
    else list.sort((a, b) => (gradeVal[b.overall_grade] ?? 0) - (gradeVal[a.overall_grade] ?? 0));
    return list;
  }, [data, sortKey]);

  if (isLoading) return <AppShell><LoadingSkeleton /></AppShell>;

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Roster Grades</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Position strength across all leagues
        </p>
      </div>

      {error ? (
        <EmptyCard label={(error as Error).message} isError />
      ) : sorted.length === 0 ? (
        <EmptyCard label="No roster data found" />
      ) : (
        <>
          <SummaryCards leagues={sorted} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0 12px" }}>
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
              {sorted.length} league{sorted.length !== 1 ? "s" : ""}
            </span>
            <SortBar active={sortKey} onChange={setSortKey} />
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {sorted.map((l) => (
              <LeagueCard key={l.league_id} league={l} />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

// ─── Shared ───

const skel = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10 } as const;

function LoadingSkeleton() {
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Roster Grades</h1>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse" style={{ ...skel, flex: 1, minWidth: 120, height: 90 }} />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse" style={{ ...skel, height: 140, marginTop: 12 }} />
      ))}
    </>
  );
}

function EmptyCard({ label, isError }: { label: string; isError?: boolean }) {
  return (
    <div style={{ ...skel, padding: 40, textAlign: "center", color: isError ? "var(--red)" : "var(--text-muted)" }}>
      {isError ? `Error: ${label}` : label}
    </div>
  );
}
