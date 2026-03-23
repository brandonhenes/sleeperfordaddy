import { useState } from "react";
import { useMovers, type ValueMover } from "../../hooks/use-market";
import { posColor } from "../../lib/position-colors";
import { PlayerLink } from "../ui";

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

function DeltaCell({
  value,
  percent,
}: {
  value: number | null;
  percent: number | null;
}) {
  const color = deltaColor(value);

  return (
    <td
      style={{
        padding: "10px 12px",
        textAlign: "right",
        borderTop: "1px solid var(--border)",
        background: "rgba(245, 158, 11, 0.08)",
        minWidth: 100,
      }}
    >
      <div
        className="font-mono"
        style={{ fontSize: 12, fontWeight: 700, color }}
      >
        {formatSignedValue(value)}
      </div>
      <div style={{ fontSize: 10, color }}>{formatPercent(percent)}</div>
    </td>
  );
}

function MovementTable({
  movers,
  windowDays,
}: {
  movers: ValueMover[];
  windowDays: WindowDays;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--dark-base)" }}>
            <th
              style={{
                textAlign: "left",
                padding: "10px 12px",
                fontSize: 11,
                color: "var(--text-muted)",
                letterSpacing: 0.5,
                minWidth: 140,
              }}
            >
              PLAYER
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "10px 12px",
                fontSize: 11,
                color: "var(--text-muted)",
                letterSpacing: 0.5,
                minWidth: 50,
              }}
            >
              POS
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "10px 12px",
                fontSize: 11,
                color: "var(--text-muted)",
                letterSpacing: 0.5,
                minWidth: 50,
              }}
            >
              TEAM
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "10px 12px",
                fontSize: 11,
                color: "var(--text-muted)",
                letterSpacing: 0.5,
                minWidth: 80,
              }}
            >
              FC VALUE
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "10px 12px",
                fontSize: 11,
                color: "var(--amber)",
                letterSpacing: 0.5,
                background: "rgba(245, 158, 11, 0.08)",
                minWidth: 100,
              }}
            >
              {windowDays}D CHANGE
            </th>
          </tr>
        </thead>
        <tbody>
          {movers.map((mover) => (
            <tr key={mover.player_id}>
              <td
                style={{
                  padding: "10px 12px",
                  borderTop: "1px solid var(--border)",
                  minWidth: 140,
                }}
              >
                <PlayerLink name={mover.player_name} style={{ fontSize: 13 }} />
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  borderTop: "1px solid var(--border)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: posColor(mover.position ?? ""),
                }}
              >
                {mover.position ?? "-"}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  borderTop: "1px solid var(--border)",
                  fontSize: 12,
                  color: "var(--text-dim)",
                }}
              >
                {mover.team ?? "-"}
              </td>
              <td
                className="font-mono"
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  borderTop: "1px solid var(--border)",
                  fontSize: 13,
                  fontWeight: 700,
                  minWidth: 80,
                }}
              >
                {formatValue(mover.fc_value_now)}
              </td>
              <DeltaCell
                value={getDelta(mover, windowDays)}
                percent={getPercentChange(mover, windowDays)}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <div
      style={{
        flex: 1,
        minWidth: 320,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, rgba(15,23,42,0.45), rgba(15,23,42,0.1))",
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
    </div>
  );
}

export default function ValueMoversTab() {
  const { data, isLoading, error } = useMovers();
  const [windowDays, setWindowDays] = useState<WindowDays>(7);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("ALL");

  if (isLoading) {
    return (
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          color: "var(--text-muted)",
        }}
      >
        Loading value movers...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          color: "var(--red)",
        }}
      >
        Error: {(error as Error).message}
      </div>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {WINDOWS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border:
                  days === windowDays
                    ? "1px solid var(--amber)"
                    : "1px solid var(--border)",
                background:
                  days === windowDays
                    ? "rgba(245, 158, 11, 0.14)"
                    : "var(--card)",
                color: days === windowDays ? "var(--amber)" : "var(--text-muted)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {days}D
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {POSITIONS.map((position) => (
          <button
            key={position}
            type="button"
            onClick={() => setPositionFilter(position)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border:
                position === positionFilter
                  ? "1px solid var(--amber)"
                  : "1px solid var(--border)",
              background:
                position === positionFilter
                  ? "rgba(245, 158, 11, 0.14)"
                  : "var(--card)",
              color: position === positionFilter ? "var(--amber)" : "var(--text-muted)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {position}
          </button>
        ))}
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
