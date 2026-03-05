import { useState } from "react";
import { useParams, Link } from "wouter";
import AppShell from "../components/AppShell";
import { useEnsureUser } from "../hooks/use-ensure-user";
import { usePowerRankings } from "../hooks/use-power-rankings";
import { useTradeSuggestions } from "../hooks/use-trade-finder";
import type { TradeSuggestion, EvaluatedAsset } from "../../../shared/types";

const POS_COLOR: Record<string, string> = {
  QB: "#e15241", RB: "#54b948", WR: "#539bf5", TE: "#f0a33b",
};

function posColor(label: string): string {
  for (const [pos, color] of Object.entries(POS_COLOR)) {
    if (label.toUpperCase().includes(pos)) return color;
  }
  return "var(--amber)";
}

function fairnessColor(f: string): string {
  if (f === "fair") return "var(--green)";
  if (f === "slight_edge") return "var(--amber)";
  return "var(--red)";
}

function fairnessLabel(f: string): string {
  if (f === "fair") return "Fair";
  if (f === "slight_edge") return "Slight Edge";
  return "Lopsided";
}

function EdgeBadge({ score }: { score: number }) {
  const bg =
    score >= 80 ? "var(--green)" :
    score >= 60 ? "var(--amber)" :
    score >= 45 ? "var(--text-muted)" : "var(--red)";
  return (
    <span style={{
      display: "inline-block",
      background: bg,
      color: "#fff",
      fontSize: 11,
      fontWeight: 700,
      borderRadius: 4,
      padding: "1px 6px",
      minWidth: 28,
      textAlign: "center",
    }}>
      {score}
    </span>
  );
}

function AssetChip({ asset }: { asset: EvaluatedAsset }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 0",
    }}>
      <EdgeBadge score={asset.edge_score} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>{asset.label}</span>
      <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
        {asset.fc_score != null && (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>FC:{asset.fc_score}</span>
        )}
        {asset.ktc_score != null && (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>KTC:{asset.ktc_score}</span>
        )}
        {asset.dp_score != null && (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>DP:{asset.dp_score}</span>
        )}
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion, username }: { suggestion: TradeSuggestion; username: string }) {
  const { team_a, team_b, fairness } = suggestion;
  const aTotal = team_a.gives.reduce((s, a) => s + a.edge_score, 0);
  const bTotal = team_b.gives.reduce((s, a) => s + a.edge_score, 0);
  const delta = aTotal - bTotal;

  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    }}>
      {/* Header: fairness + mutual benefit */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: fairnessColor(fairness),
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}>
          {fairnessLabel(fairness)} Trade
        </span>
        {delta !== 0 && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {delta > 0 ? "You" : team_b.display_name} gets +{Math.abs(delta).toFixed(0)} edge
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Side A: You give */}
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 6,
            borderBottom: "2px solid #4a9eff",
            paddingBottom: 4,
          }}>
            You Send
          </div>
          {team_a.gives.map((a, i) => (
            <AssetChip key={i} asset={a} />
          ))}
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
            {team_a.reason}
          </div>
        </div>

        {/* Side B: You receive */}
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 6,
            borderBottom: "2px solid #a855f7",
            paddingBottom: 4,
          }}>
            You Receive from {team_b.display_name}
          </div>
          {team_b.gives.map((a, i) => (
            <AssetChip key={i} asset={a} />
          ))}
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
            {team_b.reason}
          </div>
        </div>
      </div>

      {/* Total row */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 10,
        paddingTop: 8,
        borderTop: "1px solid var(--border)",
        fontSize: 12,
      }}>
        <span style={{ color: "var(--text-muted)" }}>
          Send: <strong style={{ color: "var(--text)" }}>{aTotal.toFixed(0)}</strong> edge
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          Receive: <strong style={{ color: "var(--text)" }}>{bTotal.toFixed(0)}</strong> edge
        </span>
      </div>
    </div>
  );
}

export default function TradeFinder() {
  const { username } = useParams<{ username: string }>();
  const { phase } = useEnsureUser(username);
  const [selectedLeague, setSelectedLeague] = useState<string>("");

  const { data: leagues, isLoading: leaguesLoading } = usePowerRankings(
    phase === "ready" ? username : ""
  );

  const { data: suggestions, isLoading: suggestionsLoading, error: suggestionsError } =
    useTradeSuggestions(
      phase === "ready" ? username : "",
      selectedLeague
    );

  // Sync/loading states
  if (phase === "checking" || phase === "syncing") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Finder</h1>
        </div>
        <div style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "48px 24px",
          textAlign: "center",
          color: "var(--amber)",
          fontSize: 14,
        }}>
          <span className="animate-pulse">Loading...</span>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Finder</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Suggested trades based on roster composition and positional needs
        </p>
      </div>

      {/* League Selector */}
      <div style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 16,
        marginTop: 8,
      }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Select League
        </label>
        {leaguesLoading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
            <span className="animate-pulse">Loading leagues...</span>
          </div>
        ) : (
          <select
            value={selectedLeague}
            onChange={(e) => setSelectedLeague(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 8,
              padding: "10px 12px",
              background: "var(--dark-base)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <option value="">Choose a league...</option>
            {leagues?.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.league_name} ({l.mode.toUpperCase()}, {l.rosters.length} teams)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Results */}
      {!selectedLeague && (
        <div style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "48px 24px",
          marginTop: 16,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}>
          Select a league above to find trade opportunities
        </div>
      )}

      {selectedLeague && suggestionsLoading && (
        <div style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "48px 24px",
          marginTop: 16,
          textAlign: "center",
        }}>
          <div style={{ color: "var(--amber)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span className="animate-pulse">Analyzing rosters and finding trades...</span>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
            Comparing positional strengths, identifying surpluses and needs across all teams
          </p>
        </div>
      )}

      {selectedLeague && suggestionsError && (
        <div style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "48px 24px",
          marginTop: 16,
          textAlign: "center",
          color: "var(--red)",
          fontSize: 13,
        }}>
          Failed to load trade suggestions. Try again later.
        </div>
      )}

      {selectedLeague && !suggestionsLoading && suggestions && suggestions.length === 0 && (
        <div style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "48px 24px",
          marginTop: 16,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
            No mutual-benefit trades found for this league
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            This can happen if your roster is well-balanced or league-mates don't have complementary surpluses.
            Try the Trade Calculator for custom scenarios.
          </p>
          <Link
            href={`/trade-calculator`}
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "8px 16px",
              background: "linear-gradient(135deg, var(--amber), var(--amber-dark))",
              color: "var(--dark-base)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Open Trade Calculator
          </Link>
        </div>
      )}

      {selectedLeague && !suggestionsLoading && suggestions && suggestions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {suggestions.length} trade{suggestions.length !== 1 ? "s" : ""} found
            </span>
          </div>

          {suggestions.map((s, i) => (
            <SuggestionCard key={i} suggestion={s} username={username} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
