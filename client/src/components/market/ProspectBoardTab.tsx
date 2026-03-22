import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useProspects, type Prospect } from "../../hooks/use-market";
import { posColor } from "../../lib/position-colors";
import { PlayerLink } from "../ui";

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  elite: { bg: "rgba(245,158,11,0.15)", text: "var(--amber)", label: "ELITE" },
  ELITE: { bg: "rgba(245,158,11,0.15)", text: "var(--amber)", label: "ELITE" },
  day1: { bg: "rgba(96,165,250,0.15)", text: "var(--blue)", label: "DAY 1" },
  DAY1: { bg: "rgba(96,165,250,0.15)", text: "var(--blue)", label: "DAY 1" },
  day2: { bg: "rgba(74,222,128,0.15)", text: "var(--green)", label: "DAY 2" },
  DAY2: { bg: "rgba(74,222,128,0.15)", text: "var(--green)", label: "DAY 2" },
  day3: { bg: "rgba(148,163,184,0.15)", text: "var(--text-dim)", label: "DAY 3" },
  DAY3: { bg: "rgba(148,163,184,0.15)", text: "var(--text-dim)", label: "DAY 3" },
  flier: { bg: "rgba(244,114,182,0.15)", text: "#f9a8d4", label: "FLIER" },
  FLIER: { bg: "rgba(244,114,182,0.15)", text: "#f9a8d4", label: "FLIER" },
};

const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE"] as const;
const SORT_OPTIONS = [
  { key: "rank", label: "Board Rank" },
  { key: "adp", label: "Consensus ADP" },
] as const;
const TIER_ORDER = ["ELITE", "DAY1", "DAY2", "DAY3", "FLIER"] as const;

type SortKey = typeof SORT_OPTIONS[number]["key"];
type DisagreementType = "SLEEPER" | "FADING";
type ProspectBoardExtras = Prospect & {
  zone_route_pff?: string | null;
  man_route_pff?: string | null;
  slot_rate?: string | null;
  outside_rate?: string | null;
  disagreement_flag?: "SLEEPER" | "FADING" | null;
};

function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function scoutingReport(p: Prospect): string | null {
  return cleanText(p.scouting_notes) ?? cleanText(p.fp_scouting_notes) ?? cleanText(p.notes);
}

function normalizeTier(tier: string | null | undefined): string | null {
  const cleaned = cleanText(tier);
  return cleaned ? cleaned.toUpperCase() : null;
}

function formatDecimal(value: number | null | undefined, digits = 1): string | null {
  return value == null ? null : value.toFixed(digits);
}

function getPffTone(grade: number | null) {
  if (grade == null) return { bg: "rgba(148,163,184,0.12)", color: "var(--text-dim)", border: "rgba(148,163,184,0.28)" };
  if (grade >= 85) return { bg: "rgba(34,197,94,0.12)", color: "#86efac", border: "rgba(34,197,94,0.32)" };
  if (grade >= 75) return { bg: "rgba(245,158,11,0.14)", color: "#fcd34d", border: "rgba(245,158,11,0.34)" };
  return { bg: "rgba(148,163,184,0.12)", color: "var(--text-dim)", border: "rgba(148,163,184,0.28)" };
}

function getDolittleTone(score: number | null) {
  if (score == null) return { bg: "rgba(148,163,184,0.12)", color: "var(--text-dim)", border: "rgba(148,163,184,0.28)" };
  if (score >= 35) return { bg: "rgba(34,197,94,0.12)", color: "#86efac", border: "rgba(34,197,94,0.32)" };
  if (score >= 25) return { bg: "rgba(245,158,11,0.14)", color: "#fcd34d", border: "rgba(245,158,11,0.34)" };
  return { bg: "rgba(148,163,184,0.12)", color: "var(--text-dim)", border: "rgba(148,163,184,0.28)" };
}

