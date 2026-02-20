import { Play, Pause, Square, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ModuleStatus = "idle" | "running" | "paused" | "stopped" | "completed" | "error";

interface ModuleControlsProps {
  status: ModuleStatus;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onResume?: () => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
}

// ============================================================================
// MODULE CONTROLS COMPONENT
// ============================================================================
// TODO: API_INTEGRATION - Connect these controls to backend API
// 
// Example API calls:
// - onStart: POST /api/v1/jobs/start { source, params }
// - onPause: POST /api/v1/jobs/{jobId}/pause
// - onResume: POST /api/v1/jobs/{jobId}/resume
// - onStop: POST /api/v1/jobs/{jobId}/stop
// 
// The status should be synced with job status from backend via polling or WebSocket
// ============================================================================

export function ModuleControls({
  status,
  onStart,
  onPause,
  onStop,
  onResume,
  disabled = false,
  className,
  size = "default",
}: ModuleControlsProps) {
  const sizeClasses = {
    sm: "h-8 px-3 text-xs",
    default: "h-9 px-4 text-sm",
    lg: "h-10 px-6 text-base",
  };

  const iconSize = {
    sm: "h-3.5 w-3.5",
    default: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const isRunning = status === "running";
  const isPaused = status === "paused";
  const isIdle = status === "idle" || status === "stopped" || status === "completed" || status === "error";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Start / Resume Button */}
      {(isIdle || isPaused) && (
        <Button
          onClick={isPaused && onResume ? onResume : onStart}
          disabled={disabled}
          className={cn("gap-2", sizeClasses[size])}
        >
          <Play className={iconSize[size]} />
          {isPaused ? "Resume" : "Start"}
        </Button>
      )}

      {/* Pause Button */}
      {isRunning && (
        <Button
          variant="outline"
          onClick={onPause}
          disabled={disabled}
          className={cn("gap-2", sizeClasses[size])}
        >
          <Pause className={iconSize[size]} />
          Pause
        </Button>
      )}

      {/* Stop Button */}
      {(isRunning || isPaused) && (
        <Button
          variant="destructive"
          onClick={onStop}
          disabled={disabled}
          className={cn("gap-2", sizeClasses[size])}
        >
          <Square className={iconSize[size]} />
          Stop
        </Button>
      )}

      {/* Status indicator */}
      <div className="flex items-center gap-2 ml-2">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            status === "running" && "bg-success animate-pulse",
            status === "paused" && "bg-warning",
            status === "stopped" && "bg-muted-foreground",
            status === "completed" && "bg-primary",
            status === "error" && "bg-destructive",
            status === "idle" && "bg-muted-foreground/50"
          )}
        />
        <span className="text-xs text-muted-foreground capitalize">{status}</span>
      </div>
    </div>
  );
}

// ============================================================================
// INLINE CONTROL BUTTONS - For use in job cards/lists
// ============================================================================

interface InlineControlsProps {
  status: ModuleStatus;
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  disabled?: boolean;
  className?: string;
}

export function InlineControls({
  status,
  onPlay,
  onPause,
  onStop,
  disabled = false,
  className,
}: InlineControlsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Play/Resume */}
      {(status === "idle" || status === "paused" || status === "stopped") && onPlay && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onPlay}
          disabled={disabled}
          title="Start/Resume"
        >
          <Play className="h-4 w-4" />
        </Button>
      )}

      {/* Pause */}
      {status === "running" && onPause && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onPause}
          disabled={disabled}
          title="Pause"
        >
          <Pause className="h-4 w-4" />
        </Button>
      )}

      {/* Stop */}
      {(status === "running" || status === "paused") && onStop && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onStop}
          disabled={disabled}
          title="Stop"
        >
          <Square className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
