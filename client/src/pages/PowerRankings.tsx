import { useState, useMemo } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { StatCard } from "../components/ui";
import { PlayerLink } from "../components/ui";
import SourceBadge from "../components/SourceBadge";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import { posColor } from "../lib/position-colors";
import FreshnessBar from "../components/FreshnessBar";
import ShareButton from "../components/ShareButton";
import {
  usePowerRankings,
  type LeaguePowerRanking,
  type RosterRanking,
  type CoreAsset,
  type SlottedPlayer,
  type SlotGrade,
  type ScoredPick,
} from "../hooks/use-power-rankings";

// ─── Helpers ───

function valueSources(league: LeaguePowerRanking): string {
  const user = league.rosters.find((r) => r.is_user);
  const avg = user?.avg_sources_available ?? 0;
  if (avg >= 2.5) return "FC + KTC + FP";
  if (avg >= 1.5) return "FC + partial";
  return "FC only";
}

const ZONE_COLORS: Record<string, string> = {
  Prime: "#f59e0b", Ascent: "#22c55e", Decline: "#f97316", Cliff: "#ef4444", Unknown: "#94a3b8",
};

function AgeLabel({ asset }: { asset: CoreAsset }) {
  const ac = asset.age_curve;
  if (ac.age == null) return <span style={{ fontSize: 10, color: "#94a3b8" }}>Age ?</span>;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: ZONE_COLORS[ac.zone] ?? "#94a3b8", whiteSpace: "nowrap" }}>
      {ac.age} · {ac.zone}
    </span>
  );
}

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
      style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}
    >
      {archetype}
    </span>
  );
}

// ─── Pct Bar ───

function PctBar({ label, value }: { label: string; value: number }) {
  const w = Math.max(2, Math.min(100, value));
  const color = value > 70 ? "var(--green)" : value > 40 ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ flex: 1, minWidth: 70 }}>
      <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ background: "var(--dark-base)", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <div className="font-mono" style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>{Math.round(value)}%</div>
    </div>
  );
}

// ─── Slot Grade Colors ───

const GRADE_COLORS: Record<string, string> = {
  elite: "#f59e0b", strong: "#22c55e", average: "#eab308", weak: "#f97316", hole: "#ef4444",
};

function SlotGradeBar({ grades }: { grades: SlotGrade[] }) {
  if (grades.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
      {grades.map((g) => (
        <span key={g.slot_label} style={{ fontSize: 11, fontWeight: 700 }}>
          <span style={{ color: "var(--text-muted)" }}>{g.slot_label}: </span>
          <span style={{ color: GRADE_COLORS[g.grade] ?? "var(--text-dim)", textTransform: "capitalize" }}>{g.grade}</span>
        </span>
      ))}
    </div>
  );
}

function slotColor(score: number): string {
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#eab308";
  return "#ef4444";
}

function formatPickLabel(pk: ScoredPick): string {
  if (pk.pick_slot != null) {
    return `${pk.round}.${String(pk.pick_slot).padStart(2, "0")}`;
  }
  return pk.label;
}

function PlayerRow({ p, slotLabel }: { p: SlottedPlayer | CoreAsset; slotLabel?: string }) {
  const label = slotLabel ?? ("slot_label" in p ? (p as SlottedPlayer).slot : p.position);
  const labelColor = slotLabel ? posColor(p.position) : slotColor(p.edge_score);
  const opacity = p.sources_available === 0 ? 0.4 : 1;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, opacity }}>
      <span style={{ color: labelColor, fontWeight: 700, fontSize: 10, width: 36, textAlign: "right" }}>
        {label}
      </span>
      <PlayerLink name={p.full_name} style={{ flex: 1, fontWeight: 500, fontSize: 12 }} />
      <EdgeScoreBadge score={p.edge_score} size="sm" />
      <SourceBadge
        fc_score={p.fc_score} ktc_score={p.ktc_score} dp_score={p.dp_score}
        sources_available={p.sources_available} source_agreement={p.source_agreement}
      />
      <AgeLabel asset={p} />
    </div>
  );
}

