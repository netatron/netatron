import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Google API Keys
# NOTE: Google API keys can be shared across services if the same key has multiple APIs enabled
# You can use GOOGLE_MAPS_API_KEY for Gemini if it has Gemini API enabled in Google Cloud Console
# Or use separate keys for better security and monitoring

# Gemini AI API Key - falls back to GOOGLE_MAPS_API_KEY if not set
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_MAPS_API_KEY")

# Google Maps API Key
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# Google Custom Search API Key
GOOGLE_CSE_API_KEY = os.getenv("GOOGLE_CSE_API_KEY")
GOOGLE_CSE_CX = os.getenv("GOOGLE_CSE_CX")
GOOGLE_CSE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_CSE_SERVICE_ACCOUNT_FILE")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
ALLOWED_EMAILS: List[str] = [
    email.strip()
    for email in (os.getenv("ALLOWED_EMAILS") or "").split(",")
    if email.strip()
]

# Load ALLOWED_ORIGINS from environment (can come from secret in Cloud Run)
_allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS: List[str] = [
    origin.strip()
    for origin in _allowed_origins_raw.split(",")
    if origin.strip()
]
# Log for debugging
if not ALLOWED_ORIGINS and _allowed_origins_raw:
    import logging
    logging.getLogger(__name__).warning(f"[CORS] ALLOWED_ORIGINS env var exists but is empty or invalid: '{_allowed_origins_raw}'")

ALLOWED_ORIGIN_REGEX = os.getenv("ALLOWED_ORIGIN_REGEX")


RESULTS_STORAGE_DIR = Path(os.getenv("RESULTS_STORAGE_DIR", ROOT_DIR / "storage"))
RESULTS_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
GCS_RESULTS_BUCKET = os.getenv("GCS_RESULTS_BUCKET")

ENABLE_ROW_RESULTS = (os.getenv("ENABLE_ROW_RESULTS") or "false").lower() in {"1", "true", "yes"}

# Email invoices storage (local path)
EMAIL_INVOICES_STORAGE_DIR = Path(os.getenv("EMAIL_INVOICES_STORAGE_DIR", ROOT_DIR / "data" / "email_invoices"))
EMAIL_INVOICES_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Admin emails (comma-separated list of emails with admin access)
ADMIN_EMAILS: List[str] = [
    email.strip()
    for email in (os.getenv("ADMIN_EMAILS") or "").split(",")
    if email.strip()
]

# Desktop Automation - Optional feature for Windows desktop control
# WARNING: Requires user consent and may trigger Windows UAC for some operations
ENABLE_DESKTOP_AUTOMATION = (os.getenv("ENABLE_DESKTOP_AUTOMATION") or "false").lower() in {"1", "true", "yes"}
DESKTOP_AUTOMATION_PLATFORM = os.getenv("DESKTOP_AUTOMATION_PLATFORM", "windows").lower()  # windows, linux, mac, all