from __future__ import annotations

import json
import logging
import math
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import sys
from pathlib import Path

import openai

ROOT_DIR = Path(__file__).resolve().parents[2]
LIB_DIR = ROOT_DIR / "lib"
if str(LIB_DIR) not in sys.path:
    sys.path.append(str(LIB_DIR))

from cost_monitor import record_openai_usage
from .enrichment import (
    enrich_company_profile,
    _collect_search_candidates,
    _filter_html_candidates,
)
from .google_maps import scrape_google_maps_queries
from .kpo import scrape_kpo_categories
from . import kpo_jobs
from . import tasks as maps_tasks


SYSTEM_PROMPT = """
Jesteś wysoko zaawansowanym agentem badawczym. Użytkownik opisuje, jakich firm, kontaktów lub danych potrzebuje.
Masz do dyspozycji narzędzia (TOOLS) mapowane na backendowe funkcje:
- search_maps(query): wyszukuje firmy w Google Maps i natychmiast je wzbogaca.
- search_web(query): znajduje strony WWW (Programmable Search + DuckDuckGo fallback).
- enrich_company(company): wzbogaca pojedynczy rekord (strona, email, telefon).
- search_kpo(...): pobiera beneficjentów KPO z oficjalnych map BGK i od razu je wzbogaca.

Pracujesz w trybie „task board”:
1. Analizujesz intencję użytkownika.
2. Tworzysz listę kroków (narzędzi) i decyzji.
3. Po zakończeniu zwracasz ODPOWIEDŹ w formacie JSON, aby UI mogło pokazać:
   - timeline działań,
   - todo-listę (co zrobiono / co zostało),
   - wyniki (np. firmy, kontakty),
   - sugestie kolejnych pytań.

FORMAT odpowiedzi (bez dodatkowego tekstu):
{
  "status": "ok" | "need_clarification" | "error",
  "user_summary": "...",
  "actions_timeline": [
    {
      "label": "...",
      "tool": "search_maps" | "search_web" | "enrich_company" | "search_kpo" | "deep_search" | "none",
      "status": "pending" | "in_progress" | "done" | "skipped" | "failed",
      "details": "..."
    }
  ],
  "todos": [
    {"label": "...", "status": "pending" | "in_progress" | "done"}
  ],
  "results": [
    {
      "name": "...",
      "address": "...",
      "website": "...",
      "email": "...",
      "phone": "...",
      "note": "..."
    }
  ],
  "suggested_next_questions": [
    "..."
  ]
}

Reguły:
- Jeśli brakuje informacji ustaw "status": "need_clarification" i poproś o konkrety.
- Jeśli narzędzie zgłosiło błąd użyj "status": "error" i oznacz krok jako "failed".
- "actions_timeline" opisuje tylko realne kroki (wyszukania, wzbogacenia). Nie opisuj chain-of-thought.
- "results" zawiera tylko najważniejsze rekordy (3‑5). Przy większej liczbie wspomnij o tym w "details" lub "user_summary".
- Pisz po polsku jeśli użytkownik używa polskiego, w przeciwnym razie użyj jego języka.
- Nie ujawniaj wewnętrznego rozumowania.
""".strip()

PLAN_SYSTEM_PROMPT = """
Jesteś koordynatorem planowania. Dla podanego celu użytkownika przygotuj listę kroków korzystając z dostępnych narzędzi (search_kpo, search_maps, search_web, enrich_company).
Zawsze uwzględnij:
- analizę danych wejściowych,
- właściwe narzędzie,
- oczekiwany rezultat,
- status „pending”.
Zwróć JSON postaci {"plan": [{"step": 1, "goal": "...", "tool": "...", "status": "pending"}]}.
""".strip()

SUMMARY_PROMPT = """
Podsumuj zwięźle następujący fragment rozmowy (kluczowe fakty, decyzje, wyniki). Nie dodawaj nowych informacji.
""".strip()

MEMORY_HEADER = "Najważniejsze informacje z wcześniejszych rozmów:"

EMBED_MODEL = "text-embedding-3-small"
MAX_HISTORY_TOKENS = 12000
SUMMARY_CHUNK_SIZE = 12
MEMORY_TOP_K = 3
MEMORY_MIN_SIMILARITY = 0.78

