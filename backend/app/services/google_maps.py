from __future__ import annotations

from typing import Callable, Dict, List, Optional, Tuple

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
LIB_DIR = ROOT_DIR / "lib"
if str(LIB_DIR) not in sys.path:
    sys.path.append(str(LIB_DIR))

from scraper_google_api import scrape_google_maps_api
from cost_monitor import get_cost_monitor

from .enrichment import enrich_company_profile

StatusCallback = Optional[Callable[[str], None]]

def scrape_google_maps_queries(
    queries: List[str],
    imported_results: Optional[List[Dict]] = None,
    status_callback: StatusCallback = None,
) -> Tuple[List[Dict], List[str]]:
    """Scrape Google Maps queries and return enriched company data plus logs."""
    queries = [q.strip() for q in queries if q and q.strip()]
    if not queries:
        return [], ["? Brak zapytań do przetworzenia."]

    results: List[Dict] = list(imported_results or [])
    dedup = {
        (item.get("name") or "").strip().lower()
        for item in results
        if item.get("name")
    }
    logs: List[str] = []
    monitor = get_cost_monitor()

    total = len(queries)
    for idx, query in enumerate(queries, start=1):
        message = f"[{idx}/{total}] Szukam w Google Maps: {query}"
        logs.append(message)
        if status_callback:
            status_callback(message)
        try:
            payload = scrape_google_maps_api(query, max_results=60)
        except Exception as exc:
            error = f"?? Błąd zapytania '{query}': {exc}"
            logs.append(error)
            if status_callback:
                status_callback(error)
            continue

        companies = payload.get("companies", [])
        monitor.record_google_maps_query(len(companies))
        for company in companies:
            name_key = (company.get("name") or "").strip().lower()
            if not name_key or name_key in dedup:
                continue
            detail_msg = f"   • Wzbogacam: {company.get('name', 'firma')[:80]}"
            logs.append(detail_msg)
            if status_callback:
                status_callback(detail_msg)
            enriched = enrich_company_profile(
                company,
                {"enhance_with_rejestr": False},
                status_callback=status_callback,
            )
            results.append(enriched)
            dedup.add(name_key)

    summary = f"? Zakończono: {len(results)} rekordów."
    logs.append(summary)
    if status_callback:
        status_callback(summary)
    monitor.record_companies_processed(len(results))
    return results, logs

