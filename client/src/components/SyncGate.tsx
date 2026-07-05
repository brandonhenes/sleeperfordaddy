import type { ReactNode } from "react";
import { useEnsureUser } from "../hooks/use-ensure-user";
import { Card, ErrorState } from "./ui";

export interface SyncGateProps {
  username: string;
  children: ReactNode;
  checkingLabel?: string;
  checkingDescription?: string;
  syncingDescription?: string;
}

export default function SyncGate({
  username,
  children,
  checkingLabel = "Checking if data is available...",
  checkingDescription = "Checking if data is available...",
  syncingDescription = "First-time sync may take a minute. Pulling leagues, rosters, and player data from Sleeper.",
}: SyncGateProps) {
  const { phase, syncProgress, errorMsg, retry } = useEnsureUser(username || undefined);

  if (!username) {
    return (
      <Card className="edge-state-card">
        <p>Enter a Sleeper username to load this view.</p>
      </Card>
    );
  }

  if (phase === "checking" || phase === "syncing") {
    return (
      <Card className="edge-state-card">
        <div className="edge-state-kicker">
          <span className="animate-pulse">.</span>
          {phase === "checking"
            ? `Looking up ${username}...`
            : `Syncing ${username}'s leagues${
                syncProgress ? ` (${syncProgress.done}/${syncProgress.total})` : "..."
              }`}
        </div>
        <p>
          {phase === "syncing" ? syncingDescription : checkingLabel || checkingDescription}
        </p>
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <ErrorState
        message={errorMsg || "Something went wrong."}
        actionLabel="Try Again"
        onAction={retry}
      />
    );
  }

  return <>{children}</>;
}
