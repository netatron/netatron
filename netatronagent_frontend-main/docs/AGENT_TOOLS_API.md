# Netatron Agent Tools - API Documentation

> Backend implementation guide for FastAPI/OpenAPI Python

## Overview

This document describes the complete API specification for Netatron AI Agent tools. These tools allow the agent to execute complex UI actions, interact with modules, and manage data.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend UI   │────▶│   Agent Server   │────▶│   Tool Registry │
│   (React/TS)    │◀────│   (FastAPI)      │◀────│   (Handlers)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  WebSocket Hub   │
                        │  (Real-time)     │
                        └──────────────────┘
```

## Base Models

### Tool Categories

```python
from enum import Enum

class ToolCategory(str, Enum):
    SCRAPER = "scraper"       # Google Maps, KPO, Deep Search
    CALENDAR = "calendar"     # Schedule management
    DATA = "data"             # Export, import, transformations
    NAVIGATION = "navigation" # Page navigation, UI interactions
    FORM = "form"             # Form filling, selections
    SYSTEM = "system"         # Module control (start/stop/pause)
```

### Execution Status

```python
class ToolExecutionStatus(str, Enum):
    PENDING = "pending"       # Queued
    PREPARING = "preparing"   # Gathering params
    EXECUTING = "executing"   # Running
    COMPLETED = "completed"   # Success
    ERROR = "error"           # Failed
    CANCELLED = "cancelled"   # User cancelled
```

---

## Tool Definitions

### 1. Scraper Tools

#### Google Maps Search

```python
from pydantic import BaseModel, Field
from typing import Optional, List

class GoogleMapsSearchParams(BaseModel):
    """Parameters for Google Maps scraping"""
    query: str = Field(..., description="Search query (e.g., 'restaurants in Warsaw')")
    max_records: int = Field(default=100, ge=1, le=500, description="Maximum records to fetch")
    categories: Optional[List[str]] = Field(default=None, description="Category filters")
    location: Optional[str] = Field(default=None, description="Geographic location filter")
    radius: Optional[int] = Field(default=None, description="Search radius in km")

class GoogleMapsSearchTool(BaseModel):
    """Google Maps Scraper tool definition"""
    id: str = "google_maps_search"
    name: str = "Google Maps Search"
    description: str = "Search and scrape Google Maps listings"
    category: ToolCategory = ToolCategory.SCRAPER
    params: GoogleMapsSearchParams
```

**Endpoint:** `POST /api/v1/tools/google-maps/search`

**Example Request:**
```json
{
  "query": "restaurants in Warsaw",
  "max_records": 150,
  "categories": ["restaurant", "cafe"],
  "location": "Warsaw, Poland",
  "radius": 10
}
```

#### KPO Search

```python
class KPOSearchParams(BaseModel):
    """Parameters for KPO (Polish company registry) search"""
    query: str = Field(..., description="Company name or NIP number")
    max_records: int = Field(default=50, ge=1, le=200)
    include_financials: bool = Field(default=False)
    region: Optional[str] = Field(default=None, description="Voivodeship filter")

class KPOSearchTool(BaseModel):
    id: str = "kpo_search"
    name: str = "KPO Company Search"
    description: str = "Search Polish company registry"
    category: ToolCategory = ToolCategory.SCRAPER
    params: KPOSearchParams
```

**Endpoint:** `POST /api/v1/tools/kpo/search`

#### Deep Search

```python
from typing import Literal

class DeepSearchParams(BaseModel):
    """Parameters for advanced web research"""
    query: str = Field(..., description="Research query")
    depth: Literal["shallow", "medium", "deep"] = Field(default="medium")
    max_sources: int = Field(default=10, ge=1, le=50)
    domains: Optional[List[str]] = Field(default=None, description="Restrict to domains")

class DeepSearchTool(BaseModel):
    id: str = "deep_search"
    name: str = "Deep Search"
    description: str = "Advanced web research and analysis"
    category: ToolCategory = ToolCategory.SCRAPER
    params: DeepSearchParams
```

**Endpoint:** `POST /api/v1/tools/deep-search/execute`

---

### 2. Calendar Tools

#### Create Event

```python
from datetime import datetime

class CreateCalendarEventParams(BaseModel):
    """Parameters for creating calendar events"""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    start_time: datetime = Field(..., description="ISO 8601 datetime")
    end_time: Optional[datetime] = None
    all_day: bool = Field(default=False)
    location: Optional[str] = None
    attendees: Optional[List[str]] = Field(default=None, description="Email addresses")
    reminders: Optional[List[int]] = Field(default=None, description="Minutes before")

