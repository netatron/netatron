import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Trash2, Download, Pause, Play, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type LogLevel = "info" | "success" | "warning" | "error" | "debug";

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: string;
}

interface LogPanelProps {
  logs: LogEntry[];
  onClear?: () => void;
  onExport?: () => void;
  maxHeight?: string;
  title?: string;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

const levelColors: Record<LogLevel, string> = {
  info: "text-blue-400",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
  debug: "text-muted-foreground",
};

const levelBadgeColors: Record<LogLevel, string> = {
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  error: "bg-destructive/10 text-destructive border-destructive/20",
  debug: "bg-muted text-muted-foreground border-border",
};

export function LogPanel({
  logs,
  onClear,
  onExport,
  maxHeight = "300px",
  title = "Live Logs",
  className,
  collapsible = true,
  defaultCollapsed = false,
}: LogPanelProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [displayedLogs, setDisplayedLogs] = useState<LogEntry[]>(logs);

  // Auto-scroll to bottom when new logs arrive (unless paused)
  useEffect(() => {
    if (!isPaused) {
      setDisplayedLogs(logs);
    }
  }, [logs, isPaused]);

  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedLogs, isPaused]);

  const formatTimestamp = (date: Date) => {
    const time = date.toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${time}.${ms}`;
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {displayedLogs.length} entries
            </span>
            {isPaused && (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning border border-warning/20">
                Paused
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
            {onClear && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onClear}
                title="Clear logs"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {onExport && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onExport}
                title="Export logs"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
            {collapsible && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                {isCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="p-0">
              <ScrollArea
                ref={scrollRef}
                className="font-mono text-xs"
                style={{ maxHeight }}
              >
                <div className="p-3 space-y-1.5 bg-black/30">
                  {displayedLogs.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <span>Waiting for logs...</span>
                    </div>
                  ) : (
                    <AnimatePresence mode="popLayout">
                      {displayedLogs.map((log) => (
                        <motion.div
                          key={log.id}
                          layout
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{ 
                            duration: 0.2,
                            ease: "easeOut"
                          }}
                          className="flex items-start gap-2 group hover:bg-white/5 rounded px-2 py-1 -mx-2"
                        >
                          <span className="text-muted-foreground shrink-0">
                            [{formatTimestamp(log.timestamp)}]
                          </span>
                          <span
                            className={cn(
                              "shrink-0 uppercase text-[10px] font-bold px-1.5 py-0.5 rounded border",
                              levelBadgeColors[log.level]
                            )}
                          >
                            {log.level}
                          </span>
                          <span className={cn("flex-1", levelColors[log.level])}>
                            {log.message}
                            {log.details && (
                              <span className="block text-muted-foreground/70 mt-0.5">
                                {log.details}
                              </span>
                            )}
                          </span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ============================================================================
// MOCK LOG GENERATOR - Replace with real API connection
// ============================================================================
// TODO: API_INTEGRATION - Replace this mock generator with WebSocket/SSE connection
// Example backend integration:
// 
// const connectToLogStream = (moduleId: string, onLog: (log: LogEntry) => void) => {
//   const eventSource = new EventSource(`/api/v1/jobs/${moduleId}/logs/stream`);
//   eventSource.onmessage = (event) => {
//     const logData = JSON.parse(event.data);
//     onLog({
//       id: logData.id,
//       timestamp: new Date(logData.timestamp),
//       level: logData.level,
//       message: logData.message,
//       details: logData.details,
//     });
//   };
//   return () => eventSource.close();
// };
// ============================================================================

export function useMockLogs(isActive: boolean = true) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!isActive) return;

    // Initial log
    setLogs([
      {
        id: "init",
        timestamp: new Date(),
        level: "info",
        message: "System initialized, waiting for commands...",
      },
    ]);

    // TODO: API_INTEGRATION - Replace with real WebSocket/SSE connection
    const mockMessages = [
      { level: "info" as LogLevel, message: "Connecting to API..." },
      { level: "success" as LogLevel, message: "API connection established" },
      { level: "info" as LogLevel, message: "Fetching data from source..." },
      { level: "debug" as LogLevel, message: "Request headers validated" },
      { level: "info" as LogLevel, message: "Processing batch 1/10..." },
      { level: "success" as LogLevel, message: "Batch 1 completed: 25 records" },
      { level: "warning" as LogLevel, message: "Rate limit approaching, slowing down" },
      { level: "info" as LogLevel, message: "Processing batch 2/10..." },
      { level: "success" as LogLevel, message: "Batch 2 completed: 23 records" },
      { level: "error" as LogLevel, message: "Failed to process record #48", details: "Timeout after 30s" },
      { level: "info" as LogLevel, message: "Retrying failed record..." },
      { level: "success" as LogLevel, message: "Record #48 processed successfully" },
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < mockMessages.length) {
        const msg = mockMessages[index];
        setLogs((prev) => [
          ...prev,
          {
            id: `log-${Date.now()}-${index}`,
            timestamp: new Date(),
            level: msg.level,
            message: msg.message,
            details: msg.details,
          },
        ]);
        index++;
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isActive]);

  const clearLogs = () => setLogs([]);
  
  const addLog = (level: LogLevel, message: string, details?: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}`,
        timestamp: new Date(),
        level,
        message,
        details,
      },
    ]);
  };

  return { logs, clearLogs, addLog };
}
