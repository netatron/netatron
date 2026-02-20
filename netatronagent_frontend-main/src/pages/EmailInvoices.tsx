import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Mail, Settings, TestTube, Power, RefreshCw, Loader2, LayoutDashboard, Cog, Radio, HelpCircle, Download, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/hooks/use-toast";
import { type LogEntry } from "@/components/ui/log-panel";
import { ModuleControls, type ModuleStatus } from "@/components/ui/module-controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { InvoiceDashboard } from "@/components/email-invoices";
import { api } from "@/lib/api";
import type { EmailInvoiceConfig, EmailInvoiceRun } from "@/types/api";

export default function EmailInvoices() {
  const [configs, setConfigs] = useState<EmailInvoiceConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<EmailInvoiceConfig | null>(null);
  const [runs, setRuns] = useState<EmailInvoiceRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // Form state for new/editing config
  const [configForm, setConfigForm] = useState({
    name: "",
    imap_host: "",
    imap_port: 993,
    imap_user: "",
    imap_password: "",
    imap_folder: "INBOX",
    enabled: true,
  });
  
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus>("idle");
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [continuousMonitoring, setContinuousMonitoring] = useState<boolean>(false);
  const [processAll, setProcessAll] = useState<boolean>(false);
  
  // Logs state - real API integration
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Invoice structure for preview
  const [invoiceStructure, setInvoiceStructure] = useState<Array<{ month: string; count: number }>>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [monthInvoices, setMonthInvoices] = useState<Array<{ id: string; filename: string; vendor: string; amount: number; date: string }>>([]);
  
  // CSV Preview state
  const [csvResults, setCsvResults] = useState<Record<string, unknown>[]>([]);
  const [csvTotal, setCsvTotal] = useState(0);
  const [isLoadingCsv, setIsLoadingCsv] = useState(false);
  const [csvPage, setCsvPage] = useState(1);
  
  // File explorer state
  const [fileExplorerPath, setFileExplorerPath] = useState<string>("");
  const [fileExplorerEntries, setFileExplorerEntries] = useState<Array<{ name: string; path: string; type: "dir" | "file"; size: number; modified: number }>>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Load logs from API - APPEND instead of replace
  const loadLogs = useCallback(async () => {
    if (!currentRunId) return;
    try {
      const apiLogs = await api.getEmailInvoiceRunLogs(currentRunId);
      setLogs(prevLogs => {
        // Map new logs
        const newLogs = apiLogs.map(log => ({
          id: log.id,
          timestamp: new Date(log.created_at),
          level: log.level as "info" | "success" | "warning" | "error" | "debug",
          message: log.message,
        }));
        
        // Find existing log IDs
        const existingIds = new Set(prevLogs.map(l => l.id));
        
        // Add only new logs (whose ID is not in existing)
        const logsToAdd = newLogs.filter(log => !existingIds.has(log.id));
        
        // If there are new logs, add them to existing
        if (logsToAdd.length > 0) {
          return [...prevLogs, ...logsToAdd];
        }
        
        // If no new logs, return existing (preserve reference for React)
        return prevLogs;
      });
    } catch (error) {
      console.error("Error loading logs:", error);
      // Don't clear logs on error - keep existing
    }
  }, [currentRunId]);

  // Load invoice structure
  const loadInvoiceStructure = useCallback(async () => {
    if (!currentRunId) return;
    try {
      const structure = await api.getEmailInvoiceStructure(currentRunId);
      setInvoiceStructure(structure.months || []);
    } catch (error) {
      console.error("Error loading invoice structure:", error);
    }
  }, [currentRunId]);

  // Load invoices for a specific month
  const loadMonthInvoices = useCallback(async (month: string) => {
    if (!currentRunId) return;
    try {
      const invoices = await api.getEmailInvoicesByMonth(currentRunId, month);
      setMonthInvoices(invoices);
    } catch (error) {
      console.error("Error loading month invoices:", error);
    }
  }, [currentRunId]);

  // Load CSV preview
  const loadCsvPreview = useCallback(async (showLoading = true) => {
    if (!currentRunId) return;
    try {
      if (showLoading) setIsLoadingCsv(true);
      const preview = await api.getEmailInvoicePreview(currentRunId);
      setCsvResults(preview.results || []);
      setCsvTotal(preview.total || 0);
    } catch (error) {
      console.error("Error loading CSV preview:", error);
      // Don't show error if CSV doesn't exist yet
      if (error instanceof Error && !error.message.includes("404")) {
        console.warn("CSV preview not available yet");
      }
    } finally {
      if (showLoading) setIsLoadingCsv(false);
    }
  }, [currentRunId]);

  // Load file explorer
  const loadFileExplorer = useCallback(async (path: string = "") => {
    if (!currentRunId) return;
    try {
      setIsLoadingFiles(true);
      const files = await api.getEmailInvoiceFiles(currentRunId, path);
      if (files.entries) {
        // Sort: directories first, then files, both alphabetically
        const sorted = [...files.entries].sort((a, b) => {
          if (a.type === "dir" && b.type !== "dir") return -1;
          if (a.type !== "dir" && b.type === "dir") return 1;
          return a.name.localeCompare(b.name);
        });
        setFileExplorerEntries(sorted);
        setFileExplorerPath(path);
      }
    } catch (error) {
      console.error("Error loading file explorer:", error);
      // Don't show error if files don't exist yet
      if (error instanceof Error && !error.message.includes("404")) {
        console.warn("File explorer not available yet");
      }
    } finally {
      setIsLoadingFiles(false);
    }
  }, [currentRunId]);

  // Load runs from API
  const loadRuns = useCallback(async () => {
    if (!selectedConfig) return;
    try {
      const data = await api.listEmailInvoiceRuns(selectedConfig.id);
      setRuns(data.runs);
      
      // Update module status based on current run
      if (currentRunId) {
        const currentRun = data.runs.find(r => r.id === currentRunId);
        if (currentRun) {
          if (currentRun.status === "completed") {
            setModuleStatus("completed");
          } else if (currentRun.status === "failed") {
            setModuleStatus("error");
          } else if (currentRun.status === "stopped") {
            setModuleStatus("stopped");
          } else if (currentRun.status === "paused") {
            setModuleStatus("paused");
          } else if (currentRun.status === "running") {
            setModuleStatus("running");
          }
        }
      }
    } catch (error) {
      console.error("Error loading runs:", error);
    }
  }, [selectedConfig, currentRunId]);

  useEffect(() => {
    loadConfigs();
  }, []);

  useEffect(() => {
    if (selectedConfig) {
      loadRuns();
    }
  }, [selectedConfig, loadRuns]);

  // Poll for run updates when running - STOP after completion
  useEffect(() => {
    // Stop polling if job completed, failed, or stopped
    if (!currentRunId || moduleStatus === "completed" || moduleStatus === "error" || moduleStatus === "stopped") {
      return; // Don't start polling
    }
    
    if (moduleStatus === "running" && currentRunId) {
      const loadRunAndLogs = async () => {
        try {
          await loadRuns();
          await loadLogs();
          await loadInvoiceStructure();
          await loadCsvPreview(false); // Silent loading during polling
          await loadFileExplorer(fileExplorerPath); // Refresh file explorer
          if (selectedMonth) {
            await loadMonthInvoices(selectedMonth);
          }
        } catch (error) {
          // If 401, stop polling (handled in api.ts)
          if (error instanceof Error && error.message.includes("401")) {
            console.warn("Unauthorized, stopping polling");
            setModuleStatus("idle");
            setCurrentRunId(null);
          }
        }
      };
      
      loadRunAndLogs(); // Load immediately
      const interval = setInterval(loadRunAndLogs, 2000);
      return () => clearInterval(interval);
    } else if (currentRunId && moduleStatus === "paused") {
      // Load once when paused
      loadLogs();
      loadInvoiceStructure();
    }
  }, [moduleStatus, currentRunId, loadInvoiceStructure, loadRuns, loadLogs, loadMonthInvoices, loadCsvPreview, loadFileExplorer, fileExplorerPath, selectedMonth]);

  // Load final results once when completed
  useEffect(() => {
    if (moduleStatus === "completed" && currentRunId) {
      // Load final results once
      loadInvoiceStructure();
      loadCsvPreview();
      loadFileExplorer(fileExplorerPath);
      if (selectedMonth) {
        loadMonthInvoices(selectedMonth);
      }
      // Load final logs
      loadLogs();
    }
  }, [moduleStatus, currentRunId, loadInvoiceStructure, loadMonthInvoices, selectedMonth, loadLogs, loadCsvPreview, loadFileExplorer, fileExplorerPath]);

  // Load CSV and files when run starts
  useEffect(() => {
    if (currentRunId && moduleStatus === "running") {
      loadCsvPreview();
      loadFileExplorer("");
    }
  }, [currentRunId, moduleStatus, loadCsvPreview, loadFileExplorer]);

  const loadConfigs = async () => {
    setIsLoading(true);
    try {
      const data = await api.listEmailInvoiceConfigs();
      setConfigs(data);
      if (data.length > 0 && !selectedConfig) {
        setSelectedConfig(data[0]);
        setConfigForm({
          name: data[0].name,
          imap_host: data[0].imap_host,
          imap_port: data[0].imap_port,
          imap_user: data[0].imap_user,
          imap_password: "", // Don't load password
          imap_folder: data[0].imap_folder,
          enabled: data[0].enabled,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load configurations",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearLogs = () => setLogs([]);
  
  const addLog = (level: "info" | "success" | "warning" | "error" | "debug", message: string) => {
    setLogs(prev => [...prev, {
      id: `local-${Date.now()}`,
      timestamp: new Date(),
      level,
      message,
    }]);
  };

  const handleTest = async () => {
    if (!selectedConfig) {
      toast({
        title: "No configuration",
        description: "Please create or select a configuration first",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    addLog("info", "Testing email connection...");
    
    try {
      const result = await api.testEmailInvoiceConfig(selectedConfig.id);
      if (result.success) {
        addLog("success", `Email connection test successful - Found ${result.email_count} emails (${result.unread_count} unread)`);
        toast({
          title: "Test completed",
          description: result.message || `Found ${result.email_count} emails (${result.unread_count} unread)`,
        });
      } else {
        addLog("error", `Email connection test failed: ${result.message}`);
        toast({
          title: "Test failed",
          description: result.message || "Email connection test failed",
          variant: "destructive",
        });
      }
    } catch (error) {
      addLog("error", `Email connection test error: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast({
        title: "Test error",
        description: error instanceof Error ? error.message : "Failed to test email connection",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleStart = async () => {
    if (!selectedConfig) {
      toast({
        title: "No configuration",
        description: "Please create or select a configuration first",
        variant: "destructive",
      });
      return;
    }

    try {
      // Clear logs before starting new run
      clearLogs();
      
      // Determine mode based on options
      let mode = "new";
      if (continuousMonitoring) {
        mode = "continuous";
      } else if (processAll) {
        mode = "all";
      }
      
      const response = await api.startEmailInvoiceRun(selectedConfig.id, {
        monitoring: continuousMonitoring,
        mode: mode,
      });
      setCurrentRunId(response.run_id);
      setModuleStatus("running");
      if (continuousMonitoring) {
        addLog("info", "Starting continuous monitoring of email inbox...");
        addLog("info", "Monitoring mode: Checking inbox every 5 minutes");
      } else if (processAll) {
        addLog("info", "Starting processing of entire mailbox...");
        addLog("info", "Processing ALL emails (including already read ones)");
      } else {
        addLog("info", "Starting email processing...");
        addLog("info", "Processing only unread emails (max 50)");
      }
      addLog("info", `IMAP Host: ${selectedConfig.imap_host}`);
      
      let toastTitle = "Processing started";
      let toastDescription = "Processing emails in the background";
      if (continuousMonitoring) {
        toastTitle = "Continuous monitoring started";
        toastDescription = "Monitoring inbox for new invoices every 5 minutes";
      } else if (processAll) {
        toastTitle = "Processing entire mailbox";
        toastDescription = "Processing all emails from the mailbox (this may take a while)";
      }
      
      toast({
        title: toastTitle,
        description: toastDescription,
      });
      
      // Poll for updates
      loadRuns();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start processing",
        variant: "destructive",
      });
    }
  };

  const handlePause = async () => {
    if (!currentRunId) return;
    try {
      await api.pauseEmailInvoiceRun(currentRunId);
      setModuleStatus("paused");
      addLog("warning", "Processing paused by user");
      toast({ title: "Processing paused" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to pause processing",
        variant: "destructive",
      });
    }
  };

  const handleResume = async () => {
    if (!currentRunId) return;
    try {
      await api.resumeEmailInvoiceRun(currentRunId);
      setModuleStatus("running");
      addLog("info", "Processing resumed");
      toast({ title: "Processing resumed" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to resume processing",
        variant: "destructive",
      });
    }
  };

  const handleStop = async () => {
    if (!currentRunId) return;
    try {
      await api.stopEmailInvoiceRun(currentRunId);
      setModuleStatus("stopped");
      addLog("error", "Processing stopped by user");
      toast({ title: "Processing stopped", variant: "destructive" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to stop processing",
        variant: "destructive",
      });
    }
  };

  const handleSaveConfig = async () => {
    if (!configForm.name || !configForm.imap_host || !configForm.imap_user) {
      toast({
        title: "Validation error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (selectedConfig) {
        // Update existing
        await api.updateEmailInvoiceConfig(selectedConfig.id, configForm);
        toast({ title: "Configuration updated" });
      } else {
        // Create new
        await api.createEmailInvoiceConfig({
          ...configForm,
          imap_password: configForm.imap_password || "", // Required for create
        });
        toast({ title: "Configuration created" });
      }
      await loadConfigs();
      addLog("info", "Configuration saved");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save configuration",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportLogs = () => {
    const logText = logs.map(l => `[${l.timestamp.toISOString()}] [${l.level.toUpperCase()}] ${l.message}`).join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-invoices-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [mainTab, setMainTab] = useState<"dashboard" | "config">("dashboard");

  const handleDownloadFile = async (path: string, filename: string) => {
    if (!currentRunId) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/email-invoices/runs/${currentRunId}/files/download?path=${encodeURIComponent(path)}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }
      );
      if (!response.ok) throw new Error("Failed to download");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Pobieranie rozpoczęte" });
    } catch (error) {
      toast({
        title: "Błąd",
        description: error instanceof Error ? error.message : "Nie udało się pobrać pliku",
        variant: "destructive",
      });
    }
  };

  const handleDownloadCsv = async () => {
    if (!currentRunId) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/email-invoices/runs/${currentRunId}/files/download?path=records.csv`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
        }
      );
      if (!response.ok) throw new Error("Failed to download");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `email-invoices-${currentRunId}-records.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Pobieranie rozpoczęte" });
    } catch (error) {
      toast({
        title: "Błąd",
        description: error instanceof Error ? error.message : "Nie udało się pobrać CSV",
        variant: "destructive",
      });
    }
  };

  const handleDownloadZip = async (path: string = "") => {
    if (!currentRunId) return;
    try {
      setIsLoadingFiles(true);
      const response = await api.archiveEmailInvoicePath(currentRunId, path);
      if (!response.ok) throw new Error("Failed to download ZIP");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const zipName = path 
        ? `email-invoices-${currentRunId}-${path.split("/").pop() || "archive"}.zip`
        : `email-invoices-${currentRunId}-all.zip`;
      a.download = zipName;
      a.click();
      URL.revokeObjectURL(url);
      toast({ 
        title: "Pobieranie ZIP rozpoczęte",
        description: "Archiwum ZIP z plikami jest pobierane"
      });
    } catch (error) {
      toast({
        title: "Błąd",
        description: error instanceof Error ? error.message : "Nie udało się pobrać archiwum ZIP",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Mail}
        title="Email Invoices"
        description="Automatyczne przetwarzanie i kategoryzacja faktur z email."
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleTest} disabled={isTesting || moduleStatus === "running"} className="gap-2">
              <TestTube className="h-4 w-4" />
              {isTesting ? "Testowanie..." : "Test połączenia"}
            </Button>
            {(moduleStatus === "idle" || moduleStatus === "stopped" || moduleStatus === "completed" || moduleStatus === "error") && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-background">
                  <Label htmlFor="monitoring-toggle" className="text-sm font-normal cursor-pointer">
                    Ciągłe monitorowanie
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-sm">
                          <strong>Częgłe monitorowanie:</strong> System automatycznie sprawdza skrzynkę email co 5 minut i przetwarza tylko nowe (nieprzeczytane) faktury. 
                          Działa w pętli nieskończonej - możesz zatrzymać tylko ręcznie.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Switch
                    id="monitoring-toggle"
                    checked={continuousMonitoring}
                    onCheckedChange={(checked) => {
                      setContinuousMonitoring(checked);
                      if (checked) {
                        setProcessAll(false); // Can't process all in continuous mode
                      }
                    }}
                  />
                </div>
                {!continuousMonitoring && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-background">
                    <Label htmlFor="process-all-toggle" className="text-sm font-normal cursor-pointer">
                      Przetwórz całą skrzynkę
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p className="text-sm">
                            <strong>Przetwórz całą skrzynkę:</strong> Przetwarza WSZYSTKIE emaile ze skrzynki (nie tylko nieprzeczytane). 
                            To jest opcja "process entire mailbox" - przetwarza całą historię emaili od początku. 
                            <br /><br />
                            <strong>Uwaga:</strong> Może to zająć dużo czasu jeśli masz wiele emaili!
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Switch
                      id="process-all-toggle"
                      checked={processAll}
                      onCheckedChange={setProcessAll}
                    />
                  </div>
                )}
              </div>
            )}
            <ModuleControls
              status={moduleStatus}
              onStart={handleStart}
              onPause={handlePause}
              onStop={handleStop}
              onResume={handleResume}
            />
          </div>
        }
      />

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "dashboard" | "config")} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="dashboard" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Cog className="h-4 w-4" />
            Konfiguracja
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-0">
          <InvoiceDashboard
            runs={runs}
            selectedConfig={selectedConfig}
            currentRunId={currentRunId}
            moduleStatus={moduleStatus}
            invoiceStructure={invoiceStructure}
            selectedMonth={selectedMonth}
            monthInvoices={monthInvoices}
            onMonthSelect={(month) => {
              setSelectedMonth(month);
              loadMonthInvoices(month);
            }}
            logs={logs}
            onClearLogs={clearLogs}
            onExportLogs={handleExportLogs}
            fileExplorerPath={fileExplorerPath}
            fileExplorerEntries={fileExplorerEntries}
            isLoadingFiles={isLoadingFiles}
            onNavigateFiles={loadFileExplorer}
            onDownloadFile={handleDownloadFile}
            onDownloadZip={handleDownloadZip}
            csvResults={csvResults}
            csvTotal={csvTotal}
            isLoadingCsv={isLoadingCsv}
            csvPage={csvPage}
            onCsvPageChange={setCsvPage}
            onDownloadCsv={handleDownloadCsv}
          />
        </TabsContent>

        <TabsContent value="config" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Configuration */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Settings className="h-5 w-5" />
                      Konfiguracja IMAP
                    </CardTitle>
                    <CardDescription>Skonfiguruj ustawienia serwera email</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="enabled" className="text-sm">Auto-processing</Label>
                    <Switch
                      id="enabled"
                      checked={selectedConfig?.enabled || false}
                      onCheckedChange={(checked) => {
                        if (selectedConfig) {
                          setConfigForm({ ...configForm, enabled: checked });
                        }
                      }}
                      disabled={moduleStatus === "running" || !selectedConfig}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="config_name">Nazwa konfiguracji</Label>
                  <Input
                    id="config_name"
                    value={configForm.name}
                    onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                    placeholder="Główne konto email"
                    disabled={moduleStatus === "running"}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="imap_host">IMAP Host</Label>
                    <Input
                      id="imap_host"
                      value={configForm.imap_host}
                      onChange={(e) => setConfigForm({ ...configForm, imap_host: e.target.value })}
                      placeholder="imap.gmail.com"
                      disabled={moduleStatus === "running"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imap_port">IMAP Port</Label>
                    <Input
                      id="imap_port"
                      type="number"
                      value={configForm.imap_port}
                      onChange={(e) => setConfigForm({ ...configForm, imap_port: parseInt(e.target.value) || 993 })}
                      placeholder="993"
                      disabled={moduleStatus === "running"}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="imap_user">Adres email</Label>
                    <Input
                      id="imap_user"
                      type="email"
                      value={configForm.imap_user}
                      onChange={(e) => setConfigForm({ ...configForm, imap_user: e.target.value })}
                      placeholder="twoj@email.com"
                      disabled={moduleStatus === "running"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imap_password">Hasło aplikacji</Label>
                    <Input
                      id="imap_password"
                      type="password"
                      value={configForm.imap_password}
                      onChange={(e) => setConfigForm({ ...configForm, imap_password: e.target.value })}
                      placeholder={selectedConfig ? "Pozostaw puste aby zachować" : "••••••••••••"}
                      disabled={moduleStatus === "running"}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imap_folder">Folder IMAP</Label>
                  <Input
                    id="imap_folder"
                    value={configForm.imap_folder}
                    onChange={(e) => setConfigForm({ ...configForm, imap_folder: e.target.value })}
                    placeholder="INBOX"
                    disabled={moduleStatus === "running"}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="enabled"
                    checked={configForm.enabled}
                    onCheckedChange={(checked) => setConfigForm({ ...configForm, enabled: checked })}
                    disabled={moduleStatus === "running"}
                  />
                  <Label htmlFor="enabled">Włączone</Label>
                </div>

                <Button 
                  onClick={handleSaveConfig} 
                  disabled={moduleStatus === "running" || isSaving} 
                  className="gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {selectedConfig ? "Aktualizuj konfigurację" : "Utwórz konfigurację"}
                </Button>
              </CardContent>
            </Card>

            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Power className="h-5 w-5" />
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
                  <span className="text-sm text-muted-foreground">Auto-processing</span>
                  <StatusBadge status={selectedConfig?.enabled ? "running" : "paused"} />
                </div>

                <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                  <p className="text-sm font-medium">Kategorie faktur:</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>• Koszty (Expenses)</li>
                    <li>• Sprzedaż (Sales)</li>
                    <li>• Wyciąg (Statement)</li>
                    <li>• Uzupełnienie (Supplement)</li>
                  </ul>
                </div>

                {/* Invoice Structure Preview */}
                {invoiceStructure.length > 0 && (
                  <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                    <p className="text-sm font-medium">Przetworzone faktury:</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {invoiceStructure.map((item) => (
                        <li key={item.month} className="flex justify-between">
                          <span>{item.month}</span>
                          <span className="text-primary">{item.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Runs */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Ostatnie uruchomienia</CardTitle>
              <CardDescription>Historia przetwarzania email</CardDescription>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Brak uruchomień. Rozpocznij przetwarzanie aby zobaczyć historię.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {runs.map((run, index) => (
                    <motion.div
                      key={run.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center justify-between rounded-lg border border-border p-4"
                    >
                      <div className="flex items-center gap-4">
                        <StatusBadge status={run.status === "completed" ? "completed" : run.status === "running" ? "running" : "failed"} />
                        <div>
                          <p className="text-sm font-medium">
                            {new Date(run.created_at).toLocaleString("pl-PL")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {run.processed_count} / {run.total_count} emaili przetworzonych
                          </p>
                        </div>
                      </div>
                      {run.error && (
                        <span className="text-xs text-destructive max-w-xs truncate" title={run.error}>
                          {run.error}
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
