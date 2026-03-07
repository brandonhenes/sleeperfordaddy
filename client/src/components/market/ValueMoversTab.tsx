import { useMovers, type Mover } from "../../hooks/use-market";
import { posColor } from "../../lib/position-colors";
import EdgeScoreBadge from "../EdgeScoreBadge";
import { PlayerLink } from "../ui";

function SourceDelta({
  current,
  previous,
  color,
}: {
  current: number | null;
  previous: number | null;
  color: string;
}) {
  if (current == null) {
    return (
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
        {"\u2014"}
      </span>
    );
  }

  const delta = previous != null ? current - previous : null;

  return (
    <span className="font-mono" style={{ fontSize: 11 }}>
      <span style={{ color }}>{current.toFixed(1)}</span>
      {delta != null && Math.abs(delta) >= 0.1 && (
        <span
          style={{
            color: delta > 0 ? "var(--green)" : "var(--red)",
            marginLeft: 3,
            fontSize: 10,
          }}
        >
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)}
        </span>
      )}
    </span>
  );
}

function MoverRow({ mover, type }: { mover: Mover; type: "riser" | "faller" }) {
  const deltaColor = type === "riser" ? "var(--green)" : "var(--red)";
  const arrow = type === "riser" ? "\u25B2" : "\u25BC";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px 2fr 60px 60px 60px 70px",
        alignItems: "center",
        padding: "8px 14px",
        borderBottom: "1px solid var(--border)",
        gap: 8,
      }}
    >
      <EdgeScoreBadge score={mover.edge_score} size="sm" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: posColor(mover.position ?? ""),
            flexShrink: 0,
          }}
        >
          {mover.position}
        </span>
        <PlayerLink name={mover.player_name} style={{ fontSize: 13 }} />
        {mover.team && (
          <span
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            {mover.team}
          </span>
        )}
      </div>
      <SourceDelta
        current={mover.fc_score}
        previous={mover.prev_fc_score}
        color="var(--amber)"
      />
      <SourceDelta
        current={mover.ktc_score}
        previous={mover.prev_ktc_score}
        color="#3b82f6"
      />
      <SourceDelta
        current={mover.dp_score}
        previous={mover.prev_dp_score}
        color="#7c3aed"
      />
      <span
        className="font-mono"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: deltaColor,
          textAlign: "right",
        }}
      >
        {arrow} {Math.abs(mover.edge_delta).toFixed(1)}
      </span>
    </div>
  );
}

function MoverColumn({
  title,
  movers,
  type,
  color,
}: {
  title: string;
  movers: Mover[];
  type: "riser" | "faller";
  color: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div
        style={{
          padding: "10px 14px",
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: 1,
          color,
          textTransform: "uppercase",
          borderBottom: `2px solid ${color}`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "0 0 10px 10px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "40px 2fr 60px 60px 60px 70px",
            padding: "6px 14px",
            borderBottom: "1px solid var(--border)",
            gap: 8,
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: 0.5,
          }}
        >
          <span>EDGE</span>
          <span>PLAYER</span>
          <span>FC</span>
          <span>KTC</span>
          <span>DP</span>
          <span style={{ textAlign: "right" }}>DELTA</span>
        </div>
        {movers.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            No movers
          </div>
        ) : (
          movers.slice(0, 25).map((m) => (
            <MoverRow key={m.player_id} mover={m} type={type} />
          ))
        )}
      </div>
    </div>
  );
}

export default function ValueMoversTab() {
  const { data, isLoading, error } = useMovers(7);

  if (isLoading) return <MoversSkeleton />;
  if (error) {
    return (
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 40,
          textAlign: "center",
          color: "var(--red)",
        }}
      >
        Error: {(error as Error).message}
      </div>
    );
  }

  const { risers = [], fallers = [] } = data ?? {};

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <MoverColumn
        title="Risers"
        movers={risers}
        type="riser"
        color="var(--green)"
      />
      <MoverColumn
        title="Fallers"
        movers={fallers}
        type="faller"
        color="var(--red)"
      />
    </div>
  );
}

function MoversSkeleton() {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      {[1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            flex: 1,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            height: 400,
          }}
        />
      ))}
    </div>
  );
}
