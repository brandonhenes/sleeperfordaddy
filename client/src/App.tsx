import { Route, Switch } from "wouter";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Portfolio from "./pages/Portfolio";
import Market from "./pages/Market";
import Action from "./pages/Action";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/dashboard/:username" component={Dashboard} />
      <Route path="/portfolio/:username" component={Portfolio} />
      <Route path="/market" component={Market} />
      <Route path="/action/:username" component={Action} />
      {/* Keep legacy route working */}
      <Route path="/user/:username" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}
