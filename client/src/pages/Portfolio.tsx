import { useState, useMemo } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import ExposureTable from "../components/ExposureTable";
import {
  Card,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  PositionBadge,
  SegmentedControl,
  StatCard,
  SectionHeader,
  type SegmentedControlItem,
} from "../components/ui";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import { usePortfolio } from "../hooks/use-portfolio";

type SortKey = "exposure" | "edge" | "name" | "portfolio_value" | "disagreement";
const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE"] as const;
type PosFilter = (typeof POS_FILTERS)[number];
type AgeCurveFilter = "ALL" | "Ascent" | "Prime" | "Decline" | "Cliff";

const AGE_FILTERS: SegmentedControlItem<AgeCurveFilter>[] = [
  { key: "ALL", label: "All Ages" },
  { key: "Ascent", label: "Ascent" },
  { key: "Prime", label: "Prime" },
  { key: "Decline", label: "Decline" },
  { key: "Cliff", label: "Cliff" },
];

const SORT_OPTIONS: SegmentedControlItem<SortKey>[] = [
  { key: "exposure", label: "Exposure" },
  { key: "edge", label: "Edge Score" },
  { key: "portfolio_value", label: "Portfolio Value" },
  { key: "disagreement", label: "Disagreement" },
  { key: "name", label: "Name" },
];

