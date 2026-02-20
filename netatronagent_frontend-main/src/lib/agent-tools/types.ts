// ============================================================================
// AGENT TOOLS - Type Definitions
// ============================================================================
// This file defines all tool types that the Netatron AI Agent can execute.
// These types mirror the OpenAPI schema that will be implemented in FastAPI.
// ============================================================================

/**
 * ============================================================================
 * TOOL CATEGORIES
 * ============================================================================
 * Tools are organized by functional category for better organization
 * and discoverability in the UI.
 */
export type ToolCategory = 
  | 'scraper'      // Google Maps, KPO, Deep Search operations
  | 'calendar'     // Schedule and event management
  | 'data'         // Data export, import, transformations
  | 'navigation'   // Page navigation and UI interactions
  | 'form'         // Form filling and submissions
  | 'system';      // System-level operations

/**
 * ============================================================================
 * TOOL EXECUTION STATUS
 * ============================================================================
 * Tracks the lifecycle of a tool execution for UI visualization.
 */
export type ToolExecutionStatus = 
  | 'pending'      // Queued for execution
  | 'preparing'    // Gathering parameters
  | 'executing'    // Currently running
  | 'completed'    // Successfully finished
  | 'error'        // Failed with error
  | 'cancelled';   // User cancelled

/**
 * ============================================================================
 * BASE TOOL DEFINITION
 * ============================================================================
 * All tools extend this base interface.
 * 
 * @openapi
 * components:
 *   schemas:
 *     BaseTool:
 *       type: object
 *       required: [id, name, category]
 *       properties:
 *         id: { type: string, description: "Unique tool identifier" }
 *         name: { type: string, description: "Human-readable tool name" }
 *         description: { type: string, description: "What the tool does" }
 *         category: { $ref: '#/components/schemas/ToolCategory' }
 */
export interface BaseTool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
}

/**
 * ============================================================================
 * SCRAPER TOOLS
 * ============================================================================
 */

/**
 * Google Maps Scraper - Execute search queries
 * 
 * @openapi
 * components:
 *   schemas:
 *     GoogleMapsSearchTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [query]
 *               properties:
 *                 query: { type: string, description: "Search query (e.g., 'restaurants in Warsaw')" }
 *                 maxRecords: { type: integer, minimum: 1, maximum: 500, default: 100 }
 *                 categories: { type: array, items: { type: string } }
 *                 location: { type: string, description: "Geographic location filter" }
 *                 radius: { type: integer, description: "Search radius in km" }
 */
export interface GoogleMapsSearchParams {
  query: string;
  maxRecords?: number;
  categories?: string[];
  location?: string;
  radius?: number;
}

export interface GoogleMapsSearchTool extends BaseTool {
  category: 'scraper';
  params: GoogleMapsSearchParams;
}

/**
 * KPO Scraper - Polish company registry search
 * 
 * @openapi
 * components:
 *   schemas:
 *     KPOSearchTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [query]
 *               properties:
 *                 query: { type: string, description: "Company name or NIP number" }
 *                 maxRecords: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *                 includeFinancials: { type: boolean, default: false }
 *                 region: { type: string, description: "Voivodeship filter" }
 */
export interface KPOSearchParams {
  query: string;
  maxRecords?: number;
  includeFinancials?: boolean;
  region?: string;
}

export interface KPOSearchTool extends BaseTool {
  category: 'scraper';
  params: KPOSearchParams;
}

/**
 * Deep Search - Advanced web research
 * 
 * @openapi
 * components:
 *   schemas:
 *     DeepSearchTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [query]
 *               properties:
 *                 query: { type: string, description: "Research query" }
 *                 depth: { type: string, enum: [shallow, medium, deep], default: medium }
 *                 maxSources: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *                 domains: { type: array, items: { type: string }, description: "Restrict to specific domains" }
 */
export interface DeepSearchParams {
  query: string;
  depth?: 'shallow' | 'medium' | 'deep';
  maxSources?: number;
  domains?: string[];
}

export interface DeepSearchTool extends BaseTool {
  category: 'scraper';
  params: DeepSearchParams;
}

/**
 * ============================================================================
 * CALENDAR TOOLS
 * ============================================================================
 */

/**
 * Calendar Event Creation
 * 
 * @openapi
 * components:
 *   schemas:
 *     CreateCalendarEventTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [title, startTime]
 *               properties:
 *                 title: { type: string }
 *                 description: { type: string }
 *                 startTime: { type: string, format: date-time }
 *                 endTime: { type: string, format: date-time }
 *                 allDay: { type: boolean, default: false }
 *                 location: { type: string }
 *                 attendees: { type: array, items: { type: string, format: email } }
 *                 reminders: { type: array, items: { type: integer, description: "Minutes before event" } }
 */
export interface CreateCalendarEventParams {
  title: string;
  description?: string;
  startTime: string; // ISO 8601 format
  endTime?: string;
  allDay?: boolean;
  location?: string;
  attendees?: string[];
  reminders?: number[];
}

export interface CreateCalendarEventTool extends BaseTool {
  category: 'calendar';
  params: CreateCalendarEventParams;
}

