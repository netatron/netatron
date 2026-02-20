import { useState, useEffect, useCallback, useRef } from "react";
import type { BrowserState, AgentAction } from "@/components/agent-browser/AgentBrowserFrame";
import type { ScrapedCompany } from "@/components/agent-browser/ResultsAccumulator";

// ============================================================================
// TYPES
// ============================================================================

interface AgentBrowserEvent {
  type: "navigate" | "fetch" | "parse" | "ai_call" | "result" | "error" | "search" | "progress" | "completed";
  timestamp: number;
  data: {
    url?: string;
    query?: string;
    html_preview?: string;
    status_code?: number;
    action_description?: string;
    result?: Record<string, unknown>;
    error?: string;
    progress?: number;
    total?: number;
  };
}

interface UseAgentBrowserOptions {
  jobId: string | null;
  enabled?: boolean;
}

interface UseAgentBrowserReturn {
  browserState: BrowserState;
  actions: AgentAction[];
  results: ScrapedCompany[];
  isConnected: boolean;
  error: string | null;
  reset: () => void;
}

// ============================================================================
// MOCK DATA GENERATOR - For development/demo purposes
// ============================================================================
// TODO: API_INTEGRATION - Replace with real SSE connection
// Endpoint: GET /api/v1/jobs/{jobId}/events/stream
// Content-Type: text/event-stream
// ============================================================================

const MOCK_URLS = [
  "https://example-company.pl/kontakt",
  "https://tech-startup.com/about",
  "https://firma-polska.pl/o-nas",
  "https://innovative-solutions.pl",
  "https://digital-agency.com/team",
];

const MOCK_COMPANIES: Partial<ScrapedCompany>[] = [
  { name: "TechStart Sp. z o.o.", email: "kontakt@techstart.pl", phone: "+48 123 456 789", website: "https://techstart.pl" },
  { name: "Digital Solutions S.A.", email: "info@digitalsol.com", address: "ul. Marszałkowska 100, Warszawa" },
  { name: "Innovative Tech", email: "hello@innovative.pl", phone: "+48 987 654 321", description: "Leading AI startup" },
  { name: "Future Systems", website: "https://futuresys.pl", address: "Kraków, ul. Floriańska 15" },
  { name: "Smart Data Inc.", email: "contact@smartdata.io", phone: "+48 111 222 333" },
];

function generateMockEvent(index: number): AgentBrowserEvent {
  const types: AgentBrowserEvent["type"][] = ["search", "navigate", "fetch", "parse", "ai_call", "result"];
  const type = types[index % types.length];
  
  return {
    type,
    timestamp: Date.now(),
    data: {
      url: MOCK_URLS[index % MOCK_URLS.length],
      query: type === "search" ? `AI startup Poland ${index}` : undefined,
      action_description: getActionDescription(type, index),
      html_preview: type === "fetch" ? `<!DOCTYPE html><html><head><title>Company Page</title></head><body><h1>Welcome to ${MOCK_COMPANIES[index % MOCK_COMPANIES.length].name}</h1><p>Contact us at ${MOCK_COMPANIES[index % MOCK_COMPANIES.length].email}</p></body></html>` : undefined,
      status_code: type === "fetch" ? 200 : undefined,
      result: type === "result" ? MOCK_COMPANIES[index % MOCK_COMPANIES.length] : undefined,
    },
  };
}

function getActionDescription(type: AgentBrowserEvent["type"], index: number): string {
  switch (type) {
    case "search": return `Searching Google CSE for query variant ${index + 1}`;
    case "navigate": return `Navigating to candidate website`;
    case "fetch": return `Fetching HTML content`;
    case "parse": return `Parsing contact information from page`;
    case "ai_call": return `Calling GPT-4o-mini for data extraction`;
    case "result": return `Extracted company data successfully`;
    default: return `Processing step ${index}`;
  }
}

// ============================================================================
// HOOK
// ============================================================================

