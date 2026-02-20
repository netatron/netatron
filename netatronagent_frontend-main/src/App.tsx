import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Chat from "@/pages/Chat";
import GoogleMaps from "@/pages/GoogleMaps";
import KPO from "@/pages/KPO";
import DeepSearch from "@/pages/DeepSearch";
import EmailInvoices from "@/pages/EmailInvoices";
import Results from "@/pages/Results";
import Jobs from "@/pages/Jobs";
import ScheduleCalendar from "@/pages/ScheduleCalendar";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import OfferGenerator from "@/pages/OfferGenerator";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login key="login-page" />} />
          <Route element={<Layout key="main-layout" />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/google-maps" element={<GoogleMaps />} />
            <Route path="/kpo" element={<KPO />} />
            <Route path="/deep-search" element={<DeepSearch />} />
            <Route path="/email-invoices" element={<EmailInvoices />} />
            <Route path="/results" element={<Results />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/schedule" element={<ScheduleCalendar />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
          {/* Offer Generator - standalone page with own layout */}
          <Route path="/offer-generator" element={<OfferGenerator />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
