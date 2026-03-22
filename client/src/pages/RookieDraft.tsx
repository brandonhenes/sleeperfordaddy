import { useState, useMemo } from "react";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import { useProspects, type Prospect } from "../hooks/use-market";
import { useRookieDraftContext, type DraftPickContext, type AggregateNeed, type PickValueReference } from "../hooks/use-rookie-draft";
import { usePowerRankings, type LeaguePowerRanking } from "../hooks/use-power-rankings";
import { useMockDraftSetup, type MockDraftSetup, type MockDraftProspect, type MockDraftPick } from "../hooks/use-mock-draft";
import { useActiveDrafts, useLiveDraft, type LiveDraftState, type ActiveDraftSummary } from "../hooks/use-live-draft";
import { useHitRates, useRookieADP, type HitRateData, type LeagueADP } from "../hooks/use-draft-data";
import { useLatestProspectRankings, type ProspectRanking } from "../hooks/use-prospect-rankings";
import { PlayerLink } from "../components/ui";
import { posColor } from "../lib/position-colors";

const TIER_ORDER = ["elite", "day1", "day2", "day3", "flier"] as const;
type TierKey = (typeof TIER_ORDER)[number];

const TIER_CONFIG: Record<string, {
  bg: string;
  text: string;
  label: string;
  border: string;
  headerBg: string;
}> = {
  elite: { bg: "rgba(245,158,11,0.08)", text: "var(--amber)", label: "ELITE", border: "rgba(245,158,11,0.3)", headerBg: "rgba(245,158,11,0.12)" },
  ELITE: { bg: "rgba(245,158,11,0.08)", text: "var(--amber)", label: "ELITE", border: "rgba(245,158,11,0.3)", headerBg: "rgba(245,158,11,0.12)" },
  day1: { bg: "rgba(96,165,250,0.08)", text: "var(--blue)", label: "DAY 1", border: "rgba(96,165,250,0.3)", headerBg: "rgba(96,165,250,0.12)" },
  DAY1: { bg: "rgba(96,165,250,0.08)", text: "var(--blue)", label: "DAY 1", border: "rgba(96,165,250,0.3)", headerBg: "rgba(96,165,250,0.12)" },
  day2: { bg: "rgba(74,222,128,0.08)", text: "var(--green)", label: "DAY 2", border: "rgba(74,222,128,0.3)", headerBg: "rgba(74,222,128,0.12)" },
  DAY2: { bg: "rgba(74,222,128,0.08)", text: "var(--green)", label: "DAY 2", border: "rgba(74,222,128,0.3)", headerBg: "rgba(74,222,128,0.12)" },
  day3: { bg: "rgba(148,163,184,0.08)", text: "var(--text-dim)", label: "DAY 3", border: "rgba(148,163,184,0.3)", headerBg: "rgba(148,163,184,0.12)" },
  DAY3: { bg: "rgba(148,163,184,0.08)", text: "var(--text-dim)", label: "DAY 3", border: "rgba(148,163,184,0.3)", headerBg: "rgba(148,163,184,0.12)" },
  flier: { bg: "rgba(107,114,128,0.06)", text: "var(--text-muted)", label: "FLIER", border: "rgba(107,114,128,0.2)", headerBg: "rgba(107,114,128,0.08)" },
};

const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE"] as const;
const WATCHLIST_KEY = "edge-draft-watchlist";
const MYBOARD_KEY = "edge-draft-myboard";

interface MyBoardState {
  [prospectName: string]: string;
}

function cleanText(val: string | null | undefined): string | null {
  if (val == null) return null;
  const t = val.trim();
  if (!t || t.toLowerCase() === "null") return null;
  return t;
}

function scoutingReport(p: Prospect): string | null {
  return cleanText(p.scouting_notes) ?? cleanText(p.fp_scouting_notes) ?? cleanText(p.notes);
}

function formatMarketNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return "-";
  return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
}

function loadWatchlist(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    // ignore
  }
  return new Set();
}

function loadMyBoard(): MyBoardState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MYBOARD_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

