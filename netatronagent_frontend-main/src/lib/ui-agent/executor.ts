// ============================================================================
// UI ACTION EXECUTOR
// ============================================================================
// Executes AI-directed actions on the UI with visual feedback
// ============================================================================

import type { UIAction, ActionResult } from './types';

/**
 * Find element by ID or selector
 */
function findElement(action: UIAction): Element | null {
  if (action.targetId) {
    // Try direct ID
    let element = document.getElementById(action.targetId);
    if (element) return element;
    
    // Try data-testid
    element = document.querySelector(`[data-testid="${action.targetId}"]`);
    if (element) return element;
    
    // Try by generated ID pattern
    element = document.querySelector(`[id*="${action.targetId}"]`);
    if (element) return element;
    
    // Try by text content for buttons
    const buttons = document.querySelectorAll('button, a, [role="button"]');
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase().trim();
      if (text?.includes(action.targetId.toLowerCase())) {
        return btn;
      }
    }
  }
  
  if (action.targetSelector) {
    return document.querySelector(action.targetSelector);
  }
  
  return null;
}

/**
 * Create visual highlight effect on element
 */
function highlightElement(element: Element, color: string = 'hsl(var(--primary))'): () => void {
  const el = element as HTMLElement;
  const originalOutline = el.style.outline;
  const originalOutlineOffset = el.style.outlineOffset;
  const originalTransition = el.style.transition;
  
  el.style.transition = 'outline 0.2s ease-in-out';
  el.style.outline = `2px solid ${color}`;
  el.style.outlineOffset = '2px';
  
  // Add glow effect
  const originalBoxShadow = el.style.boxShadow;
  el.style.boxShadow = `0 0 20px ${color}`;
  
  return () => {
    el.style.outline = originalOutline;
    el.style.outlineOffset = originalOutlineOffset;
    el.style.boxShadow = originalBoxShadow;
    el.style.transition = originalTransition;
  };
}

/**
 * Scroll element into view with smooth animation
 */
function scrollToElement(element: Element): Promise<void> {
  return new Promise((resolve) => {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
    setTimeout(resolve, 300);
  });
}

/**
 * Execute click action
 */
async function executeClick(element: Element, options: UIAction['options']): Promise<void> {
  if (options?.scrollIntoView !== false) {
    await scrollToElement(element);
  }
  
  const cleanup = highlightElement(element);
  await new Promise(resolve => setTimeout(resolve, options?.delay || 200));
  
  (element as HTMLElement).click();
  
  await new Promise(resolve => setTimeout(resolve, 300));
  cleanup();
}

/**
 * Execute fill action for inputs
 */
async function executeFill(element: Element, value: string, options: UIAction['options']): Promise<void> {
  if (options?.scrollIntoView !== false) {
    await scrollToElement(element);
  }
  
  const cleanup = highlightElement(element);
  const input = element as HTMLInputElement | HTMLTextAreaElement;
  
  input.focus();
  await new Promise(resolve => setTimeout(resolve, 100));
  
  if (options?.animate) {
    // Type character by character
    input.value = '';
    for (const char of value) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  } else {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  await new Promise(resolve => setTimeout(resolve, 200));
  cleanup();
}

/**
 * Execute select action for dropdowns
 */
async function executeSelect(element: Element, value: string, options: UIAction['options']): Promise<void> {
  if (options?.scrollIntoView !== false) {
    await scrollToElement(element);
  }
  
  const cleanup = highlightElement(element);
  const select = element as HTMLSelectElement;
  
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  
  await new Promise(resolve => setTimeout(resolve, 200));
  cleanup();
}

/**
 * Execute navigation action
 */
async function executeNavigate(route: string): Promise<void> {
  // Use history API for SPA navigation
  window.history.pushState({}, '', route);
  window.dispatchEvent(new PopStateEvent('popstate'));
  
  await new Promise(resolve => setTimeout(resolve, 300));
}

/**
 * Execute toggle action (checkbox, switch)
 */
async function executeToggle(element: Element, options: UIAction['options']): Promise<void> {
  const cleanup = highlightElement(element);
  
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
    element.click();
  } else {
    // For custom toggles, try clicking
    (element as HTMLElement).click();
  }
  
  await new Promise(resolve => setTimeout(resolve, 200));
  cleanup();
}

/**
 * Execute a single UI action
 */
export async function executeAction(action: UIAction): Promise<ActionResult> {
  const timestamp = Date.now();
  
  try {
    // Navigation doesn't need an element
    if (action.type === 'navigate') {
      if (!action.value || typeof action.value !== 'string') {
        return {
          success: false,
          action,
          error: 'Navigate action requires a route value',
          timestamp,
        };
      }
      await executeNavigate(action.value);
      return { success: true, action, timestamp };
    }
    
    // Find the target element
    const element = findElement(action);
    if (!element) {
      return {
        success: false,
        action,
        error: `Element not found: ${action.targetId || action.targetSelector}`,
        timestamp,
      };
    }
    
    // Execute based on action type
    switch (action.type) {
      case 'click':
        await executeClick(element, action.options);
        break;
        
      case 'fill':
        if (action.value === undefined || action.value === null) {
          return {
            success: false,
            action,
            error: 'Fill action requires a value',
            timestamp,
          };
        }
        await executeFill(element, String(action.value), action.options);
        break;
        
      case 'select':
        if (!action.value) {
          return {
            success: false,
            action,
            error: 'Select action requires a value',
            timestamp,
          };
        }
        await executeSelect(element, String(action.value), action.options);
        break;
        
      case 'scroll':
        await scrollToElement(element);
        break;
        
      case 'hover':
        element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 200));
        break;
        
      case 'focus':
        (element as HTMLElement).focus();
        break;
        
      case 'clear':
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          element.value = '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
        break;
        
      case 'submit':
        const form = element.closest('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true }));
        } else {
          (element as HTMLElement).click();
        }
        break;
        
      case 'toggle':
        await executeToggle(element, action.options);
        break;
        
      default:
        return {
          success: false,
          action,
          error: `Unknown action type: ${action.type}`,
          timestamp,
        };
    }
    
    return { success: true, action, timestamp };
  } catch (error) {
    return {
      success: false,
      action,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp,
    };
  }
}

/**
 * Execute multiple actions in sequence
 */
export async function executeActions(
  actions: UIAction[],
  onProgress?: (index: number, result: ActionResult) => void
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  
  for (let i = 0; i < actions.length; i++) {
    const result = await executeAction(actions[i]);
    results.push(result);
    
    onProgress?.(i, result);
    
    // Stop on error unless explicitly configured to continue
    if (!result.success) {
      break;
    }
    
    // Delay between actions
    if (i < actions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  return results;
}
