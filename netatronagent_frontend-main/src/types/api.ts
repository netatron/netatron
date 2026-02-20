// Netatron Agent API Types

// Auth Types
export interface AuthProfile {
  user_id: string;
  tenant_id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  is_admin?: boolean;
}

// Chat Types
export interface ChatSessionInfo {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  id: string;
  user_message: string;
  assistant_reply: Record<string, unknown> | null;
  logs: string[];
  created_at: string;
}

export interface ChatSessionDetail extends ChatSessionInfo {
  messages: ChatMessage[];
  plan: Record<string, unknown>[];
}

export interface ChatStartResponse {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageResponse {
  reply: string;
  logs: string[];
}

export interface AgentReply {
  status: "ok" | "need_clarification" | "error";
  user_summary?: string;
  actions_timeline?: ActionTimelineItem[];
  todos?: TodoItem[];
  results?: Record<string, unknown>[];
  suggested_next_questions?: string[];
}

export interface ActionTimelineItem {
  label: string;
  tool?: string;
  status?: "pending" | "in_progress" | "done" | "skipped" | "failed";
  details?: string;
}

export interface TodoItem {
  label: string;
  status?: "pending" | "in_progress" | "done";
}

// Job Types
export type JobSource = "maps" | "kpo" | "deep_search";
export type JobStatus = "queued" | "running" | "paused" | "completed" | "failed";

export interface JobResponse {
  id: string;
  source: JobSource;
  status: JobStatus;
  progress: number;
  desired_results?: number | null;
  storage_uri?: string | null;
  params: Record<string, unknown>;
  pause_requested: boolean;
  stop_requested: boolean;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRequestPayload {
  source: JobSource;
  params: Record<string, unknown>;
  desired_results?: number;
}

export interface JobLogEntry {
  id: string;
  message: string;
  created_at: string;
}

export interface JobPreviewResponse {
  results: Record<string, unknown>[];
  total: number;
}

export interface JobRowsResponse {
  id: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// Google Maps Scraper Types
export interface GoogleMapsTask {
  task_id: string;
  created_at: string;
  status: string;
  query_index: number;
  total_queries: number;
  results_count: number;
  paused: boolean;
  queries: string[];
  log: string[];
  desired_results?: number | null;
  stop_reason?: string | null;
}

export interface GoogleMapsStartPayload {
  queries: string[];
  imported_results?: {
    name?: string;
    address?: string;
    email?: string;
    phone?: string;
    website?: string;
    description?: string;
  }[];
  desired_results?: number;
}

export interface GoogleMapsResultsPaged {
  task_id: string;
  page: number;
  per_page: number;
  total: number;
  results: Record<string, unknown>[];
}

// KPO Scraper Types
export interface KpoCategory {
  category: string;
  mid?: string | null;
  url?: string | null;
}

export interface KpoConfigResponse {
  categories: KpoCategory[];
}

export interface KpoScrapePayload {
  categories: string[];
  select_all?: boolean;
  voivodeships?: string[];
  use_inference?: boolean;
  refresh_config?: boolean;
  limit?: number;
}

export interface KpoJobStartResponse {
  job_id: string;
  created_at: string;
}

export interface KpoJobStatus {
  job_id: string;
  created_at: string;
  status: string;
  error?: string | null;
  logs: string[];
  results_count: number;
  processed_records: number;
  total_records: number;
  categories_used: string[];
  voivodeships_filter: string[];
  limit?: number | null;
  paused: boolean;
}

export interface KpoJobResultsResponse {
  job_id: string;
  page: number;
  per_page: number;
  total: number;
  results: Record<string, unknown>[];
}

// Deep Search Types
export interface DeepSearchJobRequest {
  query: string;
  limit?: number;
}

// Email Invoices Types
export interface EmailInvoiceConfig {
  id: string;
  tenant_id: string;
  name: string;
  enabled: boolean;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_folder: string;
  google_drive_folder_id: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_check_at?: string | null;
}

export interface EmailInvoiceConfigUpdate {
  name?: string;
  imap_host?: string;
  imap_port?: number;
  imap_user?: string;
  imap_password?: string;
  imap_folder?: string;
  google_drive_folder_id?: string;
  settings?: Record<string, unknown>;
  enabled?: boolean;
}

export interface EmailInvoiceRun {
  id: string;
  config_id: string;
  status: "pending" | "running" | "completed" | "failed" | "paused" | "stopped";
  created_at: string;
  processed_count: number;
  total_count: number;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface EmailInvoiceLog {
  id: string;
  message: string;
  level: "info" | "warning" | "error";
  created_at: string;
}

export interface EmailInvoiceRunDetail extends EmailInvoiceRun {
  logs: EmailInvoiceLog[];
}

export interface EmailInvoiceTestResponse {
  run_id: string;
  success: boolean;
  message: string;
  logs: EmailInvoiceLog[];
}

export interface EmailInvoiceProcessResponse {
  run_id: string;
  message: string;
  estimated_emails: number;
}

// Saved Datasets Types
export interface SavedDatasetSummary {
  dataset_id: string;
  label: string;
  source: string;
  created_at: string;
  total_records: number;
  metadata: Record<string, unknown>;
}

export interface SavedDatasetDetail extends SavedDatasetSummary {
  records: Record<string, unknown>[];
}

// Health Check
export interface HealthResponse {
  status: "ok";
}

// Enrich
export interface EnrichRequest {
  company: Record<string, unknown>;
}

export interface EnrichResponse {
  result: Record<string, unknown>;
}

// Admin Types - Tenants
export interface Tenant {
  id: string;
  name: string;
  email: string;
  status: "active" | "suspended" | "deleted";
  enabled_modules: string[];
  cloud_run_service_name?: string | null;
  cloud_run_url?: string | null;
  service_account_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantRequest {
  name: string;
  email: string;
  modules: string[];
}

export interface UpdateTenantRequest {
  name?: string;
  email?: string;
  modules?: string[];
  status?: "active" | "suspended";
}

export interface DeployTenantResponse {
  tenant_id: string;
  service_name: string;
  service_url: string;
  status: "deployed" | "pending" | "failed";
  message?: string;
}

// Admin Types - Billing
export interface TenantBillingReport {
  tenant_id: string;
  tenant_name: string;
  period_start: string;
  period_end: string;
  gcp_cost: number;
  openai_cost: number;
  total_cost: number;
  gcp_breakdown: {
    cloud_run: number;
    cloud_sql: number;
    cloud_storage: number;
    networking: number;
    other: number;
  };
  openai_usage: {
    input_tokens: number;
    output_tokens: number;
    requests: number;
    cost: number;
  };
}

export interface GCPCostReport {
  total: number;
  previous_month: number;
  budget: number;
  services: Array<{
    name: string;
    cost: number;
    trend: number; // percentage change
  }>;
}

export interface OpenAIUsageReport {
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  tenants: Array<{
    tenant_id: string;
    tenant_name: string;
    modules: Record<string, {
      input_tokens: number;
      output_tokens: number;
      cost: number;
    }>;
    total_cost: number;
  }>;
}

// Admin Types - Logs
export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error";
  service: string;
  tenant_id?: string;
  tenant_name?: string;
  message: string;
}

export interface LogsQueryParams {
  tenant_id?: string;
  service?: string;
  level?: "info" | "warning" | "error";
  search?: string;
  limit?: number;
  start_time?: string;
  end_time?: string;
}

// Admin Types - Infrastructure
export interface InfrastructureStatus {
  cloud_run_services: CloudRunService[];
  cloud_sql_instances: CloudSQLInstance[];
  migrations: Migration[];
  jobs: CloudRunJob[];
  last_updated: string;
}

export interface CloudRunService {
  name: string;
  region: string;
  status: "running" | "stopped" | "error";
  instances: number;
  cpu_percent: number;
  memory_percent: number;
  requests_per_minute: number;
  avg_latency_ms: number;
  tenant_id?: string;
}

export interface CloudSQLInstance {
  name: string;
  type: string;
  tier: string;
  status: "running" | "stopped" | "error";
  storage: {
    used_gb: number;
    total_gb: number;
  };
  connections: {
    active: number;
    max: number;
  };
  region: string;
}

export interface Migration {
  version: string;
  name: string;
  status: "applied" | "pending" | "failed";
  applied_at?: string;
}

export interface CloudRunJob {
  name: string;
  status: "succeeded" | "running" | "failed" | "pending";
  last_run?: string;
  duration?: string;
  executions: number;
  error?: string;
}