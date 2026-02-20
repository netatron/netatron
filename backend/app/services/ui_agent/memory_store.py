"""
Memory Store - RAG system for UI Agent
Stores and retrieves memories (interactions, learned patterns) using embeddings
Enables agent to learn and remember application-specific patterns
"""

from __future__ import annotations

import logging
import json
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass, asdict
from pathlib import Path
import hashlib
import os

# Embeddings - use lightweight solution
try:
    from sentence_transformers import SentenceTransformer
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False
    SentenceTransformer = None

# Vector store - simple in-memory with optional persistence
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    np = None

logger = logging.getLogger(__name__)


@dataclass
class Memory:
    """Single memory entry"""
    id: str
    content: str  # The actual memory content
    embedding: Optional[List[float]] = None  # Vector embedding
    metadata: Dict[str, Any] = None  # route, action_type, success, etc.
    timestamp: datetime = None
    access_count: int = 0
    last_accessed: Optional[datetime] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        if self.timestamp is None:
            self.timestamp = datetime.now()


class MemoryStore:
    """
    RAG-based memory store for UI Agent.
    Stores memories as embeddings and retrieves relevant ones based on similarity.
    
    Features:
    - Semantic search (embeddings)
    - Memory persistence
    - Relevance scoring
    - Automatic cleanup (old/unused memories)
    """
    
    def __init__(
        self,
        storage_path: Optional[Path] = None,
        model_name: Optional[str] = None,  # Lightweight, fast embeddings
        max_memories: Optional[int] = None,
        similarity_threshold: Optional[float] = None
    ):
        """
        Initialize Memory Store.
        
        Args:
            storage_path: Optional path to persist memories
            model_name: Sentence transformer model name
            max_memories: Maximum number of memories to keep
            similarity_threshold: Minimum similarity for retrieval (0-1)
        """
        # Load from config if available
        try:
            from app.config import (
                MEMORY_STORAGE_PATH,
                MEMORY_MAX_MEMORIES,
                MEMORY_SIMILARITY_THRESHOLD,
                MEMORY_EMBEDDINGS_MODEL
            )
            self.storage_path = storage_path or MEMORY_STORAGE_PATH
            self.max_memories = max_memories if max_memories is not None else MEMORY_MAX_MEMORIES
            self.similarity_threshold = similarity_threshold if similarity_threshold is not None else MEMORY_SIMILARITY_THRESHOLD
            model_name = model_name or MEMORY_EMBEDDINGS_MODEL
        except ImportError:
            # Fallback if config not available
            self.storage_path = storage_path or Path(os.getenv("MEMORY_STORAGE_PATH", "/tmp/ui_agent_memories.json"))
            self.max_memories = max_memories or int(os.getenv("MEMORY_MAX_MEMORIES", "1000"))
            self.similarity_threshold = similarity_threshold or float(os.getenv("MEMORY_SIMILARITY_THRESHOLD", "0.5"))
            model_name = model_name or os.getenv("MEMORY_EMBEDDINGS_MODEL", "all-MiniLM-L6-v2")
        self.max_memories = max_memories
        self.similarity_threshold = similarity_threshold
        
        # Initialize embeddings model
        self.embeddings_model = None
        if EMBEDDINGS_AVAILABLE:
            try:
                self.embeddings_model = SentenceTransformer(model_name)
                logger.info(f"Loaded embeddings model: {model_name}")
            except Exception as e:
                logger.warning(f"Failed to load embeddings model: {e}")
                self.embeddings_model = None
        
        # In-memory storage
        self.memories: Dict[str, Memory] = {}
        self.embeddings_matrix: Optional[np.ndarray] = None
        self.memory_ids: List[str] = []
        
        # Load existing memories
        self._load_memories()
    
    def _load_memories(self):
        """Load memories from disk if available"""
        try:
            if self.storage_path.exists():
                with open(self.storage_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    for mem_data in data.get('memories', []):
                        memory = Memory(
                            id=mem_data['id'],
                            content=mem_data['content'],
                            embedding=mem_data.get('embedding'),
                            metadata=mem_data.get('metadata', {}),
                            timestamp=datetime.fromisoformat(mem_data['timestamp']),
                            access_count=mem_data.get('access_count', 0),
                            last_accessed=datetime.fromisoformat(mem_data['last_accessed']) if mem_data.get('last_accessed') else None
                        )
                        self.memories[memory.id] = memory
                
                # Rebuild embeddings matrix
                self._rebuild_embeddings_matrix()
                logger.info(f"Loaded {len(self.memories)} memories from {self.storage_path}")
        except Exception as e:
            logger.warning(f"Failed to load memories: {e}")
    
    def _save_memories(self):
        """Save memories to disk"""
        try:
            data = {
                'memories': [
                    {
                        'id': mem.id,
                        'content': mem.content,
                        'embedding': mem.embedding,
                        'metadata': mem.metadata,
                        'timestamp': mem.timestamp.isoformat(),
                        'access_count': mem.access_count,
                        'last_accessed': mem.last_accessed.isoformat() if mem.last_accessed else None
                    }
                    for mem in self.memories.values()
                ]
            }
            
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.storage_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            logger.debug(f"Saved {len(self.memories)} memories to {self.storage_path}")
        except Exception as e:
            logger.warning(f"Failed to save memories: {e}")
    
    def _generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate embedding for text"""
        if not self.embeddings_model:
            return None
        
        try:
            embedding = self.embeddings_model.encode(text, convert_to_numpy=True)
            return embedding.tolist()
        except Exception as e:
            logger.warning(f"Failed to generate embedding: {e}")
            return None
    
    def _rebuild_embeddings_matrix(self):
        """Rebuild embeddings matrix for fast similarity search"""
        if not NUMPY_AVAILABLE or not self.embeddings_model:
            return
        
        try:
            valid_memories = [
                (mem_id, mem) for mem_id, mem in self.memories.items()
                if mem.embedding is not None
            ]
            
            if not valid_memories:
                self.embeddings_matrix = None
                self.memory_ids = []
                return
            
            self.memory_ids = [mem_id for mem_id, _ in valid_memories]
            embeddings_list = [mem.embedding for _, mem in valid_memories]
            self.embeddings_matrix = np.array(embeddings_list)
            
            logger.debug(f"Rebuilt embeddings matrix: {len(self.memory_ids)} memories")
        except Exception as e:
            logger.warning(f"Failed to rebuild embeddings matrix: {e}")
    
    def add_memory(
        self,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        route: Optional[str] = None,
        action_type: Optional[str] = None,
        success: Optional[bool] = None
    ) -> str:
        """
        Add a new memory.
        
        Args:
            content: Memory content (what was learned/remembered)
            metadata: Additional metadata
            route: Route/page where this happened
            action_type: Type of action (if applicable)
            success: Whether action was successful
        
        Returns:
            Memory ID
        """
        # Generate memory ID
        content_hash = hashlib.md5(content.encode()).hexdigest()[:8]
        memory_id = f"mem_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{content_hash}"
        
        # Generate embedding
        embedding = self._generate_embedding(content)
        
        # Create memory
        memory = Memory(
            id=memory_id,
            content=content,
            embedding=embedding,
            metadata={
                **(metadata or {}),
                "route": route,
                "action_type": action_type,
                "success": success,
            },
            timestamp=datetime.now()
        )
        
        # Add to store
        self.memories[memory_id] = memory
        
        # Rebuild embeddings matrix
        if embedding:
            self._rebuild_embeddings_matrix()
        
        # Cleanup if too many memories
        if len(self.memories) > self.max_memories:
            self._cleanup_old_memories()
        
        # Save to disk
        self._save_memories()
        
        logger.info(f"Added memory: {memory_id} ({len(content)} chars)")
        return memory_id
    
    def retrieve_relevant_memories(
        self,
        query: str,
        limit: int = 5,
        route_filter: Optional[str] = None,
        min_similarity: Optional[float] = None
    ) -> List[Tuple[Memory, float]]:
        """
        Retrieve relevant memories based on semantic similarity.
        
        Args:
            query: Search query
            limit: Maximum number of memories to return
            route_filter: Optional filter by route
            min_similarity: Minimum similarity threshold (overrides default)
        
        Returns:
            List of (Memory, similarity_score) tuples, sorted by relevance
        """
        if not self.embeddings_model or not NUMPY_AVAILABLE:
            # Fallback: simple text matching
            return self._retrieve_simple(query, limit, route_filter)
        
        try:
            # Generate query embedding
            query_embedding = self.embeddings_model.encode(query, convert_to_numpy=True)
            
            if self.embeddings_matrix is None or len(self.memory_ids) == 0:
                return []
            
            # Calculate similarities
            similarities = np.dot(self.embeddings_matrix, query_embedding)
            
            # Get top matches
            top_indices = np.argsort(similarities)[::-1][:limit * 2]  # Get more for filtering
            
            threshold = min_similarity or self.similarity_threshold
            results = []
            
            for idx in top_indices:
                if similarities[idx] < threshold:
                    continue
                
                memory_id = self.memory_ids[idx]
                memory = self.memories[memory_id]
                
                # Apply route filter if specified
                if route_filter and memory.metadata.get('route') != route_filter:
                    continue
                
                # Update access stats
                memory.access_count += 1
                memory.last_accessed = datetime.now()
                
                results.append((memory, float(similarities[idx])))
                
                if len(results) >= limit:
                    break
            
            # Save updated access stats
            if results:
                self._save_memories()
            
            return results
            
        except Exception as e:
            logger.error(f"Error retrieving memories: {e}", exc_info=True)
            return self._retrieve_simple(query, limit, route_filter)
    
    def _retrieve_simple(self, query: str, limit: int, route_filter: Optional[str]) -> List[Tuple[Memory, float]]:
        """Simple text-based retrieval fallback"""
        query_lower = query.lower()
        results = []
        
        for memory in self.memories.values():
            if route_filter and memory.metadata.get('route') != route_filter:
                continue
            
            # Simple keyword matching
            content_lower = memory.content.lower()
            score = sum(1 for word in query_lower.split() if word in content_lower) / max(len(query_lower.split()), 1)
            
            if score > 0:
                memory.access_count += 1
                memory.last_accessed = datetime.now()
                results.append((memory, score))
        
        # Sort by score
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:limit]
    
    def _cleanup_old_memories(self):
        """Remove least accessed memories if over limit"""
        if len(self.memories) <= self.max_memories:
            return
        
        # Sort by access count and last accessed
        sorted_memories = sorted(
            self.memories.items(),
            key=lambda x: (x[1].access_count, x[1].last_accessed or datetime.min)
        )
        
        # Remove oldest/least accessed
        to_remove = len(self.memories) - self.max_memories
        for memory_id, _ in sorted_memories[:to_remove]:
            del self.memories[memory_id]
        
        self._rebuild_embeddings_matrix()
        logger.info(f"Cleaned up {to_remove} old memories")
    
    def get_memory_context(
        self,
        query: str,
        current_route: Optional[str] = None,
        limit: int = 5
    ) -> str:
        """
        Get formatted memory context for prompt injection.
        
        Args:
            query: Current query/context
            current_route: Current route (for filtering)
            limit: Number of memories to include
        
        Returns:
            Formatted string with relevant memories
        """
        memories = self.retrieve_relevant_memories(
            query,
            limit=limit,
            route_filter=current_route
        )
        
        if not memories:
            return ""
        
        context_parts = ["## Relevant Memories (Learned Patterns):"]
        
        for memory, similarity in memories:
            context_parts.append(f"\n### Memory (similarity: {similarity:.2f})")
            context_parts.append(f"Content: {memory.content}")
            if memory.metadata.get('route'):
                context_parts.append(f"Route: {memory.metadata['route']}")
            if memory.metadata.get('action_type'):
                context_parts.append(f"Action: {memory.metadata['action_type']}")
            if memory.metadata.get('success') is not None:
                context_parts.append(f"Success: {memory.metadata['success']}")
        
        return "\n".join(context_parts)
    
    def learn_from_interaction(
        self,
        user_message: str,
        agent_response: Dict[str, Any],
        route: str,
        success: bool = True
    ):
        """
        Learn from an interaction and store as memory.
        
        Args:
            user_message: User's message
            agent_response: Agent's response
            route: Current route
            success: Whether interaction was successful
        """
        # Extract learnable patterns
        learnings = []
        
        # Learn from successful actions
        if success and agent_response.get("actions"):
            for action in agent_response["actions"]:
                action_type = action.get("type")
                target_id = action.get("targetId")
                
                if action_type and target_id:
                    learning = f"On route {route}, to {action_type} use element with id '{target_id}'"
                    learnings.append(learning)
        
        # Learn from reasoning
        if agent_response.get("reasoning"):
            learning = f"On route {route}: {agent_response['reasoning']}"
            learnings.append(learning)
        
        # Learn from user patterns
        if user_message:
            learning = f"User pattern on {route}: {user_message}"
            learnings.append(learning)
        
        # Store learnings
        for learning in learnings:
            self.add_memory(
                content=learning,
                route=route,
                action_type=agent_response.get("actions", [{}])[0].get("type") if agent_response.get("actions") else None,
                success=success
            )
        
        logger.info(f"Learned {len(learnings)} patterns from interaction on {route}")


# Global instance (can be customized per application)
memory_store = MemoryStore()

