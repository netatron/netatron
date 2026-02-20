from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Dict, List

ROOT_DIR = Path(__file__).resolve().parents[3]
LIB_DIR = ROOT_DIR / "lib"
if str(LIB_DIR) not in sys.path:
    sys.path.append(str(LIB_DIR))

from scraper_google_api import scrape_google_maps_api

from app.config import ENABLE_ROW_RESULTS
from app.repos.job_repository import JobRepository
from app.services.storage import StorageClient
from app.services.enrichment import enrich_company_profile


def run_maps_job(repo: JobRepository, job_id: str, storage: StorageClient):
    job = repo.get_job_by_id(job_id)
    if not job:
        return
    params: Dict = job.params or {}
    queries: List[str] = params.get("queries") or []
    if not queries:
        repo.set_error(job, "Brak zapytań do przetworzenia.")
        return

    results: List[Dict] = []
    total_queries = len(queries)

    for idx, query in enumerate(queries, start=1):
        repo.refresh(job)
        if job.stop_requested:
            repo.update_status(job, "stopped")
            repo.add_log(job=job, tenant_id=job.tenant_id, message="Zatrzymano na żądanie.")
            return
        while job.pause_requested and not job.stop_requested:
            repo.update_status(job, "paused")
            time.sleep(0.5)
            repo.refresh(job)
        repo.update_status(job, "running")

        repo.add_log(job=job, tenant_id=job.tenant_id, message=f"[{idx}/{total_queries}] Szukam: {query}")
        try:
            payload = scrape_google_maps_api(query, max_results=60)
        except Exception as exc:  # pragma: no cover - external API
            repo.add_log(job=job, tenant_id=job.tenant_id, message=f"Błąd zapytania: {exc}")
            continue

        companies = payload.get("companies", [])
        for company in companies:
            repo.refresh(job)
            if job.stop_requested:
                break
            enriched = enrich_company_profile(company, {"enhance_with_rejestr": False}, status_callback=None)
            results.append(enriched)
            if ENABLE_ROW_RESULTS:
                repo.add_result_row(job=job, tenant_id=job.tenant_id, payload=enriched)
            if job.desired_results and len(results) >= job.desired_results:
                break
        repo.update_progress(job, idx / total_queries)
        if job.desired_results and len(results) >= job.desired_results:
            break

    uri = storage.save_records(job.tenant_id, job.id, results)
    repo.attach_storage(job, uri)
    repo.add_result_metadata(job=job, tenant_id=job.tenant_id, kind="csv", uri=uri, row_count=len(results))
    repo.update_status(job, "completed", progress=1.0)
    repo.add_log(job=job, tenant_id=job.tenant_id, message=f"Zakończono – {len(results)} rekordów.")
    uri = storage.save_records(job.tenant_id, job.id, results)
    repo.attach_storage(job, uri)
    repo.add_result_metadata(job=job, tenant_id=job.tenant_id, kind="csv", uri=uri, row_count=len(results))
    repo.update_status(job, "completed", progress=1.0)
    repo.add_log(job=job, tenant_id=job.tenant_id, message=f"Zakończono – {len(results)} rekordów.")


