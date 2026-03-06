import { useState, useMemo } from "react";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import { useProspects, type Prospect } from "../hooks/use-market";
import { useRookieDraftContext, type DraftPickContext, type AggregateNeed, type PickValueReference } from "../hooks/use-rookie-draft";
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
  const [viewMode, setViewMode] = useState<"board" | "positional" | "compare" | "myboard">("board");
  const [compareList, setCompareList] = useState<string[]>([]);
  const [watchlist, setWatchlist] = useState<Set<string>>(loadWatchlist);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [myBoard, setMyBoard] = useState<MyBoardState>(loadMyBoard);

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
    const tierExpectedRange: Record<string, [number, number]> = {
      elite: [1, 1],
      day1: [2, 4],
      day2: [3, 7],
      day3: [5, 12],
      flier: [8, 99],
    };

    return data
      .map((p) => {
        const tier = (p.tier ?? "flier").toLowerCase();
        const posRank = p.fp_rank ?? p.fantasypros_rank ?? null;
        if (!posRank) return null;
        const expected = tierExpectedRange[tier] ?? [1, 99];
        const isHigherThanExpected = posRank < expected[0];
        const isLowerThanExpected = posRank > expected[1];
        if (!isHigherThanExpected && !isLowerThanExpected) return null;

        return {
          prospect: p,
          posRank,
          tier,
          direction: isHigherThanExpected ? "undervalued" as const : "overvalued" as const,
          note: isHigherThanExpected
            ? `Ranked ${p.position}${posRank} but only in ${(TIER_CONFIG[tier]?.label ?? tier).toUpperCase()} tier. May be a steal.`
            : `In ${(TIER_CONFIG[tier]?.label ?? tier).toUpperCase()} tier but ranked ${p.position}${posRank}. Possibly overranked.`,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => {
        if (a.direction !== b.direction) return a.direction === "undervalued" ? -1 : 1;
        return a.posRank - b.posRank;
      });
  }, [data]);

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
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {disagreements.slice(0, 8).map((d) => (
              <div key={d.prospect.player_name} style={{
                background: "var(--dark-base)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "8px 12px", minWidth: 200, flexShrink: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                    background: d.direction === "undervalued" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                    color: d.direction === "undervalued" ? "#86efac" : "#fca5a5",
                  }}>
                    {d.direction === "undervalued" ? "SLEEPER" : "FADING"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{d.prospect.player_name}</span>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
                  {d.note}
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
}: {
  prospect: Prospect;
  overallRank: number;
  tierColor: string;
  isComparing: boolean;
  onToggleCompare: () => void;
  isWatched: boolean;
  onToggleWatch: () => void;
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

            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-dim)", flexWrap: "wrap" }}>
              {cleanText(p.landing_spot) && <span>Landing Spot: <strong style={{ color: "var(--text)" }}>{p.landing_spot}</strong></span>}
              {cleanText(p.current_adp) && <span>Rookie ADP: <strong style={{ color: "var(--text)" }}>{p.current_adp}</strong></span>}
              {p.total_mentions != null && p.total_mentions > 0 && <span>{p.total_mentions} newsletter mentions</span>}
            </div>
          </div>
        </div>
      )}
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
