import { useMemo, useState } from "react";
import { useParams } from "wouter";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppShell from "../components/AppShell";
import EmptyState from "../components/EmptyState";
import FreshnessBar from "../components/FreshnessBar";
import { SectionHeader, StatCard } from "../components/ui";
import { useEnsureUser } from "../hooks/use-ensure-user";
import { useTradeAging, useTradeHistory } from "../hooks/use-trade-history";
import type {
  TradeAgingRow,
  TradeGrade,
  TradeGradedAsset,
} from "../../../shared/types";

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
} as const;

const selectStyle = {
  padding: "10px 12px",
  background: "var(--dark-base)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
} as const;

interface TradeAgingSummary {
  days_since_trade: number;
  gave_change: number;
  received_change: number;
  net_change: number;
  assets: TradeAgingRow[];
}

function formatTradeDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function gradeColor(grade: TradeGrade["grade"]): string {
  if (grade === "win") return "var(--green)";
  if (grade === "loss") return "var(--red)";
  return "var(--text-muted)";
}

function gradeLabel(grade: TradeGrade["grade"]): string {
  if (grade === "win") return "W";
  if (grade === "loss") return "L";
  return "P";
}

function netColor(value: number): string {
  if (value > 0) return "var(--green)";
  if (value < 0) return "var(--red)";
  return "var(--text-muted)";
}

function formatTrackedValue(value: number | null): string {
  if (value == null) return "-";
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  return value.toFixed(1);
}

function formatSignedTrackedValue(value: number | null): string {
  if (value == null) return "-";
  return `${value > 0 ? "+" : ""}${formatTrackedValue(value)}`;
}

function daysSince(dateStr: string): number {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}

function agingColor(value: number): string {
  if (value > 0) return "var(--green)";
  if (value < 0) return "var(--red)";
  return "var(--text-muted)";
}

function agingLabel(value: number): string {
  if (value > 0) return "Won";
  if (value < 0) return "Lost";
  return "Flat";
}

function summarizeTrade(trade: TradeGrade): string {
  const gave = trade.gave.map((asset) => asset.label).join(", ");
  const received = trade.received.map((asset) => asset.label).join(", ");
  const summary = `Gave: ${gave || "Nothing"} -> Received: ${received || "Nothing"}`;
  return summary.length > 110 ? `${summary.slice(0, 107)}...` : summary;
}

function findAgingAsset(
  aging: TradeAgingSummary | undefined,
  asset: TradeGradedAsset,
  direction: "gave" | "received"
): TradeAgingRow | undefined {
  if (!aging) return undefined;
  return aging.assets.find(
    (row) => row.direction === direction && row.asset_key === asset.asset_key
  );
}

function AssetValueRow({
  asset,
  direction,
  aging,
}: {
  asset: TradeGradedAsset;
  direction: "gave" | "received";
  aging?: TradeAgingSummary;
}) {
  const agingAsset = findAgingAsset(aging, asset, direction);
  const thenValue = agingAsset?.fc_value_at_trade ?? asset.edge_score_then;
  const nowValue = agingAsset?.fc_value_now ?? asset.edge_score_now;
  const changeValue = agingAsset?.fc_value_change ?? asset.value_change;
  const detailLabel = agingAsset ? "FC aging" : "Tracked";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{asset.label}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {asset.position ?? asset.asset_type.toUpperCase()}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {detailLabel}: {formatTrackedValue(thenValue)}{" -> "}{formatTrackedValue(nowValue)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: netColor(changeValue ?? 0) }}>
          {formatSignedTrackedValue(changeValue)}
        </div>
      </div>
    </div>
  );
}

