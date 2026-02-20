from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AuthVerifyRequest(BaseModel):
    id_token: str
    username: Optional[str] = None
    password: Optional[str] = None


class AuthUserProfile(BaseModel):
    user_id: str
    tenant_id: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    is_admin: bool = False


class ImportRecord(BaseModel):
    name: str | None = None
    address: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    description: str | None = None
    access_status: str | None = None
    access_message: str | None = None


class ScrapeConfig(BaseModel):
    queries: List[str] = Field(default_factory=list)
    imported_results: List[ImportRecord] = Field(default_factory=list)
    desired_results: int | None = Field(default=None, ge=1, le=1000)


class TaskResponse(BaseModel):
    task_id: str


class TaskStatus(BaseModel):
    task_id: str
    created_at: str
    status: str
    query_index: int
    total_queries: int
    results_count: int
    paused: bool
    queries: List[str]
    log: List[str]
    desired_results: int | None = None
    stop_reason: str | None = None


class TaskControlRequest(BaseModel):
    action: str


class EnrichRequest(BaseModel):
    company: dict


class EnrichResponse(BaseModel):
    result: dict


class KpoConfigEntry(BaseModel):
    category: str
    mid: str | None = None
    url: str | None = None


class KpoConfigResponse(BaseModel):
    categories: List[KpoConfigEntry]


class KpoScrapeRequest(BaseModel):
    categories: List[str] = Field(default_factory=list)
    select_all: bool = False
    voivodeships: List[str] = Field(default_factory=list)
    use_inference: bool = True
    refresh_config: bool = False
    limit: int | None = Field(default=None, ge=1, le=500)


class KpoScrapeResponse(BaseModel):
    results: List[dict]
    categories_used: List[str]
    voivodeships_filter: List[str]
    total_records: int
    logs: List[str] | None = None


class KpoLocalFile(BaseModel):
    name: str
    path: str
    records: int
    size: int
    modified: str


class KpoLocalFilesResponse(BaseModel):
    files: List[KpoLocalFile]


class KpoLoadRequest(BaseModel):
    files: List[str] = Field(default_factory=list)


class KpoLoadResponse(BaseModel):
    records: List[dict]


class KpoEnrichRequest(BaseModel):
    records: List[dict]


class KpoExportRequest(BaseModel):
    records: List[dict]
    prefix: str | None = None


class KpoExportResponse(BaseModel):
    filename: str


