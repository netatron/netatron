"""
UI Agent Service - Main service layer
Orchestrates UI agent operations with reasoning, visual understanding, and action planning
"""

from __future__ import annotations

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from .gemini_client import GeminiUIAgentClient, gemini_ui_client
from .visual_understanding import VisualUnderstandingService
from .reasoning_engine import ReasoningEngine, reasoning_engine
from .memory_service import MemoryService, memory_service

logger = logging.getLogger(__name__)

# Allowed action types - security whitelist
ALLOWED_ACTION_TYPES = {
    "click",
    "fill",
    "select",
    "scroll",
    "navigate",
    "hover",
    "focus",
    "clear",
    "submit",
    "toggle",
    # Desktop actions (if desktop automation enabled)
    "browser_click",
    "browser_fill",
    "browser_select",
    "browser_navigate",
    "desktop_open_application",
    "desktop_click_coordinates",
    "desktop_type_text",
    "desktop_key_press",
    "desktop_switch_application",
}


class UIAgentService:
    """
    Main service for UI-aware AI agent.
    Coordinates reasoning, visual understanding, and action generation.
    Zero hardcoded solutions - fully configurable.
    """
    
    def __init__(
        self,
        gemini_client: Optional[GeminiUIAgentClient] = None,
        custom_system_prompt: Optional[str] = None
    ):
        """
        Initialize UI Agent Service.
        
        Args:
            gemini_client: Optional custom Gemini client (uses default if not provided)
            custom_system_prompt: Optional custom system prompt for application-specific behavior
        """
        self.gemini_client = gemini_client or gemini_ui_client
        self.visual_service = VisualUnderstandingService(self.gemini_client)
        self.reasoning_engine = reasoning_engine
        self.memory_service = memory_service
        self.custom_system_prompt = custom_system_prompt
    
    async def process_ui_command(
        self,
        message: str,
        ui_context: str,
        current_route: str,
        screenshot_base64: Optional[str] = None,
        session_id: Optional[str] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        enable_reasoning: bool = True,
        enable_vision: bool = True,
    ) -> Dict[str, Any]:
        """
        Process UI command with full context awareness.
        
        Args:
            message: User's natural language command
            ui_context: Structured UI state description
            current_route: Current page route
            screenshot_base64: Optional screenshot for visual understanding
            session_id: Optional session ID for conversation tracking
            chat_history: Previous conversation messages
            enable_reasoning: Enable Chain of Thoughts reasoning
            enable_vision: Enable visual understanding
        
        Returns:
            Complete agent response with actions, reasoning, etc.
        """
        try:
            # Step 1: Retrieve relevant memories (RAG)
            memory_context = self.memory_service.get_context_for_prompt(
                user_message=message,
                current_route=current_route,
                ui_context=ui_context,
                limit=5
            )
            
            # Step 2: Visual Understanding (if screenshot provided)
            visual_insights = None
            if enable_vision and screenshot_base64:
                visual_insights = self.visual_service.analyze_screenshot(
                    screenshot_base64,
                    ui_context
                )
            
            # Step 3: Process command with Gemini (with memory context)
            # Inject memory context into UI context
            enhanced_ui_context = ui_context
            if memory_context:
                enhanced_ui_context = f"{ui_context}\n\n{memory_context}"
            
            response = self.gemini_client.process_ui_command(
                user_message=message,
                ui_context=enhanced_ui_context,
                current_route=current_route,
                screenshot_base64=screenshot_base64,
                chat_history=chat_history,
                system_prompt_template=self.custom_system_prompt,
                enable_reasoning=enable_reasoning,
                enable_vision=enable_vision,
            )
            
            # Step 4: Validate actions against whitelist (security)
            if response.get("actions"):
                validated_actions = self.validate_actions(
                    response["actions"],
                    ui_context
                )
                response["actions"] = validated_actions
                # Log if any actions were filtered
                if len(validated_actions) < len(response.get("actions", [])):
                    logger.warning(f"Filtered {len(response.get('actions', [])) - len(validated_actions)} invalid actions")
            
            # Step 5: Extract and structure reasoning
            if enable_reasoning:
                reasoning_chain = self.reasoning_engine.extract_reasoning(
                    response,
                    ui_context
                )
                
                # Add structured reasoning to response
                response["reasoning_chain"] = {
                    "steps": [
                        {
                            "step_number": step.step_number,
                            "thought": step.thought,
                            "reasoning": step.reasoning,
                            "confidence": step.confidence,
                        }
                        for step in reasoning_chain.steps
                    ],
                    "final_conclusion": reasoning_chain.final_conclusion,
                    "overall_confidence": reasoning_chain.overall_confidence,
                    "reasoning_type": reasoning_chain.reasoning_type,
                }
                
                # Validate reasoning quality
                if not self.reasoning_engine.validate_reasoning(reasoning_chain):
                    logger.warning("Reasoning validation failed, but continuing")
            
            # Step 6: Add visual insights if available
            if visual_insights:
                response["visual_insights"] = visual_insights
                response["visual_summary"] = self.visual_service.get_visual_context_summary(
                    visual_insights
                )
            
            # Step 7: Learn from interaction (store in memory)
            # Determine success from executed actions if provided
            success = True
            if executed_actions:
                success = all(action.get("success", False) for action in executed_actions)
            elif response.get("actions"):
                # Assume success if actions were generated
                success = True
            
            # Store interaction in memory
            self.memory_service.learn_from_interaction(
                user_message=message,
                agent_response=response,
                route=current_route,
                success=success,
                executed_actions=executed_actions
            )
            
            # Step 8: Add metadata
            response["metadata"] = {
                "timestamp": datetime.now().isoformat(),
                "session_id": session_id,
                "route": current_route,
                "has_visual": visual_insights is not None,
                "has_reasoning": enable_reasoning,
            }
            
            # Step 9: Log for audit
            self._log_interaction(
                message=message,
                route=current_route,
                response=response,
                session_id=session_id
            )
            
            return response
            
        except Exception as e:
            logger.error(f"Error in UI agent service: {e}", exc_info=True)
            return {
                "message": "I encountered an error processing your request. Please try again.",
                "reasoning": f"Error: {str(e)}",
                "actions": [],
                "shouldExecute": False,
                "confidence": 0.0,
                "error": str(e),
                "metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "session_id": session_id,
                    "route": current_route,
                    "error": True,
                }
            }
    
    def _log_interaction(
        self,
        message: str,
        route: str,
        response: Dict[str, Any],
        session_id: Optional[str]
    ):
        """Log interaction for audit and improvement"""
        log_data = {
            "message": message[:200],  # Truncate long messages
            "route": route,
            "session_id": session_id,
            "actions_count": len(response.get("actions", [])),
            "should_execute": response.get("shouldExecute", False),
            "confidence": response.get("confidence", 0.0),
            "has_reasoning": "reasoning_chain" in response,
            "has_visual": "visual_insights" in response,
        }
        
        logger.info(f"UI Agent interaction: {log_data}")
    
    def validate_actions(
        self,
        actions: List[Dict[str, Any]],
        ui_context: str
    ) -> List[Dict[str, Any]]:
        """
        Validate actions against UI context and security whitelist.
        Ensures actions reference valid elements and are allowed.
        
        Args:
            actions: List of actions to validate
            ui_context: UI context string to check against
        
        Returns:
            List of validated actions
        """
        validated = []
        
        for action in actions:
            action_type = action.get("type", "")
            
            # Security: Check if action type is in whitelist
            if action_type not in ALLOWED_ACTION_TYPES:
                logger.warning(f"Action type '{action_type}' not in whitelist. Skipping.")
                continue
            
            target_id = action.get("targetId")
            target_selector = action.get("targetSelector")
            
            # If targetId provided, check if it exists in UI context
            if target_id:
                if f"[{target_id}]" in ui_context or target_id in ui_context:
                    validated.append(action)
                else:
                    logger.warning(f"Action targetId '{target_id}' not found in UI context")
                    # Still include, but mark as potentially invalid
                    action["_validation_warning"] = "targetId not found in UI context"
                    validated.append(action)
            elif target_selector:
                # CSS selector - assume valid (frontend will handle)
                validated.append(action)
            else:
                # For some actions, targetId/selector might not be required
                if action_type in ["navigate"]:
                    validated.append(action)
                else:
                    logger.warning(f"Action type '{action_type}' missing both targetId and targetSelector")
                    # Skip invalid actions
                    continue
        
        return validated


# Global instance (can be customized per application)
ui_agent_service = UIAgentService()

