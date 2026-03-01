import { useState, useMemo } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { StatCard } from "../components/ui";
import AgeScaleBar from "../components/AgeScaleBar";
import { posColor } from "../lib/position-colors";
import {
  usePowerRankings,
  type LeaguePowerRanking,
  type RosterRanking,
} from "../hooks/use-power-rankings";

// ─── Archetype Badge ───

const ARCHETYPE_COLORS: Record<string, string> = {
  "Dynasty Juggernaut": "bg-amber-500 text-black",
  "All-In Contender": "bg-blue-500 text-white",
  "Fragile Contender": "bg-orange-500 text-white",
  "Productive Struggle": "bg-green-600 text-white",
  Rebuilder: "bg-purple-500 text-white",
  "Dead Zone": "bg-red-600 text-white",
  Competitor: "bg-slate-500 text-white",
};

function ArchetypeBadge({ archetype }: { archetype: string }) {
  const cls = ARCHETYPE_COLORS[archetype] ?? "bg-slate-500 text-white";
  return (
    <span
      className={`${cls} font-mono`}
      style={{
        padding: "3px 10px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {archetype}
    </span>
  );
}

// ─── Pct Bar ───

function PctBar({ label, value }: { label: string; value: number }) {
  const w = Math.max(2, Math.min(100, value));
  const color =
    value > 70 ? "var(--green)" : value > 40 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ flex: 1, minWidth: 70 }}>
      <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          background: "var(--dark-base)",
          borderRadius: 4,
          height: 6,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <div className="font-mono" style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>
        {Math.round(value)}%
      </div>
    </div>
  );
}

// ─── Core Assets Row ───

function CoreAssetsRow({ roster }: { roster: RosterRanking }) {
  return (
    <div
      style={{
        background: "var(--dark-base)",
        borderRadius: 8,
        padding: "12px 16px",
        marginTop: 8,
      }}
    >
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>
        CORE ASSETS
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {roster.core_assets.map((p) => (
          <div
            key={p.player_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
            }}
          >
            <span
              style={{
                color: posColor(p.position),
                fontWeight: 700,
                fontSize: 10,
                width: 24,
              }}
            >
              {p.position}
            </span>
            <span style={{ flex: 1, fontWeight: 500 }}>{p.full_name}</span>
            <span
              className="font-mono"
              style={{ color: "var(--amber)", fontSize: 11, width: 50, textAlign: "right" }}
            >
              {p.value.toLocaleString()}
            </span>
            <AgeScaleBar ageCurve={p.age_curve} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Roster Row ───

function RosterRow({ roster, rank }: { roster: RosterRanking; rank: number }) {
  const [open, setOpen] = useState(false);
  const border = roster.is_user ? "2px solid var(--amber)" : "1px solid var(--border)";

  return (
    <div style={{ border, borderRadius: 8, background: "var(--card)" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          background: "none",
          border: "none",
          color: "var(--text)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span className="font-mono" style={{ width: 24, fontSize: 12, color: "var(--text-muted)" }}>
          #{rank}
        </span>
        <span style={{ flex: 1, textAlign: "left", fontWeight: roster.is_user ? 700 : 500, fontSize: 13 }}>
          {roster.display_name}
        </span>
        <ArchetypeBadge archetype={roster.archetype} />
        <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
          <PctBar label="Power" value={roster.power_pct} />
          <PctBar label="Window" value={roster.window_core_pct} />
          <PctBar label="Draft" value={roster.draft_pct} />
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && <CoreAssetsRow roster={roster} />}
    </div>
  );
}

// ─── League Card ───

function LeagueCard({ league }: { league: LeaguePowerRanking }) {
  const [expanded, setExpanded] = useState(false);
  const userRoster = league.rosters.find((r) => r.is_user);

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 20px",
          background: "none",
          border: "none",
          color: "var(--text)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{league.league_name}</div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {league.rosters.length} teams · {league.mode.toUpperCase()}
          </span>
        </div>
        {userRoster && <ArchetypeBadge archetype={userRoster.archetype} />}
        {userRoster && (
          <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
            <PctBar label="Power" value={userRoster.power_pct} />
            <PctBar label="Window" value={userRoster.window_core_pct} />
            <PctBar label="Draft" value={userRoster.draft_pct} />
          </div>
        )}
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 16px 16px", display: "grid", gap: 6 }}>
          {league.rosters.map((r, i) => (
            <RosterRow key={r.owner_id ?? i} roster={r} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Summary ───

function SummaryCards({ leagues }: { leagues: LeaguePowerRanking[] }) {
  const userArchetypes = leagues
    .map((l) => l.rosters.find((r) => r.is_user)?.archetype)
    .filter(Boolean) as string[];

  const juggernauts = userArchetypes.filter((a) => a === "Dynasty Juggernaut").length;
  const deadZones = userArchetypes.filter((a) => a === "Dead Zone").length;

  // Most common archetype
  const counts: Record<string, number> = {};
  for (const a of userArchetypes) counts[a] = (counts[a] ?? 0) + 1;
  const mostCommon =
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return (
    <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
      <StatCard label="Leagues Analyzed" value={leagues.length} />
      <StatCard label="Juggernauts" value={juggernauts} accent="var(--amber)" />
      <StatCard label="Dead Zones" value={deadZones} accent="var(--red)" />
      <StatCard label="Most Common" value={mostCommon} accent="var(--blue)" />
    </div>
  );
}

// ─── Page ───

export default function PowerRankings() {
  const { username } = useParams<{ username: string }>();
  const { data, isLoading, error } = usePowerRankings(username ?? "");

  const leagues = useMemo(() => data ?? [], [data]);

  if (isLoading) return <AppShell><LoadingSkeleton /></AppShell>;

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Power Rankings</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Value-weighted windows and team archetypes across all leagues
        </p>
      </div>

      {error ? (
        <ErrorCard message={(error as Error).message} />
      ) : leagues.length === 0 ? (
        <ErrorCard message="No league data found" />
      ) : (
        <>
          <SummaryCards leagues={leagues} />
          <div style={{ margin: "24px 0 12px", fontSize: 13, color: "var(--text-dim)" }}>
            {leagues.length} league{leagues.length !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {leagues.map((l) => (
              <LeagueCard key={l.league_id} league={l} />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

// ─── Shared ───

const skel = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
} as const;

function LoadingSkeleton() {
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Power Rankings</h1>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse" style={{ ...skel, flex: 1, minWidth: 120, height: 90 }} />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse" style={{ ...skel, height: 80, marginTop: 12 }} />
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
