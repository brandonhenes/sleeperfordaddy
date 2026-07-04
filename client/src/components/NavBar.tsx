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
  { path: "trade-history", label: "Trade Log", icon: "📒" },
  { path: "rookie-draft", label: "Draft", icon: "🎓" },
  { path: "free-agents", label: "Free Agents", icon: "🔀" },
  { path: "history", label: "History", icon: "🕒" },
  { path: "injuries", label: "Injuries", icon: "🏥" },
  { path: "settings", label: "Settings", icon: "⚙️" },
];

const MOBILE_DOCK_ITEMS = [
  { path: "dashboard", label: "Home", icon: "⚡" },
  { path: "power", label: "Power", icon: "📋" },
  { path: "portfolio", label: "Portfolio", icon: "📊" },
  { path: "trade-calculator", label: "Calc", icon: "⚖️" },
  { path: "trade-finder", label: "Trades", icon: "🔍" },
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
            maxWidth: "calc(100vw - 24px)",
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  const noUserPaths = ["market", "trade-calculator", "settings", "rookie-draft"];

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location, isMobile]);

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
    <>
      <nav
        style={{
          background: "var(--dark)",
          borderBottom: "1px solid var(--border)",
          padding: isMobile
            ? "0 max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left))"
            : "0 24px",
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
              gap: isMobile ? 8 : 10,
              marginRight: isMobile ? 0 : 40,
              padding: "16px 0",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: isMobile ? 18 : 20 }}>⚡</span>
            <span
              className="font-mono"
              style={{
                color: "var(--amber)",
                fontWeight: 800,
                fontSize: isMobile ? 15 : 18,
                letterSpacing: isMobile ? 1.2 : 1.5,
              }}
            >
              THE EDGE
            </span>
          </div>
        </Link>

        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center" }}>
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
          </div>
        )}

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: isMobile ? 8 : 12,
            flexShrink: 0,
          }}
        >
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen((open) => !open)}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 8,
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-muted)",
                fontFamily: "inherit",
              }}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? "✕" : "☰"}
            </button>
          )}

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
          {!isMobile && <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{username}</span>}
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

      {isMobile && mobileMenuOpen && (
        <div
          style={{
            background: "var(--dark)",
            borderBottom: "1px solid var(--border)",
            padding: "8px 16px 16px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.path);
              return (
                <Link key={`mobile-${item.path}`} href={navHref(item.path)}>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      background: "none",
                      border: "none",
                      color: active ? "var(--amber)" : "var(--text-muted)",
                      padding: "14px 0",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: 0.3,
                      borderBottom: "1px solid rgba(51,65,85,0.35)",
                      textAlign: "left",
                      fontFamily: "inherit",
                      width: "100%",
                    }}
                  >
                    {item.icon} {item.label}
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {isMobile && (
        <nav
          aria-label="Primary mobile navigation"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 120,
            display: "grid",
            gridTemplateColumns: `repeat(${MOBILE_DOCK_ITEMS.length}, minmax(0, 1fr))`,
            gap: 2,
            padding: "7px max(8px, env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left))",
            background: "rgba(10, 15, 26, 0.96)",
            borderTop: "1px solid var(--border)",
            boxShadow: "0 -10px 30px rgba(0,0,0,0.35)",
            backdropFilter: "blur(12px)",
          }}
        >
          {MOBILE_DOCK_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <Link key={`dock-${item.path}`} href={navHref(item.path)}>
                <button
                  type="button"
                  style={{
                    width: "100%",
                    minHeight: 50,
                    border: "none",
                    borderRadius: 10,
                    background: active ? "rgba(245,158,11,0.14)" : "transparent",
                    color: active ? "var(--amber)" : "var(--text-muted)",
                    display: "grid",
                    placeItems: "center",
                    gap: 2,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0,
                    padding: "5px 2px",
                  }}
                  aria-current={active ? "page" : undefined}
                >
                  <span style={{ fontSize: 17, lineHeight: 1 }}>{item.icon}</span>
                  <span style={{ lineHeight: 1.1, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                </button>
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
