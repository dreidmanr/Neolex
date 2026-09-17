import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isControlledClientRoute } from "@/lib/controlledRoutes";
import {
  removeLegacyAnalyticsScripts,
  synchronizeLegacyAnalyticsScript,
} from "@/lib/legacyAnalytics";
import NotFound from "@/pages/NotFound";
import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import LexyWidget from "./components/LexyWidget";
import { ThemeProvider } from "./contexts/ThemeContext";
import Admin from "./pages/Admin";
import AdminPilotDiagnostics from "./pages/AdminPilotDiagnostics";
import Cabinet from "./pages/Cabinet";
import CaseQuestionnaire from "./pages/CaseQuestionnaire";
import CaseReport from "./pages/CaseReport";
import Diagnostic from "./pages/Diagnostic";
import Home from "./pages/Home";
import LegalDocs from "./pages/LegalDocs";
import MagicLinkConsume from "./pages/MagicLinkConsume";
import PaidDiagnostic from "./pages/PaidDiagnostic";
import PaidResults from "./pages/PaidResults";
import Pilot from "./pages/Pilot";
import PilotAccess from "./pages/PilotAccess";
import R1LegalMetadata from "./pages/R1LegalMetadata";
import RequestMagicLink from "./pages/RequestMagicLink";
import Results from "./pages/Results";

function Router() {
  return (
    <Switch>
      <Route path="/r1/legal/:documentId" component={R1LegalMetadata} />
      <Route path="/pilot/access" component={PilotAccess} />
      <Route path="/pilot" component={Pilot} />
      <Route path="/cabinet/diagnostics/:publicCaseId/questionnaire" component={CaseQuestionnaire} />
      <Route path="/cabinet/cases/:publicId/report" component={CaseReport} />
      <Route path="/cabinet" component={Cabinet} />
      <Route path="/auth/request-link" component={RequestMagicLink} />
      <Route path="/auth/consume" component={MagicLinkConsume} />
      <Route path="/admin/pilot-diagnostics" component={AdminPilotDiagnostics} />
      <Route path="/" component={Home} />
      <Route path="/about" component={Home} />
      <Route path="/services" component={Home} />
      <Route path="/lexy" component={Home} />
      <Route path="/cases" component={Home} />
      <Route path="/blog" component={Home} />
      <Route path="/contacts" component={Home} />
      <Route path="/diagnostic" component={Diagnostic} />
      <Route path="/results/:token" component={Results} />
      <Route path="/paid" component={PaidDiagnostic} />
      <Route path="/lexy/advanced" component={PaidDiagnostic} />
      <Route path="/lexy/advanced/questionnaire" component={PaidDiagnostic} />
      <Route path="/lexy/advanced/report/:token" component={PaidResults} />
      <Route path="/paid/results/:token" component={PaidResults} />
      <Route path="/legal/:doc" component={LegalDocs} />
      <Route path="/admin" component={Admin} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function LegacyAnalytics({ controlled }: { controlled: boolean }) {
  useEffect(() => {
    synchronizeLegacyAnalyticsScript(document, controlled, {
      endpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT,
      websiteId: import.meta.env.VITE_ANALYTICS_WEBSITE_ID,
    });

    return () => removeLegacyAnalyticsScripts(document);
  }, [controlled]);

  return null;
}

function App() {
  const [location] = useLocation();
  const isControlledRoute = isControlledClientRoute(location);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <LegacyAnalytics controlled={isControlledRoute} />
          <Toaster />
          <Router />
          {!isControlledRoute && <LexyWidget />}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
