"""
Visual Understanding Service
Handles screenshot analysis and visual UI understanding
"""

from __future__ import annotations

import logging
import base64
from typing import Dict, Any, Optional, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class VisualElement:
    """Detected visual element from screenshot"""
    type: str  # button, input, link, text, image, etc.
    description: str
    location: Dict[str, float]  # x, y, width, height (normalized 0-1)
    visual_characteristics: Dict[str, Any]  # color, size, style, etc.
    confidence: float


@dataclass
class VisualLayout:
    """Layout structure from visual analysis"""
    structure: str
    sections: List[str]
    focus_area: str
    visual_hierarchy: List[str]
    ui_patterns: List[str]


class VisualUnderstandingService:
    """
    Service for visual understanding of UI screenshots.
    Analyzes screenshots to extract visual context, layout, and element information.
    """
    
    def __init__(self, gemini_client):
        """
        Initialize with Gemini client for vision analysis.
        
        Args:
            gemini_client: GeminiUIAgentClient instance
        """
        self.gemini_client = gemini_client
    
    def analyze_screenshot(
        self,
        screenshot_base64: str,
        ui_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze screenshot for visual understanding.
        
        Args:
            screenshot_base64: Base64 encoded screenshot
            ui_context: Optional structured UI context for cross-validation
        
        Returns:
            Dictionary with visual insights
        """
        try:
            # Use Gemini client's visual analysis
            visual_insights = self.gemini_client._analyze_screenshot(screenshot_base64)
            
            if not visual_insights:
                return self._get_default_insights()
            
            # Enhance with cross-validation if UI context available
            if ui_context:
                visual_insights = self._cross_validate_with_ui_context(
                    visual_insights,
                    ui_context
                )
            
            return visual_insights
            
        except Exception as e:
            logger.error(f"Error in visual understanding: {e}", exc_info=True)
            return self._get_default_insights()
    
    def _cross_validate_with_ui_context(
        self,
        visual_insights: Dict[str, Any],
        ui_context: str
    ) -> Dict[str, Any]:
        """
        Cross-validate visual insights with structured UI context.
        Improves accuracy by combining visual and structural understanding.
        """
        # Extract element IDs from UI context
        import re
        element_ids = re.findall(r'\[([^\]]+)\]', ui_context)
        
        # Enhance visual insights with element IDs
        if "interactive_elements" in visual_insights:
            for i, element in enumerate(visual_insights["interactive_elements"]):
                if i < len(element_ids):
                    element["suggested_id"] = element_ids[i]
        
        return visual_insights
    
    def _get_default_insights(self) -> Dict[str, Any]:
        """Return default visual insights when analysis fails"""
        return {
            "layout": {
                "structure": "standard",
                "sections": [],
                "focus_area": "unknown"
            },
            "interactive_elements": [],
            "ui_patterns": [],
            "context": "Visual analysis unavailable"
        }
    
    def extract_actionable_elements(
        self,
        visual_insights: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Extract actionable elements from visual insights.
        Returns list of elements that can be interacted with.
        """
        actionable = []
        
        if "interactive_elements" in visual_insights:
            for element in visual_insights["interactive_elements"]:
                element_type = element.get("type", "").lower()
                if element_type in ["button", "input", "link", "select", "checkbox", "radio"]:
                    actionable.append({
                        "type": element_type,
                        "description": element.get("description", ""),
                        "location": element.get("location", {}),
                        "visual_characteristics": element.get("visual_characteristics", {}),
                        "suggested_id": element.get("suggested_id"),
                    })
        
        return actionable
    
    def get_visual_context_summary(self, visual_insights: Dict[str, Any]) -> str:
        """
        Generate human-readable summary of visual insights.
        """
        if not visual_insights:
            return "Visual analysis unavailable."
        
        parts = []
        
        if "layout" in visual_insights:
            layout = visual_insights["layout"]
            parts.append(f"Layout: {layout.get('structure', 'unknown')}")
            if layout.get("sections"):
                parts.append(f"Sections: {', '.join(layout['sections'])}")
            if layout.get("focus_area"):
                parts.append(f"Focus: {layout['focus_area']}")
        
        if "ui_patterns" in visual_insights and visual_insights["ui_patterns"]:
            parts.append(f"UI Patterns: {', '.join(visual_insights['ui_patterns'])}")
        
        if "interactive_elements" in visual_insights:
            count = len(visual_insights["interactive_elements"])
            parts.append(f"Interactive Elements: {count}")
        
        return ". ".join(parts) if parts else "No visual context available."

