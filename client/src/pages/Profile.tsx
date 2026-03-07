import { useParams } from "wouter";
import { useEffect, useState } from "react";
import { useOverview, useStartSync, useSyncStatus } from "../hooks/use-sleeper";
import LeagueCard from "../components/LeagueCard";
import { avatarUrl, cn } from "../lib/utils";

export default function Profile() {
  const params = useParams<{ username: string }>();
  const username = params.username;

  const [syncing, setSyncing] = useState(false);
  const startSync = useStartSync();

  const syncStatus = useSyncStatus(username, syncing);
  const overview = useOverview(username);

  // Auto-trigger sync when visiting a profile
  useEffect(() => {
    if (username && !startSync.isPending) {
      startSync.mutate({ username });
      setSyncing(true);
    }
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop polling when sync completes
  useEffect(() => {
    if (
      syncStatus.data?.status === "completed" ||
      syncStatus.data?.status === "failed"
    ) {
      setSyncing(false);
      overview.refetch();
    }
  }, [syncStatus.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const user = overview.data?.user;
  const seasons = overview.data?.seasons ?? {};
  const totals = overview.data?.totals;
  const groups = overview.data?.league_groups ?? [];

  // Sort seasons descending
  const sortedSeasons = Object.keys(seasons).sort(
    (a, b) => Number(b) - Number(a)
  );

  return (
    <div>
      {/* Sync status banner */}
      {syncing && syncStatus.data?.status === "running" && (
        <div className="bg-sleeper-accent/10 border border-sleeper-accent/30 rounded-lg px-4 py-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-4 w-4 border-2 border-sleeper-accent border-t-transparent rounded-full" />
            <div>
              <p className="text-sm font-medium text-sleeper-accent">
                Syncing data from Sleeper...
              </p>
              <p className="text-xs text-sleeper-muted">
                {syncStatus.data.detail ?? syncStatus.data.step ?? "Starting..."}
                {syncStatus.data.leagues_total
                  ? ` (${syncStatus.data.leagues_done}/${syncStatus.data.leagues_total})`
                  : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {syncStatus.data?.status === "failed" && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-400">
            Sync failed: {syncStatus.data.error ?? "Unknown error"}
          </p>
        </div>
      )}

      {/* User header */}
      {user && (
        <div className="flex items-center gap-4 mb-8">
          {user.avatar && (
            <img
              src={avatarUrl(user.avatar)}
              alt={user.display_name}
              className="w-16 h-16 rounded-full"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold">{user.display_name}</h1>
            <p className="text-sleeper-muted">@{user.username}</p>
          </div>

          {totals && (
            <div className="ml-auto text-right">
              <p className="text-xl font-bold">
                {totals.wins}-{totals.losses}
                {totals.ties > 0 ? `-${totals.ties}` : ""}
              </p>
              <p className="text-sm text-sleeper-muted">
                {totals.leagues} leagues
              </p>
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {overview.isLoading && !user && (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-sleeper-accent border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sleeper-muted">Loading profile...</p>
        </div>
      )}

      {/* League groups */}
      {groups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">League Groups</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <div
                key={group.group_id}
                className="bg-sleeper-surface border border-sleeper-border rounded-lg p-4"
              >
                <h3 className="font-semibold truncate">{group.name}</h3>
                <div className="flex items-center gap-3 mt-2 text-sm text-sleeper-muted">
                  <span>
                    {group.min_season === group.max_season
                      ? group.min_season
                      : `${group.min_season}–${group.max_season}`}
                  </span>
                  <span>{group.leagues.length} season{group.leagues.length !== 1 ? "s" : ""}</span>
                  {group.is_active && (
                    <span className="text-green-400 text-xs">Active</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seasons */}
      {sortedSeasons.map((season) => (
        <div key={season} className="mb-8">
          <h2 className="text-lg font-semibold mb-3">{season}</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {seasons[season].map((league) => (
              <LeagueCard key={league.league_id} league={league} />
            ))}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {!overview.isLoading && sortedSeasons.length === 0 && !syncing && (
        <div className="text-center py-12 text-sleeper-muted">
          <p>No league data found. Sync may still be in progress.</p>
        </div>
      )}
    </div>
  );
}
