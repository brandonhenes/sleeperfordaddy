import { POS_FILTERS } from "./rookie-draft-config";

export type DraftViewMode = "board" | "positional" | "compare" | "myboard" | "mock" | "live" | "analytics";

const VIEW_MODES: { key: DraftViewMode; label: string }[] = [
  { key: "board", label: "Big Board" },
  { key: "positional", label: "By Position" },
  { key: "myboard", label: "My Board" },
  { key: "mock", label: "Mock Draft" },
  { key: "live", label: "Live" },
  { key: "analytics", label: "Analytics" },
];

type DraftHubControlsProps = {
  viewMode: DraftViewMode;
  onSetViewMode: (mode: DraftViewMode) => void;
  posFilter: string;
  onSetPosFilter: (position: string) => void;
  showWatchlistOnly: boolean;
  onToggleWatchlistOnly: () => void;
  watchlistCount: number;
};

export default function DraftHubControls({
  viewMode,
  onSetViewMode,
  posFilter,
  onSetPosFilter,
  showWatchlistOnly,
  onToggleWatchlistOnly,
  watchlistCount,
}: DraftHubControlsProps) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
      <div
        style={{
          display: "flex",
          gap: 0,
          border: "1px solid var(--border)",
          borderRadius: 6,
          overflow: "hidden",
          marginRight: 12,
        }}
      >
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.key}
            onClick={() => onSetViewMode(mode.key)}
            style={{
              background: viewMode === mode.key ? "var(--amber)" : "var(--card)",
              color: viewMode === mode.key ? "var(--dark-base)" : "var(--text-muted)",
              border: "none",
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {(viewMode === "board" || viewMode === "positional") && (
        <>
          {viewMode === "board" &&
            POS_FILTERS.map((pos) => (
              <button
                key={pos}
                onClick={() => onSetPosFilter(pos)}
                style={{
                  background: posFilter === pos ? "var(--amber)" : "var(--card)",
                  color: posFilter === pos ? "var(--dark-base)" : "var(--text-dim)",
                  border: `1px solid ${posFilter === pos ? "var(--amber)" : "var(--border)"}`,
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: 0.5,
                }}
              >
                {pos}
              </button>
            ))}
          <button
            onClick={onToggleWatchlistOnly}
            style={{
              background: showWatchlistOnly ? "#f59e0b" : "var(--card)",
              color: showWatchlistOnly ? "var(--dark-base)" : "var(--text-dim)",
              border: `1px solid ${showWatchlistOnly ? "#f59e0b" : "var(--border)"}`,
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: 8,
            }}
          >
            {"\u2605"} Watchlist ({watchlistCount})
          </button>
        </>
      )}
    </div>
  );
}
