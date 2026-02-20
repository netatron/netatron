from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence

import pandas as pd
import json

import sys

ROOT_DIR = Path(__file__).resolve().parents[2]
LIB_DIR = ROOT_DIR / "lib"
DATA_DIR = ROOT_DIR / "app" / "data"
DATA_DIR.mkdir(exist_ok=True)
if str(LIB_DIR) not in sys.path:
    sys.path.append(str(LIB_DIR))

from kpo_config import load_kpo_config, build_kpo_config
from kpo_scraper import scrape_my_map, VOIVODESHIPS
from utils import save_to_csv

from .enrichment import enrich_company_profile

StatusCallback = Optional[Callable[[str], None]]


def _strip_accents(val: str) -> str:
    if not val:
        return ""
    norm = unicodedata.normalize("NFKD", str(val))
    return "".join(ch for ch in norm if not unicodedata.combining(ch)).lower()


def list_categories(refresh: bool = False) -> List[Dict[str, str]]:
    config = load_kpo_config()
    if refresh or not config:
        config = build_kpo_config(force=True)
    entries = [c for c in (config or []) if c.get("mid")]
    entries.sort(key=lambda item: (item.get("category") or "").lower())
    return entries


def _normalize_voivodeships(records: List[Dict], use_inference: bool = True) -> None:
    voivodeships = [v.title() for v in VOIVODESHIPS]
    canon = {_strip_accents(v): v for v in voivodeships}
    for rec in records:
        raw = _strip_accents(rec.get("voivodeship") or rec.get("voivodeship_canonical"))
        if raw in canon:
            rec["voivodeship_canonical"] = canon[raw]

    if not use_inference:
        return

    postal_re = re.compile(r"(\d{2})-?\d{3}")
    grouped = defaultdict(list)
    for rec in records:
        vc = rec.get("voivodeship_canonical")
        if not vc:
            continue
        text_blob = " ".join(
            [
                str(rec.get("description_raw", "")),
                str(rec.get("beneficiary_name", "")),
                str(rec.get("name", "")),
            ]
        )
        match = postal_re.search(text_blob) or postal_re.search(str(rec.get("postal_code", "")))
        if match:
            grouped[match.group(1)].append(vc)

    prefix_map = {k: Counter(v).most_common(1)[0][0] for k, v in grouped.items() if v}
    for rec in records:
        if rec.get("voivodeship_canonical"):
            continue
        text_blob = " ".join(
            [
                str(rec.get("description_raw", "")),
                str(rec.get("beneficiary_name", "")),
                str(rec.get("name", "")),
            ]
        )
        match = postal_re.search(text_blob) or postal_re.search(str(rec.get("postal_code", "")))
        if match and match.group(1) in prefix_map:
            rec["voivodeship_canonical"] = prefix_map[match.group(1)]
        else:
            stripped = _strip_accents(text_blob)
            for key, label in canon.items():
                if key and key in stripped:
                    rec["voivodeship_canonical"] = label
                    break


def _filter_by_voivodeships(records: List[Dict], voivodeships: List[str]) -> List[Dict]:
    if not voivodeships:
        return list(records)
    wanted = {_strip_accents(v) for v in voivodeships if v}
    filtered = []
    for rec in records:
        vc = rec.get("voivodeship_canonical") or rec.get("voivodeship")
        if _strip_accents(vc) in wanted:
            filtered.append(rec)
    return filtered


def enrich_kpo_records(
    records: List[Dict],
    status_callback: StatusCallback = None,
    checkpoint: Optional[Callable[[], None]] = None,
) -> List[Dict]:
    enriched_records: List[Dict] = []
    total = len(records)
    def _checkpoint():
        if checkpoint:
            checkpoint()

    for idx, rec in enumerate(records, start=1):
        _checkpoint()
        base = dict(rec)
        base_name = (
            base.get("name")
            or base.get("beneficiary_name")
            or base.get("title")
            or base.get("kpo_category")
            or ""
        )
        base["name"] = base_name
        base.setdefault("address", base.get("address") or base.get("location") or base.get("description_raw", ""))
        base.setdefault("city", base.get("city") or base.get("voivodeship") or "")
        base.setdefault("context_summary", rec.get("context_summary") or base.get("context_summary") or base_name)
        base.setdefault("notes", rec.get("description_raw") or base.get("notes") or "")
        if status_callback:
            label = base.get("context_summary") or base_name
            status_callback(f"({idx}/{total}) Szukam danych kontaktowych: {label[:90]}")
        _checkpoint()
        profile = enrich_company_profile(
            base,
            {"enhance_with_rejestr": False},
            status_callback=status_callback,
        )
        for key, value in rec.items():
            if key not in profile or not profile[key]:
                profile[key] = value
        _checkpoint()
        enriched_records.append(profile)
        if status_callback:
            try:
                status_callback(f"__record__{json.dumps(profile, ensure_ascii=False)}")
            except Exception:
                pass
    return enriched_records


