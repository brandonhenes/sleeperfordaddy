import { PositionBadge } from "../../components/ui";
import type { LeagueSummary, MockDraftPick, MockDraftProspect, MockDraftSetup } from "@shared/types";

interface MockDraftViewProps {
  leagues: LeagueSummary[] | undefined;
  mockLeagueId: string;
  setMockLeagueId: (id: string) => void;
  mockSetup: MockDraftSetup | undefined;
  mockStarted: boolean;
  onStart: () => void;
  mockPicks: MockDraftPick[];
  onUserPick: (name: string) => void;
  prospects: MockDraftProspect[] | undefined;
}

export default function MockDraftView({
  leagues,
  mockLeagueId,
  setMockLeagueId,
  mockSetup,
  mockStarted,
  onStart,
  mockPicks,
  onUserPick,
  prospects,
}: MockDraftViewProps) {
  const pickedNames = new Set(mockPicks.filter((p) => p.selected_player).map((p) => p.selected_player!));
  const userPending = mockPicks.find((p) => p.is_user && !p.selected_player);
  const available = (prospects ?? []).filter((p) => !pickedNames.has(p.player_name));

  return (
    <div style={{ marginTop: 16 }}>
      {!mockStarted && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            SELECT LEAGUE
          </label>
          <select
            value={mockLeagueId}
            onChange={(e) => setMockLeagueId(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 8,
              padding: "10px 12px",
              background: "var(--dark-base)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <option value="">Choose a league...</option>
            {leagues?.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.league_name} ({l.mode.toUpperCase()}, {l.total_rosters} teams)
              </option>
            ))}
          </select>

          {mockSetup && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                {mockSetup.total_rosters} teams, {mockSetup.draft_rounds} rounds,{" "}
                {mockSetup.league_mode.toUpperCase()}
                {mockSetup.scoring_label && ` | ${mockSetup.scoring_label}`}
              </div>
              {mockSetup.teams.filter((t) => t.is_user).map((t) => (
                <div
                  key={t.roster_id}
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--amber)" }}
                >
                  You pick at position {t.draft_position} ({t.display_name})
                </div>
              ))}
              <button
                onClick={onStart}
                style={{
                  marginTop: 12,
                  background: "var(--amber)",
                  color: "var(--dark-base)",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 24px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Start Mock Draft
              </button>
            </div>
          )}
        </div>
      )}

      {mockStarted && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {mockPicks.map((pick) => (
              <div
                key={pick.pick_number}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border)",
                  background: pick.is_user ? "rgba(61,139,253,0.08)" : "transparent",
                  opacity: pick.selected_player ? 1 : 0.6,
                }}
              >
                <span
                  className="font-mono"
                  style={{ width: 40, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}
                >
                  {pick.round}.{String(pick.pick_in_round).padStart(2, "0")}
                </span>
                <span
                  style={{
                    width: 120,
                    fontSize: 12,
                    fontWeight: 600,
                    color: pick.is_user ? "var(--amber)" : "var(--text)",
                  }}
                >
                  {pick.display_name}
                </span>
                {pick.selected_player ? (
                  <>
                    <PositionBadge position={pick.selected_position} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{pick.selected_player}</span>
                    {pick.reasoning && (
                      <span style={{ fontSize: 10, color: "var(--text-dim)", fontStyle: "italic" }}>
                        {pick.reasoning}
                      </span>
                    )}
                  </>
                ) : pick.is_user ? (
                  <span style={{ flex: 1, fontSize: 13, color: "var(--amber)", fontWeight: 700 }}>
                    YOUR PICK: Select from available players {"\u2192"}
                  </span>
                ) : (
                  <span style={{ flex: 1, fontSize: 12, color: "var(--text-muted)" }}>
                    Simulating...
                  </span>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
              maxHeight: 600,
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
              {userPending ? "YOUR PICK: SELECT A PLAYER" : "BEST AVAILABLE"}
            </div>
            {available.slice(0, 20).map((p) => (
              <button
                key={p.player_name}
                onClick={() => userPending && onUserPick(p.player_name)}
                disabled={!userPending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border)",
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: userPending ? "pointer" : "default",
                  fontFamily: "inherit",
                  color: "var(--text)",
                  textAlign: "left",
                  opacity: userPending ? 1 : 0.6,
                }}
              >
                <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)", width: 20 }}>
                  {p.overall_rank}
                </span>
                <PositionBadge position={p.position} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{p.player_name}</div>
                  {p.school && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.school}</div>}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-dim)" }}>
                  {p.tier.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
