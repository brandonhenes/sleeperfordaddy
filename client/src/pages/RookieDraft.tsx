import { useState, useMemo } from "react";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import { useProspects } from "../hooks/use-market";
import type { Prospect } from "@shared/types";
import { useRookieDraftContext } from "../hooks/use-rookie-draft";
import { usePowerRankings } from "../hooks/use-power-rankings";
import { useMockDraftSetup, type MockDraftPick } from "../hooks/use-mock-draft";
import { useActiveDrafts, useLiveDraft } from "../hooks/use-live-draft";
import { useHitRates, useRookieADP } from "../hooks/use-draft-data";
import { useLatestProspectRankings, type ProspectRanking } from "../hooks/use-prospect-rankings";
import { useCurrentUsername } from "../hooks/use-current-user";
import AnalyticsView from "./draft/AnalyticsView";
import DraftCompareView from "./draft/CompareView";
import LiveDraftView from "./draft/LiveDraftView";
import MockDraftView from "./draft/MockDraftView";
import MyBoardView from "./draft/MyBoardView";
import BigBoardView from "./draft/BigBoardView";
import PositionalProspectsView from "./draft/PositionalProspectsView";
import CompareTray from "./draft/CompareTray";
import DraftHubControls, { type DraftViewMode } from "./draft/DraftHubControls";
import RankingDisagreementsPanel from "./draft/RankingDisagreementsPanel";
import OwnedPicksPanel from "./draft/OwnedPicksPanel";
import {
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
  const [viewMode, setViewMode] = useState<DraftViewMode>("board");
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

      <DraftHubControls
        viewMode={viewMode}
        onSetViewMode={setViewMode}
        posFilter={posFilter}
        onSetPosFilter={setPosFilter}
        showWatchlistOnly={showWatchlistOnly}
        onToggleWatchlistOnly={() => setShowWatchlistOnly((current) => !current)}
        watchlistCount={watchlist.size}
      />

      {viewMode === "board" && (
        <RankingDisagreementsPanel
          sleeperDisagreements={sleeperDisagreements}
          fadingDisagreements={fadingDisagreements}
        />
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

      <OwnedPicksPanel draftContext={draftCtx} />

      {viewMode === "board" && (
        <BigBoardView
          byTier={byTier}
          overallRanks={overallRanks}
          compareList={compareList}
          watchlist={watchlist}
          rankingsMap={rankingsMap}
          pickValues={draftCtx?.pick_values}
          userPicks2026={draftCtx?.picks_2026}
          onToggleCompare={toggleCompare}
          onToggleWatch={toggleWatch}
        />
      )}

      {viewMode === "positional" && (
        <PositionalProspectsView byPosition={byPosition} />
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

      <CompareTray
        compareList={compareList}
        onRemove={toggleCompare}
        onCompare={() => setViewMode("compare")}
        onClear={() => setCompareList([])}
      />
    </AppShell>
  );
}
