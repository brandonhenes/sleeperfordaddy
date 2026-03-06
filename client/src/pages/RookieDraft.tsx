import { useState, useMemo } from "react";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import { useProspects, type Prospect } from "../hooks/use-market";
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

function cleanText(val: string | null | undefined): string | null {
  if (val == null) return null;
  const t = val.trim();
  if (!t || t.toLowerCase() === "null") return null;
  return t;
}

function scoutingReport(p: Prospect): string | null {
  return cleanText(p.scouting_notes) ?? cleanText(p.fp_scouting_notes) ?? cleanText(p.notes);
}

export default function RookieDraft() {
  const { data, isLoading, error } = useProspects();
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"board" | "positional">("board");

  const filtered = useMemo(() => {
    if (!data) return [];
    return posFilter === "ALL" ? data : data.filter((p) => p.position === posFilter);
  }, [data, posFilter]);

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
      </div>

      {viewMode === "board" ? (
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
                </div>

                <div style={{ background: cfg.bg }}>
                  {prospects.map((p) => (
                    <ProspectCard
                      key={p.player_name}
                      prospect={p}
                      overallRank={overallRanks.get(p.player_name) ?? 0}
                      tierColor={cfg.text}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
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
    </AppShell>
  );
}

function ProspectCard({
  prospect: p,
  overallRank,
  tierColor,
}: {
  prospect: Prospect;
  overallRank: number;
  tierColor: string;
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
