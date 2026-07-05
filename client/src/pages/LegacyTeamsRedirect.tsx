import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { readStoredUsername, userScopedPath } from "../lib/current-user";

interface LegacyTeamsRedirectProps {
  tab?: "power" | "grades" | "history";
}

export default function LegacyTeamsRedirect({ tab = "power" }: LegacyTeamsRedirectProps) {
  const params = useParams<{ username?: string }>();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const username = params.username ? decodeURIComponent(params.username) : readStoredUsername();
    if (!username) {
      setLocation("/");
      return;
    }

    const query = new URLSearchParams();
    if (tab !== "power") query.set("tab", tab);
    const suffix = query.toString();
    setLocation(`${userScopedPath("power", username)}${suffix ? `?${suffix}` : ""}`);
  }, [params.username, setLocation, tab]);

  return (
    <div className="min-h-screen bg-[var(--dark)] text-[var(--text)] grid place-items-center px-6">
      <div className="edge-card text-center">
        <p className="label mb-2">Loading</p>
        <p className="text-sm text-[var(--text-dim)]">Opening Teams...</p>
      </div>
    </div>
  );
}
