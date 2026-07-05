import { useState } from "react";
import { useParams } from "wouter";
import EdgeScoreBadge from "../EdgeScoreBadge";
import { PlayerLink } from "../ui";
import { useFreeAgentGaps, type ArbitrageGap } from "../../hooks/use-arbitrage";
import { readStoredUsername } from "../../lib/current-user";
import { posColor } from "../../lib/position-colors";

type SortKey = "score" | "free" | "owned";

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
} as const;

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
    <div
      style={{
        ...cardStyle,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <EdgeScoreBadge score={gap.edge_score} size="md" />
        <PlayerLink name={gap.full_name} style={{ fontSize: 15 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: posColor(gap.position) }}>
          {gap.position}
        </span>
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
    </div>
  );
}

const SORT_OPTIONS: SortKey[] = ["score", "free", "owned"];

function SortBar({ active, onChange }: { active: SortKey; onChange: (k: SortKey) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.5 }}>
        SORT BY
      </span>
      {SORT_OPTIONS.map((k) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            background: active === k ? "var(--amber)" : "var(--card)",
            color: active === k ? "var(--dark-base)" : "var(--text-dim)",
            border: `1px solid ${active === k ? "var(--amber)" : "var(--border)"}`,
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: 0.3,
          }}
        >
          {sortLabel(k)}
        </button>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse" style={{ ...cardStyle, height: 120, marginTop: 12 }} />
      ))}
    </>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "var(--red)" }}>
      Error: {message}
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}

export default function ArbitrageContent({ username: usernameProp }: { username?: string }) {
  const params = useParams<{ username: string }>();
  const username = usernameProp ?? params.username ?? readStoredUsername();
  const { data, isLoading, error } = useFreeAgentGaps(username);
  const [sortKey, setSortKey] = useState<SortKey>("score");

  if (isLoading) return <LoadingSkeleton />;

  const gaps = data ? sorted(data, sortKey) : [];

  if (error) return <ErrorCard message={(error as Error).message} />;
  if (gaps.length === 0) {
    return <EmptyCard label="No free agent gaps found - your rosters are fully covered" />;
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
