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
  const { phase, syncProgress, syncStep, syncDetail, errorMsg, retry } = useEnsureUser(username || undefined);
  const progressLabel = syncProgress ? `${syncProgress.done}/${syncProgress.total}` : null;

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
            : `Syncing ${username}'s leagues${progressLabel ? ` (${progressLabel})` : "..."}`}
        </div>
        <p>
          {phase === "syncing" ? syncingDescription : checkingLabel || checkingDescription}
        </p>
        {phase === "syncing" && (syncStep || syncDetail) && (
          <div className="edge-sync-detail" aria-live="polite">
            {syncStep && <span>{syncStep}</span>}
            {syncDetail && <span>{syncDetail}</span>}
          </div>
        )}
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <ErrorState
        message={errorMsg || "Something went wrong."}
        actionLabel="Try Again"
        onAction={retry}
      >
        {(syncStep || syncDetail) && (
          <div className="edge-sync-detail edge-sync-detail-error">
            {syncStep && <span>Failed at {syncStep}</span>}
            {syncDetail && <span>{syncDetail}</span>}
          </div>
        )}
      </ErrorState>
    );
  }

  return <>{children}</>;
}
