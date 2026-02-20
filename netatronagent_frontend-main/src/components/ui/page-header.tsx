import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressIndicator } from "./progress-indicator";
import type { ModuleStatus } from "./module-controls";

interface ProgressData {
  value: number;
  status: ModuleStatus;
  processedRecords?: number;
  totalRecords?: number;
  eta?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  progress?: ProgressData;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  progress,
  className,
}: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("mb-8 space-y-4", className)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {Icon && (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
      
      {/* Progress bar */}
      {progress && (
        <ProgressIndicator
          progress={progress.value}
          status={progress.status}
          variant="full"
          showPercentage={true}
          showDetails={true}
          processedRecords={progress.processedRecords}
          totalRecords={progress.totalRecords}
          eta={progress.eta}
        />
      )}
    </motion.div>
  );
}
