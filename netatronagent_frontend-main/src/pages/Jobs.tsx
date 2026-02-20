import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ListTodo,
  Trash2,
  Download,
  RefreshCw,
  Map,
  Building2,
  Search,
  Loader2,
  Eye,
  ChevronDown,
  ChevronUp,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { LogPanel, useMockLogs } from "@/components/ui/log-panel";
import { InlineControls, type ModuleStatus } from "@/components/ui/module-controls";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import type { JobResponse, JobSource, JobStatus } from "@/types/api";

const getSourceIcon = (source: JobSource) => {
  switch (source) {
    case "maps":
      return Map;
    case "kpo":
      return Building2;
    case "deep_search":
      return Search;
    case "email_invoices":
      return Mail;
    default:
      return ListTodo;
  }
};

const getSourceLabel = (source: JobSource) => {
  switch (source) {
    case "maps":
      return "Google Maps";
    case "kpo":
      return "KPO";
    case "deep_search":
      return "Deep Search";
    case "email_invoices":
      return "Email Invoices";
    default:
      return source;
  }
};

// Map JobStatus to ModuleStatus
const mapJobStatusToModuleStatus = (status: JobStatus): ModuleStatus => {
  switch (status) {
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "completed":
      return "completed";
    case "failed":
      return "error";
    case "queued":
    default:
      return "idle";
  }
};

