import json
from pathlib import Path
from typing import List, Dict, Optional

# _ROOT to backend/lib/, więc parent to backend/
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_CANDIDATES = [
    _BACKEND_ROOT / "kpo_maps_config.json",  # W kontenerze: /app/backend/kpo_maps_config.json
    _BACKEND_ROOT / "app" / "data" / "kpo_maps_config.json",  # Alternatywna lokalizacja
    Path("/app/backend/kpo_maps_config.json"),  # Absolutna ścieżka w kontenerze
    Path("/app/backend/app/data/kpo_maps_config.json"),  # Alternatywna absolutna ścieżka
]
_CONFIG_CACHE: Optional[List[Dict[str, str]]] = None


def _resolve_config_path() -> Path:
    for candidate in _CONFIG_CANDIDATES:
        if candidate.exists():
            return candidate
    return _CONFIG_CANDIDATES[0]


def load_kpo_config() -> List[Dict[str, str]]:
    """Return cached configuration describing available KPO maps."""
    global _CONFIG_CACHE
    if _CONFIG_CACHE is not None:
        return list(_CONFIG_CACHE)
    path = _resolve_config_path()
    if not path.exists():
        _CONFIG_CACHE = []
        return []
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            if isinstance(data, list):
                _CONFIG_CACHE = data
            else:
                _CONFIG_CACHE = []
    except Exception:
        _CONFIG_CACHE = []
    return list(_CONFIG_CACHE)


def build_kpo_config(force: bool = False) -> List[Dict[str, str]]:
    """
    Rebuild configuration of available KPO maps.

    For now we rely on the local JSON snapshot. When ``force`` is True
    the file is re-read so that any manual edits are picked up.
    """
    global _CONFIG_CACHE
    if not force and _CONFIG_CACHE is not None:
        return list(_CONFIG_CACHE)
    path = _resolve_config_path()
    if not path.exists():
        _CONFIG_CACHE = []
        return []
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            _CONFIG_CACHE = data if isinstance(data, list) else []
    except Exception:
        _CONFIG_CACHE = []
    return list(_CONFIG_CACHE)