class CreateCalendarEventTool(BaseModel):
    id: str = "create_calendar_event"
    name: str = "Create Calendar Event"
    description: str = "Create a new calendar event"
    category: ToolCategory = ToolCategory.CALENDAR
    params: CreateCalendarEventParams
```

**Endpoint:** `POST /api/v1/tools/calendar/events`

#### Update Event

```python
class UpdateCalendarEventParams(BaseModel):
    """Parameters for updating calendar events"""
    event_id: str = Field(..., description="Event ID to update")
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    location: Optional[str] = None

class UpdateCalendarEventTool(BaseModel):
    id: str = "update_calendar_event"
    name: str = "Update Calendar Event"
    description: str = "Modify existing calendar event"
    category: ToolCategory = ToolCategory.CALENDAR
    params: UpdateCalendarEventParams
```

**Endpoint:** `PATCH /api/v1/tools/calendar/events/{event_id}`

#### Delete Event

```python
class DeleteCalendarEventParams(BaseModel):
    """Parameters for deleting calendar events"""
    event_id: str
    notify_attendees: bool = Field(default=True)

class DeleteCalendarEventTool(BaseModel):
    id: str = "delete_calendar_event"
    name: str = "Delete Calendar Event"
    description: str = "Remove calendar event"
    category: ToolCategory = ToolCategory.CALENDAR
    params: DeleteCalendarEventParams
```

**Endpoint:** `DELETE /api/v1/tools/calendar/events/{event_id}`

---

### 3. Data Tools

#### Export Results

```python
class ExportResultsParams(BaseModel):
    """Parameters for exporting job results"""
    job_id: str = Field(..., description="Job ID to export")
    format: Literal["csv", "xlsx", "json"] = Field(default="csv")
    columns: Optional[List[str]] = Field(default=None, description="Columns to include")
    filters: Optional[dict] = Field(default=None, description="Row filters")

class ExportResultsTool(BaseModel):
    id: str = "export_results"
    name: str = "Export Results"
    description: str = "Export job results to file"
    category: ToolCategory = ToolCategory.DATA
    params: ExportResultsParams
```

**Endpoint:** `POST /api/v1/tools/data/export`

**Response:**
```json
{
  "download_url": "https://storage.example.com/exports/job-123.csv",
  "expires_at": "2024-01-15T12:00:00Z",
  "file_size": 245678,
  "row_count": 1500
}
```

#### Download File

```python
class DownloadFileParams(BaseModel):
    """Parameters for file download"""
    file_url: str = Field(..., description="URL to download")
    filename: Optional[str] = Field(default=None, description="Override filename")

class DownloadFileTool(BaseModel):
    id: str = "download_file"
    name: str = "Download File"
    description: str = "Download file from URL"
    category: ToolCategory = ToolCategory.DATA
    params: DownloadFileParams
```

**Endpoint:** `POST /api/v1/tools/data/download`

#### Import CSV

```python
class ImportCSVParams(BaseModel):
    """Parameters for CSV import"""
    target_module: Literal["google_maps", "kpo", "deep_search"]
    column_mapping: Optional[dict] = Field(default=None, description="Map columns")
    max_rows: int = Field(default=200, le=500)

class ImportCSVTool(BaseModel):
    id: str = "import_csv"
    name: str = "Import CSV"
    description: str = "Import queries from CSV file"
    category: ToolCategory = ToolCategory.DATA
    params: ImportCSVParams
```

**Endpoint:** `POST /api/v1/tools/data/import`

---

### 4. Form Tools

#### Fill Form Field

```python
from typing import Union

class FillFormFieldParams(BaseModel):
    """Parameters for filling form fields"""
    field_id: str = Field(..., description="Form field identifier")
    value: Union[str, int, bool] = Field(..., description="Value to fill")
    field_type: Optional[Literal["input", "textarea", "select", "checkbox", "radio"]] = None

class FillFormFieldTool(BaseModel):
    id: str = "fill_form_field"
    name: str = "Fill Form Field"
    description: str = "Fill value in form field"
    category: ToolCategory = ToolCategory.FORM
    params: FillFormFieldParams
```

**Endpoint:** `POST /api/v1/tools/ui/fill-field`

#### Select Option

```python
class SelectOptionParams(BaseModel):
    """Parameters for selecting dropdown options"""
    select_id: str
    value: Union[str, List[str]]
    multiple: bool = Field(default=False)

class SelectOptionTool(BaseModel):
    id: str = "select_option"
    name: str = "Select Option"
    description: str = "Select option from dropdown"
    category: ToolCategory = ToolCategory.FORM
    params: SelectOptionParams
