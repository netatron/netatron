"""
Event Stream Manager for Server-Sent Events (SSE)
Manages event streams for jobs without modifying existing worker logic.
"""
from __future__ import annotations

import json
import logging
import threading
from collections import defaultdict
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class EventStreamManager:
    """
    Manages event streams for jobs.
    Allows workers to emit events without coupling to SSE implementation.
    """
    
    def __init__(self):
        self._subscribers: Dict[str, List[Callable[[Dict[str, Any]], None]]] = defaultdict(list)
        self._event_buffer: Dict[str, List[Dict[str, Any]]] = defaultdict(list)  # Buffer events until subscriber connects
        self._max_buffer_size = 100  # Max events to buffer per job
        self._lock = threading.Lock()
    
    def subscribe(self, job_id: str, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Subscribe to events for a specific job."""
        with self._lock:
            self._subscribers[job_id].append(callback)
            logger.info(f"Subscribed to events for job {job_id} (total subscribers: {len(self._subscribers[job_id])})")
            
            # Send buffered events to new subscriber
            if job_id in self._event_buffer:
                buffered = self._event_buffer[job_id]
                logger.info(f"Sending {len(buffered)} buffered events to new subscriber for job {job_id}")
                for event in buffered:
                    try:
                        callback(event)
                    except Exception as e:
                        logger.error(f"Error sending buffered event to callback: {e}", exc_info=True)
                # Clear buffer after sending
                del self._event_buffer[job_id]
    
    def unsubscribe(self, job_id: str, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Unsubscribe from events for a specific job."""
        with self._lock:
            if job_id in self._subscribers:
                try:
                    self._subscribers[job_id].remove(callback)
                    logger.info(f"Unsubscribed from events for job {job_id}")
                except ValueError:
                    pass
                if not self._subscribers[job_id]:
                    del self._subscribers[job_id]
    
    def emit(self, job_id: str, event_type: str, data: Dict[str, Any]) -> None:
        """
        Emit an event for a job.
        
        Args:
            job_id: Job identifier
            event_type: Type of event (search, navigate, fetch, parse, ai_call, result, error, completed)
            data: Event data
        """
        event = {
            "type": event_type,
            "timestamp": int(datetime.now().timestamp() * 1000),
            "data": data,
        }
        
        with self._lock:
            subscribers = self._subscribers.get(job_id, [])
        
        if subscribers:
            logger.info(f"Emitting event {event_type} for job {job_id} to {len(subscribers)} subscribers")
            for callback in subscribers:
                try:
                    callback(event)
                except Exception as e:
                    logger.error(f"Error in event callback for job {job_id}: {e}", exc_info=True)
        else:
            # Buffer event if no subscribers yet (worker started before SSE connection)
            with self._lock:
                if job_id not in self._event_buffer:
                    self._event_buffer[job_id] = []
                if len(self._event_buffer[job_id]) < self._max_buffer_size:
                    self._event_buffer[job_id].append(event)
                    logger.info(f"Buffering event {event_type} for job {job_id} (no subscribers yet, buffer size: {len(self._event_buffer[job_id])})")
                else:
                    logger.warning(f"Event buffer full for job {job_id}, dropping event {event_type}")
    
    def clear(self, job_id: str) -> None:
        """Clear all subscribers for a job."""
        with self._lock:
            if job_id in self._subscribers:
                del self._subscribers[job_id]
                logger.info(f"Cleared subscribers for job {job_id}")


# Global instance
event_stream_manager = EventStreamManager()


def emit_event(job_id: str, event_type: str, data: Dict[str, Any]) -> None:
    """Convenience function to emit events."""
    event_stream_manager.emit(job_id, event_type, data)

