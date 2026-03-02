import { useState, useMemo } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import ExposureTable from "../components/ExposureTable";
import { StatCard, SectionHeader } from "../components/ui";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import { posColor } from "../lib/position-colors";
import { usePortfolio, type PortfolioPlayer } from "../hooks/use-portfolio";

type SortKey = "exposure" | "edge" | "name";
const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE"] as const;

export default function Portfolio() {
  const { username } = useParams<{ username: string }>();
  const { data, isLoading, error } = usePortfolio(username);
  const [sortBy, setSortBy] = useState<SortKey>("exposure");
  const [posFilter, setPosFilter] = useState<string>("ALL");

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.players;
    if (posFilter !== "ALL") items = items.filter((p) => p.position === posFilter);

    if (sortBy === "edge") return [...items].sort((a, b) => b.edge_score - a.edge_score);
    if (sortBy === "name") return [...items].sort((a, b) => a.full_name.localeCompare(b.full_name));
    return items; // default "exposure" already sorted from API
  }, [data, sortBy, posFilter]);

  if (isLoading) return <AppShell><LoadingSkeleton /></AppShell>;
  if (error || !data) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>My Portfolio</h1>
        </div>
        <EmptyCard label={error ? (error as Error).message : "No portfolio data found. Try syncing first."} />
      </AppShell>
    );
  }

  const { stats } = data;

  return (
    <AppShell>
      {/* Header */}
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>My Portfolio</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          {stats.total_players} players across {stats.total_leagues} leagues
        </p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        <StatCard label="Players" value={stats.total_players} />
        <StatCard
          label="Avg Edge Score"
          value={stats.avg_edge_score}
          accent={stats.avg_edge_score >= 80 ? "var(--green)" : stats.avg_edge_score >= 70 ? "var(--amber)" : "var(--red)"}
        />
        <StatCard label="High Exposure (>25%)" value={stats.high_exposure_count} accent="var(--red)" />
        <StatCard label="Leagues" value={stats.total_leagues} />
      </div>

      {/* Position Breakdown */}
      {stats.position_counts.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          {stats.position_counts.map((pc) => (
            <div
              key={pc.position}
              style={{
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13, color: posColor(pc.position) }}>{pc.position}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{pc.count} players</span>
              <EdgeScoreBadge score={Math.round(pc.avg_score)} />
            </div>
          ))}
        </div>
      )}

      {/* Section Header */}
      <SectionHeader icon="📋" title="PLAYER EXPOSURE" subtitle="Every player you own, with Edge Scores from FC + KTC + FP" />

      {/* Filter + Sort Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {POS_FILTERS.map((pos) => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            style={{
              background: posFilter === pos ? "var(--amber)" : "var(--card)",
              color: posFilter === pos ? "var(--dark-base)" : "var(--text-dim)",
              border: `1px solid ${posFilter === pos ? "var(--amber)" : "var(--border)"}`,
              borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", letterSpacing: 0.5,
            }}
          >
            {pos}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Sort:</span>
          {(["exposure", "edge", "name"] as SortKey[]).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              style={{
                background: sortBy === s ? "var(--border)" : "none",
                color: "var(--text-dim)", border: "none", borderRadius: 4,
                padding: "4px 10px", fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {s === "exposure" ? "Exposure" : s === "edge" ? "Edge Score" : "Name"}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-dim)" }}>
        {filtered.length} player{filtered.length !== 1 ? "s" : ""}
      </div>

      {/* Table */}
      <ExposureTable players={filtered} />
    </AppShell>
  );
}

// ─── Shared ───

function LoadingSkeleton() {
  const skel = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10 } as const;
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>My Portfolio</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Loading...</p>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {[1, 2, 3, 4].map((i) => <div key={i} className="animate-pulse" style={{ ...skel, flex: 1, minWidth: 140, height: 100 }} />)}
      </div>
      <div className="animate-pulse" style={{ ...skel, height: 400, marginTop: 32 }} />
    </>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}
