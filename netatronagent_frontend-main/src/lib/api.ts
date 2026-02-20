import type {
  AuthProfile,
  ChatSessionInfo,
  ChatSessionDetail,
  ChatStartResponse,
  ChatMessageResponse,
  JobResponse,
  JobRequestPayload,
  JobLogEntry,
  JobPreviewResponse,
  GoogleMapsTask,
  GoogleMapsStartPayload,
  GoogleMapsResultsPaged,
  KpoConfigResponse,
  KpoScrapePayload,
  KpoJobStartResponse,
  KpoJobStatus,
  KpoJobResultsResponse,
  DeepSearchJobRequest,
  EmailInvoiceConfig,
  EmailInvoiceConfigUpdate,
  EmailInvoiceRun,
  EmailInvoiceRunDetail,
  EmailInvoiceLog,
  EmailInvoiceTestResponse,
  EmailInvoiceProcessResponse,
  SavedDatasetSummary,
  SavedDatasetDetail,
  HealthResponse,
  EnrichRequest,
  EnrichResponse,
  Tenant,
  CreateTenantRequest,
  UpdateTenantRequest,
  DeployTenantResponse,
  TenantBillingReport,
  GCPCostReport,
  OpenAIUsageReport,
  LogEntry,
  LogsQueryParams,
  InfrastructureStatus,
} from "@/types/api";

// Use relative URL when frontend and backend are on same origin (unified container)
// Fallback to env var or localhost for development
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== "undefined" ? "" : "http://localhost:8000");

// Initialize from localStorage synchronously
let authToken: string | null = null;
try {
  if (typeof window !== "undefined") {
    authToken = localStorage.getItem("auth_token");
  }
} catch (e) {
  // localStorage might not be available
  console.warn("Failed to read auth_token from localStorage:", e);
}

export const setAuthToken = (token: string | null) => {
  authToken = token;
  try {
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("auth_token", token);
      } else {
        localStorage.removeItem("auth_token");
      }
    }
  } catch (e) {
    console.warn("Failed to write auth_token to localStorage:", e);
  }
};

export const getAuthToken = () => {
  // Always get fresh token from localStorage if available
  try {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("auth_token");
      if (stored) {
        authToken = stored;
        return stored;
      }
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  return authToken;
};

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Always get fresh token
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    // Handle 401 - clear token and redirect to login
    if (response.status === 401) {
      setAuthToken(null);
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("401 Unauthorized");
    }

    const raw = await response.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      message = parsed.detail || parsed.message || raw;
    } catch {
      message = raw || `Request failed with status ${response.status}`;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as T;
}