// ─── Expanded Roster View ───

function rosterTextSummary(roster: RosterRanking): string {
  const lines = [`[The Edge] ${roster.display_name} - ${roster.archetype}`];
  lines.push(`Avg Starter Edge: ${Math.round(roster.avg_starter_score)} | Power: ${Math.round(roster.power_pct)}%`);
  const starters = roster.lineup?.starters ?? [];
  if (starters.length > 0) {
    lines.push("Starters: " + starters.map((s) => `${s.slot} ${s.full_name} (${Math.round(s.edge_score)})`).join(", "));
  }
  return lines.join("\n");
}

function ExpandedRosterView({ roster }: { roster: RosterRanking }) {
  const [showBench, setShowBench] = useState(false);
  const picks = roster.draft_picks ?? [];
  const lineup = roster.lineup;
  const starters = lineup?.starters ?? [];
  const bench = lineup?.bench ?? [];
  const grades = lineup?.slot_grades ?? [];

  return (
    <div style={{ background: "var(--dark-base)", borderRadius: 8, padding: "12px 16px", marginTop: 8 }}>
      {/* Slot Grades */}
      <SlotGradeBar grades={grades} />

      {/* Starters */}
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>
        STARTERS ({starters.length})
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {starters.map((p) => (
          <div
            key={p.player_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              opacity: p.sources_available === 0 ? 0.4 : 1,
            }}
          >
            <span style={{ color: slotColor(p.edge_score), fontWeight: 700, fontSize: 10, width: 36, textAlign: "right" }}>
              {p.slot}
            </span>
            <PlayerLink name={p.full_name} style={{ flex: 1, fontWeight: 500, fontSize: 12 }} />
            <EdgeScoreBadge score={p.edge_score} size="sm" />
            <SourceBadge
              fc_score={p.fc_score} ktc_score={p.ktc_score} dp_score={p.dp_score}
              sources_available={p.sources_available} source_agreement={p.source_agreement}
            />
            <AgeLabel asset={p} />
          </div>
        ))}
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <>
          <button
            onClick={() => setShowBench(!showBench)}
            style={{
              display: "block", width: "100%", marginTop: 12, padding: "6px 0",
              background: "none", border: "1px solid var(--border)", borderRadius: 6,
              color: "var(--text-muted)", fontSize: 11, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {showBench ? "Hide bench" : `Bench (${bench.length} players)`}
          </button>
          {showBench && (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {bench.map((p) => (
                <PlayerRow key={p.player_id} p={p} slotLabel={p.position} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Draft Capital */}
      {picks.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 14, marginBottom: 8, fontWeight: 600 }}>
            DRAFT CAPITAL
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {picks.map((pk, i) => {
              const src = [pk.ktc_score, pk.dp_score].filter((s): s is number => s != null).length;
              const spread = pk.ktc_score != null && pk.dp_score != null ? Math.abs(pk.ktc_score - pk.dp_score) : 0;
              const agr = spread < 5 ? "high" : spread <= 12 ? "medium" : "low" as const;
              return (
                <div key={`${pk.season}_${pk.round}_${pk.original_owner_id}_${i}`}
                  style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                  <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 10, width: 36, textAlign: "right" }}>PICK</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{formatPickLabel(pk)}</span>
                  <EdgeScoreBadge score={pk.edge_score} size="sm" />
                  <SourceBadge fc_score={null} ktc_score={pk.ktc_score} dp_score={pk.dp_score}
                    sources_available={src} source_agreement={agr} maxSources={2} />
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: 12, textAlign: "right" }}>
        <ShareButton textSummary={rosterTextSummary(roster)} />
      </div>
    </div>
  );
}

// ─── Roster Row ───

function RosterRow({ roster, rank }: { roster: RosterRanking; rank: number }) {
  const [open, setOpen] = useState(false);
  const border = roster.is_user ? "2px solid var(--amber)" : "1px solid var(--border)";
  const btnStyle = { width: "100%", display: "flex" as const, alignItems: "center" as const, gap: 12,
    padding: "10px 14px", background: "none", border: "none", color: "var(--text)", cursor: "pointer" as const, fontFamily: "inherit" };
  return (
    <div style={{ border, borderRadius: 8, background: "var(--card)" }}>
      <button onClick={() => setOpen(!open)} style={btnStyle}>
        <span className="font-mono" style={{ width: 24, fontSize: 12, color: "var(--text-muted)" }}>
          #{rank}
        </span>
        <EdgeScoreBadge score={roster.avg_starter_score} size="md" />
        <span style={{ flex: 1, textAlign: "left", fontWeight: roster.is_user ? 700 : 500, fontSize: 13 }}>
          {roster.display_name}
        </span>
        {roster.draft_picks?.length > 0 && (
          <span
            className="font-mono"
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "2px 6px",
              whiteSpace: "nowrap",
            }}
          >
            {roster.draft_picks.length} picks
          </span>
        )}
        <ArchetypeBadge archetype={roster.archetype} />
        <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
          <PctBar label="Power" value={roster.power_pct} />
          <PctBar label="Window" value={roster.window_core_raw} />
          <PctBar label="Draft" value={roster.draft_pct} />
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
          {open ? "\u25B2" : "\u25BC"}
        </span>
      </button>
      {open && <ExpandedRosterView roster={roster} />}
    </div>
  );
}

// ─── League Card ───

function LeagueCard({ league }: { league: LeaguePowerRanking }) {
  const [expanded, setExpanded] = useState(false);
  const userRoster = league.rosters.find((r) => r.is_user);

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "14px 20px", background: "none", border: "none",
          color: "var(--text)", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{league.league_name}</div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {league.rosters.length} teams · {league.mode.toUpperCase()} · Values: {valueSources(league)}
            {league.scoring_label && (
              <>
                {" "}·{" "}
                <span style={{ color: "var(--amber)", fontWeight: 600 }}>{league.scoring_label}</span>
              </>
            )}
          </span>
        </div>
        {userRoster && <EdgeScoreBadge score={userRoster.avg_starter_score} size="md" />}
        {userRoster && <ArchetypeBadge archetype={userRoster.archetype} />}
        {userRoster && (
          <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
            <PctBar label="Power" value={userRoster.power_pct} />
            <PctBar label="Window" value={userRoster.window_core_raw} />
            <PctBar label="Draft" value={userRoster.draft_pct} />
          </div>
        )}
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
          {expanded ? "\u25B2" : "\u25BC"}
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
  const archs = leagues.map((l) => l.rosters.find((r) => r.is_user)?.archetype).filter(Boolean) as string[];
  const counts: Record<string, number> = {};
  for (const a of archs) counts[a] = (counts[a] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "\u2014";
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
      <StatCard label="Leagues Analyzed" value={leagues.length} />
      <StatCard label="Juggernauts" value={counts["Dynasty Juggernaut"] ?? 0} accent="var(--amber)" />
      <StatCard label="Dead Zones" value={counts["Dead Zone"] ?? 0} accent="var(--red)" />
      <StatCard label="Most Common" value={top} accent="var(--blue)" />
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
          Edge Score dynasty ratings across all leagues (39-99 scale)
        </p>
        <FreshnessBar />
      </div>

      {error ? (
        <ErrorCard message={(error as Error).message} />
      ) : leagues.length === 0 ? (
        <div style={{ ...skel, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          No dynasty leagues found for this user. Make sure your Sleeper username is correct.
        </div>
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

const skel = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10 } as const;

function LoadingSkeleton() {
  return (
    <>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Power Rankings</h1>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {[1, 2, 3, 4].map((i) => <div key={i} className="animate-pulse" style={{ ...skel, flex: 1, minWidth: 120, height: 90 }} />)}
      </div>
      {[1, 2, 3].map((i) => <div key={i} className="animate-pulse" style={{ ...skel, height: 80, marginTop: 12 }} />)}
    </>
  );
}

function ErrorCard({ message }: { message: string }) {
  return <div style={{ ...skel, padding: 40, textAlign: "center", color: "var(--red)" }}>Error: {message}</div>;
}
