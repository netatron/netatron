# UI-Aware AI Agent - Backend Implementation Guide

## Overview

This document describes the backend API requirements for the UI-aware AI agent system. The agent can observe the current UI state and execute actions on the user's behalf.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  UI Capture  │───▶│  useUIAgent  │───▶│  Executor    │       │
│  │  (capture.ts)│    │    Hook      │    │ (executor.ts)│       │
│  └──────────────┘    └──────┬───────┘    └──────────────┘       │
│                             │                                    │
└─────────────────────────────┼────────────────────────────────────┘
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  FastAPI     │───▶│  LLM Service │───▶│  Action      │       │
│  │  Endpoint    │    │  (GPT-4/etc) │    │  Parser      │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### 1. Process UI Command

**POST** `/api/v1/agent/ui-command`

Process a user message with UI context and return agent response with optional actions.

#### Request Body

```json
{
  "message": "Click the Start button",
  "ui_context": "## Current Page: Google Maps Scraper\nRoute: /google-maps\n...",
  "current_route": "/google-maps",
  "session_id": "optional-session-id",
  "execute_actions": true
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | User's natural language command |
| `ui_context` | string | Yes | Generated UI description from frontend |
| `current_route` | string | Yes | Current page route |
| `session_id` | string | No | Session ID for conversation continuity |
| `execute_actions` | boolean | No | Whether to include executable actions (default: true) |

#### Response

```json
{
  "message": "I'll click the Start button for you.",
  "reasoning": "User wants to start the Google Maps scraper. Found Start button in the UI.",
  "actions": [
    {
      "type": "click",
      "targetId": "start-button",
      "options": {
        "delay": 200,
        "animate": true,
        "scrollIntoView": true
      }
    }
  ],
  "shouldExecute": true,
  "confidence": 0.95
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Human-readable response to user |
| `reasoning` | string | Optional: Agent's reasoning process |
| `actions` | array | Optional: List of UI actions to execute |
| `shouldExecute` | boolean | Whether actions should be executed |
| `confidence` | float | Optional: Confidence score (0-1) |

### 2. Action Types

The following action types are supported:

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `click` | Click on an element | `targetId` or `targetSelector` |
| `fill` | Fill input with value | `targetId`, `value` |
| `select` | Select dropdown option | `targetId`, `value` |
| `scroll` | Scroll element into view | `targetId` |
| `navigate` | Navigate to route | `value` (route path) |
| `hover` | Hover over element | `targetId` |
| `focus` | Focus on element | `targetId` |
| `clear` | Clear input value | `targetId` |
| `submit` | Submit form | `targetId` (form or submit button) |
| `toggle` | Toggle checkbox/switch | `targetId` |

### 3. Action Schema

```json
{
  "type": "fill",
  "targetId": "query-input-0",
  "targetSelector": "input[placeholder*='search']",
  "value": "restaurants Warsaw",
  "options": {
    "delay": 200,
    "animate": true,
    "scrollIntoView": true
  }
}
```

## Python Backend Implementation

### FastAPI Example

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import openai

app = FastAPI()

# Models
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

class UICommandRequest(BaseModel):
    message: str
    ui_context: str
    current_route: str
    session_id: Optional[str] = None
    execute_actions: bool = True

class UICommandResponse(BaseModel):
    message: str
    reasoning: Optional[str] = None
    actions: Optional[List[UIAction]] = None
    shouldExecute: bool = False
    confidence: Optional[float] = None

# System prompt for LLM
SYSTEM_PROMPT = """You are an AI agent that can interact with a web application UI.
You receive the current UI state and user commands, and you respond with actions to execute.

When responding, you must:
1. Analyze the UI context to understand what elements are available
2. Interpret the user's intent
3. Generate appropriate actions if the user wants to interact with the UI
4. Provide clear, helpful responses

Available action types:
- click: Click on a button or link (needs targetId)
- fill: Fill an input field (needs targetId and value)
- select: Select a dropdown option (needs targetId and value)
- navigate: Navigate to a route (needs value with route path)
- scroll: Scroll element into view (needs targetId)
- toggle: Toggle a checkbox or switch (needs targetId)
- clear: Clear an input field (needs targetId)
- submit: Submit a form (needs targetId of form or submit button)

When generating actions:
- Use targetId to identify elements (use the [id] from the UI context)
- Set shouldExecute to true only when user explicitly wants to perform an action
- Set shouldExecute to false for informational queries

Respond in JSON format:
{
  "message": "Human readable response",
  "reasoning": "Your thought process",
  "actions": [...],  // Only if user wants to perform actions
  "shouldExecute": true/false,
  "confidence": 0.0-1.0
}
"""

@app.post("/api/v1/agent/ui-command", response_model=UICommandResponse)
async def process_ui_command(request: UICommandRequest):
    try:
        # Build prompt with UI context
        user_prompt = f"""
UI Context:
{request.ui_context}

Current Route: {request.current_route}

User Message: {request.message}
"""
        
        # Call LLM (OpenAI example)
        response = await openai.ChatCompletion.acreate(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=1000
        )
        
        # Parse response
        result = json.loads(response.choices[0].message.content)
        
        return UICommandResponse(
            message=result.get("message", ""),
            reasoning=result.get("reasoning"),
            actions=[UIAction(**a) for a in result.get("actions", [])] if result.get("actions") else None,
            shouldExecute=result.get("shouldExecute", False),
            confidence=result.get("confidence")
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# WebSocket for real-time updates (optional)
@app.websocket("/api/v1/agent/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "ui_command":
                response = await process_ui_command(UICommandRequest(**data["payload"]))
                await websocket.send_json(response.dict())
                
            elif data.get("type") == "action_result":
                # Handle action execution results from frontend
                print(f"Action result: {data['payload']}")
                
    except WebSocketDisconnect:
        pass
```

### LLM Integration Options

#### Option 1: OpenAI GPT-4

```python
import openai

async def get_llm_response(ui_context: str, message: str) -> dict:
    response = await openai.ChatCompletion.acreate(
        model="gpt-4-turbo-preview",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"UI: {ui_context}\n\nUser: {message}"}
        ],
        response_format={"type": "json_object"}
    )
    return json.loads(response.choices[0].message.content)
```

#### Option 2: Anthropic Claude

```python
import anthropic

async def get_llm_response(ui_context: str, message: str) -> dict:
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-3-opus-20240229",
        max_tokens=1000,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": f"UI: {ui_context}\n\nUser: {message}"}
        ]
    )
    return json.loads(response.content[0].text)