function getAdpTone(adp: string | null) {
  if (!adp) return { bg: "rgba(148,163,184,0.12)", color: "var(--text-dim)", border: "rgba(148,163,184,0.28)" };
  const round = parseInt(adp.split(".")[0] ?? "", 10);
  if (round === 1) return { bg: "rgba(245,158,11,0.16)", color: "#fcd34d", border: "rgba(245,158,11,0.36)" };
  if (round === 2) return { bg: "rgba(226,232,240,0.12)", color: "#e2e8f0", border: "rgba(226,232,240,0.32)" };
  if (round === 3) return { bg: "rgba(180,83,9,0.18)", color: "#fdba74", border: "rgba(180,83,9,0.34)" };
  return { bg: "rgba(148,163,184,0.10)", color: "var(--text-muted)", border: "rgba(148,163,184,0.24)" };
}

function getPffTrendArrow(current: number | null, previous: number | null): string {
  if (current == null || previous == null) return "-";
  if (current > previous) return "?";
  if (current < previous) return "?";
  return "-";
}

function getConfidenceBorder(confidence: Prospect["dolittle_confidence"]): "solid" | "dashed" {
  return confidence === "LOW" ? "dashed" : "solid";
}

function getAdpTier(rank: number | null | undefined): string | null {
  if (rank == null) return null;
  if (rank <= 5) return "ELITE";
  if (rank <= 12) return "DAY1";
  if (rank <= 29) return "DAY2";
  if (rank <= 44) return "DAY3";
  return "FLIER";
}

function getCoverageTone(value: string | null | undefined) {
  const score = Number(value);
  if (!Number.isFinite(score)) return { bg: "rgba(148,163,184,0.12)", color: "var(--text-dim)", border: "rgba(148,163,184,0.28)" };
  if (score >= 80) return { bg: "rgba(34,197,94,0.12)", color: "#86efac", border: "rgba(34,197,94,0.32)" };
  if (score >= 70) return { bg: "rgba(245,158,11,0.14)", color: "#fcd34d", border: "rgba(245,158,11,0.34)" };
  return { bg: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "rgba(239,68,68,0.32)" };
}

function getAlignmentLabel(prospect: ProspectBoardExtras): "SLOT" | "X/Z" | "FLEX" {
  const slotRate = Number(prospect.slot_rate);
  const outsideRate = Number(prospect.outside_rate);
  if (Number.isFinite(slotRate) && slotRate >= 70) return "SLOT";
  if (Number.isFinite(outsideRate) && outsideRate >= 70) return "X/Z";
  return "FLEX";
}

function getFlagTone(flag: "SLEEPER" | "FADING") {
  return flag === "SLEEPER"
    ? { bg: "rgba(34,197,94,0.12)", color: "#86efac", border: "rgba(34,197,94,0.32)", icon: "↑" }
    : { bg: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "rgba(239,68,68,0.32)", icon: "↓" };
}

function compareProspects(a: Prospect, b: Prospect, sortKey: SortKey) {
  if (sortKey === "adp") {
    const aValue = a.consensus_adp_rank ?? Number.MAX_SAFE_INTEGER;
    const bValue = b.consensus_adp_rank ?? Number.MAX_SAFE_INTEGER;
    if (aValue !== bValue) return aValue - bValue;
  }

  const aRank = a.fp_rank ?? a.fantasypros_rank ?? Number.MAX_SAFE_INTEGER;
  const bRank = b.fp_rank ?? b.fantasypros_rank ?? Number.MAX_SAFE_INTEGER;
  if (aRank !== bRank) return aRank - bRank;

  const aAdp = a.consensus_adp_rank ?? Number.MAX_SAFE_INTEGER;
  const bAdp = b.consensus_adp_rank ?? Number.MAX_SAFE_INTEGER;
  if (aAdp !== bAdp) return aAdp - bAdp;

  return a.player_name.localeCompare(b.player_name);
}

function computeDisagreements(data: Prospect[]) {
  return data
    .map((prospect) => {
      const extras = prospect as ProspectBoardExtras;
      const flag = extras.disagreement_flag;
      if (!flag) return null;
      return {
        prospect,
        type: flag,
        delta: 0,
        adpTier: getAdpTier(prospect.consensus_adp_rank) ?? "-",
      };
    })
    .filter((entry): entry is { prospect: Prospect; type: DisagreementType; delta: number; adpTier: string } => !!entry)
    .sort((a, b) => {
      const aRank = a.prospect.consensus_adp_rank ?? Number.MAX_SAFE_INTEGER;
      const bRank = b.prospect.consensus_adp_rank ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    });
}

