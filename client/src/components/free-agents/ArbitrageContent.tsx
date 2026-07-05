import { useState } from "react";
import { useParams } from "wouter";
import EdgeScoreBadge from "../EdgeScoreBadge";
import {
  Card,
  ErrorState,
  LoadingSkeleton,
  PlayerLink,
  PositionBadge,
  SegmentedControl,
} from "../ui";
import { useFreeAgentGaps } from "../../hooks/use-arbitrage";
import { readStoredUsername } from "../../lib/current-user";
import type { ArbitrageGap } from "@shared/types";

type SortKey = "score" | "free" | "owned";

function sortLabel(k: SortKey): string {
  if (k === "score") return "Edge Score";
  if (k === "free") return "Free Leagues";
  return "Owned Leagues";
}

function sorted(data: ArbitrageGap[], key: SortKey): ArbitrageGap[] {
  return [...data].sort((a, b) => {
    if (key === "score") return b.edge_score - a.edge_score;
    if (key === "free") return b.free_count - a.free_count || b.edge_score - a.edge_score;
    return b.owned_count - a.owned_count || b.edge_score - a.edge_score;
  });
}

function LeagueBadge({ league }: { league: { league_id: string; league_name: string } }) {
  return (
    <a
      href={`https://sleeper.com/leagues/${league.league_id}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: "rgba(96,165,250,0.12)",
        color: "var(--blue)",
        textDecoration: "none",
        border: "1px solid rgba(96,165,250,0.2)",
      }}
    >
      {league.league_name}
    </a>
  );
}

function GapCard({ gap }: { gap: ArbitrageGap }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <EdgeScoreBadge score={gap.edge_score} size="md" />
        <PlayerLink name={gap.full_name} style={{ fontSize: 15 }} />
        <PositionBadge position={gap.position} />
        {gap.team && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{gap.team}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, flexWrap: "wrap" }}>
        <span style={{ color: "var(--green)", fontWeight: 600 }}>
          Owned in {gap.owned_count} league{gap.owned_count !== 1 ? "s" : ""}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          Free in {gap.free_count} league{gap.free_count !== 1 ? "s" : ""}:
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {gap.free_leagues.map((l) => (
          <LeagueBadge key={l.league_id} league={l} />
        ))}
      </div>
    </Card>
  );
}

const SORT_OPTIONS: SortKey[] = ["score", "free", "owned"];

function SortBar({ active, onChange }: { active: SortKey; onChange: (k: SortKey) => void }) {
  return (
    <div style={{ minWidth: 240 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.5 }}>
        SORT BY
      </span>
      <div style={{ marginTop: 6 }}>
        <SegmentedControl
          items={SORT_OPTIONS.map((k) => ({ key: k, label: sortLabel(k) }))}
          value={active}
          onChange={onChange}
          ariaLabel="Free agent gap sort"
        />
      </div>
    </div>
  );
}

export default function ArbitrageContent({ username: usernameProp }: { username?: string }) {
  const params = useParams<{ username: string }>();
  const username = usernameProp ?? params.username ?? readStoredUsername();
  const { data, isLoading, error } = useFreeAgentGaps(username);
  const [sortKey, setSortKey] = useState<SortKey>("score");

  if (isLoading) return <LoadingSkeleton label="Loading free-agent gaps" rows={4} />;

  const gaps = data ? sorted(data, sortKey) : [];

  if (error) {
    return (
      <ErrorState
        title="Could not load free-agent gaps"
        message={(error as Error).message}
      />
    );
  }
  if (gaps.length === 0) {
    return (
      <Card className="edge-state-card">
        <p>No free agent gaps found. Your rosters are fully covered.</p>
      </Card>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
          {gaps.length} player{gaps.length !== 1 ? "s" : ""} with free agent gaps
        </span>
        <SortBar active={sortKey} onChange={setSortKey} />
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {gaps.map((g) => (
          <GapCard key={g.player_id} gap={g} />
        ))}
      </div>
    </>
  );
}
