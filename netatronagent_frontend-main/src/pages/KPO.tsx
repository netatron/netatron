import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Check, Loader2, Eye, Download, ChevronUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { POLISH_VOIVODESHIPS } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LogPanel, type LogEntry } from "@/components/ui/log-panel";
import { ModuleControls, type ModuleStatus } from "@/components/ui/module-controls";
import { useJobProgress } from "@/hooks/use-job-progress";
import { api } from "@/lib/api";
import type { KpoCategory } from "@/types/api";

export default function KPO() {
  const [categories, setCategories] = useState<KpoCategory[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedVoivodeships, setSelectedVoivodeships] = useState<string[]>([]);
  const [limit, setLimit] = useState(100);
  const [selectAllCategories, setSelectAllCategories] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus>("idle");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [previewData, setPreviewData] = useState<{ results: Record<string, unknown>[]; total: number } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const [realProgress, setRealProgress] = useState(0);
  const [realProcessedRecords, setRealProcessedRecords] = useState(0);
  const [realTotalRecords, setRealTotalRecords] = useState(limit);
  
  const { progress, processedRecords, totalRecords, eta } = useJobProgress(
    currentJobId,
    moduleStatus,
    { totalRecords: realTotalRecords }
  );

  useEffect(() => {
    loadConfig();
  }, []);

  // Poll for job status and logs when job is active
  useEffect(() => {
    if (!currentJobId) {
      setPreviewData(null);
      setShowPreview(false);
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getKpoJobStatus(currentJobId);
        
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

        // Update progress from backend (progress is 0-1, convert to 0-100)
        if (status.progress !== undefined) {
          setRealProgress(status.progress * 100);
        } else if (status.desired_results && status.desired_results > 0) {
          // Calculate progress from processed_records / desired_results
          const calculatedProgress = (status.processed_records / status.desired_results) * 100;
          setRealProgress(Math.min(calculatedProgress, 99));
        } else if (status.total_records && status.total_records > 0) {
          // Fallback to total_records
          const calculatedProgress = (status.processed_records / status.total_records) * 100;
          setRealProgress(Math.min(calculatedProgress, 99));
        }
        
        // Update processed records from status
        if (status.processed_records !== undefined) {
          setRealProcessedRecords(status.processed_records);
        } else if (previewData) {
          setRealProcessedRecords(previewData.total);
        }
        
        // Update total records from desired_results or limit
        if (status.desired_results && status.desired_results > 0) {
          setRealTotalRecords(status.desired_results);
        } else if (status.limit && status.limit > 0) {
          setRealTotalRecords(status.limit);
        } else if (limit) {
          setRealTotalRecords(limit);
        }

        // Convert backend logs to LogEntry format
        if (status.logs && status.logs.length > 0) {
          const newLogs: LogEntry[] = status.logs.map((logMessage, index) => {
            // Parse log level from message (backend uses emojis and prefixes)
            let level: "info" | "success" | "warning" | "error" | "debug" = "info";
            if (logMessage.includes("⏸️") || logMessage.includes("⏹️") || logMessage.includes("▶️")) {
              level = "warning";
            } else if (logMessage.includes("❌") || logMessage.includes("Error") || logMessage.includes("error")) {
              level = "error";
            } else if (logMessage.includes("✅") || logMessage.includes("Success") || logMessage.includes("completed")) {
              level = "success";
            } else if (logMessage.includes("🔍") || logMessage.includes("Debug")) {
              level = "debug";
            }

            return {
              id: `${currentJobId}-${index}`,
              timestamp: new Date(), // Backend doesn't provide timestamps, use current
              level,
              message: logMessage,
            };
          });

          // Only update if logs changed (avoid unnecessary re-renders)
          setLogs((prevLogs) => {
            if (prevLogs.length !== newLogs.length) {
              return newLogs;
            }
            // Check if any log message changed
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
        // If job not found, stop polling
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

  const loadConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const data = await api.getKpoConfig();
      setCategories(data.categories);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load KPO config",
        variant: "destructive",
      });
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((c) => c !== categoryId)
        : [...prev, categoryId]
    );
  };

  const toggleVoivodeship = (voivodeship: string) => {
    setSelectedVoivodeships((prev) =>
      prev.includes(voivodeship)
        ? prev.filter((v) => v !== voivodeship)
        : [...prev, voivodeship]
    );
  };

  const handleSelectAllCategories = () => {
    if (selectAllCategories) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(categories.map(c => c.category));
    }
    setSelectAllCategories(!selectAllCategories);
  };

  const handleStart = async () => {
    if (selectedCategories.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one category",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await api.startKpoJob({
        categories: selectedCategories,
        voivodeships: selectedVoivodeships.length > 0 ? selectedVoivodeships : undefined,
        limit: limit,
      });
      setCurrentJobId(response.job_id);
      setModuleStatus("running");
      // Initial logs will come from backend polling
      
      toast({
        title: "Job started!",
        description: `Scraping ${selectedCategories.length} categories`,
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
      await api.controlKpoJob(currentJobId, "pause");
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
      await api.controlKpoJob(currentJobId, "resume");
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
      await api.controlKpoJob(currentJobId, "stop");
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

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleExportLogs = () => {
    const logText = logs.map(l => `[${l.timestamp.toISOString()}] [${l.level.toUpperCase()}] ${l.message}`).join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kpo-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadPreview = async (jobId: string) => {
    setIsLoadingPreview(true);
    try {
      // Use KPO results endpoint
      const data = await api.getKpoJobResults(jobId, 1, 200);
      setPreviewData({
        results: data.results,
        total: data.total,
      });
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
      const blob = await api.downloadKpoCsv(currentJobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kpo-${currentJobId}-results.csv`;
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
        icon={Building2}
        title="KPO Scraper"
        description="Scrape beneficiary data from the National Reconstruction Plan (KPO)."
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
        {/* Categories */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">KPO Categories</CardTitle>
                <CardDescription>Select categories to scrape</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="selectAll"
                  checked={selectAllCategories}
                  onCheckedChange={handleSelectAllCategories}
                  disabled={moduleStatus === "running"}
                />
                <Label htmlFor="selectAll" className="text-sm cursor-pointer">
                  Select All
                </Label>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              {isLoadingConfig ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : categories.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No categories available. Loading configuration...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {categories.map((category, index) => (
                    <motion.div
                      key={category.category}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <div
                        onClick={() => moduleStatus !== "running" && toggleCategory(category.category)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all",
                          selectedCategories.includes(category.category)
                            ? "border-primary/50 bg-primary/5"
                            : "border-border hover:border-primary/30 hover:bg-muted/50",
                          moduleStatus === "running" && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded border transition-colors",
                            selectedCategories.includes(category.category)
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          )}
                        >
                          {selectedCategories.includes(category.category) && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <span className="text-sm text-foreground">{category.category}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/30 p-3">
              <span className="text-sm text-muted-foreground">
                Selected: <span className="font-medium text-primary">{selectedCategories.length}</span> categories
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Voivodeships Filter</CardTitle>
              <CardDescription>Optional: filter by region</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[150px] pr-4">
                <div className="space-y-2">
                  {POLISH_VOIVODESHIPS.map((voivodeship) => (
                    <div
                      key={voivodeship}
                      onClick={() => moduleStatus !== "running" && toggleVoivodeship(voivodeship)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm transition-colors",
                        selectedVoivodeships.includes(voivodeship)
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted",
                        moduleStatus === "running" && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full transition-colors",
                          selectedVoivodeships.includes(voivodeship)
                            ? "bg-primary"
                            : "bg-muted-foreground"
                        )}
                      />
                      <span className="capitalize">{voivodeship}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Result Limit</CardTitle>
              <CardDescription>Maximum records per category</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Limit</Label>
                <span className="text-sm font-medium text-primary">{limit}</span>
              </div>
              <Slider
                value={[limit]}
                onValueChange={([value]) => setLimit(value)}
                min={1}
                max={500}
                step={10}
                disabled={moduleStatus === "running"}
              />
            </CardContent>
          </Card>
        </div>
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
                        {Object.values(row).map((value, colIdx) => (
                          <td
                            key={colIdx}
                            className="px-4 py-2 text-sm text-foreground"
                          >
                            {typeof value === "object" ? JSON.stringify(value) : String(value || "")}
                          </td>
                        ))}
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
        onClear={handleClearLogs}
        onExport={handleExportLogs}
        title="KPO Scraper Logs"
        maxHeight="250px"
      />
    </div>
  );
}
