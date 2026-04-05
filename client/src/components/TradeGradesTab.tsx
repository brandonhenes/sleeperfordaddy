import { useEffect, useMemo, useState } from "react";
import TradeCard from "./TradeCard";
import EmptyState from "./EmptyState";
import { SectionHeader } from "./ui";
import { usePowerRankings } from "../hooks/use-power-rankings";
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

const selectStyle = {
  padding: "10px 12px",
  background: "var(--dark-base)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
} as const;

type OwnerFilter = "mine" | "all" | number;

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
  username: string;
}

export default function TradeGradesTab({ selectedLeagueId, leagueName, username }: TradeGradesTabProps) {
  const [expandedTrade, setExpandedTrade] = useState<{
    key: string;
    outcomeId: number;
    tradeId: string;
    leagueId: string;
  } | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("mine");

  useEffect(() => {
    setExpandedTrade(null);
  }, [selectedLeagueId]);

  const leagueQuery = useTradeIntelligenceLeague(selectedLeagueId || undefined);
  const tradeDetailQuery = useTradeIntelligenceTradeDetail(
    expandedTrade?.leagueId,
    expandedTrade?.tradeId,
    !!expandedTrade
  );

  const { data: powerData } = usePowerRankings(
    selectedLeagueId ? username : ""
  );

  const myRosterId = useMemo(() => {
    if (!powerData || !selectedLeagueId) return null;
    const league = powerData.find((l) => l.league_id === selectedLeagueId);
    if (!league) return null;
    const me = league.rosters.find((r) => r.is_user);
    return me?.roster_id ?? null;
  }, [powerData, selectedLeagueId]);

  const rosterNames = useMemo(
    () => buildRosterNameMap(leagueQuery.data?.rosters),
    [leagueQuery.data?.rosters]
  );

  const ownerOptions = useMemo(() => {
    const rosters = leagueQuery.data?.rosters ?? [];
    return rosters
      .filter((r) => myRosterId == null || r.roster_id !== myRosterId)
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [leagueQuery.data?.rosters, myRosterId]);

  const filteredOutcomes = useMemo(() => {
    const outcomes = leagueQuery.data?.outcomes ?? [];
    if (ownerFilter === "mine") {
      if (myRosterId == null) return outcomes;
      return outcomes.filter((o) => o.roster_id === myRosterId);
    }
    if (ownerFilter === "all") {
      const seen = new Set<string>();
      return outcomes.filter((o) => {
        if (seen.has(o.trade_id)) return false;
        seen.add(o.trade_id);
        return true;
      });
    }
    return outcomes.filter((o) => o.roster_id === ownerFilter);
  }, [leagueQuery.data?.outcomes, ownerFilter, myRosterId]);

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

  const myDisplayName = myRosterId != null ? rosterNames.get(myRosterId) : null;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <select
          value={typeof ownerFilter === "number" ? String(ownerFilter) : ownerFilter}
          onChange={(event) => {
            const val = event.target.value;
            if (val === "mine" || val === "all") setOwnerFilter(val);
            else setOwnerFilter(Number(val));
          }}
          style={selectStyle}
        >
          <option value="mine">
            My Trades{myDisplayName ? ` (${myDisplayName})` : ""}
          </option>
          <option value="all">All Trades</option>
          {ownerOptions.map((roster) => (
            <option key={roster.roster_id} value={String(roster.roster_id)}>
              {roster.display_name}
            </option>
          ))}
        </select>
      </div>

      <SectionHeader
        icon="TI"
        title="Trade Grades"
        subtitle={`${leagueName} trade outcomes`}
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
      ) : filteredOutcomes.length === 0 ? (
        <EmptyState title="No graded trades yet. Trades will be graded automatically during sync." />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filteredOutcomes.map((outcome) => {
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
