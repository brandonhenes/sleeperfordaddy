import type { ReactNode } from "react";
import { useEnsureUser } from "../hooks/use-ensure-user";

interface SyncGateProps {
  username: string;
  children: ReactNode;
  checkingLabel?: string;
  checkingDescription?: string;
  syncingDescription?: string;
}

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
} as const;

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
      <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          Enter a Sleeper username to load this view.
        </p>
      </div>
    );
  }

  if (phase === "checking" || phase === "syncing") {
    return (
      <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center" }}>
        <div
          style={{
            fontSize: 14,
            color: "var(--amber)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span className="animate-pulse">.</span>
          {phase === "checking"
            ? `Looking up ${username}...`
            : `Syncing ${username}'s leagues${
                syncProgress ? ` (${syncProgress.done}/${syncProgress.total})` : "..."
              }`}
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
          {phase === "syncing" ? syncingDescription : checkingLabel || checkingDescription}
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--red)", fontSize: 14, margin: 0 }}>
          {errorMsg || "Something went wrong."}
        </p>
        <button
          type="button"
          onClick={retry}
          style={{
            marginTop: 16,
            background: "linear-gradient(135deg, var(--amber), var(--amber-dark))",
            color: "var(--dark-base)",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