```

**Endpoint:** `POST /api/v1/tools/ui/select`

#### Set Record Count

```python
class SetRecordCountParams(BaseModel):
    """Parameters for setting scraper record limits"""
    module: Literal["google_maps", "kpo", "deep_search"]
    count: int = Field(..., ge=1, le=500)

class SetRecordCountTool(BaseModel):
    id: str = "set_record_count"
    name: str = "Set Record Count"
    description: str = "Set maximum records for scraper"
    category: ToolCategory = ToolCategory.FORM
    params: SetRecordCountParams
```

**Endpoint:** `POST /api/v1/tools/ui/set-records`

---

### 5. Navigation Tools

#### Navigate to Page

```python
class NavigateToPageParams(BaseModel):
    """Parameters for page navigation"""
    route: str = Field(..., description="Target route path")
    query_params: Optional[dict] = Field(default=None, description="URL parameters")

class NavigateToPageTool(BaseModel):
    id: str = "navigate_to_page"
    name: str = "Navigate to Page"
    description: str = "Navigate to application route"
    category: ToolCategory = ToolCategory.NAVIGATION
    params: NavigateToPageParams
```

**Endpoint:** `POST /api/v1/tools/ui/navigate`

#### Click Element

```python
class ClickElementParams(BaseModel):
    """Parameters for element clicks"""
    element_id: Optional[str] = None
    element_selector: Optional[str] = Field(default=None, description="CSS selector")
    wait_for_navigation: bool = Field(default=False)

class ClickElementTool(BaseModel):
    id: str = "click_element"
    name: str = "Click Element"
    description: str = "Click UI element"
    category: ToolCategory = ToolCategory.NAVIGATION
    params: ClickElementParams
```

**Endpoint:** `POST /api/v1/tools/ui/click`

---

### 6. System Tools

#### Start Module Job

```python
class StartModuleJobParams(BaseModel):
    """Parameters for starting module jobs"""
    module: Literal["google_maps", "kpo", "deep_search", "email_invoices"]

class StartModuleJobTool(BaseModel):
    id: str = "start_module_job"
    name: str = "Start Job"
    description: str = "Start module scraping job"
    category: ToolCategory = ToolCategory.SYSTEM
    params: StartModuleJobParams
```

**Endpoint:** `POST /api/v1/tools/jobs/start`

#### Stop Module Job

```python
class StopModuleJobParams(BaseModel):
    """Parameters for stopping module jobs"""
    module: Literal["google_maps", "kpo", "deep_search", "email_invoices"]
    job_id: Optional[str] = Field(default=None, description="Specific job")

class StopModuleJobTool(BaseModel):
    id: str = "stop_module_job"
    name: str = "Stop Job"
    description: str = "Stop running module job"
    category: ToolCategory = ToolCategory.SYSTEM
    params: StopModuleJobParams
```

**Endpoint:** `POST /api/v1/tools/jobs/stop`

#### Pause/Resume Job

```python
class PauseResumeJobParams(BaseModel):
    """Parameters for pausing/resuming jobs"""
    module: Literal["google_maps", "kpo", "deep_search", "email_invoices"]
    action: Literal["pause", "resume"]
    job_id: Optional[str] = None

class PauseResumeJobTool(BaseModel):
    id: str = "pause_resume_job"
    name: str = "Pause/Resume Job"
    description: str = "Pause or resume module job"
    category: ToolCategory = ToolCategory.SYSTEM
    params: PauseResumeJobParams
```

**Endpoint:** `POST /api/v1/tools/jobs/pause-resume`

---

## Tool Execution API

### Execute Tool

**Endpoint:** `POST /api/v1/agent/execute`

```python
from typing import Any

class ToolExecutionRequest(BaseModel):
    """Request to execute a tool"""
    tool_id: str
    params: dict
    conversation_id: Optional[str] = None
    dry_run: bool = Field(default=False, description="Validate without executing")

class ToolExecutionResponse(BaseModel):
    """Response from tool execution"""
    execution_id: str
    tool_id: str
    status: ToolExecutionStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    progress: Optional[float] = Field(default=None, ge=0, le=100)
    result: Optional[Any] = None
    error: Optional[str] = None
```

### WebSocket Real-Time Updates

**Endpoint:** `WS /api/v1/agent/tools/stream`

```python
class ToolExecutionUpdate(BaseModel):
    """Real-time execution update message"""
    execution_id: str
    status: ToolExecutionStatus
    progress: Optional[float] = None
    message: Optional[str] = None
    timestamp: datetime
```

**Connection Flow:**
```python
import asyncio
import websockets
import json

async def stream_tool_executions(execution_id: str):
    uri = f"ws://api/v1/agent/tools/stream?execution_id={execution_id}"
    async with websockets.connect(uri) as ws:
        async for message in ws:
            update = json.loads(message)
            print(f"Status: {update['status']}, Progress: {update['progress']}%")
