import { useState, useMemo } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import ExposureTable from "../components/ExposureTable";
import { StatCard, SectionHeader } from "../components/ui";
import { usePortfolio, type PortfolioPlayer } from "../hooks/use-portfolio";

type SortKey = "leagues" | "value" | "trend";

const SORT_BUTTONS: { key: SortKey; label: string }[] = [
  { key: "leagues", label: "By Exposure" },
  { key: "value", label: "By Value" },
  { key: "trend", label: "By Trend" },
];

function sortPlayers(players: PortfolioPlayer[], key: SortKey) {
  return [...players].sort((a, b) => {
    if (key === "leagues") return b.league_count - a.league_count;
    if (key === "value") return (b.dynasty_value ?? 0) - (a.dynasty_value ?? 0);
    if (key === "trend") return (b.trend_30day ?? 0) - (a.trend_30day ?? 0);
    return 0;
  });
}

export default function Portfolio() {
  const { username } = useParams<{ username: string }>();
  const { data, isLoading, error } = usePortfolio(username);
  const [sortBy, setSortBy] = useState<SortKey>("leagues");

  const sorted = useMemo(
    () => (data ? sortPlayers(data.players, sortBy) : []),
    [data, sortBy]
  );

  if (isLoading) {
    return (
      <AppShell>
        <LoadingSkeleton />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
            My Portfolio
          </h1>
        </div>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 40,
            textAlign: "center",
            color: "var(--text-muted)",
            marginTop: 24,
          }}
        >
          {error
            ? `Error loading portfolio: ${(error as Error).message}`
            : "No portfolio data found. Try syncing first."}
        </div>
      </AppShell>
    );
  }

  const { stats } = data;

  return (
    <AppShell>
      {/* Header */}
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          My Portfolio
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Your dynasty assets across {stats.total_leagues} leagues
        </p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        <StatCard
          label="Weighted Portfolio Value"
          value={stats.weighted_value.toLocaleString()}
          accent="var(--amber)"
        />
        <StatCard
          label="Avg Value Per League"
          value={stats.avg_value_per_league.toLocaleString()}
        />
        <StatCard
          label="High Exposure (>25%)"
          value={`${stats.high_exposure_count} players`}
          accent="var(--red)"
        />
      </div>

      {/* Section Header */}
      <SectionHeader
        icon="📋"
        title="PLAYER EXPOSURE"
        subtitle="Every player you own, sorted by concentration"
      />

      {/* Sort Buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {SORT_BUTTONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSortBy(s.key)}
            style={{
              background: sortBy === s.key ? "var(--amber)" : "var(--card)",
              color:
                sortBy === s.key ? "var(--dark-base)" : "var(--text-dim)",
              border: `1px solid ${sortBy === s.key ? "var(--amber)" : "var(--border)"}`,
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 0.5,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <ExposureTable players={sorted} />
    </AppShell>
  );
}

function LoadingSkeleton() {
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          My Portfolio
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Loading...
        </p>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "20px 24px",
              flex: 1,
              minWidth: 160,
              height: 100,
            }}
          />
        ))}
      </div>
      <div
        className="animate-pulse"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          height: 400,
          marginTop: 32,
        }}
      />
    </>
  );
}
