# Netatron Schedule Calendar - Backend API Documentation

## Overview

This document describes the backend API requirements for the Netatron Schedule Calendar module. The backend is responsible for:
1. Fetching calendar data from external APIs (Google Calendar, Outlook, Shopify, WooCommerce, etc.)
2. Parsing and normalizing events to a unified format
3. Storing events in the database
4. Providing REST endpoints for the frontend
5. Handling AI agent commands for calendar manipulation

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend UI   │────▶│   Python API    │────▶│  External APIs  │
│   (React)       │     │   (FastAPI)     │     │  (Calendar/CRM) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   PostgreSQL    │
                        │   (Events DB)   │
                        └─────────────────┘
```

## Database Schema

### calendar_integrations
```sql
CREATE TABLE calendar_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL, -- 'google_calendar', 'outlook', 'shopify', etc.
    api_key_encrypted TEXT,
    api_secret_encrypted TEXT,
    webhook_url TEXT,
    calendar_id VARCHAR(255),
    sync_enabled BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'disconnected',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### calendar_events
```sql
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES calendar_integrations(id),
    external_id VARCHAR(255), -- ID from source API
    title VARCHAR(500) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    all_day BOOLEAN DEFAULT false,
    category VARCHAR(100),
    source VARCHAR(50), -- 'google', 'shopify', 'custom', etc.
    color VARCHAR(20),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(integration_id, external_id)
);
```

## REST API Endpoints

### Integrations

#### GET /api/v1/calendar/integrations
List all calendar integrations for the current user.

**Response:**
```json
{
  "integrations": [
    {
      "id": "uuid",
      "name": "My Google Calendar",
      "provider": "google_calendar",
      "sync_enabled": true,
      "last_sync_at": "2025-01-15T10:30:00Z",
      "status": "connected"
    }
  ]
}
```

#### POST /api/v1/calendar/integrations
Create a new calendar integration.

**Request:**
```json
{
  "name": "My Shopify Store",
  "provider": "shopify",
  "api_key": "xxx",
  "api_secret": "xxx",
  "webhook_url": "https://mystore.myshopify.com"
}
```

#### PUT /api/v1/calendar/integrations/{id}
Update an existing integration.

#### DELETE /api/v1/calendar/integrations/{id}
Remove an integration.

#### POST /api/v1/calendar/integrations/{id}/test
Test the API connection.

**Response:**
```json
{
  "success": true,
  "message": "Connection successful",
  "events_found": 42
}
```

### Events

#### GET /api/v1/calendar/events
Fetch all synced events.

**Query Parameters:**
- `start_date`: ISO date string (required)
- `end_date`: ISO date string (required)
- `source`: Filter by source (optional)
- `category`: Filter by category (optional)

**Response:**
```json
{
  "events": [
    {
      "id": "uuid",
      "title": "Team Meeting",
      "description": "Weekly sync",
      "start": "2025-01-15T14:00:00Z",
      "end": "2025-01-15T15:00:00Z",
      "all_day": false,
      "category": "meetings",
      "source": "google",
      "color": "#4285F4",
      "metadata": {}
    }
  ],
  "total": 42
}
```

#### POST /api/v1/calendar/events
Create a new event.

**Request:**
```json
{
  "title": "New Meeting",
  "description": "Description here",
  "start": "2025-01-20T10:00:00Z",
  "end": "2025-01-20T11:00:00Z",
  "category": "meetings",
  "integration_id": "uuid" // optional, for syncing back
}
```

#### PUT /api/v1/calendar/events/{id}
Update an event.

#### DELETE /api/v1/calendar/events/{id}
Delete an event.

### Sync

#### POST /api/v1/calendar/sync
Trigger a full sync for all integrations.

**Response:**
```json
{
  "job_id": "uuid",
  "status": "started",
  "integrations_count": 3
}
```

#### POST /api/v1/calendar/sync/{integration_id}
Trigger sync for a specific integration.

#### GET /api/v1/calendar/sync/status/{job_id}
Get sync job status.

**Response:**
```json
{
  "job_id": "uuid",
  "status": "running",
  "progress": 65,
  "events_synced": 28,
  "errors": []
}
```

## AI Agent Endpoints

### POST /api/v1/agent/calendar-command
Process natural language calendar commands.

**Request:**
```json
{
  "command": "Schedule a meeting with the team on Friday at 2pm",
  "ui_context": {
    "current_date": "2025-01-15",
    "selected_date": "2025-01-17",
    "visible_events": ["uuid1", "uuid2"]
  }
}
```

**Response:**
```json
{
  "message": "I've scheduled a team meeting for Friday, January 17th at 2:00 PM.",
  "reasoning": "User requested a meeting. Identified Friday as January 17th based on current date.",
  "actions": [
    {
      "type": "create_event",
      "data": {
        "title": "Team Meeting",
        "start": "2025-01-17T14:00:00Z",
        "end": "2025-01-17T15:00:00Z"
      }
    }
  ],
  "should_execute": true
}
```