export default function RookieDraft() {
  const { data, isLoading, error } = useProspects();
  const username = typeof window !== "undefined" ? localStorage.getItem("edge_username") ?? "" : "";
  const { data: draftCtx } = useRookieDraftContext(username);
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"board" | "positional" | "compare" | "myboard" | "mock" | "live" | "analytics">("board");
  const [compareList, setCompareList] = useState<string[]>([]);
  const [watchlist, setWatchlist] = useState<Set<string>>(loadWatchlist);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [myBoard, setMyBoard] = useState<MyBoardState>(loadMyBoard);
  const [mockLeagueId, setMockLeagueId] = useState<string>("");
  const [mockPicks, setMockPicks] = useState<MockDraftPick[]>([]);
  const [mockStarted, setMockStarted] = useState(false);
  const [liveDraftId, setLiveDraftId] = useState<string | null>(null);
  const [liveLeagueId, setLiveLeagueId] = useState<string | null>(null);
  const { data: leagues } = usePowerRankings(username);
  const { data: mockSetup } = useMockDraftSetup(username, mockLeagueId);
  const { data: activeDrafts } = useActiveDrafts(username);
  const { data: liveDraftState } = useLiveDraft(username, liveDraftId, liveLeagueId);
  const { data: hitRates } = useHitRates();
  const { data: rookieADP } = useRookieADP("2026");
  const { data: prospectRankings } = useLatestProspectRankings();

  function toggleCompare(name: string) {
    setCompareList((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  }

  function toggleWatch(name: string) {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function setPlayerTier(name: string, tier: string) {
    setMyBoard((prev) => {
      const next = { ...prev, [name]: tier };
      localStorage.setItem(MYBOARD_KEY, JSON.stringify(next));
      return next;
    });
  }

  function removeFromBoard(name: string) {
    setMyBoard((prev) => {
      const next = { ...prev };
      delete next[name];
      localStorage.setItem(MYBOARD_KEY, JSON.stringify(next));
      return next;
    });
  }

  function exportMyBoard() {
    const assigned = new Map<TierKey, Prospect[]>();
    for (const t of TIER_ORDER) assigned.set(t, []);
    for (const p of data ?? []) {
      const t = myBoard[p.player_name];
      if (t && assigned.has(t as TierKey)) {
        assigned.get(t as TierKey)!.push(p);
      }
    }
    const lines: string[] = ["THE EDGE - MY ROOKIE BOARD"];
    for (const tier of TIER_ORDER) {
      const players = assigned.get(tier) ?? [];
      lines.push("");
      lines.push(`${TIER_CONFIG[tier].label}:`);
      if (players.length === 0) lines.push("- (none)");
      else players.forEach((p) => lines.push(`- ${p.player_name} (${p.position ?? "-"})`));
    }
    void navigator.clipboard?.writeText(lines.join("\n"));
  }

  function startMockDraft() {
    if (!mockSetup) return;
    setMockPicks([]);
    setMockStarted(true);
    runSimUntilUserPick([]);
  }

  function runSimUntilUserPick(currentPicks: MockDraftPick[]) {
    if (!mockSetup) return;

    const totalPicks = mockSetup.total_rosters * mockSetup.draft_rounds;
    const pickedPlayers = currentPicks
      .filter((p) => p.selected_player)
      .map((p) => p.selected_player!);
    const newPicks = [...currentPicks];
    let nextPick = newPicks.length + 1;

    while (nextPick <= totalPicks) {
      const round = Math.ceil(nextPick / mockSetup.total_rosters);
      const pickInRound = ((nextPick - 1) % mockSetup.total_rosters) + 1;
      const teamIndex = pickInRound - 1;
      const team = mockSetup.teams[teamIndex];
      if (!team) break;

      if (team.is_user) {
        newPicks.push({
          pick_number: nextPick,
          round,
          pick_in_round: pickInRound,
          roster_id: team.roster_id,
          display_name: team.display_name,
          is_user: true,
          selected_player: null,
          selected_position: null,
          is_auto: false,
          reasoning: null,
        });
        setMockPicks(newPicks);
        return;
      }

      const available = mockSetup.prospects.filter((p) => !pickedPlayers.includes(p.player_name));
      if (available.length === 0) break;

      const scored = available.map((p) => {
        let score = Math.max(0, 150 - p.overall_rank);
        const need = team.needs.find((n) => n.position === p.position);
        if (need) {
          score += need.urgency * 2;
          if (need.grade === "hole") score += 50;
          else if (need.grade === "weak") score += 25;
        }
        if (p.tier === "elite") score += 60;
        else if (p.tier === "day1") score += 30;
        if (mockSetup.league_mode === "sf" && p.position === "QB") score += 20;
        return { prospect: p, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const pick = scored[0];
      const need = team.needs.find((n) => n.position === pick.prospect.position);

      newPicks.push({
        pick_number: nextPick,
        round,
        pick_in_round: pickInRound,
        roster_id: team.roster_id,
        display_name: team.display_name,
        is_user: false,
        selected_player: pick.prospect.player_name,
        selected_position: pick.prospect.position,
        is_auto: true,
        reasoning: need && (need.grade === "hole" || need.grade === "weak")
          ? `Fills ${pick.prospect.position} need`
          : "Best available",
      });
      pickedPlayers.push(pick.prospect.player_name);
      nextPick++;
    }

    setMockPicks(newPicks);
  }

  function makeUserPick(playerName: string) {
    if (!mockSetup) return;
    const updated = mockPicks.map((p) => {
      if (p.is_user && !p.selected_player) {
        const prospect = mockSetup.prospects.find((pr) => pr.player_name === playerName);
        return {
          ...p,
          selected_player: playerName,
          selected_position: prospect?.position ?? null,
          reasoning: "Your pick",
        };
      }
      return p;
    });
    setMockPicks(updated);
    setTimeout(() => runSimUntilUserPick(updated), 300);
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = posFilter === "ALL" ? data : data.filter((p) => p.position === posFilter);
    if (showWatchlistOnly) {
      list = list.filter((p) => watchlist.has(p.player_name));
    }
    return list;
  }, [data, posFilter, showWatchlistOnly, watchlist]);

  const byTier = useMemo(() => {
    const groups: Record<string, Prospect[]> = {};
    for (const tier of TIER_ORDER) groups[tier] = [];
    for (const p of filtered) {
      const t = (p.tier ?? "flier").toLowerCase();
      const bucket = TIER_ORDER.includes(t as TierKey) ? t : "flier";
      groups[bucket].push(p);
    }
    return groups;
  }, [filtered]);

  const byPosition = useMemo(() => {
    const groups: Record<string, Prospect[]> = { QB: [], RB: [], WR: [], TE: [] };
    for (const p of data ?? []) {
      if (p.position && groups[p.position]) {
        groups[p.position].push(p);
      }
    }
    return groups;
  }, [data]);

  const compareProspects = useMemo(() => {
    if (!data) return [];
    return compareList
      .map((name) => data.find((p) => p.player_name === name))
      .filter((p): p is Prospect => !!p);
  }, [data, compareList]);

  const rankingsMap = useMemo(() => {
    const map = new Map<string, ProspectRanking>();
    for (const r of prospectRankings ?? []) {
      if (!r.player_name) continue;
      map.set(r.player_name.toLowerCase(), r);
    }
    return map;
  }, [prospectRankings]);

  const overallRanks = useMemo(() => {
    const ranks = new Map<string, number>();
    let rank = 1;
    for (const tier of TIER_ORDER) {
      const group = byTier[tier] ?? [];
      const sorted = [...group].sort(
        (a, b) => (a.fp_rank ?? a.fantasypros_rank ?? 999) - (b.fp_rank ?? b.fantasypros_rank ?? 999)
      );
      for (const p of sorted) {
        ranks.set(p.player_name, rank++);
      }
    }
    return ranks;
  }, [byTier]);

  const disagreements = useMemo(() => {
    if (!data) return [];
    const disagreements = data.filter((p) => p.disagreement_flag != null);
    const sleepers = disagreements.filter((p) => p.disagreement_flag === "SLEEPER");
    const fading = disagreements.filter((p) => p.disagreement_flag === "FADING");
    return [...sleepers, ...fading];
  }, [data]);
  const sleeperDisagreements = disagreements.filter((p) => p.disagreement_flag === "SLEEPER");
  const fadingDisagreements = disagreements.filter((p) => p.disagreement_flag === "FADING");

  if (isLoading) return <AppShell><div className="animate-pulse" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, height: 400, marginTop: 28 }} /></AppShell>;
  if (error) return <AppShell><div style={{ padding: "28px 0", color: "var(--red)" }}>Error loading prospects</div></AppShell>;
  if (!data || data.length === 0) return <AppShell><div style={{ padding: "28px 0", color: "var(--text-muted)" }}>No prospect data available</div></AppShell>;

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>2026 Rookie Draft Hub</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          {data.length} prospects scouted across {TIER_ORDER.length} tiers
        </p>
        <FreshnessBar />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", marginRight: 12 }}>
          {([
            { key: "board" as const, label: "Big Board" },
            { key: "positional" as const, label: "By Position" },
            { key: "myboard" as const, label: "My Board" },
            { key: "mock" as const, label: "Mock Draft" },
            { key: "live" as const, label: "Live" },
            { key: "analytics" as const, label: "Analytics" },
          ]).map((m) => (
            <button
              key={m.key}
              onClick={() => setViewMode(m.key)}
              style={{
                background: viewMode === m.key ? "var(--amber)" : "var(--card)",
                color: viewMode === m.key ? "var(--dark-base)" : "var(--text-muted)",
                border: "none",
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {(viewMode === "board" || viewMode === "positional") && (
          <>
            {viewMode === "board" && POS_FILTERS.map((pos) => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                style={{
                  background: posFilter === pos ? "var(--amber)" : "var(--card)",
                  color: posFilter === pos ? "var(--dark-base)" : "var(--text-dim)",
                  border: `1px solid ${posFilter === pos ? "var(--amber)" : "var(--border)"}`,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: 0.5,
                }}
              >
                {pos}
              </button>
            ))}
            <button
              onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
              style={{
                background: showWatchlistOnly ? "#f59e0b" : "var(--card)",
                color: showWatchlistOnly ? "var(--dark-base)" : "var(--text-dim)",
                border: `1px solid ${showWatchlistOnly ? "#f59e0b" : "var(--border)"}`,
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                marginLeft: 8,
              }}
            >
              {"\u2605"} Watchlist ({watchlist.size})
            </button>
          </>
        )}
      </div>

      {viewMode === "board" && disagreements.length > 0 && (
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 10, padding: "14px 18px", marginTop: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 10 }}>
            RANKING DISAGREEMENTS ({disagreements.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {[
              { title: "SLEEPER", arrow: "↑", color: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", items: sleeperDisagreements, label: "PFF/market data suggests undervalued" },
              { title: "FADING", arrow: "↓", color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", items: fadingDisagreements, label: "PFF/market data suggests overvalued" },
            ].filter((section) => section.items.length > 0).map((section) => (
              <div key={section.title} style={{ background: "var(--dark-base)", border: `1px solid ${section.border}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: section.color, fontSize: 11, fontWeight: 700 }}>
                  <span>{section.arrow}</span>
                  <span>{section.title}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {section.items.map((prospect) => (
                    <div key={prospect.player_name} style={{ background: section.bg, border: `1px solid ${section.border}`, borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{prospect.player_name}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
                        {(TIER_CONFIG[prospect.tier ?? "flier"]?.label ?? (prospect.tier ?? "FLIER")).toUpperCase()} tier
                      </div>
                      <div style={{ fontSize: 10, color: section.color, marginTop: 2, lineHeight: 1.4 }}>
                        {prospect.player_name} -- {section.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!username && (
        <div style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "12px 18px",
          marginTop: 16,
          fontSize: 12,
          color: "var(--text-muted)",
        }}>
          Enter your Sleeper username on the Dashboard to see which picks you own and
          get personalized draft recommendations.
        </div>
      )}

      {draftCtx && draftCtx.picks_2026.length > 0 && (
        <div style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "16px 20px",
          marginTop: 16,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Your 2026 Picks</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
                {draftCtx.picks_2026.length} pick{draftCtx.picks_2026.length !== 1 ? "s" : ""} across {draftCtx.total_leagues} leagues
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {draftCtx.aggregate_needs.filter((n: AggregateNeed) => n.overall_urgency !== "low").map((n: AggregateNeed) => (
                <span
                  key={n.position}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: n.overall_urgency === "critical" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                    color: n.overall_urgency === "critical" ? "var(--red)" : "var(--amber)",
                    border: `1px solid ${n.overall_urgency === "critical" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
                  }}
                >
                  {n.position}: {n.overall_urgency === "critical" ? "NEED" : "WANT"}
                  {n.leagues_with_hole > 0 && ` (${n.leagues_with_hole} holes)`}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {draftCtx.picks_2026.map((pick: DraftPickContext, i: number) => (
              <PickCard key={`${pick.league_id}-${pick.round}-${pick.tier}-${i}`} pick={pick} />
            ))}
          </div>
        </div>
      )}

      {viewMode === "board" && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 20 }}>
          {TIER_ORDER.map((tier) => {
            const prospects = byTier[tier];
            if (!prospects || prospects.length === 0) return null;
            const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.flier;

            return (
              <div key={tier} style={{ border: `1px solid ${cfg.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{
                  background: cfg.headerBg,
                  padding: "10px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderBottom: `1px solid ${cfg.border}`,
                }}>
                  <span style={{
                    padding: "3px 10px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 1,
                    background: cfg.bg,
                    color: cfg.text,
                    border: `1px solid ${cfg.border}`,
                  }}>
                    {cfg.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {prospects.length} prospect{prospects.length !== 1 ? "s" : ""}
                  </span>
                  {draftCtx && renderTierPickValueOverlay(tier, draftCtx.pick_values, draftCtx.picks_2026)}
                </div>

                <div style={{ background: cfg.bg }}>
                  {prospects.map((p) => (
                    <ProspectCard
                      key={p.player_name}
                      prospect={p}
                      overallRank={overallRanks.get(p.player_name) ?? 0}
                      tierColor={cfg.text}
                      isComparing={compareList.includes(p.player_name)}
                      onToggleCompare={() => toggleCompare(p.player_name)}
                      isWatched={watchlist.has(p.player_name)}
                      onToggleWatch={() => toggleWatch(p.player_name)}
                      ranking={rankingsMap.get(p.player_name.toLowerCase())}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "positional" && (
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {(["QB", "RB", "WR", "TE"] as const).map((pos) => {
            const prospects = byPosition[pos] ?? [];
            if (prospects.length === 0) return null;
            return (
              <div key={pos} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: posColor(pos) }}>{pos}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{prospects.length} prospects</span>
                </div>
                {prospects.map((p, i) => (
                  <div key={p.player_name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                    <span className="font-mono" style={{ width: 24, fontWeight: 700, color: "var(--text-muted)", textAlign: "center" }}>
                      {p.fp_rank ?? p.fantasypros_rank ?? i + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <PlayerLink name={p.player_name} style={{ fontSize: 13 }} />
                      {p.school && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{p.school}</span>}
                    </div>
                    <TierBadge tier={p.tier} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "compare" && compareProspects.length >= 2 && (
        <CompareView prospects={compareProspects} onBack={() => setViewMode("board")} />
      )}

      {viewMode === "myboard" && (
        <MyBoardView
          prospects={data ?? []}
          myBoard={myBoard}
          onSetTier={setPlayerTier}
          onRemove={removeFromBoard}
          onExport={exportMyBoard}
        />
      )}

      {viewMode === "mock" && (
        <MockDraftView
          leagues={leagues}
          mockLeagueId={mockLeagueId}
          setMockLeagueId={(id) => {
            setMockLeagueId(id);
            setMockStarted(false);
            setMockPicks([]);
          }}
          mockSetup={mockSetup}
          mockStarted={mockStarted}
          onStart={startMockDraft}
          mockPicks={mockPicks}
          onUserPick={makeUserPick}
          prospects={mockSetup?.prospects}
        />
      )}

      {viewMode === "live" && (
        <LiveDraftView
          activeDrafts={activeDrafts}
          liveDraftState={liveDraftState}
          onSelectDraft={(draftId, leagueId) => {
            setLiveDraftId(draftId);
            setLiveLeagueId(leagueId);
          }}
        />
      )}

      {viewMode === "analytics" && (
        <AnalyticsView hitRates={hitRates} rookieADP={rookieADP} />
      )}

      {compareList.length >= 2 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: "var(--card)", borderTop: "2px solid var(--amber)",
          padding: "12px 24px", display: "flex", alignItems: "center",
          justifyContent: "center", gap: 16, zIndex: 100,
        }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {compareList.length} selected
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {compareList.map((name) => (
              <span key={name} style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 12,
                background: "var(--dark-base)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {name}
                <button onClick={() => toggleCompare(name)} style={{
                  background: "none", border: "none", color: "var(--red)",
                  cursor: "pointer", fontSize: 10, fontWeight: 800, padding: 0,
                }}>{"\u2715"}</button>
              </span>
            ))}
          </div>
          <button
            onClick={() => setViewMode("compare")}
            style={{
              background: "var(--amber)", color: "var(--dark-base)",
              border: "none", borderRadius: 8, padding: "8px 20px",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Compare
          </button>
          <button
            onClick={() => setCompareList([])}
            style={{
              background: "none", border: "1px solid var(--border)",
              borderRadius: 8, padding: "8px 16px", fontSize: 12,
              color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Clear
          </button>
        </div>
      )}
    </AppShell>
  );
}

function renderTierPickValueOverlay(
  tier: string,
  pickValues: PickValueReference[],
  userPicks2026: DraftPickContext[]
) {
  const tierPickMap: Record<string, { round: number; tier: string }[]> = {
    elite: [{ round: 1, tier: "early" }],
    day1: [{ round: 1, tier: "mid" }, { round: 1, tier: "late" }],
    day2: [{ round: 2, tier: "early" }, { round: 2, tier: "mid" }],
    day3: [{ round: 2, tier: "late" }, { round: 3, tier: "early" }],
    flier: [{ round: 3, tier: "mid" }, { round: 3, tier: "late" }],
  };

  const pickRefs = tierPickMap[tier] ?? [];
  const values = pickRefs
    .map((ref) => pickValues.find(
      (pv: PickValueReference) => pv.season === 2026 && pv.round === ref.round && pv.tier === ref.tier
    ))
    .filter((v): v is PickValueReference => !!v);

  if (values.length === 0) return null;

  const minVal = Math.min(...values.map((v) => v.ktc_sf));
  const maxVal = Math.max(...values.map((v) => v.ktc_sf));
  const valStr = minVal === maxVal
    ? `~${minVal.toLocaleString()} KTC`
    : `${minVal.toLocaleString()} - ${maxVal.toLocaleString()} KTC`;

  const userPicksHere = userPicks2026.filter((p) =>
    pickRefs.some((ref) => p.round === ref.round && p.tier === ref.tier)
  );

  return (
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
      <span className="font-mono" style={{ color: "var(--text-dim)" }}>
        Pick value: {valStr}
      </span>
      {userPicksHere.length > 0 && (
        <span style={{
          background: "var(--amber)",
          color: "var(--dark-base)",
          padding: "2px 8px",
          borderRadius: 4,
          fontWeight: 700,
          fontSize: 10,
        }}>
          YOU PICK HERE ({userPicksHere.length})
        </span>
      )}
    </div>
  );
}

function PickCard({ pick }: { pick: DraftPickContext }) {
  const [showNeeds, setShowNeeds] = useState(false);
  const tierColors: Record<"early" | "mid" | "late", string> = {
    early: "var(--green)",
    mid: "var(--amber)",
    late: "var(--red)",
  };

  const needsWithUrgency = pick.roster_needs.filter(
    (n) => n.urgency === "A+" || n.urgency === "A"
  );

  return (
    <div
      style={{
        background: "var(--dark-base)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 16px",
        minWidth: 220,
        maxWidth: 280,
        flexShrink: 0,
        cursor: "pointer",
        position: "relative",
      }}
      onClick={() => setShowNeeds(!showNeeds)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 800, color: tierColors[pick.tier] }}>
            {pick.label}
          </span>
        </div>
        {pick.ktc_value != null && (
          <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>
            {pick.ktc_value.toLocaleString()} KTC
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
        {pick.league_name}
        {pick.scoring_label && (
          <span style={{ color: "var(--amber)", marginLeft: 4 }}>
            {pick.scoring_label}
          </span>
        )}
      </div>

      {needsWithUrgency.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {needsWithUrgency.slice(0, 3).map((n) => (
            <span key={n.position} style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 3,
              background: n.urgency === "A+" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
              color: n.urgency === "A+" ? "#fca5a5" : "var(--amber)",
            }}>
              {n.position} {n.urgency}
            </span>
          ))}
        </div>
      )}

      {showNeeds && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 6 }}>
            ROSTER NEEDS
          </div>
          {pick.roster_needs.map((n) => (
            <div key={n.position} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "3px 0",
              fontSize: 11,
            }}>
              <span style={{ fontWeight: 600, color: posColor(n.position) }}>{n.position}</span>
              <NeedGradeBadge grade={n.grade} urgency={n.urgency} />
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <a
          href="/trade-calculator"
          style={{
            fontSize: 10,
            color: "var(--amber)",
            fontWeight: 600,
            textDecoration: "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          Trade this pick →
        </a>
      </div>
    </div>
  );
}

function NeedGradeBadge({ grade, urgency }: { grade: string; urgency: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    "A+": { bg: "rgba(239,68,68,0.15)", text: "#fca5a5" },
    "A": { bg: "rgba(245,158,11,0.15)", text: "var(--amber)" },
    "B": { bg: "rgba(148,163,184,0.1)", text: "var(--text-dim)" },
    "C": { bg: "rgba(34,197,94,0.1)", text: "var(--green)" },
    "D": { bg: "rgba(34,197,94,0.15)", text: "#86efac" },
  };
  const c = colors[urgency] ?? colors.B;
  const labels: Record<string, string> = {
    hole: "HOLE",
    weak: "WEAK",
    average: "OK",
    strong: "GOOD",
    elite: "SET",
  };
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      padding: "2px 6px",
      borderRadius: 3,
      background: c.bg,
      color: c.text,
    }}>
      {labels[grade] ?? grade} ({urgency})
    </span>
  );
}

function ProspectCard({
  prospect: p,
  overallRank,
  tierColor,
  isComparing,
  onToggleCompare,
  isWatched,
  onToggleWatch,
  ranking,
}: {
  prospect: Prospect;
  overallRank: number;
  tierColor: string;
  isComparing: boolean;
  onToggleCompare: () => void;
  isWatched: boolean;
  onToggleWatch: () => void;
  ranking?: ProspectRanking;
}) {
  const [expanded, setExpanded] = useState(false);
  const report = scoutingReport(p);
  const strengths = (p.key_strengths ?? []).map(cleanText).filter((s): s is string => !!s);
  const concerns = (p.key_concerns ?? []).map(cleanText).filter((c): c is string => !!c);

  const primaryComp = cleanText(p.consensus_comp)
    ?? (p.all_comps && p.all_comps.length > 0 ? cleanText(p.all_comps[0].comp) : null);

  const height = cleanText(p.height);
  const weight = cleanText(p.weight);
  const size = height && weight ? `${height} / ${weight}` : height ?? weight ?? null;
  const draftCapital = cleanText(p.draft_capital);
  const tierLabel = cleanText(p.tier ? p.tier.toUpperCase() : null);
  const fpEcrSD = ranking?.fp_ecr_sd ?? null;
  const sdTone: "neutral" | "good" | "warn" | "bad" =
    fpEcrSD == null ? "neutral" : fpEcrSD <= 3 ? "good" : fpEcrSD <= 6 ? "warn" : "bad";

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px", cursor: "pointer" }}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCompare(); }}
          style={{
            width: 22, height: 22, borderRadius: 4, flexShrink: 0,
            border: isComparing ? "2px solid var(--amber)" : "1px solid var(--border)",
            background: isComparing ? "var(--amber)" : "transparent",
            color: isComparing ? "var(--dark-base)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 12, fontWeight: 800,
          }}
        >
          {isComparing ? "\u2713" : ""}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleWatch(); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0,
            color: isWatched ? "#f59e0b" : "var(--text-muted)",
            opacity: isWatched ? 1 : 0.4,
          }}
          title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
        >
          {"\u2605"}
        </button>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: tierColor, flexShrink: 0 }}>
          {overallRank}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <PlayerLink name={p.player_name} style={{ fontSize: 15, fontWeight: 700 }} />
            {p.age != null && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>({p.age})</span>}
            <span style={{ fontWeight: 700, fontSize: 11, color: posColor(p.position ?? "") }}>{p.position}</span>
            {p.school && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.school}</span>}
            {size && <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>{size}</span>}
            {primaryComp && <span style={{ fontSize: 11, fontStyle: "italic", color: "var(--text-dim)" }}>Comp: {primaryComp}</span>}
            {draftCapital && <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--card)", padding: "1px 6px", borderRadius: 3, border: "1px solid var(--border)" }}>{draftCapital}</span>}
            {ranking?.dp_value_sf != null && (
              <span style={{ fontSize: 11, color: "#93c5fd", background: "rgba(59,130,246,0.12)", padding: "1px 6px", borderRadius: 3, border: "1px solid rgba(59,130,246,0.25)" }}>
                DP SF {formatMarketNumber(ranking.dp_value_sf)}
              </span>
            )}
            {ranking?.fp_ecr_sf != null && (
              <span style={{ fontSize: 11, color: "#c4b5fd", background: "rgba(139,92,246,0.12)", padding: "1px 6px", borderRadius: 3, border: "1px solid rgba(139,92,246,0.25)" }}>
                ECR {formatMarketNumber(ranking.fp_ecr_sf)}
              </span>
            )}
            {cleanText(p.landing_spot) && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                background: "rgba(34,197,94,0.12)", color: "var(--green)",
                border: "1px solid rgba(34,197,94,0.25)",
              }}>
                {p.landing_spot}
              </span>
            )}
            <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>
              {expanded ? "\u25B2" : "\u25BC"}
            </span>
          </div>

          {(strengths.length > 0 || concerns.length > 0) && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              {strengths.slice(0, 3).map((s, i) => (
                <span key={`s-${i}`} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(34,197,94,0.12)", color: "#86efac", border: "1px solid rgba(34,197,94,0.25)" }}>
                  {s.length > 50 ? `${s.slice(0, 50)}...` : s}
                </span>
              ))}
              {concerns.slice(0, 2).map((c, i) => (
                <span key={`c-${i}`} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}>
                  {c.length > 50 ? `${c.slice(0, 50)}...` : c}
                </span>
              ))}
              {(strengths.length > 3 || concerns.length > 2) && (
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  +{Math.max(0, strengths.length - 3) + Math.max(0, concerns.length - 2)} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 18px 18px 66px" }}>
          <div style={{ background: "var(--dark-base)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {p.all_comps && p.all_comps.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>PLAYER COMPS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.all_comps.map((c, i) => (
                    <span key={i} style={{ fontSize: 12, background: "var(--card)", border: "1px solid var(--border)", padding: "4px 10px", borderRadius: 6 }}>
                      {cleanText(c.comp) ?? "-"} <span style={{ color: "var(--text-dim)", fontSize: 10 }}>({cleanText(c.source) ?? "?"})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(strengths.length > 0 || concerns.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {strengths.length > 0 && (
                  <div>
                    <div className="label" style={{ color: "#22c55e", marginBottom: 6 }}>KEY STRENGTHS</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {strengths.map((s, i) => (
                        <span key={i} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "rgba(34,197,94,0.16)", color: "#86efac", border: "1px solid rgba(34,197,94,0.35)" }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {concerns.length > 0 && (
                  <div>
                    <div className="label" style={{ color: "#ef4444", marginBottom: 6 }}>KEY CONCERNS</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {concerns.map((c, i) => (
                        <span key={i} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "rgba(239,68,68,0.16)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.35)" }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(p.combine_40 || p.combine_vertical || p.combine_shuttle || p.combine_bench) && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>MEASURABLES</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {p.combine_40 && <MeasurableBar label="40-Yard" value={String(p.combine_40)} unit="s" />}
                  {p.combine_vertical && <MeasurableBar label="Vertical" value={String(p.combine_vertical)} unit={'"'} />}
                  {p.combine_shuttle && <MeasurableBar label="Shuttle" value={String(p.combine_shuttle)} unit="s" />}
                  {p.combine_bench && <MeasurableBar label="Bench" value={String(p.combine_bench)} unit=" reps" />}
                </div>
              </div>
            )}

            {report && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>FULL SCOUTING REPORT</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{report}</div>
              </div>
            )}

            <div>
              <div className="label" style={{ marginBottom: 6 }}>PROFILE</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                <MarketMetric label="Size" value={size ?? "-"} />
                <MarketMetric label="Age" value={p.age != null ? String(p.age) : "-"} />
                <MarketMetric label="Draft Capital" value={draftCapital ?? "-"} />
                <MarketMetric label="Tier" value={tierLabel ?? "-"} />
              </div>
            </div>

            {ranking && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>MARKET DATA</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                  <MarketMetric label="DP SF Value" value={formatMarketNumber(ranking.dp_value_sf)} />
                  <MarketMetric label="DP 1QB Value" value={formatMarketNumber(ranking.dp_value_1qb)} />
                  <MarketMetric label="FP ECR" value={formatMarketNumber(ranking.fp_ecr_sf)} />
                  <MarketMetric
                    label="ECR Range"
                    value={
                      ranking.fp_ecr_best != null && ranking.fp_ecr_worst != null
                        ? `${formatMarketNumber(ranking.fp_ecr_best)}-${formatMarketNumber(ranking.fp_ecr_worst)}`
                        : "-"
                    }
                  />
                  <MarketMetric
                    label="ECR SD"
                    value={formatMarketNumber(ranking.fp_ecr_sd, 1)}
                    tone={sdTone}
                  />
                </div>
              </div>
            )}

            {cleanText(p.landing_spot) && (
              <div style={{
                padding: "8px 14px", background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8,
                fontSize: 13, color: "var(--green)", fontWeight: 600,
              }}>
                Drafted: {p.landing_spot}
              </div>
            )}

            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-dim)", flexWrap: "wrap" }}>
              {cleanText(p.current_adp) && <span>Rookie ADP: <strong style={{ color: "var(--text)" }}>{p.current_adp}</strong></span>}
              {p.total_mentions != null && p.total_mentions > 0 && <span>{p.total_mentions} newsletter mentions</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneStyles: Record<"neutral" | "good" | "warn" | "bad", { color: string; border: string; background: string }> = {
    neutral: { color: "var(--text)", border: "var(--border)", background: "var(--card)" },
    good: { color: "#86efac", border: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.08)" },
    warn: { color: "var(--amber)", border: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)" },
    bad: { color: "#fca5a5", border: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)" },
  };
  const style = toneStyles[tone];

  return (
    <div style={{ border: `1px solid ${style.border}`, borderRadius: 8, padding: "8px 10px", background: style.background }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: style.color }}>
        {value}
      </div>
    </div>
  );
}

function CompareView({
  prospects,
  onBack,
}: {
  prospects: Prospect[];
  onBack: () => void;
}) {
  const fields: { label: string; render: (p: Prospect) => string | null }[] = [
    { label: "Position", render: (p) => cleanText(p.position) },
    { label: "School", render: (p) => cleanText(p.school) },
    { label: "Age", render: (p) => (p.age != null ? String(p.age) : null) },
    { label: "Tier", render: (p) => cleanText((p.tier ?? "").toUpperCase()) },
    { label: "Pos Rank", render: (p) => (p.fp_rank != null ? `${p.position}${p.fp_rank}` : null) },
    {
      label: "Size",
      render: (p) => {
        const h = cleanText(p.height);
        const w = cleanText(p.weight);
        return h && w ? `${h} / ${w}` : h ?? w;
      },
    },
    {
      label: "Comp",
      render: (p) =>
        cleanText(p.consensus_comp) ??
        (p.all_comps?.[0]?.comp ? cleanText(p.all_comps[0].comp) : null),
    },
    { label: "Draft Capital", render: (p) => cleanText(p.draft_capital) },
    {
      label: "40-Yard",
      render: (p) => cleanText(p.combine_40 != null ? String(p.combine_40) : null),
    },
    {
      label: "Vertical",
      render: (p) => cleanText(p.combine_vertical != null ? String(p.combine_vertical) : null),
    },
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "6px 14px",
          fontSize: 12,
          color: "var(--text-muted)",
          cursor: "pointer",
          fontFamily: "inherit",
          marginBottom: 16,
        }}
      >
        ← Back to Board
      </button>

      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `160px repeat(${prospects.length}, 1fr)`,
            borderBottom: "2px solid var(--border)",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              fontWeight: 700,
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            ATTRIBUTE
          </div>
          {prospects.map((p) => (
            <div
              key={p.player_name}
              style={{
                padding: "14px 16px",
                textAlign: "center",
                borderLeft: "1px solid var(--border)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15 }}>{p.player_name}</div>
              <div
                style={{
                  fontSize: 11,
                  color: posColor(p.position ?? ""),
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                {p.position}
              </div>
              <TierBadge tier={p.tier} />
            </div>
          ))}
        </div>

        {fields.map((field) => (
          <div
            key={field.label}
            style={{
              display: "grid",
              gridTemplateColumns: `160px repeat(${prospects.length}, 1fr)`,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-muted)",
                background: "var(--dark-base)",
              }}
            >
              {field.label}
            </div>
            {prospects.map((p) => {
              const val = field.render(p);
              return (
                <div
                  key={p.player_name}
                  style={{
                    padding: "10px 16px",
                    fontSize: 13,
                    textAlign: "center",
                    borderLeft: "1px solid var(--border)",
                    color: val ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  {val ?? "-"}
                </div>
              );
            })}
          </div>
        ))}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `160px repeat(${prospects.length}, 1fr)`,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              fontSize: 12,
              fontWeight: 600,
              color: "#22c55e",
              background: "var(--dark-base)",
            }}
          >
            Strengths
          </div>
          {prospects.map((p) => (
            <div
              key={p.player_name}
              style={{ padding: "10px 16px", borderLeft: "1px solid var(--border)" }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(p.key_strengths ?? [])
                  .map(cleanText)
                  .filter((s): s is string => !!s)
                  .map((s, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: "rgba(34,197,94,0.12)",
                        color: "#86efac",
                      }}
                    >
                      {s.length > 40 ? `${s.slice(0, 40)}...` : s}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `160px repeat(${prospects.length}, 1fr)`,
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              fontSize: 12,
              fontWeight: 600,
              color: "#ef4444",
              background: "var(--dark-base)",
            }}
          >
            Concerns
          </div>
          {prospects.map((p) => (
            <div
              key={p.player_name}
              style={{ padding: "10px 16px", borderLeft: "1px solid var(--border)" }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(p.key_concerns ?? [])
                  .map(cleanText)
                  .filter((c): c is string => !!c)
                  .map((c, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: "rgba(239,68,68,0.12)",
                        color: "#fca5a5",
                      }}
                    >
                      {c.length > 40 ? `${c.slice(0, 40)}...` : c}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MyBoardView({
  prospects,
  myBoard,
  onSetTier,
  onRemove,
  onExport,
}: {
  prospects: Prospect[];
  myBoard: MyBoardState;
  onSetTier: (name: string, tier: string) => void;
  onRemove: (name: string) => void;
  onExport: () => void;
}) {
  const [addSearch, setAddSearch] = useState("");

  const assigned = new Map<TierKey, Prospect[]>();
  for (const tier of TIER_ORDER) assigned.set(tier, []);
  for (const p of prospects) {
    const customTier = (myBoard[p.player_name] ?? "").toLowerCase();
    if (TIER_ORDER.includes(customTier as TierKey)) {
      assigned.get(customTier as TierKey)!.push(p);
    }
  }

  const totalAssigned = [...assigned.values()].reduce((sum, arr) => sum + arr.length, 0);
  const unassigned = prospects.filter((p) => !myBoard[p.player_name]);
  const searchResults =
    addSearch.trim().length >= 2
      ? unassigned
          .filter(
            (p) =>
              p.player_name.toLowerCase().includes(addSearch.toLowerCase()) ||
              (p.position ?? "").toLowerCase() === addSearch.toLowerCase(),
          )
          .slice(0, 10)
      : [];

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <span style={{ fontSize: 14, fontWeight: 700 }}>My Draft Board</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
            {totalAssigned} ranked
          </span>
        </div>
        <button
          onClick={onExport}
          disabled={totalAssigned === 0}
          style={{
            background: totalAssigned > 0 ? "var(--amber)" : "var(--border)",
            color: totalAssigned > 0 ? "var(--dark-base)" : "var(--text-muted)",
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: totalAssigned > 0 ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          Copy to Clipboard
        </button>
      </div>

      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <input
          value={addSearch}
          onChange={(e) => setAddSearch(e.target.value)}
          placeholder="Search prospect to add to your board..."
          style={{
            width: "100%",
            background: "var(--dark-base)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
        {searchResults.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: "grid",
              gap: 4,
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {searchResults.map((p) => (
              <div
                key={p.player_name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ fontWeight: 600, flex: 1 }}>
                  <span style={{ color: posColor(p.position ?? ""), marginRight: 4 }}>
                    {p.position}
                  </span>
                  {p.player_name}
                </span>
                <TierBadge tier={p.tier} />
                {TIER_ORDER.map((t) => {
                  const cfg = TIER_CONFIG[t];
                  return (
                    <button
                      key={t}
                      onClick={() => {
                        onSetTier(p.player_name, t);
                        setAddSearch("");
                      }}
                      style={{
                        background: "none",
                        border: `1px solid ${cfg.border}`,
                        borderRadius: 4,
                        padding: "2px 6px",
                        fontSize: 9,
                        fontWeight: 700,
                        color: cfg.text,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                      title={`Add to ${cfg.label}`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {TIER_ORDER.map((tier) => {
        const players = assigned.get(tier) ?? [];
        const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.flier;

        return (
          <div
            key={tier}
            style={{
              border: `1px solid ${cfg.border}`,
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 12,
              opacity: players.length === 0 ? 0.5 : 1,
            }}
          >
            <div
              style={{
                background: cfg.headerBg,
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderBottom: `1px solid ${cfg.border}`,
              }}
            >
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 800,
                  background: cfg.bg,
                  color: cfg.text,
                }}
              >
                {cfg.label}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {players.length} player{players.length !== 1 ? "s" : ""}
              </span>
            </div>

            {players.length === 0 ? (
              <div
                style={{
                  padding: "16px",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  textAlign: "center",
                  background: cfg.bg,
                }}
              >
                Use search above to add players here
              </div>
            ) : (
              <div style={{ background: cfg.bg }}>
                {players.map((p) => (
                  <div
                    key={p.player_name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 16px",
                      borderBottom: `1px solid ${cfg.border}`,
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: posColor(p.position ?? ""),
                        fontSize: 11,
                        width: 24,
                      }}
                    >
                      {p.position}
                    </span>
                    <PlayerLink name={p.player_name} style={{ flex: 1, fontSize: 13 }} />
                    {p.school && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.school}</span>
                    )}
                    <select
                      value={tier}
                      onChange={(e) => onSetTier(p.player_name, e.target.value)}
                      style={{
                        background: "var(--dark-base)",
                        color: "var(--text-dim)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: "2px 4px",
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      {TIER_ORDER.map((t) => (
                        <option key={t} value={t}>
                          {TIER_CONFIG[t]?.label ?? t}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => onRemove(p.player_name)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--red)",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "2px 4px",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsView({
  hitRates,
  rookieADP,
}: {
  hitRates: HitRateData | undefined;
  rookieADP: LeagueADP[] | undefined;
}) {
  const [activeTab, setActiveTab] = useState<"hit_rates" | "adp">("hit_rates");

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {([
          { key: "hit_rates" as const, label: "Hit Rate Analysis" },
          { key: "adp" as const, label: "Your League ADP" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeTab === t.key ? "2px solid var(--amber)" : "2px solid transparent",
              color: activeTab === t.key ? "var(--amber)" : "var(--text-muted)",
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "hit_rates" && <HitRateView data={hitRates} />}
      {activeTab === "adp" && <ADPView data={rookieADP} />}
    </div>
  );
}

function HitRateView({ data }: { data: HitRateData | undefined }) {
  const [posFilter, setPosFilter] = useState<string>("ALL");

  if (!data || data.by_position_round.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No draft history data yet. Trigger a sync to load NFL draft history.
      </div>
    );
  }

  const positions = ["ALL", "QB", "RB", "WR", "TE"];
  const filtered = posFilter === "ALL"
    ? data.by_position_round
    : data.by_position_round.filter((r) => r.position === posFilter);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {data.overall_by_round.map((r) => (
          <div key={r.round} style={{
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "14px 18px", minWidth: 100, textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Round {r.round}</div>
            <div className="font-mono" style={{
              fontSize: 24, fontWeight: 800,
              color: r.hit_rate >= 50 ? "var(--green)" : r.hit_rate >= 30 ? "var(--amber)" : "var(--red)",
            }}>
              {r.hit_rate}%
            </div>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{r.total} players</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {positions.map((pos) => (
          <button key={pos} onClick={() => setPosFilter(pos)} style={{
            background: posFilter === pos ? "var(--amber)" : "var(--card)",
            color: posFilter === pos ? "var(--dark-base)" : "var(--text-dim)",
            border: `1px solid ${posFilter === pos ? "var(--amber)" : "var(--border)"}`,
            borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            {pos}
          </button>
        ))}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["POS", "ROUND", "DRAFTED", "HITS", "HIT RATE", "AVG GAMES", "NOTABLE HITS", "NOTABLE BUSTS"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={`${r.position}-${r.round}-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px", fontWeight: 700, color: posColor(r.position) }}>{r.position}</td>
                <td style={{ padding: "10px 12px" }}>{r.pick_range}</td>
                <td className="font-mono" style={{ padding: "10px 12px" }}>{r.total_drafted}</td>
                <td className="font-mono" style={{ padding: "10px 12px", color: "var(--green)" }}>{r.hits}</td>
                <td style={{ padding: "10px 12px" }}>
                  <span className="font-mono" style={{
                    fontWeight: 700,
                    color: r.hit_rate_pct >= 50 ? "var(--green)" : r.hit_rate_pct >= 30 ? "var(--amber)" : "var(--red)",
                  }}>
                    {r.hit_rate_pct}%
                  </span>
                </td>
                <td className="font-mono" style={{ padding: "10px 12px", color: "var(--text-dim)" }}>{r.avg_games}</td>
                <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--green)" }}>
                  {r.notable_hits.slice(0, 3).join(", ") || "-"}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--red)" }}>
                  {r.notable_busts.slice(0, 2).join(", ") || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ADPView({ data }: { data: LeagueADP[] | undefined }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No completed 2026 rookie drafts yet. ADP will appear as your leagues finish drafting.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
        Aggregate ADP from {data[0]?.leagues_available ?? 0} completed rookie drafts in your leagues
      </div>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["ADP", "PLAYER", "POS", "RANGE", "DRAFTED"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.player_name} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="font-mono" style={{ padding: "10px 12px", fontWeight: 800 }}>{p.avg_pick}</td>
                <td style={{ padding: "10px 12px" }}>
                  <PlayerLink name={p.player_name} style={{ fontSize: 13 }} />
                </td>
                <td style={{ padding: "10px 12px", fontWeight: 700, color: posColor(p.position ?? "") }}>{p.position}</td>
                <td className="font-mono" style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>
                  {p.min_pick === p.max_pick ? `Pick ${p.min_pick}` : `${p.min_pick} - ${p.max_pick}`}
                </td>
                <td className="font-mono" style={{ padding: "10px 12px", color: "var(--text-dim)" }}>
                  {p.times_drafted}x
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MockDraftView({
  leagues,
  mockLeagueId,
  setMockLeagueId,
  mockSetup,
  mockStarted,
  onStart,
  mockPicks,
  onUserPick,
  prospects,
}: {
  leagues: LeaguePowerRanking[] | undefined;
  mockLeagueId: string;
  setMockLeagueId: (id: string) => void;
  mockSetup: MockDraftSetup | undefined;
  mockStarted: boolean;
  onStart: () => void;
  mockPicks: MockDraftPick[];
  onUserPick: (name: string) => void;
  prospects: MockDraftProspect[] | undefined;
}) {
  const pickedNames = new Set(mockPicks.filter((p) => p.selected_player).map((p) => p.selected_player!));
  const userPending = mockPicks.find((p) => p.is_user && !p.selected_player);
  const available = (prospects ?? []).filter((p) => !pickedNames.has(p.player_name));

  return (
    <div style={{ marginTop: 16 }}>
      {!mockStarted && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            SELECT LEAGUE
          </label>
          <select
            value={mockLeagueId}
            onChange={(e) => setMockLeagueId(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 8,
              padding: "10px 12px",
              background: "var(--dark-base)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <option value="">Choose a league...</option>
            {leagues?.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.league_name} ({l.mode.toUpperCase()}, {l.rosters.length} teams)
              </option>
            ))}
          </select>

          {mockSetup && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                {mockSetup.total_rosters} teams, {mockSetup.draft_rounds} rounds,{" "}
                {mockSetup.league_mode.toUpperCase()}
                {mockSetup.scoring_label && ` | ${mockSetup.scoring_label}`}
              </div>
              {mockSetup.teams.filter((t) => t.is_user).map((t) => (
                <div
                  key={t.roster_id}
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--amber)" }}
                >
                  You pick at position {t.draft_position} ({t.display_name})
                </div>
              ))}
              <button
                onClick={onStart}
                style={{
                  marginTop: 12,
                  background: "var(--amber)",
                  color: "var(--dark-base)",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 24px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Start Mock Draft
              </button>
            </div>
          )}
        </div>
      )}

      {mockStarted && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {mockPicks.map((pick) => (
              <div
                key={pick.pick_number}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border)",
                  background: pick.is_user ? "rgba(245,158,11,0.08)" : "transparent",
                  opacity: pick.selected_player ? 1 : 0.6,
                }}
              >
                <span
                  className="font-mono"
                  style={{ width: 40, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}
                >
                  {pick.round}.{String(pick.pick_in_round).padStart(2, "0")}
                </span>
                <span
                  style={{
                    width: 120,
                    fontSize: 12,
                    fontWeight: 600,
                    color: pick.is_user ? "var(--amber)" : "var(--text)",
                  }}
                >
                  {pick.display_name}
                </span>
                {pick.selected_player ? (
                  <>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: posColor(pick.selected_position ?? ""),
                      }}
                    >
                      {pick.selected_position}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{pick.selected_player}</span>
                    {pick.reasoning && (
                      <span style={{ fontSize: 10, color: "var(--text-dim)", fontStyle: "italic" }}>
                        {pick.reasoning}
                      </span>
                    )}
                  </>
                ) : pick.is_user ? (
                  <span style={{ flex: 1, fontSize: 13, color: "var(--amber)", fontWeight: 700 }}>
                    YOUR PICK: Select from available players {"\u2192"}
                  </span>
                ) : (
                  <span style={{ flex: 1, fontSize: 12, color: "var(--text-muted)" }}>
                    Simulating...
                  </span>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
              maxHeight: 600,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
                fontWeight: 700,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {userPending ? "YOUR PICK: SELECT A PLAYER" : "BEST AVAILABLE"}
            </div>
            {available.slice(0, 20).map((p) => (
              <button
                key={p.player_name}
                onClick={() => userPending && onUserPick(p.player_name)}
                disabled={!userPending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border)",
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: userPending ? "pointer" : "default",
                  fontFamily: "inherit",
                  color: "var(--text)",
                  textAlign: "left",
                  opacity: userPending ? 1 : 0.6,
                }}
              >
                <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)", width: 20 }}>
                  {p.overall_rank}
                </span>
                <span style={{ fontWeight: 700, fontSize: 11, color: posColor(p.position), width: 24 }}>
                  {p.position}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{p.player_name}</div>
                  {p.school && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.school}</div>}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-dim)" }}>
                  {p.tier.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LiveDraftView({
  activeDrafts,
  liveDraftState,
  onSelectDraft,
}: {
  activeDrafts: ActiveDraftSummary[] | undefined;
  liveDraftState: LiveDraftState | undefined;
  onSelectDraft: (draftId: string, leagueId: string) => void;
}) {
  if (!activeDrafts || activeDrafts.length === 0) {
    return (
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "48px 24px",
          marginTop: 16,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        No active 2026 rookie drafts found. Drafts will appear here when they start on Sleeper.
      </div>
    );
  }

  if (!liveDraftState) {
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Active Drafts</div>
        {activeDrafts.map((d) => (
          <button
            key={d.draft_id}
            onClick={() => onSelectDraft(d.draft_id, d.league_id)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "14px 18px",
              marginBottom: 8,
              width: "100%",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "var(--text)",
            }}
          >
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.league_name}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {d.status === "drafting" ? `${d.picks_made}/${d.total_picks} picks made` : "Pre-draft"}
              </div>
            </div>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                background:
                  d.status === "drafting" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                color: d.status === "drafting" ? "var(--green)" : "var(--amber)",
              }}
            >
              {d.status === "drafting" ? "LIVE" : "PRE-DRAFT"}
            </span>
          </button>
        ))}
      </div>
    );
  }

  const ds = liveDraftState;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{ds.league_name}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
            Pick {ds.current_pick} of {ds.total_rosters * ds.total_rounds}
          </span>
        </div>
        <span
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            background: "rgba(34,197,94,0.15)",
            color: "var(--green)",
          }}
        >
          LIVE (refreshes every 15s)
        </span>
      </div>

      {ds.on_the_clock && (
        <div
          style={{
            background: ds.on_the_clock.is_user ? "rgba(245,158,11,0.1)" : "var(--card)",
            border: ds.on_the_clock.is_user ? "2px solid var(--amber)" : "1px solid var(--border)",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>
            ON THE CLOCK
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: ds.on_the_clock.is_user ? "var(--amber)" : "var(--text)",
              marginTop: 4,
            }}
          >
            {ds.on_the_clock.display_name}
            {ds.on_the_clock.is_user && " (YOU)"}
          </div>
          {ds.on_the_clock.needs.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {ds.on_the_clock.needs.map((n) => (
                <span
                  key={n.position}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background:
                      n.grade === "hole" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                    color: n.grade === "hole" ? "#fca5a5" : "var(--amber)",
                  }}
                >
                  {n.position} {n.grade.toUpperCase()}
                </span>
              ))}
            </div>
          )}
          {ds.user_recommendation && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                background: "rgba(245,158,11,0.08)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--amber)",
                fontWeight: 600,
              }}
            >
              {ds.user_recommendation}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            maxHeight: 500,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              fontWeight: 700,
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            PICKS MADE ({ds.picks_made.length})
          </div>
          {ds.picks_made.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No picks yet. Waiting for draft to begin...
            </div>
          ) : (
            [...ds.picks_made].reverse().map((pick) => (
              <div
                key={pick.pick_number}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border)",
                  background: pick.is_user_pick ? "rgba(245,158,11,0.08)" : "transparent",
                }}
              >
                <span className="font-mono" style={{ width: 40, fontSize: 11, color: "var(--text-muted)" }}>
                  {pick.round}.{String(pick.pick_in_round).padStart(2, "0")}
                </span>
                <span
                  style={{
                    width: 100,
                    fontSize: 11,
                    color: pick.is_user_pick ? "var(--amber)" : "var(--text-muted)",
                  }}
                >
                  {pick.display_name}
                </span>
                <span style={{ fontWeight: 700, fontSize: 11, color: posColor(pick.position ?? "") }}>
                  {pick.position}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{pick.player_name}</span>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            maxHeight: 500,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              fontWeight: 700,
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            BEST AVAILABLE
          </div>
          {ds.best_available.map((p) => (
            <div
              key={p.player_name}
              style={{
                padding: "8px 14px",
                borderBottom: "1px solid var(--border)",
                background: p.fit_for_user ? "rgba(34,197,94,0.06)" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 11, color: posColor(p.position) }}>{p.position}</span>
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.player_name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-dim)" }}>
                  {p.tier.toUpperCase()}
                </span>
              </div>
              {p.fit_for_user && (
                <div style={{ fontSize: 10, color: "var(--green)", fontWeight: 600, marginTop: 2 }}>
                  {p.fit_for_user}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MeasurableBar({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  const num = parseFloat(value);
  if (isNaN(num)) return null;

  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 700 }}>
          {value}{unit}
        </span>
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string | null }) {
  const cfg = TIER_CONFIG[(tier ?? "flier").toLowerCase()] ?? TIER_CONFIG.flier;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, background: cfg.bg, color: cfg.text }}>
      {cfg.label}
    </span>
  );
}