def scrape_kpo_categories(
    categories: List[str],
    *,
    select_all: bool = False,
    refresh_config: bool = False,
    voivodeships: Optional[List[str]] = None,
    use_inference: bool = True,
    limit: Optional[int] = None,
    status_callback: StatusCallback = None,
    checkpoint: Optional[Callable[[], None]] = None,
) -> Dict[str, object]:
    def _checkpoint():
        if checkpoint:
            checkpoint()

    entries = list_categories(refresh=refresh_config)
    if not entries:
        raise ValueError("Brak dostępnych map KPO.")

    if select_all or not categories:
        selected_entries = entries
    else:
        categories_set = set(categories)
        selected_entries = [entry for entry in entries if entry.get("category") in categories_set]

    if not selected_entries:
        raise ValueError("Żadna z podanych kategorii nie została odnaleziona.")

    scraped: List[Dict] = []
    total_categories = len(selected_entries)
    log_messages: List[str] = []

    def emit(message: str):
        log_messages.append(message)
        if status_callback:
            status_callback(message)

    for idx, entry in enumerate(selected_entries, start=1):
        _checkpoint()
        emit(f"[{idx}/{total_categories}] Scrapuję mapę {entry.get('category')}")
        try:
            _checkpoint()
            records = scrape_my_map(entry["mid"], entry.get("category", ""), entry.get("url"))
        except Exception as exc:  # pragma: no cover - network errors
            emit(f"Błąd mapy {entry.get('category')}: {exc}")
            continue
        for rec in records:
            rec.setdefault("kpo_category", entry.get("category"))
        scraped.extend(records)
        _checkpoint()

    if not scraped:
        return {
            "results": [],
            "categories_used": [entry.get("category") for entry in selected_entries],
            "voivodeships_filter": voivodeships or [],
            "total_records": 0,
            "logs": log_messages,
        }

    _normalize_voivodeships(scraped, use_inference=use_inference)
    filtered = _filter_by_voivodeships(scraped, voivodeships or [])
    if voivodeships and not filtered:
        emit("Po zastosowaniu filtra województw brak wyników.")
        return {
            "results": [],
            "categories_used": [entry.get("category") for entry in selected_entries],
            "voivodeships_filter": voivodeships,
            "total_records": 0,
            "logs": log_messages,
        }

    records_to_enrich = filtered if filtered else scraped
    if limit and limit > 0:
        records_to_enrich = records_to_enrich[:limit]

    enriched = enrich_kpo_records(
        records_to_enrich,
        status_callback=emit,
        checkpoint=checkpoint,
    )
    emit(f"✅ Zebrano {len(enriched)} rekordów.")
    return {
        "results": enriched,
        "categories_used": [entry.get("category") for entry in selected_entries],
        "voivodeships_filter": voivodeships or [],
        "total_records": len(enriched),
        "logs": log_messages,
    }


def list_local_kpo_files(patterns: Optional[Sequence[str]] = None) -> List[Dict[str, object]]:
    patterns = patterns or ["kpo_beneficiaries*.csv", "kpo_filtered*.csv"]
    files: List[Dict[str, object]] = []
    seen = set()
    for pattern in patterns:
        for path in sorted(ROOT_DIR.glob(pattern)):
            if not path.is_file() or path.name in seen:
                continue
            seen.add(path.name)
            try:
                df = pd.read_csv(path, dtype=str)
                records = len(df)
            except Exception:
                records = 0
            files.append(
                {
                    "name": path.name,
                    "path": str(path),
                    "records": records,
                    "size": path.stat().st_size,
                    "modified": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
                }
            )
    return files


def _resolve_local_file(filename: str) -> Path:
    candidate = (ROOT_DIR / filename).resolve()
    if not candidate.exists() or candidate.is_dir():
        raise ValueError(f"Plik {filename} nie istnieje.")
    if ROOT_DIR not in candidate.parents and candidate != ROOT_DIR:
        raise ValueError("Niepoprawna ścieżka pliku.")
    return candidate


def load_local_kpo_records(filenames: List[str]) -> List[Dict]:
    frames = []
    for name in filenames:
        path = _resolve_local_file(name)
        df = pd.read_csv(path, dtype=str).fillna("")
        frames.append(df)
    if not frames:
        return []
    df_all = pd.concat(frames, ignore_index=True)
    return df_all.fillna("").to_dict(orient="records")


def export_kpo_records(records: List[Dict], prefix: str = "kpo_beneficiaries") -> str:
    if not records:
        raise ValueError("Brak danych do zapisania.")
    filename = f"{prefix}_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}.csv"
    saved = save_to_csv(records, filename)
    return saved or filename