/**
 * Calendar Event Update/Reschedule
 * 
 * @openapi
 * components:
 *   schemas:
 *     UpdateCalendarEventTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [eventId]
 *               properties:
 *                 eventId: { type: string }
 *                 title: { type: string }
 *                 description: { type: string }
 *                 startTime: { type: string, format: date-time }
 *                 endTime: { type: string, format: date-time }
 *                 location: { type: string }
 */
export interface UpdateCalendarEventParams {
  eventId: string;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
}

export interface UpdateCalendarEventTool extends BaseTool {
  category: 'calendar';
  params: UpdateCalendarEventParams;
}

/**
 * Calendar Event Deletion
 * 
 * @openapi
 * components:
 *   schemas:
 *     DeleteCalendarEventTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [eventId]
 *               properties:
 *                 eventId: { type: string }
 *                 notifyAttendees: { type: boolean, default: true }
 */
export interface DeleteCalendarEventParams {
  eventId: string;
  notifyAttendees?: boolean;
}

export interface DeleteCalendarEventTool extends BaseTool {
  category: 'calendar';
  params: DeleteCalendarEventParams;
}

/**
 * ============================================================================
 * DATA TOOLS
 * ============================================================================
 */

/**
 * Export Results to CSV
 * 
 * @openapi
 * components:
 *   schemas:
 *     ExportResultsTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [jobId]
 *               properties:
 *                 jobId: { type: string, description: "Job ID to export" }
 *                 format: { type: string, enum: [csv, xlsx, json], default: csv }
 *                 columns: { type: array, items: { type: string }, description: "Columns to include" }
 *                 filters: { type: object, description: "Row filters to apply" }
 */
export interface ExportResultsParams {
  jobId: string;
  format?: 'csv' | 'xlsx' | 'json';
  columns?: string[];
  filters?: Record<string, unknown>;
}

export interface ExportResultsTool extends BaseTool {
  category: 'data';
  params: ExportResultsParams;
}

/**
 * Download File
 * 
 * @openapi
 * components:
 *   schemas:
 *     DownloadFileTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [fileUrl]
 *               properties:
 *                 fileUrl: { type: string, format: uri }
 *                 filename: { type: string, description: "Override filename" }
 */
export interface DownloadFileParams {
  fileUrl: string;
  filename?: string;
}

export interface DownloadFileTool extends BaseTool {
  category: 'data';
  params: DownloadFileParams;
}

/**
 * Import CSV Data
 * 
 * @openapi
 * components:
 *   schemas:
 *     ImportCSVTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [targetModule]
 *               properties:
 *                 targetModule: { type: string, enum: [google_maps, kpo, deep_search] }
 *                 columnMapping: { type: object, description: "Map CSV columns to expected fields" }
 *                 maxRows: { type: integer, default: 200 }
 */
export interface ImportCSVParams {
  targetModule: 'google_maps' | 'kpo' | 'deep_search';
  columnMapping?: Record<string, string>;
  maxRows?: number;
}

export interface ImportCSVTool extends BaseTool {
  category: 'data';
  params: ImportCSVParams;
}

/**
 * ============================================================================
 * FORM TOOLS
 * ============================================================================
 */

/**
 * Fill Form Field
 * 
 * @openapi
 * components:
 *   schemas:
 *     FillFormFieldTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [fieldId, value]
 *               properties:
 *                 fieldId: { type: string, description: "Form field identifier" }
 *                 value: { type: string, description: "Value to fill" }
 *                 fieldType: { type: string, enum: [input, textarea, select, checkbox, radio] }
 */
export interface FillFormFieldParams {
  fieldId: string;
  value: string | number | boolean;
  fieldType?: 'input' | 'textarea' | 'select' | 'checkbox' | 'radio';
}

export interface FillFormFieldTool extends BaseTool {
  category: 'form';
  params: FillFormFieldParams;
}

/**
 * Select Option
 * 
 * @openapi
 * components:
 *   schemas:
 *     SelectOptionTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [selectId, value]
 *               properties:
 *                 selectId: { type: string }
 *                 value: { type: string }
 *                 multiple: { type: boolean, default: false }
 */
export interface SelectOptionParams {
  selectId: string;
  value: string | string[];
  multiple?: boolean;
}

export interface SelectOptionTool extends BaseTool {
  category: 'form';
  params: SelectOptionParams;
}

/**
 * Set Record Count
 * 
 * @openapi
 * components:
 *   schemas:
 *     SetRecordCountTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [module, count]
 *               properties:
 *                 module: { type: string, enum: [google_maps, kpo, deep_search] }
 *                 count: { type: integer, minimum: 1, maximum: 500 }
 */
export interface SetRecordCountParams {
  module: 'google_maps' | 'kpo' | 'deep_search';
  count: number;
}

export interface SetRecordCountTool extends BaseTool {
  category: 'form';
  params: SetRecordCountParams;
}

/**
 * ============================================================================
 * NAVIGATION TOOLS
 * ============================================================================
 */

