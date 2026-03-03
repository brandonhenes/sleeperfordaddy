import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useEnsureUser } from "../hooks/use-ensure-user";

export default function Landing() {
  const [username, setUsername] = useState("");
  const [activeUser, setActiveUser] = useState<string | undefined>(undefined);
  const [, navigate] = useLocation();

  const { phase, syncProgress, errorMsg, retry } = useEnsureUser(activeUser);

  // Navigate to dashboard when ready
  useEffect(() => {
    if (phase === "ready" && activeUser) {
      navigate(`/dashboard/${encodeURIComponent(activeUser)}`);
    }
  }, [phase, activeUser, navigate]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) return;
    setActiveUser(trimmed);
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
          {syncProgress
            ? ` (${syncProgress.done}/${syncProgress.total})`
            : ""}
        </div>
      )}

      {phase === "error" && (
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <div style={{ color: "var(--red)", fontSize: 13 }}>
            {errorMsg || "Something went wrong. Try again."}
          </div>
          <button
            onClick={() => {
              setActiveUser(undefined);
              retry();
            }}
            style={{
              marginTop: 8,
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 14px",
              color: "var(--text-muted)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
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
