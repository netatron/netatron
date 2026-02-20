import logging
import os
import random
import re
import sys
import threading
import time
import unicodedata
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import openai
import requests
from bs4 import BeautifulSoup

ROOT_DIR = Path(__file__).resolve().parents[2]
LIB_DIR = ROOT_DIR / "lib"
if str(LIB_DIR) not in sys.path:
    sys.path.append(str(LIB_DIR))

from scraper_web_simple import scrape_website as scrape_company_website  # noqa: E402
from utils import merge_company_data, validate_company_data  # noqa: E402
from cost_monitor import record_openai_usage  # noqa: E402
try:  # noqa: E402
    from headless_search import HeadlessGoogleSearcher  # type: ignore
except Exception:  # noqa: E402
    HeadlessGoogleSearcher = None  # type: ignore

from google.oauth2 import service_account  # noqa: E402
from googleapiclient.discovery import build as google_build  # noqa: E402

logger = logging.getLogger("enrichment")

openai.api_key = os.getenv("OPENAI_API_KEY")
_GOOGLE_CSE_KEY = os.getenv("GOOGLE_CSE_API_KEY")
_GOOGLE_CSE_CX = os.getenv("GOOGLE_CSE_CX")
_GOOGLE_CSE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_CSE_SERVICE_ACCOUNT_FILE")
if not _GOOGLE_CSE_SERVICE_ACCOUNT_FILE:
    default_sa = ROOT_DIR / "global-sun-478410-q8-173ad1b02aa9.json"
    if default_sa.exists():
        _GOOGLE_CSE_SERVICE_ACCOUNT_FILE = str(default_sa)

_SITE_SEARCH_CACHE: Dict[str, str] = {}
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/126.0",
]
_SKIP_DOMAINS = {"facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com"}
_DDG_HTML = "https://duckduckgo.com/html/"
_DDG_LITE = "https://lite.duckduckgo.com/lite/"
_PROXY_BASE = "https://r.jina.ai/http://{host}{path}"
_DDG_SESSION = requests.Session()

_headless_lock = threading.Lock()
_headless_instance: Optional["HeadlessGoogleSearcher"] = None
_cse_service = None


def _normalize_text(value: str) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", normalized.lower()).strip()


def _extract_duckduckgo_url(raw_href: str) -> str:
    if not raw_href:
        return ""
    if "duckduckgo.com/l/?" in raw_href or raw_href.startswith("/l/?"):
        parsed = requests.utils.urlparse(raw_href)
        params = requests.utils.parse_qs(parsed.query)
        target = params.get("uddg")
        if target:
            return requests.utils.unquote(target[0])
    if raw_href.startswith("http"):
        return raw_href
    return ""


def _city_hint(company: Dict[str, str]) -> str:
    if company.get("city"):
        return company["city"]
    address = company.get("address") or ""
    if address:
        parts = [p.strip() for p in address.split(",") if p.strip()]
        if parts:
            return parts[-1]
    return company.get("location", "")


def _get_headless_searcher() -> Optional["HeadlessGoogleSearcher"]:
    global _headless_instance
    if HeadlessGoogleSearcher is None:
        return None
    with _headless_lock:
        if _headless_instance is None:
            try:
                _headless_instance = HeadlessGoogleSearcher(headless=True)
            except Exception as exc:
                logger.warning("Headless search unavailable: %s", exc)
                _headless_instance = None
    return _headless_instance


def _get_cse_service():
    global _cse_service
    if _cse_service is not None:
        return _cse_service
    if not _GOOGLE_CSE_SERVICE_ACCOUNT_FILE or not _GOOGLE_CSE_CX:
        return None
    try:
        creds = service_account.Credentials.from_service_account_file(
            _GOOGLE_CSE_SERVICE_ACCOUNT_FILE,
            scopes=["https://www.googleapis.com/auth/cse"],
        )
        _cse_service = google_build("customsearch", "v1", credentials=creds, cache_discovery=False)
    except Exception as exc:
        logger.warning("Failed to init service-account CSE: %s", exc)
        _cse_service = None
    return _cse_service


