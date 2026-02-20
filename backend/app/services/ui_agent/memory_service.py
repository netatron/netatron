"""
Memory Service - High-level interface for RAG memory system
Integrates memory store with UI agent for learning and context retrieval
"""

from __future__ import annotations

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from .memory_store import MemoryStore, memory_store

logger = logging.getLogger(__name__)


class MemoryService:
    """
    High-level service for managing agent memory.
    Handles learning, retrieval, and context injection.
    """
    
    def __init__(self, store: Optional[MemoryStore] = None):
        """
        Initialize Memory Service.
        
        Args:
            store: Optional custom memory store (uses default if not provided)
        """
        self.store = store or memory_store
    
    def get_context_for_prompt(
        self,
        user_message: str,
        current_route: str,
        ui_context: str,
        limit: int = 5
    ) -> str:
        """
        Get relevant memories formatted for prompt injection.
        
        Args:
            user_message: User's current message
            current_route: Current route/page
            ui_context: Current UI context
            limit: Number of memories to include
        
        Returns:
            Formatted memory context string
        """
        # Build query from user message and route
        query = f"{user_message} {current_route}"
        
        # Retrieve relevant memories
        memory_context = self.store.get_memory_context(
            query=query,
            current_route=current_route,
            limit=limit
        )
        
        return memory_context
    
    def learn_from_interaction(
        self,
        user_message: str,
        agent_response: Dict[str, Any],
        route: str,
        success: bool = True,
        executed_actions: Optional[List[Dict[str, Any]]] = None
    ):
        """
        Learn from an interaction and store patterns.
        
        Args:
            user_message: User's message
            agent_response: Agent's response
            route: Current route
            success: Whether interaction was successful
            executed_actions: Results of executed actions (if any)
        """
        try:
            # Determine success from executed actions if provided
            if executed_actions is not None:
                success = all(action.get("success", False) for action in executed_actions)
            
            # Learn from interaction
            self.store.learn_from_interaction(
                user_message=user_message,
                agent_response=agent_response,
                route=route,
                success=success
            )
            
            # Learn from specific patterns
            if executed_actions:
                for action_result in executed_actions:
                    if action_result.get("success"):
                        action = action_result.get("action", {})
                        self.store.add_memory(
                            content=f"Successful {action.get('type')} on element '{action.get('targetId')}' at route {route}",
                            route=route,
                            action_type=action.get("type"),
                            success=True
                        )
            
            logger.info(f"Learned from interaction on {route} (success: {success})")
            
        except Exception as e:
            logger.error(f"Error learning from interaction: {e}", exc_info=True)
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get memory store statistics.
        
        Returns:
            Statistics dictionary
        """
        total_memories = len(self.store.memories)
        memories_by_route = {}
        successful_memories = 0
        
        for memory in self.store.memories.values():
            route = memory.metadata.get('route', 'unknown')
            memories_by_route[route] = memories_by_route.get(route, 0) + 1
            
            if memory.metadata.get('success'):
                successful_memories += 1
        
        return {
            "total_memories": total_memories,
            "memories_by_route": memories_by_route,
            "successful_memories": successful_memories,
            "embeddings_available": self.store.embeddings_model is not None,
            "storage_path": str(self.store.storage_path),
        }


# Global instance
memory_service = MemoryService()

