import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Map, Plus, Trash2, Search, Upload, FileText, Eye, Download, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { LogPanel, type LogEntry } from "@/components/ui/log-panel";
import { ModuleControls, type ModuleStatus } from "@/components/ui/module-controls";
import { useJobProgress } from "@/hooks/use-job-progress";
import { api } from "@/lib/api";

const MAX_QUERIES = 200;

export default function GoogleMaps() {
  const [queries, setQueries] = useState<string[]>([""]);
  const [desiredResults, setDesiredResults] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus>("idle");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [previewData, setPreviewData] = useState<{ results: Record<string, unknown>[]; total: number } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const [realProgress, setRealProgress] = useState(0);
  const [realProcessedRecords, setRealProcessedRecords] = useState(0);
  const [realTotalRecords, setRealTotalRecords] = useState(desiredResults);
  
  const { progress, processedRecords, totalRecords, eta } = useJobProgress(
    currentJobId,
    moduleStatus,
    { totalRecords: realTotalRecords }
  );

  // Poll for job status and logs when job is active
  useEffect(() => {
    if (!currentJobId) {
      setPreviewData(null);
      setShowPreview(false);
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getGoogleMapsTask(currentJobId);
        
        // Update module status based on backend status
        if (status.status === "completed") {
          setModuleStatus("completed");
        } else if (status.status === "failed") {
          setModuleStatus("stopped");
        } else if (status.status === "paused" || status.paused) {
          setModuleStatus("paused");
        } else if (status.status === "running") {
          setModuleStatus("running");
        } else if (status.status === "stopped") {
          setModuleStatus("stopped");
        }

        // Update progress from backend - use desired_results if available
        if (status.desired_results && status.desired_results > 0) {
          // Calculate progress from results_count / desired_results
          const calculatedProgress = (status.results_count / status.desired_results) * 100;
          setRealProgress(Math.min(calculatedProgress, 99));
          setRealProcessedRecords(status.results_count);
          setRealTotalRecords(status.desired_results);
        } else if (status.total_queries > 0) {
          // Fallback to query-based progress
          const calculatedProgress = Math.round((status.query_index / status.total_queries) * 100);
          setRealProgress(calculatedProgress);
        }
        
        // Update processed records from results_count
        if (status.results_count !== undefined) {
          setRealProcessedRecords(status.results_count);
        } else if (previewData) {
          setRealProcessedRecords(previewData.total);
        }
        
        // Update total records from desired_results
        if (status.desired_results && status.desired_results > 0) {
          setRealTotalRecords(status.desired_results);
        } else if (desiredResults) {
          setRealTotalRecords(desiredResults);
        }

        // Convert backend logs to LogEntry format
        if (status.log && status.log.length > 0) {
          const newLogs: LogEntry[] = status.log.map((logMessage, index) => {
            // Parse log level from message (backend uses emojis and prefixes)
            let level: "info" | "success" | "warning" | "error" | "debug" = "info";
            if (logMessage.includes("⏸️") || logMessage.includes("⏹️") || logMessage.includes("▶️")) {
              level = "warning";
            } else if (logMessage.includes("❌") || logMessage.includes("Error") || logMessage.includes("error") || logMessage.includes("⚠️")) {
              level = "error";
            } else if (logMessage.includes("✅") || logMessage.includes("Success") || logMessage.includes("completed")) {
              level = "success";
            } else if (logMessage.includes("🔍") || logMessage.includes("Debug")) {
              level = "debug";
            }

            return {
              id: `${currentJobId}-${index}`,
              timestamp: new Date(),
              level,
              message: logMessage,
            };
          });

          // Only update if logs changed
          setLogs((prevLogs) => {
            if (prevLogs.length !== newLogs.length) {
              return newLogs;
            }
            const hasChanges = prevLogs.some((prev, idx) => prev.message !== newLogs[idx]?.message);
            return hasChanges ? newLogs : prevLogs;
          });
        }

        // Stop polling if job is completed or failed
        if (status.status === "completed" || status.status === "failed" || status.status === "stopped") {
          clearInterval(pollInterval);
          // Auto-load preview when completed
          if (status.status === "completed" && !previewData && !showPreview) {
            setShowPreview(true);
            loadPreview(currentJobId);
          }
        }
      } catch (error) {
        console.error("Failed to poll job status:", error);
        if (error instanceof Error && error.message.includes("404")) {
          clearInterval(pollInterval);
        }
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [currentJobId]);

  // Poll preview data when job is running or completed and preview is shown
  useEffect(() => {
    if (!currentJobId || !showPreview || (moduleStatus !== "running" && moduleStatus !== "completed")) {
      return;
    }

    // Load preview immediately
    loadPreview(currentJobId);

    // Poll preview only when running (every 5 seconds), not when completed
    if (moduleStatus === "running") {
      const previewInterval = setInterval(() => {
        loadPreview(currentJobId);
      }, 5000); // Poll every 5 seconds when running

      return () => clearInterval(previewInterval);
    }
  }, [currentJobId, showPreview, moduleStatus]);

  const addQuery = () => {
    if (queries.length >= MAX_QUERIES) {
      toast({
        title: "Limit reached",
        description: `Maximum ${MAX_QUERIES} queries allowed`,
        variant: "destructive",
      });
      return;
    }
    setQueries([...queries, ""]);
  };

  const removeQuery = (index: number) => {
    if (queries.length > 1) {
      setQueries(queries.filter((_, i) => i !== index));
    }
  };

  const updateQuery = (index: number, value: string) => {
    const newQueries = [...queries];
    newQueries[index] = value;
    setQueries(newQueries);
  };

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      // Parse CSV - handle both \n and \r\n line endings
      const lines = text.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // Skip header if it looks like a header
      const startIndex = lines[0]?.toLowerCase().includes('query') || 
                         lines[0]?.toLowerCase().includes('search') ? 1 : 0;
      
      const newQueries = lines.slice(startIndex, startIndex + MAX_QUERIES);
      
      if (newQueries.length === 0) {
        toast({
          title: "Empty file",
          description: "No queries found in the CSV file",
          variant: "destructive",
        });
        return;
      }

      setQueries(newQueries);
      
      const truncated = lines.length - startIndex > MAX_QUERIES;
      toast({
        title: "CSV imported!",
        description: `${newQueries.length} queries loaded${truncated ? ` (limited to ${MAX_QUERIES})` : ''}`,
      });
      
      // Log will be added via polling
    };

    reader.onerror = () => {
      toast({
        title: "Error reading file",
        description: "Could not read the CSV file",
        variant: "destructive",
      });
    };

    reader.readAsText(file);
    
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ============================================================================
  // CONTROL HANDLERS
  // ============================================================================
  // TODO: API_INTEGRATION - Connect to backend API
  // ============================================================================

  const handleStart = async () => {
    const validQueries = queries.filter((q) => q.trim().length > 0);
    if (validQueries.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one search query",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await api.startGoogleMapsTask({
        queries: validQueries,
        desired_results: desiredResults,
      });
      setCurrentJobId(response.task_id);
      setModuleStatus("running");
      // Initial logs will come from backend polling
      
      toast({
        title: "Job started!",
        description: `Scraping ${validQueries.length} queries for up to ${desiredResults} results`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start job",
        variant: "destructive",
      });
    }
  };

  const handlePause = async () => {
    if (!currentJobId) return;
    
    try {
      await api.controlGoogleMapsTask(currentJobId, "pause");
      setModuleStatus("paused");
      toast({ title: "Job paused" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to pause job",
        variant: "destructive",
      });
    }
  };

  const handleResume = async () => {
    if (!currentJobId) return;
    
    try {
      await api.controlGoogleMapsTask(currentJobId, "resume");
      setModuleStatus("running");
      toast({ title: "Job resumed" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to resume job",
        variant: "destructive",
      });
    }
  };

  const handleStop = async () => {
    if (!currentJobId) return;
    
    try {
      await api.controlGoogleMapsTask(currentJobId, "stop");
      setModuleStatus("stopped");
      setCurrentJobId(null);
      setPreviewData(null);
      setShowPreview(false);
      toast({ title: "Job stopped", variant: "destructive" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to stop job",
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
    a.download = `google-maps-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadPreview = async (taskId: string) => {
    setIsLoadingPreview(true);
    try {
      const data = await api.getGoogleMapsPreview(taskId);
      setPreviewData(data);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load preview",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (!currentJobId) return;
    try {
      const blob = await api.downloadGoogleMapsCsv(currentJobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `google-maps-${currentJobId}-results.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Download started" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to download CSV",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Map}
        title="Google Maps Scraper"
        description="Scrape business data from Google Maps with customizable search queries."
        progress={
          moduleStatus !== "idle"
            ? {
                value: realProgress || progress,
                status: moduleStatus,
                processedRecords: realProcessedRecords || processedRecords,
                totalRecords: realTotalRecords || totalRecords,
                eta,
              }
            : undefined
        }
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Search Queries</CardTitle>
            <CardDescription>
              Add one or more search queries. Each query will be searched on Google Maps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ============================================================================
                MOCK DATA - Search Queries Input
                ============================================================================
                TODO: API_INTEGRATION - These queries will be sent to:
                POST /api/v1/google-maps/start
                Body: { queries: string[], desired_results: number }
                ============================================================================ */}
            {queries.map((query, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">
                  {index + 1}
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => updateQuery(index, e.target.value)}
                    placeholder="e.g., restaurants Warsaw, IT companies Krakow"
                    className="pl-10"
                    disabled={moduleStatus === "running"}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeQuery(index)}
                  disabled={queries.length === 1 || moduleStatus === "running"}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </motion.div>
            ))}

            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                onClick={addQuery}
                disabled={moduleStatus === "running" || queries.length >= MAX_QUERIES}
                className="flex-1 gap-2 border-dashed"
              >
                <Plus className="h-4 w-4" />
                Add Query
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
                disabled={moduleStatus === "running"}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={moduleStatus === "running"}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Import CSV
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground mt-2">
              <FileText className="inline h-3 w-3 mr-1" />
              CSV format: one query per line (max {MAX_QUERIES} queries)
            </p>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Settings</CardTitle>
            <CardDescription>Configure scraping parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Desired Results</Label>
                <span className="text-sm font-medium text-primary">{desiredResults}</span>
              </div>
              <Slider
                value={[desiredResults]}
                onValueChange={([value]) => setDesiredResults(value)}
                min={1}
                max={1000}
                step={10}
                disabled={moduleStatus === "running"}
                className="[&_[role=slider]]:bg-primary"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of results to scrape (1-1000)
              </p>
            </div>

            <div className="rounded-lg bg-muted/30 p-4">
              <h4 className="mb-2 text-sm font-medium text-foreground">What data will be scraped?</h4>
              {/* ============================================================================
                  MOCK DATA - Scraped data fields
                  ============================================================================
                  TODO: API_INTEGRATION - These fields are returned by API:
                  GET /api/v1/google-maps/results/{job_id}
                  Response: { results: GoogleMapsResult[] }
                  ============================================================================ */}
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Business name & address</li>
                <li>• Phone number & website</li>
                <li>• Email (via AI enrichment)</li>
                <li>• Reviews & rating</li>
                <li>• Business category</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CSV Preview */}
      {showPreview && currentJobId && moduleStatus === "completed" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Results Preview</CardTitle>
                <CardDescription>
                  {previewData ? `${previewData.total} total records (showing first ${previewData.results.length})` : "Loading preview..."}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadCsv}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPreview(false)}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingPreview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : previewData && previewData.results.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <colgroup>
                    {Object.keys(previewData.results[0]).map((key) => (
                      <col key={key} style={{ width: key === "description" ? "300px" : key === "name" ? "200px" : key === "address" ? "250px" : "150px", minWidth: "100px", maxWidth: key === "description" ? "300px" : key === "name" ? "200px" : key === "address" ? "250px" : "150px" }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b">
                      {Object.keys(previewData.results[0]).map((key) => (
                        <th
                          key={key}
                          className="px-4 py-2 text-left text-sm font-medium text-muted-foreground"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.results.map((row, idx) => (
                      <tr key={idx} className="border-b hover:bg-muted/50">
                        {Object.entries(row).map(([key, value], colIdx) => {
                          const cellValue = typeof value === "object" ? JSON.stringify(value) : String(value || "");
                          
                          return (
                            <td
                              key={colIdx}
                              className="px-4 py-2 text-sm text-foreground"
                              style={{ 
                                maxWidth: key === "description" ? "300px" : key === "name" ? "200px" : key === "address" ? "250px" : "150px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              }}
                              title={cellValue}
                            >
                              <div className="truncate" style={{ maxWidth: "100%" }}>
                                {cellValue}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No results available</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Show preview button when job is completed */}
      {currentJobId && moduleStatus === "completed" && !showPreview && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPreview(true);
                  loadPreview(currentJobId);
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview Results
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadCsv}
              >
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Panel */}
      <LogPanel
        logs={logs}
        onClear={() => setLogs([])}
        onExport={handleExportLogs}
        title="Google Maps Scraper Logs"
        maxHeight="250px"
      />
    </div>
  );
}
