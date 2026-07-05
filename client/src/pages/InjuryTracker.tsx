import { useState } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import {
  Card,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  PlayerLink,
  PositionBadge,
  ResponsiveTable,
  SegmentedControl,
  type ResponsiveTableColumn,
  type SegmentedControlItem,
} from "../components/ui";
import { useBuyingWindows, useInjuredPlayers } from "../hooks/use-injury-tracker";
import type { BuyingWindow, InjuredPlayerView } from "@shared/types";

type Tab = "injuries" | "buying";

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

function formatHealthyDate(dateValue: string | null | undefined): string {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatReturnTimeline(player: InjuredPlayerView): string {
  if (player.return_label) return player.return_label;
  if (player.expected_return_date) {
    const date = new Date(player.expected_return_date);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  }
  if (player.estimated_return_date) {
    const date = new Date(player.estimated_return_date);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
  }
  return "Unknown";
}

function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        borderRadius: 6,
        background: `${color}22`,
        color,
        padding: "0 8px",
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

function RiskMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div>
      <div className="font-mono" style={{ fontSize: 22, fontWeight: 800, color }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function RiskSummary({ injuries }: { injuries: InjuredPlayerView[] }) {
  const activeCount = injuries.length;
  const totalSlots = injuries.reduce((sum, player) => sum + player.league_count, 0);
  const highest = injuries.length > 0
    ? injuries.reduce((a, b) => (b.league_count > a.league_count ? b : a))
    : null;

  return (
    <Card
      style={{
        marginTop: 16,
        display: "flex",
        alignItems: "center",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <RiskMetric label="Active injuries" value={activeCount} color="#ef4444" />
      <RiskMetric label="Affected league slots" value={totalSlots} color="var(--amber)" />
      <RiskMetric label="Total injured" value={injuries.length} />
      {highest && (
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Highest exposure risk</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {highest.full_name} ({highest.league_count} leagues)
          </div>
        </div>
      )}
    </Card>
  );
}

function RecoveryPace({ player }: { player: InjuredPlayerView }) {
  const color = player.recovery_pace === "Ahead"
    ? "#22c55e"
    : player.recovery_pace === "Behind"
    ? "#ef4444"
    : "var(--text-dim)";

  return (
    <div>
      <span style={{ color, fontWeight: 700 }}>{player.recovery_pace ?? "-"}</span>
      {player.avg_recovery_weeks != null && (
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          avg {player.avg_recovery_weeks} wks
        </div>
      )}
    </div>
  );
}

function InjuryTable({ injuries }: { injuries: InjuredPlayerView[] }) {
  const columns: ResponsiveTableColumn<InjuredPlayerView>[] = [
    {
      key: "player",
      header: "Player",
      render: (player) => <PlayerLink name={player.full_name} />,
    },
    {
      key: "position",
      header: "Pos",
      render: (player) => <PositionBadge position={player.position} />,
    },
    {
      key: "team",
      header: "Team",
      render: (player) => <span style={{ color: "var(--text-muted)" }}>{player.team}</span>,
    },
    {
      key: "injury",
      header: "Injury",
      render: (player) => (
        <div style={{ display: "grid", gap: 4 }}>
          <span>{player.injury_type ?? player.injury_body_part ?? "Unknown"}</span>
          <StatusBadge status={player.status ?? player.injury_status} />
        </div>
      ),
    },
    {
      key: "healthy",
      header: "Healthy By",
      render: (player) => (
        <span style={{ color: "var(--text-dim)" }}>
          {formatHealthyDate(player.estimated_healthy_date)}
        </span>
      ),
    },
    {
      key: "return",
      header: "Return",
      render: (player) => (
        <span style={{ color: "var(--text-dim)" }}>
          {player.return_label ?? "Unknown"}
        </span>
      ),
    },
    {
      key: "pace",
      header: "Pace",
      render: (player) => <RecoveryPace player={player} />,
    },
    {
      key: "leagues",
      header: "Leagues",
      align: "right",
      render: (player) => (
        <span className="font-mono" style={{ fontWeight: 800 }}>
          {player.league_count}
        </span>
      ),
    },
    {
      key: "notes",
      header: "Notes",
      render: (player) => (
        <span style={{ color: "var(--text-dim)", maxWidth: 320, display: "inline-block" }}>
          {player.notes ?? "-"}
        </span>
      ),
    },
  ];

  return (
    <ResponsiveTable
      rows={injuries}
      columns={columns}
      getRowKey={(player) => player.player_id}
      emptyLabel="No injured players on your rosters."
    />
  );
}

function WindowCard({ window }: { window: BuyingWindow }) {
  const player = window.player;
  const status = player.status ?? player.injury_status;

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          className="font-mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 38,
            minHeight: 30,
            borderRadius: 6,
            background: "var(--amber)",
            color: "var(--dark-base)",
            fontSize: 14,
            fontWeight: 900,
          }}
        >
          {window.opportunity_score}
        </span>
        <PlayerLink name={player.full_name} style={{ fontSize: 15 }} />
        <PositionBadge position={player.position} />
        {player.team && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{player.team}</span>}
        <span
          style={{
            marginLeft: "auto",
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
            background: `${statusColor(status)}22`,
            color: statusColor(status),
          }}
        >
          {player.is_buying_window ? "BUY WINDOW" : statusLabel(status)} - {player.injury_type ?? player.injury_body_part ?? "Unknown"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 20, fontSize: 13, flexWrap: "wrap" }}>
        {player.fc_current != null && (
          <div>
            <span style={{ color: "var(--text-muted)" }}>Current FC: </span>
            <span style={{ fontWeight: 800 }}>{player.fc_current}</span>
          </div>
        )}
        {player.fc_at_injury != null && (
          <div>
            <span style={{ color: "var(--text-muted)" }}>FC at Injury: </span>
            <span style={{ fontWeight: 800 }}>{player.fc_at_injury}</span>
          </div>
        )}
        {player.value_change_pct != null && (
          <div>
            <span style={{ color: "var(--text-muted)" }}>Value Change: </span>
            <span style={{ color: player.value_change_pct <= -30 ? "#ef4444" : "var(--text)", fontWeight: 800 }}>
              {player.value_change_pct > 0 ? "+" : ""}
              {player.value_change_pct.toFixed(1)}%
            </span>
          </div>
        )}
        <div>
          <span style={{ color: "var(--text-muted)" }}>Return: </span>
          <span style={{ fontWeight: 700 }}>{formatReturnTimeline(player)}</span>
        </div>
      </div>

      {(window.buy_reasons.length > 0 || window.risk_factors.length > 0) && (
        <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
          {window.buy_reasons.map((reason) => (
            <span key={reason} style={{ color: "#22c55e" }}>
              + {reason}
            </span>
          ))}
          {window.risk_factors.map((risk) => (
            <span key={risk} style={{ color: "#f97316" }}>
              ! {risk}
            </span>
          ))}
        </div>
      )}

      {window.leagues_to_target.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 800 }}>
            TARGET IN THESE LEAGUES
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {window.leagues_to_target.map((league) => (
              <a
                key={league.league_id}
                href={`https://sleeper.com/leagues/${league.league_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  background: "rgba(96,165,250,0.12)",
                  color: "var(--blue)",
                  textDecoration: "none",
                  border: "1px solid rgba(96,165,250,0.2)",
                }}
              >
                {league.league_name} ({league.owner_display_name})
              </a>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function InjuryTracker() {
  const { username } = useParams<{ username: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("injuries");
  const { data: injuries, isLoading: injuriesLoading, error: injuriesError } = useInjuredPlayers(username ?? "");
  const { data: windows, isLoading: windowsLoading, error: windowsError } = useBuyingWindows(username ?? "");

  const isLoading = activeTab === "injuries" ? injuriesLoading : windowsLoading;
  const error = activeTab === "injuries" ? injuriesError : windowsError;
  const tabs: SegmentedControlItem<Tab>[] = [
    {
      key: "injuries",
      label: "My Injuries",
      description: injuries ? injuries.length : undefined,
    },
    {
      key: "buying",
      label: "Buying Windows",
      description: windows ? windows.length : undefined,
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Injury Tracker"
        subtitle="Monitor injuries across your portfolio and find buying windows."
        actions={<FreshnessBar />}
      />

      {activeTab === "injuries" && injuries && injuries.length > 0 && (
        <RiskSummary injuries={injuries} />
      )}

      <div style={{ marginTop: 16 }}>
        <SegmentedControl
          items={tabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Injury tracker view"
        />
      </div>

      <div style={{ marginTop: 16 }}>
        {isLoading ? (
          <LoadingSkeleton label={activeTab === "injuries" ? "Loading injuries" : "Loading buying windows"} rows={4} />
        ) : error ? (
          <ErrorState
            title={activeTab === "injuries" ? "Could not load injuries" : "Could not load buying windows"}
            message={(error as Error).message}
          />
        ) : activeTab === "injuries" ? (
          <InjuryTable injuries={injuries ?? []} />
        ) : (windows ?? []).length === 0 ? (
          <Card className="edge-state-card">
            <p>No buying windows detected. This requires value snapshot history from syncs.</p>
          </Card>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {(windows ?? []).map((window) => (
              <WindowCard key={window.player.player_id} window={window} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
