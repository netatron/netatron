import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  AlertCircle,
  Search,
  Database,
  Send,
  FileText,
  Zap,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

// TODO: API_INTEGRATION - Replace with real ActionTimelineItem from API
export interface TimelineAction {
  id: string;
  type: 'search' | 'analyze' | 'process' | 'generate' | 'validate' | 'complete';
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  timestamp: Date;
  duration?: number; // in ms
}

const actionIcons: Record<TimelineAction['type'], React.ElementType> = {
  search: Search,
  analyze: Database,
  process: Zap,
  generate: FileText,
  validate: CheckCircle2,
  complete: Send,
};

const statusColors: Record<TimelineAction['status'], string> = {
  pending: 'text-muted-foreground border-muted-foreground/30',
  in_progress: 'text-primary border-primary animate-pulse',
  completed: 'text-emerald-400 border-emerald-400/50',
  error: 'text-destructive border-destructive/50',
};

interface ActionTimelineProps {
  actions: TimelineAction[];
  className?: string;
  compact?: boolean;
}

export const ActionTimeline = ({ actions, className, compact = false }: ActionTimelineProps) => {
  if (compact) {
    return (
      <div className={cn('space-y-1', className)}>
        <AnimatePresence>
          {actions.map((action, index) => {
            const Icon = actionIcons[action.type];
            return (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <div className={cn(
                  'flex items-center justify-center w-5 h-5 rounded-full border bg-background',
                  statusColors[action.status]
                )}>
                  {action.status === 'in_progress' ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : action.status === 'completed' ? (
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  ) : (
                    <Icon className="h-2.5 w-2.5" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground truncate">{action.title}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Action Timeline</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {actions.filter(a => a.status === 'completed').length}/{actions.length}
        </span>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[15px] top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 via-primary/20 to-transparent" />

        <AnimatePresence>
          {actions.map((action, index) => {
            const Icon = actionIcons[action.type];
            const isLast = index === actions.length - 1;
            
            return (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="relative flex gap-3 pb-4"
              >
                {/* Icon node */}
                <motion.div
                  className={cn(
                    'relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 bg-background',
                    statusColors[action.status]
                  )}
                  animate={action.status === 'in_progress' ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 1, repeat: action.status === 'in_progress' ? Infinity : 0 }}
                >
                  {action.status === 'in_progress' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : action.status === 'error' ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : action.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  
                  {/* Pulse effect for in_progress */}
                  {action.status === 'in_progress' && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-primary"
                      animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                </motion.div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-sm font-medium',
                      action.status === 'completed' ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {action.title}
                    </span>
                    {action.duration && action.status === 'completed' && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {action.duration}ms
                      </span>
                    )}
                  </div>
                  {action.description && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="text-xs text-muted-foreground mt-1 line-clamp-2"
                    >
                      {action.description}
                    </motion.p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