/**
 * Navigate to Page
 * 
 * @openapi
 * components:
 *   schemas:
 *     NavigateToPageTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [route]
 *               properties:
 *                 route: { type: string, description: "Target route path" }
 *                 queryParams: { type: object, description: "URL query parameters" }
 */
export interface NavigateToPageParams {
  route: string;
  queryParams?: Record<string, string>;
}

export interface NavigateToPageTool extends BaseTool {
  category: 'navigation';
  params: NavigateToPageParams;
}

/**
 * Click Element
 * 
 * @openapi
 * components:
 *   schemas:
 *     ClickElementTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [elementId]
 *               properties:
 *                 elementId: { type: string }
 *                 elementSelector: { type: string, description: "CSS selector fallback" }
 *                 waitForNavigation: { type: boolean, default: false }
 */
export interface ClickElementParams {
  elementId?: string;
  elementSelector?: string;
  waitForNavigation?: boolean;
}

export interface ClickElementTool extends BaseTool {
  category: 'navigation';
  params: ClickElementParams;
}

/**
 * ============================================================================
 * SYSTEM TOOLS
 * ============================================================================
 */

/**
 * Start Module Job
 * 
 * @openapi
 * components:
 *   schemas:
 *     StartModuleJobTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [module]
 *               properties:
 *                 module: { type: string, enum: [google_maps, kpo, deep_search, email_invoices] }
 */
export interface StartModuleJobParams {
  module: 'google_maps' | 'kpo' | 'deep_search' | 'email_invoices';
}

export interface StartModuleJobTool extends BaseTool {
  category: 'system';
  params: StartModuleJobParams;
}

/**
 * Stop Module Job
 * 
 * @openapi
 * components:
 *   schemas:
 *     StopModuleJobTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [module]
 *               properties:
 *                 module: { type: string, enum: [google_maps, kpo, deep_search, email_invoices] }
 *                 jobId: { type: string, description: "Specific job to stop" }
 */
export interface StopModuleJobParams {
  module: 'google_maps' | 'kpo' | 'deep_search' | 'email_invoices';
  jobId?: string;
}

export interface StopModuleJobTool extends BaseTool {
  category: 'system';
  params: StopModuleJobParams;
}

/**
 * Pause/Resume Module Job
 * 
 * @openapi
 * components:
 *   schemas:
 *     PauseResumeJobTool:
 *       allOf:
 *         - $ref: '#/components/schemas/BaseTool'
 *         - type: object
 *           properties:
 *             params:
 *               type: object
 *               required: [module, action]
 *               properties:
 *                 module: { type: string, enum: [google_maps, kpo, deep_search, email_invoices] }
 *                 action: { type: string, enum: [pause, resume] }
 *                 jobId: { type: string }
 */
export interface PauseResumeJobParams {
  module: 'google_maps' | 'kpo' | 'deep_search' | 'email_invoices';
  action: 'pause' | 'resume';
  jobId?: string;
}

export interface PauseResumeJobTool extends BaseTool {
  category: 'system';
  params: PauseResumeJobParams;
}

/**
 * ============================================================================
 * TOOL EXECUTION TYPES
 * ============================================================================
 */

/**
 * Union type of all available tools
 */
export type AgentTool =
  | GoogleMapsSearchTool
  | KPOSearchTool
  | DeepSearchTool
  | CreateCalendarEventTool
  | UpdateCalendarEventTool
  | DeleteCalendarEventTool
  | ExportResultsTool
  | DownloadFileTool
  | ImportCSVTool
  | FillFormFieldTool
  | SelectOptionTool
  | SetRecordCountTool
  | NavigateToPageTool
  | ClickElementTool
  | StartModuleJobTool
  | StopModuleJobTool
  | PauseResumeJobTool;

/**
 * Tool execution instance with status tracking
 * 
 * @openapi
 * components:
 *   schemas:
 *     ToolExecution:
 *       type: object
 *       required: [id, tool, status, startedAt]
 *       properties:
 *         id: { type: string, format: uuid }
 *         tool: { $ref: '#/components/schemas/AgentTool' }
 *         status: { $ref: '#/components/schemas/ToolExecutionStatus' }
 *         startedAt: { type: string, format: date-time }
 *         completedAt: { type: string, format: date-time }
 *         progress: { type: number, minimum: 0, maximum: 100 }
 *         result: { type: object, description: "Tool execution result" }
 *         error: { type: string, description: "Error message if failed" }
 */
export interface ToolExecution {
  id: string;
  tool: AgentTool;
  status: ToolExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  progress?: number;
  result?: unknown;
  error?: string;
}

/**
 * Agent response containing tool executions
 * 
 * @openapi
 * components:
 *   schemas:
 *     AgentToolResponse:
 *       type: object
 *       required: [message, shouldExecute]
 *       properties:
 *         message: { type: string, description: "Agent's text response" }
 *         reasoning: { type: string, description: "Agent's reasoning process" }
 *         tools: { type: array, items: { $ref: '#/components/schemas/AgentTool' } }
 *         shouldExecute: { type: boolean, description: "Whether tools should be executed" }
 */
export interface AgentToolResponse {
  message: string;
  reasoning?: string;
  tools?: AgentTool[];
  shouldExecute: boolean;
}