class ChatStartResponse(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str


class ChatMessageRequest(BaseModel):
    message: str


class ChatMessageResponse(BaseModel):
    reply: str
    logs: List[str]


class ChatTurn(BaseModel):
    id: str
    user_message: str
    assistant_reply: dict | None = None
    logs: List[str] = Field(default_factory=list)
    created_at: str


class ChatSessionInfo(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int


class ChatSessionDetail(BaseModel):
    session_id: str
    title: str
    created_at: str
    updated_at: str
    messages: List[ChatTurn] = Field(default_factory=list)
    plan: List[dict] = Field(default_factory=list)


class ChatRenameRequest(BaseModel):
    title: str


# UI Agent Schemas - High-end agent with UI awareness
class ActionOptions(BaseModel):
    delay: Optional[int] = 200
    animate: Optional[bool] = True
    scrollIntoView: Optional[bool] = True


class UIAction(BaseModel):
    type: str  # click, fill, select, scroll, navigate, hover, focus, clear, submit, toggle
    targetId: Optional[str] = None
    targetSelector: Optional[str] = None
    value: Optional[str] = None
    options: Optional[ActionOptions] = None


class ReasoningStep(BaseModel):
    step_number: int
    thought: str
    reasoning: str
    confidence: float


class ReasoningChain(BaseModel):
    steps: List[ReasoningStep] = Field(default_factory=list)
    final_conclusion: Optional[str] = None
    overall_confidence: float = 0.0
    reasoning_type: str = "standard"


class UICommandRequest(BaseModel):
    message: str
    ui_context: str
    current_route: str
    session_id: Optional[str] = None
    execute_actions: bool = True
    screenshot_base64: Optional[str] = None  # Base64 encoded screenshot for visual understanding
    chat_history: Optional[List[Dict[str, str]]] = None
    enable_reasoning: bool = True
    enable_vision: bool = True


class UICommandResponse(BaseModel):
    message: str
    reasoning: Optional[str] = None
    reasoning_chain: Optional[ReasoningChain] = None
    actions: Optional[List[UIAction]] = None
    shouldExecute: bool = False
    confidence: Optional[float] = None
    visual_insights: Optional[Dict[str, Any]] = None
    visual_summary: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# Desktop Agent Schemas
class DesktopCommandRequest(BaseModel):
    message: str
    scope: str = "desktop"  # "desktop" | "browser" | "application"
    desktop_context: Optional[Dict[str, Any]] = None
    screenshot_base64: Optional[str] = None
    session_id: Optional[str] = None
    chat_history: Optional[List[Dict[str, str]]] = None
    enable_reasoning: bool = True
    enable_vision: bool = True


class DesktopContextResponse(BaseModel):
    platform: str
    browser_pages: List[Dict[str, Any]] = Field(default_factory=list)
    desktop_automation_available: bool
    playwright_available: bool


# Memory/RAG Schemas
class MemoryStatisticsResponse(BaseModel):
    total_memories: int
    memories_by_route: Dict[str, int]
    successful_memories: int
    embeddings_available: bool
    storage_path: str


class ExportRecordsRequest(BaseModel):
    records: List[dict]
    prefix: str | None = None


class ExportRecordsResponse(BaseModel):
    filename: str


class MapsTaskResultsResponse(BaseModel):
    task_id: str
    page: int
    per_page: int
    total: int
    results: List[dict]


class KpoJobStartResponse(BaseModel):
    job_id: str
    created_at: str


class KpoJobStatus(BaseModel):
    job_id: str
    created_at: str
    status: str
    error: Optional[str] = None
    logs: List[str] = Field(default_factory=list)
    results_count: int
    processed_records: int
    total_records: int
    categories_used: List[str] = Field(default_factory=list)
    voivodeships_filter: List[str] = Field(default_factory=list)
    limit: int | None = None
    paused: bool = False


class KpoJobResultsResponse(BaseModel):
    job_id: str
    page: int
    per_page: int
    total: int
    results: List[dict]

class KpoJobControlRequest(BaseModel):
    action: str


class SaveDatasetRequest(BaseModel):
    job_id: str
    label: Optional[str] = None


class SavedDatasetSummary(BaseModel):
    dataset_id: str
    label: str
    source: str
    created_at: str
    total_records: int
    metadata: Dict


class SavedDatasetDetail(SavedDatasetSummary):
    records: List[dict]


class JobStartRequest(BaseModel):
    source: str
    params: Dict[str, Any] = Field(default_factory=dict)
    desired_results: int | None = Field(default=None, ge=1, le=1000)


class DeepSearchJobRequest(BaseModel):
    query: str = Field(..., min_length=3)
    limit: int | None = Field(default=None, ge=1, le=200)


class JobResponse(BaseModel):
    id: str
    source: str
    status: str
    progress: float
    desired_results: int | None
    storage_uri: Optional[str]
    params: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    pause_requested: bool
    stop_requested: bool
    last_error: Optional[str]

    class Config:
        orm_mode = True


class JobLogEntry(BaseModel):
    id: str
    message: str
    created_at: datetime

    class Config:
        orm_mode = True


class JobResultEntry(BaseModel):
    id: str
    kind: str
    uri: str
    row_count: Optional[int]
    created_at: datetime

    class Config:
        orm_mode = True


class JobResultRowEntry(BaseModel):
    id: str
    payload: Dict[str, Any]
    created_at: datetime

    class Config:
        orm_mode = True


class JobResultDeleteRequest(BaseModel):
    ids: Optional[List[str]] = None
    delete_all: bool = False


class JobResultDeleteResponse(BaseModel):
    deleted: int
    remaining: int


class EmailInvoiceConfigResponse(BaseModel):
    enabled: bool = True
    settings: Dict[str, Any] = Field(default_factory=dict)


class EmailInvoiceConfigCreate(BaseModel):
    name: str
    imap_host: str
    imap_port: int = 993
    imap_user: str
    imap_password: str
    imap_folder: str = "INBOX"
    settings: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class EmailInvoiceConfigUpdate(BaseModel):
    name: Optional[str] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_user: Optional[str] = None
    imap_password: Optional[str] = None
    imap_folder: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class EmailInvoiceConfigDetail(BaseModel):
    id: str
    tenant_id: str
    name: str
    enabled: bool
    imap_host: str
    imap_port: int
    imap_user: str
    imap_folder: str
    settings: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    last_check_at: Optional[datetime] = None
    last_processed_email_date: Optional[datetime] = None
    last_processed_email_date: Optional[datetime] = None


class EmailInvoiceLog(BaseModel):
    id: str
    run_id: str
    message: str
    level: str  # info, success, warning, error, debug
    created_at: datetime


class EmailInvoiceRun(BaseModel):
    id: str
    config_id: str
    status: str
    created_at: datetime
    processed_count: int = 0
    total_count: int = 0
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class EmailInvoiceRunsResponse(BaseModel):
    runs: List[EmailInvoiceRun]
    total: int


class EmailInvoiceRunStartRequest(BaseModel):
    config_id: str
    mode: Optional[str] = "continuous"  # "continuous" (monitoring), "all" (process all), or "new" (process new only)
    process_from_last: bool = False  # Start from last processed email date
    monitoring: bool = False  # Enable continuous monitoring mode


class EmailInvoiceRunStartResponse(BaseModel):
    run_id: str
    status: str


class EmailInvoiceStatistics(BaseModel):
    """Statistics for invoice distribution"""
    vendor: str
    count: int
    total_amount: float


class EmailInvoiceStatisticsResponse(BaseModel):
    """Response for invoice statistics endpoint"""
    period: str  # "all" or "YYYY-MM" format
    total_invoices: int
    total_amount: float
    by_vendor: List[EmailInvoiceStatistics]


class EmailInvoiceRunDetail(BaseModel):
    id: str
    config_id: str
    status: str
    created_at: datetime
    processed_count: int = 0
    total_count: int = 0
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    logs: List[EmailInvoiceLog] = []


# Admin API Schemas
class TenantResponse(BaseModel):
    id: str
    name: str
    email: str
    status: str  # active, suspended, deleted
    enabled_modules: List[str] = Field(default_factory=list)
    cloud_run_service_name: Optional[str] = None
    cloud_run_url: Optional[str] = None
    service_account_email: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class CreateTenantRequest(BaseModel):
    name: str
    email: str
    modules: List[str] = Field(default_factory=list)


class UpdateTenantRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    modules: Optional[List[str]] = None
    status: Optional[str] = None  # active, suspended


class DeployTenantResponse(BaseModel):
    tenant_id: str
    service_name: str
    service_url: str
    status: str  # deployed, pending, failed
    message: Optional[str] = None


class TenantBillingReport(BaseModel):
    tenant_id: str
    tenant_name: str
    period_start: datetime
    period_end: datetime
    gcp_cost: float
    openai_cost: float
    total_cost: float
    gcp_breakdown: Dict[str, float]  # cloud_run, cloud_sql, cloud_storage, networking, other
    openai_usage: Dict[str, Any]  # input_tokens, output_tokens, requests, cost


class GCPCostReport(BaseModel):
    total: float
    previous_month: float
    budget: float
    services: List[Dict[str, Any]]  # name, cost, trend


class OpenAIUsageReport(BaseModel):
    total_cost: float
    total_input_tokens: int
    total_output_tokens: int
    tenants: List[Dict[str, Any]]  # tenant_id, tenant_name, modules, total_cost


class LogEntry(BaseModel):
    id: str
    timestamp: datetime
    level: str  # info, warning, error
    service: str
    tenant_id: Optional[str] = None
    tenant_name: Optional[str] = None
    message: str


class CloudRunService(BaseModel):
    name: str
    region: str
    status: str  # running, stopped, error
    instances: int
    cpu_percent: float
    memory_percent: float
    requests_per_minute: int
    avg_latency_ms: int
    tenant_id: Optional[str] = None


class CloudSQLInstance(BaseModel):
    name: str
    type: str
    tier: str
    status: str  # running, stopped, error
    storage: Dict[str, float]  # used_gb, total_gb
    connections: Dict[str, int]  # active, max
    region: str


class Migration(BaseModel):
    version: str
    name: str
    status: str  # applied, pending, failed
    applied_at: Optional[datetime] = None


class CloudRunJob(BaseModel):
    name: str
    status: str  # succeeded, running, failed, pending
    last_run: Optional[datetime] = None
    duration: Optional[str] = None
    executions: int
    error: Optional[str] = None


class InfrastructureStatus(BaseModel):
    cloud_run_services: List[CloudRunService]
    cloud_sql_instances: List[CloudSQLInstance]
    migrations: List[Migration]
    jobs: List[CloudRunJob]
    last_updated: datetime


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class ChangePasswordResponse(BaseModel):
    success: bool
    message: str


class ClientComponent(BaseModel):
    """Available components for a client instance"""
    maps_scraper: bool = True
    kpo: bool = True
    email_invoices: bool = True
    schedule: bool = True
    chat_agent: bool = True


class CreateClientRequest(BaseModel):
    """Request to create a new client (tenant) instance"""
    company_name: str
    username: str
    password: str
    email: str
    domain_name: str  # e.g., "client-name" -> client-name-{project}.run.app
    components: ClientComponent


class DashboardStats(BaseModel):
    """Dashboard statistics"""
    active_jobs: int
    completed_today: int
    records_scraped_week: int
    pending_tasks: int
    recent_jobs: List[Dict[str, Any]]  # id, name, source, status, progress, createdAt


class TokenUsageReport(BaseModel):
    """Token usage across all APIs"""
    openai: Dict[str, Any]  # input_tokens, output_tokens, cost
    gemini: Dict[str, Any]  # input_tokens, output_tokens, cost
    google_cse: Dict[str, Any]  # queries, cost
    google_maps: Dict[str, Any]  # queries, cost
    total_cost: float


class ClientResponse(BaseModel):
    """Response after creating a new client"""
    client_id: str
    company_name: str
    email: str
    domain_name: str
    service_url: str
    components: ClientComponent
    created_at: datetime


class TenantComponentsResponse(BaseModel):
    """Response with enabled components for a tenant"""
    tenant_id: str
    enabled_components: Dict[str, bool]
    company_name: Optional[str] = None