function TierBadge({ tier }: { tier: string | null }) {
  const normalizedTier = normalizeTier(tier) ?? "DAY3";
  const s = TIER_STYLES[normalizedTier] || TIER_STYLES.DAY3;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        background: s.bg,
        color: s.text,
      }}
    >
      {s.label}
    </span>
  );
}

export default function ProspectBoardTab() {
  const { data, isLoading, error } = useProspects();
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("rank");

  const filtered = useMemo(() => {
    if (!data) return [];
    const base = posFilter === "ALL" ? data : data.filter((p) => p.position === posFilter);
    return [...base].sort((a, b) => compareProspects(a, b, sortKey));
  }, [data, posFilter, sortKey]);
  const disagreements = useMemo(() => computeDisagreements(filtered), [filtered]);
  const sleepers = disagreements.filter((entry) => entry.type === "SLEEPER").slice(0, 5);
  const fading = disagreements.filter((entry) => entry.type === "FADING").slice(0, 5);

  if (isLoading) return <TableSkeleton />;
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <div>
      <Link href="/rookie-draft" style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--amber)",
        fontWeight: 600,
        textDecoration: "none",
        marginBottom: 12,
      }}>
        Open full Rookie Draft Hub ?
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {POS_FILTERS.map((pos) => (
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="label" style={{ color: "var(--text-dim)" }}>SORT</span>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => setSortKey(option.key)}
              style={{
                background: sortKey === option.key ? "rgba(245,158,11,0.15)" : "var(--card)",
                color: sortKey === option.key ? "var(--amber)" : "var(--text-dim)",
                border: `1px solid ${sortKey === option.key ? "rgba(245,158,11,0.35)" : "var(--border)"}`,
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {(sleepers.length > 0 || fading.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
          <DisagreementPanel title="SLEEPERS" accent="#22c55e" items={sleepers} description="Tier outruns consensus ADP" />
          <DisagreementPanel title="FADING" accent="#ef4444" items={fading} description="Consensus ADP outruns tier" />
        </div>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["RANK", "PLAYER", "POS", "SCHOOL", "TIER", "ADP", "COMP", "SIZE", "DRAFT"].map((h) => (
                <th key={h} className="label" style={{ textAlign: "left", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <ProspectRow key={`${p.player_name}-${i}`} prospect={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProspectRow({ prospect: p }: { prospect: Prospect }) {
  const prospect = p as ProspectBoardExtras;
  const [expanded, setExpanded] = useState(false);
  const report = scoutingReport(p);
  const strengths = (p.key_strengths ?? []).map((s) => cleanText(s)).filter((s): s is string => !!s);
  const concerns = (p.key_concerns ?? []).map((c) => cleanText(c)).filter((c): c is string => !!c);
  const hasDetail = !!report || strengths.length > 0 || concerns.length > 0;

  const height = cleanText(p.height);
  const weight = cleanText(p.weight);
  const size = height && weight ? `${height} / ${weight}` : height ?? weight ?? null;
  const comp = cleanText(p.consensus_comp)
    ?? (p.all_comps && p.all_comps.length > 0 ? cleanText(p.all_comps[0].comp) : null);
  const draftCapital = cleanText(p.draft_capital);
  const adp = cleanText(p.consensus_adp);

  return (
    <>
      <tr
        onClick={() => hasDetail && setExpanded(!expanded)}
        style={{ borderBottom: expanded ? "none" : "1px solid var(--border)", cursor: hasDetail ? "pointer" : "default" }}
      >
        <td className="font-mono" style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-muted)" }}>
          {p.fp_rank ?? p.fantasypros_rank ?? "-"}
        </td>
        <td style={{ padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PlayerLink name={p.player_name} />
            {prospect.disagreement_flag && (
              <Badge
                label={`${getFlagTone(prospect.disagreement_flag).icon} ${prospect.disagreement_flag}`}
                tone={getFlagTone(prospect.disagreement_flag)}
              />
            )}
            {p.age != null && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>({p.age})</span>}
            {hasDetail && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{expanded ? "?" : "?"}</span>}
          </div>
          {report && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {report.length > 120 ? `${report.slice(0, 120)}...` : report}
            </div>
          )}
          <AnalyticsRow prospect={p} />
        </td>
        <td style={{ padding: "10px 14px" }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: posColor(p.position ?? "") }}>{p.position ?? "-"}</span>
        </td>
        <td style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-dim)" }}>{cleanText(p.school) ?? "-"}</td>
        <td style={{ padding: "10px 14px" }}><TierBadge tier={p.tier} /></td>
        <td style={{ padding: "10px 14px" }}>
          {adp ? <Badge label={`ADP ${adp}`} tone={getAdpTone(adp)} /> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>-</span>}
        </td>
        <td style={{ padding: "10px 14px", fontSize: 13, fontStyle: "italic", color: "var(--text-dim)" }}>
          {comp ?? "-"}
        </td>
        <td className="font-mono" style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-dim)" }}>
          {size ?? "-"}
        </td>
        <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-dim)" }}>
          {draftCapital ?? "-"}
        </td>
      </tr>
      {expanded && <ExpandedDetail prospect={p} report={report} strengths={strengths} concerns={concerns} />}
    </>
  );
}

function ExpandedDetail({
  prospect: p,
  report,
  strengths,
  concerns,
}: {
  prospect: Prospect;
  report: string | null;
  strengths: string[];
  concerns: string[];
}) {
  const hasCombine = p.combine_40 || p.combine_vertical || p.combine_shuttle || p.combine_bench;
  const height = cleanText(p.height);
  const weight = cleanText(p.weight);
  const tier = normalizeTier(p.tier);
  const draftCapital = cleanText(p.draft_capital);

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td colSpan={9} style={{ padding: "0 14px 14px" }}>
        <div style={{ background: "var(--dark-base)", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" }}>
            <span><span style={{ color: "var(--text-dim)" }}>Tier:</span> {tier ?? "-"}</span>
            <span><span style={{ color: "var(--text-dim)" }}>Age:</span> {p.age ?? "-"}</span>
            <span><span style={{ color: "var(--text-dim)" }}>Size:</span> {height && weight ? `${height} / ${weight}` : height ?? weight ?? "-"}</span>
            <span><span style={{ color: "var(--text-dim)" }}>Draft Capital:</span> {draftCapital ?? "-"}</span>
            {cleanText(p.consensus_adp) && <span><span style={{ color: "var(--text-dim)" }}>Consensus ADP:</span> {cleanText(p.consensus_adp)}</span>}
            {cleanText(p.nfl_team) && <span><span style={{ color: "var(--text-dim)" }}>NFL Team:</span> {cleanText(p.nfl_team)}</span>}
            {p.nfl_pick != null && <span><span style={{ color: "var(--text-dim)" }}>Pick:</span> {p.nfl_pick}</span>}
          </div>

          {p.all_comps && p.all_comps.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>PLAYER COMPS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {p.all_comps.map((c, i) => (
                  <span key={i} style={{ fontSize: 12, background: "var(--card)", border: "1px solid var(--border)", padding: "3px 8px", borderRadius: 4 }}>
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

          {hasCombine && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>MEASURABLES</div>
              <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                {cleanText(p.combine_40) && <Stat label="40" value={cleanText(p.combine_40)!} />}
                {cleanText(p.combine_vertical) && <Stat label="Vert" value={cleanText(p.combine_vertical)!} />}
                {cleanText(p.combine_shuttle) && <Stat label="Shuttle" value={cleanText(p.combine_shuttle)!} />}
                {cleanText(p.combine_bench) && <Stat label="Bench" value={cleanText(p.combine_bench)!} />}
              </div>
            </div>
          )}

          {report && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>FULL SCOUTING REPORT</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {report}
              </div>
            </div>
          )}

          {(cleanText(p.landing_spot) || cleanText(p.current_adp)) && (
            <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
              {cleanText(p.landing_spot) && <Stat label="Landing Spot" value={cleanText(p.landing_spot)!} />}
              {cleanText(p.current_adp) && <Stat label="ADP" value={cleanText(p.current_adp)!} />}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function AnalyticsRow({ prospect }: { prospect: Prospect }) {
  const prospectExtras = prospect as ProspectBoardExtras;
  const pffGrade = formatDecimal(prospect.pff_grade_2025, 1);
  const dolittleScore = formatDecimal(prospect.dolittle_score, 2);
  const analyticsItems = [
    prospect.pff_rank != null && pffGrade
      ? (
          <Badge
            key="pff"
            label={`PFF #${prospect.pff_rank} | ${pffGrade} ${getPffTrendArrow(prospect.pff_grade_2025, prospect.pff_grade_2024)}`}
            tone={getPffTone(prospect.pff_grade_2025)}
          />
        )
      : null,
    prospect.dolittle_score != null && dolittleScore
      ? (
          <Badge
            key="dolittle"
            label={`DOL ${dolittleScore}% (${prospect.dolittle_confidence ?? "MED"})`}
            tone={getDolittleTone(prospect.dolittle_score)}
            borderStyle={getConfidenceBorder(prospect.dolittle_confidence)}
          />
        )
      : null,
  ].filter(Boolean);

  const coverageItems = [
    prospectExtras.zone_route_pff
      ? <Badge key="zone" label={`Zone ${prospectExtras.zone_route_pff}`} tone={getCoverageTone(prospectExtras.zone_route_pff)} />
      : null,
    prospectExtras.man_route_pff
      ? <Badge key="man" label={`Man ${prospectExtras.man_route_pff}`} tone={getCoverageTone(prospectExtras.man_route_pff)} />
      : null,
    <Badge
      key="alignment"
      label={getAlignmentLabel(prospectExtras)}
      tone={{ bg: "rgba(96,165,250,0.12)", color: "#93c5fd", border: "rgba(96,165,250,0.30)" }}
    />,
  ].filter(Boolean);

  if (analyticsItems.length === 0 && coverageItems.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      {analyticsItems.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{analyticsItems}</div>}
      {coverageItems.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700 }}>Coverage</span>
          {coverageItems}
        </div>
      )}
    </div>
  );
}

function Badge({
  label,
  tone,
  borderStyle = "solid",
}: {
  label: string;
  tone: { bg: string; color: string; border: string };
  borderStyle?: "solid" | "dashed";
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.2,
        background: tone.bg,
        color: tone.color,
        border: `1px ${borderStyle} ${tone.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function DisagreementPanel({
  title,
  accent,
  description,
  items,
}: {
  title: string;
  accent: string;
  description: string;
  items: Array<{ prospect: Prospect; type: DisagreementType; delta: number; adpTier: string }>;
}) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 10 }}>
        <div>
          <div className="label" style={{ color: accent, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{description}</div>
        </div>
      </div>
      {items.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(({ prospect, adpTier }) => (
            <div key={`${title}-${prospect.player_name}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  <PlayerLink name={prospect.player_name} />
                </div>
                <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                  {normalizeTier(prospect.tier) ?? "-"} vs ADP {cleanText(prospect.consensus_adp) ?? "-"} ({adpTier})
                </div>
              </div>
              <div style={{ color: accent, fontWeight: 700, whiteSpace: "nowrap" }}>{prospect.position ?? "-"}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No clear flags in the current filter.</div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "var(--text-dim)" }}>{label}: </span>
      <span className="font-mono" style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function TableSkeleton() {
  return <div className="animate-pulse" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, height: 400 }} />;
}

function ErrorState({ message }: { message: string }) {
  return <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 40, textAlign: "center", color: "var(--red)" }}>Error: {message}</div>;
}

function EmptyState() {
  return <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No prospect data available</div>;
}
