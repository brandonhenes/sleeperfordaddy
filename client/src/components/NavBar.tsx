import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { avatarUrl } from "../lib/utils";
import { useNotifications, type Notification } from "../hooks/use-notifications";

interface NavBarProps {
  username: string;
  avatarId?: string;
}

const NAV_ITEMS = [
  { path: "dashboard", label: "Dashboard", icon: "⚡" },
  { path: "power", label: "Power", icon: "📋" },
  { path: "portfolio", label: "Portfolio", icon: "📊" },
  { path: "market", label: "Market", icon: "📈" },
  { path: "trade-calculator", label: "Trade Calc", icon: "⚖️" },
  { path: "trade-finder", label: "Trade Finder", icon: "🔍" },
  { path: "rookie-draft", label: "Draft", icon: "🎓" },
  { path: "free-agents", label: "Free Agents", icon: "🔀" },
  { path: "history", label: "History", icon: "🕒" },
  { path: "injuries", label: "Injuries", icon: "🏥" },
  { path: "settings", label: "Settings", icon: "⚙️" },
];

const sevColor: Record<string, string> = {
  high: "#ef4444",
  medium: "#eab308",
  low: "#6b7280",
};

const typeIcon: Record<string, string> = {
  arbitrage: "🔀",
  injury: "🏥",
  disagreement: "⚠️",
  buying_window: "💰",
};

function NotificationBell({ username }: { username: string }) {
  const { data: notifications } = useNotifications(username);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const count = notifications?.length ?? 0;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 18,
          padding: "4px 8px",
          position: "relative",
          color: "var(--text-muted)",
        }}
        aria-label="Notifications"
      >
        🔔
        {count > 0 && (
          <span
            style={{
              position: "absolute",
              top: 0,
              right: 2,
              background: "#ef4444",
              color: "#fff",
              fontSize: 9,
              fontWeight: 800,
              borderRadius: "50%",
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 8,
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--dark)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            zIndex: 200,
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text)",
            }}
          >
            Notifications {count > 0 && `(${count})`}
          </div>
          {count === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              No new notifications
            </div>
          ) : (
            notifications!.map((n: Notification) => (
              <div
                key={n.id}
                style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 14, marginTop: 2 }}>{typeIcon[n.type] ?? "📌"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: sevColor[n.severity] ?? "var(--text)" }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
                    {n.message}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function NavBar({ username, avatarId }: NavBarProps) {
  const [location] = useLocation();

  const noUserPaths = ["market", "trade-calculator", "settings", "rookie-draft"];

  function isActive(path: string): boolean {
    if (noUserPaths.includes(path)) return location.startsWith(`/${path}`);
    return location.includes(`/${path}/`);
  }

  function navHref(path: string): string {
    if (noUserPaths.includes(path)) return `/${path}`;
    return `/${path}/${encodeURIComponent(username)}`;
  }

  const initial = username.charAt(0).toUpperCase();

  return (
    <nav
      style={{
        background: "var(--dark)",
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <Link href="/">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginRight: 40,
            padding: "16px 0",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 20 }}>⚡</span>
          <span
            className="font-mono"
            style={{
              color: "var(--amber)",
              fontWeight: 800,
              fontSize: 18,
              letterSpacing: 1.5,
            }}
          >
            THE EDGE
          </span>
        </div>
      </Link>

      {NAV_ITEMS.map((item) => {
        const active = isActive(item.path);
        return (
          <Link key={item.path} href={navHref(item.path)}>
            <button
              style={{
                background: "none",
                border: "none",
                color: active ? "var(--amber)" : "var(--text-muted)",
                padding: "18px 16px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 0.5,
                borderBottom: active
                  ? "2px solid var(--amber)"
                  : "2px solid transparent",
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
            >
              {item.icon} {item.label}
            </button>
          </Link>
        );
      })}

      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Link href="/how-it-works">
          <button
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "50%",
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-muted)",
            }}
            aria-label="How It Works"
          >
            ?
          </button>
        </Link>
        <NotificationBell username={username} />
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
          {username}
        </span>
        {avatarId ? (
          <img
            src={avatarUrl(avatarId)}
            alt={username}
            style={{ width: 32, height: 32, borderRadius: "50%" }}
          />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--amber), var(--amber-dark))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--dark-base)",
            }}
          >
            {initial}
          </div>
        )}
      </div>
    </nav>
  );
}
