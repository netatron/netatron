// ============================================================================
// TOOL EXECUTION VISUALIZER
// ============================================================================
// Animated visualization of agent tool executions.
// Shows real-time progress with category-specific animations and icons.
// 
// TODO: API_INTEGRATION - Connect to WebSocket for real-time tool execution updates
// Endpoint: ws://api/agent/tools/stream
// 
// The component receives tool executions from the agent and displays them
// with appropriate animations based on tool category and execution status.
// ============================================================================

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Search,
  MapPin,
  Building2,
  Globe,
  Calendar,
  CalendarPlus,
  CalendarX,
  FileDown,
  FileUp,
  Download,
  FormInput,
  ListChecks,
  Hash,
  Navigation,
  MousePointer,
  Play,
  Square,
  Pause,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  Zap,
  Database,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type {
  ToolExecution,
  ToolExecutionStatus,
  ToolCategory,
  AgentTool,
} from '@/lib/agent-tools/types';

// ============================================================================
// ICON MAPPINGS
// ============================================================================

/**
 * Maps tool IDs to their respective icons for visual identification
 * TODO: API_INTEGRATION - Tool IDs should match backend tool registry
 */
const toolIcons: Record<string, React.ElementType> = {
  // Scraper tools
  google_maps_search: MapPin,
  kpo_search: Building2,
  deep_search: Globe,
  
  // Calendar tools
  create_calendar_event: CalendarPlus,
  update_calendar_event: Calendar,
  delete_calendar_event: CalendarX,
  
  // Data tools
  export_results: FileDown,
  download_file: Download,
  import_csv: FileUp,
  
  // Form tools
  fill_form_field: FormInput,
  select_option: ListChecks,
  set_record_count: Hash,
  
  // Navigation tools
  navigate_to_page: Navigation,
  click_element: MousePointer,
  
  // System tools
  start_module_job: Play,
  stop_module_job: Square,
  pause_resume_job: Pause,
};

/**
 * Category-specific colors for visual grouping
 */
const categoryColors: Record<ToolCategory, string> = {
  scraper: 'text-cyan-400 border-cyan-400/50 bg-cyan-400/10',
  calendar: 'text-violet-400 border-violet-400/50 bg-violet-400/10',
  data: 'text-amber-400 border-amber-400/50 bg-amber-400/10',
  form: 'text-emerald-400 border-emerald-400/50 bg-emerald-400/10',
  navigation: 'text-blue-400 border-blue-400/50 bg-blue-400/10',
  system: 'text-rose-400 border-rose-400/50 bg-rose-400/10',
};

/**
 * Status-based styling for execution states
 */
const statusStyles: Record<ToolExecutionStatus, string> = {
  pending: 'opacity-50',
  preparing: 'opacity-75',
  executing: '',
  completed: 'opacity-90',
  error: 'opacity-90',
  cancelled: 'opacity-50',
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Individual tool execution card with animations
 */
interface ToolExecutionCardProps {
  execution: ToolExecution;
  index: number;
}

function ToolExecutionCard({ execution, index }: ToolExecutionCardProps) {
  const { tool, status, progress, error, startedAt, completedAt } = execution;
  const Icon = toolIcons[tool.id] || Zap;
  const categoryColor = categoryColors[tool.category];
  
  // Calculate duration for completed executions
  const duration = completedAt && startedAt
    ? Math.round((completedAt.getTime() - startedAt.getTime()))
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ 
        duration: 0.3, 
        delay: index * 0.1,
        ease: [0.4, 0, 0.2, 1]
      }}
      className={cn(
        'relative p-3 rounded-xl border backdrop-blur-sm',
        'bg-background/50',
        categoryColor.split(' ').slice(1).join(' '),
        statusStyles[status]
      )}
    >
      {/* Glow effect for executing status */}
      {status === 'executing' && (
        <motion.div
          className={cn(
            'absolute inset-0 rounded-xl',
            categoryColor.replace('text-', 'bg-').replace('/10', '/5')
          )}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      <div className="relative flex items-start gap-3">
        {/* Animated Icon */}
        <div className={cn(
          'flex-shrink-0 p-2 rounded-lg border',
          categoryColor
        )}>
          <motion.div
            animate={status === 'executing' ? { 
              rotate: [0, 360],
              scale: [1, 1.1, 1]
            } : {}}
            transition={{ 
              rotate: { duration: 2, repeat: Infinity, ease: 'linear' },
              scale: { duration: 1, repeat: Infinity }
            }}
          >
            {status === 'executing' ? (
              <Loader2 className={cn('h-4 w-4 animate-spin', categoryColor.split(' ')[0])} />
            ) : status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : status === 'error' ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Icon className={cn('h-4 w-4', categoryColor.split(' ')[0])} />
            )}
          </motion.div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-foreground truncate">
              {tool.name}
            </h4>
            {duration !== null && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {duration}ms
              </span>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {tool.description}
          </p>

          {/* Progress bar for executing status */}
          {status === 'executing' && progress !== undefined && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2"
            >
              <Progress value={progress} className="h-1" />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                {Math.round(progress)}%
              </span>
            </motion.div>
          )}

          {/* Error message */}
          {status === 'error' && error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-destructive mt-1"
            >
              {error}
            </motion.p>
          )}

          {/* Tool parameters preview */}
          <ToolParamsPreview tool={tool} status={status} />
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Animated preview of tool parameters
 * Shows what the tool is doing with typewriter-like animation
 */