export const api = {
  // Health
  health: () => apiFetch<HealthResponse>("/api/health"),

  // Auth
  verifyAuth: (idToken: string, username?: string, password?: string) =>
    apiFetch<AuthProfile>("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ 
        id_token: idToken,
        username: username,
        password: password,
      }),
    }),

  // Chat
  listChatSessions: () => apiFetch<ChatSessionInfo[]>("/api/chat/sessions"),
  startChatSession: () =>
    apiFetch<ChatStartResponse>("/api/chat/start", { method: "POST" }),
  getChatSession: (sessionId: string) =>
    apiFetch<ChatSessionDetail>(`/api/chat/${sessionId}`),
  sendChatMessage: (sessionId: string, message: string) =>
    apiFetch<ChatMessageResponse>(`/api/chat/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  renameChatSession: (sessionId: string, title: string) =>
    apiFetch<ChatSessionInfo>(`/api/chat/${sessionId}/rename`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  deleteChatSession: (sessionId: string) =>
    apiFetch<{ status: string }>(`/api/chat/${sessionId}`, { method: "DELETE" }),

  // Jobs
  listJobs: () => apiFetch<JobResponse[]>("/api/jobs"),
  startJob: (payload: JobRequestPayload) =>
    apiFetch<JobResponse>("/api/jobs/start", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getJob: (jobId: string) => apiFetch<JobResponse>(`/api/jobs/${jobId}`),
  pauseJob: (jobId: string) =>
    apiFetch<JobResponse>(`/api/jobs/${jobId}/pause`, { method: "POST" }),
  resumeJob: (jobId: string) =>
    apiFetch<JobResponse>(`/api/jobs/${jobId}/resume`, { method: "POST" }),
  stopJob: (jobId: string) =>
    apiFetch<JobResponse>(`/api/jobs/${jobId}/stop`, { method: "POST" }),
  deleteJob: (jobId: string) =>
    apiFetch<void>(`/api/jobs/${jobId}`, { method: "DELETE" }),
  getJobLogs: (jobId: string) =>
    apiFetch<JobLogEntry[]>(`/api/jobs/${jobId}/logs`),
  getJobPreview: (jobId: string) =>
    apiFetch<JobPreviewResponse>(`/api/jobs/${jobId}/preview`),
  downloadJobCsv: async (jobId: string) => {
    const headers = new Headers();
    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/results.csv`, {
      headers,
    });
    if (!response.ok) {
      throw new Error("Failed to download CSV");
    }
    return response.blob();
  },

  // Google Maps
  listGoogleMapsTasks: () =>
    apiFetch<GoogleMapsTask[]>("/api/scrape/google-maps"),
  startGoogleMapsTask: (payload: GoogleMapsStartPayload) =>
    apiFetch<{ task_id: string }>("/api/scrape/google-maps/start", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getGoogleMapsTask: (taskId: string) =>
    apiFetch<GoogleMapsTask>(`/api/scrape/google-maps/${taskId}`),
  controlGoogleMapsTask: (taskId: string, action: "pause" | "resume" | "stop") =>
    apiFetch<GoogleMapsTask>(`/api/scrape/google-maps/${taskId}/control`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  getGoogleMapsResults: (taskId: string) =>
    apiFetch<Record<string, unknown>[]>(`/api/scrape/google-maps/${taskId}/results`),
  getGoogleMapsResultsPaged: (taskId: string, page = 1, perPage = 100) =>
    apiFetch<GoogleMapsResultsPaged>(
      `/api/scrape/google-maps/${taskId}/results-paged?page=${page}&per_page=${perPage}`
    ),
  getGoogleMapsPreview: (taskId: string, limit = 200) =>
    apiFetch<{ results: Record<string, unknown>[]; total: number }>(
      `/api/scrape/google-maps/${taskId}/preview?limit=${limit}`
    ),
  downloadGoogleMapsCsv: async (taskId: string) => {
    const headers = new Headers();
    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }
    const response = await fetch(
      `${API_BASE_URL}/api/scrape/google-maps/${taskId}/results.csv`,
      { headers }
    );
    if (!response.ok) {
      throw new Error("Failed to download CSV");
    }
    return response.blob();
  },

  // KPO
  getKpoConfig: (forceRefresh = false) =>
    apiFetch<KpoConfigResponse>(
      `/api/kpo/config${forceRefresh ? "?force_refresh=true" : ""}`
    ),
  startKpoJob: (payload: KpoScrapePayload) =>
    apiFetch<KpoJobStartResponse>("/api/kpo/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getKpoJobStatus: (jobId: string) =>
    apiFetch<KpoJobStatus>(`/api/kpo/jobs/${jobId}`),
  controlKpoJob: (jobId: string, action: "pause" | "resume" | "stop") =>
    apiFetch<KpoJobStatus>(`/api/kpo/jobs/${jobId}/control`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  getKpoJobResults: (jobId: string, page = 1, perPage = 100) =>
    apiFetch<KpoJobResultsResponse>(
      `/api/kpo/jobs/${jobId}/results?page=${page}&per_page=${perPage}`
    ),
  downloadKpoCsv: async (jobId: string) => {
    const headers = new Headers();
    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }
    const response = await fetch(
      `${API_BASE_URL}/api/kpo/jobs/${jobId}/results.csv`,
      { headers }
    );
    if (!response.ok) {
      throw new Error("Failed to download CSV");
    }
    return response.blob();
  },

  // Deep Search
  startDeepSearchJob: (payload: DeepSearchJobRequest) =>
    apiFetch<JobResponse>("/api/deep-search/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getDeepSearchJob: (jobId: string) =>
    apiFetch<JobResponse>(`/api/deep-search/jobs/${jobId}`),

  // Email Invoices
  listEmailInvoiceConfigs: () =>
    apiFetch<EmailInvoiceConfig[]>("/api/email-invoices/configs"),
  createEmailInvoiceConfig: (payload: EmailInvoiceConfigUpdate & { name: string; imap_password: string }) =>
    apiFetch<EmailInvoiceConfig>("/api/email-invoices/configs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getEmailInvoiceConfig: (configId: string) =>
    apiFetch<EmailInvoiceConfig>(`/api/email-invoices/configs/${configId}`),
  updateEmailInvoiceConfig: (configId: string, payload: EmailInvoiceConfigUpdate) =>
    apiFetch<EmailInvoiceConfig>(`/api/email-invoices/configs/${configId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteEmailInvoiceConfig: (configId: string) =>
    apiFetch<void>(`/api/email-invoices/configs/${configId}`, {
      method: "DELETE",
    }),
  startEmailInvoiceRun: (configId: string, options?: { monitoring?: boolean; mode?: string; process_from_last?: boolean }) =>
    apiFetch<{ run_id: string; status: string }>("/api/email-invoices/runs", {
      method: "POST",
      body: JSON.stringify({ 
        config_id: configId, 
        mode: options?.mode || "continuous",
        process_from_last: options?.process_from_last || false,
        monitoring: options?.monitoring || false,
      }),
    }),
  listEmailInvoiceRuns: (configId?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (configId) params.append("config_id", configId);
    params.append("limit", limit.toString());
    return apiFetch<{ runs: EmailInvoiceRun[]; total: number }>(`/api/email-invoices/runs?${params.toString()}`);
  },
  getEmailInvoiceRun: (runId: string) =>
    apiFetch<EmailInvoiceRunDetail>(`/api/email-invoices/runs/${runId}`),
  getEmailInvoiceRunLogs: (runId: string, since?: string) => {
    const url = since 
      ? `/api/email-invoices/runs/${runId}/logs?since=${encodeURIComponent(since)}`
      : `/api/email-invoices/runs/${runId}/logs`;
    return apiFetch<EmailInvoiceLog[]>(url);
  },
  pauseEmailInvoiceRun: (runId: string) =>
    apiFetch<EmailInvoiceRun>(`/api/email-invoices/runs/${runId}/pause`, {
      method: "POST",
    }),
  resumeEmailInvoiceRun: (runId: string) =>
    apiFetch<EmailInvoiceRun>(`/api/email-invoices/runs/${runId}/resume`, {
      method: "POST",
    }),
  stopEmailInvoiceRun: (runId: string) =>
    apiFetch<EmailInvoiceRun>(`/api/email-invoices/runs/${runId}/stop`, {
      method: "POST",
    }),
  testEmailInvoiceConfig: (configId: string) =>
    apiFetch<{ success: boolean; message: string; email_count: number; unread_count: number }>(`/api/email-invoices/configs/${configId}/test`, {
      method: "POST",
    }),

  // Email Invoices Files
  listEmailInvoiceFiles: (runId: string, path = "") =>
    apiFetch<{ path: string; entries: EmailInvoiceFileEntry[] }>(
      `/api/email-invoices/runs/${runId}/files${path ? `?path=${encodeURIComponent(path)}` : ""}`
    ),
  previewEmailInvoiceFile: (runId: string, path: string) =>
    apiFetch<{ path: string; kind: "csv" | "text" | "binary"; lines?: string[]; content?: string; size?: number }>(
      `/api/email-invoices/runs/${runId}/files/content?path=${encodeURIComponent(path)}`
    ),
  downloadEmailInvoiceFile: (runId: string, path: string) =>
    fetch(`${API_BASE_URL}/api/email-invoices/runs/${runId}/files/download?path=${encodeURIComponent(path)}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    }),
  archiveEmailInvoicePath: (runId: string, path: string) =>
    fetch(`${API_BASE_URL}/api/email-invoices/runs/${runId}/files/archive?path=${encodeURIComponent(path)}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    }),
  mkdirEmailInvoicePath: (runId: string, path: string, name: string) =>
    apiFetch<{ created: string }>(`/api/email-invoices/runs/${runId}/files/mkdir?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`, {
      method: "POST",
    }),
  deleteEmailInvoicePath: (runId: string, path: string) =>
    apiFetch<{ deleted: string }>(`/api/email-invoices/runs/${runId}/files?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    }),

  // Email Invoices Structure & Preview
  getEmailInvoiceStructure: (runId: string) =>
    apiFetch<{ months: Array<{ month: string; count: number }> }>(`/api/email-invoices/runs/${runId}/structure`),
  getEmailInvoicePreview: (runId: string) =>
    apiFetch<{ results: any[]; total: number }>(`/api/email-invoices/runs/${runId}/preview`),
  getEmailInvoiceFiles: (runId: string, path: string = "") =>
    apiFetch<{ path: string; entries: EmailInvoiceFileEntry[] }>(
      `/api/email-invoices/runs/${runId}/files${path ? `?path=${encodeURIComponent(path)}` : ""}`
    ),
  getEmailInvoicesByMonth: (runId: string, month: string) =>
    apiFetch<any[]>(`/api/email-invoices/runs/${runId}/invoices?month=${encodeURIComponent(month)}`),

  // Saved Datasets
  listSavedDatasets: () => apiFetch<SavedDatasetSummary[]>("/api/results/kpo"),
  saveDataset: (jobId: string, label?: string) =>
    apiFetch<SavedDatasetSummary>("/api/results/kpo", {
      method: "POST",
      body: JSON.stringify({ job_id: jobId, label }),
    }),
  getDataset: (datasetId: string) =>
    apiFetch<SavedDatasetDetail>(`/api/results/kpo/${datasetId}`),

  // Enrich
  enrichCompany: (company: Record<string, unknown>) =>
    apiFetch<EnrichResponse>("/api/enrich", {
      method: "POST",
      body: JSON.stringify({ company } as EnrichRequest),
    }),

  // Admin - Tenants
  listTenants: () => apiFetch<Tenant[]>("/api/v1/admin/tenants"),
  getTenant: (tenantId: string) =>
    apiFetch<Tenant>(`/api/v1/admin/tenants/${tenantId}`),
  createTenant: (payload: CreateTenantRequest) =>
    apiFetch<Tenant>("/api/v1/admin/tenants", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTenant: (tenantId: string, payload: UpdateTenantRequest) =>
    apiFetch<Tenant>(`/api/v1/admin/tenants/${tenantId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteTenant: (tenantId: string) =>
    apiFetch<void>(`/api/v1/admin/tenants/${tenantId}`, {
      method: "DELETE",
    }),
  deployTenantService: (tenantId: string) =>
    apiFetch<DeployTenantResponse>(`/api/v1/admin/tenants/${tenantId}/deploy`, {
      method: "POST",
    }),

  // Admin - Billing
  getTenantBilling: (tenantId: string, period: string = "current") =>
    apiFetch<TenantBillingReport>(
      `/api/v1/admin/billing/${tenantId}?period=${period}`
    ),
  refreshBilling: () =>
    apiFetch<void>("/api/v1/admin/billing/refresh", { method: "POST" }),
  getGCPCosts: (period: string = "current") =>
    apiFetch<GCPCostReport>(`/api/v1/admin/billing/gcp?period=${period}`),
  getOpenAIUsage: (period: string = "current") =>
    apiFetch<OpenAIUsageReport>(
      `/api/v1/admin/billing/openai?period=${period}`
    ),

  // Admin - Settings
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    apiFetch<{ success: boolean; message: string }>("/api/v1/admin/settings/password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    }),

  // Admin - Clients
  createClient: (payload: {
    company_name: string;
    username: string;
    password: string;
    email: string;
    domain_name: string;
    components: {
      maps_scraper: boolean;
      kpo: boolean;
      email_invoices: boolean;
      schedule: boolean;
      chat_agent: boolean;
    };
  }) =>
    apiFetch<{
      client_id: string;
      company_name: string;
      email: string;
      domain_name: string;
      service_url: string;
      components: {
        maps_scraper: boolean;
        kpo: boolean;
        email_invoices: boolean;
        schedule: boolean;
        chat_agent: boolean;
      };
      created_at: string;
    }>("/api/v1/admin/clients/create", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Admin - Logs
  getTenantLogs: (params: LogsQueryParams) => {
    const searchParams = new URLSearchParams();
    if (params.tenant_id) searchParams.append("tenant_id", params.tenant_id);
    if (params.service) searchParams.append("service", params.service);
    if (params.level) searchParams.append("level", params.level);
    if (params.search) searchParams.append("search", params.search);
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.start_time) searchParams.append("start_time", params.start_time);
    if (params.end_time) searchParams.append("end_time", params.end_time);
    return apiFetch<LogEntry[]>(
      `/api/v1/admin/logs?${searchParams.toString()}`
    );
  },

  // Admin - Infrastructure
  getInfrastructureStatus: () =>
    apiFetch<InfrastructureStatus>("/api/v1/admin/infrastructure/status"),
  
  // Dashboard
  getDashboardStats: () =>
    apiFetch<{
      active_jobs: number;
      completed_today: number;
      records_scraped_week: number;
      pending_tasks: number;
      recent_jobs: Array<{
        id: string;
        name: string;
        source: string;
        status: string;
        progress: number;
        createdAt: string;
      }>;
    }>("/api/v1/dashboard/stats"),

  // Tenant Components
  getTenantComponents: () =>
    apiFetch<{
      tenant_id: string;
      enabled_components: {
        maps_scraper?: boolean;
        kpo?: boolean;
        email_invoices?: boolean;
        schedule?: boolean;
        chat_agent?: boolean;
      };
      company_name?: string;
    }>("/api/v1/tenant/components"),

  // Admin - Tenants List
  listAllTenants: () =>
    apiFetch<Array<{
      tenant_id: string;
      enabled_components: {
        maps_scraper?: boolean;
        kpo?: boolean;
        email_invoices?: boolean;
        schedule?: boolean;
        chat_agent?: boolean;
      };
      company_name?: string;
    }>>("/api/v1/admin/tenants/list"),
  getCloudRunServices: () =>
    apiFetch<InfrastructureStatus["cloud_run_services"]>(
      "/api/v1/admin/infrastructure/cloudrun"
    ),
  getCloudSQLInstances: () =>
    apiFetch<InfrastructureStatus["cloud_sql_instances"]>(
      "/api/v1/admin/infrastructure/cloudsql"
    ),
};
