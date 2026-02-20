import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  ListTodo,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

// TODO: API_INTEGRATION - Replace with real TodoItem from API
export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  inProgress?: boolean;
  priority?: 'low' | 'medium' | 'high';
}

const priorityStyles: Record<string, string> = {
  low: 'border-l-muted-foreground/30',
  medium: 'border-l-yellow-500/50',
  high: 'border-l-destructive/50',
};

interface TodoListProps {
  items: TodoItem[];
  title?: string;
  className?: string;
  compact?: boolean;
}

export const TodoList = ({ items, title = 'Agent Tasks', className, compact = false }: TodoListProps) => {
  const completedCount = items.filter(item => item.completed).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  if (compact) {
    return (
      <div className={cn('space-y-1', className)}>
        <AnimatePresence mode="wait">
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              {item.inProgress ? (
                <Loader2 className="h-3 w-3 text-primary animate-spin" />
              ) : item.completed ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              ) : (
                <Circle className="h-3 w-3 text-muted-foreground" />
              )}
              <span className={cn(
                "text-[10px] truncate",
                item.completed ? "text-muted-foreground line-through" : "text-foreground"
              )}>
                {item.text}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <motion.div
          className="p-1.5 rounded-lg bg-accent/20"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          <ListTodo className="h-4 w-4 text-accent" />
        </motion.div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {completedCount}/{items.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-accent rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        {progress > 0 && progress < 100 && (
          <motion.div
            className="absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-primary/50 rounded-full"
            style={{ left: `${progress - 5}%` }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </div>

      {/* Todo items */}
      <div className="space-y-2">
        <AnimatePresence mode="wait">
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={cn(
                'group flex items-start gap-3 p-3 rounded-xl border-l-2 transition-all duration-300',
                'bg-muted/30 hover:bg-muted/50',
                item.completed ? 'border-l-emerald-400/50' : priorityStyles[item.priority || 'medium'],
                item.inProgress && 'ring-1 ring-primary/30'
              )}
            >
              {/* Checkbox */}
              <motion.div
                className="flex-shrink-0 mt-0.5"
                whileTap={{ scale: 0.9 }}
              >
                {item.inProgress ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Loader2 className="h-5 w-5 text-primary" />
                  </motion.div>
                ) : item.completed ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  </motion.div>
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </motion.div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <span className={cn(
                  'text-sm leading-relaxed transition-all duration-300',
                  item.completed && 'text-muted-foreground line-through',
                  item.inProgress && 'text-foreground font-medium'
                )}>
                  {item.text}
                </span>
              </div>

              {/* Active indicator */}
              {item.inProgress && (
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3 text-primary" />
                </motion.div>
              )}

              {/* Arrow for pending items */}
              {!item.completed && !item.inProgress && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Completion celebration */}
      <AnimatePresence>
        {progress === 100 && items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm text-emerald-400 font-medium">All tasks completed!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
