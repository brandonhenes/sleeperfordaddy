import { useState, useEffect } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import { PlayerLink } from "../components/ui";
import { posColor } from "../lib/position-colors";
import { useOverview } from "../hooks/use-sleeper";
import { useWaiverWire, type WaiverPlayer } from "../hooks/use-waiver-wire";

type PosFilter = "ALL" | "QB" | "RB" | "WR" | "TE";

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
} as const;

const thStyle = {
  textAlign: "left" as const,
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 600 as const,
  color: "var(--text-muted)",
  letterSpacing: 0.5,
};

function LeagueSelector({
  leagues,
  selected,
  onChange,
}: {
  leagues: { league_id: string; name: string }[];
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ ...cardStyle, padding: 16, marginTop: 16 }}>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "var(--dark-base)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 14,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        <option value="" disabled>Select a league...</option>
        {leagues.map((l) => (
          <option key={l.league_id} value={l.league_id}>{l.name}</option>
        ))}
      </select>
    </div>
  );
}

function WaiverTable({ players, filter }: { players: WaiverPlayer[]; filter: PosFilter }) {
  const filtered = filter === "ALL" ? players : players.filter((p) => p.position === filter);

  if (filtered.length === 0) {
    return (
      <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No free agents found{filter !== "ALL" ? ` at ${filter}` : ""}
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Player", "Pos", "Team", "Age", "Edge", "FC", "KTC", "DP", "Agreement", "Curve", ""].map((h) => (
              <th key={h} style={thStyle}>{h.toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.player_id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <PlayerLink name={p.full_name} />
                  {p.hidden_gem && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        padding: "1px 5px",
                        borderRadius: 3,
                        background: "rgba(245,158,11,0.15)",
                        color: "var(--amber)",
                        letterSpacing: 0.5,
                      }}
                    >
                      GEM
                    </span>
                  )}
                </div>
              </td>
              <td style={{ padding: "10px 12px", color: posColor(p.position), fontWeight: 600 }}>
                {p.position}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{p.team}</td>
              <td style={{ padding: "10px 12px", color: "var(--text-dim)" }}>{p.age ?? "-"}</td>
              <td style={{ padding: "10px 12px" }}>
                <EdgeScoreBadge score={p.edge_score} />
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-dim)" }}>
                {p.fc_score != null ? p.fc_score.toFixed(1) : "-"}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-dim)" }}>
                {p.ktc_score != null ? p.ktc_score.toFixed(1) : "-"}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-dim)" }}>
                {p.dp_score != null ? p.dp_score.toFixed(1) : "-"}
              </td>
              <td style={{ padding: "10px 12px" }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: p.source_agreement === "high" ? "#22c55e" : p.source_agreement === "medium" ? "#eab308" : "#ef4444",
                  }}
                >
                  {p.source_agreement.toUpperCase()}
                </span>
              </td>
              <td style={{ padding: "10px 12px" }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: p.age_curve.zone === "Ascent" ? "#22c55e" : p.age_curve.zone === "Peak" ? "#f59e0b" : "#ef4444",
                  }}
                >
                  {p.age_curve.zone}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WaiverContent() {
  const params = useParams<{ username: string }>();
  const storedUser = typeof window !== "undefined" ? localStorage.getItem("edge_username") ?? "" : "";
  const username = params.username ?? storedUser;
  const { data: overview, isLoading: overviewLoading } = useOverview(username);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");
  const [posFilter, setPosFilter] = useState<PosFilter>("ALL");

  const leagues: { league_id: string; name: string }[] = [];
  if (overview?.league_groups) {
    for (const g of overview.league_groups) {
      if (g.leagues.length > 0) {
        leagues.push({ league_id: g.leagues[g.leagues.length - 1], name: g.name });
      }
    }
  }

  useEffect(() => {
    if (leagues.length > 0 && !selectedLeagueId) {
      setSelectedLeagueId(leagues[0].league_id);
    }
  }, [leagues.length, selectedLeagueId]);

  const { data: waiverData, isLoading: waiverLoading } = useWaiverWire(selectedLeagueId);
  const players = waiverData?.players ?? [];
  const warning = waiverData?.warning ?? null;

  if (overviewLoading) {
    return <div className="animate-pulse" style={{ ...cardStyle, height: 60, marginTop: 16 }} />;
  }

  if (leagues.length === 0) {
    return (
      <div style={{ ...cardStyle, padding: 40, marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No leagues found. Sync your account first.
      </div>
    );
  }

  return (
    <>
      <LeagueSelector leagues={leagues} selected={selectedLeagueId} onChange={setSelectedLeagueId} />

      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {(["ALL", "QB", "RB", "WR", "TE"] as PosFilter[]).map((pos) => (
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
            }}
          >
            {pos}
          </button>
        ))}
      </div>

      {warning && (
        <div
          style={{
            ...cardStyle,
            marginTop: 12,
            padding: 14,
            borderColor: "#f59e0b",
            background: "rgba(245,158,11,0.12)",
            color: "#fde68a",
            fontSize: 13,
          }}
        >
          {warning}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {waiverLoading ? (
          <div style={{ display: "grid", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse" style={{ ...cardStyle, height: 60 }} />
            ))}
          </div>
        ) : (
          <WaiverTable players={players} filter={posFilter} />
        )}
      </div>
    </>
  );
}

export default function WaiverWire() {
  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Waiver Wire</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Free agents available in your leagues, sorted by Edge Score
        </p>
      </div>
      <WaiverContent />
    </AppShell>
  );
}
