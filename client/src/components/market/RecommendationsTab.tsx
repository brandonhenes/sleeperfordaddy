import { useRecommendations, type Recommendation } from "../../hooks/use-market";
import { posColor, dirColor } from "../../lib/position-colors";
import { PlayerLink } from "../ui";

function DirectionBadge({ direction }: { direction: string }) {
  const color = dirColor(direction);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.8,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      {direction.toUpperCase()}
    </span>
  );
}

function RecCard({ rec }: { rec: Recommendation }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <DirectionBadge direction={rec.direction} />
        <PlayerLink name={rec.player_name} style={{ fontSize: 15 }} />
        {rec.position && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: posColor(rec.position),
            }}
          >
            {rec.position}
          </span>
        )}
        {rec.team && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {rec.team}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div className="font-mono" style={{ display: "flex", gap: 12, fontSize: 12 }}>
          {rec.current_value != null && (
            <span style={{ color: "var(--amber)" }}>
              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>FC </span>
              {rec.current_value.toLocaleString()}
            </span>
          )}
          {rec.ktc_value != null && (
            <span style={{ color: "#3b82f6" }}>
              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>KTC </span>
              {rec.ktc_value.toLocaleString()}
            </span>
          )}
          {rec.fp_value != null && (
            <span style={{ color: "#7c3aed" }}>
              <span style={{ fontSize: 10, color: "var(--text-dim)" }}>FP </span>
              {rec.fp_value.toLocaleString()}
            </span>
          )}
        </div>
        {rec.confidence != null && (
          <div style={{ flex: 1, maxWidth: 120 }}>
            <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${rec.confidence}%`, height: "100%", background: dirColor(rec.direction), borderRadius: 2 }} />
            </div>
          </div>
        )}
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
          {new Date(rec.rec_date).toLocaleDateString()}
        </span>
      </div>

      {rec.rationale && (
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
          {rec.rationale}
        </p>
      )}
    </div>
  );
}

export default function RecommendationsTab() {
  const { data, isLoading, error } = useRecommendations();

  if (isLoading) return <TabSkeleton />;
  if (error) return <TabError message={(error as Error).message} />;
  if (!data || data.length === 0) return <TabEmpty label="No recommendations yet" />;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {data.map((rec) => (
        <RecCard key={rec.id} rec={rec} />
      ))}
    </div>
  );
}

function TabSkeleton() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            height: 100,
          }}
        />
      ))}
    </div>
  );
}

function TabError({ message }: { message: string }) {
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
      Error: {message}
    </div>
  );
}

function TabEmpty({ label }: { label: string }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 40,
        textAlign: "center",
        color: "var(--text-muted)",
      }}
    >
      {label}
    </div>
  );
}