```

---

## FastAPI Router Implementation

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List

router = APIRouter(prefix="/api/v1", tags=["agent-tools"])

# Tool Registry
TOOL_REGISTRY = {
    "google_maps_search": GoogleMapsSearchTool,
    "kpo_search": KPOSearchTool,
    "deep_search": DeepSearchTool,
    "create_calendar_event": CreateCalendarEventTool,
    "update_calendar_event": UpdateCalendarEventTool,
    "delete_calendar_event": DeleteCalendarEventTool,
    "export_results": ExportResultsTool,
    "download_file": DownloadFileTool,
    "import_csv": ImportCSVTool,
    "fill_form_field": FillFormFieldTool,
    "select_option": SelectOptionTool,
    "set_record_count": SetRecordCountTool,
    "navigate_to_page": NavigateToPageTool,
    "click_element": ClickElementTool,
    "start_module_job": StartModuleJobTool,
    "stop_module_job": StopModuleJobTool,
    "pause_resume_job": PauseResumeJobTool,
}

@router.get("/tools")
async def list_tools() -> List[dict]:
    """List all available agent tools"""
    return [
        {
            "id": tool_id,
            "name": tool_class.__fields__["name"].default,
            "description": tool_class.__fields__["description"].default,
            "category": tool_class.__fields__["category"].default,
        }
        for tool_id, tool_class in TOOL_REGISTRY.items()
    ]

@router.post("/agent/execute")
async def execute_tool(request: ToolExecutionRequest) -> ToolExecutionResponse:
    """Execute a tool and return results"""
    # Validate tool exists
    if request.tool_id not in TOOL_REGISTRY:
        raise HTTPException(404, f"Tool {request.tool_id} not found")
    
    # Create execution record
    execution_id = str(uuid4())
    
    # Execute tool (implementation varies by tool)
    # ...
    
    return ToolExecutionResponse(
        execution_id=execution_id,
        tool_id=request.tool_id,
        status=ToolExecutionStatus.COMPLETED,
        started_at=datetime.utcnow(),
        completed_at=datetime.utcnow(),
    )

@router.websocket("/agent/tools/stream")
async def tool_stream(websocket: WebSocket, execution_id: str):
    """Stream real-time tool execution updates"""
    await websocket.accept()
    try:
        # Subscribe to execution updates
        async for update in get_execution_updates(execution_id):
            await websocket.send_json(update.dict())
    except WebSocketDisconnect:
        pass
```

---

## OpenAPI Schema Generation

The complete OpenAPI schema can be generated using FastAPI's built-in functionality:

```python
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

app = FastAPI()
app.include_router(router)

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title="Netatron Agent Tools API",
        version="1.0.0",
        description="API for AI Agent tool execution",
        routes=app.routes,
    )
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi
```

Access at: `GET /openapi.json`

---

## Error Handling

```python
class ToolExecutionError(Exception):
    """Base error for tool execution failures"""
    def __init__(self, tool_id: str, message: str, details: Optional[dict] = None):
        self.tool_id = tool_id
        self.message = message
        self.details = details or {}

class ToolNotFoundError(ToolExecutionError):
    """Tool not found in registry"""
    pass

class ToolValidationError(ToolExecutionError):
    """Tool parameters validation failed"""
    pass

class ToolTimeoutError(ToolExecutionError):
    """Tool execution timed out"""
    pass
```

---

## Security Considerations

1. **Authentication**: All tool endpoints require valid JWT token
2. **Rate Limiting**: Max 100 tool executions per minute per user
3. **Permissions**: Tools check user permissions before execution
4. **Audit Logging**: All tool executions are logged for audit

```python
from fastapi import Depends
from app.auth import get_current_user, check_permission

@router.post("/agent/execute")
async def execute_tool(
    request: ToolExecutionRequest,
    user = Depends(get_current_user),
    _=Depends(check_permission("tools:execute"))
):
    # ...
```

---

## Frontend Integration

The frontend `ToolExecutionVisualizer` component connects to these APIs:

```typescript
// Fetch available tools
const tools = await fetch('/api/v1/tools').then(r => r.json());

// Execute tool
const execution = await fetch('/api/v1/agent/execute', {
  method: 'POST',
  body: JSON.stringify({
    tool_id: 'google_maps_search',
    params: { query: 'restaurants in Warsaw', max_records: 100 }
  })
}).then(r => r.json());

// Stream updates
const ws = new WebSocket(`ws://api/v1/agent/tools/stream?execution_id=${execution.execution_id}`);
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  updateToolExecution(update);
};
```