export default function Jobs() {
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobResponse | null>(null);
  const [previewData, setPreviewData] = useState<{ results: Record<string, unknown>[]; total: number } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // Logs - using mock for now (no real-time endpoint available)
  const { logs, clearLogs, addLog } = useMockLogs(!!selectedJobId);

  useEffect(() => {
    loadJobs();
    // Restore selected job from localStorage
    const savedJobId = localStorage.getItem("jobs_selected_job_id");
    if (savedJobId) {
      setSelectedJobId(savedJobId);
    }
  }, []);

  useEffect(() => {
    if (selectedJobId) {
      // Save to localStorage
      localStorage.setItem("jobs_selected_job_id", selectedJobId);
      loadJobDetails(selectedJobId);
    } else {
      localStorage.removeItem("jobs_selected_job_id");
      setPreviewData(null);
      setShowPreview(false);
    }
  }, [selectedJobId]);

  useEffect(() => {
    if (showPreview && selectedJobId && selectedJob?.storage_uri) {
      loadPreview(selectedJobId);
    }
  }, [showPreview, selectedJobId, selectedJob?.storage_uri]);

  // Poll for updates when jobs are running
  useEffect(() => {
    const hasRunningJobs = jobs.some(j => j.status === "running");
    if (hasRunningJobs) {
      const interval = setInterval(() => {
        loadJobs();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [jobs]);

  const loadJobs = async () => {
    setIsLoading(true);
    try {
      const data = await api.listJobs();
      setJobs(data);
      if (selectedJobId) {
        const job = data.find(j => j.id === selectedJobId);
        if (job) setSelectedJob(job);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load jobs",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadJobDetails = async (jobId: string) => {
    try {
      const job = await api.getJob(jobId);
      setSelectedJob(job);
      // Load logs
      const jobLogs = await api.getJobLogs(jobId);
      clearLogs();
      jobLogs.forEach(log => {
        addLog("info", log.message);
      });
    } catch (error) {
      console.error("Error loading job details:", error);
    }
  };

  const loadPreview = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job?.storage_uri) return;
    setIsLoadingPreview(true);
    try {
      const data = await api.getJobPreview(jobId);
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

  const runningJobs = jobs.filter((j) => j.status === "running").length;
  const completedJobs = jobs.filter((j) => j.status === "completed").length;
  const failedJobs = jobs.filter((j) => j.status === "failed").length;

  const handlePlayJob = async (jobId: string) => {
    try {
      await api.resumeJob(jobId);
      addLog("info", `Resuming job ${jobId}...`);
      toast({ title: "Job resumed" });
      await loadJobs();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to resume job",
        variant: "destructive",
      });
    }
  };

  const handlePauseJob = async (jobId: string) => {
    try {
      await api.pauseJob(jobId);
      addLog("warning", `Pausing job ${jobId}...`);
      toast({ title: "Job paused" });
      await loadJobs();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to pause job",
        variant: "destructive",
      });
    }
  };

  const handleStopJob = async (jobId: string) => {
    try {
      await api.stopJob(jobId);
      addLog("error", `Stopping job ${jobId}...`);
      toast({ title: "Job stopped", variant: "destructive" });
      await loadJobs();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to stop job",
        variant: "destructive",
      });
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm("Are you sure you want to delete this job?")) return;
    
    try {
      await api.deleteJob(jobId);
      addLog("info", `Deleting job ${jobId}...`);
      toast({ title: "Job deleted" });
      if (selectedJobId === jobId) {
        setSelectedJobId(null);
        setSelectedJob(null);
      }
      await loadJobs();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete job",
        variant: "destructive",
      });
    }
  };

  const handleDownloadResults = async (jobId: string) => {
    try {
      const blob = await api.downloadJobCsv(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `job-${jobId}-results.csv`;
      a.click();
      URL.revokeObjectURL(url);
      addLog("info", `Downloading results for job ${jobId}...`);
      toast({ title: "Download started" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to download results",
        variant: "destructive",
      });
    }
  };

  const handleRefresh = async () => {
    addLog("info", "Refreshing jobs list...");
    await loadJobs();
    toast({ title: "Jobs refreshed" });
  };

  const handleExportLogs = () => {
    const logText = logs.map(l => `[${l.timestamp.toISOString()}] [${l.level.toUpperCase()}] ${l.message}`).join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jobs-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ListTodo}
        title="Jobs"
        description="Monitor and manage your scraping jobs."
        actions={
          <Button variant="outline" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {/* Stats */}
      {/* ============================================================================
          STATS - Job Statistics
          ============================================================================
          TODO: API_INTEGRATION - Calculate from:
          GET /api/v1/jobs
          Response: { jobs: JobResponse[] }
          ============================================================================ */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{jobs.length}</p>
              <p className="text-sm text-muted-foreground">Total Jobs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-success">{runningJobs}</p>
              <p className="text-sm text-muted-foreground">Running</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{completedJobs}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-destructive">{failedJobs}</p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Jobs</CardTitle>
          <CardDescription>Click on a job to view its logs</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No jobs yet. Start a scraping job to see it here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job, index) => {
              const Icon = getSourceIcon(job.source);
              const isSelected = selectedJobId === job.id;
              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`group cursor-pointer rounded-lg border p-4 transition-all hover:shadow-lg hover:shadow-primary/5 ${
                    isSelected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">
                            {getSourceLabel(job.source)}
                          </p>
                          <StatusBadge status={job.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Created {new Date(job.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {job.status === "running" && (
                        <div className="flex items-center gap-2">
                          <Progress value={job.progress} className="w-24" />
                          <span className="text-sm text-muted-foreground">{job.progress}%</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {/* ============================================================================
                            JOB CONTROLS
                            ============================================================================
                            TODO: API_INTEGRATION - Connect to job control endpoints:
                            POST /api/v1/jobs/{jobId}/pause
                            POST /api/v1/jobs/{jobId}/resume
                            POST /api/v1/jobs/{jobId}/stop
                            DELETE /api/v1/jobs/{jobId}
                            GET /api/v1/jobs/{jobId}/download
                            ============================================================================ */}
                        <InlineControls
                          status={mapJobStatusToModuleStatus(job.status)}
                          onPlay={() => handlePlayJob(job.id)}
                          onPause={() => handlePauseJob(job.id)}
                          onStop={() => handleStopJob(job.id)}
                        />
                        
                        {job.status === "completed" && job.storage_uri && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJobId(job.id);
                                setShowPreview(!showPreview);
                                if (!showPreview && !previewData) {
                                  loadPreview(job.id);
                                }
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadResults(job.id);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteJob(job.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CSV Preview */}
      {showPreview && selectedJobId && selectedJob?.storage_uri && (
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
                  onClick={() => handleDownloadResults(selectedJobId)}
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

      {/* Log Panel */}
      <LogPanel
        logs={logs}
        onClear={clearLogs}
        onExport={handleExportLogs}
        title={selectedJobId ? `Job ${selectedJobId} Logs` : "Select a job to view logs"}
        maxHeight="250px"
      />
    </div>
  );
}
