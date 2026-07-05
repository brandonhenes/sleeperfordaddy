import { useState } from "react";
import { PlayerLink, PositionBadge } from "../../components/ui";
import type { HitRateData, LeagueADP } from "../../hooks/use-draft-data";

interface AnalyticsViewProps {
  hitRates: HitRateData | undefined;
  rookieADP: LeagueADP[] | undefined;
}

export default function AnalyticsView({ hitRates, rookieADP }: AnalyticsViewProps) {
  const [activeTab, setActiveTab] = useState<"hit_rates" | "adp">("hit_rates");

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {([
          { key: "hit_rates" as const, label: "Hit Rate Analysis" },
          { key: "adp" as const, label: "Your League ADP" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeTab === t.key ? "2px solid var(--amber)" : "2px solid transparent",
              color: activeTab === t.key ? "var(--amber)" : "var(--text-muted)",
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "hit_rates" && <HitRateView data={hitRates} />}
      {activeTab === "adp" && <ADPView data={rookieADP} />}
    </div>
  );
}

function HitRateView({ data }: { data: HitRateData | undefined }) {
  const [posFilter, setPosFilter] = useState<string>("ALL");

  if (!data || data.by_position_round.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No draft history data yet. Trigger a sync to load NFL draft history.
      </div>
    );
  }

  const positions = ["ALL", "QB", "RB", "WR", "TE"];
  const filtered = posFilter === "ALL"
    ? data.by_position_round
    : data.by_position_round.filter((r) => r.position === posFilter);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {data.overall_by_round.map((r) => (
          <div key={r.round} style={{
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "14px 18px", minWidth: 100, textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Round {r.round}</div>
            <div className="font-mono" style={{
              fontSize: 24, fontWeight: 800,
              color: r.hit_rate >= 50 ? "var(--green)" : r.hit_rate >= 30 ? "var(--amber)" : "var(--red)",
            }}>
              {r.hit_rate}%
            </div>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{r.total} players</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {positions.map((pos) => (
          <button key={pos} onClick={() => setPosFilter(pos)} style={{
            background: posFilter === pos ? "var(--amber)" : "var(--card)",
            color: posFilter === pos ? "var(--dark-base)" : "var(--text-dim)",
            border: `1px solid ${posFilter === pos ? "var(--amber)" : "var(--border)"}`,
            borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            {pos}
          </button>
        ))}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["POS", "ROUND", "DRAFTED", "HITS", "HIT RATE", "AVG GAMES", "NOTABLE HITS", "NOTABLE BUSTS"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={`${r.position}-${r.round}-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px" }}><PositionBadge position={r.position} /></td>
                <td style={{ padding: "10px 12px" }}>{r.pick_range}</td>
                <td className="font-mono" style={{ padding: "10px 12px" }}>{r.total_drafted}</td>
                <td className="font-mono" style={{ padding: "10px 12px", color: "var(--green)" }}>{r.hits}</td>
                <td style={{ padding: "10px 12px" }}>
                  <span className="font-mono" style={{
                    fontWeight: 700,
                    color: r.hit_rate_pct >= 50 ? "var(--green)" : r.hit_rate_pct >= 30 ? "var(--amber)" : "var(--red)",
                  }}>
                    {r.hit_rate_pct}%
                  </span>
                </td>
                <td className="font-mono" style={{ padding: "10px 12px", color: "var(--text-dim)" }}>{r.avg_games}</td>
                <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--green)" }}>
                  {r.notable_hits.slice(0, 3).join(", ") || "-"}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--red)" }}>
                  {r.notable_busts.slice(0, 2).join(", ") || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ADPView({ data }: { data: LeagueADP[] | undefined }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No completed 2026 rookie drafts yet. ADP will appear as your leagues finish drafting.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
        Aggregate ADP from {data[0]?.leagues_available ?? 0} completed rookie drafts in your leagues
      </div>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["ADP", "PLAYER", "POS", "RANGE", "DRAFTED"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.player_name} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="font-mono" style={{ padding: "10px 12px", fontWeight: 800 }}>{p.avg_pick}</td>
                <td style={{ padding: "10px 12px" }}>
                  <PlayerLink name={p.player_name} style={{ fontSize: 13 }} />
                </td>
                <td style={{ padding: "10px 12px" }}><PositionBadge position={p.position} /></td>
                <td className="font-mono" style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>
                  {p.min_pick === p.max_pick ? `Pick ${p.min_pick}` : `${p.min_pick} - ${p.max_pick}`}
                </td>
                <td className="font-mono" style={{ padding: "10px 12px", color: "var(--text-dim)" }}>
                  {p.times_drafted}x
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
