import { useState } from "react";
import { PositionBadge } from "../../components/ui";
import type { DraftPickContext } from "@shared/types";

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

export default function PickCard({ pick }: { pick: DraftPickContext }) {
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
              <PositionBadge position={n.position} />
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
          Trade this pick -&gt;
        </a>
      </div>
    </div>
  );
}
