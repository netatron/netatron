// ============================================================================
// USE UI AGENT HOOK
// ============================================================================
// React hook for integrating UI-aware AI agent capabilities
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  captureUIState,
  generateUIDescription,
  executeActions,
  type UIState,
  type UIAction,
  type ActionResult,
  type AgentUIResponse,
} from '@/lib/ui-agent';

// ============================================================================
// TODO: API_INTEGRATION
// Replace mock response with actual API call to backend
// See docs/UI_AGENT_BACKEND.md for API specification
// ============================================================================

interface UseUIAgentOptions {
  autoCapture?: boolean;
  captureInterval?: number;
}

interface UIAgentState {
  uiState: UIState | null;
  isCapturing: boolean;
  isExecuting: boolean;
  lastActions: ActionResult[];
  error: string | null;
}

export function useUIAgent(options: UseUIAgentOptions = {}) {
  const { autoCapture = true, captureInterval = 5000 } = options;
  const location = useLocation();
  
  const [state, setState] = useState<UIAgentState>({
    uiState: null,
    isCapturing: false,
    isExecuting: false,
    lastActions: [],
    error: null,
  });
  
  const lastCaptureRef = useRef<number>(0);
  
  /**
   * Capture current UI state
   */
  const capture = useCallback(() => {
    setState(prev => ({ ...prev, isCapturing: true }));
    
    try {
      const uiState = captureUIState();
      lastCaptureRef.current = Date.now();
      
      setState(prev => ({
        ...prev,
        uiState,
        isCapturing: false,
        error: null,
      }));
      
      return uiState;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to capture UI';
      setState(prev => ({
        ...prev,
        isCapturing: false,
        error: errorMessage,
      }));
      return null;
    }
  }, []);
  
  /**
   * Get human-readable UI description for AI context
   */
  const getUIContext = useCallback((): string => {
    const currentState = state.uiState || captureUIState();
    return generateUIDescription(currentState);
  }, [state.uiState]);
  
  /**
   * Execute AI actions on UI
   */
  const execute = useCallback(async (
    actions: UIAction[],
    onProgress?: (index: number, result: ActionResult) => void
  ): Promise<ActionResult[]> => {
    if (actions.length === 0) return [];
    
    setState(prev => ({ ...prev, isExecuting: true, error: null }));
    
    try {
      const results = await executeActions(actions, onProgress);
      
      setState(prev => ({
        ...prev,
        isExecuting: false,
        lastActions: results,
      }));
      
      // Re-capture after actions to get updated state
      setTimeout(() => capture(), 500);
      
      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute actions';
      setState(prev => ({
        ...prev,
        isExecuting: false,
        error: errorMessage,
      }));
      return [];
    }
  }, [capture]);
  
  /**
   * Process agent response and optionally execute actions
   */
  const processAgentResponse = useCallback(async (
    response: AgentUIResponse,
    onProgress?: (index: number, result: ActionResult) => void
  ): Promise<ActionResult[]> => {
    if (!response.shouldExecute || !response.actions?.length) {
      return [];
    }
    
    return execute(response.actions, onProgress);
  }, [execute]);
  
  /**
   * Send message to AI with UI context
   * This is a mock implementation - replace with actual API call
   */
  const sendMessageWithContext = useCallback(async (
    message: string
  ): Promise<AgentUIResponse> => {
    const uiContext = getUIContext();
    
    // ============================================================================
    // TODO: API_INTEGRATION
    // Replace this mock with actual API call:
    //
    // const response = await fetch('/api/v1/agent/ui-command', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     message,
    //     ui_context: uiContext,
    //     current_route: location.pathname,
    //   }),
    // });
    // return response.json();
    // ============================================================================
    
    // Mock response for demonstration
    console.log('[UI Agent] Message:', message);
    console.log('[UI Agent] UI Context:', uiContext);
    
    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock intelligent response based on message
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('click') || lowerMessage.includes('kliknij')) {
      // Extract button name
      const match = lowerMessage.match(/(?:click|kliknij)\s+(?:on\s+)?["']?([^"']+)["']?/i);
      const buttonName = match?.[1] || 'start';
      
      return {
        message: `I'll click the "${buttonName}" button for you.`,
        reasoning: `User wants to click a button. Looking for: ${buttonName}`,
        actions: [
          {
            type: 'click',
            targetId: buttonName.toLowerCase().replace(/\s+/g, '-'),
            options: { animate: true, scrollIntoView: true },
          },
        ],
        shouldExecute: true,
      };
    }
    
    if (lowerMessage.includes('fill') || lowerMessage.includes('wpisz') || lowerMessage.includes('enter')) {
      return {
        message: `I can help you fill in the form. What value would you like me to enter and in which field?`,
        shouldExecute: false,
      };
    }
    
    if (lowerMessage.includes('what') || lowerMessage.includes('co') || lowerMessage.includes('gdzie')) {
      return {
        message: `You're currently on the ${location.pathname} page. I can see various interactive elements including buttons and form inputs. How can I help you?`,
        reasoning: `User is asking about the current screen state.`,
        shouldExecute: false,
      };
    }
    
    // Default response with UI awareness
    return {
      message: `I can see you're on the ${state.uiState?.page.title || 'current'} page. I can help you interact with elements on this screen. Try asking me to:\n\n• Click on buttons\n• Fill in forms\n• Navigate to other pages\n• Explain what's on the screen`,
      shouldExecute: false,
    };
  }, [getUIContext, location.pathname, state.uiState]);
  
  // Auto-capture on route change
  useEffect(() => {
    capture();
  }, [location.pathname, capture]);
  
  // Periodic auto-capture
  useEffect(() => {
    if (!autoCapture) return;
    
    const interval = setInterval(() => {
      if (Date.now() - lastCaptureRef.current >= captureInterval) {
        capture();
      }
    }, captureInterval);
    
    return () => clearInterval(interval);
  }, [autoCapture, captureInterval, capture]);
  
  return {
    ...state,
    capture,
    getUIContext,
    execute,
    processAgentResponse,
    sendMessageWithContext,
    currentRoute: location.pathname,
  };
}
