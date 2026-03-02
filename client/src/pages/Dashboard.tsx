import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { SectionHeader } from "../components/ui";
import { useDashboard } from "../hooks/use-dashboard";
import EmpireOverview from "../components/dashboard/EmpireOverview";
import RosterHoles from "../components/dashboard/RosterHoles";
import SourceMovers from "../components/dashboard/SourceMovers";
import LeagueHealthHeatmap from "../components/dashboard/LeagueHealthHeatmap";
import ExposureChart from "../components/dashboard/ExposureChart";
import ArchetypeActions from "../components/dashboard/ArchetypeActions";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function today(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Dashboard() {
  const { username } = useParams<{ username: string }>();
  const { data, isLoading, error } = useDashboard(username);

  if (isLoading) return <AppShell><LoadingSkeleton username={username} /></AppShell>;
  if (error || !data) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        </div>
        <EmptyCard label={error ? (error as Error).message : "No data found. Try syncing first."} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Greeting */}
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          {greeting()}, {username}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>{today()}</p>
      </div>

      {/* Section 1: Empire Overview */}
      <div style={{ marginTop: 16 }}>
        <EmpireOverview empire={data.empire} />
      </div>

      {/* Section 2: Roster Holes */}
      <SectionHeader icon="🕳️" title="ROSTER HOLES" subtitle="Weakest starting slots across your leagues" />
      <RosterHoles holes={data.roster_holes} />

      {/* Section 3: Source Movers */}
      <SectionHeader icon="📈" title="SOURCE MOVERS" subtitle="Biggest Edge Score changes on your rosters" />
      <SourceMovers movers={data.source_movers} />

      {/* Section 4: League Health Heatmap */}
      <SectionHeader icon="🏥" title="LEAGUE HEALTH" subtitle="Position strength across all leagues" />
      <LeagueHealthHeatmap leagues={data.league_health} />

      {/* Section 5: Exposure Chart */}
      <SectionHeader icon="📊" title="EXPOSURE" subtitle="Most-owned players across your leagues" />
      <ExposureChart players={data.exposure} />

      {/* Section 6: Archetype Actions */}
      <SectionHeader icon="🎯" title="STRATEGIC POSITIONS" subtitle="Recommended approach by league archetype" />
      <ArchetypeActions actions={data.archetype_actions} />
    </AppShell>
  );
}

// ─── Shared ───

const skel = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10 } as const;

function LoadingSkeleton({ username }: { username: string | undefined }) {
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{greeting()}, {username}</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>Loading...</p>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse" style={{ ...skel, flex: 1, minWidth: 140, height: 100 }} />
        ))}
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="animate-pulse" style={{ ...skel, height: 160, marginTop: 32 }} />
      ))}
    </>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 40,
        textAlign: "center",
        color: "var(--text-muted)",
      }}
    >
      {label}
    </div>
  );
}
