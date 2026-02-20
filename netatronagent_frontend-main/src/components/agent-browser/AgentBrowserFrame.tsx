import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Globe, 
  RefreshCw, 
  Shield, 
  ChevronLeft, 
  ChevronRight,
  Maximize2,
  X,
  Lock,
  Eye,
  Code,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Bot
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// ============================================================================
// TYPES
// ============================================================================

export interface BrowserState {
  url: string;
  title: string;
  status: "idle" | "loading" | "ready" | "error";
  statusCode?: number;
  htmlPreview?: string;
  errorMessage?: string;
}

export interface AgentAction {
  id: string;
  type: "search" | "navigate" | "fetch" | "parse" | "ai_call" | "result";
  description: string;
  url?: string;
  query?: string;
  status: "pending" | "running" | "completed" | "error";
  result?: Record<string, unknown>;
  timestamp: Date;
  duration?: number;
}

interface AgentBrowserFrameProps {
  browserState: BrowserState;
  actions: AgentAction[];
  isAgentActive: boolean;
  onMaximize?: () => void;
  onClose?: () => void;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AgentBrowserFrame({
  browserState,
  actions,
  isAgentActive,
  onMaximize,
  onClose,
  className,
}: AgentBrowserFrameProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "html" | "actions">("preview");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll actions to bottom
  useEffect(() => {
    if (scrollRef.current && activeTab === "actions") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [actions, activeTab]);

  return (
    <div className={cn(
      "flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-2xl",
      className
    )}>
      {/* ====================================================================
          BROWSER CHROME - Top bar mimicking browser UI
          ==================================================================== */}
      <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 border-b border-border">
        {/* Window controls */}
        <div className="flex items-center gap-1.5">
          <button 
            onClick={onClose}
            className="h-3 w-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
          />
          <button className="h-3 w-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors" />
          <button 
            onClick={onMaximize}
            className="h-3 w-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors"
          />
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-1 ml-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
            <RefreshCw className={cn(
              "h-4 w-4",
              browserState.status === "loading" && "animate-spin"
            )} />
          </Button>
        </div>

        {/* URL Bar */}
        {/* ====================================================================
            TODO: API_INTEGRATION - URL aktualizowany z SSE events
            Endpoint: GET /api/v1/jobs/{jobId}/events/stream
            Event: { type: 'navigate', data: { url: string, title: string } }
            ==================================================================== */}
        <div className="flex-1 flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg bg-background/80 border border-border/50">
          {browserState.url ? (
            <>
              <Lock className="h-3 w-3 text-green-500" />
              <span className="text-xs text-muted-foreground truncate font-mono">
                {browserState.url}
              </span>
            </>
          ) : (
            <>
              <Search className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground italic">
                Agent is ready...
              </span>
            </>
          )}
          
          {/* Status indicator */}
          <div className="ml-auto">
            {browserState.status === "loading" && (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            )}
            {browserState.status === "ready" && (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            )}
            {browserState.status === "error" && (
              <AlertCircle className="h-3 w-3 text-destructive" />
            )}
          </div>
        </div>

        {/* Agent status badge */}
        <Badge 
          variant={isAgentActive ? "default" : "secondary"}
          className={cn(
            "gap-1 text-xs",
            isAgentActive && "bg-primary animate-pulse"
          )}
        >
          <Bot className="h-3 w-3" />
          {isAgentActive ? "Working" : "Idle"}
        </Badge>

        {/* Maximize button */}
        {onMaximize && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMaximize}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* ====================================================================
          CONTENT AREA - Tabs for different views
          ==================================================================== */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 px-2">
          <TabsTrigger value="preview" className="gap-1.5 text-xs">
            <Eye className="h-3 w-3" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="html" className="gap-1.5 text-xs">
            <Code className="h-3 w-3" />
            HTML
          </TabsTrigger>
          <TabsTrigger value="actions" className="gap-1.5 text-xs">
            <Bot className="h-3 w-3" />
            Actions ({actions.length})
          </TabsTrigger>
        </TabsList>

        {/* ====================================================================
            PREVIEW TAB - Visual representation of scraped page
            ==================================================================== */}
        <TabsContent value="preview" className="flex-1 m-0 p-0">
          <div className="h-full min-h-[300px] bg-background flex items-center justify-center">
            {browserState.status === "idle" && !browserState.url && (
              <div className="text-center text-muted-foreground">
                <Globe className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Waiting for agent to start browsing...</p>
                <p className="text-xs mt-1 opacity-70">Start a Deep Search to see the agent in action</p>
              </div>
            )}
            
            {browserState.status === "loading" && (
              <div className="text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-3 animate-spin text-primary" />
                <p className="text-sm">Loading {browserState.url}...</p>
              </div>
            )}

            {browserState.status === "ready" && browserState.htmlPreview && (
              <div className="h-full w-full flex flex-col">
                <div className="flex-1 p-4 overflow-hidden">
                  <iframe
                    srcDoc={browserState.htmlPreview}
                    className="w-full h-full border border-border rounded-lg bg-white"
                    title="Page Preview"
                    sandbox="allow-same-origin allow-scripts"
                    style={{ 
                      minHeight: '400px',
                      width: '100%',
                      height: '100%',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.5rem',
                    }}
                    scrolling="auto"
                  />
                </div>
                <div className="px-4 pb-2 text-xs text-muted-foreground border-t border-border">
                  Preview: {browserState.url} (Status: {browserState.statusCode || 'N/A'})
                </div>
              </div>
            )}
            
            {browserState.status === "loading" && browserState.url && (
              <div className="text-center text-muted-foreground py-8">
                <Loader2 className="h-12 w-12 mx-auto mb-3 animate-spin text-primary" />
                <p className="text-sm">Loading {browserState.url}...</p>
                {browserState.htmlPreview && (
                  <p className="text-xs mt-2 opacity-70">HTML content received, rendering...</p>
                )}
              </div>
            )}
            
            {browserState.status === "ready" && !browserState.htmlPreview && browserState.url && (
              <div className="text-center text-muted-foreground py-8">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                <p className="text-sm">Page loaded: {browserState.url}</p>
                <p className="text-xs mt-2 opacity-70">No HTML preview available</p>
              </div>
            )}

            {browserState.status === "error" && (
              <div className="text-center text-destructive">
                <AlertCircle className="h-12 w-12 mx-auto mb-3" />
                <p className="text-sm font-medium">Error loading page</p>
                <p className="text-xs mt-1 opacity-70">{browserState.errorMessage || "Unknown error"}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ====================================================================
            HTML TAB - Raw HTML code view
            ==================================================================== */}
        <TabsContent value="html" className="flex-1 m-0 p-0">
          <ScrollArea className="h-full min-h-[300px]">
            {browserState.htmlPreview ? (
              <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                {browserState.htmlPreview}
              </pre>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No HTML content yet</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* ====================================================================
            ACTIONS TAB - Timeline of agent actions
            ==================================================================== */}
        {/* TODO: API_INTEGRATION - Actions populated from SSE stream
            Each event creates new action entry:
            - search: When searching web
            - navigate: When visiting URL
            - fetch: When downloading HTML
            - parse: When extracting data
            - ai_call: When calling AI for parsing
            - result: When company data extracted */}
        <TabsContent value="actions" className="flex-1 m-0 p-0">
          <ScrollArea className="h-full min-h-[300px]" ref={scrollRef}>
            <div className="p-3 space-y-2">
              <AnimatePresence mode="popLayout">
                {actions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Bot className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No actions yet</p>
                  </div>
                ) : (
                  actions.map((action) => (
                    <AgentActionItem key={action.id} action={action} />
                  ))
                )}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* ====================================================================
          STATUS BAR - Bottom status information
          ==================================================================== */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-t border-border text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Shield className="h-3 w-3" />
          <span>Secure browsing via backend proxy</span>
        </div>
        {browserState.statusCode && (
          <Badge variant="outline" className="text-xs py-0">
            HTTP {browserState.statusCode}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ACTION ITEM COMPONENT
// ============================================================================

function AgentActionItem({ action }: { action: AgentAction }) {
  const iconMap = {
    search: Search,
    navigate: Globe,
    fetch: RefreshCw,
    parse: Code,
    ai_call: Bot,
    result: CheckCircle2,
  };
  
  const Icon = iconMap[action.type] || Globe;
  
  const statusColors = {
    pending: "text-muted-foreground",
    running: "text-primary",
    completed: "text-green-500",
    error: "text-destructive",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        "flex items-start gap-3 p-2 rounded-lg border",
        action.status === "running" && "border-primary/50 bg-primary/5",
        action.status === "completed" && "border-border bg-muted/30",
        action.status === "error" && "border-destructive/50 bg-destructive/5",
        action.status === "pending" && "border-border/50 opacity-60"
      )}
    >
      {/* Icon */}
      <div className={cn(
        "flex-shrink-0 p-1.5 rounded-md",
        action.status === "running" && "bg-primary/10",
        action.status === "completed" && "bg-green-500/10",
        action.status === "error" && "bg-destructive/10"
      )}>
        <Icon className={cn(
          "h-4 w-4",
          statusColors[action.status],
          action.status === "running" && "animate-pulse"
        )} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium capitalize">{action.type}</span>
          <span className="text-[10px] text-muted-foreground">
            {action.timestamp.toLocaleTimeString()}
          </span>
          {action.duration && (
            <Badge variant="outline" className="text-[10px] py-0 px-1">
              {action.duration}ms
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {action.description}
        </p>
        {action.url && (
          <p className="text-[10px] text-primary/70 font-mono mt-0.5 truncate">
            {action.url}
          </p>
        )}
      </div>

      {/* Status */}
      {action.status === "running" && (
        <Loader2 className="h-3 w-3 animate-spin text-primary flex-shrink-0" />
      )}
      {action.status === "completed" && (
        <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
      )}
      {action.status === "error" && (
        <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
      )}
    </motion.div>
  );
}
