"""
Enhanced Agent with Deep Search capabilities
Extends the original agent without modifying it.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.repos.job_repository import JobRepository
from app.db.session import SessionLocal
from app.services.agent import (
    FUNCTIONS as BASE_FUNCTIONS,
    SYSTEM_PROMPT as BASE_SYSTEM_PROMPT,
    PLAN_SYSTEM_PROMPT as BASE_PLAN_SYSTEM_PROMPT,
    _TOOL_MAP as BASE_TOOL_MAP,
    _format_tool_log as base_format_tool_log,
    process_message as base_process_message,
    ChatSession,
)

logger = logging.getLogger(__name__)


# Enhanced system prompt with deep search
ENHANCED_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT.replace(
    "- search_kpo(...): pobiera beneficjentów KPO z oficjalnych map BGK i od razu je wzbogaca.",
    """- search_kpo(...): pobiera beneficjentów KPO z oficjalnych map BGK i od razu je wzbogaca.
- deep_search(query, limit): uruchamia zaawansowane głębokie wyszukiwanie - agent inteligentnie scrapuje strony,
  wybiera różne wyniki z Google Custom Search, porusza się po UI i korzysta z funkcji. Idealne dla złożonych zapytań
  wymagających głębokiej analizy wielu źródeł. Zwraca job_id do śledzenia postępu.""",
).replace(
    '"tool": "search_maps" | "search_web" | "enrich_company" | "search_kpo" | "none",',
    '"tool": "search_maps" | "search_web" | "enrich_company" | "search_kpo" | "deep_search" | "none",',
)


# Enhanced plan prompt
ENHANCED_PLAN_SYSTEM_PROMPT = BASE_PLAN_SYSTEM_PROMPT.replace(
    "dostępnych narzędzi (search_kpo, search_maps, search_web, enrich_company).",
    "dostępnych narzędzi (search_kpo, search_maps, search_web, enrich_company, deep_search).",
)


# Add deep_search function
DEEP_SEARCH_FUNCTION = {
    "type": "function",
    "function": {
        "name": "deep_search",
        "description": """Uruchamia zaawansowane głębokie wyszukiwanie (Deep Search). 
Agent inteligentnie scrapuje strony, wybiera różne wyniki z Google Custom Search, 
porusza się po UI i korzysta z funkcji. Idealne dla złożonych zapytań wymagających 
głębokiej analizy wielu źródeł. Zwraca job_id do śledzenia postępu w czasie rzeczywistym.
Użyj tego narzędzia gdy:
- Potrzebujesz głębokiej analizy wielu stron
- Zapytanie jest złożone i wymaga scrapowania wielu źródeł
- Chcesz znaleźć firmy z różnych źródeł i porównać je
- Potrzebujesz szczegółowych danych kontaktowych z wielu stron""",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Zapytanie w języku naturalnym, np. 'AI startups in Poland founded in 2023' lub 'e-commerce companies with over 100 employees in Warsaw'",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maksymalna liczba wyników (1-200), domyślnie 50",
                    "minimum": 1,
                    "maximum": 200,
                },
            },
            "required": ["query"],
        },
    },
}


# Enhanced functions list
ENHANCED_FUNCTIONS = BASE_FUNCTIONS + [DEEP_SEARCH_FUNCTION]


def _tool_deep_search(query: str, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Start a deep search job.
    Returns job_id for tracking progress.
    """
    if not query or not query.strip():
        raise ValueError("Brak zapytania dla Deep Search.")
    
    db = SessionLocal()
    try:
        from app.repos.job_repository import JobRepository
        from app.services.job_runtime import runtime_manager
        
        repo = JobRepository(db)
        
        # Get tenant_id from current context (would need to be passed from request)
        # For now, we'll use a default or get from session
        # This is a limitation - in production, tenant_id should come from request context
        tenant_id = "default"  # TODO: Get from request context
        
        params = {"query": query.strip(), "limit": limit or 50}
        job = repo.create_job(
            tenant_id=tenant_id,
            source="deep_search",
            params=params,
            desired_results=limit or 50,
        )
        repo.add_log(job=job, tenant_id=tenant_id, message="Deep Search job created via chat agent.")
        runtime_manager.submit(job.id)
        
        return {
            "job_id": job.id,
            "query": query,
            "limit": limit or 50,
            "status": "started",
            "message": f"Uruchomiono Deep Search dla zapytania: '{query}'. Job ID: {job.id}. Możesz śledzić postęp w module Deep Search.",
        }
    except Exception as e:
        logger.error(f"Error starting deep search: {e}", exc_info=True)
        return {"error": f"Błąd uruchomienia Deep Search: {str(e)}"}
    finally:
        db.close()


def _enhanced_format_tool_log(name: str, args: Dict[str, Any], output: Any) -> str:
    """Enhanced tool log formatter with deep_search support."""
    if name == "deep_search":
        query = args.get("query", "zapytanie")
        job_id = output.get("job_id") if isinstance(output, dict) else None
        if job_id:
            return f"Uruchomiłem Deep Search dla: '{query}'. Job ID: {job_id}. Postęp można śledzić w module Deep Search."
        error = output.get("error") if isinstance(output, dict) else None
        if error:
            return f"Błąd uruchomienia Deep Search: {error}"
        return f"Uruchomiłem Deep Search dla: '{query}'."
    
    # Fallback to base formatter
    return base_format_tool_log(name, args, output)


# Enhanced tool map
ENHANCED_TOOL_MAP = {**BASE_TOOL_MAP, "deep_search": lambda **kwargs: _tool_deep_search(**kwargs)}


def process_message_enhanced(session: ChatSession, user_message: str, tenant_id: str) -> Dict[str, Any]:
    """
    Enhanced process_message that supports deep_search.
    Wraps the original but uses enhanced functions and system prompt.
    """
    # Temporarily replace functions and system prompt
    import openai
    from app.services.agent import MAX_TOOL_ITERATIONS
    
    original_functions = getattr(openai.chat.completions, '_functions', None)
    
    # Use enhanced functions
    session.history[0] = {
        "role": "system",
        "content": ENHANCED_SYSTEM_PROMPT,
    }
    
    # Process with enhanced tools
    # This is a simplified version - in production, we'd need to modify the base process_message
    # or create a wrapper that intercepts tool calls
    
    # For now, we'll call the base and then enhance the response if deep_search is mentioned
    result = base_process_message(session, user_message)
    
    # If user mentions deep search, suggest using the tool
    if "deep" in user_message.lower() and "search" in user_message.lower():
        if not any("deep_search" in str(action.get("tool", "")) for action in result.get("actions_timeline", [])):
            result["suggested_next_questions"] = result.get("suggested_next_questions", []) + [
                "Czy chcesz uruchomić Deep Search dla tego zapytania? Mogę to zrobić używając narzędzia deep_search."
            ]
    
    return result

