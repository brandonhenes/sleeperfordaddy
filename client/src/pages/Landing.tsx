import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useOverview, useStartSync, useSyncStatus } from "../hooks/use-sleeper";

type Phase = "idle" | "checking" | "syncing" | "error";

export default function Landing() {
  const [username, setUsername] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeUser, setActiveUser] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [, navigate] = useLocation();
  const syncTriggered = useRef(false);

  const overview = useOverview(phase === "checking" ? activeUser : undefined);
  const sync = useStartSync();
  const syncStatus = useSyncStatus(activeUser, phase === "syncing");

  // Handle overview result
  useEffect(() => {
    if (phase !== "checking") return;
    if (overview.data) {
      navigate(`/dashboard/${encodeURIComponent(activeUser)}`);
    }
    if (overview.error && !syncTriggered.current) {
      syncTriggered.current = true;
      setPhase("syncing");
      sync.mutate(activeUser, {
        onError: (err) => {
          setPhase("error");
          setErrorMsg(err.message);
        },
      });
    }
  }, [phase, overview.data, overview.error, activeUser, navigate, sync]);

  // Handle sync completion
  useEffect(() => {
    if (phase !== "syncing" || !syncStatus.data) return;
    const s = syncStatus.data.status;
    if (s === "done" || s === "complete") {
      navigate(`/dashboard/${encodeURIComponent(activeUser)}`);
    } else if (s === "error" || s === "failed") {
      setPhase("error");
      setErrorMsg(syncStatus.data.error || "Sync failed");
    }
  }, [phase, syncStatus.data, activeUser, navigate]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) return;
    syncTriggered.current = false;
    setActiveUser(trimmed);
    setPhase("checking");
    setErrorMsg("");
  }

  const isLoading = phase === "checking" || phase === "syncing";

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(160deg, var(--dark) 0%, var(--dark-base) 40%, var(--dark) 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono', -apple-system, system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
        <div
          style={{
            fontSize: 13,
            color: "var(--amber)",
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          DYNASTY DAILY PRESENTS
        </div>
        <h1
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: "var(--text)",
            margin: 0,
            letterSpacing: 2,
          }}
        >
          THE EDGE
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 14,
            marginTop: 12,
            letterSpacing: 0.5,
          }}
        >
          Your dynasty war room. Powered by data. Built for action.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter Sleeper username..."
          disabled={isLoading}
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "14px 20px",
            color: "var(--text)",
            fontSize: 15,
            width: 300,
            fontFamily: "inherit",
            opacity: isLoading ? 0.6 : 1,
          }}
          autoFocus
        />
        <button
          type="submit"
          disabled={!username.trim() || isLoading}
          style={{
            background:
              "linear-gradient(135deg, var(--amber), var(--amber-dark))",
            color: "var(--dark-base)",
            border: "none",
            borderRadius: 8,
            padding: "14px 24px",
            fontWeight: 700,
            fontSize: 14,
            cursor: isLoading ? "wait" : "pointer",
            letterSpacing: 0.5,
            opacity: !username.trim() || isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? "Loading..." : "Scout →"}
        </button>
      </form>

      {phase === "syncing" && (
        <div
          style={{
            marginTop: 20,
            color: "var(--amber)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span className="animate-pulse">●</span>
          Syncing {activeUser}'s leagues...
          {syncStatus.data?.leagues_done != null &&
          syncStatus.data?.leagues_total
            ? ` (${syncStatus.data.leagues_done}/${syncStatus.data.leagues_total})`
            : ""}
        </div>
      )}

      {phase === "error" && (
        <div style={{ marginTop: 20, color: "var(--red)", fontSize: 13 }}>
          {errorMsg || "Something went wrong. Try again."}
        </div>
      )}

      <div style={{ marginTop: 32, display: "flex", gap: 32 }}>
        {[
          "📊 Portfolio Tracking",
          "📈 Market Intelligence",
          "🎯 Trade Engine",
        ].map((f) => (
          <span
            key={f}
            style={{
              color: "var(--text-muted)",
              fontSize: 12,
              letterSpacing: 0.5,
            }}
          >
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}
