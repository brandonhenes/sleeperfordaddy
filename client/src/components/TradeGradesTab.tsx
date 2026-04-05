import { useEffect, useMemo, useState } from "react";
import TradeCard from "./TradeCard";
import EmptyState from "./EmptyState";
import { SectionHeader } from "./ui";
import {
  useTradeIntelligenceLeague,
  useTradeIntelligenceTradeDetail,
} from "../hooks/use-trade-intelligence";
import type {
  TradeIntelligenceRoster,
  TradeOutcome,
  TradeOutcomeSeason,
} from "../../../shared/types";

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
} as const;

function buildRosterNameMap(rosters: TradeIntelligenceRoster[] | undefined) {
  return new Map<number, string>(
    (rosters ?? []).map((roster) => [roster.roster_id, roster.display_name])
  );
}

function getTradeKey(outcome: TradeOutcome): string {
  return `${outcome.league_id}:${outcome.trade_id}:${outcome.id}`;
}

function TradeCardSkeleton() {
  return (
    <div className="animate-pulse" style={{ ...cardStyle, height: 290 }} />
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div style={{ ...cardStyle, padding: "24px 20px", color: "var(--red)", fontSize: 13 }}>
      {message}
    </div>
  );
}

interface TradeGradesTabProps {
  selectedLeagueId: string;
  leagueName: string;
}

export default function TradeGradesTab({ selectedLeagueId, leagueName }: TradeGradesTabProps) {
  const [expandedTrade, setExpandedTrade] = useState<{
    key: string;
    outcomeId: number;
    tradeId: string;
    leagueId: string;
  } | null>(null);

  useEffect(() => {
    setExpandedTrade(null);
  }, [selectedLeagueId]);

  const leagueQuery = useTradeIntelligenceLeague(selectedLeagueId || undefined);
  const tradeDetailQuery = useTradeIntelligenceTradeDetail(
    expandedTrade?.leagueId,
    expandedTrade?.tradeId,
    !!expandedTrade
  );

  const rosterNames = useMemo(
    () => buildRosterNameMap(leagueQuery.data?.rosters),
    [leagueQuery.data?.rosters]
  );

  function toggleTrade(outcome: TradeOutcome) {
    const key = getTradeKey(outcome);
    setExpandedTrade((current) => {
      if (current?.key === key) return null;
      return {
        key,
        outcomeId: outcome.id,
        tradeId: outcome.trade_id,
        leagueId: outcome.league_id,
      };
    });
  }

  function seasonsForOutcome(outcomeId: number): TradeOutcomeSeason[] | undefined {
    if (!tradeDetailQuery.data || expandedTrade?.outcomeId !== outcomeId) {
      return undefined;
    }
    return tradeDetailQuery.data.seasons.filter(
      (season) => season.trade_outcome_id === outcomeId
    );
  }

  if (!selectedLeagueId) {
    return <EmptyState title="Select a league to view trade grades." />;
  }

  return (
    <div>
      <SectionHeader
        icon="TI"
        title="Trade Grades"
        subtitle={`${leagueName} trade outcomes from each manager's perspective`}
      />

      {tradeDetailQuery.error && expandedTrade ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorBlock message="Failed to load the expanded season breakdown for this trade." />
        </div>
      ) : null}

      {leagueQuery.isLoading ? (
        <div style={{ display: "grid", gap: 12 }}>
          {[1, 2, 3].map((value) => (
            <TradeCardSkeleton key={value} />
          ))}
        </div>
      ) : leagueQuery.error ? (
        <ErrorBlock message={(leagueQuery.error as Error).message || "Failed to load graded trades."} />
      ) : (leagueQuery.data?.outcomes.length ?? 0) === 0 ? (
        <EmptyState title="No graded trades yet. Trades will be graded automatically during sync." />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {leagueQuery.data!.outcomes.map((outcome) => {
            const expanded = expandedTrade?.key === getTradeKey(outcome);
            return (
              <TradeCard
                key={getTradeKey(outcome)}
                outcome={outcome}
                assets={leagueQuery.data!.assets}
                rosterNames={rosterNames}
                expanded={expanded}
                onToggle={() => toggleTrade(outcome)}
                seasons={expanded ? seasonsForOutcome(outcome.id) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
