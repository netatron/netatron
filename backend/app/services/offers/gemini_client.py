"""
Gemini AI Client for Offer Generator
High-end offer generation using Google Gemini models
"""
from __future__ import annotations

import logging
from typing import AsyncIterator, Iterator, List, Dict, Any, Optional
import google.generativeai as genai
from app.config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

# Configure Gemini API
genai.configure(api_key=GEMINI_API_KEY)

# Model mappings
MODEL_OFFER_GENERATION = "gemini-3.0-pro"  # High-end offer generation
MODEL_VISION_ANALYSIS = "gemini-2.0-flash-exp-vision"  # Image/PDF style analysis
MODEL_LIGHT_OPERATIONS = "gemini-1.5-flash"  # Lightweight operations


class GeminiOfferClient:
    """Client for Gemini AI offer generation and analysis"""
    
    def __init__(self):
        self.generation_model = genai.GenerativeModel(MODEL_OFFER_GENERATION)
        self.vision_model = genai.GenerativeModel(MODEL_VISION_ANALYSIS)
        self.light_model = genai.GenerativeModel(MODEL_LIGHT_OPERATIONS)
    
    def analyze_offer_style(
        self,
        image_data: bytes,
        mime_type: str = "image/png"
    ) -> Dict[str, Any]:
        """
        Analyze uploaded offer image/PDF to extract style information.
        Returns: colors, fonts, layout_structure, typography, spacing, etc.
        """
        try:
            # Upload image for analysis
            image_part = {
                "mime_type": mime_type,
                "data": image_data
            }
            
            prompt = """
            Analyze this offer/document image and extract:
            1. Color palette (primary, secondary, accent colors with hex codes)
            2. Typography (font families, sizes, weights, hierarchy)
            3. Layout structure (sections, spacing, alignment)
            4. Design style (modern, classic, minimalist, etc.)
            5. Visual elements (logos, icons, images placement)
            
            Return as structured JSON:
            {
                "colors": {
                    "primary": "#hex",
                    "secondary": "#hex",
                    "accent": "#hex",
                    "background": "#hex",
                    "text": "#hex"
                },
                "typography": {
                    "primary_font": "font name",
                    "heading_sizes": [{"level": 1, "size": "px"}],
                    "body_size": "px",
                    "font_weights": {"heading": "weight", "body": "weight"}
                },
                "layout": {
                    "structure": "description",
                    "spacing_unit": "px",
                    "max_width": "px",
                    "alignment": "left|center|right"
                },
                "style": "description",
                "elements": ["list of visual elements"]
            }
            """
            
            response = self.vision_model.generate_content([image_part, prompt])
            
            # Parse JSON response
            import json
            try:
                # Extract JSON from response (might have markdown code blocks)
                text = response.text.strip()
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0].strip()
                
                style_data = json.loads(text)
                logger.info(f"Successfully analyzed offer style: {len(style_data)} keys extracted")
                return style_data
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse Gemini response as JSON: {e}")
                logger.debug(f"Response text: {response.text}")
                # Fallback: return basic structure
                return {
                    "colors": {"primary": "#000000", "secondary": "#666666"},
                    "typography": {"primary_font": "Arial"},
                    "layout": {"structure": "standard"},
                    "style": "modern",
                    "elements": []
                }
        except Exception as e:
            logger.error(f"Error analyzing offer style with Gemini Vision: {e}", exc_info=True)
            raise
    
    def generate_offer_stream(
        self,
        prompt: str,
        style_context: Optional[Dict[str, Any]] = None,
        current_html: Optional[str] = None,
        chat_history: Optional[List[Dict[str, str]]] = None
    ) -> Iterator[str]:
        """
        Generate offer HTML using Gemini 3.0 Pro (streaming).
        High-end, beautiful offer generation.
        """
        try:
            # Build system prompt for high-end generation
            system_prompt = self._build_generation_prompt(style_context, current_html, chat_history)
            
            # Combine with user prompt
            full_prompt = f"{system_prompt}\n\nUser request: {prompt}"
            
            # Generate with streaming
            # Gemini API accepts dict for generation_config
            generation_config = {
                "temperature": 0.7,
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": 8192,
            }
            
            response = self.generation_model.generate_content(
                full_prompt,
                stream=True,
                generation_config=generation_config
            )
            
            # Stream tokens
            for chunk in response:
                if chunk.text:
                    yield chunk.text
                    
        except Exception as e:
            logger.error(f"Error generating offer with Gemini: {e}", exc_info=True)
            raise
    
    def _build_generation_prompt(
        self,
        style_context: Optional[Dict[str, Any]],
        current_html: Optional[str],
        chat_history: Optional[List[Dict[str, str]]]
    ) -> str:
        """Build comprehensive system prompt for high-end offer generation"""
        
        prompt_parts = ["""
You are an expert AI designer specializing in creating beautiful, professional, high-end commercial offers in HTML format.
Your mission is to create offers that are visually stunning, elegant, and professionally designed - NO LOW-QUALITY CONTENT.

HIGH-END DESIGN PRINCIPLES:
1. Premium Aesthetics: Modern, elegant layouts with proper spacing and visual hierarchy
2. Typography Excellence: Professional fonts (Inter, Poppins, Roboto, Playfair Display), proper sizing, clear hierarchy
3. Color Harmony: Sophisticated color palettes, proper contrasts, subtle gradients where appropriate
4. Spacing & Layout: Generous padding, margin, breathing room, proper grid systems
5. Responsiveness: Mobile-first, responsive design (flexbox/grid)
6. Semantic HTML: Clean, semantic HTML5 structure
7. Modern CSS: Use modern CSS features (grid, flexbox, CSS custom properties, smooth animations)

QUALITY STANDARDS:
- Every offer must be visually impressive and professional
- Use modern design trends (2025): subtle shadows, rounded corners, smooth transitions
- Proper color contrast for accessibility
- Clean, readable typography
- Professional spacing (8px grid system recommended)
- Subtle animations/transitions for interactivity

OUTPUT FORMAT:
Return complete, valid HTML5 document with embedded CSS (inline styles or <style> tag).
Include:
- DOCTYPE and proper HTML structure
- Viewport meta tag for responsiveness
- Embedded CSS (can use Tailwind-like utility classes or inline styles)
- Semantic HTML structure
- All necessary content

IMPORTANT:
- Always generate COMPLETE, VALID HTML (never fragments)
- Maintain design consistency throughout
- Ensure professional appearance - this is HIGH-END, not basic
"""]
        
        # Add style context if available
        if style_context:
            prompt_parts.append(f"""
STYLE CONTEXT (from analyzed reference):
{self._format_style_context(style_context)}

Use this style as inspiration while maintaining high-end quality.
""")
        
        # Add current HTML context if editing
        if current_html:
            prompt_parts.append(f"""
CURRENT OFFER HTML (for reference):
{current_html[:2000]}...

When modifying, maintain the overall structure unless explicitly asked to change it.
""")
        
        # Add chat history context
        if chat_history:
            prompt_parts.append("""
CHAT HISTORY (for context):
""")
            for msg in chat_history[-5:]:  # Last 5 messages
                prompt_parts.append(f"{msg['role']}: {msg['content']}\n")
        
        return "\n".join(prompt_parts)
    
    def _format_style_context(self, style: Dict[str, Any]) -> str:
        """Format style context for prompt"""
        parts = []
        if "colors" in style:
            parts.append(f"Colors: {style['colors']}")
        if "typography" in style:
            parts.append(f"Typography: {style['typography']}")
        if "layout" in style:
            parts.append(f"Layout: {style['layout']}")
        if "style" in style:
            parts.append(f"Design style: {style['style']}")
        return "\n".join(parts)


# Global instance
gemini_client = GeminiOfferClient()

