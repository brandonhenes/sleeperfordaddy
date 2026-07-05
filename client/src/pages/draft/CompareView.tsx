import { PositionBadge } from "../../components/ui";
import type { Prospect } from "../../hooks/use-market";
import { cleanText } from "./rookie-draft-utils";
import TierBadge from "./TierBadge";

interface CompareViewProps {
  prospects: Prospect[];
  onBack: () => void;
}

export default function CompareView({ prospects, onBack }: CompareViewProps) {
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

  const gridTemplateColumns = `160px repeat(${prospects.length}, minmax(140px, 1fr))`;

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
        &lt;- Back to Board
      </button>

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            minWidth: Math.max(390, 160 + prospects.length * 140),
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns,
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
                <div style={{ marginTop: 2 }}>
                  <PositionBadge position={p.position} />
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
                gridTemplateColumns,
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
              gridTemplateColumns,
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
              gridTemplateColumns,
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
    </div>
  );
}