export function useAgentBrowser({ 
  jobId, 
  enabled = true 
}: UseAgentBrowserOptions): UseAgentBrowserReturn {
  const [browserState, setBrowserState] = useState<BrowserState>({
    url: "",
    title: "",
    status: "idle",
  });
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [results, setResults] = useState<ScrapedCompany[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const mockIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const actionCounterRef = useRef(0);

  // ============================================================================
  // RESET STATE
  // ============================================================================
  const reset = useCallback(() => {
    setBrowserState({ url: "", title: "", status: "idle" });
    setActions([]);
    setResults([]);
    setError(null);
    actionCounterRef.current = 0;
  }, []);

  // ============================================================================
  // PROCESS EVENT - Convert SSE event to UI state updates
  // ============================================================================
  const processEvent = useCallback((event: AgentBrowserEvent) => {
    const actionId = `action-${Date.now()}-${actionCounterRef.current++}`;
    
    // Map event type to action type
    const actionTypeMap: Record<string, AgentAction["type"]> = {
      search: "search",
      navigate: "navigate",
      fetch: "fetch",
      parse: "parse",
      ai_call: "ai_call",
      result: "result",
    };

    // Update browser state based on event type
    switch (event.type) {
      case "navigate":
        setBrowserState(prev => ({
          ...prev,
          url: event.data.url || prev.url,
          title: event.data.title || prev.title,
          status: "loading",
        }));
        break;
        
      case "fetch":
        setBrowserState(prev => ({
          ...prev,
          url: event.data.url || prev.url,
          status: event.data.html_preview ? "ready" : "loading",
          htmlPreview: event.data.html_preview || prev.htmlPreview,
          statusCode: event.data.status_code || prev.statusCode,
        }));
        break;
        
      case "parse":
      case "ai_call":
        setBrowserState(prev => ({
          ...prev,
          status: prev.htmlPreview ? "ready" : "loading",
        }));
        break;
        
      case "result":
        setBrowserState(prev => ({
          ...prev,
          status: "ready",
        }));
        
        // Add result to accumulated results
        if (event.data.result) {
          const company: ScrapedCompany = {
            id: `company-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: (event.data.result.name as string) || "Unknown Company",
            email: event.data.result.email as string,
            phone: event.data.result.phone as string,
            website: event.data.result.website as string,
            address: event.data.result.address as string,
            description: event.data.result.description as string,
            source_query: event.data.query,
            confidence: (event.data.result.confidence as ScrapedCompany["confidence"]) || "Medium",
            scraped_at: new Date(),
          };
          setResults(prev => [...prev, company]);
        }
        break;
        
      case "error":
        setBrowserState(prev => ({
          ...prev,
          status: "error",
          errorMessage: event.data.error,
        }));
        break;
        
      case "completed":
        setBrowserState(prev => ({
          ...prev,
          status: "ready",
        }));
        return; // Don't create action for completed
    }

    // Create action entry
    if (actionTypeMap[event.type]) {
      const newAction: AgentAction = {
        id: actionId,
        type: actionTypeMap[event.type],
        description: event.data.action_description || `${event.type} operation`,
        url: event.data.url,
        query: event.data.query,
        status: event.type === "result" ? "completed" : "running",
        timestamp: new Date(event.timestamp),
      };

      setActions(prev => {
        // Mark previous running action as completed
        const updated = prev.map(a => 
          a.status === "running" ? { ...a, status: "completed" as const } : a
        );
        return [...updated, newAction];
      });

      // Auto-complete action after delay (simulating real processing)
      setTimeout(() => {
        setActions(prev => 
          prev.map(a => a.id === actionId ? { ...a, status: "completed" as const } : a)
        );
      }, 1500);
    }
  }, []);

  // ============================================================================
  // CONNECT TO SSE OR START MOCK
  // ============================================================================
  useEffect(() => {
    if (!jobId || !enabled) {
      reset();
      return;
    }

    // ========================================================================
    // API_INTEGRATION - Connect to real SSE endpoint
    // ========================================================================
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const authToken = localStorage.getItem('auth_token');
    
    if (!authToken) {
      setError('Authentication required');
      setIsConnected(false);
      return;
    }
    
    // Create EventSource with authentication token in query parameter
    // Note: EventSource doesn't support custom headers, so we use query param
    const eventSourceUrl = `${apiBaseUrl}/api/jobs/${jobId}/events/stream?token=${encodeURIComponent(authToken)}`;
    const eventSource = new EventSource(eventSourceUrl);
    
    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      console.log(`[AgentBrowser] Connected to SSE stream for job ${jobId}`);
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data: AgentBrowserEvent = JSON.parse(event.data);
        
        // Handle special events
        if (data.type === 'connected') {
          console.log('[AgentBrowser] Stream connected');
          return;
        }
        
        if (data.type === 'stream_end') {
          console.log('[AgentBrowser] Stream ended:', data.data?.reason);
          eventSource.close();
          return;
        }
        
        processEvent(data);
      } catch (e) {
        console.error('[AgentBrowser] Failed to parse SSE event:', e, event.data);
      }
    };
    
    eventSource.onerror = (e) => {
      console.error('[AgentBrowser] SSE error:', e);
      setError('Connection to agent lost');
      setIsConnected(false);
      eventSource.close();
    };
    
    eventSourceRef.current = eventSource;
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
    };
  }, [jobId, enabled, processEvent, reset, results.length]);

  return {
    browserState,
    actions,
    results,
    isConnected,
    error,
    reset,
  };
}
