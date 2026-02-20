import { useState, useEffect, useCallback } from "react";
import type { ModuleStatus } from "@/components/ui/module-controls";

// ============================================================================
// JOB PROGRESS HOOK
// ============================================================================
// This hook manages job progress state for scrapers.
// Currently uses mock simulation - see PROGRESS_IMPLEMENTATION.md for API integration.
// ============================================================================

export interface JobProgress {
  progress: number;           // 0-100
  processedRecords: number;
  totalRecords: number;
  eta?: string;               // Estimated time remaining
}

interface UseJobProgressOptions {
  pollInterval?: number;      // Polling interval in ms (default: 2000)
  totalRecords?: number;      // Total expected records (for mock simulation)
}

export function useJobProgress(
  jobId: string | null,
  status: ModuleStatus,
  options: UseJobProgressOptions = {}
): JobProgress {
  const { pollInterval = 2000, totalRecords: expectedTotal = 100 } = options;
  
  const [progress, setProgress] = useState(0);
  const [processedRecords, setProcessedRecords] = useState(0);
  const [totalRecords, setTotalRecords] = useState(expectedTotal);

  // Calculate ETA based on progress rate
  const calculateEta = useCallback((currentProgress: number, processed: number, total: number): string | undefined => {
    if (currentProgress <= 0 || currentProgress >= 100) return undefined;
    
    const remaining = total - processed;
    const avgTimePerRecord = 1.5; // seconds (mock estimate)
    const secondsRemaining = remaining * avgTimePerRecord;
    
    if (secondsRemaining < 60) {
      return `${Math.ceil(secondsRemaining)}s`;
    } else if (secondsRemaining < 3600) {
      return `${Math.ceil(secondsRemaining / 60)}m`;
    } else {
      return `${Math.ceil(secondsRemaining / 3600)}h`;
    }
  }, []);

  const [eta, setEta] = useState<string | undefined>(undefined);

  // Reset on new job or status change
  useEffect(() => {
    if (status === "idle" || status === "stopped") {
      setProgress(0);
      setProcessedRecords(0);
      setEta(undefined);
    }
    if (status === "running" && progress === 0) {
      setTotalRecords(expectedTotal);
    }
  }, [status, expectedTotal, progress]);

  // ============================================================================
  // MOCK SIMULATION - Progress increment when running
  // ============================================================================
  // TODO: API_INTEGRATION - Replace this effect with real API polling
  // See docs/PROGRESS_IMPLEMENTATION.md for integration guide
  // ============================================================================
  useEffect(() => {
    if (status !== "running") return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const increment = Math.random() * 3 + 1; // 1-4% increment
        const newProgress = Math.min(prev + increment, 100);
        
        // Update processed records proportionally
        const newProcessed = Math.floor((newProgress / 100) * totalRecords);
        setProcessedRecords(newProcessed);
        
        // Update ETA
        setEta(calculateEta(newProgress, newProcessed, totalRecords));
        
        // Auto-complete at 100%
        if (newProgress >= 100) {
          clearInterval(interval);
        }
        
        return newProgress;
      });
    }, pollInterval);

    return () => clearInterval(interval);
  }, [status, pollInterval, totalRecords, calculateEta]);

  // ============================================================================
  // API INTEGRATION - Polling implementation (commented out)
  // ============================================================================
  // TODO: API_INTEGRATION - Uncomment and configure when backend is ready
  // ============================================================================
  /*
  useEffect(() => {
    if (!jobId || status !== "running") return;
    
    const fetchProgress = async () => {
      try {
        // For Google Maps:
        // const response = await api.googleMaps.getGoogleMapsTask(jobId);
        // setProgress(response.progress || 0);
        // setProcessedRecords(response.query_index || 0);
        // setTotalRecords(response.total_queries || 0);
        
        // For KPO:
        // const response = await api.kpo.getKpoJobStatus(jobId);
        // setProgress(response.progress || 0);
        // setProcessedRecords(response.processed_records || 0);
        // setTotalRecords(response.total_records || 0);
        
        // For generic jobs:
        // const response = await api.jobs.getJob(jobId);
        // setProgress(response.progress || 0);
        // setProcessedRecords(response.processed || 0);
        // setTotalRecords(response.total || 0);
        
        // Calculate ETA from response or locally
        // setEta(response.eta || calculateEta(progress, processedRecords, totalRecords));
      } catch (error) {
        console.error("Failed to fetch job progress:", error);
      }
    };
    
    // Initial fetch
    fetchProgress();
    
    // Setup polling
    const interval = setInterval(fetchProgress, pollInterval);
    
    return () => clearInterval(interval);
  }, [jobId, status, pollInterval]);
  */

  return {
    progress: Math.round(progress * 10) / 10, // Round to 1 decimal
    processedRecords,
    totalRecords,
    eta,
  };
}
