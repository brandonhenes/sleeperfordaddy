import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Briefcase,
  Calculator,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  GraduationCap,
  HeartPulse,
  History,
  Menu,
  Search,
  Settings,
  Shuffle,
  TrendingUp,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { avatarUrl } from "../lib/utils";
import { userScopedPath } from "../lib/current-user";
import { useNotifications, type Notification } from "../hooks/use-notifications";

interface NavBarProps {
  username: string;
  avatarId?: string;
}

interface NavItem {
  label: string;
  href: (username: string) => string;
  icon: LucideIcon;
  active: string[];
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    label: "Today",
    href: (username) => userScopedPath("dashboard", username),
    icon: Zap,
    active: ["/dashboard", "/action"],
  },
  {
    label: "Trade",
    href: (username) => userScopedPath("trade", username),
    icon: Calculator,
    active: ["/trade", "/trade-calculator", "/trade-finder", "/trade-history"],
  },
  {
    label: "Market",
    href: (username) => userScopedPath("market", username),
    icon: TrendingUp,
    active: ["/market", "/signals", "/free-agents", "/arbitrage", "/waivers", "/rookie-draft"],
  },
  {
    label: "Teams",
    href: (username) => userScopedPath("power", username),
    icon: Users,
    active: ["/power", "/history", "/grades"],
  },
  {
    label: "Portfolio",
    href: (username) => userScopedPath("portfolio", username),
    icon: Briefcase,
    active: ["/portfolio", "/injuries"],
  },
];

const MORE_ITEMS: NavItem[] = [
  {
    label: "Trade Calc",
    href: () => "/trade-calculator",
    icon: Calculator,
    active: ["/trade-calculator"],
  },
  {
    label: "Trade Finder",
    href: (username) => userScopedPath("trade-finder", username),
    icon: Search,
    active: ["/trade-finder"],
  },
  {
    label: "Trade Log",
    href: (username) => userScopedPath("trade-history", username),
    icon: ClipboardList,
    active: ["/trade-history"],
  },
  {
    label: "Draft",
    href: () => "/rookie-draft",
    icon: GraduationCap,
    active: ["/rookie-draft"],
  },
  {
    label: "Free Agents",
    href: (username) => `${userScopedPath("market", username)}?tab=free-agents`,
    icon: Shuffle,
    active: ["/free-agents", "/arbitrage", "/waivers"],
  },
  {
    label: "History",
    href: (username) => `${userScopedPath("power", username)}?tab=history`,
    icon: History,
    active: ["/history"],
  },
  {
    label: "Injuries",
    href: (username) => userScopedPath("injuries", username),
    icon: HeartPulse,
    active: ["/injuries"],
  },
  {
    label: "Settings",
    href: () => "/settings",
    icon: Settings,
    active: ["/settings"],
  },
];

const sevColor: Record<string, string> = {
  high: "#ef4444",
  medium: "#eab308",
  low: "#6b7280",
};

const typeLabel: Record<string, string> = {
  arbitrage: "FA",
  injury: "IR",
  disagreement: "VAL",
  buying_window: "BUY",
};

function isNavActive(location: string, item: NavItem): boolean {
  return item.active.some((path) => location === path || location.startsWith(`${path}/`));
}

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
    <div ref={ref} className="edge-menu-wrap">
      <button
        onClick={() => setOpen(!open)}
        className="edge-icon-button"
        aria-label="Notifications"
        aria-expanded={open}
        type="button"
      >
        <Bell size={18} aria-hidden="true" />
        {count > 0 && <span className="edge-badge-count">{count > 9 ? "9+" : count}</span>}
      </button>

      {open && (
        <div className="edge-popover edge-notifications">
          <div className="edge-popover-title">Notifications {count > 0 && `(${count})`}</div>
          {count === 0 ? (
            <div className="edge-empty-popover">No new notifications</div>
          ) : (
            notifications!.map((n: Notification) => (
              <div key={n.id} className="edge-notification-row">
                <span className="edge-notification-type" style={{ color: sevColor[n.severity] ?? "var(--text)" }}>
                  {typeLabel[n.type] ?? "UPD"}
                </span>
                <div>
                  <div className="edge-notification-title" style={{ color: sevColor[n.severity] ?? "var(--text)" }}>
                    {n.title}
                  </div>
                  <div className="edge-notification-message">{n.message}</div>
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const initial = username.charAt(0).toUpperCase();

  useEffect(() => {
    setMobileMenuOpen(false);
    setMoreOpen(false);
  }, [location]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const moreActive = MORE_ITEMS.some((item) => isNavActive(location, item));
  const allMobileItems = [...PRIMARY_NAV_ITEMS, ...MORE_ITEMS];

  return (
    <>
      <nav className="edge-nav">
        <Link href="/">
          <div className="edge-brand" aria-label="The Edge home">
            <Zap size={21} aria-hidden="true" />
            <span>THE EDGE</span>
          </div>
        </Link>

        <div className="edge-nav-primary" aria-label="Primary navigation">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(location, item);
            return (
              <Link key={item.label} href={item.href(username)}>
                <button type="button" className={`edge-nav-link ${active ? "active" : ""}`}>
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              </Link>
            );
          })}

          <div ref={moreRef} className="edge-menu-wrap">
            <button
              type="button"
              className={`edge-nav-link ${moreActive ? "active" : ""}`}
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
            >
              <Menu size={16} aria-hidden="true" />
              <span>More</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {moreOpen && (
              <div className="edge-popover edge-more-menu">
                {MORE_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(location, item);
                  return (
                    <Link key={item.label} href={item.href(username)}>
                      <button type="button" className={`edge-menu-item ${active ? "active" : ""}`}>
                        <Icon size={16} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="edge-nav-actions">
          <button
            type="button"
            className="edge-icon-button edge-mobile-menu-button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>

          <Link href="/how-it-works">
            <button type="button" className="edge-icon-button" aria-label="How It Works">
              <CircleHelp size={17} aria-hidden="true" />
            </button>
          </Link>
          <NotificationBell username={username} />
          <span className="edge-username">{username}</span>
          {avatarId ? (
            <img className="edge-avatar" src={avatarUrl(avatarId)} alt={username} />
          ) : (
            <div className="edge-avatar edge-avatar-fallback">{initial}</div>
          )}
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="edge-mobile-panel">
          {allMobileItems.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(location, item);
            return (
              <Link key={`mobile-${item.label}`} href={item.href(username)}>
                <button type="button" className={`edge-mobile-panel-item ${active ? "active" : ""}`}>
                  <Icon size={17} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              </Link>
            );
          })}
        </div>
      )}

      <nav className="edge-mobile-dock" aria-label="Primary mobile navigation">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(location, item);
          return (
            <Link key={`dock-${item.label}`} href={item.href(username)}>
              <button
                type="button"
                className={`edge-dock-item ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
