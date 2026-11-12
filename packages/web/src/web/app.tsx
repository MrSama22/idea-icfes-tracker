import { Route, Switch } from "wouter";
import "./lib/pwa";
import "./lib/sync";
import Index from "./pages/index";
import SimulacroPage from "./pages/simulacro";
import ReportePage from "./pages/reporte";
import GenerarPage from "./pages/generar";
import ExamenPage from "./pages/examen";
import ResultadoPage from "./pages/resultado";
import { ReforzarPage, TemaPage } from "./pages/reforzar";
import { Provider } from "./components/provider";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";

function App() {
  return (
    <Provider>
      <Switch>
        <Route path="/" component={Index} />
        <Route path="/s/:id" component={SimulacroPage} />
        <Route path="/s/:id/reporte" component={ReportePage} />
        <Route path="/generar" component={GenerarPage} />
        <Route path="/p/:id" component={ExamenPage} />
        <Route path="/p/:id/resultado" component={ResultadoPage} />
        <Route path="/reforzar" component={ReforzarPage} />
        <Route path="/reforzar/:tema" component={TemaPage} />
        <Route component={Index} />
      </Switch>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
      {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
      {<RunableBadge />}
    </Provider>
  );
}

export default App;