FUNCTIONS = [
    {
        "type": "function",
        "function": {
            "name": "search_maps",
            "description": "Pobiera listę firm z Google Maps i od razu je wzbogaca.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Pojedyncze zapytanie, np. 'fotowoltaika Rzeszów'.",
                    },
                    "queries": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Lista zapytań – jeśli ją podasz, pole 'query' jest opcjonalne.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Wyszukuje strony WWW (Programmable Search / DuckDuckGo).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "enrich_company",
            "description": "Wzbogaca pojedynczy rekord firmy (strona, email, telefon).",
            "parameters": {
                "type": "object",
                "properties": {
                    "company": {
                        "type": "object",
                        "description": "Słownik z polami name/address itp.",
                    },
                },
                "required": ["company"],
            },
        },
    },
    {
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
    },
    {
        "type": "function",
        "function": {
            "name": "search_kpo",
            "description": "Wyszukuje beneficjentów KPO z oficjalnych map i zwraca wzbogacone rekordy.",
            "parameters": {
                "type": "object",
                "properties": {
                    "categories": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Nazwy kategorii, np. 'Budownictwo mieszkaniowe'. Pozostaw puste aby pobrać wszystkie.",
                    },
                    "select_all": {"type": "boolean", "description": "Ustaw true aby wymusić wszystkie kategorie."},
                    "voivodeships": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filtruj do wybranych województw (np. 'Podkarpackie').",
                    },
                    "use_inference": {
                        "type": "boolean",
                        "description": "Czy próbować zgadywać województwo z opisu/kodu pocztowego.",
                        "default": True,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maksymalna liczba rekordów do wzbogacenia (koszt OpenAI).",
                        "minimum": 1,
                        "maximum": 200,
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_kpo_status",
            "description": "Zwraca aktualny stan zadań KPO (liczba wyników, status pauzy, ostatnie logi).",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "Opcjonalny identyfikator konkretnego zadania KPO.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_maps_status",
            "description": "Zwraca aktualny stan zadań scrapera Google Maps (postęp zapytań, pauza/wznowienie).",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "Opcjonalny identyfikator konkretnego zadania Google Maps.",
                    },
                },
            },
        },
    },
]


MAX_TOOL_ITERATIONS = 6
MAX_SESSION_LOGS = 50
MAX_TURNS = 50
DEFAULT_TITLE = "Nowa rozmowa"


def _utcnow() -> datetime:
    return datetime.utcnow()


