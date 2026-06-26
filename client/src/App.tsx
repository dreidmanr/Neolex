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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/diagnostic" component={Diagnostic} />
      <Route path="/results/:token" component={Results} />
      <Route path="/paid" component={PaidDiagnostic} />
      <Route path="/paid/results/:token" component={PaidResults} />
      <Route path="/legal/:doc" component={LegalDocs} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
          <LexyWidget />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
