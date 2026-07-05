import { useState } from "react";
import { PlayerLink } from "../../components/ui";
import type { Prospect } from "@shared/types";
import type { ProspectRanking } from "@shared/types";
import { posColor } from "../../lib/position-colors";
import { cleanText, formatMarketNumber, scoutingReport } from "./rookie-draft-utils";

type ProspectCardProps = {
  prospect: Prospect;
  overallRank: number;
  tierColor: string;
  isComparing: boolean;
  onToggleCompare: () => void;
  isWatched: boolean;
  onToggleWatch: () => void;
  ranking?: ProspectRanking;
};

export default function ProspectCard({
  prospect: p,
  overallRank,
  tierColor,
  isComparing,
  onToggleCompare,
  isWatched,
  onToggleWatch,
  ranking,
}: ProspectCardProps) {
  const [expanded, setExpanded] = useState(false);
  const report = scoutingReport(p);
  const strengths = (p.key_strengths ?? []).map(cleanText).filter((s): s is string => !!s);
  const concerns = (p.key_concerns ?? []).map(cleanText).filter((c): c is string => !!c);

  const primaryComp =
    cleanText(p.consensus_comp) ??
    (p.all_comps && p.all_comps.length > 0 ? cleanText(p.all_comps[0].comp) : null);

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
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px", cursor: "pointer" }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompare();
          }}
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            flexShrink: 0,
            border: isComparing ? "2px solid var(--amber)" : "1px solid var(--border)",
            background: isComparing ? "var(--amber)" : "transparent",
            color: isComparing ? "var(--dark-base)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {isComparing ? "\u2713" : ""}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatch();
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            padding: 0,
            lineHeight: 1,
            flexShrink: 0,
            color: isWatched ? "#f59e0b" : "var(--text-muted)",
            opacity: isWatched ? 1 : 0.4,
          }}
          title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
        >
          {"\u2605"}
        </button>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "var(--card)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 14,
            color: tierColor,
            flexShrink: 0,
          }}
        >
          {overallRank}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <PlayerLink name={p.player_name} style={{ fontSize: 15, fontWeight: 700 }} />
            {p.age != null && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>({p.age})</span>}
            <span style={{ fontWeight: 700, fontSize: 11, color: posColor(p.position ?? "") }}>{p.position}</span>
            {p.school && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.school}</span>}
            {size && <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>{size}</span>}
            {primaryComp && (
              <span style={{ fontSize: 11, fontStyle: "italic", color: "var(--text-dim)" }}>
                Comp: {primaryComp}
              </span>
            )}
            {draftCapital && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  background: "var(--card)",
                  padding: "1px 6px",
                  borderRadius: 3,
                  border: "1px solid var(--border)",
                }}
              >
                {draftCapital}
              </span>
            )}
            {ranking?.dp_value_sf != null && (
              <span
                style={{
                  fontSize: 11,
                  color: "#93c5fd",
                  background: "rgba(59,130,246,0.12)",
                  padding: "1px 6px",
                  borderRadius: 3,
                  border: "1px solid rgba(59,130,246,0.25)",
                }}
              >
                DP SF {formatMarketNumber(ranking.dp_value_sf)}
              </span>
            )}
            {ranking?.fp_ecr_sf != null && (
              <span
                style={{
                  fontSize: 11,
                  color: "#c4b5fd",
                  background: "rgba(139,92,246,0.12)",
                  padding: "1px 6px",
                  borderRadius: 3,
                  border: "1px solid rgba(139,92,246,0.25)",
                }}
              >
                ECR {formatMarketNumber(ranking.fp_ecr_sf)}
              </span>
            )}
            {cleanText(p.landing_spot) && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(34,197,94,0.12)",
                  color: "var(--green)",
                  border: "1px solid rgba(34,197,94,0.25)",
                }}
              >
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
                <span
                  key={`s-${i}`}
                  style={{
                    fontSize: 10,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: "rgba(34,197,94,0.12)",
                    color: "#86efac",
                    border: "1px solid rgba(34,197,94,0.25)",
                  }}
                >
                  {s.length > 50 ? `${s.slice(0, 50)}...` : s}
                </span>
              ))}
              {concerns.slice(0, 2).map((c, i) => (
                <span
                  key={`c-${i}`}
                  style={{
                    fontSize: 10,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: "rgba(239,68,68,0.12)",
                    color: "#fca5a5",
                    border: "1px solid rgba(239,68,68,0.25)",
                  }}
                >
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
          <div
            style={{
              background: "var(--dark-base)",
              borderRadius: 10,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {p.all_comps && p.all_comps.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>PLAYER COMPS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.all_comps.map((c, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 12,
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        padding: "4px 10px",
                        borderRadius: 6,
                      }}
                    >
                      {cleanText(c.comp) ?? "-"}{" "}
                      <span style={{ color: "var(--text-dim)", fontSize: 10 }}>
                        ({cleanText(c.source) ?? "?"})
                      </span>
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
                        <span
                          key={i}
                          style={{
                            fontSize: 11,
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: "rgba(34,197,94,0.16)",
                            color: "#86efac",
                            border: "1px solid rgba(34,197,94,0.35)",
                          }}
                        >
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
                        <span
                          key={i}
                          style={{
                            fontSize: 11,
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: "rgba(239,68,68,0.16)",
                            color: "#fca5a5",
                            border: "1px solid rgba(239,68,68,0.35)",
                          }}
                        >
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
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {report}
                </div>
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
                  <MarketMetric label="ECR SD" value={formatMarketNumber(ranking.fp_ecr_sd, 1)} tone={sdTone} />
                </div>
              </div>
            )}

            {cleanText(p.landing_spot) && (
              <div
                style={{
                  padding: "8px 14px",
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.2)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--green)",
                  fontWeight: 600,
                }}
              >
                Drafted: {p.landing_spot}
              </div>
            )}

            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-dim)", flexWrap: "wrap" }}>
              {cleanText(p.current_adp) && (
                <span>
                  Rookie ADP: <strong style={{ color: "var(--text)" }}>{p.current_adp}</strong>
                </span>
              )}
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

function MeasurableBar({ label, value, unit }: { label: string; value: string; unit: string }) {
  const num = parseFloat(value);
  if (isNaN(num)) return null;

  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="font-mono" style={{ fontSize: 14, fontWeight: 700 }}>
          {value}
          {unit}
        </span>
      </div>
    </div>
  );
}
