"""
Reasoning Engine - Chain of Thoughts processing
Handles step-by-step reasoning and thought process tracking
"""

from __future__ import annotations

import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class ReasoningStep:
    """Single step in Chain of Thoughts reasoning"""
    step_number: int
    thought: str
    reasoning: str
    confidence: float
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class ReasoningChain:
    """Complete Chain of Thoughts reasoning process"""
    steps: List[ReasoningStep] = field(default_factory=list)
    final_conclusion: Optional[str] = None
    overall_confidence: float = 0.0
    reasoning_type: str = "standard"  # standard, visual, multi_step


class ReasoningEngine:
    """
    Engine for processing and managing Chain of Thoughts reasoning.
    Extracts, structures, and validates reasoning from AI responses.
    """
    
    def __init__(self):
        self.max_steps = 10
        self.min_confidence = 0.3
    
    def extract_reasoning(
        self,
        ai_response: Dict[str, Any],
        ui_context: Optional[str] = None
    ) -> ReasoningChain:
        """
        Extract and structure reasoning from AI response.
        
        Args:
            ai_response: Raw AI response dictionary
            ui_context: Optional UI context for validation
        
        Returns:
            Structured ReasoningChain
        """
        chain = ReasoningChain()
        
        # Extract reasoning from various possible formats
        reasoning_text = ai_response.get("reasoning", "")
        thoughts = ai_response.get("thoughts", [])
        
        # If thoughts array provided, use it
        if thoughts and isinstance(thoughts, list):
            for i, thought in enumerate(thoughts, 1):
                step = ReasoningStep(
                    step_number=i,
                    thought=str(thought),
                    reasoning=str(thought),
                    confidence=0.8,  # Default confidence for steps
                )
                chain.steps.append(step)
        
        # If reasoning text provided, try to parse it
        elif reasoning_text:
            # Try to extract steps from reasoning text
            steps = self._parse_reasoning_text(reasoning_text)
            if steps:
                chain.steps = steps
            else:
                # Single reasoning block
                chain.steps.append(ReasoningStep(
                    step_number=1,
                    thought="Analysis",
                    reasoning=reasoning_text,
                    confidence=0.7,
                ))
        
        # Extract final conclusion
        chain.final_conclusion = ai_response.get("message", "")
        chain.overall_confidence = float(ai_response.get("confidence", 0.5))
        
        # Determine reasoning type
        if len(chain.steps) > 3:
            chain.reasoning_type = "multi_step"
        elif ui_context and "visual" in ai_response:
            chain.reasoning_type = "visual"
        
        return chain
    
    def _parse_reasoning_text(self, text: str) -> List[ReasoningStep]:
        """
        Parse reasoning text into structured steps.
        Handles various formats:
        - Numbered lists (1., 2., 3.)
        - Bullet points (-, *, •)
        - Step indicators (Step 1:, Step 2:)
        """
        steps = []
        
        # Try numbered list format
        import re
        numbered_pattern = r'(?:^|\n)\s*(\d+)\.\s+(.+?)(?=\n\s*\d+\.|$)'
        matches = re.finditer(numbered_pattern, text, re.MULTILINE | re.DOTALL)
        
        for match in matches:
            step_num = int(match.group(1))
            step_text = match.group(2).strip()
            
            if step_text:
                steps.append(ReasoningStep(
                    step_number=step_num,
                    thought=f"Step {step_num}",
                    reasoning=step_text,
                    confidence=0.7,
                ))
        
        # If no numbered steps found, try step indicators
        if not steps:
            step_pattern = r'(?:^|\n)\s*Step\s+(\d+)[:]\s+(.+?)(?=\n\s*Step\s+\d+:|$)'
            matches = re.finditer(step_pattern, text, re.MULTILINE | re.DOTALL)
            
            for match in matches:
                step_num = int(match.group(1))
                step_text = match.group(2).strip()
                
                if step_text:
                    steps.append(ReasoningStep(
                        step_number=step_num,
                        thought=f"Step {step_num}",
                        reasoning=step_text,
                        confidence=0.7,
                    ))
        
        # If still no steps, try bullet points (treat as single step)
        if not steps and ('-' in text or '*' in text or '•' in text):
            # Extract first meaningful paragraph
            first_paragraph = text.split('\n\n')[0] if '\n\n' in text else text.split('\n')[0]
            if first_paragraph.strip():
                steps.append(ReasoningStep(
                    step_number=1,
                    thought="Analysis",
                    reasoning=first_paragraph.strip(),
                    confidence=0.6,
                ))
        
        return steps
    
    def validate_reasoning(self, chain: ReasoningChain) -> bool:
        """
        Validate reasoning chain for quality and completeness.
        
        Returns:
            True if reasoning is valid, False otherwise
        """
        if not chain.steps:
            return False
        
        if chain.overall_confidence < self.min_confidence:
            return False
        
        # Check if steps are meaningful (not empty)
        for step in chain.steps:
            if not step.reasoning or len(step.reasoning.strip()) < 10:
                return False
        
        return True
    
    def format_reasoning_for_display(self, chain: ReasoningChain) -> str:
        """
        Format reasoning chain for human-readable display.
        
        Returns:
            Formatted reasoning text
        """
        if not chain.steps:
            return chain.final_conclusion or "No reasoning available."
        
        lines = []
        for step in chain.steps:
            lines.append(f"{step.step_number}. {step.thought}")
            lines.append(f"   {step.reasoning}")
            lines.append("")
        
        if chain.final_conclusion:
            lines.append(f"Conclusion: {chain.final_conclusion}")
        
        return "\n".join(lines)


# Global instance
reasoning_engine = ReasoningEngine()

