import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Database, Download, Trash2, Eye, RefreshCw, Loader2, Play, Pause, Square, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { LogPanel, useMockLogs } from "@/components/ui/log-panel";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import type { SavedDatasetSummary, JobResponse } from "@/types/api";

export default function Results() {
  const [datasets, setDatasets] = useState<SavedDatasetSummary[]>([]);
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  
  // Logs - using mock for now (no real-time endpoint available)
  const { logs, clearLogs, addLog } = useMockLogs(false);

  useEffect(() => {
    loadDatasets();
    loadJobs();
    // Poll jobs every 5 seconds
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadDatasets = async () => {
    setIsLoading(true);
    try {
      const data = await api.listSavedDatasets();
      setDatasets(data);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load datasets",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadJobs = async () => {
    setIsLoadingJobs(true);
    try {
      const data = await api.listJobs();
      setJobs(data);
    } catch (error) {
      // Silently fail - jobs might not be available
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const handleViewDataset = async (datasetId: string, label: string) => {
    try {
      const dataset = await api.getDataset(datasetId);
      addLog("info", `Viewing dataset: ${label} (${dataset.total_records} records)`);
      toast({ title: `Viewing ${label}`, description: `${dataset.total_records} records` });
      // TODO: Open modal or navigate to detail view
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load dataset",
        variant: "destructive",
      });
    }
  };

  const handleDownloadDataset = async (datasetId: string, label: string) => {
    // Note: No download endpoint available in backend yet - keeping mock for now
    addLog("info", `Downloading dataset: ${label}...`);
    addLog("success", `Download started for ${label}`);
    toast({ title: "Download started" });
  };

  const handleDeleteDataset = async (datasetId: string, label: string) => {
    if (!confirm(`Are you sure you want to delete "${label}"?`)) return;
    
    // Note: No delete endpoint available in backend yet - keeping mock for now
    addLog("warning", `Deleting dataset: ${label}...`);
    addLog("success", `Dataset ${label} deleted`);
    toast({ title: "Dataset deleted", variant: "destructive" });
    await loadDatasets();
  };

  const handleRefresh = async () => {
    addLog("info", "Refreshing datasets and jobs list...");
    await Promise.all([loadDatasets(), loadJobs()]);
    toast({ title: "Data refreshed" });
  };

  const handleJobControl = async (jobId: string, action: "pause" | "resume" | "stop") => {
    try {
      if (action === "pause") {
        await api.pauseJob(jobId);
        addLog("info", `Job ${jobId} paused`);
      } else if (action === "resume") {
        await api.resumeJob(jobId);
        addLog("info", `Job ${jobId} resumed`);
      } else if (action === "stop") {
        await api.stopJob(jobId);
        addLog("info", `Job ${jobId} stopped`);
      }
      await loadJobs();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${action} job`,
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
    a.download = `results-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============================================================================
  // TABLE COLUMNS
  // ============================================================================
  // TODO: API_INTEGRATION - These columns map to SavedDatasetSummary fields
  // ============================================================================
  const columns = [
    {
      key: "label",
      header: "Dataset Name",
      cell: (item: SavedDatasetSummary) => (
        <div className="font-medium text-foreground">{item.label}</div>
      ),
    },
    {
      key: "source",
      header: "Source",
      cell: (item: SavedDatasetSummary) => (
        <span className="rounded-full bg-muted px-2 py-1 text-xs capitalize">
          {item.source.replace("_", " ")}
        </span>
      ),
    },
    {
      key: "total_records",
      header: "Records",
      cell: (item: SavedDatasetSummary) => (
        <span className="font-medium text-primary">{item.total_records}</span>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      cell: (item: SavedDatasetSummary) => (
        <span className="text-muted-foreground">
          {new Date(item.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (item: SavedDatasetSummary) => (
        <div className="flex items-center gap-2">
          {/* ============================================================================
              DATASET ACTIONS
              ============================================================================
              TODO: API_INTEGRATION - Connect to dataset endpoints:
              GET /api/v1/saved-datasets/{datasetId}/records - View records
              GET /api/v1/saved-datasets/{datasetId}/download?format=csv - Download
              DELETE /api/v1/saved-datasets/{datasetId} - Delete
              ============================================================================ */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleViewDataset(item.dataset_id, item.label)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleDownloadDataset(item.dataset_id, item.label)}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => handleDeleteDataset(item.dataset_id, item.label)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      className: "text-right",
    },
  ];

  // ============================================================================
  // STATS CALCULATION
  // ============================================================================
  // TODO: API_INTEGRATION - Calculate from real data
  // ============================================================================
  const totalDatasets = datasets.length;
  const totalRecords = datasets.reduce((acc, d) => acc + (d.total_records || 0), 0);
  const uniqueSources = new Set(datasets.map((d) => d.source)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Database}
        title="Saved Results"
        description="View and manage your scraped datasets."
        actions={
          <Button variant="outline" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {/* Active Jobs Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <ListTodo className="h-5 w-5" />
                Active Jobs
              </CardTitle>
              <CardDescription>Jobs running in the background</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadJobs} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isLoadingJobs ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingJobs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No active jobs. Start a scraping job to see it here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => {
                const statusColors = {
                  running: "bg-blue-500/10 text-blue-500",
                  paused: "bg-yellow-500/10 text-yellow-500",
                  completed: "bg-green-500/10 text-green-500",
                  failed: "bg-red-500/10 text-red-500",
                  pending: "bg-gray-500/10 text-gray-500",
                };
                const statusColor = statusColors[job.status as keyof typeof statusColors] || statusColors.pending;
                
                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor}`}>
                          {job.status}
                        </span>
                        <span className="text-sm font-medium capitalize">{job.source}</span>
                        {job.progress > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {Math.round(job.progress)}%
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Created: {new Date(job.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.status === "running" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleJobControl(job.id, "pause")}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                      {job.status === "paused" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleJobControl(job.id, "resume")}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {(job.status === "running" || job.status === "paused") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleJobControl(job.id, "stop")}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      {/* ============================================================================
          STATS - Dataset Statistics
          ============================================================================
          TODO: API_INTEGRATION - Calculate from:
          GET /api/v1/saved-datasets
          Response: { datasets: SavedDatasetSummary[] }
          ============================================================================ */}
      <div className="grid gap-4 md:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">{totalDatasets}</p>
                <p className="text-sm text-muted-foreground">Total Datasets</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{totalRecords}</p>
                <p className="text-sm text-muted-foreground">Total Records</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-success">{uniqueSources}</p>
                <p className="text-sm text-muted-foreground">Sources</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Datasets Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Datasets</CardTitle>
          <CardDescription>Click on a dataset to view details</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : datasets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No saved datasets yet. Save results from a job to see them here.</p>
            </div>
          ) : (
            <DataTable
              data={datasets}
              columns={columns}
              keyExtractor={(item) => item.dataset_id}
            />
          )}
        </CardContent>
      </Card>

      {/* Log Panel */}
      {/* ============================================================================
          LOGS PANEL
          ============================================================================
          TODO: API_INTEGRATION - This logs user actions (view, download, delete)
          No real-time stream needed - just local action logging
          ============================================================================ */}
      <LogPanel
        logs={logs}
        onClear={clearLogs}
        onExport={handleExportLogs}
        title="Activity Logs"
        maxHeight="200px"
        defaultCollapsed={true}
      />
    </div>
  );
}
