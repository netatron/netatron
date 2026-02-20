from __future__ import annotations

import math
import time
from typing import Dict, Iterable, List

from app.config import ENABLE_ROW_RESULTS
from app.repos.job_repository import JobRepository
from app.services.enrichment import enrich_company_profile, search_web_candidates
from app.services.storage import StorageClient


def _expand_queries(seed: str) -> List[str]:
    normalized = seed.strip()
    variants = {
        normalized,
        f"{normalized} oficjalna strona",
        f"{normalized} kontakt",
        f"{normalized} email",
        f"{normalized} phone",
        f"{normalized} b2b",
    }
    return [q for q in variants if q]


def _build_payload(query: str, candidate: Dict[str, str]) -> Dict[str, str]:
    return {
        "name": candidate.get("title") or candidate.get("name") or "Nieznana firma",
        "website": candidate.get("url") or candidate.get("website"),
        "note": candidate.get("snippet") or candidate.get("description") or "",
        "source_query": query,
    }


def _iter_records(records: Iterable[Dict[str, str]]) -> List[Dict[str, str]]:
    return [dict(record) for record in records]


def run_deep_search_job(repo: JobRepository, job_id: str, storage: StorageClient) -> None:
    job = repo.get_job_by_id(job_id)
    if not job:
        return

    params = job.params or {}
    query = (params.get("query") or "").strip()
    if not query:
        repo.set_error(job, "Brak zapytania dla Deep Search.")
        return

    desired = params.get("limit") or job.desired_results or 25
    try:
        desired = max(1, min(int(desired), 200))
    except Exception:
        desired = 25

    queries = _expand_queries(query)
    repo.add_log(job=job, tenant_id=job.tenant_id, message=f"Start Deep Search dla '{query}' ({len(queries)} wariantów).")
    repo.update_status(job, "running", progress=0.0)

    leads: List[Dict[str, str]] = []
    for idx, variant in enumerate(queries, start=1):
        repo.refresh(job)
        if job.stop_requested:
            repo.update_status(job, "stopped")
            repo.add_log(job=job, tenant_id=job.tenant_id, message="Zatrzymano na żądanie użytkownika.")
            return
        while job.pause_requested and not job.stop_requested:
            repo.update_status(job, "paused")
            time.sleep(0.5)
            repo.refresh(job)
        repo.update_status(job, "running")

        repo.add_log(job=job, tenant_id=job.tenant_id, message=f"[{idx}/{len(queries)}] Szukam: {variant}")
        candidates = search_web_candidates(variant, limit=6)
        if not candidates:
            repo.add_log(job=job, tenant_id=job.tenant_id, message=f"Brak kandydatów dla '{variant}'.")
            continue

        for cand in candidates:
            repo.refresh(job)
            if job.stop_requested:
                break
            payload = _build_payload(variant, cand)
            enriched = enrich_company_profile(payload, {"enhance_with_rejestr": False}, status_callback=None)
            leads.append(enriched)
            if ENABLE_ROW_RESULTS:
                repo.add_result_row(job=job, tenant_id=job.tenant_id, payload=enriched)
            progress = min(0.95, len(leads) / float(desired))
            repo.update_progress(job, progress)
            if desired and len(leads) >= desired:
                break
        if desired and len(leads) >= desired:
            break

    snapshot = _iter_records(leads)
    uri = storage.save_records(job.tenant_id, job.id, snapshot)
    repo.attach_storage(job, uri)
    repo.add_result_metadata(job=job, tenant_id=job.tenant_id, kind="csv", uri=uri, row_count=len(snapshot))
    repo.update_status(job, "completed", progress=1.0)
    repo.add_log(job=job, tenant_id=job.tenant_id, message=f"Deep Search zakończony. Zebrano {len(snapshot)} rekordów.")