interface ToolParamsPreviewProps {
  tool: AgentTool;
  status: ToolExecutionStatus;
}

function ToolParamsPreview({ tool, status }: ToolParamsPreviewProps) {
  const [displayText, setDisplayText] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);

  // Generate preview text based on tool type
  const previewText = getToolPreviewText(tool);

  // Typewriter animation for executing status
  useEffect(() => {
    if (status === 'executing' && previewText) {
      setIsAnimating(true);
      let currentIndex = 0;
      const interval = setInterval(() => {
        if (currentIndex <= previewText.length) {
          setDisplayText(previewText.slice(0, currentIndex));
          currentIndex++;
        } else {
          clearInterval(interval);
          setIsAnimating(false);
        }
      }, 30);
      return () => clearInterval(interval);
    } else if (status === 'completed') {
      setDisplayText(previewText);
    }
  }, [status, previewText]);

  if (!previewText || status === 'pending') return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="mt-2 p-2 rounded-md bg-muted/30 border border-border/50"
    >
      <code className="text-[10px] text-muted-foreground font-mono break-all">
        {displayText}
        {isAnimating && (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="text-primary"
          >
            ▊
          </motion.span>
        )}
      </code>
    </motion.div>
  );
}

/**
 * Generates human-readable preview text for tool parameters
 * TODO: API_INTEGRATION - These should match the actual tool parameter formats
 */