export default function Portfolio() {
  const { username } = useParams<{ username: string }>();
  const { data, isLoading, error } = usePortfolio(username);
  const [sortBy, setSortBy] = useState<SortKey>("exposure");
  const [posFilter, setPosFilter] = useState<PosFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [ageCurveFilter, setAgeCurveFilter] = useState<AgeCurveFilter>("ALL");
  const [exposureThreshold, setExposureThreshold] = useState(0);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.players;

    if (posFilter !== "ALL") items = items.filter((p) => p.position === posFilter);

    if (ageCurveFilter !== "ALL") {
      items = items.filter((p) => p.age_zone === ageCurveFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter((p) => p.full_name.toLowerCase().includes(q));
    }

    if (exposureThreshold > 0) {
      items = items.filter((p) => p.pct >= exposureThreshold);
    }

    if (sortBy === "edge") return [...items].sort((a, b) => b.edge_score - a.edge_score);
    if (sortBy === "name") return [...items].sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (sortBy === "portfolio_value") return [...items].sort((a, b) => b.portfolio_value - a.portfolio_value);
    if (sortBy === "disagreement") return [...items].sort((a, b) => Math.abs(b.ktc_vs_experts ?? 0) - Math.abs(a.ktc_vs_experts ?? 0));
    return items;
  }, [data, sortBy, posFilter, ageCurveFilter, searchQuery, exposureThreshold]);

  if (isLoading) {
    return (
      <AppShell>
        <PageHeader
          title="My Portfolio"
          subtitle="Loading player exposure across your leagues."
          actions={<FreshnessBar />}
        />
        <LoadingSkeleton label="Loading portfolio" rows={6} />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <PageHeader title="My Portfolio" actions={<FreshnessBar />} />
        <ErrorState
          title="Could not load portfolio"
          message={error ? (error as Error).message : "No portfolio data found. Try syncing first."}
        />
      </AppShell>
    );
  }

  const { stats } = data;

  return (
    <AppShell>
      <PageHeader
        title="My Portfolio"
        subtitle={`${stats.total_players} players across ${stats.total_leagues} leagues`}
        actions={<FreshnessBar />}
      />

      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        <StatCard
          label="Portfolio Value"
          value={stats.portfolio_value_total.toLocaleString()}
          sub={"\u03A3 (edge \u00D7 leagues)"}
        />
        <StatCard
          label="Avg Edge Score"
          value={stats.avg_edge_score}
          accent={stats.avg_edge_score >= 80 ? "var(--green)" : stats.avg_edge_score >= 70 ? "var(--amber)" : "var(--red)"}
        />
        <StatCard
          label="Weighted Avg Age"
          value={stats.weighted_avg_age}
          accent={stats.weighted_avg_age <= 25 ? "var(--green)" : stats.weighted_avg_age <= 27 ? "var(--amber)" : "var(--red)"}
        />
        <StatCard
          label="Source Coverage"
          value={`${stats.source_coverage_pct}%`}
          sub="3-source players"
          accent={stats.source_coverage_pct >= 70 ? "var(--green)" : stats.source_coverage_pct >= 50 ? "var(--amber)" : "var(--red)"}
        />
        <StatCard
          label="High Exposure (>25%)"
          value={data.players.filter((p) => p.pct > 25).length}
          accent="var(--red)"
        />
        <StatCard label="Leagues" value={stats.total_leagues} />
      </div>

      {stats.position_counts.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          {stats.position_counts.map((pc) => (
            <Card
              key={pc.position}
              style={{
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <PositionBadge position={pc.position} />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{pc.count} players</span>
              <EdgeScoreBadge score={pc.avg_score} />
            </Card>
          ))}
        </div>
      )}

      {(() => {
        const tiers = [
          { label: "Elite", min: 85, max: 99, color: "#22c55e" },
          { label: "Strong", min: 70, max: 84, color: "#f59e0b" },
          { label: "Average", min: 55, max: 69, color: "#6b7280" },
          { label: "Replacement", min: 0, max: 54, color: "#ef4444" },
        ];

        return (
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {tiers.map((t) => {
              const count = data.players.filter((p) => p.edge_score >= t.min && p.edge_score <= t.max).length;
              return (
                <Card
                  key={t.label}
                  style={{
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                    minWidth: 140,
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: t.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.label}</span>
                  <span className="font-mono" style={{ fontSize: 16, fontWeight: 700, marginLeft: "auto" }}>
                    {count}
                  </span>
                </Card>
              );
            })}
          </div>
        );
      })()}

      {(() => {
        const chartPlayers = data.players.filter((p) => p.age != null && p.portfolio_value > 0);
        if (chartPlayers.length === 0) return null;

        const W = 700;
        const H = 240;
        const PAD = { top: 20, right: 30, bottom: 35, left: 55 };
        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;

        const minAge = Math.min(...chartPlayers.map((p) => p.age!));
        const maxAge = Math.max(...chartPlayers.map((p) => p.age!));
        const maxVal = Math.max(...chartPlayers.map((p) => p.portfolio_value));
        const maxLeagues = Math.max(...chartPlayers.map((p) => p.leagues_owned));

        const xScale = (age: number) => PAD.left + ((age - minAge) / Math.max(1, maxAge - minAge)) * plotW;
        const yScale = (val: number) => PAD.top + plotH - (val / Math.max(1, maxVal)) * plotH;
        const rScale = (leagues: number) => 4 + (leagues / Math.max(1, maxLeagues)) * 12;

        const ZONE_FILL: Record<string, string> = {
          Ascent: "#22c55e",
          Prime: "#f59e0b",
          Decline: "#f97316",
          Cliff: "#ef4444",
        };

        const ageTicks = Array.from(
          { length: Math.floor(Math.max(1, maxAge - minAge)) + 1 },
          (_, i) => minAge + i,
        );

        return (
          <div style={{ marginTop: 16 }}>
            <SectionHeader
              icon={"\u{1F4CA}"}
              title="AGE DISTRIBUTION"
              subtitle="Age vs portfolio value (bubble size = leagues owned)"
            />
            <Card
              style={{
                padding: 16,
              }}
            >
              <svg
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label="Age distribution by portfolio value"
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  maxWidth: W,
                  margin: "0 auto",
                }}
              >
                {Array.from({ length: 5 }, (_, i) => {
                  const y = PAD.top + (plotH / 4) * i;
                  return (
                    <line
                      key={i}
                      x1={PAD.left}
                      x2={W - PAD.right}
                      y1={y}
                      y2={y}
                      stroke="rgba(255,255,255,0.05)"
                    />
                  );
                })}

                {ageTicks.map((age) => {
                  if (maxAge - minAge > 15 && age % 2 !== 0) return null;
                  return (
                    <text
                      key={age}
                      x={xScale(age)}
                      y={H - 8}
                      fill="var(--text-muted)"
                      fontSize={10}
                      textAnchor="middle"
                    >
                      {age}
                    </text>
                  );
                })}

                <text
                  x={12}
                  y={PAD.top + plotH / 2}
                  fill="var(--text-muted)"
                  fontSize={10}
                  textAnchor="middle"
                  transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}
                >
                  Portfolio Value
                </text>

                {chartPlayers.map((p) => (
                  <circle
                    key={p.player_id}
                    cx={xScale(p.age!)}
                    cy={yScale(p.portfolio_value)}
                    r={rScale(p.leagues_owned)}
                    fill={ZONE_FILL[p.age_zone ?? ""] ?? "#6b7280"}
                    fillOpacity={0.6}
                    stroke={ZONE_FILL[p.age_zone ?? ""] ?? "#6b7280"}
                    strokeWidth={1}
                  >
                    <title>{p.full_name} (Age {p.age}, Edge {p.edge_score}, {p.leagues_owned} leagues)</title>
                  </circle>
                ))}
              </svg>

              <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
                {[
                  { label: "Ascent", color: "#22c55e" },
                  { label: "Prime", color: "#f59e0b" },
                  { label: "Decline", color: "#f97316" },
                  { label: "Cliff", color: "#ef4444" },
                ].map((z) => (
                  <div key={z.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: z.color }} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{z.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        );
      })()}

      <SectionHeader
        icon={"\u{1F4CB}"}
        title="PLAYER EXPOSURE"
        subtitle="Every player you own, with Edge Scores from FC + KTC + FP"
      />

      <Card style={{ display: "grid", gap: 14, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "8px 12px",
            background: "var(--dark-base)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text)",
            fontSize: 13,
            outline: "none",
          }}
        />

        <SegmentedControl
          items={POS_FILTERS.map((pos) => ({ key: pos, label: pos }))}
          value={posFilter}
          onChange={setPosFilter}
          ariaLabel="Position filter"
        />

        <SegmentedControl
          items={AGE_FILTERS}
          value={ageCurveFilter}
          onChange={setAgeCurveFilter}
          ariaLabel="Age curve filter"
        />

        <SegmentedControl
          items={SORT_OPTIONS}
          value={sortBy}
          onChange={setSortBy}
          ariaLabel="Exposure sort"
        />

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Min exposure: {exposureThreshold}%
          </span>
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={exposureThreshold}
            onChange={(e) => setExposureThreshold(Number(e.target.value))}
            style={{ width: 100, cursor: "pointer" }}
          />
        </div>
      </Card>

      <div style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-dim)" }}>
        {filtered.length} player{filtered.length !== 1 ? "s" : ""}
      </div>

      <ExposureTable players={filtered} />
    </AppShell>
  );
}
