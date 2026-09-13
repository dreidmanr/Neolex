import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Diagnostic from "./pages/Diagnostic";
import Results from "./pages/Results";
import PaidDiagnostic from "./pages/PaidDiagnostic";
import PaidResults from "./pages/PaidResults";
import LexyWidget from "./components/LexyWidget";
import LegalDocs from "./pages/LegalDocs";
import Admin from "./pages/Admin";
import Pilot from "./pages/Pilot";
import Cabinet from "./pages/Cabinet";
import AdminPilotDiagnostics from "./pages/AdminPilotDiagnostics";
import { useLocation } from "wouter";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/diagnostic" component={Diagnostic} />
      <Route path="/results/:token" component={Results} />
      <Route path="/paid" component={PaidDiagnostic} />
      <Route path="/paid/results/:token" component={PaidResults} />
      <Route path="/legal/:doc" component={LegalDocs} />
      <Route path="/pilot" component={Pilot} />
      <Route path="/cabinet" component={Cabinet} />
      <Route path="/admin/pilot-diagnostics" component={AdminPilotDiagnostics} />
      <Route path="/admin" component={Admin} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const isPilotRoute =
    location === "/pilot" ||
    location.startsWith("/pilot/") ||
    location === "/cabinet" ||
    location.startsWith("/cabinet/") ||
    location === "/admin/pilot-diagnostics" ||
    location.startsWith("/admin/pilot-diagnostics/");

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
          {!isPilotRoute && <LexyWidget />}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
