import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { readStoredUsername, userScopedPath } from "../lib/current-user";

interface LegacyMarketRedirectProps {
  tab?: "movers" | "signals" | "free-agents";
  freeAgentTab?: "arbitrage" | "waivers";
}

export default function LegacyMarketRedirect({
  tab = "movers",
  freeAgentTab,
}: LegacyMarketRedirectProps) {
  const params = useParams<{ username?: string }>();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const username = params.username ? decodeURIComponent(params.username) : readStoredUsername();
    if (!username) {
      setLocation("/");
      return;
    }
    const query = new URLSearchParams();
    query.set("tab", tab);
    if (freeAgentTab) query.set("fa", freeAgentTab);
    setLocation(`${userScopedPath("market", username)}?${query.toString()}`);
  }, [freeAgentTab, params.username, setLocation, tab]);

  return (
    <div className="min-h-screen bg-[var(--dark)] text-[var(--text)] grid place-items-center px-6">
      <div className="edge-card text-center">
        <p className="label mb-2">Loading</p>
        <p className="text-sm text-[var(--text-dim)]">Opening Market...</p>
      </div>
    </div>
  );
}
