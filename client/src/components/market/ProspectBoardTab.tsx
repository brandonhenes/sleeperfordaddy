import { useState, useMemo } from "react";
import { useProspects, type Prospect } from "../../hooks/use-market";
import { posColor } from "../../lib/position-colors";
import { PlayerLink } from "../ui";

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  elite:  { bg: "rgba(245,158,11,0.15)", text: "var(--amber)", label: "ELITE" },
  day1:   { bg: "rgba(96,165,250,0.15)", text: "var(--blue)", label: "DAY 1" },
  day2:   { bg: "rgba(74,222,128,0.15)", text: "var(--green)", label: "DAY 2" },
  day3:   { bg: "rgba(148,163,184,0.15)", text: "var(--text-dim)", label: "DAY 3" },
};

function TierBadge({ tier }: { tier: string | null }) {
  const s = TIER_STYLES[tier ?? ""] || TIER_STYLES.day3;
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
      {/* Position filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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

      {/* Table */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["RANK", "PLAYER", "POS", "SCHOOL", "TIER", "COMP"].map((h) => (
                <th
                  key={h}
                  className="label"
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
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
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td
        className="font-mono"
        style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-muted)" }}
      >
        {p.fantasypros_rank ?? "—"}
      </td>
      <td style={{ padding: "10px 14px" }}>
        <PlayerLink name={p.player_name} />
        {p.notes && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {p.notes}
          </div>
        )}
      </td>
      <td style={{ padding: "10px 14px" }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: posColor(p.position ?? "") }}>
          {p.position}
        </span>
      </td>
      <td style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-dim)" }}>
        {p.school}
      </td>
      <td style={{ padding: "10px 14px" }}>
        <TierBadge tier={p.tier} />
      </td>
      <td style={{ padding: "10px 14px", fontSize: 13, fontStyle: "italic", color: "var(--text-dim)" }}>
        {p.consensus_comp ?? "—"}
      </td>
    </tr>
  );
}

function TableSkeleton() {
  return (
    <div
      className="animate-pulse"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        height: 400,
      }}
    />
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 40,
        textAlign: "center",
        color: "var(--red)",
      }}
    >
      Error: {message}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 40,
        textAlign: "center",
        color: "var(--text-muted)",
      }}
    >
      No prospect data available
    </div>
  );
}
