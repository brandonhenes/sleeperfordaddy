import { ArrowRight, Calculator, ClipboardList, Search, ShoppingBag } from "lucide-react";
import { Link } from "wouter";
import AppShell from "../components/AppShell";
import { Card, PageHeader } from "../components/ui";
import { useCurrentUsername } from "../hooks/use-current-user";
import { buildTradeFinderUrl } from "../lib/trade-finder-url";

const tools = [
  {
    label: "Calculator",
    description: "League-adjusted value check",
    href: "/trade-calculator",
    icon: Calculator,
  },
  {
    label: "Finder",
    description: "Partner and package ideas",
    href: (username: string) => buildTradeFinderUrl(username, { mode: "find" }),
    icon: Search,
  },
  {
    label: "Shop",
    description: "Sell one player across leagues",
    href: (username: string) => buildTradeFinderUrl(username, { mode: "shop" }),
    icon: ShoppingBag,
  },
  {
    label: "Log",
    description: "Grades and manager history",
    href: (username: string) => `/trade-history/${encodeURIComponent(username)}`,
    icon: ClipboardList,
  },
];

export default function TradeHub() {
  const { username } = useCurrentUsername();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Command Center"
        title="Trade"
        subtitle="One place for checking value, finding ideas, shopping players, and reviewing league behavior."
      />

      <div className="edge-tool-grid">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const href = typeof tool.href === "function" ? tool.href(username) : tool.href;
          return (
            <Link key={tool.label} href={href}>
              <Card className="edge-tool-card">
                <div className="edge-tool-icon">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <div className="edge-tool-copy">
                  <h2>{tool.label}</h2>
                  <p>{tool.description}</p>
                </div>
                <ArrowRight className="edge-tool-arrow" size={18} aria-hidden="true" />
              </Card>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
