from __future__ import annotations

from typing import Dict

from app.config import ENABLE_ROW_RESULTS
from app.repos.job_repository import JobRepository
from app.services.storage import StorageClient
from app.services import kpo as kpo_service


def run_kpo_job(repo: JobRepository, job_id: str, storage: StorageClient):
    job = repo.get_job_by_id(job_id)
    if not job:
        return
    params: Dict = job.params or {}
    categories = params.get("categories") or []
    if not categories and not params.get("select_all"):
        repo.set_error(job, "Brak kategorii KPO.")
        return

    def status_callback(message: str):
        repo.add_log(job=job, tenant_id=job.tenant_id, message=message)

    try:
        data = kpo_service.scrape_kpo_categories(
            categories,
            select_all=params.get("select_all", False),
            refresh_config=params.get("refresh_config", False),
            voivodeships=params.get("voivodeships"),
            use_inference=params.get("use_inference", True),
            limit=params.get("limit"),
            status_callback=status_callback,
        )
    except Exception as exc:  # pragma: no cover - network errors
        repo.set_error(job, f"Błąd KPO: {exc}")
        return

    results = data.get("results", [])
    if ENABLE_ROW_RESULTS:
        for row in results:
            repo.add_result_row(job=job, tenant_id=job.tenant_id, payload=row)
    uri = storage.save_records(job.tenant_id, job.id, results)
    repo.attach_storage(job, uri)
    repo.add_result_metadata(job=job, tenant_id=job.tenant_id, kind="csv", uri=uri, row_count=len(results))
    repo.update_status(job, "completed", progress=1.0)
    repo.add_log(job=job, tenant_id=job.tenant_id, message=f"Zakończono – {len(results)} rekordów.")
