import { useMovers, type Mover } from "../../hooks/use-market";
import { posColor } from "../../lib/position-colors";
import { PlayerLink } from "../ui";

function MoverRow({ mover, type }: { mover: Mover; type: "riser" | "faller" }) {
  const color = type === "riser" ? "var(--green)" : "var(--red)";
  const arrow = type === "riser" ? "▲" : "▼";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: posColor(mover.position ?? ""),
          }}
        >
          {mover.position}
        </span>
        <PlayerLink name={mover.player_name} />
        {mover.team && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {mover.team}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          className="font-mono"
          style={{ fontSize: 13, color: "var(--text-dim)" }}
        >
          {mover.dynasty_value.toLocaleString()}
        </span>
        <span
          className="font-mono"
          style={{ fontSize: 13, fontWeight: 600, color, minWidth: 70, textAlign: "right" }}
        >
          {arrow} {Math.abs(mover.delta).toLocaleString()}
        </span>
      </div>
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
        {movers.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No movers
          </div>
        ) : (
          movers.slice(0, 25).map((m, i) => (
            <MoverRow key={`${m.player_name}-${i}`} mover={m} type={type} />
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
      <MoverColumn title="Risers" movers={risers} type="riser" color="var(--green)" />
      <MoverColumn title="Fallers" movers={fallers} type="faller" color="var(--red)" />
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
