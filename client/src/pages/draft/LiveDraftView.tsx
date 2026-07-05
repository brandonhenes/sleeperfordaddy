import { PositionBadge } from "../../components/ui";
import type { ActiveDraftSummary, LiveDraftState } from "@shared/types";

interface LiveDraftViewProps {
  activeDrafts: ActiveDraftSummary[] | undefined;
  liveDraftState: LiveDraftState | undefined;
  onSelectDraft: (draftId: string, leagueId: string) => void;
}

export default function LiveDraftView({
  activeDrafts,
  liveDraftState,
  onSelectDraft,
}: LiveDraftViewProps) {
  if (!activeDrafts || activeDrafts.length === 0) {
    return (
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "48px 24px",
          marginTop: 16,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        No active 2026 rookie drafts found. Drafts will appear here when they start on Sleeper.
      </div>
    );
  }

  if (!liveDraftState) {
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Active Drafts</div>
        {activeDrafts.map((d) => (
          <button
            key={d.draft_id}
            onClick={() => onSelectDraft(d.draft_id, d.league_id)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "14px 18px",
              marginBottom: 8,
              width: "100%",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "var(--text)",
            }}
          >
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.league_name}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {d.status === "drafting" ? `${d.picks_made}/${d.total_picks} picks made` : "Pre-draft"}
              </div>
            </div>
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                background:
                  d.status === "drafting" ? "rgba(34,197,94,0.15)" : "rgba(61,139,253,0.15)",
                color: d.status === "drafting" ? "var(--green)" : "var(--amber)",
              }}
            >
              {d.status === "drafting" ? "LIVE" : "PRE-DRAFT"}
            </span>
          </button>
        ))}
      </div>
    );
  }

  const ds = liveDraftState;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{ds.league_name}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
            Pick {ds.current_pick} of {ds.total_rosters * ds.total_rounds}
          </span>
        </div>
        <span
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            background: "rgba(34,197,94,0.15)",
            color: "var(--green)",
          }}
        >
          LIVE (refreshes every 15s)
        </span>
      </div>

      {ds.on_the_clock && (
        <div
          style={{
            background: ds.on_the_clock.is_user ? "rgba(61,139,253,0.1)" : "var(--card)",
            border: ds.on_the_clock.is_user ? "2px solid var(--amber)" : "1px solid var(--border)",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>
            ON THE CLOCK
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: ds.on_the_clock.is_user ? "var(--amber)" : "var(--text)",
              marginTop: 4,
            }}
          >
            {ds.on_the_clock.display_name}
            {ds.on_the_clock.is_user && " (YOU)"}
          </div>
          {ds.on_the_clock.needs.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {ds.on_the_clock.needs.map((n) => (
                <span
                  key={n.position}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background:
                      n.grade === "hole" ? "rgba(239,68,68,0.15)" : "rgba(61,139,253,0.15)",
                    color: n.grade === "hole" ? "#fca5a5" : "var(--amber)",
                  }}
                >
                  {n.position} {n.grade.toUpperCase()}
                </span>
              ))}
            </div>
          )}
          {ds.user_recommendation && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                background: "rgba(61,139,253,0.08)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--amber)",
                fontWeight: 600,
              }}
            >
              {ds.user_recommendation}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            maxHeight: 500,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              fontWeight: 700,
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            PICKS MADE ({ds.picks_made.length})
          </div>
          {ds.picks_made.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No picks yet. Waiting for draft to begin...
            </div>
          ) : (
            [...ds.picks_made].reverse().map((pick) => (
              <div
                key={pick.pick_number}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border)",
                  background: pick.is_user_pick ? "rgba(61,139,253,0.08)" : "transparent",
                }}
              >
                <span className="font-mono" style={{ width: 40, fontSize: 11, color: "var(--text-muted)" }}>
                  {pick.round}.{String(pick.pick_in_round).padStart(2, "0")}
                </span>
                <span
                  style={{
                    width: 100,
                    fontSize: 11,
                    color: pick.is_user_pick ? "var(--amber)" : "var(--text-muted)",
                  }}
                >
                  {pick.display_name}
                </span>
                <PositionBadge position={pick.position} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{pick.player_name}</span>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            maxHeight: 500,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              fontWeight: 700,
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            BEST AVAILABLE
          </div>
          {ds.best_available.map((p) => (
            <div
              key={p.player_name}
              style={{
                padding: "8px 14px",
                borderBottom: "1px solid var(--border)",
                background: p.fit_for_user ? "rgba(34,197,94,0.06)" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PositionBadge position={p.position} />
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.player_name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-dim)" }}>
                  {p.tier.toUpperCase()}
                </span>
              </div>
              {p.fit_for_user && (
                <div style={{ fontSize: 10, color: "var(--green)", fontWeight: 600, marginTop: 2 }}>
                  {p.fit_for_user}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