function getToolPreviewText(tool: AgentTool): string {
  const params = tool.params as Record<string, unknown>;
  
  switch (tool.id) {
    case 'google_maps_search':
      return `Query: "${params.query}" | Max: ${params.maxRecords || 100} records`;
    case 'kpo_search':
      return `Search: "${params.query}" | Region: ${params.region || 'All'}`;
    case 'deep_search':
      return `Research: "${params.query}" | Depth: ${params.depth || 'medium'}`;
    case 'create_calendar_event':
      return `Event: "${params.title}" at ${params.startTime}`;
    case 'update_calendar_event':
      return `Update event ${params.eventId}`;
    case 'export_results':
      return `Export job ${params.jobId} as ${params.format || 'CSV'}`;
    case 'fill_form_field':
      return `Fill "${params.fieldId}" = "${params.value}"`;
    case 'select_option':
      return `Select "${params.value}" in ${params.selectId}`;
    case 'set_record_count':
      return `Set ${params.module} to ${params.count} records`;
    case 'navigate_to_page':
      return `Navigate to ${params.route}`;
    case 'start_module_job':
      return `Start ${params.module} job`;
    case 'stop_module_job':
      return `Stop ${params.module} job`;
    default:
      return JSON.stringify(params).slice(0, 50);
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ToolExecutionVisualizerProps {
  executions: ToolExecution[];
  className?: string;
  compact?: boolean;
}

/**
 * Main visualizer component that displays tool executions
 * 
 * Usage:
 * ```tsx
 * <ToolExecutionVisualizer 
 *   executions={toolExecutions}
 *   compact={false}
 * />
 * ```
 * 
 * TODO: API_INTEGRATION - Connect to WebSocket for real-time updates:
 * ```typescript
 * const ws = new WebSocket('ws://api/agent/tools/stream');
 * ws.onmessage = (event) => {
 *   const execution = JSON.parse(event.data);
 *   updateExecutions(execution);
 * };
 * ```
 */
export function ToolExecutionVisualizer({
  executions,
  className,
  compact = false,
}: ToolExecutionVisualizerProps) {
  // Group executions by status for summary
  const summary = {
    pending: executions.filter(e => e.status === 'pending').length,
    executing: executions.filter(e => e.status === 'executing' || e.status === 'preparing').length,
    completed: executions.filter(e => e.status === 'completed').length,
    failed: executions.filter(e => e.status === 'error' || e.status === 'cancelled').length,
  };

  if (executions.length === 0) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header with summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          >
            <Sparkles className="h-4 w-4 text-primary" />
          </motion.div>
          <h3 className="text-sm font-semibold text-foreground">
            Tool Executions
          </h3>
        </div>
        
        {/* Status summary badges */}
        <div className="flex items-center gap-2 text-[10px]">
          {summary.executing > 0 && (
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="px-1.5 py-0.5 rounded bg-primary/20 text-primary"
            >
              {summary.executing} running
            </motion.span>
          )}
          {summary.completed > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-400">
              {summary.completed} done
            </span>
          )}
          {summary.failed > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">
              {summary.failed} failed
            </span>
          )}
        </div>
      </div>

      {/* Execution cards */}
      <div className={cn(
        'space-y-2',
        compact && 'max-h-40 overflow-y-auto'
      )}>
        <AnimatePresence mode="popLayout">
          {executions.map((execution, index) => (
            <ToolExecutionCard
              key={execution.id}
              execution={execution}
              index={index}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Overall progress indicator */}
      {summary.executing > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span>Processing {summary.executing} tool(s)...</span>
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// MOCK DATA GENERATOR (for development/testing)
// ============================================================================

/**
 * Generates mock tool executions for UI testing
 * TODO: REMOVE_IN_PRODUCTION - Replace with real API data
 * 
 * Usage:
 * ```typescript
 * const mockExecutions = generateMockExecutions();
 * <ToolExecutionVisualizer executions={mockExecutions} />
 * ```
 */
export function generateMockExecutions(): ToolExecution[] {
  return [
    {
      id: 'exec-1',
      tool: {
        id: 'navigate_to_page',
        name: 'Navigate to Google Maps',
        description: 'Opening Google Maps Scraper module',
        category: 'navigation',
        params: { route: '/google-maps' },
      },
      status: 'completed',
      startedAt: new Date(Date.now() - 2000),
      completedAt: new Date(Date.now() - 1500),
    },
    {
      id: 'exec-2',
      tool: {
        id: 'fill_form_field',
        name: 'Fill Query Input',
        description: 'Entering search query',
        category: 'form',
        params: { fieldId: 'query-input', value: 'restaurants in Warsaw' },
      },
      status: 'completed',
      startedAt: new Date(Date.now() - 1500),
      completedAt: new Date(Date.now() - 1000),
    },
    {
      id: 'exec-3',
      tool: {
        id: 'set_record_count',
        name: 'Set Record Limit',
        description: 'Setting maximum records to fetch',
        category: 'form',
        params: { module: 'google_maps', count: 150 },
      },
      status: 'executing',
      progress: 45,
      startedAt: new Date(Date.now() - 500),
    },
    {
      id: 'exec-4',
      tool: {
        id: 'start_module_job',
        name: 'Start Scraping',
        description: 'Initiating scraper job',
        category: 'system',
        params: { module: 'google_maps' },
      },
      status: 'pending',
      startedAt: new Date(),
    },
  ];
}

export default ToolExecutionVisualizer;
