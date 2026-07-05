import { useState } from "react";
import { useMovers } from "../../hooks/use-market";
import type { ValueMover } from "@shared/types";
import {
  Card,
  ErrorState,
  LoadingSkeleton,
  PlayerLink,
  PositionBadge,
  ResponsiveTable,
  SegmentedControl,
  type ResponsiveTableColumn,
} from "../ui";

const WINDOWS = [7, 14, 21, 28] as const;
const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"] as const;

type WindowDays = (typeof WINDOWS)[number];
type PositionFilter = (typeof POSITIONS)[number];

function getDelta(mover: ValueMover, windowDays: WindowDays): number | null {
  switch (windowDays) {
    case 7:
      return mover.fc_delta_7d;
    case 14:
      return mover.fc_delta_14d;
    case 21:
      return mover.fc_delta_21d;
    case 28:
      return mover.fc_delta_28d;
    default:
      return null;
  }
}

function getPercentChange(mover: ValueMover, windowDays: WindowDays): number | null {
  const currentValue = mover.fc_value_now;
  const delta = getDelta(mover, windowDays);
  if (currentValue == null || delta == null) return null;

  const previousValue = currentValue - delta;
  if (previousValue <= 0) return null;

  return (delta / previousValue) * 100;
}

function formatValue(value: number | null): string {
  if (value == null) return "-";
  return Math.round(value).toLocaleString();
}

function formatSignedValue(value: number | null): string {
  if (value == null) return "-";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()}`;
}

function formatPercent(value: number | null): string {
  if (value == null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function deltaColor(value: number | null): string {
  if (value == null || value === 0) return "var(--text-muted)";
  return value > 0 ? "var(--green)" : "var(--red)";
}

function DeltaValue({
  value,
  percent,
}: {
  value: number | null;
  percent: number | null;
}) {
  const color = deltaColor(value);

  return (
    <div style={{ textAlign: "right" }}>
      <div
        className="font-mono"
        style={{ fontSize: 12, fontWeight: 700, color }}
      >
        {formatSignedValue(value)}
      </div>
      <div style={{ fontSize: 10, color }}>{formatPercent(percent)}</div>
    </div>
  );
}

function MovementTable({
  movers,
  windowDays,
}: {
  movers: ValueMover[];
  windowDays: WindowDays;
}) {
  const columns: ResponsiveTableColumn<ValueMover>[] = [
    {
      key: "player",
      header: "Player",
      render: (mover) => <PlayerLink name={mover.player_name} style={{ fontSize: 13 }} />,
    },
    {
      key: "position",
      header: "Pos",
      render: (mover) => <PositionBadge position={mover.position} />,
    },
    {
      key: "team",
      header: "Team",
      render: (mover) => <span style={{ color: "var(--text-dim)" }}>{mover.team ?? "-"}</span>,
    },
    {
      key: "value",
      header: "FC Value",
      align: "right",
      render: (mover) => (
        <span className="font-mono" style={{ fontWeight: 700 }}>
          {formatValue(mover.fc_value_now)}
        </span>
      ),
    },
    {
      key: "delta",
      header: `${windowDays}D Change`,
      align: "right",
      render: (mover) => (
        <DeltaValue
          value={getDelta(mover, windowDays)}
          percent={getPercentChange(mover, windowDays)}
        />
      ),
    },
  ];

  return (
    <ResponsiveTable
      rows={movers}
      columns={columns}
      getRowKey={(mover, index) => `${mover.player_id}-${index}`}
    />
  );
}

function MovementPanel({
  title,
  movers,
  windowDays,
  accentColor,
}: {
  title: string;
  movers: ValueMover[];
  windowDays: WindowDays;
  accentColor: string;
}) {
  return (
    <Card
      style={{
        flex: 1,
        minWidth: 320,
        overflow: "hidden",
        padding: 0,
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, rgba(11,13,18,0.45), rgba(11,13,18,0.1))",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0.6,
            color: accentColor,
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
          Sorted by {windowDays}D FantasyCalc movement
        </div>
      </div>
      {movers.length === 0 ? (
        <div
          style={{
            padding: 28,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          No movers for this window
        </div>
      ) : (
        <MovementTable movers={movers} windowDays={windowDays} />
      )}
    </Card>
  );
}

export default function ValueMoversTab() {
  const { data, isLoading, error } = useMovers();
  const [windowDays, setWindowDays] = useState<WindowDays>(7);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");

  if (isLoading) {
    return <LoadingSkeleton label="Loading value movers" rows={4} />;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load value movers"
        message={(error as Error).message}
      />
    );
  }

  const movers = data ?? [];
  const filteredMovers = movers.filter((mover) =>
    positionFilter === "ALL" ? true : mover.position === positionFilter
  );
  const risers = filteredMovers
    .filter((mover) => (getDelta(mover, windowDays) ?? 0) > 0)
    .sort((left, right) => (getDelta(right, windowDays) ?? 0) - (getDelta(left, windowDays) ?? 0))
    .slice(0, 25);
  const fallers = filteredMovers
    .filter((mover) => (getDelta(mover, windowDays) ?? 0) < 0)
    .sort((left, right) => (getDelta(left, windowDays) ?? 0) - (getDelta(right, windowDays) ?? 0))
    .slice(0, 25);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>FantasyCalc Value Movers</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Focused on real dynasty value swings instead of edge-score noise.
          </div>
        </div>
        <div style={{ minWidth: 250 }}>
          <SegmentedControl
            items={WINDOWS.map((days) => ({ key: String(days), label: `${days}D` }))}
            value={String(windowDays)}
            onChange={(value) => setWindowDays(Number(value) as WindowDays)}
            ariaLabel="Mover window"
          />
        </div>
      </div>

      <div>
        <SegmentedControl
          items={POSITIONS.map((position) => ({ key: position, label: position }))}
          value={positionFilter}
          onChange={setPositionFilter}
          ariaLabel="Mover position filter"
        />
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <MovementPanel
          title="Risers"
          movers={risers}
          windowDays={windowDays}
          accentColor="var(--green)"
        />
        <MovementPanel
          title="Fallers"
          movers={fallers}
          windowDays={windowDays}
          accentColor="var(--red)"
        />
      </div>
    </div>
  );
}