def _parse_ddgs_results(items: List[Dict]) -> List[Dict]:
    logger.info("Parsing CSE results: %d entries", len(items))
    candidates: List[Dict] = []
    for item in items:
        link = item.get("link") or item.get("url")
        if not link or not link.startswith(("http://", "https://")):
            continue
        host = requests.utils.urlparse(link).netloc.lower()
        if any(skip in host for skip in _SKIP_DOMAINS):
            continue
        candidates.append(
            {
                "url": link,
                "title": item.get("title", "").strip(),
                "snippet": item.get("snippet") or item.get("htmlSnippet") or "",
            }
        )
        if len(candidates) >= 5:
            break
    return candidates


def _google_custom_search(query: str) -> Optional[List[Dict]]:
    clean_query = query.replace('"', "")
    if _GOOGLE_CSE_KEY and _GOOGLE_CSE_CX:
        params = {
            "key": _GOOGLE_CSE_KEY,
            "cx": _GOOGLE_CSE_CX,
            "q": clean_query,
            "num": 8,
            "gl": "pl",
            "hl": "pl",
            "safe": "active",
        }
        try:
            logger.info("CSE HTTP GET | query=%s | params=%s", clean_query, params)
            resp = requests.get("https://www.googleapis.com/customsearch/v1", params=params, timeout=15)
            logger.info("CSE HTTP response | status=%s | body=%s", resp.status_code, resp.text[:400])
            resp.raise_for_status()
            return _parse_ddgs_results(resp.json().get("items", []))
        except Exception as exc:
            logger.warning("CSE API-key request failed for '%s': %s", clean_query, exc)
            return []
    service = _get_cse_service()
    if not service or not _GOOGLE_CSE_CX:
        return None
    try:
        response = (
            service.cse()
            .list(q=clean_query, cx=_GOOGLE_CSE_CX, num=8, gl="pl", hl="pl", safe="active")
            .execute()
        )
        logger.info("CSE service response keys for '%s': %s", clean_query, list(response.keys()))
        return _parse_ddgs_results(response.get("items", []))
    except Exception as exc:
        logger.warning("CSE service-account request failed for '%s': %s", clean_query, exc)
        return []


def _duckduckgo_fetch(query: str, endpoint: str) -> Optional[requests.Response]:
    params = {"q": query}
    for attempt in range(4):
        try:
            headers = {
                "User-Agent": random.choice(_USER_AGENTS),
                "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8",
                "Referer": "https://duckduckgo.com/",
            }
            resp = _DDG_SESSION.get(endpoint, params=params, headers=headers, timeout=15)
            if resp.status_code in (429, 403):
                time.sleep(2 ** attempt + random.random())
                continue
            resp.raise_for_status()
            time.sleep(0.5 + random.random() * 0.3)
            return resp
        except requests.RequestException as exc:
            logger.warning("DuckDuckGo fetch error (%s): %s", query, exc)
            time.sleep(2 ** attempt + 0.5)
    return None


def _parse_duckduckgo_html(html: str) -> List[Dict]:
    soup = BeautifulSoup(html, "html.parser")
    candidates: List[Dict] = []
    for result in soup.select("div.result"):
        link = result.select_one("a.result__a")
        if not link:
            continue
        href = _extract_duckduckgo_url(link.get("href"))
        if not href or not href.startswith(("http://", "https://")):
            continue
        host = requests.utils.urlparse(href).netloc.lower()
        if any(skip in host for skip in _SKIP_DOMAINS):
            continue
        snippet = result.select_one(".result__snippet")
        candidates.append(
            {
                "url": href,
                "title": link.text.strip(),
                "snippet": snippet.text.strip() if snippet else "",
            }
        )
        if len(candidates) >= 5:
            break
    return candidates


