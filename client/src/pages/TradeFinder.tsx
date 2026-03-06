import { useState } from "react";
import { useParams, Link } from "wouter";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import { PlayerLink } from "../components/ui";
import { useEnsureUser } from "../hooks/use-ensure-user";
import { usePowerRankings } from "../hooks/use-power-rankings";
import { useTradeSuggestions } from "../hooks/use-trade-finder";
import type { TradeSuggestion, TradePackage, TradePackageAsset } from "../../../shared/types";

const POS_COLOR: Record<string, string> = {
  QB: "#e15241",
  RB: "#54b948",
  WR: "#539bf5",
  TE: "#f0a33b",
};

function posColor(position: string): string {
  return POS_COLOR[position] ?? "var(--text-muted)";
}

function fairnessLabel(fairness: string): string {
  if (fairness === "fair") return "FAIR";
  if (fairness === "slight_edge") return "SLIGHT EDGE";
  return "LOPSIDED";
}

function AssetRow({ asset }: { asset: TradePackageAsset }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
        borderBottom: "1px solid var(--border)",
        fontSize: 13,
      }}
    >
      <span
        style={{
          display: "inline-block",
          background:
            asset.edge_score >= 80
              ? "var(--green)"
              : asset.edge_score >= 60
                ? "var(--amber)"
                : asset.edge_score >= 45
                  ? "var(--text-muted)"
                  : "var(--red)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          borderRadius: 4,
          padding: "1px 6px",
          minWidth: 28,
          textAlign: "center",
        }}
      >
        {Math.round(asset.edge_score)}
      </span>
      {asset.asset_type === "pick" && (
        <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 10 }}>PICK</span>
      )}
      {asset.position && (
        <span style={{ color: posColor(asset.position), fontWeight: 700, fontSize: 10 }}>
          {asset.position}
        </span>
      )}
      <PlayerLink name={asset.label} style={{ flex: 1, fontWeight: 500 }} />
    </div>
  );
}

function PackageView({ pkg }: { pkg: TradePackage }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#ef4444",
              letterSpacing: 0.5,
              marginBottom: 8,
              borderBottom: "2px solid #ef4444",
              paddingBottom: 4,
            }}
          >
            YOU SEND ({pkg.send_total.toFixed(0)} edge)
          </div>
          {pkg.you_send.map((asset, i) => (
            <AssetRow key={`send-${i}-${asset.label}`} asset={asset} />
          ))}
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#22c55e",
              letterSpacing: 0.5,
              marginBottom: 8,
              borderBottom: "2px solid #22c55e",
              paddingBottom: 4,
            }}
          >
            YOU RECEIVE ({pkg.receive_total.toFixed(0)} edge)
          </div>
          {pkg.you_receive.map((asset, i) => (
            <AssetRow key={`receive-${i}-${asset.label}`} asset={asset} />
          ))}
        </div>
      </div>

      <div
        style={{
          textAlign: "center",
          fontSize: 13,
          fontWeight: 700,
          marginTop: 12,
          padding: "8px 0",
          color: pkg.delta >= 0 ? "var(--green)" : "var(--red)",
        }}
      >
        {pkg.delta >= 0 ? "You win" : "You overpay"} by {Math.abs(pkg.delta).toFixed(1)} points
        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600 }}>
          ({fairnessLabel(pkg.fairness)})
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginTop: 12,
          fontSize: 12,
        }}
      >
        <div style={{ background: "var(--dark-base)", borderRadius: 8, padding: "10px 14px" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--amber)",
              marginBottom: 4,
              letterSpacing: 0.5,
            }}
          >
            WHY YOU DO IT
          </div>
          <div style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>{pkg.why_you_do_it}</div>
        </div>
        <div style={{ background: "var(--dark-base)", borderRadius: 8, padding: "10px 14px" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#3b82f6",
              marginBottom: 4,
              letterSpacing: 0.5,
            }}
          >
            WHY THEY ACCEPT
          </div>
          <div style={{ color: "var(--text-dim)", lineHeight: 1.5 }}>{pkg.why_they_accept}</div>
        </div>
      </div>

      {pkg.sweetener_hint && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 14px",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--amber)",
          }}
        >
          {pkg.sweetener_hint}
        </div>
      )}
    </div>
  );
}

function PartnerCard({ suggestion }: { suggestion: TradeSuggestion }) {
  const [open, setOpen] = useState(false);
  const [activePackage, setActivePackage] = useState(0);
  const { partner, packages } = suggestion;
  const pkg = packages[activePackage];

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          background: "none",
          border: "none",
          color: "var(--text)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background:
              partner.compatibility_score >= 60
                ? "var(--green)"
                : partner.compatibility_score >= 30
                  ? "var(--amber)"
                  : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          {partner.compatibility_score}
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{partner.display_name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {partner.archetype} | {packages.length} package{packages.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            maxWidth: 300,
            textAlign: "right",
          }}
        >
          {partner.compatibility_reason}
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
          {open ? "?" : "?"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          {packages.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {packages.map((p, i) => (
                <button
                  key={`package-tab-${i}-${p.type}`}
                  onClick={() => setActivePackage(i)}
                  style={{
                    background: activePackage === i ? "var(--amber)" : "var(--dark-base)",
                    color: activePackage === i ? "var(--dark-base)" : "var(--text-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {pkg && <PackageView pkg={pkg} />}
        </div>
      )}
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

  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    error: suggestionsError,
  } = useTradeSuggestions(phase === "ready" ? username : "", selectedLeague);

  if (phase === "checking" || phase === "syncing") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Finder</h1>
        </div>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--amber)",
            fontSize: 14,
          }}
        >
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
          Suggested trades based on roster composition, archetypes, and draft capital
        </p>
        <FreshnessBar />
      </div>

      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 16,
          marginTop: 8,
        }}
      >
        <label
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
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
            {leagues?.map((league) => (
              <option key={league.league_id} value={league.league_id}>
                {league.league_name} ({league.mode.toUpperCase()}, {league.rosters.length} teams)
              </option>
            ))}
          </select>
        )}
      </div>

      {!selectedLeague && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "48px 24px",
            marginTop: 16,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          Select a league above to find trade opportunities
        </div>
      )}

      {selectedLeague && suggestionsLoading && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "48px 24px",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "var(--amber)",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <span className="animate-pulse">Analyzing rosters and building package variants...</span>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
            Scoring partner compatibility and constructing balanced, consolidation, and picks-heavy offers
          </p>
        </div>
      )}

      {selectedLeague && suggestionsError && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "48px 24px",
            marginTop: 16,
            textAlign: "center",
            color: "var(--red)",
            fontSize: 13,
          }}
        >
          Failed to load trade suggestions. Try again later.
        </div>
      )}

      {selectedLeague && !suggestionsLoading && suggestions && suggestions.length === 0 && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "48px 24px",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
            No trade partner fits found for this league
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            This can happen if there is limited need overlap. Try the Trade Calculator for custom scenarios.
          </p>
          <Link
            href="/trade-calculator"
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {suggestions.length} partner{suggestions.length !== 1 ? "s" : ""} found
            </span>
          </div>

          {suggestions.map((suggestion, i) => (
            <PartnerCard key={`${suggestion.partner.roster_id}-${i}`} suggestion={suggestion} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
