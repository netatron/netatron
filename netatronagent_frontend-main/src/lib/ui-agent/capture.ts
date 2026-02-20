// ============================================================================
// UI STATE CAPTURE
// ============================================================================
// Utilities for capturing current UI state for AI context
// ============================================================================

import type { UIElement, UIState, PageContext } from './types';

/**
 * Selectors for interactive elements
 */
const INTERACTIVE_SELECTORS = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[data-interactive]',
].join(', ');

/**
 * Check if element is visible in viewport
 */
function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    parseFloat(style.opacity) > 0
  );
}

/**
 * Generate unique ID for element
 */
function generateElementId(element: Element, index: number): string {
  if (element.id) return element.id;
  if (element.getAttribute('data-testid')) {
    return `test-${element.getAttribute('data-testid')}`;
  }
  
  const tagName = element.tagName.toLowerCase();
  const text = element.textContent?.trim().slice(0, 20).replace(/\s+/g, '-') || '';
  
  return `${tagName}-${text || index}`.toLowerCase();
}

/**
 * Extract meaningful text from element
 */
function getElementText(element: Element): string | undefined {
  // For buttons/links, get direct text
  if (element.tagName === 'BUTTON' || element.tagName === 'A') {
    const text = element.textContent?.trim();
    if (text && text.length < 100) return text;
  }
  
  // For inputs, get label
  const id = element.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent?.trim();
  }
  
  // Get aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  
  // Get placeholder
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.placeholder || undefined;
  }
  
  return undefined;
}

/**
 * Capture single element data
 */
function captureElement(element: Element, index: number): UIElement {
  const rect = element.getBoundingClientRect();
  const isInput = element instanceof HTMLInputElement;
  const isTextarea = element instanceof HTMLTextAreaElement;
  const isSelect = element instanceof HTMLSelectElement;
  
  return {
    id: generateElementId(element, index),
    tagName: element.tagName.toLowerCase(),
    type: isInput ? element.type : undefined,
    text: getElementText(element),
    value: (isInput || isTextarea || isSelect) 
      ? (element as HTMLInputElement).value 
      : undefined,
    placeholder: (isInput || isTextarea) 
      ? (element as HTMLInputElement).placeholder 
      : undefined,
    className: element.className?.split(' ').slice(0, 5).join(' '),
    disabled: (element as HTMLButtonElement).disabled || false,
    ariaLabel: element.getAttribute('aria-label') || undefined,
    dataTestId: element.getAttribute('data-testid') || undefined,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    isVisible: isElementVisible(element),
    isInteractive: !((element as HTMLButtonElement).disabled),
  };
}

/**
 * Capture page context from URL and DOM
 */
export function capturePageContext(): PageContext {
  const pathname = window.location.pathname;
  
  // Try to get title from PageHeader or h1
  const headerTitle = document.querySelector('[data-page-title]')?.textContent
    || document.querySelector('h1')?.textContent
    || document.title;
  
  const headerDesc = document.querySelector('[data-page-description]')?.textContent;
  
  // Get module status if available
  const moduleStatus = document.querySelector('[data-module-status]')?.getAttribute('data-module-status');
  
  // Get active tab if any
  const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
  
  return {
    route: pathname,
    title: headerTitle?.trim() || 'Unknown Page',
    description: headerDesc?.trim(),
    moduleStatus,
    activeTab,
  };
}

/**
 * Capture form data from the page
 */
export function captureFormData(): Record<string, unknown> {
  const forms = document.querySelectorAll('form');
  const data: Record<string, unknown> = {};
  
  forms.forEach((form, formIndex) => {
    const formData = new FormData(form);
    const formKey = form.id || form.name || `form-${formIndex}`;
    
    const formValues: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      formValues[key] = value;
    });
    
    if (Object.keys(formValues).length > 0) {
      data[formKey] = formValues;
    }
  });
  
  // Also capture standalone inputs
  const standaloneInputs = document.querySelectorAll('input:not(form input), textarea:not(form textarea), select:not(form select)');
  standaloneInputs.forEach((input) => {
    const el = input as HTMLInputElement;
    const key = el.id || el.name || el.placeholder;
    if (key && el.value) {
      data[key] = el.value;
    }
  });
  
  return data;
}

/**
 * Capture complete UI state
 */
export function captureUIState(): UIState {
  // Get all interactive elements
  const elements = document.querySelectorAll(INTERACTIVE_SELECTORS);
  
  const capturedElements: UIElement[] = [];
  elements.forEach((element, index) => {
    if (isElementVisible(element)) {
      capturedElements.push(captureElement(element, index));
    }
  });
  
  return {
    timestamp: Date.now(),
    page: capturePageContext(),
    elements: capturedElements,
    formData: captureFormData(),
  };
}

/**
 * Generate human-readable summary of UI state for AI
 */
export function generateUIDescription(state: UIState): string {
  const { page, elements, formData } = state;
  
  let description = `## Current Page: ${page.title}\n`;
  description += `Route: ${page.route}\n`;
  
  if (page.description) {
    description += `Description: ${page.description}\n`;
  }
  
  if (page.moduleStatus) {
    description += `Module Status: ${page.moduleStatus}\n`;
  }
  
  if (page.activeTab) {
    description += `Active Tab: ${page.activeTab}\n`;
  }
  
  description += `\n## Interactive Elements (${elements.length}):\n`;
  
  // Group by type
  const buttons = elements.filter(e => e.tagName === 'button' || e.tagName === 'a');
  const inputs = elements.filter(e => ['input', 'textarea', 'select'].includes(e.tagName));
  
  if (buttons.length > 0) {
    description += `\n### Buttons/Links:\n`;
    buttons.slice(0, 15).forEach(btn => {
      const status = btn.disabled ? ' (disabled)' : '';
      description += `- [${btn.id}] "${btn.text || 'Unnamed'}"${status}\n`;
    });
    if (buttons.length > 15) {
      description += `... and ${buttons.length - 15} more\n`;
    }
  }
  
  if (inputs.length > 0) {
    description += `\n### Form Inputs:\n`;
    inputs.slice(0, 10).forEach(input => {
      const value = input.value ? ` = "${input.value}"` : '';
      description += `- [${input.id}] ${input.type || 'text'}: "${input.placeholder || input.text || 'No label'}"${value}\n`;
    });
  }
  
  if (Object.keys(formData).length > 0) {
    description += `\n### Current Form Values:\n`;
    description += JSON.stringify(formData, null, 2) + '\n';
  }
  
  return description;
}