def _parse_duckduckgo_lite(html: str) -> List[Dict]:
    soup = BeautifulSoup(html, "html.parser")
    candidates: List[Dict] = []
    for result in soup.select("table.result"):
        link = result.select_one("a")
        if not link:
            continue
        href = _extract_duckduckgo_url(link.get("href"))
        if not href or not href.startswith(("http://", "https://")):
            continue
        host = requests.utils.urlparse(href).netloc.lower()
        if any(skip in host for skip in _SKIP_DOMAINS):
            continue
        snippet_cell = result.select_one("td div")
        candidates.append(
            {
                "url": href,
                "title": link.text.strip(),
                "snippet": snippet_cell.text.strip() if snippet_cell else "",
            }
        )
        if len(candidates) >= 5:
            break
    return candidates


def _collect_candidates(query: str) -> Tuple[List[Dict], str]:
    cse = _google_custom_search(query)
    if cse:
        logger.info("Candidates from CSE for '%s': %d", query, len(cse))
        return cse, "Google Custom Search API"
    logger.warning("CSE returned no results for '%s'.", query)
    return [], "Brak odpowiedzi"


def _collect_search_candidates(query: str, subject: str) -> Tuple[List[Dict], str]:
    return _collect_candidates(query)


def search_web_candidates(query: str, limit: int = 8) -> List[Dict]:
    """Expose a lightweight helper for modules that need raw CSE results."""
    if not query.strip():
        return []
    candidates, _source = _collect_candidates(query.strip())
    filtered = _filter_html_candidates(candidates)
    unique: List[Dict] = []
    seen: set[str] = set()
    for cand in filtered:
        url = (cand.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        unique.append(cand)
        if len(unique) >= limit:
            break
    return unique


def _filter_html_candidates(candidates: List[Dict]) -> List[Dict]:
    filtered: List[Dict] = []
    for cand in candidates:
        url = cand.get("url") or ""
        if not url.startswith(("http://", "https://")):
            continue
        parsed = requests.utils.urlparse(url)
        if parsed.path.lower().endswith((".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip")):
            continue
        host = parsed.netloc.lower()
        if any(skip in host for skip in _SKIP_DOMAINS):
            continue
        filtered.append(cand)
    return filtered


def generate_search_queries(name: str, city: str, voivodeship: str, context: str = "") -> List[str]:
    base = f"{name} {city}".strip()
    if not openai.api_key:
        return [q for q in [base, f"{name} oficjalna strona", f"{name} kontakt"] if q]
    prompt = (
        f"Nazwa podmiotu: {name}\n"
        f"Miasto/region: {city or 'brak'}\n"
        f"Województwo: {voivodeship or 'brak'}\n"
        f"Kontekst inwestycji: {context or 'brak dodatkowych informacji'}\n"
        "Przygotuj maksymalnie 3 różne zapytania Google, które pomogą znaleźć oficjalną stronę lub kontakt.\n"
        "Zwróć numerowaną listę."
    )
    try:
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": "Tworzysz skuteczne zapytania Google"},
                {"role": "user", "content": prompt},
            ],
        )
        content = response.choices[0].message.content.strip()
        record_openai_usage(max(len(content) // 4, 120), "query_generation")
        queries: List[str] = []
        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            if line[0].isdigit():
                parts = line.split(".", 1)
                if len(parts) == 2:
                    queries.append(parts[1].strip())
                else:
                    queries.append(line)
            else:
                queries.append(line)
        return [q.replace('"', "") for q in queries if q] or [base]
    except Exception as exc:
        logger.warning("AI query generation failed for %s: %s", name, exc)
        return [base]


def rank_candidates_with_ai(query: str, candidates: List[Dict]) -> Tuple[str, str]:
    if not candidates:
        return "", ""
    if not openai.api_key:
        return candidates[0]["url"], "Brak klucza OpenAI – wybrano pierwszy wynik"
    summary = [
        f"Szukamy oficjalnej strony pasującej do zapytania '{query}'. Preferuj domeny należące do podmiotu.",
        "Unikaj katalogów i plików PDF.\n",
    ]
    for idx, cand in enumerate(candidates, start=1):
        summary.append(f"{idx}. {cand['title']} – {cand['url']} – {cand.get('snippet','')}")
    summary.append("Odpowiedz numerem lub adresem URL. Jeśli nic nie pasuje, napisz 'NONE'.")
    try:
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Jesteś asystentem wybierającym najlepszy wynik wyszukiwania"},
                {"role": "user", "content": "\n".join(summary)},
            ],
            temperature=0,
        )
        content = response.choices[0].message.content.strip()
        record_openai_usage(max((len(summary[-1]) + len(content)) // 4, 150), "site_verification")
    except Exception as exc:
        logger.warning("AI ranking failed: %s", exc)
        return candidates[0]["url"], f"Błąd OpenAI: {exc}"
    if "none" in content.lower():
        return "", content
    url_match = re.search(r"https?://\S+", content)
    if url_match:
        return url_match.group(0).rstrip(").,;"), content
    num_match = re.search(r"\b(\d+)\b", content)
    if num_match:
        idx = int(num_match.group(1)) - 1
        if 0 <= idx < len(candidates):
            return candidates[idx]["url"], content
    return candidates[0]["url"], content


def discover_company_website(company: Dict, status_callback: Optional[Callable[[str], None]] = None) -> str:
    name = (company.get("name") or "").strip()
    if not name:
        return ""
    city = (_city_hint(company) or "").strip()
    voivodeship = company.get("voivodeship_canonical") or company.get("voivodeship") or ""
    context = (
        company.get("context_summary")
        or company.get("kpo_category")
        or company.get("notes")
        or ""
    ).strip()
    cache_key = f"{name}|{city}|{context}".lower()
    if cache_key in _SITE_SEARCH_CACHE:
        return _SITE_SEARCH_CACHE[cache_key]

    queries = generate_search_queries(name, city, voivodeship, context)
    searcher = _get_headless_searcher()

    for idx, query in enumerate(queries, start=1):
        if status_callback:
            status_callback(f"[{idx}/{len(queries)}] {query}")
        if searcher:
            try:
                headless_results = searcher.search(query, limit=6)
                filtered = [
                    cand for cand in headless_results if cand.get("url") and not cand["url"].endswith(".pdf")
                ]
                if filtered:
                    best_url, reasoning = rank_candidates_with_ai(query, filtered)
                    if best_url:
                        _SITE_SEARCH_CACHE[cache_key] = best_url
                        logger.info("Website found via headless for '%s': %s", name, best_url)
                        if status_callback:
                            status_callback(f"✓ {best_url} (headless)")
                        return best_url
            except Exception as exc:
                logger.warning("Headless search failed for '%s': %s", name, exc)
                searcher = None

        candidates, source = _collect_candidates(query)
        filtered = [
            cand
            for cand in candidates
            if cand.get("url") and not cand["url"].lower().endswith((".pdf", ".doc", ".docx"))
        ]
        if filtered:
            if len(filtered) == 1 or not openai.api_key:
                best_url = filtered[0]["url"]
                reasoning = "Tylko jeden wynik."
            else:
                best_url, reasoning = rank_candidates_with_ai(query, filtered)
            if best_url:
                _SITE_SEARCH_CACHE[cache_key] = best_url
                logger.info("Website candidate selected for '%s': %s via %s", name, best_url, source)
                if status_callback:
                    status_callback(f"✓ {best_url} ({source})")
                return best_url
    if status_callback:
        status_callback("✗ Nie znaleziono oficjalnej strony")
    _SITE_SEARCH_CACHE[cache_key] = ""
    return ""


def enrich_company_profile(
    company: Dict,
    config: Dict,
    status_callback: Optional[Callable[[str], None]] = None,
) -> Dict:
    enriched = dict(company)
    website_url = enriched.get("website") or discover_company_website(enriched, status_callback=status_callback)
    if website_url:
        enriched["website"] = website_url
        crawl = scrape_company_website(enriched.get("name", ""), website_url) or {}
        if crawl:
            enriched = merge_company_data(enriched, crawl, {})
    enriched = validate_company_data(enriched)
    return enriched

