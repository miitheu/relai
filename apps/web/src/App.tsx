import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DbProvider } from "@relai/db/react";
import type { DbConfig } from "@relai/db";
import { AuthProvider } from "./contexts/AuthContext";
import { QuickCreateProvider } from "./contexts/QuickCreateContext";
import { InteractionProvider } from "./contexts/InteractionContext";
import { CurrencyProvider } from "./contexts/CurrencyContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ClientList from "./pages/ClientList";
import ClientDetail from "./pages/ClientDetail";
import DatasetCatalog from "./pages/DatasetCatalog";
import Pipeline from "./pages/Pipeline";
import OpportunityDetail from "./pages/OpportunityDetail";
import SalesRollup from "./pages/SalesRollup";
import ContactImport from "./pages/ContactImport";
import AdminPortal from "./pages/AdminPortal";
import NotFound from "./pages/NotFound";
import OpportunityImport from "./pages/OpportunityImport";
import Campaigns from "./pages/Campaigns";
import CampaignDetail from "./pages/CampaignDetail";
import CampaignAnalytics from "./pages/CampaignAnalytics";
import WhitespaceAnalysis from "./pages/WhitespaceAnalysis";
import Territories from "./pages/Territories";
import Quotas from "./pages/Quotas";
import Forecast from "./pages/Forecast";
import Commissions from "./pages/Commissions";
import AccountDiscovery from "./pages/AccountDiscovery";
import GmailCallback from "./pages/GmailCallback";
import Settings from "./pages/Settings";
import Integrations from "./pages/Integrations";
import Renewals from "./pages/Renewals";
import QuickCreateOpportunity from "./components/QuickCreateOpportunity";
import QuickCreateTrial from "./components/QuickCreateTrial";
import QuickCreateDelivery from "./components/QuickCreateDelivery";
import CommandPalette from "./components/CommandPalette";
import InteractionLogger from "./components/InteractionLogger";
import SetupWizard from "./pages/setup/SetupWizard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const crmMode = (import.meta.env.VITE_CRM_MODE || "hosted") as "hosted" | "self-hosted";

const dbConfig: DbConfig = crmMode === "self-hosted"
  ? {
      mode: "self-hosted",
      apiUrl: import.meta.env.VITE_API_URL || "http://localhost:3001",
    }
  : {
      mode: "hosted",
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      supabaseAnonKey:
        import.meta.env.VITE_SUPABASE_ANON_KEY ??
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };

const App = () => (
  <ErrorBoundary>
  <DbProvider config={dbConfig}>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CurrencyProvider>
      <QuickCreateProvider>
        <InteractionProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <QuickCreateOpportunity />
              <QuickCreateTrial />
              <QuickCreateDelivery />
              <CommandPalette />
              <InteractionLogger />
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/setup" element={<ProtectedRoute><SetupWizard /></ProtectedRoute>} />
                <Route path="/auth/gmail/callback" element={<ProtectedRoute><GmailCallback /></ProtectedRoute>} />
                <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute><ClientList /></ProtectedRoute>} />
                <Route path="/clients/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />
                <Route path="/datasets" element={<ProtectedRoute><DatasetCatalog /></ProtectedRoute>} />
                <Route path="/pipeline" element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
                <Route path="/pipeline/:id" element={<ProtectedRoute><OpportunityDetail /></ProtectedRoute>} />
                <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
                <Route path="/campaigns/analytics" element={<ProtectedRoute><CampaignAnalytics /></ProtectedRoute>} />
                <Route path="/campaigns/:id" element={<ProtectedRoute><CampaignDetail /></ProtectedRoute>} />
                <Route path="/whitespace" element={<ProtectedRoute><WhitespaceAnalysis /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute><SalesRollup /></ProtectedRoute>} />
                <Route path="/forecast" element={<ProtectedRoute><Forecast /></ProtectedRoute>} />
                <Route path="/commissions" element={<ProtectedRoute><Commissions /></ProtectedRoute>} />
                <Route path="/territories" element={<ProtectedRoute><Territories /></ProtectedRoute>} />
                <Route path="/quotas" element={<ProtectedRoute><Quotas /></ProtectedRoute>} />
                <Route path="/discovery" element={<ProtectedRoute><AccountDiscovery /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute><AdminPortal /></ProtectedRoute>} />
                <Route path="/import/contacts" element={<ProtectedRoute><ContactImport /></ProtectedRoute>} />
                <Route path="/import/opportunities" element={<ProtectedRoute><OpportunityImport /></ProtectedRoute>} />
                {/* Redirects for removed standalone pages */}
                <Route path="/contacts" element={<Navigate to="/clients" replace />} />
                <Route path="/deliveries" element={<Navigate to="/clients" replace />} />
                <Route path="/renewals" element={<ProtectedRoute><Renewals /></ProtectedRoute>} />
                <Route path="/icebox" element={<Navigate to="/pipeline" replace />} />
                <Route path="/pipeline/hygiene" element={<Navigate to="/pipeline" replace />} />
                <Route path="/intelligence" element={<Navigate to="/clients" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </InteractionProvider>
      </QuickCreateProvider>
      </CurrencyProvider>
    </AuthProvider>
  </QueryClientProvider>
  </DbProvider>
  </ErrorBoundary>
);

export default App;
