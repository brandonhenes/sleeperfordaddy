import { useEffect, useState } from "react";
import { useParams } from "wouter";
import AppShell from "../components/AppShell";
import { useOverview } from "../hooks/use-sleeper";

export default function WaiverWire() {
  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Waiver Wire</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          League-specific free agent suggestions
        </p>
      </div>
      <WaiverContent />
    </AppShell>
  );
}

export function WaiverContent() {
  const params = useParams<{ username: string }>();
  const storedUser = typeof window !== "undefined" ? localStorage.getItem("edge_username") ?? "" : "";
  const username = params.username ?? storedUser;
  const { data: overview, isLoading } = useOverview(username);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");

  const leagues: { league_id: string; name: string }[] = [];
  if (overview?.league_groups) {
    for (const g of overview.league_groups) {
      if (g.leagues.length > 0) {
        leagues.push({ league_id: g.leagues[g.leagues.length - 1], name: g.name });
      }
    }
  }

  useEffect(() => {
    if (leagues.length > 0 && !selectedLeagueId) {
      setSelectedLeagueId(leagues[0].league_id);
    }
  }, [leagues, selectedLeagueId]);

  if (isLoading) {
    return <div className="animate-pulse" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, height: 60 }} />;
  }

  if (leagues.length === 0) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No leagues found. Sync your account first.
      </div>
    );
  }

  return (
    <>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
        <label style={{ fontSize: 12, color: "var(--text-muted)", marginRight: 8 }}>League</label>
        <select
          value={selectedLeagueId}
          onChange={(e) => setSelectedLeagueId(e.target.value)}
          style={{ background: "var(--dark)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", minWidth: 260 }}
        >
          {leagues.map((l) => (
            <option key={l.league_id} value={l.league_id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: 12, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 24, color: "var(--text-muted)", fontSize: 13 }}>
        Waiver wire recommendations are being migrated to the new free agents workflow.
      </div>
    </>
  );
}