export default function TradeHistory() {
  const { username } = useParams<{ username: string }>();
  const { phase, syncProgress, errorMsg, retry } = useEnsureUser(username);
  const { data, isLoading, error } = useTradeHistory(phase === "ready" ? username : undefined);
  const { data: agingData } = useTradeAging(phase === "ready" ? username : undefined);
  const [leagueFilter, setLeagueFilter] = useState("ALL");
  const [gradeFilter, setGradeFilter] = useState("ALL");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [expandedTradeIds, setExpandedTradeIds] = useState<Set<string>>(new Set());

  const agingByTrade = useMemo(() => {
    const grouped = new Map<string, TradeAgingSummary>();
    for (const row of agingData ?? []) {
      const current = grouped.get(row.trade_id) ?? {
        days_since_trade: row.days_since_trade,
        gave_change: 0,
        received_change: 0,
        net_change: 0,
        assets: [],
      };
      current.days_since_trade = row.days_since_trade;
      current.assets.push(row);
      if (row.direction === "received") {
        current.received_change += row.fc_value_change ?? 0;
      } else {
        current.gave_change += row.fc_value_change ?? 0;
      }
      current.net_change = current.received_change - current.gave_change;
      grouped.set(row.trade_id, current);
    }

    for (const [tradeId, summary] of grouped.entries()) {
      grouped.set(tradeId, {
        ...summary,
        gave_change: Math.round(summary.gave_change * 10) / 10,
        received_change: Math.round(summary.received_change * 10) / 10,
        net_change: Math.round(summary.net_change * 10) / 10,
      });
    }

    return grouped;
  }, [agingData]);

  const filteredTrades = useMemo(() => {
    const trades = data?.trades ?? [];
    return trades.filter((trade) => {
      if (leagueFilter !== "ALL" && trade.league_id !== leagueFilter) return false;
      if (gradeFilter !== "ALL" && trade.grade !== gradeFilter) return false;
      if (positionFilter !== "ALL") {
        const hasPosition = [...trade.gave, ...trade.received].some((asset) => asset.position === positionFilter);
        if (!hasPosition) return false;
      }
      return true;
    });
  }, [data?.trades, leagueFilter, gradeFilter, positionFilter]);

  const leagueOptions = useMemo(() => data?.stats.by_league ?? [], [data?.stats.by_league]);
  const positionOptions = useMemo(() => data?.stats.by_position.map((item) => item.position) ?? [], [data?.stats.by_position]);

  function toggleTrade(tradeId: string) {
    setExpandedTradeIds((current) => {
      const next = new Set(current);
      if (next.has(tradeId)) next.delete(tradeId);
      else next.add(tradeId);
      return next;
    });
  }

  if (phase === "checking" || phase === "syncing") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
        </div>
        <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--amber)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span className="animate-pulse">.</span>
            {phase === "checking"
              ? `Looking up ${username}...`
              : `Syncing ${username}'s leagues${syncProgress ? ` (${syncProgress.done}/${syncProgress.total})` : "..."}`}
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
            {phase === "syncing"
              ? "First-time sync may take a minute. Pulling league and trade data from Sleeper."
              : "Checking if trade history data is available..."}
          </p>
        </div>
      </AppShell>
    );
  }

  if (phase === "error") {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
        </div>
        <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--red)", fontSize: 14, margin: 0 }}>
            {errorMsg || "Something went wrong."}
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              marginTop: 16,
              background: "linear-gradient(135deg, var(--amber), var(--amber-dark))",
              color: "var(--dark-base)",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Try Again
          </button>
        </div>
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
        </div>
        <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center", color: "var(--amber)" }}>
          <span className="animate-pulse">Loading trade history...</span>
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
        </div>
        <div style={{ ...cardStyle, padding: "32px 24px", color: "var(--red)", fontSize: 14 }}>
          {(error as Error)?.message ?? "Unable to load trade history."}
        </div>
      </AppShell>
    );
  }

  if (data.trades.length === 0) {
    return (
      <AppShell>
        <div style={{ padding: "28px 0 8px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            Win rate and value tracking across all leagues
          </p>
          <FreshnessBar />
        </div>
        <EmptyState title="No trades found for this user yet." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Execution Tracker</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Win rate and value tracking across all leagues
        </p>
        <FreshnessBar />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginTop: 16 }}>
        <StatCard label="Win Rate" value={`${data.stats.win_rate.toFixed(1)}%`} sub={`${data.stats.wins}W / ${data.stats.losses}L / ${data.stats.pushes}P`} accent={data.stats.win_rate >= 55 ? "var(--green)" : data.stats.win_rate >= 45 ? "var(--amber)" : "var(--red)"} />
        <StatCard label="Total Trades" value={data.stats.total_trades} />
        <StatCard label="Net Value Gained" value={`${data.stats.total_value_gained > 0 ? "+" : ""}${formatTrackedValue(data.stats.total_value_gained)}`} accent={netColor(data.stats.total_value_gained)} />
        <StatCard label="Avg Per Trade" value={`${data.stats.avg_value_per_trade > 0 ? "+" : ""}${formatTrackedValue(data.stats.avg_value_per_trade)}`} accent={netColor(data.stats.avg_value_per_trade)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 24 }}>
        <div style={{ ...cardStyle, padding: 16 }}>
          <SectionHeader icon="QB" title="By Position" subtitle="Net value gained or lost by position" />
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stats.by_position} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 10 }}>
                <CartesianGrid stroke="rgba(51,65,85,0.2)" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis dataKey="position" type="category" tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={36} />
                <Tooltip
                  contentStyle={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8 }}
                  formatter={(value) => [`${Number(value ?? 0).toFixed(1)} edge`, "Net Value"]}
                  />
                <Bar dataKey="net_value" radius={[0, 4, 4, 0]}>
                  {data.stats.by_position.map((row) => (
                    <Cell key={row.position} fill={row.net_value >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 16 }}>
          <SectionHeader icon="Mo" title="Monthly Trend" subtitle="Win rate and net value over time" />
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.stats.by_month} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="rgba(51,65,85,0.2)" strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={40} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={48} />
                <Tooltip contentStyle={{ background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="win_rate" name="Win Rate %" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="net_value" name="Net Value" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <SectionHeader icon="Lg" title="By League" subtitle="Best and worst environments for your trading" />
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--dark-base)" }}>
                <th style={{ textAlign: "left", padding: "12px 14px", fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5 }}>LEAGUE</th>
                <th style={{ textAlign: "right", padding: "12px 14px", fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5 }}>TRADES</th>
                <th style={{ textAlign: "right", padding: "12px 14px", fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5 }}>WIN RATE</th>
                <th style={{ textAlign: "right", padding: "12px 14px", fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5 }}>NET VALUE</th>
              </tr>
            </thead>
            <tbody>
              {data.stats.by_league.map((row) => (
                <tr key={row.league_id} style={{ background: row.win_rate > 60 ? "rgba(34,197,94,0.06)" : row.win_rate < 40 ? "rgba(239,68,68,0.06)" : "transparent", borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.league_name}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, textAlign: "right", color: "var(--text-dim)" }}>{row.trades}</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, textAlign: "right", color: row.win_rate > 60 ? "var(--green)" : row.win_rate < 40 ? "var(--red)" : "var(--text)" }}>{row.win_rate.toFixed(1)}%</td>
                  <td style={{ padding: "12px 14px", fontSize: 13, textAlign: "right", fontWeight: 700, color: netColor(row.net_value) }}>{row.net_value > 0 ? "+" : ""}{formatTrackedValue(row.net_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <SectionHeader icon="TL" title="Trade Log" subtitle="Most recent first. Click a trade to expand the full breakdown." />
        <div style={{ ...cardStyle, padding: 16, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <select value={leagueFilter} onChange={(event) => setLeagueFilter(event.target.value)} style={selectStyle}>
            <option value="ALL">All Leagues</option>
            {leagueOptions.map((league) => (
              <option key={league.league_id} value={league.league_id}>{league.league_name}</option>
            ))}
          </select>
          <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} style={selectStyle}>
            <option value="ALL">All Grades</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="push">Pushes</option>
          </select>
          <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)} style={selectStyle}>
            <option value="ALL">All Positions</option>
            {positionOptions.map((position) => (
              <option key={position} value={position}>{position}</option>
            ))}
          </select>
        </div>

        {filteredTrades.length === 0 ? (
          <EmptyState title="No trades match the current filters." />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredTrades.map((trade) => {
              const expanded = expandedTradeIds.has(trade.trade_id);
              const aging = agingByTrade.get(trade.trade_id);
              const daysSinceTrade = aging?.days_since_trade ?? daysSince(trade.trade_date);
              const agingBadgeColor = aging ? agingColor(aging.net_change) : "var(--text-muted)";
              return (
                <button
                  key={trade.trade_id}
                  type="button"
                  onClick={() => toggleTrade(trade.trade_id)}
                  style={{
                    ...cardStyle,
                    width: "100%",
                    padding: 16,
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: "var(--text)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ background: gradeColor(trade.grade), color: trade.grade === "push" ? "var(--dark-base)" : "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 800 }}>
                        {gradeLabel(trade.grade)}
                      </span>
                      {aging && (
                        <span
                          style={{
                            background:
                              aging.net_change === 0
                                ? "rgba(148, 163, 184, 0.12)"
                                : aging.net_change > 0
                                  ? "rgba(34, 197, 94, 0.16)"
                                  : "rgba(239, 68, 68, 0.14)",
                            color: agingBadgeColor,
                            border: `1px solid ${aging.net_change === 0 ? "var(--border)" : agingBadgeColor}`,
                            borderRadius: 6,
                            padding: "4px 10px",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          Aging {agingLabel(aging.net_change)} ({formatSignedTrackedValue(aging.net_change)})
                        </span>
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{trade.league_name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {formatTradeDate(trade.trade_date)} · {daysSinceTrade}d ago
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: netColor(trade.net_value_change) }}>
                        {trade.net_value_change > 0 ? "+" : ""}{formatTrackedValue(trade.net_value_change)}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Tracked net</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
                    {summarizeTrade(trade)}
                  </div>

                  {expanded && (
                    <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                        <div style={{ background: "var(--dark-base)", borderRadius: 8, padding: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#ef4444", marginBottom: 8 }}>GAVE</div>
                          {trade.gave.map((asset) => (
                            <AssetValueRow
                              key={`gave-${trade.trade_id}-${asset.asset_key}-${asset.label}`}
                              asset={asset}
                              direction="gave"
                              aging={aging}
                            />
                          ))}
                        </div>
                        <div style={{ background: "var(--dark-base)", borderRadius: 8, padding: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#22c55e", marginBottom: 8 }}>RECEIVED</div>
                          {trade.received.map((asset) => (
                            <AssetValueRow
                              key={`received-${trade.trade_id}-${asset.asset_key}-${asset.label}`}
                              asset={asset}
                              direction="received"
                              aging={aging}
                            />
                          ))}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--text-dim)" }}>
                        <span>Then: {formatTrackedValue(trade.gave_total_then)}{" -> "}{formatTrackedValue(trade.received_total_then)}</span>
                        <span>Now: {formatTrackedValue(trade.gave_total_now)}{" -> "}{formatTrackedValue(trade.received_total_now)}</span>
                        {aging ? (
                          <>
                            <span>FC aging received: {formatSignedTrackedValue(aging.received_change)}</span>
                            <span>FC aging gave: {formatSignedTrackedValue(aging.gave_change)}</span>
                            <span style={{ color: agingColor(aging.net_change), fontWeight: 700 }}>
                              FC aging net: {formatSignedTrackedValue(aging.net_change)}
                            </span>
                          </>
                        ) : (
                          <span>No FC aging data for this trade</span>
                        )}
                        <span>Partners: {trade.partner_names.join(", ")}</span>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
