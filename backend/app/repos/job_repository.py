from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from sqlalchemy.orm import Session

from app.db import models

class JobRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_job(
        self,
        *,
        tenant_id: str,
        source: str,
        params: Dict[str, Any],
        desired_results: Optional[int],
    ) -> models.Job:
        job = models.Job(
            tenant_id=tenant_id,
            source=source,
            status="pending",
            params=params or {},
            desired_results=desired_results,
            progress=0.0,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def list_jobs(self, tenant_id: str, limit: int = 50) -> List[models.Job]:
        stmt = (
            select(models.Job)
            .where(models.Job.tenant_id == tenant_id)
            .order_by(models.Job.created_at.desc())
            .limit(limit)
        )
        jobs = list(self.db.scalars(stmt))
        # Filter out jobs that have no result rows (if ENABLE_ROW_RESULTS is enabled)
        # This prevents showing empty jobs in the UI
        # But only if we can safely check (table exists)
        filtered_jobs = []
        for job in jobs:
            # Keep job if it has storage_uri (legacy jobs)
            if job.storage_uri:
                filtered_jobs.append(job)
            # Also keep jobs that are still running or pending
            elif job.status in ("pending", "running", "pausing", "stopping"):
                filtered_jobs.append(job)
            # Try to check if job has result rows, but don't fail if table doesn't exist
            else:
                try:
                    if self.has_result_rows(tenant_id, job.id):
                        filtered_jobs.append(job)
                except Exception:
                    # If we can't check (table doesn't exist), include the job anyway
                    filtered_jobs.append(job)
        return filtered_jobs

    def get_job(self, tenant_id: str, job_id: str) -> Optional[models.Job]:
        stmt = select(models.Job).where(models.Job.id == job_id, models.Job.tenant_id == tenant_id)
        return self.db.scalar(stmt)

    def get_job_by_id(self, job_id: str) -> Optional[models.Job]:
        stmt = select(models.Job).where(models.Job.id == job_id)
        return self.db.scalar(stmt)

    def refresh(self, job: models.Job) -> models.Job:
        self.db.refresh(job)
        return job

    def update_status(self, job: models.Job, status: str, progress: Optional[float] = None) -> models.Job:
        job.status = status
        if progress is not None:
            job.progress = progress
        job.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(job)
        return job

    def update_progress(self, job: models.Job, progress: float) -> models.Job:
        job.progress = progress
        job.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(job)
        return job

    def attach_storage(self, job: models.Job, storage_uri: str | None) -> models.Job:
        job.storage_uri = storage_uri
        job.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(job)
        return job

    def add_log(self, *, job: models.Job, tenant_id: str, message: str) -> models.JobLog:
        log = models.JobLog(job_id=job.id, tenant_id=tenant_id, message=message)
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def list_logs(self, tenant_id: str, job_id: str, limit: int = 200) -> List[models.JobLog]:
        stmt = (
            select(models.JobLog)
            .where(models.JobLog.job_id == job_id, models.JobLog.tenant_id == tenant_id)
            .order_by(models.JobLog.created_at.desc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt))

    def add_result_metadata(
        self,
        *,
        job: models.Job,
        tenant_id: str,
        kind: str,
        uri: str,
        row_count: Optional[int],
    ) -> models.JobResultMetadata:
        record = models.JobResultMetadata(
            job_id=job.id,
            tenant_id=tenant_id,
            kind=kind,
            uri=uri,
            row_count=row_count,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def list_results(self, tenant_id: str, job_id: str) -> List[models.JobResultMetadata]:
        stmt = select(models.JobResultMetadata).where(
            models.JobResultMetadata.job_id == job_id,
            models.JobResultMetadata.tenant_id == tenant_id,
        )
        return list(self.db.scalars(stmt))

    def add_result_row(
        self,
        *,
        job: models.Job,
        tenant_id: str,
        payload: Dict[str, Any],
    ) -> models.JobResultRow:
        record = models.JobResultRow(job_id=job.id, tenant_id=tenant_id, payload=payload)
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def list_result_rows(
        self,
        tenant_id: str,
        job_id: str,
        include_deleted: bool = False,
    ) -> List[models.JobResultRow]:
        try:
            stmt = select(models.JobResultRow).where(
                models.JobResultRow.job_id == job_id,
                models.JobResultRow.tenant_id == tenant_id,
            )
            if not include_deleted:
                stmt = stmt.where(models.JobResultRow.deleted_at.is_(None))
            stmt = stmt.order_by(models.JobResultRow.created_at.asc())
            return list(self.db.scalars(stmt))
        except Exception:
            # If table doesn't exist or other error, return empty list
            return []

    def mark_rows_deleted(
        self,
        tenant_id: str,
        job_id: str,
        row_ids: List[str],
    ) -> int:
        if not row_ids:
            return 0
        stmt = select(models.JobResultRow).where(
            models.JobResultRow.job_id == job_id,
            models.JobResultRow.tenant_id == tenant_id,
            models.JobResultRow.id.in_(row_ids),
            models.JobResultRow.deleted_at.is_(None),
        )
        rows = list(self.db.scalars(stmt))
        if not rows:
            return 0
        now = datetime.utcnow()
        for row in rows:
            row.deleted_at = now
            row.updated_at = now
        self.db.commit()
        return len(rows)

    def update_result_metadata_count(self, job: models.Job, row_count: int) -> None:
        for metadata in job.results:
            metadata.row_count = row_count
            metadata.updated_at = datetime.utcnow()
        self.db.commit()

    def request_pause(self, job: models.Job) -> models.Job:
        job.pause_requested = True
        job.updated_at = datetime.utcnow()
        job.status = "pausing"
        self.db.commit()
        self.db.refresh(job)
        return job

    def request_resume(self, job: models.Job) -> models.Job:
        job.pause_requested = False
        job.updated_at = datetime.utcnow()
        job.status = "running"
        self.db.commit()
        self.db.refresh(job)
        return job

    def request_stop(self, job: models.Job) -> models.Job:
        job.stop_requested = True
        job.updated_at = datetime.utcnow()
        job.status = "stopping"
        self.db.commit()
        self.db.refresh(job)
        return job

    def set_error(self, job: models.Job, message: str) -> models.Job:
        job.last_error = message
        job.status = "failed"
        job.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(job)
        return job

    def delete_job(self, tenant_id: str, job_id: str) -> bool:
        """Delete a job and all its related data (logs, results, rows)."""
        job = self.get_job(tenant_id, job_id)
        if not job:
            return False
        # Cascade delete will handle related records (logs, results, rows)
        self.db.delete(job)
        self.db.commit()
        return True

    def has_result_rows(self, tenant_id: str, job_id: str) -> bool:
        """Check if job has any non-deleted result rows."""
        try:
            rows = self.list_result_rows(tenant_id, job_id, include_deleted=False)
            return len(rows) > 0
        except Exception:
            # If table doesn't exist or other error, assume no rows
            return False
