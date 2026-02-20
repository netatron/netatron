import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { LogEntry, LogLevel } from "@/components/ui/log-panel";

interface UseJobLogsOptions {
  jobId: string | null;
  enabled?: boolean;
  pollInterval?: number;
}

export function useJobLogs({ 
  jobId, 
  enabled = true,
  pollInterval = 2000 
}: UseJobLogsOptions) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    if (!jobId || !enabled) return;

    try {
      setIsLoading(true);
      const jobLogs = await api.getJobLogs(jobId);
      
      // Convert JobLogEntry to LogEntry format
      const convertedLogs: LogEntry[] = jobLogs.map((log, index) => {
        // Parse log level from message if available
        let level: LogLevel = "info";
        const message = log.message || "";
        
        if (message.includes("[ERROR]") || message.includes("[error]")) {
          level = "error";
        } else if (message.includes("[WARNING]") || message.includes("[warning]")) {
          level = "warning";
        } else if (message.includes("[SUCCESS]") || message.includes("[success]")) {
          level = "success";
        } else if (message.includes("[DEBUG]") || message.includes("[debug]")) {
          level = "debug";
        }
        
        return {
          id: log.id || `log-${index}`,
          timestamp: new Date(log.created_at),
          level,
          message: message.replace(/\[(ERROR|WARNING|SUCCESS|DEBUG|INFO)\]/gi, "").trim(),
        };
      });
      
      setLogs(convertedLogs);
    } catch (error) {
      console.error("[useJobLogs] Error loading logs:", error);
    } finally {
      setIsLoading(false);
    }
  }, [jobId, enabled]);

  // Load logs on mount and when jobId changes
  useEffect(() => {
    if (jobId && enabled) {
      loadLogs();
    } else {
      setLogs([]);
    }
  }, [jobId, enabled, loadLogs]);

  // Poll for new logs when job is running
  useEffect(() => {
    if (!jobId || !enabled) return;

    const interval = setInterval(() => {
      loadLogs();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [jobId, enabled, pollInterval, loadLogs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const addLog = useCallback((level: LogLevel, message: string, details?: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        level,
        message,
        details,
      },
    ]);
  }, []);

  return {
    logs,
    isLoading,
    clearLogs,
    addLog,
    refresh: loadLogs,
  };
}

