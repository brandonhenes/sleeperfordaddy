import { useState, useMemo } from "react";
import { useProspects, type Prospect } from "../../hooks/use-market";
import { posColor } from "../../lib/position-colors";
import { PlayerLink } from "../ui";

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  elite:  { bg: "rgba(245,158,11,0.15)", text: "var(--amber)", label: "ELITE" },
  ELITE:  { bg: "rgba(245,158,11,0.15)", text: "var(--amber)", label: "ELITE" },
  day1:   { bg: "rgba(96,165,250,0.15)", text: "var(--blue)", label: "DAY 1" },
  DAY1:   { bg: "rgba(96,165,250,0.15)", text: "var(--blue)", label: "DAY 1" },
  day2:   { bg: "rgba(74,222,128,0.15)", text: "var(--green)", label: "DAY 2" },
  DAY2:   { bg: "rgba(74,222,128,0.15)", text: "var(--green)", label: "DAY 2" },
  day3:   { bg: "rgba(148,163,184,0.15)", text: "var(--text-dim)", label: "DAY 3" },
  DAY3:   { bg: "rgba(148,163,184,0.15)", text: "var(--text-dim)", label: "DAY 3" },
};

function TierBadge({ tier }: { tier: string | null }) {
  const s = TIER_STYLES[tier ?? ""] || TIER_STYLES.day3;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

const POS_FILTERS = ["ALL", "QB", "RB", "WR", "TE"] as const;

export default function ProspectBoardTab() {
  const { data, isLoading, error } = useProspects();
  const [posFilter, setPosFilter] = useState<string>("ALL");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (posFilter === "ALL") return data;
    return data.filter((p) => p.position === posFilter);
  }, [data, posFilter]);

  if (isLoading) return <TableSkeleton />;
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {POS_FILTERS.map((pos) => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            style={{
              background: posFilter === pos ? "var(--amber)" : "var(--card)",
              color: posFilter === pos ? "var(--dark-base)" : "var(--text-dim)",
              border: `1px solid ${posFilter === pos ? "var(--amber)" : "var(--border)"}`,
              borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: 0.5,
            }}
          >
            {pos}
          </button>
        ))}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["RANK", "PLAYER", "POS", "SCHOOL", "TIER", "COMP", "SIZE", "DRAFT"].map((h) => (
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
  const [expanded, setExpanded] = useState(false);
  const hasDetail = p.scouting_notes || p.fp_scouting_notes || (p.key_strengths && p.key_strengths.length > 0) || (p.key_concerns && p.key_concerns.length > 0);
  const size = p.height && p.weight ? `${p.height} / ${p.weight}` : p.height ?? p.weight ?? null;

  return (
    <>
      <tr
        onClick={() => hasDetail && setExpanded(!expanded)}
        style={{ borderBottom: expanded ? "none" : "1px solid var(--border)", cursor: hasDetail ? "pointer" : "default" }}
      >
        <td className="font-mono" style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-muted)" }}>
          {p.fantasypros_rank ?? "—"}
        </td>
        <td style={{ padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PlayerLink name={p.player_name} />
            {p.age && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>({p.age})</span>}
            {hasDetail && (
              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{expanded ? "\u25B2" : "\u25BC"}</span>
            )}
          </div>
          {p.notes && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{p.notes}</div>}
        </td>
        <td style={{ padding: "10px 14px" }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: posColor(p.position ?? "") }}>{p.position}</span>
        </td>
        <td style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-dim)" }}>{p.school ?? "—"}</td>
        <td style={{ padding: "10px 14px" }}><TierBadge tier={p.tier} /></td>
        <td style={{ padding: "10px 14px", fontSize: 13, fontStyle: "italic", color: "var(--text-dim)" }}>
          {p.consensus_comp ?? "—"}
        </td>
        <td className="font-mono" style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-dim)" }}>
          {size ?? "—"}
        </td>
        <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-dim)" }}>
          {p.draft_capital ?? "—"}
        </td>
      </tr>
      {expanded && <ExpandedDetail prospect={p} />}
    </>
  );
}

function ExpandedDetail({ prospect: p }: { prospect: Prospect }) {
  const hasCombine = p.combine_40 || p.combine_vertical || p.combine_shuttle || p.combine_bench;
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td colSpan={8} style={{ padding: "0 14px 14px" }}>
        <div style={{ background: "var(--dark-base)", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* All comps */}
          {p.all_comps && p.all_comps.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>PLAYER COMPS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {p.all_comps.map((c, i) => (
                  <span key={i} style={{ fontSize: 12, background: "var(--card)", border: "1px solid var(--border)", padding: "3px 8px", borderRadius: 4 }}>
                    {c.comp} <span style={{ color: "var(--text-dim)", fontSize: 10 }}>({c.source})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Strengths + Concerns side by side */}
          {((p.key_strengths && p.key_strengths.length > 0) || (p.key_concerns && p.key_concerns.length > 0)) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {p.key_strengths && p.key_strengths.length > 0 && (
                <div>
                  <div className="label" style={{ color: "#22c55e", marginBottom: 6 }}>STRENGTHS</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    {p.key_strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              {p.key_concerns && p.key_concerns.length > 0 && (
                <div>
                  <div className="label" style={{ color: "#ef4444", marginBottom: 6 }}>CONCERNS</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    {p.key_concerns.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Combine / Measurables */}
          {hasCombine && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>MEASURABLES</div>
              <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                {p.combine_40 && <Stat label="40" value={p.combine_40} />}
                {p.combine_vertical && <Stat label="Vert" value={p.combine_vertical} />}
                {p.combine_shuttle && <Stat label="Shuttle" value={p.combine_shuttle} />}
                {p.combine_bench && <Stat label="Bench" value={p.combine_bench} />}
              </div>
            </div>
          )}

          {/* Scouting notes */}
          {p.scouting_notes && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>SCOUTING NOTES</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {p.scouting_notes}
              </div>
            </div>
          )}

          {/* FP scouting notes */}
          {p.fp_scouting_notes && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>FANTASYPROS SCOUTING REPORT</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {p.fp_scouting_notes}
              </div>
            </div>
          )}

          {/* Landing spot / ADP */}
          {(p.landing_spot || p.current_adp) && (
            <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
              {p.landing_spot && <Stat label="Landing Spot" value={p.landing_spot} />}
              {p.current_adp && <Stat label="ADP" value={p.current_adp} />}
            </div>
          )}
        </div>
      </td>
    </tr>
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
