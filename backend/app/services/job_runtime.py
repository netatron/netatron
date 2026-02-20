from __future__ import annotations

import threading
import time
from queue import Queue
from typing import Callable, Dict

from sqlalchemy.orm import Session

from app.config import GCS_RESULTS_BUCKET, RESULTS_STORAGE_DIR
from app.db.session import SessionLocal
from app.repos.job_repository import JobRepository
from app.services.storage import StorageClient
from app.services.workers.deep_search_worker_enhanced import run_deep_search_job
from app.services.workers.kpo_worker import run_kpo_job
from app.services.workers.maps_worker import run_maps_job

WorkerFn = Callable[[JobRepository, str, StorageClient], None]


class JobRuntimeManager:
    def __init__(self):
        self.queue: Queue[str] = Queue()
        self.storage = StorageClient(RESULTS_STORAGE_DIR, bucket_name=GCS_RESULTS_BUCKET)
        self.workers: Dict[str, WorkerFn] = {
            "kpo": run_kpo_job,
            "maps": run_maps_job,
            "deep_search": run_deep_search_job,
        }
        self.worker_thread = threading.Thread(target=self._run_loop, daemon=True)
        self.worker_thread.start()

    def submit(self, job_id: str):
        self.queue.put(job_id)

    def _run_loop(self):
        while True:
            job_id = self.queue.get()
            try:
                self._process_job(job_id)
            finally:
                self.queue.task_done()

    def _process_job(self, job_id: str):
        db: Session = SessionLocal()
        repo = JobRepository(db)
        try:
            job = repo.get_job_by_id(job_id)
            if not job:
                return
            worker = self.workers.get(job.source)
            if not worker:
                repo.set_error(job, f"Unknown job source: {job.source}")
                return
            repo.update_status(job, "running", progress=0.0)
            worker(repo, job_id, self.storage)
        finally:
            db.close()


runtime_manager = JobRuntimeManager()
