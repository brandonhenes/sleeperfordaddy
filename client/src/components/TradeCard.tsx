import type {
  TradeAssetWithPlayer,
  TradeOutcome,
  TradeOutcomeSeason,
} from "../../../shared/types";
import { posColor } from "../lib/position-colors";
import VerdictBadge from "./VerdictBadge";
import WinImpactBar from "./WinImpactBar";

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 18,
  textAlign: "left" as const,
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
  width: "100%",
} as const;

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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid rgba(51, 65, 85, 0.35)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {assetLabel(asset)}
        </div>
        {asset.team && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {asset.team}
          </div>
        )}
      </div>

      {position && (
        <span
          style={{
            flexShrink: 0,
            padding: "3px 8px",
            borderRadius: 999,
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
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
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
    <button type="button" onClick={onToggle} style={cardStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "var(--text-muted)",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Trade Grade
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
            {ownerName}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            vs {counterpartyName} · {formatTradeMonth(outcome.trade_date)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {outcome.scoring_adjusted && (
            <span
              title="Values adjusted for this league's custom scoring (TEP, PPC, etc.)"
              style={{
                padding: "5px 10px",
                borderRadius: 999,
                background: "rgba(245, 158, 11, 0.14)",
                border: "1px solid rgba(245, 158, 11, 0.28)",
                color: "var(--amber)",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Scoring Adjusted
            </span>
          )}
          <VerdictBadge verdict={outcome.value_verdict} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
          marginTop: 16,
        }}
      >
        <div
          style={{
            background: "rgba(15, 23, 42, 0.48)",
            border: "1px solid rgba(51, 65, 85, 0.55)",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.6,
              color: "#f87171",
              textTransform: "uppercase",
            }}
          >
            Gave
          </div>
          <div style={{ marginTop: 8 }}>
            {gave.length > 0 ? (
              gave.map((asset) => (
                <AssetRow
                  key={`${asset.trade_id}-${asset.roster_id}-${asset.direction}-${asset.asset_key}`}
                  asset={asset}
                />
              ))
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
                No assets logged
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            background: "rgba(15, 23, 42, 0.48)",
            border: "1px solid rgba(51, 65, 85, 0.55)",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.6,
              color: "#4ade80",
              textTransform: "uppercase",
            }}
          >
            Received
          </div>
          <div style={{ marginTop: 8 }}>
            {received.length > 0 ? (
              received.map((asset) => (
                <AssetRow
                  key={`${asset.trade_id}-${asset.roster_id}-${asset.direction}-${asset.asset_key}`}
                  asset={asset}
                />
              ))
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
                No assets logged
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        <div
          style={{
            background: "rgba(15, 23, 42, 0.65)",
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: 0.6, textTransform: "uppercase" }}>
            Value Delta
          </div>
          <div className="font-mono" style={{ fontSize: 20, fontWeight: 800, color: valueColor, marginTop: 6 }}>
            {formatSignedPercent(outcome.value_delta_pct)}
          </div>
          <div style={{ fontSize: 12, color: valueColor, fontWeight: 700, marginTop: 2 }}>
            {outcome.value_verdict === "won"
              ? "Won on value"
              : outcome.value_verdict === "lost"
                ? "Lost on value"
                : "Push on value"}
          </div>
        </div>

        <div
          style={{
            background: "rgba(15, 23, 42, 0.65)",
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>
            Win Impact
          </div>
          <WinImpactBar value={outcome.win_impact} />
        </div>

        <div
          style={{
            background: "rgba(15, 23, 42, 0.65)",
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: 0.6, textTransform: "uppercase" }}>
            Points
          </div>
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Received:{" "}
              <span className="font-mono" style={{ color: "var(--text)", fontWeight: 700 }}>
                {formatPoints(outcome.points_received_assets)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Gave:{" "}
              <span className="font-mono" style={{ color: "var(--text)", fontWeight: 700 }}>
                {formatPoints(outcome.points_gave_assets)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid rgba(51, 65, 85, 0.55)",
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
                background: "rgba(15, 23, 42, 0.55)",
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
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(51, 65, 85, 0.55)",
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
                background: "rgba(15, 23, 42, 0.55)",
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
    </button>
  );
}