### Supported AI Commands

| Command Pattern | Action | Example |
|----------------|--------|---------|
| "show events for [date/period]" | Query & display | "Show me events for next week" |
| "schedule/create [event]" | Create event | "Schedule a call with John tomorrow at 3pm" |
| "reschedule [event] to [date]" | Update event | "Reschedule the meeting to Monday" |
| "cancel/delete [event]" | Delete event | "Cancel all Shopify orders for today" |
| "move [event] to [time]" | Update time | "Move the team sync to 4pm" |
| "add [duration] to [event]" | Extend event | "Add 30 minutes to the client call" |

## Provider Integration Examples

### Google Calendar

```python
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

class GoogleCalendarProvider:
    def __init__(self, api_key: str, calendar_id: str = "primary"):
        self.credentials = Credentials(token=api_key)
        self.service = build("calendar", "v3", credentials=self.credentials)
        self.calendar_id = calendar_id
    
    def fetch_events(self, start_date: datetime, end_date: datetime) -> list[dict]:
        events_result = self.service.events().list(
            calendarId=self.calendar_id,
            timeMin=start_date.isoformat() + "Z",
            timeMax=end_date.isoformat() + "Z",
            singleEvents=True,
            orderBy="startTime"
        ).execute()
        
        return [self._parse_event(e) for e in events_result.get("items", [])]
    
    def _parse_event(self, event: dict) -> dict:
        """Parse Google Calendar event to unified format"""
        start = event.get("start", {})
        end = event.get("end", {})
        
        return {
            "external_id": event["id"],
            "title": event.get("summary", "Untitled"),
            "description": event.get("description"),
            "start": start.get("dateTime") or start.get("date"),
            "end": end.get("dateTime") or end.get("date"),
            "all_day": "date" in start,
            "source": "google",
            "metadata": {
                "location": event.get("location"),
                "attendees": event.get("attendees", [])
            }
        }
```

### Shopify Orders

```python
import shopify

class ShopifyProvider:
    def __init__(self, shop_url: str, api_key: str, api_secret: str):
        shopify.ShopifyResource.set_site(f"https://{api_key}:{api_secret}@{shop_url}/admin")
    
    def fetch_events(self, start_date: datetime, end_date: datetime) -> list[dict]:
        orders = shopify.Order.find(
            created_at_min=start_date.isoformat(),
            created_at_max=end_date.isoformat()
        )
        
        return [self._parse_order(o) for o in orders]
    
    def _parse_order(self, order) -> dict:
        """Parse Shopify order to calendar event format"""
        return {
            "external_id": str(order.id),
            "title": f"Order #{order.order_number}",
            "description": f"Customer: {order.customer.first_name} {order.customer.last_name}\n"
                          f"Items: {len(order.line_items)}\n"
                          f"Total: {order.total_price} {order.currency}",
            "start": order.created_at,
            "end": order.created_at,  # Orders are point-in-time
            "all_day": False,
            "category": "orders",
            "source": "shopify",
            "color": "#96BF48",
            "metadata": {
                "order_id": order.id,
                "order_number": order.order_number,
                "total": order.total_price,
                "currency": order.currency,
                "fulfillment_status": order.fulfillment_status,
                "customer_email": order.customer.email
            }
        }
```

### WooCommerce Orders

```python
from woocommerce import API

class WooCommerceProvider:
    def __init__(self, url: str, consumer_key: str, consumer_secret: str):
        self.wcapi = API(
            url=url,
            consumer_key=consumer_key,
            consumer_secret=consumer_secret,
            version="wc/v3"
        )
    
    def fetch_events(self, start_date: datetime, end_date: datetime) -> list[dict]:
        orders = self.wcapi.get("orders", params={
            "after": start_date.isoformat(),
            "before": end_date.isoformat()
        }).json()
        
        return [self._parse_order(o) for o in orders]
    
    def _parse_order(self, order: dict) -> dict:
        return {
            "external_id": str(order["id"]),
            "title": f"WC Order #{order['number']}",
            "description": f"Customer: {order['billing']['first_name']} {order['billing']['last_name']}",
            "start": order["date_created"],
            "end": order["date_created"],
            "category": "orders",
            "source": "woocommerce",
            "color": "#96588A",
            "metadata": {
                "order_id": order["id"],
                "total": order["total"],
                "status": order["status"]
            }
        }
```

## FastAPI Implementation