```

#### Option 3: Local LLM (Ollama)

```python
import httpx

async def get_llm_response(ui_context: str, message: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "mixtral",
                "prompt": f"{SYSTEM_PROMPT}\n\nUI: {ui_context}\n\nUser: {message}",
                "format": "json"
            }
        )
        return response.json()
```

## Frontend Integration

### Connecting to Backend

Update the `useUIAgent` hook to call the real API:

```typescript
// src/hooks/use-ui-agent.ts

const sendMessageWithContext = useCallback(async (
  message: string
): Promise<AgentUIResponse> => {
  const uiContext = getUIContext();
  
  const response = await fetch('/api/v1/agent/ui-command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      ui_context: uiContext,
      current_route: location.pathname,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to process command');
  }
  
  return response.json();
}, [getUIContext, location.pathname]);
```

### WebSocket Connection (Optional)

For real-time bidirectional communication:

```typescript
const wsRef = useRef<WebSocket | null>(null);

useEffect(() => {
  wsRef.current = new WebSocket('ws://api/v1/agent/ws');
  
  wsRef.current.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.actions) {
      execute(data.actions);
    }
  };
  
  return () => wsRef.current?.close();
}, []);

const sendMessage = (message: string) => {
  wsRef.current?.send(JSON.stringify({
    type: 'ui_command',
    payload: {
      message,
      ui_context: getUIContext(),
      current_route: location.pathname,
    },
  }));
};
```

## Security Considerations

1. **Rate Limiting**: Implement rate limiting on the API endpoint
2. **Action Validation**: Validate actions against allowed element IDs
3. **Session Management**: Use session IDs to track conversations
4. **Input Sanitization**: Sanitize user messages before LLM processing
5. **Action Logging**: Log all executed actions for audit

## Testing

### Example Test Cases

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_click_action():
    async with AsyncClient() as client:
        response = await client.post(
            "/api/v1/agent/ui-command",
            json={
                "message": "Click the Start button",
                "ui_context": "### Buttons:\n- [start-button] \"Start\"",
                "current_route": "/google-maps"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["shouldExecute"] == True
        assert len(data["actions"]) == 1
        assert data["actions"][0]["type"] == "click"
        assert data["actions"][0]["targetId"] == "start-button"

@pytest.mark.asyncio
async def test_informational_query():
    async with AsyncClient() as client:
        response = await client.post(
            "/api/v1/agent/ui-command",
            json={
                "message": "What can I do on this page?",
                "ui_context": "## Current Page: Dashboard",
                "current_route": "/"
            }
        )
        
        data = response.json()
        assert data["shouldExecute"] == False
        assert data["actions"] is None or len(data["actions"]) == 0
```

## Deployment Checklist

- [ ] Set up API endpoint `/api/v1/agent/ui-command`
- [ ] Configure LLM provider (OpenAI/Anthropic/Local)
- [ ] Implement rate limiting
- [ ] Add authentication middleware
- [ ] Set up logging and monitoring
- [ ] Update frontend hook to use real API
- [ ] Test all action types
- [ ] Document available actions for LLM
- [ ] Set up WebSocket for real-time (optional)
