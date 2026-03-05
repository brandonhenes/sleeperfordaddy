import { useState } from "react";
import { Link, useLocation } from "wouter";
import { avatarUrl } from "../lib/utils";
import { useNotifications } from "../hooks/use-notifications";

interface NavBarProps {
  username: string;
  avatarId?: string;
}

const NAV_ITEMS = [
  { path: "dashboard", label: "Dashboard", icon: "D" },
  { path: "power", label: "Power", icon: "P" },
  { path: "portfolio", label: "Portfolio", icon: "O" },
  { path: "market", label: "Market", icon: "M" },
  { path: "trade-calculator", label: "Trade Calc", icon: "TC" },
  { path: "trade-finder", label: "Trade Finder", icon: "TF" },
  { path: "free-agents", label: "Free Agents", icon: "FA" },
  { path: "history", label: "History", icon: "H" },
  { path: "injuries", label: "Injuries", icon: "I" },
  { path: "settings", label: "Settings", icon: "S" },
];

const noUserPaths = ["market", "trade-calculator", "settings"];

export default function NavBar({ username, avatarId }: NavBarProps) {
  const [location] = useLocation();

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
          <span style={{ fontSize: 20 }}>*</span>
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
                padding: "18px 12px",
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

function NotificationBell({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const { data: notifications, refetch } = useNotifications(username);
  const unread = (notifications ?? []).filter((n) => !n.read).length;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => {
          if (!open) refetch();
          setOpen(!open);
        }}
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
          fontSize: 12,
          color: "var(--text-muted)",
        }}
        aria-label="Notifications"
      >
        {unread > 0 ? `!${Math.min(unread, 9)}` : "N"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 34,
            width: 260,
            maxHeight: 320,
            overflowY: "auto",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 10,
            zIndex: 110,
          }}
        >
          {(notifications ?? []).length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              No notifications
            </div>
          ) : (
            (notifications ?? []).map((n) => (
              <div key={n.id} style={{ fontSize: 12, color: "var(--text)", marginBottom: 8 }}>
                {n.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
