"""
Enhanced Reasoning Tracker
High-end reasoning tracking system with step tree and chain of thought support
"""
from datetime import datetime
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
import json
import uuid


class ReasoningEventType(str, Enum):
    """Types of reasoning events"""
    INTENT_ANALYSIS = "intent_analysis"
    CONTEXT_RETRIEVAL = "context_retrieval"
    STRATEGY_GENERATION = "strategy_generation"
    STRATEGY_SELECTION = "strategy_selection"
    SOURCE_SELECTION = "source_selection"
    QUERY_OPTIMIZATION = "query_optimization"
    SCRAPING_START = "scraping_start"
    SCRAPING_EXECUTION = "scraping_execution"
    DATA_EXTRACTION = "data_extraction"
    DATA_VALIDATION = "data_validation"
    DATA_ENRICHMENT = "data_enrichment"
    DATA_FUSION = "data_fusion"
    ERROR_HANDLING = "error_handling"
    RETRY_DECISION = "retry_decision"
    ADAPTATION = "adaptation"
    COMPLETION = "completion"


class ReasoningCategory(str, Enum):
    """Categories of reasoning"""
    STRATEGY = "strategy"
    SCRAPING = "scraping"
    VALIDATION = "validation"
    ENRICHMENT = "enrichment"


class ReasoningTracker:
    """Enhanced reasoning tracker with step tree and chain of thought support"""
    
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.events: List[Dict[str, Any]] = []
        self.subscribers: List[Callable[[Dict[str, Any]], None]] = []
        self.step_tree: Dict[str, Dict[str, Any]] = {}
    
    def subscribe(self, callback: Callable[[Dict[str, Any]], None]):
        """Subscribe to reasoning events"""
        self.subscribers.append(callback)
    
    def emit(
        self,
        event_type: ReasoningEventType,
        message: str,
        category: ReasoningCategory = ReasoningCategory.SCRAPING,
        confidence: float = 1.0,
        metadata: Optional[Dict[str, Any]] = None,
        parent_step_id: Optional[str] = None,
        reasoning_chain: Optional[List[str]] = None,
    ) -> str:
        """Emit a reasoning event with full context"""
        step_id = f"{self.job_id}_{len(self.events)}"
        
        event = {
            "id": step_id,
            "timestamp": datetime.utcnow().isoformat(),
            "type": event_type.value,
            "category": category.value,
            "message": message,
            "confidence": confidence,
            "confidence_level": self._get_confidence_level(confidence),
            "metadata": metadata or {},
            "parent_step_id": parent_step_id,
            "child_step_ids": [],
            "reasoning_chain": reasoning_chain or [],
            "visualization": self._get_visualization(event_type, category, confidence),
        }
        
        # Update parent if exists
        if parent_step_id and parent_step_id in self.step_tree:
            self.step_tree[parent_step_id]["child_step_ids"].append(step_id)
        
        self.events.append(event)
        self.step_tree[step_id] = event
        
        # Notify subscribers
        for callback in self.subscribers:
            try:
                callback(event)
            except Exception as e:
                print(f"Error in reasoning subscriber: {e}")
        
        return step_id
    
    def _get_confidence_level(self, confidence: float) -> str:
        """Get confidence level string"""
        if confidence >= 0.9:
            return "very_high"
        elif confidence >= 0.75:
            return "high"
        elif confidence >= 0.5:
            return "medium"
        elif confidence >= 0.25:
            return "low"
        else:
            return "very_low"
    
    def _get_visualization(
        self,
        event_type: ReasoningEventType,
        category: ReasoningCategory,
        confidence: float,
    ) -> Dict[str, Any]:
        """Get visualization config for event"""
        configs = {
            ReasoningEventType.INTENT_ANALYSIS: {
                "icon": "🧠",
                "color": "blue",
                "animation": "pulse",
            },
            ReasoningEventType.STRATEGY_SELECTION: {
                "icon": "🎯",
                "color": "purple",
                "animation": "fade",
            },
            ReasoningEventType.SCRAPING_START: {
                "icon": "🔍",
                "color": "blue",
                "animation": "pulse",
            },
            ReasoningEventType.DATA_EXTRACTION: {
                "icon": "📊",
                "color": "green",
                "animation": "wave",
            },
            ReasoningEventType.DATA_VALIDATION: {
                "icon": "✅",
                "color": "green",
                "animation": "check",
            },
            ReasoningEventType.DATA_ENRICHMENT: {
                "icon": "✨",
                "color": "yellow",
                "animation": "sparkle",
            },
            ReasoningEventType.ERROR_HANDLING: {
                "icon": "⚠️",
                "color": "red",
                "animation": "shake",
            },
            ReasoningEventType.COMPLETION: {
                "icon": "🎉",
                "color": "green",
                "animation": "celebrate",
            },
        }
        
        base_config = configs.get(
            event_type,
            {"icon": "ℹ️", "color": "gray", "animation": "fade"}
        )
        
        # Add confidence-based styling
        if confidence >= 0.9:
            base_config["glow"] = True
            base_config["intensity"] = "high"
        elif confidence < 0.5:
            base_config["opacity"] = 0.7
        
        return base_config
    
    def get_events(self) -> List[Dict[str, Any]]:
        """Get all events"""
        return self.events
    
    def get_step_tree(self) -> Dict[str, Any]:
        """Get step tree structure"""
        root_steps = [
            event["id"] for event in self.events
            if event.get("parent_step_id") is None
        ]
        return {
            "root_steps": root_steps,
            "steps": self.step_tree,
        }










