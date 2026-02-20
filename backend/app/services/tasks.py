# -*- coding: utf-8 -*-
import threading
import time
import uuid
from datetime import datetime
from typing import Dict, List

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
LIB_DIR = ROOT_DIR / "lib"
if str(LIB_DIR) not in sys.path:
    sys.path.append(str(LIB_DIR))

from scraper_google_api import scrape_google_maps_api
from cost_monitor import get_cost_monitor

from .enrichment import enrich_company_profile


class TaskState:
    def __init__(self, queries: List[str], imported: List[dict], desired_results: int | None = None):
        self.id = str(uuid.uuid4())
        self.created_at = datetime.utcnow().isoformat()
        self.queries = queries
        self.imported = imported
        self.query_index = 0
        self.total_queries = len(queries)
        self.results = list(imported)
        self.dedup = {(item.get("name") or "").strip().lower() for item in imported if item.get("name")}
        self.log: List[str] = []
        self.running = False
        self.paused = False
        self.stop_reason = ""
        self.thread: threading.Thread | None = None
        self.pause_event = threading.Event()
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.desired_results = desired_results

    def append_log(self, message: str):
        if not message:
            return
        with self.lock:
            self.log.append(message)
            self.log = self.log[-120:]


_tasks: Dict[str, TaskState] = {}
_tasks_lock = threading.Lock()


def start_task(config: Dict) -> TaskState:
    queries = [q.strip() for q in config.get("queries", []) if q and q.strip()]
    if not queries:
        raise ValueError("No queries to process")
    imported = config.get("imported_results", []) or []

    desired_raw = config.get("desired_results")
    desired: int | None = None
    if desired_raw is not None:
        try:
            desired_int = int(desired_raw)
        except (TypeError, ValueError):
            desired = None
        else:
            if desired_int >= 1:
                desired = min(desired_int, 1000)

    task = TaskState(queries, imported, desired)
    with _tasks_lock:
        _tasks[task.id] = task
    thread = threading.Thread(target=_run_task, args=(task,), daemon=True)
    task.thread = thread
    task.running = True
    thread.start()
    return task


def _run_task(task: TaskState):
    monitor = get_cost_monitor()
    try:
        pause_logged = False
        limit_reached = False
        for idx in range(task.query_index, task.total_queries):
            if task.stop_event.is_set():
                task.stop_reason = "stopped"
                task.append_log("⏹️ Zadanie zatrzymane na prośbę użytkownika.")
                break
            while task.pause_event.is_set() and not task.stop_event.is_set():
                if not pause_logged:
                    task.append_log("⏸️ Zadanie wstrzymane. Czekam na wznowienie.")
                    pause_logged = True
                time.sleep(0.25)
            if pause_logged and not task.pause_event.is_set():
                task.append_log("▶️ Wznawiam pracę.")
                pause_logged = False
            if task.stop_event.is_set():
                task.stop_reason = "stopped"
                task.append_log("⏹️ Zadanie zatrzymane na prośbę użytkownika.")
                break

            query = task.queries[idx]
            task.append_log(f"[{idx + 1}/{task.total_queries}] Szukam firm dla zapytania: {query}")
            try:
                payload = scrape_google_maps_api(query, max_results=60)
            except Exception as exc:
                task.append_log(f"⚠️ Błąd podczas zapytania: {exc}")
                continue

            companies = payload.get("companies", [])
            monitor.record_google_maps_query(len(companies))

            for company in companies:
                if task.stop_event.is_set() or task.pause_event.is_set():
                    break
                name_key = (company.get("name") or "").strip().lower()
                if not name_key or name_key in task.dedup:
                    continue
                display_name = company.get("name") or "Nieznana firma"
                task.append_log(f"• Wzbogacam firmę: {display_name}")
                enriched = enrich_company_profile(
                    company,
                    {"enhance_with_rejestr": False},
                    status_callback=task.append_log,
                )
                with task.lock:
                    task.results.append(enriched)
                    task.dedup.add(name_key)
                    current_total = len(task.results)
                task.append_log(f"✅ Dodano {display_name}")
                if task.desired_results and current_total >= task.desired_results:
                    task.append_log(
                        f"🎯 Osiągnąłem limit {task.desired_results} firm. Zatrzymuję zadanie."
                    )
                    task.stop_reason = "limit_reached"
                    limit_reached = True
                    break

            with task.lock:
                task.query_index = idx + 1

            if limit_reached:
                break

        else:
            if not task.stop_reason:
                task.stop_reason = "completed"
                task.append_log("✅ Zakończyłem wszystkie zapytania.")
    except Exception as exc:
        task.stop_reason = f"error: {exc}"
        task.append_log(f"Critical error: {exc}")
    finally:
        monitor.record_companies_processed(len(task.results))
        task.running = False
        task.paused = False


def get_task(task_id: str) -> TaskState | None:
    return _tasks.get(task_id)


def get_status(task: TaskState) -> Dict:
    with task.lock:
        status = "running" if task.running else "paused" if task.paused else "finished"
        return {
            "task_id": task.id,
            "created_at": task.created_at,
            "status": status,
            "query_index": task.query_index,
            "total_queries": task.total_queries,
            "results_count": len(task.results),
            "paused": task.paused,
            "queries": list(task.queries),
            "log": list(task.log),
            "desired_results": task.desired_results,
            "stop_reason": task.stop_reason,
        }


def list_all_tasks() -> List[TaskState]:
    with _tasks_lock:
        return list(_tasks.values())


def control_task(task: TaskState, action: str):
    if action == "pause":
        if task.running and not task.paused:
            task.paused = True
            task.pause_event.set()
    elif action == "resume":
        if task.paused:
            task.paused = False
            task.pause_event.clear()
    elif action == "stop":
        task.stop_event.set()
        task.pause_event.clear()
    else:
        raise ValueError("Unknown action")


def get_results(task: TaskState) -> List[dict]:
    with task.lock:
        return list(task.results)


def get_results_slice(task: TaskState, offset: int, limit: int) -> Dict[str, List[dict] | int]:
    with task.lock:
        total = len(task.results)
        items = task.results[offset : offset + limit]
    return {"total": total, "items": list(items)}

