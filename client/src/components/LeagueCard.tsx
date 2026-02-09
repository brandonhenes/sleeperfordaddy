import type { LeagueSeason } from "@shared/types";
import { cn } from "../lib/utils";

interface LeagueCardProps {
  league: LeagueSeason;
}

export default function LeagueCard({ league }: LeagueCardProps) {
  const record = `${league.wins}-${league.losses}${league.ties > 0 ? `-${league.ties}` : ""}`;
  const winPct =
    league.wins + league.losses + league.ties > 0
      ? (
          league.wins /
          (league.wins + league.losses + league.ties)
        ).toFixed(3)
      : ".000";

  return (
    <div className="bg-sleeper-surface border border-sleeper-border rounded-lg p-4 hover:border-sleeper-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sleeper-text truncate">
            {league.league_name}
          </h3>
          <p className="text-sm text-sleeper-muted mt-1">
            {league.total_rosters} teams
          </p>
        </div>

        <div className="text-right shrink-0">
          <p
            className={cn(
              "font-bold text-lg",
              league.wins > league.losses
                ? "text-green-400"
                : league.wins < league.losses
                  ? "text-red-400"
                  : "text-sleeper-muted"
            )}
          >
            {record}
          </p>
          <p className="text-xs text-sleeper-muted">{winPct}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-sleeper-muted">
        <span>{league.fpts.toFixed(1)} PF</span>
        {league.finish_place && (
          <span className="text-sleeper-accent">
            Finished #{league.finish_place}
          </span>
        )}
      </div>
    </div>
  );
}