class ChatSession:
    def __init__(self, user: Optional[Dict[str, Any]] = None) -> None:
        self.id = str(uuid.uuid4())
        self.created_at = _utcnow()
        self.updated_at = self.created_at
        self.title = DEFAULT_TITLE
        self.history: List[Dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
        self.logs: List[str] = []
        self.turns: List[Dict[str, Any]] = []
        self.title_locked = False
        self.auto_title_generated = False
        self.memory: List[Dict[str, Any]] = []
        self.memory_limit = 200
        self.summaries: List[str] = []
        self.current_plan: List[Dict[str, Any]] = []
        self.last_results: List[Dict[str, Any]] = []
        self.last_results: List[Dict[str, Any]] = []
        self.user_profile = dict(user or {})
        self.user_id = self.user_profile.get("user_id")

    def append_log(self, message: str) -> None:
        if not message:
            return
        self.logs.append(message)
        self.logs = self.logs[-MAX_SESSION_LOGS:]

    def record_turn(self, user_message: str, reply: Dict[str, Any], logs: List[str]) -> Dict[str, Any]:
        turn = {
            "id": str(uuid.uuid4()),
            "user_message": user_message,
            "assistant_reply": reply,
            "logs": list(logs),
            "created_at": _utcnow().isoformat(),
        }
        self.turns.append(turn)
        if len(self.turns) > MAX_TURNS:
            self.turns = self.turns[-MAX_TURNS:]
        self.updated_at = _utcnow()
        return turn

    def set_title(self, title: str, manual: bool = False) -> None:
        cleaned = (title or "").strip() or DEFAULT_TITLE
        self.title = cleaned[:120]
        if manual:
            self.title_locked = True
        self.updated_at = _utcnow()

    def meta(self) -> Dict[str, Any]:
        return {
            "session_id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "message_count": len(self.turns),
            "user_id": self.user_id,
        }

    def detail(self) -> Dict[str, Any]:
        return {
            **self.meta(),
            "messages": [
                {
                    "id": turn["id"],
                    "user_message": turn["user_message"],
                    "assistant_reply": turn.get("assistant_reply"),
                    "logs": turn.get("logs", []),
                    "created_at": turn["created_at"],
                }
                for turn in self.turns
            ],
            "plan": list(self.current_plan),
        }


_sessions: Dict[str, ChatSession] = {}
logger = logging.getLogger("agent")


def start_session(user: Optional[Dict[str, Any]] = None) -> ChatSession:
    session = ChatSession(user=user)
    _sessions[session.id] = session
    return session


def get_session(session_id: str) -> Optional[ChatSession]:
    return _sessions.get(session_id)


def list_sessions(user_id: Optional[str] = None) -> List[ChatSession]:
    sessions = list(_sessions.values())
    if user_id:
        sessions = [session for session in sessions if session.user_id == user_id]
    return sorted(sessions, key=lambda s: s.updated_at, reverse=True)


def delete_session(session_id: str) -> bool:
    return _sessions.pop(session_id, None) is not None


def rename_session(session_id: str, title: str) -> Optional[ChatSession]:
    session = get_session(session_id)
    if not session:
        return None
    session.set_title(title, manual=True)
    return session


def serialize_session(session_id: str) -> Optional[Dict[str, Any]]:
    session = get_session(session_id)
    if not session:
        return None
    return session.detail()


def _tool_search_maps(
    query: Optional[str] = None,
    queries: Optional[List[str]] = None,
) -> Dict[str, Any]:
    items: List[str] = list(queries or [])
    if query:
        items.append(query)
    items = [q.strip() for q in items if q and q.strip()]
    if not items:
        raise ValueError("Brak zapytań do wyszukania.")

    log_messages: List[str] = []

    def _status(msg: str) -> None:
        log_messages.append(msg)

    results, scrape_logs = scrape_google_maps_queries(
        items,
        imported_results=[],
        status_callback=_status,
    )
    return {"queries": items, "results": results, "logs": log_messages or scrape_logs}


def _tool_search_web(query: str) -> Dict[str, Any]:
    candidates, source = _collect_search_candidates(query, query)
    filtered = _filter_html_candidates(candidates)
    return {"query": query, "source": source, "results": filtered[:10]}


def _tool_enrich_company(company: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not company:
        raise ValueError("Brak danych firmy do wzbogacenia.")
    if isinstance(company, str):
        company_payload = {"name": company}
    else:
        company_payload = dict(company)
    result = enrich_company_profile(company_payload, {"enhance_with_rejestr": False})
    return result


def _tool_search_kpo(
    categories: Optional[List[str]] = None,
    select_all: bool = False,
    voivodeships: Optional[List[str]] = None,
    use_inference: bool = True,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    log_messages: List[str] = []

    def _status(msg: str) -> None:
        log_messages.append(msg)

    payload = scrape_kpo_categories(
        categories or [],
        select_all=select_all,
        voivodeships=voivodeships or [],
        use_inference=use_inference,
        limit=limit,
        status_callback=_status,
    )
    payload["logs"] = payload.get("logs") or log_messages
    return payload


def _tool_get_kpo_status(job_id: Optional[str] = None) -> Dict[str, Any]:
    jobs = kpo_jobs.list_jobs()
    if job_id:
        jobs = [job for job in jobs if job.id == job_id]
    if not jobs:
        return {"jobs": [], "summary": "Brak aktywnych lub niedawno uruchomionych zadań KPO."}

    payload_jobs: List[Dict[str, Any]] = []
    summaries: List[str] = []
    for job in jobs:
        with job.lock:
            processed = job.processed_records
            total = job.total_records or len(job.results)
            status = job.status
            categories = ", ".join(job.categories_used[:3]) or "brak kategorii"
            voivs = ", ".join(job.voivodeships_filter[:3]) or "wszystkie regiony"
        progress = f"{processed}/{total}" if total else str(processed)
        summaries.append(f"Zadanie {job.id[:8]} jest {status} (rekordy: {progress}).")
        payload_jobs.append(
            {
                "job_id": job.id,
                "status": status,
                "processed": processed,
                "total": total,
                "results_count": len(job.results),
                "categories": job.categories_used,
                "voivodeships": job.voivodeships_filter,
                "summary": f"Kategorie: {categories}, regiony: {voivs}, rekordy: {progress}",
            }
        )
    return {"jobs": payload_jobs, "summary": " ".join(summaries)}


def _tool_get_maps_status(task_id: Optional[str] = None) -> Dict[str, Any]:
    task_list = maps_tasks.list_all_tasks()
    if task_id:
        task_list = [task for task in task_list if task.id == task_id]
    if not task_list:
        return {"tasks": [], "summary": "Brak aktywnych zadań Google Maps."}

    payload_tasks: List[Dict[str, Any]] = []
    summaries: List[str] = []
    for task in task_list:
        with task.lock:
            status = "running" if task.running else "paused" if task.paused else "finished"
            query_progress = f"{task.query_index}/{task.total_queries}"
            results_count = len(task.results)
            sample_query = (task.queries or ["zapytania nieznane"])[0]
        summaries.append(
            f"Zlecenie {task.id[:8]} ({sample_query}) jest {status} (zapytania: {query_progress}, wyniki: {results_count})."
        )
        payload_tasks.append(
            {
                "task_id": task.id,
                "status": status,
                "query_progress": query_progress,
                "results_count": results_count,
                "current_query": sample_query,
                "summary": f"{status.title()} • zapytania {query_progress} • wyniki {results_count}",
            }
        )
    return {"tasks": payload_tasks, "summary": " ".join(summaries)}


def _tool_deep_search(query: str, limit: Optional[int] = None, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Start a deep search job.
    Returns job_id for tracking progress.
    Note: tenant_id should be passed from request context in production.
    """
    if not query or not query.strip():
        raise ValueError("Brak zapytania dla Deep Search.")
    
    from app.repos.job_repository import JobRepository
    from app.db.session import SessionLocal
    from app.services.job_runtime import runtime_manager
    
    db = SessionLocal()
    try:
        repo = JobRepository(db)
        
        # Use provided tenant_id or default (in production, should come from request)
        tenant_id = tenant_id or "default"
        
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


_TOOL_MAP = {
    "search_maps": lambda **kwargs: _tool_search_maps(**kwargs),
    "search_web": lambda **kwargs: _tool_search_web(**kwargs),
    "enrich_company": lambda **kwargs: _tool_enrich_company(**kwargs),
    "search_kpo": lambda **kwargs: _tool_search_kpo(**kwargs),
    "get_kpo_status": lambda **kwargs: _tool_get_kpo_status(**kwargs),
    "get_maps_status": lambda **kwargs: _tool_get_maps_status(**kwargs),
    "deep_search": lambda **kwargs: _tool_deep_search(**kwargs),
}


def _format_tool_log(name: str, args: Dict[str, Any], output: Any) -> str:
    try:
        if name == "search_maps":
            queries = output.get("queries") if isinstance(output, dict) else None
            queries = queries or args.get("queries") or ([args.get("query")] if args.get("query") else [])
            text_query = ", ".join([q for q in queries if q]) or "podane zapytania"
            count = len(output.get("results", [])) if isinstance(output, dict) else 0
            return f"Wykonałem wyszukiwanie Google Maps dla: {text_query}. Znalazłem {count} potencjalnych firm."
        if name == "search_web":
            query = args.get("query", "zapytanie")
            count = len(output.get("results", [])) if isinstance(output, dict) else 0
            source = output.get("source") if isinstance(output, dict) else ""
            return f"Sprawdziłem w sieci zapytanie '{query}' ({source or 'wyszukiwarka'}). Kandydatów: {count}."
        if name == "enrich_company":
            company = output if isinstance(output, dict) else {}
            name_value = company.get("name") or args.get("company", {}).get("name") or "firma"
            email = company.get("email") or company.get("emails")
            phone = company.get("phone")
            website = company.get("website")
            details = ", ".join(
                [text for text in [f"strona {website}" if website else "", f"email {email}" if email else "", f"telefon {phone}" if phone else ""] if text]
            )
            details = details or "dodatkowe informacje kontaktowe"
            return f"Wzbogaciłem dane firmy {name_value} o {details}."
        if name == "search_kpo":
            categories = args.get("categories") or output.get("categories_used", []) if isinstance(output, dict) else []
            categories_text = ", ".join(categories) if categories else "wszystkie kategorie"
            count = len(output.get("results", [])) if isinstance(output, dict) else 0
            return f"Pobrałem beneficjentów KPO ({categories_text}). Zebrane rekordy: {count}."
        if name == "get_kpo_status":
            summary = output.get("summary") if isinstance(output, dict) else ""
            return summary or "Sprawdziłem status zadań KPO."
        if name == "get_maps_status":
            summary = output.get("summary") if isinstance(output, dict) else ""
            return summary or "Sprawdziłem status zadań Google Maps."
        if name == "deep_search":
            query = args.get("query", "zapytanie")
            job_id = output.get("job_id") if isinstance(output, dict) else None
            if job_id:
                return f"Uruchomiłem Deep Search dla: '{query}'. Job ID: {job_id}. Postęp można śledzić w module Deep Search."
            error = output.get("error") if isinstance(output, dict) else None
            if error:
                return f"Błąd uruchomienia Deep Search: {error}"
            return f"Uruchomiłem Deep Search dla: '{query}'."
    except Exception:
        pass
    readable = {
        "search_maps": "Wykonałem wyszukiwanie Google Maps.",
        "search_web": "Sprawdziłem wyniki w sieci.",
        "enrich_company": "Wzbogaciłem dane firmy.",
        "search_kpo": "Pobrałem beneficjentów KPO.",
        "get_kpo_status": "Sprawdziłem status zadań KPO.",
        "get_maps_status": "Sprawdziłem status zadań Google Maps.",
        "deep_search": "Uruchomiłem Deep Search.",
    }
    return readable.get(name, f"Zastosowałem narzędzie {name}.")


def _approx_token_len(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


def _history_token_length(messages: List[Dict[str, Any]]) -> int:
    total = 0
    for message in messages:
        total += 10 + _approx_token_len(message.get("content", ""))
    return total


def _summarize_chunk(session: ChatSession) -> bool:
    if len(session.history) <= SUMMARY_CHUNK_SIZE + 2:
        return False
    chunk = []
    start_index: Optional[int] = None
    count = 0
    for idx in range(1, len(session.history)):
        message = session.history[idx]
        if message.get("summary"):
            continue
        if start_index is None:
            start_index = idx
        chunk.append(message)
        count += 1
        if count >= SUMMARY_CHUNK_SIZE:
            break
    if not chunk or start_index is None:
        return False
    serialized = []
    for msg in chunk:
        content = msg.get("content") or ""
        serialized.append(f"{msg.get('role', 'assistant')}: {content}")
    prompt_messages = [
        {"role": "system", "content": SUMMARY_PROMPT},
        {"role": "user", "content": "\n".join(serialized)},
    ]
    try:
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=prompt_messages,
            temperature=0,
        )
        summary = response.choices[0].message.content.strip()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Summary generation failed: %s", exc)
        return False
    summary_message = {
        "role": "system",
        "content": f"(Podsumowanie wcześniejszych ustaleń)\n{summary}",
        "summary": True,
    }
    session.summaries.append(summary)
    new_history = session.history[:start_index] + [summary_message] + session.history[start_index + len(chunk):]
    session.history = new_history
    logger.info("Summarized %s messages to maintain context window.", len(chunk))
    return True


def _ensure_history_within_limits(session: ChatSession) -> None:
    attempts = 0
    while _history_token_length(session.history) > MAX_HISTORY_TOKENS and attempts < 5:
        if not _summarize_chunk(session):
            break
        attempts += 1


def _serialize_recent_history(session: ChatSession, turns: int = 4) -> str:
    collected: List[str] = []
    for message in reversed(session.history):
        if message.get("summary") or message.get("plan") or message.get("memory"):
            continue
        role = message.get("role")
        if role not in {"user", "assistant"}:
            continue
        content = (message.get("content") or "").strip()
        if not content:
            continue
        collected.append(f"{role}: {content[:600]}")
        if len(collected) >= turns * 2:
            break
    return "\n".join(reversed(collected))


def _compute_embedding(text: str) -> Optional[List[float]]:
    if not text or not text.strip():
        return None
    try:
        response = openai.embeddings.create(
            model=EMBED_MODEL,
            input=text,
        )
        return response.data[0].embedding
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Embedding failed: %s", exc)
        return None


def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b:
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a)) or 1e-9
    norm_b = math.sqrt(sum(b * b for b in vec_b)) or 1e-9
    return dot / (norm_a * norm_b)


def _store_memory(session: ChatSession, text: str, kind: str) -> None:
    embedding = _compute_embedding(text)
    if embedding is None:
        return
    session.memory.append({"text": text, "embedding": embedding, "kind": kind})
    if len(session.memory) > session.memory_limit:
        session.memory = session.memory[-session.memory_limit :]


def _retrieve_memories(session: ChatSession, query: str) -> List[str]:
    if not session.memory:
        return []
    query_embedding = _compute_embedding(query)
    if not query_embedding:
        return []
    scored: List[Tuple[float, str]] = []
    for item in session.memory:
        sim = _cosine_similarity(query_embedding, item.get("embedding") or [])
        if sim >= MEMORY_MIN_SIMILARITY:
            scored.append((sim, item.get("text", "")))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [text for _, text in scored[:MEMORY_TOP_K] if text]


def _memory_message(snippets: List[str]) -> str:
    lines = [MEMORY_HEADER]
    for snippet in snippets:
        lines.append(f"- {snippet}")
    return "\n".join(lines)


def _parse_plan(content: str) -> List[Dict[str, Any]]:
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        payload = {}
    plan_entries = payload.get("plan", payload if isinstance(payload, list) else [])
    normalized: List[Dict[str, Any]] = []
    if isinstance(plan_entries, list):
        for idx, entry in enumerate(plan_entries, start=1):
            goal = ""
            tool = ""
            status = "pending"
            if isinstance(entry, dict):
                goal = entry.get("goal") or entry.get("description") or ""
                tool = entry.get("tool") or entry.get("action") or ""
                status = entry.get("status") or "pending"
            normalized.append(
                {
                    "step": entry.get("step", idx) if isinstance(entry, dict) else idx,
                    "goal": goal,
                    "tool": tool,
                    "status": status,
                }
            )
    return normalized


def _format_plan(plan: List[Dict[str, Any]]) -> str:
    if not plan:
        return "PLAN: Brak szczegółowych kroków – użyj narzędzi zgodnie z potrzebą."
    lines = ["PLAN KROKÓW:"]
    for entry in plan:
        lines.append(
            f"- Krok {entry.get('step')}: {entry.get('goal') or 'cel nieokreślony'} "
            f"(narzędzie: {entry.get('tool') or 'n/a'}, status: {entry.get('status', 'pending')})"
        )
    return "\n".join(lines)


def _generate_plan(session: ChatSession, user_message: str, memories: List[str]) -> List[Dict[str, Any]]:
    context_excerpt = _serialize_recent_history(session, turns=4)
    memory_text = "\n".join(f"- {snippet}" for snippet in memories) if memories else "Brak dodatkowych wspomnień."
    user_prompt = (
        f"Cel użytkownika: {user_message}\n"
        f"Ostatnie ustalenia:\n{context_excerpt or 'Brak nowych informacji.'}\n\n"
        f"Pamięć:\n{memory_text}\n\n"
        "Zaplanuj maksymalnie 5 kroków, każde z przypisanym narzędziem."
    )
    messages = [
        {"role": "system", "content": PLAN_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    try:
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0,
        )
        content = response.choices[0].message.content.strip()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Plan generation failed: %s", exc)
        session.current_plan = []
        return []
    plan = _parse_plan(content)
    session.current_plan = plan
    plan_message = {"role": "system", "content": _format_plan(plan), "plan": True}
    session.history.append(plan_message)
    logger.info("Generated plan for session %s: %s", session.id, plan)
    return plan


def _update_plan_status(session: ChatSession, tool_name: str, status: str, details: str = "") -> None:
    if not session.current_plan:
        return
    normalized_tool = (tool_name or "").lower()
    for entry in session.current_plan:
        entry_tool = (entry.get("tool") or "").lower()
        if not entry_tool:
            continue
        if entry.get("status") in {"done", "failed"}:
            continue
        if entry_tool in normalized_tool or normalized_tool in entry_tool:
            entry["status"] = status
            if details:
                entry["details"] = details
            logger.info(
                "Plan update | session=%s | tool=%s | status=%s | details=%s",
                session.id,
                tool_name,
                status,
                details,
            )
            break

def _enrich_args_with_last_company(session: ChatSession, args: Dict[str, Any]) -> Dict[str, Any]:
    if args.get("company"):
        return args
    if not session.last_results:
        return args
    # pick most recent record with a name
    for record in reversed(session.last_results):
        if record.get("name") or record.get("beneficiary_name"):
            args = dict(args)
            args["company"] = record
            return args
    return args


def _normalize_reply_payload(raw_content: str, logs: List[str]) -> Dict[str, Any]:
    try:
        parsed = json.loads(raw_content)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    return {
        "status": "error",
        "user_summary": "Agent nie zwrócił poprawnej odpowiedzi – zobacz logi i spróbuj ponownie.",
        "actions_timeline": [],
        "todos": [],
        "results": [],
        "suggested_next_questions": [],
        "logs": logs[-5:],
    }


def _fallback_reply(logs: List[str], missing_answer: bool) -> Dict[str, Any]:
    return {
        "status": "need_clarification" if missing_answer else "error",
        "user_summary": (
            "Nie uzyskałem pełnej odpowiedzi, spróbuj doprecyzować."
            if missing_answer
            else "Agent nie zwrócił odpowiedzi – zobacz logi."
        ),
        "actions_timeline": [],
        "todos": [],
        "results": [],
        "suggested_next_questions": [],
        "logs": logs,
    }


def _maybe_generate_title(session: ChatSession, turn: Dict[str, Any]) -> None:
    if session.title_locked or session.auto_title_generated:
        return
    summary = ""
    reply = turn.get("assistant_reply") or {}
    if isinstance(reply, dict):
        summary = reply.get("user_summary") or ""
    seed = summary or turn.get("user_message") or ""
    seed = seed.strip()
    if not seed:
        return
    prompt = (
        "Streszcz jednozdaniowe zapytanie użytkownika w formie maksymalnie 6‑wyrazowego tytułu.\n"
        "Zwróć sam tytuł bez cudzysłowów.\n\n"
        f"Zapytanie: {seed.strip()}"
    )
    try:
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0,
            messages=[
                {"role": "system", "content": "Nadajesz krótkie tytuły rozmowom biznesowym."},
                {"role": "user", "content": prompt},
            ],
        )
        title = (response.choices[0].message.content or "").strip().strip('"').strip("'")
        if title:
            record_openai_usage(max(len(title) // 2, 30), "chat_title")
            session.set_title(title)
            session.auto_title_generated = True
            return
    except Exception:
        pass
    session.set_title(seed[:60])
    session.auto_title_generated = True


RESULTS_FALLBACK_LIMIT = 10


def _maybe_inject_results(target: Dict[str, Any], fallback_results: List[Dict[str, Any]]) -> None:
    if fallback_results and not target.get("results"):
        target["results"] = fallback_results[:RESULTS_FALLBACK_LIMIT]


def process_message(session: ChatSession, user_message: str) -> Dict[str, Any]:
    session.history.append({"role": "user", "content": user_message})
    logs: List[str] = []
    _store_memory(session, user_message, "user")
    _ensure_history_within_limits(session)
    memory_snippets = _retrieve_memories(session, user_message)
    memory_msg = None
    if memory_snippets:
        memory_msg = {"role": "system", "content": _memory_message(memory_snippets), "memory": True}
        session.history.append(memory_msg)
    _generate_plan(session, user_message, memory_snippets)
    last_tool_results: List[Dict[str, Any]] = list(session.last_results)

    for _ in range(MAX_TOOL_ITERATIONS):
        logger.info(
            "LLM request | session=%s | turn=%d | history=%s",
            session.id,
            len(session.turns) + 1,
            json.dumps(session.history, ensure_ascii=False),
        )
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=session.history,
            tools=FUNCTIONS,
            temperature=0,
        )
        message = response.choices[0].message
        try:
            message_payload = message.model_dump()
        except AttributeError:
            try:
                message_payload = message.to_dict()
            except AttributeError:
                message_payload = str(message)
        logger.info(
            "LLM raw response | session=%s | message=%s",
            session.id,
            json.dumps(message_payload, ensure_ascii=False) if isinstance(message_payload, dict) else message_payload,
        )
        if message.tool_calls:
            session.history.append(
                {
                    "role": "assistant",
                    "content": message.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": tc.type,
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments or "{}",
                            },
                        }
                        for tc in message.tool_calls
                    ],
                }
            )
            for tool_call in message.tool_calls:
                name = tool_call.function.name
                try:
                    args = json.loads(tool_call.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                if name == "enrich_company":
                    args = _enrich_args_with_last_company(session, args)
                # Inject tenant_id for deep_search if available in session
                if name == "deep_search":
                    # Get tenant_id from session user profile
                    tenant_id = session.user_profile.get("tenant_id") if hasattr(session, 'user_profile') else None
                    if tenant_id:
                        args['tenant_id'] = tenant_id
                tool_fn = _TOOL_MAP.get(name)
                if not tool_fn:
                    logger.warning("Unknown tool requested: %s", name)
                    continue
                try:
                    output = tool_fn(**args)
                except Exception as exc:  # pragma: no cover - defensive
                    output = {"error": str(exc)}
                logs.append(f"[tool:{name}] {json.dumps(args, ensure_ascii=False)} -> {str(output)[:200]}")
                result_status = "failed" if isinstance(output, dict) and output.get("error") else "done"
                result_details = ""
                if isinstance(output, dict):
                    result_details = output.get("error") or f"Wyniki: {len(output.get('results', []) or [])}"
                logger.info(
                    "Tool invocation | session=%s | tool=%s | args=%s | output=%s",
                    session.id,
                    name,
                    json.dumps(args, ensure_ascii=False),
                    json.dumps(output, ensure_ascii=False),
                )
                _update_plan_status(session, name, result_status, result_details)
                if isinstance(output, dict):
                    candidate = output.get("results")
                    if isinstance(candidate, list):
                        last_tool_results = list(candidate)
                        session.last_results = list(candidate)
                session.history.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": name,
                        "content": json.dumps(output, ensure_ascii=False),
                    }
                )
            continue
        if message.content:
            structured = _normalize_reply_payload(message.content.strip(), logs)
            _maybe_inject_results(structured, last_tool_results)
            reply_text = json.dumps(structured, ensure_ascii=False)
            session.history.append({"role": "assistant", "content": reply_text})
            session.append_log("\n".join(logs[-5:]))
            turn = session.record_turn(user_message, structured, logs)
            _maybe_generate_title(session, turn)
            if structured.get("user_summary"):
                _store_memory(session, structured["user_summary"], "assistant")
            logger.info(
                "Agent reply | session=%s | content=%s",
                session.id,
                reply_text,
            )
            return {"reply": reply_text, "logs": logs}

    fallback = _fallback_reply(logs, missing_answer=not logs)
    _maybe_inject_results(fallback, last_tool_results)
    reply_text = json.dumps(fallback, ensure_ascii=False)
    session.history.append({"role": "assistant", "content": reply_text})
    session.append_log("\n".join(logs[-5:]))
    session.record_turn(user_message, fallback, logs)
    if fallback.get("user_summary"):
        _store_memory(session, fallback["user_summary"], "assistant")
    logger.warning(
        "Agent fallback reply | session=%s | content=%s",
        session.id,
        reply_text,
    )
    return {"reply": reply_text, "logs": logs}

