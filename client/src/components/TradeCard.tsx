import type {
  TradeAssetWithPlayer,
  TradeOutcome,
  TradeOutcomeSeason,
} from "@shared/types";
import { posColor } from "../lib/position-colors";
import VerdictBadge from "./VerdictBadge";
import WinImpactBar from "./WinImpactBar";

export interface TradeCardProps {
  outcome: TradeOutcome;
  assets: TradeAssetWithPlayer[];
  rosterNames: Map<number, string>;
  expanded?: boolean;
  onToggle?: () => void;
  seasons?: TradeOutcomeSeason[];
}

function formatTradeMonth(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function formatTradeDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSignedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatSignedNumber(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function formatPoints(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 1,
  });
}

function metricColor(value: number): string {
  if (value > 0) return "var(--green)";
  if (value < 0) return "var(--red)";
  return "var(--text-muted)";
}

function formatPickLabel(asset: TradeAssetWithPlayer): string {
  if (asset.asset_name?.trim()) {
    return asset.asset_name.trim();
  }

  const [season, round] = asset.asset_key.split("_");
  if (!season || !round) {
    return asset.asset_key;
  }

  return `${season} Round ${round}`;
}

function assetLabel(asset: TradeAssetWithPlayer): string {
  if (asset.asset_type === "player") {
    return asset.player_name ?? asset.asset_name ?? asset.asset_key;
  }

  return formatPickLabel(asset);
}

function valueSourceLabel(source: string): string {
  return source === "dynastyprocess" ? "DP" : "FC";
}

function AssetRow({ asset }: { asset: TradeAssetWithPlayer }) {
  const position = asset.position ?? (asset.asset_type === "pick" ? "PICK" : null);

  return (
    <div className="trade-asset-row">
      <div className="trade-asset-copy">
        <div className="trade-asset-name">{assetLabel(asset)}</div>
        {asset.asset_type === "pick" && asset.drafted_player_name ? (
          <div className="trade-asset-meta">
            {"-> "}
            {asset.drafted_player_name}
            {asset.drafted_position ? ` (${asset.drafted_position})` : ""}
          </div>
        ) : asset.team ? (
          <div className="trade-asset-meta">{asset.team}</div>
        ) : null}
      </div>

      {position && (
        <span
          className="trade-asset-badge"
          style={{
            background:
              asset.asset_type === "pick"
                ? "rgba(6, 182, 212, 0.16)"
                : `${posColor(asset.position ?? "WR")}22`,
            border:
              asset.asset_type === "pick"
                ? "1px solid rgba(6, 182, 212, 0.28)"
                : `1px solid ${posColor(asset.position ?? "WR")}55`,
            color:
              asset.asset_type === "pick"
                ? "#67e8f9"
                : posColor(asset.position ?? "WR"),
          }}
        >
          {position}
        </span>
      )}
    </div>
  );
}

