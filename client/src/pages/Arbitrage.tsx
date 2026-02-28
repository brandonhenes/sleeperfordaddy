import { useState } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { TrendArrow, PlayerLink } from "../components/ui";
import { posColor } from "../lib/position-colors";
import {
  useFreeAgentGaps,
  type ArbitrageGap,
  type FreeAgentLeague,
} from "../hooks/use-arbitrage";

type SortKey = "gaps" | "value" | "owned";

function sortLabel(k: SortKey): string {
  if (k === "gaps") return "Free Agent Leagues";
  if (k === "value") return "FC Value";
  return "Owned Leagues";
}

function sorted(data: ArbitrageGap[], key: SortKey): ArbitrageGap[] {
  return [...data].sort((a, b) => {
    if (key === "gaps") return b.free_agent_leagues.length - a.free_agent_leagues.length;
    if (key === "value") return (b.dynasty_value ?? 0) - (a.dynasty_value ?? 0);
    return b.owned_league_count - a.owned_league_count;
  });
}

// ─── League Badge ───

function LeagueBadge({ league }: { league: FreeAgentLeague }) {
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
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(96,165,250,0.25)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(96,165,250,0.12)";
      }}
    >
      {league.league_name}
    </a>
  );
}

// ─── Player Card ───

function GapCard({ gap }: { gap: ArbitrageGap }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Row 1: name, pos, team, value, trend */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <PlayerLink name={gap.player_name} style={{ fontSize: 15 }} />
        {gap.position && (
          <span style={{ fontSize: 12, fontWeight: 600, color: posColor(gap.position) }}>
            {gap.position}
          </span>
        )}
        {gap.team && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{gap.team}</span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {gap.dynasty_value != null && (
            <span
              className="font-mono"
              style={{ fontSize: 14, fontWeight: 600, color: "var(--amber)" }}
            >
              {gap.dynasty_value.toLocaleString()}
            </span>
          )}
          <TrendArrow value={gap.trend_30day} />
        </div>
      </div>

      {/* Row 2: ownership summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13 }}>
        <span style={{ color: "var(--green)", fontWeight: 600 }}>
          Owned in {gap.owned_league_count} league{gap.owned_league_count !== 1 ? "s" : ""}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          Free agent in {gap.free_agent_leagues.length} league
          {gap.free_agent_leagues.length !== 1 ? "s" : ""}:
        </span>
      </div>

      {/* Row 3: league badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {gap.free_agent_leagues.map((l) => (
          <LeagueBadge key={l.league_id} league={l} />
        ))}
      </div>
    </div>
  );
}

// ─── Sort Toggle ───

const SORT_OPTIONS: SortKey[] = ["gaps", "value", "owned"];

function SortBar({ active, onChange }: { active: SortKey; onChange: (k: SortKey) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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

// ─── Page ───

export default function Arbitrage() {
  const { username } = useParams<{ username: string }>();
  const { data, isLoading, error } = useFreeAgentGaps(username ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("gaps");

  if (isLoading) return <AppShell><LoadingSkeleton /></AppShell>;

  const gaps = data ? sorted(data, sortKey) : [];

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          Cross-League Arbitrage
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Players you own that are free agents in your other leagues
        </p>
      </div>

      {error ? (
        <ErrorCard message={(error as Error).message} />
      ) : gaps.length === 0 ? (
        <EmptyCard label="No free agent gaps found — your rosters are fully covered" />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
              {gaps.length} player{gaps.length !== 1 ? "s" : ""} with free agent gaps
            </span>
            <SortBar active={sortKey} onChange={setSortKey} />
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {gaps.map((g) => (
              <GapCard key={g.player_name} gap={g} />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

// ─── Shared ───

const skel = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10 } as const;

function LoadingSkeleton() {
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Cross-League Arbitrage</h1>
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse" style={{ ...skel, height: 120, marginTop: 12 }} />
      ))}
    </>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div style={{ ...skel, padding: 40, textAlign: "center", color: "var(--red)" }}>
      Error: {message}
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div style={{ ...skel, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}
