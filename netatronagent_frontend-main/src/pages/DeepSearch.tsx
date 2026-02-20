import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Sparkles, Lightbulb, Eye, Terminal } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { LogPanel, useMockLogs } from "@/components/ui/log-panel";
import { ModuleControls, type ModuleStatus } from "@/components/ui/module-controls";
import { api } from "@/lib/api";
import { 
  AgentBrowserFrame, 
  ResultsAccumulator 
} from "@/components/agent-browser";
import { useAgentBrowser } from "@/hooks/use-agent-browser";
import { useJobLogs } from "@/hooks/use-job-logs";

// ============================================================================
// EXAMPLE QUERIES
// ============================================================================
const exampleQueries = [
  "Find AI startups in Poland founded in 2023",
  "List e-commerce companies with over 100 employees in Warsaw",
  "Healthcare technology companies in Krakow with recent funding",
  "SaaS companies in Poland looking for marketing services",
];

export default function DeepSearch() {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const [showAgentBrowser, setShowAgentBrowser] = useState(true);
  
  // ============================================================================
  // MODULE STATE
  // ============================================================================
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus>("idle");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  
  // ============================================================================
  // LOGS STATE
  // ============================================================================
  const { logs, clearLogs, addLog } = useJobLogs({ 
    jobId: currentJobId, 
    enabled: moduleStatus === "running" || moduleStatus === "paused",
    pollInterval: 2000 
  });

  // ============================================================================
  // AGENT BROWSER HOOK
  // ============================================================================
  // TODO: API_INTEGRATION - Hook connects to SSE stream when jobId is set
  // Currently uses mock data for demonstration
  // Backend needs: GET /api/v1/jobs/{jobId}/events/stream (SSE)
  // ============================================================================
  const { 
    browserState, 
    actions, 
    results,
    isConnected,
    reset: resetBrowser 
  } = useAgentBrowser({ 
    jobId: currentJobId, 
    enabled: moduleStatus === "running" 
  });

  // ============================================================================
  // CONTROL HANDLERS
  // ============================================================================

  const handleStart = async () => {
    if (query.trim().length < 3) {
      toast({
        title: "Error",
        description: "Query must be at least 3 characters long",
        variant: "destructive",
      });
      return;
    }

    try {
      // ======================================================================
      // API_INTEGRATION - Start deep search job
      // Endpoint: POST /api/v1/deep-search/start
      // Body: { query: string, limit: number }
      // Response: { id: string, status: string }
      // ======================================================================
      const response = await api.startDeepSearchJob({
        query: query.trim(),
        limit: limit,
      });
      
      setCurrentJobId(response.id);
      setModuleStatus("running");
      resetBrowser();
      clearLogs();
      
      addLog("info", `Starting Deep Search...`);
      addLog("info", `Query: "${query.substring(0, 50)}${query.length > 50 ? "..." : ""}"`);
      addLog("info", `Result limit: ${limit}`);
      addLog("info", `Agent browser connected: ${isConnected ? 'yes' : 'connecting...'}`);
      
      toast({
        title: "Deep search started!",
        description: "Watch the agent browser to see real-time scraping",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start search",
        variant: "destructive",
      });
    }
  };

  const handlePause = async () => {
    if (!currentJobId) return;
    
    try {
      await api.pauseJob(currentJobId);
      setModuleStatus("paused");
      addLog("warning", "Search paused by user");
      toast({ title: "Search paused" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to pause search",
        variant: "destructive",
      });
    }
  };

  const handleResume = async () => {
    if (!currentJobId) return;
    
    try {
      await api.resumeJob(currentJobId);
      setModuleStatus("running");
      addLog("info", "Search resumed");
      toast({ title: "Search resumed" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to resume search",
        variant: "destructive",
      });
    }
  };

  const handleStop = async () => {
    if (!currentJobId) return;
    
    try {
      await api.stopJob(currentJobId);
      setModuleStatus("stopped");
      addLog("error", "Search stopped by user");
      setCurrentJobId(null);
      toast({ title: "Search stopped", variant: "destructive" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to stop search",
        variant: "destructive",
      });
    }
  };

  const handleExportLogs = () => {
    const logText = logs.map(l => `[${l.timestamp.toISOString()}] [${l.level.toUpperCase()}] ${l.message}`).join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deep-search-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Search}
        title="Deep Search"
        description="AI-powered advanced search with live agent browser visualization."
        actions={
          <ModuleControls
            status={moduleStatus}
            onStart={handleStart}
            onPause={handlePause}
            onStop={handleStop}
            onResume={handleResume}
          />
        }
      />

      {/* ====================================================================
          MAIN LAYOUT - Query + Agent Browser
          ==================================================================== */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column - Search Query + Settings */}
        <div className="space-y-6">
          {/* Search Query Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">AI Search Query</CardTitle>
              </div>
              <CardDescription>
                Describe what you're looking for. The agent will search and scrape relevant websites.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., Find software development companies in Poland that specialize in AI and machine learning..."
                className="min-h-[120px] resize-none"
                disabled={moduleStatus === "running"}
              />

              {/* Example queries */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lightbulb className="h-4 w-4" />
                  <span>Example queries:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {exampleQueries.map((example, index) => (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => moduleStatus !== "running" && setQuery(example)}
                      disabled={moduleStatus === "running"}
                      className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {example}
                    </motion.button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Result Limit */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Result Limit</Label>
                  <span className="text-sm font-medium text-primary">{limit}</span>
                </div>
                <Slider
                  value={[limit]}
                  onValueChange={([value]) => setLimit(value)}
                  min={1}
                  max={200}
                  step={10}
                  disabled={moduleStatus === "running"}
                />
              </div>

              {/* Show Agent Browser Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Show Agent Browser</Label>
                  <p className="text-xs text-muted-foreground">
                    See real-time scraping visualization
                  </p>
                </div>
                <Switch
                  checked={showAgentBrowser}
                  onCheckedChange={setShowAgentBrowser}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Agent Browser OR Results */}
        <div className="space-y-6">
          {showAgentBrowser ? (
            <>
              {/* ============================================================
                  AGENT BROWSER FRAME
                  ============================================================
                  TODO: API_INTEGRATION - Requires SSE stream from backend
                  
                  Backend needs to emit events for each step:
                  1. search_started - When querying Google CSE
                  2. navigate - When agent visits a URL
                  3. fetch - When downloading HTML
                  4. parse - When extracting data
                  5. ai_call - When calling OpenAI for parsing
                  6. result - When company data is extracted
                  
                  See: docs/DEEP_SEARCH_AGENT_BROWSER.md
                  ============================================================ */}
              <AgentBrowserFrame
                browserState={browserState}
                actions={actions}
                isAgentActive={moduleStatus === "running"}
                className="h-[450px]"
              />
              
              {/* ============================================================
                  LIVE RESULTS ACCUMULATOR
                  ============================================================ */}
              <ResultsAccumulator
                results={results}
                targetCount={limit}
                isRunning={moduleStatus === "running"}
              />
            </>
          ) : (
            /* How it works - shown when browser is hidden */
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How it works</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { step: 1, text: "AI analyzes your natural language query" },
                    { step: 2, text: "Agent searches multiple data sources" },
                    { step: 3, text: "Scrapes and parses company websites" },
                    { step: 4, text: "Enriches results with AI extraction" },
                  ].map(({ step, text }) => (
                    <div key={step} className="flex items-start gap-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {step}
                      </div>
                      <p className="text-sm text-muted-foreground">{text}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ====================================================================
          LOG PANEL
          ==================================================================== */}
      <LogPanel
        logs={logs}
        onClear={clearLogs}
        onExport={handleExportLogs}
        title="Deep Search Logs"
        maxHeight="200px"
      />
    </div>
  );
}
