import { motion } from "framer-motion";
import type { ModuleStatus } from "@/components/ui/module-controls";
import { cn } from "@/lib/utils";

// ============================================================================
// PROGRESS INDICATOR COMPONENT
// ============================================================================
// Animated progress bar with futuristic design and optional details.
// Supports inline (compact) and full (detailed) variants.
// ============================================================================

interface ProgressIndicatorProps {
  progress: number;           // 0-100
  status: ModuleStatus;
  variant?: "inline" | "full";
  showPercentage?: boolean;
  showDetails?: boolean;
  processedRecords?: number;
  totalRecords?: number;
  eta?: string;
  className?: string;
}

export function ProgressIndicator({
  progress,
  status,
  variant = "full",
  showPercentage = true,
  showDetails = true,
  processedRecords,
  totalRecords,
  eta,
  className,
}: ProgressIndicatorProps) {
  const isActive = status === "running" || status === "paused";
  const isPaused = status === "paused";
  const isComplete = progress >= 100;

  if (!isActive && progress === 0) {
    return null;
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Progress bar container */}
      <div className="relative">
        {/* Background track */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
          {/* Progress fill */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn(
              "relative h-full rounded-full",
              isComplete
                ? "bg-green-500"
                : isPaused
                  ? "bg-yellow-500"
                  : "bg-primary"
            )}
          >
            {/* Animated shine effect when running */}
            {status === "running" && !isComplete && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                animate={{ x: ["-100%", "200%"] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            )}
            
            {/* Glow effect */}
            <div
              className={cn(
                "absolute inset-0 rounded-full blur-sm opacity-50",
                isComplete
                  ? "bg-green-500"
                  : isPaused
                    ? "bg-yellow-500"
                    : "bg-primary"
              )}
            />
          </motion.div>
        </div>

        {/* Percentage badge - inline variant only */}
        {variant === "inline" && showPercentage && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "ml-3 text-xs font-medium tabular-nums",
              isComplete
                ? "text-green-500"
                : isPaused
                  ? "text-yellow-500"
                  : "text-primary"
            )}
          >
            {Math.round(progress)}%
          </motion.span>
        )}
      </div>

      {/* Details section - full variant only */}
      {variant === "full" && showDetails && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 flex items-center justify-between text-xs text-muted-foreground"
        >
          <div className="flex items-center gap-3">
            {/* Percentage */}
            {showPercentage && (
              <span
                className={cn(
                  "font-medium tabular-nums",
                  isComplete
                    ? "text-green-500"
                    : isPaused
                      ? "text-yellow-500"
                      : "text-primary"
                )}
              >
                {Math.round(progress)}%
              </span>
            )}

            {/* Processed / Total */}
            {processedRecords !== undefined && totalRecords !== undefined && (
              <span className="tabular-nums">
                {processedRecords.toLocaleString()} / {totalRecords.toLocaleString()} rekordów
              </span>
            )}
          </div>

          {/* ETA */}
          {eta && !isComplete && (
            <span className="tabular-nums">
              ETA: {eta}
            </span>
          )}

          {/* Status indicator */}
          {isComplete && (
            <span className="text-green-500 font-medium">Ukończono</span>
          )}
          {isPaused && (
            <span className="text-yellow-500 font-medium">Wstrzymano</span>
          )}
        </motion.div>
      )}
    </div>
  );
}
