import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import {
  PageHeader,
  SectionHeader,
  SegmentedControl,
  type SegmentedControlItem,
} from "../components/ui";
import {
  useDashboard,
} from "../hooks/use-dashboard";
import type { DashboardLeagueScope } from "@shared/types";
import { useCurrentUsername } from "../hooks/use-current-user";
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

function initialLeagueScope(): DashboardLeagueScope {
  if (typeof window === "undefined") return "dynasty";
  const raw = new URLSearchParams(window.location.search).get("leagueScope");
  return raw === "redraft" ? "redraft" : "dynasty";
}

const LEAGUE_SCOPE_OPTIONS: SegmentedControlItem<DashboardLeagueScope>[] = [
  { key: "dynasty", label: "Dynasty" },
  { key: "redraft", label: "Redraft" },
];

export default function Dashboard() {
  const { username } = useCurrentUsername();
  const [leagueScope, setLeagueScope] =
    useState<DashboardLeagueScope>(initialLeagueScope);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (leagueScope === "dynasty") url.searchParams.delete("leagueScope");
    else url.searchParams.set("leagueScope", leagueScope);
    window.history.replaceState({}, "", url.toString());
  }, [leagueScope]);

  const title = username ? `${greeting()}, ${username}` : "Dashboard";
  const subtitle = username ? today() : undefined;

  return (
    <AppShell requireSync>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <SegmentedControl
            items={LEAGUE_SCOPE_OPTIONS}
            value={leagueScope}
            onChange={setLeagueScope}
            ariaLabel="League view"
          />
        }
      />
      <DashboardReady username={username} leagueScope={leagueScope} />
    </AppShell>
  );
}

function DashboardReady({
  username,
  leagueScope,
}: {
  username: string;
  leagueScope: DashboardLeagueScope;
}) {
  const { data, isLoading, error } = useDashboard(username, leagueScope);
  const isRedraft = leagueScope === "redraft";

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !data) {
    return (
      <EmptyCard
        label={
          error
            ? (error as Error).message
            : `No ${leagueScope} data found. Try syncing first.`
        }
      />
    );
  }

  return (
    <>
      <FreshnessBar />

      {isRedraft && (
        <div
          style={{
            marginTop: 16,
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.22)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          Redraft view uses your latest non-dynasty leagues, including keeper
          formats. Starter scores blend multi-source market signal with
          scoring-adjusted PPG, and dynasty-only strategy cards stay hidden
          here.
        </div>
      )}

      {!isRedraft && data.actions_feed.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <ActionsFeed items={data.actions_feed} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <EmpireOverview empire={data.empire} showArchetypes={!isRedraft} />
      </div>

      <SectionHeader
        icon="RH"
        title="ROSTER HOLES"
        subtitle="Weakest starting slots across your leagues"
      />
      <RosterHoles holes={data.roster_holes} />

      {!isRedraft && (
        <>
          <SectionHeader
            icon="MV"
            title="SOURCE MOVERS"
            subtitle="Biggest Edge Score changes on your rosters"
          />
          <SourceMovers movers={data.source_movers} />
        </>
      )}

      <SectionHeader
        icon="LH"
        title="LEAGUE HEALTH"
        subtitle="Position strength across all leagues"
      />
      <LeagueHealthHeatmap
        leagues={data.league_health}
        showArchetype={!isRedraft}
      />

      <SectionHeader
        icon="EX"
        title="EXPOSURE"
        subtitle="Most-owned players across your leagues"
      />
      <ExposureChart players={data.exposure} />

      {!isRedraft && (
        <>
          <SectionHeader
            icon="SP"
            title="STRATEGIC POSITIONS"
            subtitle="Recommended approach by league archetype"
          />
          <ArchetypeActions actions={data.archetype_actions} />
        </>
      )}
    </>
  );
}

function LoadingSkeleton() {
  return (
    <>
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
