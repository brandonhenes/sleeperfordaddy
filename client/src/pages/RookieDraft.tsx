import { useState, useMemo } from "react";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import { useProspects, type Prospect } from "../hooks/use-market";
import { useRookieDraftContext, type DraftPickContext, type AggregateNeed } from "../hooks/use-rookie-draft";
import { usePowerRankings } from "../hooks/use-power-rankings";
import { useMockDraftSetup, type MockDraftPick } from "../hooks/use-mock-draft";
import { useActiveDrafts, useLiveDraft } from "../hooks/use-live-draft";
import { useHitRates, useRookieADP } from "../hooks/use-draft-data";
import { useLatestProspectRankings, type ProspectRanking } from "../hooks/use-prospect-rankings";
import { useCurrentUsername } from "../hooks/use-current-user";
import { PlayerLink } from "../components/ui";
import { posColor } from "../lib/position-colors";
import PickCard from "./draft/PickCard";
import AnalyticsView from "./draft/AnalyticsView";
import DraftCompareView from "./draft/CompareView";
import LiveDraftView from "./draft/LiveDraftView";
import MockDraftView from "./draft/MockDraftView";
import TierBadge from "./draft/TierBadge";
import TierPickValueOverlay from "./draft/TierPickValueOverlay";
import ProspectCard from "./draft/ProspectCard";
import MyBoardView from "./draft/MyBoardView";
import {
  POS_FILTERS,
  TIER_CONFIG,
  TIER_ORDER,
  MYBOARD_KEY,
  WATCHLIST_KEY,
  type MyBoardState,
  type TierKey,
} from "./draft/rookie-draft-config";
import {
  loadMyBoard,
  loadWatchlist,
} from "./draft/rookie-draft-utils";

export default function RookieDraft() {
  const { data, isLoading, error } = useProspects();
  const { username } = useCurrentUsername();
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
                  {draftCtx && (
                    <TierPickValueOverlay
                      tier={tier}
                      pickValues={draftCtx.pick_values}
                      userPicks2026={draftCtx.picks_2026}
                    />
                  )}
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
        <DraftCompareView prospects={compareProspects} onBack={() => setViewMode("board")} />
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
