from __future__ import annotations

from typing import Any, Dict

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


class GoogleAuthError(Exception):
    """Raised when Google token verification fails."""


_GOOGLE_REQUEST = google_requests.Request()


def verify_id_token(token: str, audience: str) -> Dict[str, Any]:
    """
    Validate Google ID token and return its payload.

    Raises GoogleAuthError when the token is missing or invalid.
    """

    if not token:
        raise GoogleAuthError("Missing ID token.")
    if not audience:
        raise GoogleAuthError("Missing Google client ID configuration.")
    try:
        payload = id_token.verify_oauth2_token(token, _GOOGLE_REQUEST, audience)
    except ValueError as exc:  # pragma: no cover - google-auth handles errors
        raise GoogleAuthError(str(exc)) from exc
    return payload
