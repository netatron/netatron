// ============================================================================
// UI AGENT TYPES
// ============================================================================
// Types for the UI-aware AI agent system
// ============================================================================

/**
 * Represents an interactive element on the page
 */
export interface UIElement {
  id: string;
  tagName: string;
  type?: string;
  text?: string;
  value?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  dataTestId?: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isVisible: boolean;
  isInteractive: boolean;
}

/**
 * Current page/route context
 */
export interface PageContext {
  route: string;
  title: string;
  description?: string;
  moduleStatus?: string;
  activeTab?: string;
}

/**
 * Complete UI state snapshot
 */
export interface UIState {
  timestamp: number;
  page: PageContext;
  elements: UIElement[];
  formData: Record<string, unknown>;
  moduleData?: Record<string, unknown>;
}

/**
 * Action that AI can execute on UI
 */
export type UIActionType = 
  | 'click'
  | 'fill'
  | 'select'
  | 'scroll'
  | 'navigate'
  | 'hover'
  | 'focus'
  | 'clear'
  | 'submit'
  | 'toggle';

export interface UIAction {
  type: UIActionType;
  targetId?: string;
  targetSelector?: string;
  value?: string | number | boolean;
  options?: {
    delay?: number;
    animate?: boolean;
    scrollIntoView?: boolean;
  };
}

/**
 * AI Agent response with UI actions
 */
export interface AgentUIResponse {
  message: string;
  reasoning?: string;
  actions?: UIAction[];
  shouldExecute: boolean;
}

/**
 * Action execution result
 */
export interface ActionResult {
  success: boolean;
  action: UIAction;
  error?: string;
  timestamp: number;
}