```python
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

app = FastAPI()

class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start: datetime
    end: datetime
    all_day: bool = False
    category: Optional[str] = None
    integration_id: Optional[str] = None

class CalendarCommand(BaseModel):
    command: str
    ui_context: Optional[dict] = None

@app.get("/api/v1/calendar/events")
async def get_events(
    start_date: datetime,
    end_date: datetime,
    source: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    """Fetch calendar events within date range"""
    query = select(CalendarEvent).where(
        CalendarEvent.start_time >= start_date,
        CalendarEvent.end_time <= end_date
    )
    
    if source:
        query = query.where(CalendarEvent.source == source)
    
    events = await db.execute(query)
    return {"events": [e.to_dict() for e in events]}

@app.post("/api/v1/calendar/events")
async def create_event(
    event: EventCreate,
    current_user = Depends(get_current_user)
):
    """Create a new calendar event"""
    new_event = CalendarEvent(
        title=event.title,
        description=event.description,
        start_time=event.start,
        end_time=event.end,
        all_day=event.all_day,
        category=event.category,
        source="custom"
    )
    
    db.add(new_event)
    await db.commit()
    
    return {"id": new_event.id, "message": "Event created"}

@app.post("/api/v1/agent/calendar-command")
async def process_calendar_command(
    request: CalendarCommand,
    current_user = Depends(get_current_user)
):
    """Process natural language calendar command via AI"""
    
    # Build context for LLM
    context = {
        "current_date": datetime.now().isoformat(),
        "available_events": await get_user_events(current_user.id),
        "ui_context": request.ui_context
    }
    
    # Call LLM for command interpretation
    response = await call_llm(
        system_prompt=CALENDAR_AGENT_PROMPT,
        user_message=request.command,
        context=context
    )
    
    # Parse and execute actions
    actions = parse_agent_response(response)
    
    results = []
    for action in actions:
        if action["type"] == "create_event":
            result = await create_event_from_action(action["data"])
            results.append(result)
        elif action["type"] == "update_event":
            result = await update_event_from_action(action["event_id"], action["data"])
            results.append(result)
        elif action["type"] == "delete_event":
            result = await delete_event(action["event_id"])
            results.append(result)
    
    return {
        "message": response["message"],
        "reasoning": response.get("reasoning"),
        "actions": actions,
        "results": results
    }

# LLM System Prompt for Calendar Agent
CALENDAR_AGENT_PROMPT = """
You are an AI calendar assistant for Netatron. You can:
1. Query and display calendar events
2. Create new events
3. Update existing events (reschedule, extend, modify)
4. Delete events

When processing commands:
- Parse dates relative to the current date provided in context
- Use 24-hour format for times internally
- Return structured actions that can be executed by the system
- Provide clear, concise confirmation messages

Available actions:
- create_event: {title, start, end, description?, category?}
- update_event: {event_id, changes: {title?, start?, end?, description?}}
- delete_event: {event_id}
- query_events: {start_date, end_date, filters?}

Always confirm what action you're taking in your response message.
"""
```

## WebSocket for Real-time Sync

```python
from fastapi import WebSocket

@app.websocket("/ws/calendar/sync")
async def calendar_sync_websocket(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            # Send sync progress updates
            await websocket.send_json({
                "type": "sync_progress",
                "data": {
                    "integration": "google_calendar",
                    "progress": 45,
                    "events_synced": 23
                }
            })
            
            # Send new events as they're synced
            await websocket.send_json({
                "type": "new_event",
                "data": event.to_dict()
            })
            
    except WebSocketDisconnect:
        pass
```

## Sync Job Implementation

```python
from celery import Celery

celery = Celery("calendar_sync")

@celery.task
def sync_calendar_integration(integration_id: str):
    """Background task to sync a calendar integration"""
    
    integration = get_integration(integration_id)
    provider = get_provider(integration)
    
    # Fetch events from external API
    start_date = datetime.now() - timedelta(days=30)
    end_date = datetime.now() + timedelta(days=90)
    
    events = provider.fetch_events(start_date, end_date)
    
    # Upsert events to database
    for event in events:
        existing = get_event_by_external_id(
            integration_id, 
            event["external_id"]
        )
        
        if existing:
            update_event(existing.id, event)
        else:
            create_event(integration_id, event)
    
    # Update integration status
    update_integration_status(integration_id, "connected", datetime.now())
    
    return {"synced": len(events)}
```

## Error Handling

```python
class CalendarAPIError(Exception):
    def __init__(self, provider: str, message: str, code: str):
        self.provider = provider
        self.message = message
        self.code = code

@app.exception_handler(CalendarAPIError)
async def calendar_error_handler(request, exc: CalendarAPIError):
    return JSONResponse(
        status_code=400,
        content={
            "error": "calendar_api_error",
            "provider": exc.provider,
            "message": exc.message,
            "code": exc.code
        }
    )
```

## Security Considerations

1. **API Key Encryption**: All API keys must be encrypted at rest using AES-256
2. **OAuth Tokens**: Use proper OAuth 2.0 flow for Google/Outlook
3. **Webhook Validation**: Validate signatures on incoming webhooks
4. **Rate Limiting**: Implement rate limiting for external API calls
5. **Audit Logging**: Log all calendar modifications for audit trail

## Deployment Checklist

- [ ] Set up database tables
- [ ] Configure encryption keys for API credentials
- [ ] Set up Celery/Redis for background sync jobs
- [ ] Configure WebSocket support
- [ ] Set up monitoring for sync job failures
- [ ] Configure rate limiting
- [ ] Test each provider integration
- [ ] Document API endpoints in OpenAPI spec
