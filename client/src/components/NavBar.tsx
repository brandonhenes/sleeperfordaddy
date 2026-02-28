import { Link, useLocation } from "wouter";
import { avatarUrl } from "../lib/utils";

interface NavBarProps {
  username: string;
  avatarId?: string;
}

const NAV_ITEMS = [
  { path: "dashboard", label: "Dashboard", icon: "⚡" },
  { path: "portfolio", label: "Portfolio", icon: "📊" },
  { path: "market", label: "Market", icon: "📈" },
  { path: "action", label: "Action", icon: "🎯" },
  { path: "arbitrage", label: "Arbitrage", icon: "🔀" },
];

export default function NavBar({ username, avatarId }: NavBarProps) {
  const [location] = useLocation();

  function isActive(path: string): boolean {
    if (path === "market") return location.startsWith("/market");
    return location.includes(`/${path}/`);
  }

  function navHref(path: string): string {
    if (path === "market") return "/market";
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
