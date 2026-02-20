import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types/api";

interface StatusBadgeProps {
  status: JobStatus | string;
  className?: string;
  showDot?: boolean;
}

const statusConfig: Record<string, { label: string; className: string; dotClassName: string }> = {
  running: {
    label: "Running",
    className: "bg-success/10 text-success border-success/20",
    dotClassName: "bg-success animate-pulse",
  },
  queued: {
    label: "Queued",
    className: "bg-warning/10 text-warning border-warning/20",
    dotClassName: "bg-warning",
  },
  paused: {
    label: "Paused",
    className: "bg-muted text-muted-foreground border-border",
    dotClassName: "bg-muted-foreground",
  },
  completed: {
    label: "Completed",
    className: "bg-primary/10 text-primary border-primary/20",
    dotClassName: "bg-primary",
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    dotClassName: "bg-destructive",
  },
};

export function StatusBadge({ status, className, showDot = true }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.queued;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {showDot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", config.dotClassName)} />
      )}
      {config.label}
    </span>
  );
}
