import { useLocation, useSearch } from "wouter";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import LeagueHistoryContent from "../components/teams/LeagueHistoryContent";
import PowerRankingsContent from "../components/teams/PowerRankingsContent";
import RosterGradesContent from "../components/teams/RosterGradesContent";
import { PageHeader, TabBar, type TabBarItem } from "../components/ui";
import { useCurrentUsername } from "../hooks/use-current-user";

type TeamsTab = "power" | "grades" | "history";

const TABS: TabBarItem<TeamsTab>[] = [
  { key: "power", label: "Power" },
  { key: "grades", label: "Roster Grades" },
  { key: "history", label: "History" },
];

function parseTab(search: string): TeamsTab {
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "grades" || tab === "history") return tab;
  return "power";
}

function pathFromLocation(location: string): string {
  return location.split("?")[0] || "/power";
}

export default function PowerRankings() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const { username: effectiveUser } = useCurrentUsername();
  const activeTab = parseTab(search);

  function updateTab(tab: TeamsTab) {
    const params = new URLSearchParams(search);
    if (tab === "power") params.delete("tab");
    else params.set("tab", tab);

    const query = params.toString();
    setLocation(`${pathFromLocation(location)}${query ? `?${query}` : ""}`);
  }

  return (
    <AppShell requireSync>
      <PageHeader
        title="Teams"
        subtitle="League power, roster grades, and history in one place."
        actions={<FreshnessBar />}
      />

      <TabBar tabs={TABS} active={activeTab} onChange={updateTab} ariaLabel="Team views" />

      {activeTab === "power" && <PowerRankingsContent username={effectiveUser} />}
      {activeTab === "grades" && <RosterGradesContent username={effectiveUser} />}
      {activeTab === "history" && <LeagueHistoryContent username={effectiveUser} />}
    </AppShell>
  );
}
