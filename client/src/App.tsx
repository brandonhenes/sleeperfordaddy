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
      {/* Keep legacy route working */}
      <Route path="/user/:username" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}
