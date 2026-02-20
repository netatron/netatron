"""
UI Agent Service - High-end, transferable AI agent with UI awareness
Zero hardcoded solutions - fully configurable and adaptable to any CRM/web app
Extended with desktop awareness for browser and system application control
"""

from .service import UIAgentService, ui_agent_service
from .gemini_client import GeminiUIAgentClient
from .visual_understanding import VisualUnderstandingService
from .reasoning_engine import ReasoningEngine
from .desktop_automation import DesktopAutomationService
from .memory_store import MemoryStore, memory_store
from .memory_service import MemoryService, memory_service

__all__ = [
    "UIAgentService",
    "ui_agent_service",
    "GeminiUIAgentClient",
    "VisualUnderstandingService",
    "ReasoningEngine",
    "DesktopAutomationService",
    "MemoryStore",
    "MemoryService",
    "memory_store",
    "memory_service",
]

