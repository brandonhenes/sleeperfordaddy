import { Route, Switch } from "wouter";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Portfolio from "./pages/Portfolio";
import Market from "./pages/Market";
import Action from "./pages/Action";
import PlayerDetail from "./pages/PlayerDetail";
import Arbitrage from "./pages/Arbitrage";
import RosterGrades from "./pages/RosterGrades";
import PowerRankings from "./pages/PowerRankings";
import MarketSignals from "./pages/MarketSignals";
import TradeCalculator from "./pages/TradeCalculator";
import TradeFinder from "./pages/TradeFinder";
import LeagueHistory from "./pages/LeagueHistory";
import InjuryTracker from "./pages/InjuryTracker";
import WaiverWire from "./pages/WaiverWire";
import FreeAgents from "./pages/FreeAgents";
import Settings from "./pages/Settings";
import HowItWorks from "./pages/HowItWorks";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/dashboard/:username" component={Dashboard} />
      <Route path="/portfolio/:username" component={Portfolio} />
      <Route path="/market" component={Market} />
      <Route path="/action/:username" component={Action} />
      <Route path="/arbitrage/:username" component={Arbitrage} />
      <Route path="/grades/:username" component={RosterGrades} />
      <Route path="/power/:username" component={PowerRankings} />
      <Route path="/signals/:username" component={MarketSignals} />
      <Route path="/player/:playerName" component={PlayerDetail} />
      <Route path="/trade-calculator" component={TradeCalculator} />
      <Route path="/trade-finder/:username" component={TradeFinder} />
      <Route path="/history/:username" component={LeagueHistory} />
      <Route path="/injuries/:username" component={InjuryTracker} />
      <Route path="/waivers/:username" component={WaiverWire} />
      <Route path="/free-agents/:username" component={FreeAgents} />
      <Route path="/settings" component={Settings} />
      <Route path="/how-it-works" component={HowItWorks} />
      {/* Keep legacy route working */}
      <Route path="/user/:username" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}