export default function TradeCard({
  outcome,
  assets,
  rosterNames,
  expanded = false,
  onToggle,
  seasons,
}: TradeCardProps) {
  const tradeAssets = assets.filter(
    (asset) =>
      asset.trade_id === outcome.trade_id &&
      asset.league_id === outcome.league_id &&
      asset.roster_id === outcome.roster_id
  );
  const gave = tradeAssets.filter((asset) => asset.direction === "gave");
  const received = tradeAssets.filter((asset) => asset.direction === "received");
  const ownerName =
    rosterNames.get(outcome.roster_id) ?? `Roster ${outcome.roster_id}`;
  const counterpartyName =
    rosterNames.get(outcome.counterparty_roster_id) ??
    `Roster ${outcome.counterparty_roster_id}`;
  const valueColor = metricColor(outcome.value_delta_pct);
  const detailsLoading = expanded && seasons === undefined;

  return (
    <div className="edge-card trade-card">
      <div className="trade-card-header">
        <div className="trade-card-title-wrap">
          <div className="trade-card-kicker">Trade Grade</div>
          <div className="trade-card-title">{ownerName}</div>
          <div className="trade-card-meta">
            vs {counterpartyName} · {formatTradeMonth(outcome.trade_date)}
          </div>
        </div>

        <div className="trade-card-badges">
          {outcome.scoring_adjusted && (
            <span
              className="trade-scoring-chip"
              title="Values adjusted for this league's custom scoring (TEP, PPC, etc.)"
            >
              Scoring Adjusted
            </span>
          )}
          <VerdictBadge verdict={outcome.value_verdict} />
        </div>
      </div>

      <div className="trade-asset-grid">
        <div className="trade-asset-panel">
          <div className="trade-asset-panel-title gave">Gave</div>
          <div className="trade-asset-list">
            {gave.length > 0 ? (
              gave.map((asset) => (
                <AssetRow
                  key={`${asset.trade_id}-${asset.roster_id}-${asset.direction}-${asset.asset_key}`}
                  asset={asset}
                />
              ))
            ) : (
              <div className="trade-empty-row">No assets logged</div>
            )}
          </div>
        </div>

        <div className="trade-asset-panel">
          <div className="trade-asset-panel-title received">Received</div>
          <div className="trade-asset-list">
            {received.length > 0 ? (
              received.map((asset) => (
                <AssetRow
                  key={`${asset.trade_id}-${asset.roster_id}-${asset.direction}-${asset.asset_key}`}
                  asset={asset}
                />
              ))
            ) : (
              <div className="trade-empty-row">No assets logged</div>
            )}
          </div>
        </div>
      </div>

      <div className="trade-metric-grid">
        <div className="trade-metric-card">
          <div className="trade-metric-label">Current Value (FC)</div>
          <div className="trade-metric-body">
            <div className="trade-metric-row">
              Gave:{" "}
              <span className="font-mono trade-metric-value">
                {formatPoints(outcome.value_gave_current)}
              </span>
            </div>
            <div className="trade-metric-row">
              Received:{" "}
              <span className="font-mono trade-metric-value">
                {formatPoints(outcome.value_received_current)}
              </span>
            </div>
            <div className="trade-delta-line" style={{ color: valueColor }}>
              {formatSignedPercent(outcome.value_delta_pct)}
              {" "}
              <span>
                ({outcome.value_verdict === "won"
                  ? "Won"
                  : outcome.value_verdict === "lost"
                    ? "Lost"
                    : "Push"})
              </span>
            </div>
          </div>
        </div>

        <div className="trade-metric-card">
          <div className="trade-metric-label with-gap">Win Impact</div>
          <WinImpactBar value={outcome.win_impact} />
          <div className="trade-metric-body compact">
            <div className="trade-metric-row">
              Points received:{" "}
              <span className="font-mono trade-metric-value">
                {formatPoints(outcome.points_received_assets)}
              </span>
            </div>
            <div className="trade-metric-row">
              Points gave:{" "}
              <span className="font-mono trade-metric-value">
                {formatPoints(outcome.points_gave_assets)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        onClick={onToggle}
        className="trade-breakdown-toggle"
      >
        <span>{expanded ? "Hide Details" : "Show Season Breakdown"}</span>
        <span className="trade-breakdown-chevron">{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>

      {expanded && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid rgba(35,41,54, 0.55)",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {formatTradeDate(outcome.trade_date)}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Starter rate:{" "}
              <span style={{ color: "var(--text)", fontWeight: 700 }}>
                {outcome.starter_rate_pct.toFixed(1)}%
              </span>
            </span>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Median impact:{" "}
              <span style={{ color: metricColor(outcome.median_impact), fontWeight: 700 }}>
                {formatSignedNumber(outcome.median_impact)}
              </span>
            </span>
            <span
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                background: "rgba(59, 130, 246, 0.12)",
                border: "1px solid rgba(59, 130, 246, 0.24)",
                color: "#93c5fd",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              Source {valueSourceLabel(outcome.value_source)}
            </span>
            {outcome.is_final && (
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "rgba(34, 197, 94, 0.14)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  color: "#4ade80",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                Final
              </span>
            )}
          </div>

          {detailsLoading ? (
            <div
              style={{
                marginTop: 12,
                background: "rgba(11,13,18, 0.55)",
                borderRadius: 10,
                padding: 16,
                color: "var(--amber)",
                fontSize: 13,
              }}
            >
              <span className="animate-pulse">Loading seasonal breakdown...</span>
            </div>
          ) : seasons && seasons.length > 0 ? (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {seasons.map((season) => (
                <div
                  key={`${season.trade_outcome_id}-${season.season_year}-${season.season_number}`}
                  style={{
                    background: "rgba(11,13,18, 0.55)",
                    border: "1px solid rgba(35,41,54, 0.55)",
                    borderRadius: 10,
                    padding: 14,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        Season {season.season_year}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        Grading window #{season.season_number}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        Wins:{" "}
                        <span style={{ color: "var(--text)", fontWeight: 700 }}>
                          {season.wins_with} / {season.wins_without}
                        </span>
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        Impact:{" "}
                        <span style={{ color: metricColor(season.win_impact), fontWeight: 700 }}>
                          {formatSignedNumber(season.win_impact)}
                        </span>
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        Median:{" "}
                        <span style={{ color: metricColor(season.median_with - season.median_without), fontWeight: 700 }}>
                          {formatSignedNumber(season.median_with - season.median_without)}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 10,
                      marginTop: 12,
                      fontSize: 12,
                      color: "var(--text-dim)",
                    }}
                  >
                    <div>
                      Points received:{" "}
                      <span style={{ color: "var(--text)", fontWeight: 700 }}>
                        {formatPoints(season.points_received)}
                      </span>
                    </div>
                    <div>
                      Points gave:{" "}
                      <span style={{ color: "var(--text)", fontWeight: 700 }}>
                        {formatPoints(season.points_gave)}
                      </span>
                    </div>
                    <div>
                      Value delta:{" "}
                      <span style={{ color: metricColor(season.value_delta_pct), fontWeight: 700 }}>
                        {formatSignedPercent(season.value_delta_pct)}
                      </span>
                    </div>
                  </div>

                  {(season.key_assets_received.length > 0 || season.key_assets_gave.length > 0) && (
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      {season.key_assets_received.length > 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                          Key received:{" "}
                          <span style={{ color: "var(--text)" }}>
                            {season.key_assets_received.join(", ")}
                          </span>
                        </div>
                      )}
                      {season.key_assets_gave.length > 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                          Key gave:{" "}
                          <span style={{ color: "var(--text)" }}>
                            {season.key_assets_gave.join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                marginTop: 12,
                background: "rgba(11,13,18, 0.55)",
                borderRadius: 10,
                padding: 16,
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              No season-level aging breakdown is available for this trade yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
