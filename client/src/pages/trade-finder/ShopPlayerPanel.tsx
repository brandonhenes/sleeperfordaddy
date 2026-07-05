import type { Dispatch, SetStateAction } from "react";
import type { PortfolioData, ShopOpportunity, ShopPlayerResult } from "@shared/types";
import ShopOpportunityCard from "./ShopOpportunityCard";

export type ShopPathFilter = ShopOpportunity["path"] | null;

const SHOP_AMBITION_OPTIONS = [
  { value: 1, label: "Conservative", desc: "Even swaps, small adds" },
  { value: 2, label: "Moderate", desc: "Player + pick packages" },
  { value: 3, label: "Aggressive", desc: "Big packages, reach for studs" },
];

const SHOP_POSITION_GROUPS = ["QB", "RB", "WR", "TE"];

interface ShopPlayerPanelProps {
  portfolio: PortfolioData | undefined;
  selectedPlayer: string;
  setSelectedPlayer: Dispatch<SetStateAction<string>>;
  shopAmbition: number;
  setShopAmbition: Dispatch<SetStateAction<number>>;
  showShopRedraft: boolean;
  onToggleRedraft: () => void;
  shopPathFilter: ShopPathFilter;
  setShopPathFilter: Dispatch<SetStateAction<ShopPathFilter>>;
  shopLoading: boolean;
  shopError: unknown;
  shopResult: ShopPlayerResult | undefined;
}

export default function ShopPlayerPanel({
  portfolio,
  selectedPlayer,
  setSelectedPlayer,
  shopAmbition,
  setShopAmbition,
  showShopRedraft,
  onToggleRedraft,
  shopPathFilter,
  setShopPathFilter,
  shopLoading,
  shopError,
  shopResult,
}: ShopPlayerPanelProps) {
  const filteredShopResults =
    shopResult?.opportunities.filter((o) => !shopPathFilter || o.path === shopPathFilter) ?? [];
  const shopErrorMessage =
    shopError instanceof Error
      ? shopError.message
      : "Shop a Player could not finish. Try again in a moment.";

  return (
    <div>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
        <button
          type="button"
          onClick={onToggleRedraft}
          style={{
            marginBottom: 12,
            borderRadius: 999,
            padding: "7px 12px",
            border: `1px solid ${showShopRedraft ? "#60a5fa" : "var(--border)"}`,
            background: showShopRedraft ? "rgba(96,165,250,0.14)" : "transparent",
            color: showShopRedraft ? "#93c5fd" : "var(--text-muted)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {showShopRedraft ? "Redraft On" : "Redraft Off"}
        </button>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Select a Player to Shop
        </label>
        <select
          value={selectedPlayer}
          onChange={(e) => {
            setSelectedPlayer(e.target.value);
            setShopPathFilter(null);
          }}
          style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, cursor: "pointer", boxSizing: "border-box" }}
        >
          <option value="">Choose a player...</option>
          {SHOP_POSITION_GROUPS.map((pos) => {
            const posPlayers = portfolio?.players
              ?.filter((p) => p.position === pos)
              ?.sort((a, b) => b.edge_score - a.edge_score) ?? [];
            if (posPlayers.length === 0) return null;
            return (
              <optgroup key={pos} label={pos}>
                {posPlayers.map((p) => (
                  <option key={p.player_id} value={p.player_id}>
                    {p.full_name} (Edge {Math.round(p.edge_score)}){" \u2014 "}{p.leagues_owned} league{p.leagues_owned !== 1 ? "s" : ""}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {selectedPlayer && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginTop: 8, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Trade Ambition:</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: "1 1 220px", minWidth: 0 }}>
            {SHOP_AMBITION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setShopAmbition(opt.value)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flex: "1 1 96px",
                  maxWidth: 180,
                  minWidth: 0,
                  border: shopAmbition === opt.value ? "2px solid var(--amber)" : "1px solid var(--border)",
                  background: shopAmbition === opt.value ? "rgba(61,139,253,0.1)" : "transparent",
                  color: shopAmbition === opt.value ? "var(--amber)" : "var(--text-muted)",
                }}
                title={opt.desc}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedPlayer && shopLoading && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
          <span className="animate-pulse" style={{ color: "var(--amber)", fontSize: 14 }}>
            Scanning all leagues for the best deals...
          </span>
        </div>
      )}

      {selectedPlayer && Boolean(shopError) && !shopLoading && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.28)", borderRadius: 10, padding: "18px 20px", marginTop: 16, color: "#fca5a5", fontSize: 13, lineHeight: 1.5 }}>
          {shopErrorMessage}
        </div>
      )}

      {selectedPlayer && shopResult && !shopLoading && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {shopResult.player_name} owned in {shopResult.leagues_owned} league{shopResult.leagues_owned !== 1 ? "s" : ""}{" \u2014 "}{shopResult.opportunities.length} opportunit{shopResult.opportunities.length !== 1 ? "ies" : "y"} found
            </span>
          </div>
          {(shopResult.partial_results || (shopResult.warnings?.length ?? 0) > 0) && (
            <div style={{ background: "rgba(61,139,253,0.1)", border: "1px solid rgba(61,139,253,0.28)", borderRadius: 10, padding: "10px 12px", marginBottom: 12, color: "var(--amber)", fontSize: 12, lineHeight: 1.5, overflowWrap: "anywhere" }}>
              Showing the best completed results so far.
              {shopResult.warnings && shopResult.warnings.length > 0 && (
                <span style={{ color: "var(--text-dim)", marginLeft: 6 }}>
                  {shopResult.warnings.slice(0, 2).join(" ")}
                </span>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { key: null, label: `All (${shopResult.opportunities.length})` },
              { key: "even_swap" as const, label: `Even Swaps (${shopResult.opportunities.filter((o) => o.path === "even_swap").length})` },
              { key: "they_add_pick" as const, label: `They Add Pick (${shopResult.opportunities.filter((o) => o.path === "they_add_pick").length})` },
              { key: "you_upgrade" as const, label: `You Upgrade (${shopResult.opportunities.filter((o) => o.path === "you_upgrade").length})` },
              { key: "sell_for_pieces" as const, label: `Sell for Pieces (${shopResult.opportunities.filter((o) => o.path === "sell_for_pieces").length})` },
            ].map((f) => (
              <button
                key={f.key ?? "all"}
                onClick={() => setShopPathFilter(f.key)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: shopPathFilter === f.key ? "1px solid var(--amber)" : "1px solid var(--border)",
                  background: shopPathFilter === f.key ? "rgba(61,139,253,0.1)" : "transparent",
                  color: shopPathFilter === f.key ? "var(--amber)" : "var(--text-muted)",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          {filteredShopResults.map((opp, i) => (
            <ShopOpportunityCard key={`${opp.league_id}-${i}`} opp={opp} />
          ))}
          {filteredShopResults.length === 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No trade packages match the current path filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
