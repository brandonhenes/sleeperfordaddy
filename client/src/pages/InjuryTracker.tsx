import { useState } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import EdgeScoreBadge from "../components/EdgeScoreBadge";
import { PlayerLink } from "../components/ui";
import { posColor } from "../lib/position-colors";
import { useInjuredPlayers, useBuyingWindows } from "../hooks/use-injury-tracker";
import type { InjuredPlayerView, BuyingWindow } from "../../../shared/types";

type Tab = "injuries" | "buying";

// ─── Status Helpers ───

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "ir" || s === "pup" || s === "out") return "#ef4444";
  if (s === "doubtful") return "#f97316";
  if (s === "questionable") return "#eab308";
  return "#94a3b8";
}

function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "ir") return "IR";
  if (s === "pup") return "PUP";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ─── Risk Summary ───

function RiskSummary({ injuries }: { injuries: InjuredPlayerView[] }) {
  const outCount = injuries.filter((p) =>
    ["out", "ir", "pup"].includes(p.injury_status.toLowerCase())
  ).length;
  const totalSlots = injuries.reduce((s, p) => s + p.league_count, 0);
  const highest = injuries.length > 0
    ? injuries.reduce((a, b) => (b.league_count > a.league_count ? b : a))
    : null;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "16px 20px",
        marginTop: 16,
        display: "flex",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#ef4444" }}>{outCount}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Players OUT/IR</div>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--amber)" }}>{totalSlots}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Affected league slots</div>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{injuries.length}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total injured</div>
      </div>
      {highest && (
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Highest exposure risk</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {highest.full_name} ({highest.league_count} leagues)
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Injury Table ───

function InjuryTable({ injuries }: { injuries: InjuredPlayerView[] }) {
  if (injuries.length === 0) {
    return (
      <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No injured players on your rosters
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Player", "Pos", "Team", "Status", "Injury", "Edge", "Value Change", "Leagues", "Est. Return"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  letterSpacing: 0.5,
                }}
              >
                {h.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {injuries.map((p) => (
            <tr key={p.player_id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "10px 12px" }}>
                <PlayerLink name={p.full_name} />
              </td>
              <td style={{ padding: "10px 12px", color: posColor(p.position), fontWeight: 600 }}>
                {p.position}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{p.team}</td>
              <td style={{ padding: "10px 12px" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    background: statusColor(p.injury_status) + "22",
                    color: statusColor(p.injury_status),
                  }}
                >
                  {statusLabel(p.injury_status)}
                </span>
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-dim)" }}>
                {p.injury_body_part ?? "Unknown"}
              </td>
              <td style={{ padding: "10px 12px" }}>
                <EdgeScoreBadge score={p.current_edge_score} />
              </td>
              <td style={{ padding: "10px 12px" }}>
                {p.value_change_pct != null ? (
                  <span style={{ color: p.value_change_pct < 0 ? "#ef4444" : "#22c55e", fontWeight: 600 }}>
                    {p.value_change_pct > 0 ? "+" : ""}{p.value_change_pct.toFixed(1)}%
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>--</span>
                )}
              </td>
              <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                {p.league_count}/{p.total_leagues}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--text-dim)" }}>
                {p.estimated_return_date ?? "Unknown"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Buying Window Card ───

function WindowCard({ window }: { window: BuyingWindow }) {
  const p = window.player;

  return (
    <div style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 36,
            height: 28,
            borderRadius: 5,
            fontSize: 14,
            fontWeight: 700,
            background: "#f59e0b",
            color: "#000",
          }}
          className="font-mono"
        >
          {window.opportunity_score}
        </span>
        <PlayerLink name={p.full_name} style={{ fontSize: 15 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: posColor(p.position) }}>{p.position}</span>
        {p.team && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.team}</span>}
        <span
          style={{
            marginLeft: "auto",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            background: statusColor(p.injury_status) + "22",
            color: statusColor(p.injury_status),
          }}
        >
          {statusLabel(p.injury_status)} - {p.injury_body_part ?? "Unknown"}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 20, fontSize: 13, flexWrap: "wrap" }}>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Edge Score: </span>
          <EdgeScoreBadge score={p.current_edge_score} />
        </div>
        {p.value_change_pct != null && (
          <div>
            <span style={{ color: "var(--text-muted)" }}>Value Drop: </span>
            <span style={{ color: "#ef4444", fontWeight: 700 }}>{p.value_change_pct.toFixed(1)}%</span>
          </div>
        )}
        {p.estimated_return_date && (
          <div>
            <span style={{ color: "var(--text-muted)" }}>Return: </span>
            <span style={{ fontWeight: 600 }}>{p.estimated_return_date}</span>
          </div>
        )}
      </div>

      {/* Reasons */}
      {window.buy_reasons.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          {window.buy_reasons.map((r, i) => (
            <span key={i} style={{ color: "#22c55e" }}>+ {r}</span>
          ))}
          {window.risk_factors.map((r, i) => (
            <span key={`r-${i}`} style={{ color: "#f97316" }}>! {r}</span>
          ))}
        </div>
      )}

      {/* Target leagues */}
      {window.leagues_to_target.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
            TARGET IN THESE LEAGUES
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {window.leagues_to_target.map((l) => (
              <a
                key={l.league_id}
                href={`https://sleeper.com/leagues/${l.league_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "rgba(96,165,250,0.12)",
                  color: "var(--blue)",
                  textDecoration: "none",
                  border: "1px solid rgba(96,165,250,0.2)",
                }}
              >
                {l.league_name} ({l.owner_display_name})
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ───

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
} as const;

export default function InjuryTracker() {
  const { username } = useParams<{ username: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("injuries");
  const { data: injuries, isLoading: injuriesLoading, error: injuriesError } = useInjuredPlayers(username ?? "");
  const { data: windows, isLoading: windowsLoading, error: windowsError } = useBuyingWindows(username ?? "");

  const isLoading = activeTab === "injuries" ? injuriesLoading : windowsLoading;
  const error = activeTab === "injuries" ? injuriesError : windowsError;

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
          Injury Tracker
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Monitor injuries across your portfolio and find buying windows
        </p>
      </div>

      {/* Risk summary (only on injuries tab when data loaded) */}
      {activeTab === "injuries" && injuries && injuries.length > 0 && (
        <RiskSummary injuries={injuries} />
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {(["injuries", "buying"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? "var(--amber)" : "var(--card)",
              color: activeTab === tab ? "var(--dark-base)" : "var(--text-dim)",
              border: `1px solid ${activeTab === tab ? "var(--amber)" : "var(--border)"}`,
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 0.3,
            }}
          >
            {tab === "injuries" ? `My Injuries${injuries ? ` (${injuries.length})` : ""}` : `Buying Windows${windows ? ` (${windows.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ marginTop: 16 }}>
        {isLoading ? (
          <div style={{ display: "grid", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse" style={{ ...cardStyle, height: 80 }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "var(--red)" }}>
            Error: {(error as Error).message}
          </div>
        ) : activeTab === "injuries" ? (
          <InjuryTable injuries={injuries ?? []} />
        ) : (windows ?? []).length === 0 ? (
          <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No buying windows detected. This requires value snapshot history from syncs.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {(windows ?? []).map((w) => (
              <WindowCard key={w.player.player_id} window={w} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
