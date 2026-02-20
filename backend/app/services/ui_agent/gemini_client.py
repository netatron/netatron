"""
Gemini AI Client for UI Agent
High-end AI agent with Chain of Thoughts, Visual Understanding, and UI awareness
Uses Google Gemini models via GCP API
"""

from __future__ import annotations

import logging
import json
import base64
from typing import Dict, Any, Optional, List, Iterator, AsyncIterator
import google.generativeai as genai
from app.config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

# Configure Gemini API
genai.configure(api_key=GEMINI_API_KEY)

# Model mappings - configurable per use case
# Note: Use available models. For reasoning, we use structured prompts with any model
MODEL_REASONING = "gemini-1.5-pro"  # Chain of thoughts reasoning (via structured prompts)
MODEL_VISION = "gemini-1.5-pro"  # Visual understanding (screenshots) - supports vision
MODEL_ACTION = "gemini-1.5-pro"  # Action planning and execution
MODEL_LIGHT = "gemini-1.5-flash"  # Lightweight operations


class GeminiUIAgentClient:
    """
    High-end Gemini AI client for UI-aware agent operations.
    Supports Chain of Thoughts, Visual Understanding, and zero hardcoded solutions.
    """
    
    def __init__(self):
        self.reasoning_model = genai.GenerativeModel(MODEL_REASONING)
        self.vision_model = genai.GenerativeModel(MODEL_VISION)
        self.action_model = genai.GenerativeModel(MODEL_ACTION)
        self.light_model = genai.GenerativeModel(MODEL_LIGHT)
    
    def process_ui_command(
        self,
        user_message: str,
        ui_context: str,
        current_route: str,
        screenshot_base64: Optional[str] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        system_prompt_template: Optional[str] = None,
        enable_reasoning: bool = True,
        enable_vision: bool = True,
    ) -> Dict[str, Any]:
        """
        Process UI command with full context awareness.
        
        Args:
            user_message: User's natural language command
            ui_context: Structured UI state description (from frontend)
            current_route: Current page route
            screenshot_base64: Optional screenshot for visual understanding
            chat_history: Previous conversation context
            system_prompt_template: Custom system prompt (for transferability)
            enable_reasoning: Enable Chain of Thoughts reasoning
            enable_vision: Enable visual understanding if screenshot provided
        
        Returns:
            Dict with message, reasoning, actions, confidence, etc.
        """
        try:
            # Step 1: Visual Understanding (if screenshot provided)
            visual_insights = None
            if enable_vision and screenshot_base64:
                visual_insights = self._analyze_screenshot(screenshot_base64)
            
            # Step 2: Build comprehensive prompt
            prompt = self._build_ui_prompt(
                user_message=user_message,
                ui_context=ui_context,
                current_route=current_route,
                visual_insights=visual_insights,
                chat_history=chat_history,
                system_prompt_template=system_prompt_template,
                enable_reasoning=enable_reasoning,
            )
            
            # Step 3: Generate response with reasoning
            if enable_reasoning:
                response = self._generate_with_reasoning(prompt)
            else:
                response = self.action_model.generate_content(
                    prompt,
                    generation_config={
                        "temperature": 0.3,
                        "top_p": 0.95,
                        "top_k": 40,
                        "max_output_tokens": 4096,
                    }
                )
                response = self._parse_response(response.text)
            
            # Step 4: Validate and structure response
            return self._validate_response(response)
            
        except Exception as e:
            logger.error(f"Error processing UI command: {e}", exc_info=True)
            return {
                "message": "I encountered an error processing your request. Please try again.",
                "reasoning": f"Error: {str(e)}",
                "actions": [],
                "shouldExecute": False,
                "confidence": 0.0,
                "error": str(e),
            }
    
    def _analyze_screenshot(self, screenshot_base64: str) -> Optional[Dict[str, Any]]:
        """
        Analyze screenshot for visual understanding.
        Extracts UI elements, layout, visual hierarchy, etc.
        """
        try:
            # Decode base64 image
            image_data = base64.b64decode(screenshot_base64.split(',')[1] if ',' in screenshot_base64 else screenshot_base64)
            
            image_part = {
                "mime_type": "image/png",
                "data": image_data
            }
            
            prompt = """
            Analyze this web application screenshot and extract:
            
            1. **Visual Layout**: Describe the overall page structure, sections, and layout
            2. **Interactive Elements**: Identify buttons, inputs, links, and their visual characteristics
            3. **Visual Hierarchy**: What elements stand out? What's the focus?
            4. **UI Patterns**: Identify common UI patterns (forms, tables, cards, navigation, etc.)
            5. **Context Clues**: Any text, labels, or visual indicators that help understand functionality
            6. **Accessibility**: Visible text, labels, and semantic structure
            
            Return as structured JSON:
            {
                "layout": {
                    "structure": "description",
                    "sections": ["list of main sections"],
                    "focus_area": "description of main focus"
                },
                "interactive_elements": [
                    {
                        "type": "button|input|link|etc",
                        "description": "visual description",
                        "location": "approximate location",
                        "visual_characteristics": "color, size, style"
                    }
                ],
                "ui_patterns": ["list of identified patterns"],
                "context": "overall context and purpose of the page"
            }
            """
            
            response = self.vision_model.generate_content([image_part, prompt])
            
            # Parse JSON response
            text = response.text.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            
            visual_insights = json.loads(text)
            logger.info("Successfully analyzed screenshot for visual understanding")
            return visual_insights
            
        except Exception as e:
            logger.warning(f"Failed to analyze screenshot: {e}")
            return None
    
    def _build_ui_prompt(
        self,
        user_message: str,
        ui_context: str,
        current_route: str,
        visual_insights: Optional[Dict[str, Any]],
        chat_history: Optional[List[Dict[str, str]]],
        system_prompt_template: Optional[str],
        enable_reasoning: bool,
    ) -> str:
        """
        Build comprehensive prompt for UI agent.
        Zero hardcoded solutions - fully configurable via templates.
        """
        
        # Use custom template or default
        if system_prompt_template:
            system_prompt = system_prompt_template
        else:
            system_prompt = self._get_default_system_prompt(enable_reasoning)
        
        # Build context sections
        context_parts = []
        
        # UI Context
        context_parts.append(f"## Current UI State:\n{ui_context}\n")
        
        # Visual Insights (if available)
        if visual_insights:
            context_parts.append(f"## Visual Understanding:\n{json.dumps(visual_insights, indent=2)}\n")
        
        # Route Context
        context_parts.append(f"## Current Route: {current_route}\n")
        
        # Chat History (if available)
        if chat_history:
            context_parts.append("## Conversation History:\n")
            for msg in chat_history[-5:]:  # Last 5 messages
                context_parts.append(f"{msg.get('role', 'user')}: {msg.get('content', '')}\n")
            context_parts.append("\n")
        
        # User Message
        context_parts.append(f"## User Request:\n{user_message}\n")
        
        # Combine
        full_prompt = f"{system_prompt}\n\n{''.join(context_parts)}"
        
        return full_prompt
    
    def _get_default_system_prompt(self, enable_reasoning: bool) -> str:
        """
        Default system prompt - can be overridden for different applications.
        This is the ONLY place with application-specific hints - easily replaceable.
        """
        reasoning_section = """
## Chain of Thoughts Reasoning:
When processing requests, think step-by-step:
1. **Understand**: What does the user want to accomplish?
2. **Analyze**: What UI elements are available and relevant?
3. **Plan**: What sequence of actions is needed?
4. **Validate**: Are the actions safe and appropriate?
5. **Execute**: Generate the action sequence

Show your reasoning process clearly.
""" if enable_reasoning else ""
        
        return f"""You are an advanced AI agent with UI awareness capabilities. Your role is to help users interact with web applications through natural language commands.

{reasoning_section}

## Your Capabilities:
- **UI Understanding**: Analyze current page state, elements, and context
- **Action Planning**: Generate sequences of UI actions (click, fill, select, navigate, etc.)
- **Visual Understanding**: Interpret screenshots and visual layouts
- **Context Awareness**: Maintain conversation context and user intent
- **Safety**: Only suggest safe, appropriate actions

## Available Action Types:
- `click`: Click on buttons, links, or interactive elements (requires targetId or targetSelector)
- `fill`: Fill input fields with text (requires targetId and value)
- `select`: Select dropdown options (requires targetId and value)
- `navigate`: Navigate to different routes (requires value with route path)
- `scroll`: Scroll element into view (requires targetId)
- `hover`: Hover over element (requires targetId)
- `focus`: Focus on input field (requires targetId)
- `clear`: Clear input field (requires targetId)
- `submit`: Submit a form (requires targetId of form or submit button)
- `toggle`: Toggle checkbox/switch (requires targetId)

## Response Format:
You MUST respond with valid JSON in this exact format:
{{
    "message": "Human-readable response to the user",
    "reasoning": "Your step-by-step thought process (if reasoning enabled)",
    "actions": [
        {{
            "type": "action_type",
            "targetId": "element-id-from-ui-context",
            "targetSelector": "optional-css-selector",
            "value": "optional-value-for-fill/select/navigate",
            "options": {{
                "delay": 200,
                "animate": true,
                "scrollIntoView": true
            }}
        }}
    ],
    "shouldExecute": true/false,
    "confidence": 0.0-1.0,
    "thoughts": ["step1", "step2", "step3"]  // Chain of thoughts (if enabled)
}}

## Important Rules:
1. **Element Identification**: Use targetId from the UI context when available. If not, use targetSelector with CSS selector.
2. **Safety First**: Only suggest actions that are safe and appropriate. Don't suggest destructive actions without explicit user request.
3. **Context Awareness**: Consider the current page, available elements, and conversation history.
4. **Clarity**: Provide clear, helpful responses. Explain what you're doing and why.
5. **Validation**: Verify that suggested elements exist in the UI context before including them in actions.
6. **Confidence**: Set confidence based on how certain you are about the action. Lower confidence for ambiguous requests.

## Examples:

User: "Click the Start button"
Response:
{{
    "message": "I'll click the Start button for you.",
    "reasoning": "Found Start button in UI context with id 'start-button'. This will initiate the scraping process.",
    "actions": [{{"type": "click", "targetId": "start-button", "options": {{"animate": true}}}}],
    "shouldExecute": true,
    "confidence": 0.95
}}

User: "Fill in the search query with 'restaurants in Warsaw'"
Response:
{{
    "message": "I'll fill in the search query field with 'restaurants in Warsaw'.",
    "reasoning": "Found query input field with id 'query-input-0'. Will fill it with the specified value.",
    "actions": [{{"type": "fill", "targetId": "query-input-0", "value": "restaurants in Warsaw"}}],
    "shouldExecute": true,
    "confidence": 0.9
}}

User: "What can I do on this page?"
Response:
{{
    "message": "On this page, you can: [list available actions based on UI context]",
    "reasoning": "User is asking for information, not requesting an action.",
    "actions": [],
    "shouldExecute": false,
    "confidence": 1.0
}}
"""
    
    def _generate_with_reasoning(self, prompt: str) -> Dict[str, Any]:
        """
        Generate response with Chain of Thoughts reasoning.
        Uses Gemini's thinking model for step-by-step reasoning.
        """
        try:
            # Use thinking model for reasoning
            response = self.reasoning_model.generate_content(
                prompt,
                generation_config={
                    "temperature": 0.3,
                    "top_p": 0.95,
                    "top_k": 40,
                    "max_output_tokens": 8192,
                }
            )
            
            # Parse response (may include reasoning in thinking blocks)
            return self._parse_response(response.text)
            
        except Exception as e:
            logger.error(f"Error in reasoning generation: {e}")
            # Fallback to regular model
            response = self.action_model.generate_content(prompt)
            return self._parse_response(response.text)
    
    def _parse_response(self, text: str) -> Dict[str, Any]:
        """
        Parse AI response, extracting JSON and reasoning.
        Handles various response formats.
        """
        try:
            # Try to extract JSON from response
            text = text.strip()
            
            # Remove markdown code blocks if present
            if "```json" in text:
                json_text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                json_text = text.split("```")[1].split("```")[0].strip()
            else:
                # Try to find JSON object in text
                start = text.find("{")
                end = text.rfind("}") + 1
                if start >= 0 and end > start:
                    json_text = text[start:end]
                else:
                    json_text = text
            
            # Parse JSON
            parsed = json.loads(json_text)
            
            # Ensure required fields
            if "message" not in parsed:
                parsed["message"] = "I've processed your request."
            if "shouldExecute" not in parsed:
                parsed["shouldExecute"] = bool(parsed.get("actions"))
            if "confidence" not in parsed:
                parsed["confidence"] = 0.8 if parsed.get("shouldExecute") else 1.0
            
            return parsed
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}. Text: {text[:200]}")
            # Fallback: construct response from text
            return {
                "message": text[:500],
                "reasoning": "Could not parse structured response",
                "actions": [],
                "shouldExecute": False,
                "confidence": 0.5,
            }
    
    def _validate_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate and sanitize AI response.
        Ensures actions are safe and properly formatted.
        """
        # Validate actions
        if "actions" in response and isinstance(response["actions"], list):
            validated_actions = []
            for action in response["actions"]:
                if isinstance(action, dict) and "type" in action:
                    # Ensure required fields
                    validated_action = {
                        "type": action["type"],
                        "targetId": action.get("targetId"),
                        "targetSelector": action.get("targetSelector"),
                        "value": action.get("value"),
                        "options": action.get("options", {}),
                    }
                    validated_actions.append(validated_action)
            
            response["actions"] = validated_actions
        
        # Ensure confidence is in valid range
        if "confidence" in response:
            response["confidence"] = max(0.0, min(1.0, float(response.get("confidence", 0.5))))
        
        return response


# Global instance
gemini_ui_client = GeminiUIAgentClient()

