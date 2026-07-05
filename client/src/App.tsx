import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { SlipProvider } from "./lib/slip";

const Landing = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Market = lazy(() => import("./pages/Market"));
const Action = lazy(() => import("./pages/Action"));
const PlayerDetail = lazy(() => import("./pages/PlayerDetail"));
const PowerRankings = lazy(() => import("./pages/PowerRankings"));
const TradeCalculator = lazy(() => import("./pages/TradeCalculator"));
const TradeHub = lazy(() => import("./pages/TradeHub"));
const TradeFinder = lazy(() => import("./pages/TradeFinder"));
const TradeHistory = lazy(() => import("./pages/TradeHistory"));
const RookieDraft = lazy(() => import("./pages/RookieDraft"));
const InjuryTracker = lazy(() => import("./pages/InjuryTracker"));
const Settings = lazy(() => import("./pages/Settings"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const StoredUserRedirect = lazy(() => import("./pages/StoredUserRedirect"));
const LegacyMarketRedirect = lazy(() => import("./pages/LegacyMarketRedirect"));
const LegacyTeamsRedirect = lazy(() => import("./pages/LegacyTeamsRedirect"));
const NotFound = lazy(() => import("./pages/NotFound"));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-[var(--dark)] text-[var(--text)] grid place-items-center px-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-5 text-center shadow-xl">
        <p className="label mb-2">Loading</p>
        <p className="text-sm text-[var(--text-dim)]">Getting your board ready...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <SlipProvider>
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/">
          <Landing />
        </Route>
        <Route path="/dashboard/:username">
          <Dashboard />
        </Route>
        <Route path="/dashboard">
          <StoredUserRedirect to="dashboard" />
        </Route>
        <Route path="/portfolio/:username">
          <Portfolio />
        </Route>
        <Route path="/portfolio">
          <StoredUserRedirect to="portfolio" />
        </Route>
        <Route path="/market/:username">
          <Market />
        </Route>
        <Route path="/market">
          <Market />
        </Route>
        <Route path="/action/:username">
          <Action />
        </Route>
        <Route path="/arbitrage/:username">
          <LegacyMarketRedirect tab="free-agents" freeAgentTab="arbitrage" />
        </Route>
        <Route path="/arbitrage">
          <LegacyMarketRedirect tab="free-agents" freeAgentTab="arbitrage" />
        </Route>
        <Route path="/grades/:username">
          <LegacyTeamsRedirect tab="grades" />
        </Route>
        <Route path="/grades">
          <LegacyTeamsRedirect tab="grades" />
        </Route>
        <Route path="/power/:username">
          <PowerRankings />
        </Route>
        <Route path="/power">
          <StoredUserRedirect to="power" />
        </Route>
        <Route path="/signals/:username">
          <LegacyMarketRedirect tab="signals" />
        </Route>
        <Route path="/signals">
          <LegacyMarketRedirect tab="signals" />
        </Route>
        <Route path="/player/:playerName">
          <PlayerDetail />
        </Route>
        <Route path="/trade-calculator">
          <TradeCalculator />
        </Route>
        <Route path="/trade/:username">
          <TradeHub />
        </Route>
        <Route path="/trade">
          <StoredUserRedirect to="trade" />
        </Route>
        <Route path="/trade-finder/:username">
          <TradeFinder />
        </Route>
        <Route path="/trade-finder">
          <StoredUserRedirect to="trade-finder" />
        </Route>
        <Route path="/trade-history/:username">
          <TradeHistory />
        </Route>
        <Route path="/trade-history">
          <StoredUserRedirect to="trade-history" />
        </Route>
        <Route path="/rookie-draft">
          <RookieDraft />
        </Route>
        <Route path="/history/:username">
          <LegacyTeamsRedirect tab="history" />
        </Route>
        <Route path="/history">
          <LegacyTeamsRedirect tab="history" />
        </Route>
        <Route path="/injuries/:username">
          <InjuryTracker />
        </Route>
        <Route path="/injuries">
          <StoredUserRedirect to="injuries" />
        </Route>
        <Route path="/waivers/:username">
          <LegacyMarketRedirect tab="free-agents" freeAgentTab="waivers" />
        </Route>
        <Route path="/waivers">
          <LegacyMarketRedirect tab="free-agents" freeAgentTab="waivers" />
        </Route>
        <Route path="/free-agents/:username">
          <LegacyMarketRedirect tab="free-agents" />
        </Route>
        <Route path="/free-agents">
          <LegacyMarketRedirect tab="free-agents" />
        </Route>
        <Route path="/settings">
          <Settings />
        </Route>
        <Route path="/how-it-works">
          <HowItWorks />
        </Route>
        {/* Keep legacy route working */}
        <Route path="/user/:username">
          <Dashboard />
        </Route>
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </Suspense>
    </SlipProvider>
  );
}
