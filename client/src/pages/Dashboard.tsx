import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { SectionHeader } from "../components/ui";
import { useDashboard } from "../hooks/use-dashboard";
import { useEnsureUser } from "../hooks/use-ensure-user";
import FreshnessBar from "../components/FreshnessBar";
import EmpireOverview from "../components/dashboard/EmpireOverview";
import RosterHoles from "../components/dashboard/RosterHoles";
import SourceMovers from "../components/dashboard/SourceMovers";
import LeagueHealthHeatmap from "../components/dashboard/LeagueHealthHeatmap";
import ExposureChart from "../components/dashboard/ExposureChart";
import ActionsFeed from "../components/dashboard/ActionsFeed";
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
  const { phase, syncProgress, errorMsg, retry } = useEnsureUser(username);
  const { data, isLoading, error } = useDashboard(
    phase === "ready" ? username : undefined
  );

  // Show sync progress while ensuring user data exists
  if (phase === "checking" || phase === "syncing") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        </div>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: "var(--amber)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <span className="animate-pulse">●</span>
            {phase === "checking"
              ? `Looking up ${username}...`
              : `Syncing ${username}'s leagues${
                  syncProgress
                    ? ` (${syncProgress.done}/${syncProgress.total})`
                    : "..."
                }`}
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
            {phase === "syncing"
              ? "First-time sync may take a minute. Pulling leagues, rosters, and player data from Sleeper."
              : "Checking if data is available..."}
          </p>
        </div>
      </AppShell>
    );
  }

  // Show error with retry
  if (phase === "error") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        </div>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ color: "var(--red)", fontSize: 14, margin: 0 }}>
            {errorMsg || "Something went wrong."}
          </p>
          <button
            onClick={retry}
            style={{
              marginTop: 16,
              background: "linear-gradient(135deg, var(--amber), var(--amber-dark))",
              color: "var(--dark-base)",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </AppShell>
    );
  }

  // Normal dashboard loading (data fetch after sync is confirmed)
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
        <FreshnessBar />
      </div>

      {/* Actions Feed */}
      {data.actions_feed && data.actions_feed.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <ActionsFeed items={data.actions_feed} />
        </div>
      )}

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

/** Skeleton loader */
function LoadingSkeleton({ username }: { username: string | undefined }) {
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          {greeting()}, {username}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>{today()}</p>
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            height: 120,
            marginTop: 16,
          }}
        />
      ))}
    </>
  );
}

/** Empty state card */
function EmptyCard({ label }: { label: string }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "48px 24px",
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: 14,
      }}
    >
      {label}
    </div>
  );
}
