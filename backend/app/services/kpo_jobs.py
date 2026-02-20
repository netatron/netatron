import json
import threading
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from . import kpo as kpo_service


class JobInterrupted(RuntimeError):
    """Raised when a job is interrupted via pause/stop controls."""


class KpoJob:
    def __init__(self, payload: Dict):
        self.id = str(uuid.uuid4())
        self.created_at = datetime.utcnow().isoformat()
        self.params = payload
        self.status = "running"
        self.error: str = ""
        self.logs: List[str] = []
        self.results: List[Dict] = []
        self.processed_records = 0
        self.total_records = 0
        self.categories_used: List[str] = []
        self.voivodeships_filter: List[str] = payload.get("voivodeships") or []
        self.thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()
        self.pause_event = threading.Event()
        self.stop_event = threading.Event()
        self._pause_logged = False

    def append_log(self, message: str):
        with self.lock:
            self.logs.append(message)
            self.logs = self.logs[-200:]

    def add_record(self, record: Dict):
        with self.lock:
            self.results.append(record)
            self.processed_records = len(self.results)

    def snapshot(self) -> Dict:
        with self.lock:
            return {
                "job_id": self.id,
                "created_at": self.created_at,
                "status": self.status,
                "error": self.error,
                "logs": list(self.logs),
                "results_count": len(self.results),
                "processed_records": self.processed_records,
                "total_records": self.total_records,
                "categories_used": list(self.categories_used),
                "voivodeships_filter": self.voivodeships_filter,
                "limit": self.params.get("limit"),
                "paused": self.pause_event.is_set() or self.status == "paused",
            }

    def checkpoint(self):
        if self.stop_event.is_set():
            raise JobInterrupted("stopped")
        if self.pause_event.is_set():
            if not self._pause_logged:
                self.append_log("⏸️ Zadanie zostalo wstrzymane. Czekam na wznowienie.")
                self._pause_logged = True
            with self.lock:
                self.status = "paused"
            while self.pause_event.is_set():
                if self.stop_event.is_set():
                    raise JobInterrupted("stopped")
                time.sleep(0.25)
            with self.lock:
                self.status = "running"
            self.append_log("▶️ Zadanie wznowione. Kontynuuje prace.")
            self._pause_logged = False

    def pause(self) -> bool:
        with self.lock:
            if self.status not in ("running", "pending"):
                return False
            self.pause_event.set()
            self.status = "paused"
            self.append_log("⏸️ Otrzymalem zadanie pauzy od interfejsu.")
        return True

    def resume(self) -> bool:
        if not self.pause_event.is_set():
            return False
        self.pause_event.clear()
        with self.lock:
            self.status = "running"
        self.append_log("▶️ Otrzymalem zadanie wznowienia od interfejsu.")
        return True

    def stop(self) -> bool:
        with self.lock:
            if self.status in ("completed", "failed", "stopped"):
                return False
            self.stop_event.set()
            self.pause_event.clear()
            if self.status != "paused":
                self.status = "stopping"
            self.append_log("⏹️ Otrzymalem zadanie zatrzymania od interfejsu.")
        return True


_jobs: Dict[str, KpoJob] = {}
_jobs_lock = threading.Lock()


def start_job(payload: Dict) -> KpoJob:
    job = KpoJob(payload)

    def runner():
        try:
            def emit(message: str):
                job.checkpoint()
                if isinstance(message, str) and message.startswith("__record__"):
                    try:
                        data = json.loads(message[len("__record__"):])
                        job.add_record(data)
                    except Exception:
                        pass
                else:
                    job.append_log(message)

            result = kpo_service.scrape_kpo_categories(
                payload.get("categories", []),
                select_all=payload.get("select_all", False),
                refresh_config=payload.get("refresh_config", False),
                voivodeships=payload.get("voivodeships"),
                use_inference=payload.get("use_inference", True),
                limit=payload.get("limit"),
                status_callback=emit,
                checkpoint=job.checkpoint,
            )
            with job.lock:
                if not job.results:
                    job.results = result.get("results", [])
                job.total_records = result.get("total_records", len(job.results))
                job.categories_used = result.get("categories_used", [])
                job.voivodeships_filter = result.get("voivodeships_filter", job.voivodeships_filter)
                job.status = "completed"
        except JobInterrupted:
            with job.lock:
                job.status = "stopped"
                job.error = ""
                job.append_log("⏹️ Zadanie zatrzymane na prosbe uzytkownika.")
        except Exception as exc:
            with job.lock:
                job.status = "failed"
                job.error = str(exc)
                job.append_log(f"[ERROR] {exc}")
        finally:
            with job.lock:
                if job.status == "running":
                    job.status = "completed"

    with _jobs_lock:
        _jobs[job.id] = job
    thread = threading.Thread(target=runner, daemon=True)
    job.thread = thread
    thread.start()
    return job


def get_job(job_id: str) -> Optional[KpoJob]:
    return _jobs.get(job_id)


def list_jobs() -> List[KpoJob]:
    with _jobs_lock:
        return list(_jobs.values())


def get_results_slice(job: KpoJob, offset: int, limit: int) -> Dict:
    with job.lock:
        total = len(job.results)
        items = job.results[offset : offset + limit]
    return {"total": total, "items": items}


def control_job(job_id: str, action: str) -> Dict:
    job = get_job(job_id)
    if not job:
        raise ValueError("Job not found")
    action = action.lower()
    if action == "pause":
        if not job.pause():
            raise ValueError("Nie można wstrzymać zadania.")
    elif action == "resume":
        if not job.resume():
            raise ValueError("Nie można wznowić zadania.")
    elif action == "stop":
        if not job.stop():
            raise ValueError("Nie można zatrzymać zadania.")
    else:
        raise ValueError("Unknown action")
    return job.snapshot()
