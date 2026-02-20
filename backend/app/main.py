import io
import shutil
import zipfile
import threading
from pathlib import Path
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse, unquote

import sys

sys.path.append(str(Path(__file__).resolve().parents[2]))

import pandas as pd
import io
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException, Request, Query, status
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import asyncio
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.orm import Session

from .schemas import (
    AuthUserProfile,
    AuthVerifyRequest,
    ScrapeConfig,
    TaskResponse,
    TaskStatus,
    TaskControlRequest,
    EnrichRequest,
    EnrichResponse,
    KpoConfigResponse,
    KpoScrapeRequest,
    KpoScrapeResponse,
    KpoLocalFilesResponse,
    KpoLoadRequest,
    KpoLoadResponse,
    KpoEnrichRequest,
    KpoExportRequest,
    KpoExportResponse,
    ChatStartResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatSessionInfo,
    ChatSessionDetail,
    ChatRenameRequest,
    UICommandRequest,
    UICommandResponse,
    DesktopCommandRequest,
    DesktopContextResponse,
    MemoryStatisticsResponse,
    ExportRecordsRequest,
    ExportRecordsResponse,
    KpoJobStartResponse,
    KpoJobStatus,
    KpoJobResultsResponse,
    SaveDatasetRequest,
    SavedDatasetSummary,
    SavedDatasetDetail,
    KpoJobControlRequest,
    MapsTaskResultsResponse,
    JobResponse,
    JobStartRequest,
    JobLogEntry,
    JobResultEntry,
    JobResultRowEntry,
    JobResultDeleteRequest,
    JobResultDeleteResponse,
    DeepSearchJobRequest,
    EmailInvoiceLog,
    EmailInvoiceConfigCreate,
    EmailInvoiceConfigUpdate,
    EmailInvoiceConfigDetail,
    EmailInvoiceRun,
    EmailInvoiceRunsResponse,
    EmailInvoiceRunStartRequest,
    EmailInvoiceRunStartResponse,
    EmailInvoiceRunDetail,
    EmailInvoiceStatisticsResponse,
    EmailInvoiceStatistics,
    TenantResponse,
    CreateTenantRequest,
    UpdateTenantRequest,
    DeployTenantResponse,
    TenantBillingReport,
    GCPCostReport,
    OpenAIUsageReport,
    LogEntry,
    CloudRunService,
    CloudSQLInstance,
    Migration,
    CloudRunJob,
    InfrastructureStatus,
    ChangePasswordRequest,
    ChangePasswordResponse,
    CreateClientRequest,
    ClientResponse,
    ClientComponent,
    DashboardStats,
    TenantComponentsResponse,
)
from .config import (
    ALLOWED_EMAILS,
    ALLOWED_ORIGINS,
    ALLOWED_ORIGIN_REGEX,
    GOOGLE_CLIENT_ID,
    RESULTS_STORAGE_DIR,
    GCS_RESULTS_BUCKET,
    ENABLE_ROW_RESULTS,
    EMAIL_INVOICES_STORAGE_DIR,
    ADMIN_EMAILS,
    ENABLE_DESKTOP_AUTOMATION,
    DESKTOP_AUTOMATION_PLATFORM,
)
from .auth.google import GoogleAuthError, verify_id_token
try:
    from .auth.simple import verify_simple_auth, DISABLE_GOOGLE_AUTH
except ImportError:
    DISABLE_GOOGLE_AUTH = False
    def verify_simple_auth(username: str = None, password: str = None, token: str = None):
        raise ValueError("Simple auth not available")
from .db.session import get_db, SessionLocal
from .db import models
from .repos.job_repository import JobRepository
from .repos.email_invoice_repository import EmailInvoiceRepository
from .services import agent
from .services import kpo as kpo_service
from .services import kpo_jobs
from .services import tasks
from .services import saved_results
from .services import usage_tracking
from .services import gcp_monitoring
from .services.enrichment import enrich_company_profile
from .services.tenancy import TenancyService
from .services.job_runtime import runtime_manager
from .services.event_stream import event_stream_manager
from .services.storage import StorageClient
from .services.email_invoices.storage import EmailInvoiceStorage
from .services.email_invoices.orchestrator import EmailInvoiceOrchestrator
from .services import usage_tracking
from google.cloud import storage
from google.cloud import exceptions as gcs_exceptions
from datetime import datetime, timedelta

# Rate limiting
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    
    limiter = Limiter(key_func=get_remote_address)
    RATE_LIMITING_AVAILABLE = True
except ImportError:
    limiter = None
    RATE_LIMITING_AVAILABLE = False
    logger.warning("slowapi not available - rate limiting disabled")

app = FastAPI(title="Maps & KPO Scraper API", version="1.0.0")

# Check if frontend dist exists (will be mounted at the end of file)
frontend_dist_path = Path(__file__).resolve().parents[2] / "frontend" / "dist"

# Setup rate limiting if available
if RATE_LIMITING_AVAILABLE:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Helper function for rate limiting decorator
def rate_limit_if_available(limit: str):
    """Apply rate limit if slowapi is available, otherwise no-op"""
    if RATE_LIMITING_AVAILABLE:
        return limiter.limit(limit)
    return lambda f: f  # No-op decorator

# CORS configuration - use explicit origins if available, otherwise use regex
import logging
logger = logging.getLogger(__name__)

cors_origins = ALLOWED_ORIGINS if ALLOWED_ORIGINS else []
cors_regex = ALLOWED_ORIGIN_REGEX

# Log CORS configuration for debugging - check raw env value too
import os
_allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "")
logger.info(f"[CORS] ALLOWED_ORIGINS raw env: '{_allowed_origins_raw}'")
logger.info(f"[CORS] ALLOWED_ORIGINS parsed: {ALLOWED_ORIGINS}")
logger.info(f"[CORS] ALLOWED_ORIGIN_REGEX from env: '{ALLOWED_ORIGIN_REGEX}'")
logger.info(f"[CORS] Parsed cors_origins: {cors_origins}")
logger.info(f"[CORS] Parsed cors_regex: {cors_regex}")

# CORS configuration - use FastAPI CORSMiddleware for better compatibility
from fastapi.middleware.cors import CORSMiddleware

# Prepare allowed origins list
allowed_origins_list = []
if cors_origins and cors_origins != ["*"]:
    allowed_origins_list = cors_origins
elif cors_origins == ["*"]:
    allowed_origins_list = ["*"]
else:
    # If no explicit origins, allow all (will be restricted by regex in custom middleware)
    allowed_origins_list = ["*"]
    logger.warning("[CORS] No explicit origins found, allowing all origins (*)")

logger.info(f"[CORS] Setting up FastAPI CORSMiddleware")
logger.info(f"[CORS] Allowed origins: {allowed_origins_list}")
logger.info(f"[CORS] Regex pattern (for custom check): {cors_regex}")

# Allow both Google auth and simple auth - users can choose
DISABLE_GOOGLE_AUTH_ENV = os.getenv("DISABLE_GOOGLE_AUTH", "false").lower() == "true"  # Default to false - enable Google auth
# Google auth is optional - if GOOGLE_CLIENT_ID is not set, only simple auth will be available
if not DISABLE_GOOGLE_AUTH_ENV and not GOOGLE_CLIENT_ID:
    logger.warning("[AUTH] GOOGLE_CLIENT_ID not configured - Google OAuth will be disabled. Only simple auth available.")
    DISABLE_GOOGLE_AUTH_ENV = True  # Fallback to simple auth only
if not ALLOWED_EMAILS and not DISABLE_GOOGLE_AUTH_ENV:
    logger.warning("[AUTH] ALLOWED_EMAILS not configured - using simple auth only.")
    DISABLE_GOOGLE_AUTH_ENV = True

tenancy_service = TenancyService(ALLOWED_EMAILS)
# Use GCS bucket for email invoices if available (production), otherwise use local storage
email_invoice_storage = EmailInvoiceStorage(EMAIL_INVOICES_STORAGE_DIR, bucket_name=GCS_RESULTS_BUCKET)


def seed_allowed_tenants() -> None:
    if not ALLOWED_EMAILS:
        return
    try:
        db = SessionLocal()
        try:
            changed = False
            for email in ALLOWED_EMAILS:
                tenant_id = tenancy_service.tenant_id_for_email(email)
                tenant = db.get(models.Tenant, tenant_id)
                if tenant:
                    continue
                db.add(models.Tenant(id=tenant_id, name=email.split("@", 1)[-1]))
                changed = True
            if changed:
                db.commit()
        finally:
            db.close()
    except Exception as e:
        # Log but don't fail startup if DB is not ready yet
        logger.warning(f"[STARTUP] Failed to seed allowed tenants (DB may not be ready): {e}")


@app.on_event("startup")
def startup_event():
    # Run database migrations using Alembic API
    # Alembic's env.py already handles database URL from environment variables
    try:
        import os
        from alembic import command
        from alembic.config import Config
        from pathlib import Path
        from app.db.session import _build_database_url
        
        backend_dir = Path(__file__).resolve().parents[1]
        migrations_dir = backend_dir / "migrations"
        
        # Check if DATABASE_URL or DB_* vars are set (skip for SQLite)
        database_url = _build_database_url()
        
        if database_url and "sqlite" not in database_url.lower():
            logger.info("[STARTUP] Running database migrations...")
            try:
                alembic_cfg = Config(str(backend_dir / "alembic.ini"))
                alembic_cfg.set_main_option("script_location", str(migrations_dir))
                alembic_cfg.set_main_option("sqlalchemy.url", database_url)
                
                # Run migrations
                command.upgrade(alembic_cfg, "head")
                logger.info("[STARTUP] Database migrations completed successfully")
            except Exception as e:
                logger.error(f"[STARTUP] Failed to run migrations: {e}", exc_info=True)
                # Don't fail startup if migrations fail - log the error
        else:
            logger.info(f"[STARTUP] Skipping migrations (database_url: {database_url[:50] if database_url else 'None'}...)")
    except Exception as e:
        logger.error(f"[STARTUP] Error setting up migrations: {e}", exc_info=True)
        # Don't fail startup if migration setup fails
    
    seed_allowed_tenants()


def _add_cors_headers(response: JSONResponse, request: Request) -> JSONResponse:
    """Helper function to add CORS headers to a response"""
    origin = request.headers.get("Origin")
    if origin:
        # Check if origin is allowed
        if cors_origins and cors_origins != ["*"]:
            if origin in cors_origins:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
        elif cors_regex:
            import re
            if re.match(cors_regex, origin):
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
        else:
            # Wildcard
            response.headers["Access-Control-Allow-Origin"] = "*"
        
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Max-Age"] = "3600"
        response.headers["Access-Control-Expose-Headers"] = "*"
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Global exception handler for HTTP exceptions - ensures CORS headers are added"""
    response = JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )
    return _add_cors_headers(response, request)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Global exception handler for validation errors - ensures CORS headers are added"""
    response = JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors(), "body": exc.body},
    )
    return _add_cors_headers(response, request)


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Global exception handler for all unhandled exceptions - ensures CORS headers are added"""
    import traceback
    logger.error(f"[ERROR] Unhandled exception: {exc}", exc_info=True)
    response = JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )
    return _add_cors_headers(response, request)

PUBLIC_PATHS = {
    "/api/health",
    "/api/auth/verify",
    "/api/kpo/config",  # konfiguracja może być publiczna, UI potrzebuje listy kategorii przed logowaniem
}
PUBLIC_PREFIXES = ("/docs", "/openapi", "/redoc", "/assets")  # Assets and frontend routes are public


def authenticate_id_token(id_token_value: str, username: str = None, password: str = None) -> AuthUserProfile:
    """
    Authenticate user - supports both Google OAuth and simple auth.
    Priority:
    1. If username+password provided -> simple auth
    2. If id_token looks like Google token (long JWT) -> Google OAuth
    3. If id_token contains ":" -> simple auth (username:password format)
    4. Otherwise -> try Google OAuth first, fallback to simple auth
    """
    payload = None
    
    # Priority 1: Username + password -> simple auth
    if username and password:
        try:
            payload = verify_simple_auth(username=username, password=password)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    
    # Priority 2: Check if id_token is in "username:password" format -> simple auth
    elif id_token_value and ":" in id_token_value and not id_token_value.startswith("eyJ"):  # Not a JWT
        try:
            token_username, token_password = id_token_value.split(":", 1)
            payload = verify_simple_auth(username=token_username, password=token_password)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    
    # Priority 3: Try Google OAuth if enabled and GOOGLE_CLIENT_ID is available
    elif not DISABLE_GOOGLE_AUTH and GOOGLE_CLIENT_ID and id_token_value and len(id_token_value) > 100:
        # Looks like a Google JWT token (long string starting with eyJ)
        try:
            payload = verify_id_token(id_token_value, GOOGLE_CLIENT_ID)
        except GoogleAuthError as exc:
            # If Google auth fails and we have simple auth enabled, try simple auth as fallback
            if not DISABLE_GOOGLE_AUTH_ENV:
                try:
                    payload = verify_simple_auth(token=id_token_value)
                except ValueError:
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
            else:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    
    # Priority 4: Fallback to simple auth
    else:
        try:
            payload = verify_simple_auth(token=id_token_value)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    
    email = payload.get("email")
    sub = payload.get("sub")
    tenant_id_from_payload = payload.get("tenant_id")  # For tenant-specific simple auth
    
    if not email or not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing email or subject.")
    name = payload.get("name")
    picture = payload.get("picture")
    
    # If tenant_id is in payload (from tenant-specific simple auth), use it directly
    if tenant_id_from_payload:
        # Use tenant_id directly, skip tenancy_service
        db = SessionLocal()
        try:
            # Get or create tenant
            tenant = db.get(models.Tenant, tenant_id_from_payload)
            if not tenant:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
            
            # Get or create user with this email and tenant_id
            db_user = db.query(models.User).filter(models.User.email == email).first()
            if not db_user:
                # Create new user for this tenant
                db_user = models.User(
                    tenant_id=tenant_id_from_payload,
                    google_sub=sub,
                    email=email,
                    name=name,
                    avatar_url=picture,
                )
                db.add(db_user)
                db.commit()
                db.refresh(db_user)
            else:
                # Update user if needed
                if db_user.tenant_id != tenant_id_from_payload:
                    db_user.tenant_id = tenant_id_from_payload
                if db_user.name != name:
                    db_user.name = name
                if db_user.avatar_url != picture:
                    db_user.avatar_url = picture
                db.commit()
            
            # Create user profile for response
            from .services.tenancy import UserProfile
            user = UserProfile(
                id=db_user.id,
                tenant_id=db_user.tenant_id,
                google_sub=db_user.google_sub,
                email=db_user.email,
                name=db_user.name,
                avatar_url=db_user.avatar_url,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"[AUTH] Failed to sync tenant user to database: {e}")
            db.rollback()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create user.")
        finally:
            db.close()
    else:
        # Standard flow: use tenancy_service
        try:
            user = tenancy_service.ensure_user(google_sub=sub, email=email, name=name, picture=picture)
        except PermissionError:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this email.")
        
        # Ensure tenant and user exist in database
        db = SessionLocal()
        try:
            # Get or create tenant
            tenant = db.get(models.Tenant, user.tenant_id)
            if not tenant:
                tenant = models.Tenant(id=user.tenant_id, name=email.split("@", 1)[-1])
                db.add(tenant)
                db.commit()
                db.refresh(tenant)
            
            # Get or create user
            db_user = db.query(models.User).filter(models.User.google_sub == sub).first()
            if not db_user:
                db_user = models.User(
                    id=user.id,
                    tenant_id=user.tenant_id,
                    google_sub=sub,
                    email=email,
                    name=name,
                    avatar_url=picture,
                )
                db.add(db_user)
                db.commit()
                db.refresh(db_user)
            else:
                # Update user info if changed
                if db_user.name != name:
                    db_user.name = name
                if db_user.avatar_url != picture:
                    db_user.avatar_url = picture
                if db_user.tenant_id != user.tenant_id:
                    db_user.tenant_id = user.tenant_id
                db.commit()
        except Exception as e:
            logger.warning(f"[AUTH] Failed to sync user/tenant to database: {e}")
            db.rollback()
        finally:
            db.close()
    
    # Check if user is admin
    is_admin = email.lower() in [email.lower() for email in ADMIN_EMAILS] if ADMIN_EMAILS else False
    
    return AuthUserProfile(
        user_id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        is_admin=is_admin,
    )


# Custom CORS middleware is DISABLED - using FastAPI CORSMiddleware instead
# Commented out to avoid conflicts
"""
@app.middleware("http")
async def cors_preflight_middleware_OLD(request: Request, call_next):
    # DISABLED - using FastAPI CORSMiddleware
    if request.method == "OPTIONS":
        origin = request.headers.get("origin")
        logger.info(f"[CORS] Preflight OPTIONS request from origin: {origin}")
        logger.info(f"[CORS] cors_origins: {cors_origins}")
        logger.info(f"[CORS] cors_regex: {cors_regex}")
        
        # Check if origin is allowed - check both explicit origins AND regex
        allowed = False
        if origin:
            # First check explicit origins if configured
            if cors_origins and cors_origins != ["*"]:
                allowed = origin in cors_origins
                logger.info(f"[CORS] Checking explicit origins: {origin} in {cors_origins} = {allowed}")
            
            # If not allowed by explicit origins, check regex (if configured)
            if not allowed and cors_regex:
                import re
                allowed = bool(re.match(cors_regex, origin))
                logger.info(f"[CORS] Checking regex: {cors_regex} matches {origin} = {allowed}")
            
            # If neither explicit nor regex, allow all (wildcard)
            if not cors_origins and not cors_regex:
                allowed = True
                logger.info(f"[CORS] No CORS config, allowing all origins")
        else:
            logger.warning("[CORS] OPTIONS request without origin header")
        
        if allowed:
            response = JSONResponse(content={}, status_code=200)
            if origin:
                response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Max-Age"] = "3600"
            logger.info(f"[CORS] Preflight response sent for origin: {origin}")
            return response
        else:
            logger.error(f"[CORS] Preflight request from disallowed origin: {origin}")
            logger.error(f"[CORS] Available origins: {cors_origins}")
            logger.error(f"[CORS] Regex pattern: {cors_regex}")
            # Still return 200 with CORS headers to avoid browser errors
            response = JSONResponse(content={"error": "Origin not allowed"}, status_code=200)
            if origin:
                response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"
            response.headers["Access-Control-Allow-Headers"] = "*"
            return response
    
    # For non-OPTIONS requests, continue normally
    response = await call_next(request)
    # Add CORS headers to all responses
    origin = request.headers.get("origin")
    if origin:
        # Check if origin is allowed
        allowed = False
        if cors_origins and cors_origins != ["*"]:
            allowed = origin in cors_origins
        if not allowed and cors_regex:
            import re
            allowed = bool(re.match(cors_regex, origin))
        if not cors_origins and not cors_regex:
            allowed = True
        
        if allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
    # Add security headers
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response
"""


@app.middleware("http")
async def authentication_middleware(request: Request, call_next):
    path = request.url.path
    # OPTIONS requests must pass through immediately for CORS preflight
    # FastAPI CORSMiddleware will handle OPTIONS requests
    # IMPORTANT: OPTIONS must be handled BEFORE authentication check
    if request.method == "OPTIONS":
        logger.info(f"[AUTH] OPTIONS request for path: {path}, passing through to CORS middleware")
        try:
            response = await call_next(request)
            # Add CORS headers manually if middleware didn't add them
            origin = request.headers.get("origin")
            if origin:
                # Check if origin is allowed
                allowed = False
                if origin in allowed_origins_list:
                    allowed = True
                elif "*" in allowed_origins_list:
                    allowed = True
                elif cors_regex:
                    import re
                    allowed = bool(re.match(cors_regex, origin))
                
                if allowed:
                    response.headers["Access-Control-Allow-Origin"] = origin
                    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"
                    response.headers["Access-Control-Allow-Headers"] = "*"
                    response.headers["Access-Control-Allow-Credentials"] = "true"
                    response.headers["Access-Control-Max-Age"] = "3600"
                    logger.info(f"[AUTH] OPTIONS response with CORS headers for origin: {origin}")
            return response
        except Exception as e:
            logger.error(f"[AUTH] Error handling OPTIONS request: {e}", exc_info=True)
            # Always return 200 for OPTIONS even on error
            from fastapi.responses import Response
            response = Response(status_code=200)
            origin = request.headers.get("origin")
            if origin:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"
                response.headers["Access-Control-Allow-Headers"] = "*"
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Access-Control-Max-Age"] = "3600"
            return response
    # Allow public paths, API docs, assets, and frontend routes (not starting with /api/)
    # Frontend routes are served by the catch-all handler at the end of main.py
    if path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES) or not path.startswith("/api/"):
        return await call_next(request)

    # For SSE endpoints, allow token in query parameter (EventSource doesn't support custom headers)
    token = None
    if path.endswith("/events/stream"):
        token = request.query_params.get("token")
    
    # If no token in query param, try Authorization header
    if not token:
        auth_header = request.headers.get("Authorization", "")
        scheme, _, token = auth_header.partition(" ")
        if scheme.lower() != "bearer":
            token = None
    
    if not token:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"[AUTH] Missing or invalid Authorization header/token for path: {path}")
        response = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Missing or invalid Authorization header or token."},
        )
        return _add_cors_headers(response, request)
    
    try:
        profile = authenticate_id_token(token)
    except HTTPException as exc:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"[AUTH] Authentication failed for path: {path}, error: {exc.detail}, token_length: {len(token)}")
        response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        return _add_cors_headers(response, request)

    request.state.user = profile
    request.state.tenant_id = profile.tenant_id
    response = await call_next(request)
    # Add CORS headers to all responses
    origin = request.headers.get("origin")
    if origin:
        # Check if origin is allowed
        allowed = False
        if origin in allowed_origins_list:
            allowed = True
        elif "*" in allowed_origins_list:
            allowed = True
        elif cors_regex:
            import re
            allowed = bool(re.match(cors_regex, origin))
        
        if allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


# Explicit OPTIONS handler for /api/auth/verify - MUST be defined BEFORE middleware
# This ensures it's called even if FastAPI CORSMiddleware doesn't work correctly
@app.options("/api/auth/verify")
async def verify_auth_options(request: Request):
    """Handle CORS preflight for /api/auth/verify - explicit handler"""
    try:
        origin = request.headers.get("origin")
        logger.info(f"[CORS-EXPLICIT] OPTIONS request from origin: {origin}")
        logger.info(f"[CORS-EXPLICIT] Allowed origins: {allowed_origins_list}")
        logger.info(f"[CORS-EXPLICIT] Regex pattern: {cors_regex}")
        
        # Always return 200 for preflight requests (browser requirement)
        from fastapi.responses import Response
        response = Response(status_code=200)
        
        # Check if origin is allowed and add CORS headers only if allowed
        allowed = False
        if origin:
            # First check explicit origins
            if origin in allowed_origins_list:
                allowed = True
                logger.info(f"[CORS-EXPLICIT] Origin matched in explicit list")
            elif "*" in allowed_origins_list:
                allowed = True
                logger.info(f"[CORS-EXPLICIT] Origin allowed by wildcard")
            # Then check regex if not already allowed
            if not allowed and cors_regex:
                import re
                if re.match(cors_regex, origin):
                    allowed = True
                    logger.info(f"[CORS-EXPLICIT] Origin matched regex pattern")
        
        if allowed and origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS, GET"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Max-Age"] = "3600"
            logger.info(f"[CORS-EXPLICIT] OPTIONS response sent (200) with CORS headers for origin: {origin}")
        else:
            logger.warning(f"[CORS-EXPLICIT] OPTIONS request from disallowed origin: {origin}")
            logger.warning(f"[CORS-EXPLICIT] Allowed origins: {allowed_origins_list}")
            logger.warning(f"[CORS-EXPLICIT] Regex: {cors_regex}")
            # Still return 200 but without CORS headers (browser will block the actual request)
        
        return response
    except Exception as e:
        logger.error(f"[CORS-EXPLICIT] Error handling OPTIONS request: {e}", exc_info=True)
        # Always return 200 even on error to avoid breaking browser CORS check
        from fastapi.responses import Response
        response = Response(status_code=200)
        if origin := request.headers.get("origin"):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS, GET"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

@app.post("/api/auth/verify", response_model=AuthUserProfile)
def verify_auth(payload: AuthVerifyRequest):
    return authenticate_id_token(
        id_token_value=payload.id_token,
        username=payload.username,
        password=payload.password
    )


def get_job_repo(db: Session) -> JobRepository:
    return JobRepository(db)


def get_email_invoice_repo(db: Session) -> EmailInvoiceRepository:
    return EmailInvoiceRepository(db)


def require_admin(request: Request) -> AuthUserProfile:
    """Require admin access - check if user email is in ADMIN_EMAILS"""
    if not hasattr(request.state, "user"):
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user = request.state.user
    if not ADMIN_EMAILS or user.email.lower() not in [email.lower() for email in ADMIN_EMAILS]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return user


def _get_job_or_404(repo: JobRepository, tenant_id: str, job_id: str):
    job = repo.get_job(tenant_id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


def _email_invoice_run_to_job_response(run: models.EmailInvoiceRun) -> JobResponse:
    """Convert EmailInvoiceRun to JobResponse format."""
    # Calculate progress
    progress = 0.0
    if run.total_count > 0:
        progress = (run.processed_count / run.total_count) * 100.0
    
    # Map status
    status_map = {
        "pending": "queued",
        "running": "running",
        "paused": "paused",
        "completed": "completed",
        "failed": "failed",
        "stopped": "failed",
    }
    job_status = status_map.get(run.status, "queued")
    
    # Build storage URI (pointing to run's file directory)
    storage_uri = f"email_invoices://runs/{run.id}"
    
    return JobResponse(
        id=run.id,
        source="email_invoices",
        status=job_status,
        progress=progress,
        desired_results=run.total_count,
        storage_uri=storage_uri,
        params={
            "config_id": run.config_id,
            "processed_count": run.processed_count,
            "total_count": run.total_count,
        },
        created_at=run.created_at,
        updated_at=run.updated_at,
        pause_requested=run.pause_requested,
        stop_requested=run.stop_requested,
        last_error=run.error,
    )


@app.get("/api/jobs", response_model=List[JobResponse])
def list_jobs(request: Request, db: Session = Depends(get_db)):
    repo = get_job_repo(db)
    jobs = repo.list_jobs(request.state.tenant_id)
    
    # Also include email invoice runs as jobs
    email_repo = get_email_invoice_repo(db)
    email_runs = email_repo.list_runs(request.state.tenant_id, limit=100)
    email_jobs = [_email_invoice_run_to_job_response(run) for run in email_runs]
    
    # Combine and sort by created_at descending
    all_jobs = jobs + email_jobs
    all_jobs.sort(key=lambda j: j.created_at, reverse=True)
    
    return all_jobs


@app.post("/api/jobs/start", response_model=JobResponse, status_code=201)
def start_job(payload: JobStartRequest, request: Request, db: Session = Depends(get_db)):
    repo = get_job_repo(db)
    job = repo.create_job(
        tenant_id=request.state.tenant_id,
        source=payload.source,
        params=payload.params,
        desired_results=payload.desired_results,
    )
    repo.add_log(job=job, tenant_id=request.state.tenant_id, message="Job created.")
    runtime_manager.submit(job.id)
    return job


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str, request: Request, db: Session = Depends(get_db)):
    # Try regular job first
    repo = get_job_repo(db)
    job = repo.get_job(request.state.tenant_id, job_id)
    if job:
        return job
    
    # Try email invoice run
    email_repo = get_email_invoice_repo(db)
    run = email_repo.get_run(job_id)
    if run and run.tenant_id == request.state.tenant_id:
        return _email_invoice_run_to_job_response(run)
    
    raise HTTPException(status_code=404, detail="Job not found.")


@app.post("/api/jobs/{job_id}/pause", response_model=JobResponse)
def pause_job(job_id: str, request: Request, db: Session = Depends(get_db)):
    # Try regular job first
    repo = get_job_repo(db)
    job = repo.get_job(request.state.tenant_id, job_id)
    if job:
        repo.add_log(job=job, tenant_id=request.state.tenant_id, message="Pause requested.")
        return repo.request_pause(job)
    
    # Try email invoice run
    email_repo = get_email_invoice_repo(db)
    run = email_repo.get_run(job_id)
    if run and run.tenant_id == request.state.tenant_id:
        email_repo.request_pause(run)
        return _email_invoice_run_to_job_response(run)
    
    raise HTTPException(status_code=404, detail="Job not found.")


@app.post("/api/jobs/{job_id}/resume", response_model=JobResponse)
def resume_job(job_id: str, request: Request, db: Session = Depends(get_db)):
    # Try regular job first
    repo = get_job_repo(db)
    job = repo.get_job(request.state.tenant_id, job_id)
    if job:
        repo.add_log(job=job, tenant_id=request.state.tenant_id, message="Resume requested.")
        return repo.request_resume(job)
    
    # Try email invoice run
    email_repo = get_email_invoice_repo(db)
    run = email_repo.get_run(job_id)
    if run and run.tenant_id == request.state.tenant_id:
        email_repo.request_resume(run)
        return _email_invoice_run_to_job_response(run)
    
    raise HTTPException(status_code=404, detail="Job not found.")


@app.post("/api/jobs/{job_id}/stop", response_model=JobResponse)
def stop_job(job_id: str, request: Request, db: Session = Depends(get_db)):
    # Try regular job first
    repo = get_job_repo(db)
    job = repo.get_job(request.state.tenant_id, job_id)
    if job:
        repo.add_log(job=job, tenant_id=request.state.tenant_id, message="Stop requested.")
        return repo.request_stop(job)
    
    # Try email invoice run
    email_repo = get_email_invoice_repo(db)
    run = email_repo.get_run(job_id)
    if run and run.tenant_id == request.state.tenant_id:
        email_repo.request_stop(run)
        return _email_invoice_run_to_job_response(run)
    
    raise HTTPException(status_code=404, detail="Job not found.")


@app.post("/api/deep-search/jobs", response_model=JobResponse, status_code=201)
def start_deep_search_job(payload: DeepSearchJobRequest, request: Request, db: Session = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    # Ensure tenant exists in database (fallback if seed failed)
    tenant = db.get(models.Tenant, tenant_id)
    if not tenant:
        # Try to get email from user profile
        user_profile = getattr(request.state, 'user', None)
        email = user_profile.email if user_profile else None
        if not email:
            # Fallback: try to get from ALLOWED_EMAILS
            email = ALLOWED_EMAILS[0] if ALLOWED_EMAILS else "unknown"
        tenant = models.Tenant(id=tenant_id, name=email.split("@", 1)[-1] if "@" in email else "unknown")
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        logger.info(f"[DeepSearch] Created missing tenant {tenant_id} in database")
    
    repo = get_job_repo(db)
    params = {"query": payload.query.strip(), "limit": payload.limit}
    job = repo.create_job(
        tenant_id=tenant_id,
        source="deep_search",
        params=params,
        desired_results=payload.limit,
    )
    repo.add_log(job=job, tenant_id=tenant_id, message="Deep Search job created.")
    runtime_manager.submit(job.id)
    
    # Emit initial event for SSE
    event_stream_manager.emit(job.id, "job_started", {
        "job_id": job.id,
        "query": payload.query,
        "limit": payload.limit,
        "status": "pending"
    })
    
    return job


@app.get("/api/deep-search/jobs/{job_id}", response_model=JobResponse)
def get_deep_search_job(job_id: str, request: Request, db: Session = Depends(get_db)):
    repo = get_job_repo(db)
    job = _get_job_or_404(repo, request.state.tenant_id, job_id)
    if job.source != "deep_search":
        raise HTTPException(status_code=404, detail="Deep Search job not found.")
    return job


@app.get("/api/jobs/{job_id}/events/stream")
async def job_events_stream(job_id: str, request: Request, db: Session = Depends(get_db), token: Optional[str] = Query(None)):
    """
    Server-Sent Events stream for job events.
    Emits real-time events for deep search jobs: search, navigate, fetch, parse, ai_call, result, completed.
    
    Note: EventSource doesn't support custom headers, so token can be passed as query parameter.
    """
    import json
    import queue
    import time
    
    # Handle authentication - support both Authorization header and token query param (for EventSource)
    tenant_id = None
    if hasattr(request.state, 'tenant_id'):
        tenant_id = request.state.tenant_id
    elif token:
        # Authenticate using token from query parameter (for EventSource compatibility)
        try:
            profile = authenticate_id_token(token)
            tenant_id = profile.tenant_id
        except HTTPException:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
    else:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Verify job exists and user has access
    repo = get_job_repo(db)
    job = repo.get_job(tenant_id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    
    async def event_generator():
        """Generator that yields SSE events."""
        event_queue: queue.Queue = queue.Queue()
        
        def event_callback(event: dict):
            """Callback to receive events from event stream manager."""
            try:
                event_queue.put(event)
            except Exception as e:
                logger.error(f"Error in event callback: {e}", exc_info=True)
        
        # Subscribe to events
        event_stream_manager.subscribe(job_id, event_callback)
        
        try:
            # Send initial connection event
            yield f"data: {json.dumps({'type': 'connected', 'timestamp': int(time.time() * 1000), 'data': {'job_id': job_id, 'status': 'connected'}})}\n\n"
            
            # Keep connection alive and stream events
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    logger.info(f"Client disconnected from SSE stream for job {job_id}")
                    break
                
                try:
                    # Get event from queue with timeout
                    event = event_queue.get(timeout=1.0)
                    yield f"data: {json.dumps(event)}\n\n"
                    
                    # If completed or error, close stream
                    if event.get("type") in ("completed", "error"):
                        yield f"data: {json.dumps({'type': 'stream_end', 'timestamp': int(time.time() * 1000), 'data': {'reason': event.get('type')}})}\n\n"
                        break
                except queue.Empty:
                    # Send keepalive
                    yield ": keepalive\n\n"
                    continue
                except Exception as e:
                    logger.error(f"Error in event stream for job {job_id}: {e}", exc_info=True)
                    yield f"data: {json.dumps({'type': 'error', 'timestamp': int(time.time() * 1000), 'data': {'error': str(e)}})}\n\n"
                    break
        finally:
            # Unsubscribe when done
            event_stream_manager.unsubscribe(job_id, event_callback)
            logger.info(f"Unsubscribed from events for job {job_id}")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@app.get("/api/jobs/{job_id}/logs", response_model=List[JobLogEntry])
def job_logs(job_id: str, request: Request, db: Session = Depends(get_db)):
    # Try regular job first
    repo = get_job_repo(db)
    job = repo.get_job(request.state.tenant_id, job_id)
    if job:
        logs = repo.list_logs(request.state.tenant_id, job_id)
        return logs
    
    # Try email invoice run
    email_repo = get_email_invoice_repo(db)
    run = email_repo.get_run(job_id)
    if run and run.tenant_id == request.state.tenant_id:
        # Convert email invoice logs to JobLogEntry format
        email_logs = email_repo.get_run_logs(run.id)
        job_logs = []
        for log in email_logs:
            # Include level in message prefix for consistency
            message = f"[{log.level.upper()}] {log.message}" if log.level != "info" else log.message
            job_logs.append(JobLogEntry(
                id=log.id,
                job_id=run.id,
                message=message,
                created_at=log.created_at,
            ))
        return job_logs
    
    raise HTTPException(status_code=404, detail="Job not found.")


@app.get("/api/jobs/{job_id}/results", response_model=List[JobResultEntry])
def job_results(job_id: str, request: Request, db: Session = Depends(get_db)):
    repo = get_job_repo(db)
    _get_job_or_404(repo, request.state.tenant_id, job_id)
    records = repo.list_results(request.state.tenant_id, job_id)
    return records


@app.get("/api/jobs/{job_id}/rows", response_model=List[JobResultRowEntry])
def job_result_rows(job_id: str, request: Request, db: Session = Depends(get_db)):
    if not ENABLE_ROW_RESULTS:
        # Return empty list instead of 404 to avoid frontend errors
        return []
    repo = get_job_repo(db)
    _get_job_or_404(repo, request.state.tenant_id, job_id)
    rows = repo.list_result_rows(request.state.tenant_id, job_id)
    return rows


@app.delete("/api/jobs/{job_id}/rows", response_model=JobResultDeleteResponse)
def delete_job_rows(
    job_id: str,
    payload: JobResultDeleteRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not ENABLE_ROW_RESULTS:
        # Return empty response instead of 400 to avoid frontend errors
        return JobResultDeleteResponse(deleted=0, remaining=0)
    repo = get_job_repo(db)
    job = _get_job_or_404(repo, request.state.tenant_id, job_id)
    existing_rows = repo.list_result_rows(request.state.tenant_id, job_id, include_deleted=False)
    target_ids: List[str] = []
    if payload.delete_all:
        target_ids = [row.id for row in existing_rows if row.id]
    else:
        target_ids = payload.ids or []

    deleted = repo.mark_rows_deleted(request.state.tenant_id, job_id, target_ids)
    remaining_rows = repo.list_result_rows(request.state.tenant_id, job_id)

    if deleted or (payload.delete_all and not remaining_rows):
        storage_writer = _get_storage_writer()
        if remaining_rows:
            new_uri = storage_writer.save_records(job.tenant_id, job.id, [row.payload for row in remaining_rows])
            repo.attach_storage(job, new_uri)
            repo.update_result_metadata_count(job, len(remaining_rows))
        else:
            # If all rows deleted, remove storage_uri and delete job if delete_all was requested
            repo.attach_storage(job, None)
            repo.update_result_metadata_count(job, 0)
            if payload.delete_all:
                # Delete the entire job when all results are deleted
                repo.delete_job(request.state.tenant_id, job_id)
                return JobResultDeleteResponse(deleted=deleted, remaining=0)
    return JobResultDeleteResponse(deleted=deleted, remaining=len(remaining_rows))


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: str, request: Request, db: Session = Depends(get_db)):
    """Delete a job and all its related data."""
    repo = get_job_repo(db)
    job = _get_job_or_404(repo, request.state.tenant_id, job_id)
    
    # Delete storage file if exists
    if job.storage_uri:
        try:
            parsed = urlparse(job.storage_uri)
            if parsed.scheme == "gs":
                bucket_name, blob_name = _extract_gcs_components(job.storage_uri)
                if bucket_name and blob_name:
                    client = _get_storage_client()
                    blob = client.bucket(bucket_name).blob(blob_name)
                    try:
                        blob.delete()
                    except Exception:
                        pass  # Ignore errors when deleting storage
        except Exception:
            pass  # Ignore errors when deleting storage
    
    deleted = repo.delete_job(request.state.tenant_id, job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Job not found.")


@lru_cache()
def _get_storage_client() -> storage.Client:
    return storage.Client()


@lru_cache()
def _get_storage_writer() -> StorageClient:
    return StorageClient(RESULTS_STORAGE_DIR, bucket_name=GCS_RESULTS_BUCKET)


def _extract_gcs_components(storage_uri: str) -> tuple[str | None, str | None]:
    uri = storage_uri.strip()
    lower = uri.lower()
    prefix_normalized = None

    if lower.startswith("gs://"):
        prefix_normalized = uri[5:]
    elif lower.startswith("gs:/"):
        prefix_normalized = uri[4:]
    elif lower.startswith("gs:"):
        prefix_normalized = uri[3:].lstrip("/")
    elif lower.startswith("https://storage.googleapis.com/"):
        prefix_normalized = uri.split("storage.googleapis.com/", 1)[1]
    elif lower.startswith("http://storage.googleapis.com/"):
        prefix_normalized = uri.split("storage.googleapis.com/", 1)[1]

    if not prefix_normalized:
        return None, None

    parts = prefix_normalized.split("/", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return None, None
    return parts[0], parts[1]


def _download_storage_bytes(storage_uri: str) -> bytes:
    parsed = urlparse(storage_uri)
    if parsed.scheme == "file":
        path = Path(unquote(parsed.path))
        if not path.exists():
            raise HTTPException(status_code=404, detail="Results file not found.")
        return path.read_bytes()

    bucket_name, blob_name = _extract_gcs_components(storage_uri)
    if bucket_name and blob_name:
        client = _get_storage_client()
        blob = client.bucket(bucket_name).blob(blob_name)
        try:
            return blob.download_as_bytes()
        except gcs_exceptions.NotFound:
            raise HTTPException(status_code=404, detail="Results file not found.")
        except gcs_exceptions.Forbidden:
            raise HTTPException(status_code=403, detail="Brak dostępu do pliku w GCS.")
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=500, detail=f"Nie udało się pobrać pliku: {exc}") from exc

    raise HTTPException(status_code=400, detail="Unsupported storage location.")


def _read_csv_preview(storage_uri: str, limit: int = 200):
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        raw_bytes = _download_storage_bytes(storage_uri)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to download results: {exc}") from exc
    
    if not raw_bytes:
        raise HTTPException(status_code=404, detail="Results file is empty.")
    
    try:
        # Try reading with UTF-8 first, fallback to latin-1 if needed
        try:
            frame = pd.read_csv(io.BytesIO(raw_bytes), nrows=limit, encoding='utf-8').fillna("")
        except UnicodeDecodeError:
            logger.warning(f"UTF-8 decode failed for {storage_uri}, trying latin-1")
            frame = pd.read_csv(io.BytesIO(raw_bytes), nrows=limit, encoding='latin-1').fillna("")
        
        if frame.empty:
            logger.warning(f"CSV file {storage_uri} is empty or has no data rows")
            return []
        
        records = frame.to_dict(orient="records")
        logger.info(f"Read {len(records)} records from {storage_uri}")
        return records
    except Exception as exc:  # pragma: no cover - pandas errors
        logger.error(f"Failed to read CSV from {storage_uri}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to read results CSV: {exc}") from exc


@app.get("/api/jobs/{job_id}/preview")
def job_preview(job_id: str, request: Request, db: Session = Depends(get_db)):
    try:
        tenant_id = getattr(request.state, 'tenant_id', None)
        if not tenant_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        
        # Try regular job first
        repo = get_job_repo(db)
        job = repo.get_job(tenant_id, job_id)
        if job:
            if not job.storage_uri:
                raise HTTPException(status_code=404, detail="Results not available.")
            data = _read_csv_preview(job.storage_uri)
            metadata = repo.list_results(tenant_id, job_id)
            total = metadata[0].row_count if metadata else len(data)
            return {"results": data, "total": total or len(data)}
        
        # Try email invoice run
        email_repo = get_email_invoice_repo(db)
        run = email_repo.get_run(job_id, tenant_id)
        if run:
            # Read records.csv from email invoice storage
            try:
                csv_path = email_invoice_storage.get_file_path(run.tenant_id, run.config_id, run.id, "records.csv")
                if email_invoice_storage.file_exists(csv_path):
                    raw_bytes = email_invoice_storage.read_file_bytes(csv_path)
                    frame = pd.read_csv(io.BytesIO(raw_bytes), nrows=200).fillna("")
                    data = frame.to_dict(orient="records")
                    total = run.processed_count
                    return {"results": data, "total": total}
                else:
                    return {"results": [], "total": 0}
            except Exception as exc:
                logger.error(f"[EmailInvoices] Failed to read email invoice CSV: {exc}", exc_info=True)
                return {"results": [], "total": 0}
        
        raise HTTPException(status_code=404, detail="Job not found.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EmailInvoices] Error in job_preview: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/api/jobs/{job_id}/results.csv")
def job_results_csv(job_id: str, request: Request, db: Session = Depends(get_db)):
    # Try regular job first
    repo = get_job_repo(db)
    job = repo.get_job(request.state.tenant_id, job_id)
    if job:
        if not job.storage_uri:
            raise HTTPException(status_code=404, detail="Results not available.")
        filename = f"{job.source}_{job.id}.csv"
        raw_bytes = _download_storage_bytes(job.storage_uri)
        return StreamingResponse(
            iter([raw_bytes]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    
    # Try email invoice run
    email_repo = get_email_invoice_repo(db)
    run = email_repo.get_run(job_id)
    if run and run.tenant_id == request.state.tenant_id:
        # Read records.csv from email invoice storage
        try:
            csv_path = email_invoice_storage.get_file_path(run.tenant_id, run.config_id, run.id, "records.csv")
            if email_invoice_storage.file_exists(csv_path):
                raw_bytes = email_invoice_storage.read_file_bytes(csv_path)
                filename = f"email_invoices_{run.id}.csv"
                return StreamingResponse(
                    iter([raw_bytes]),
                    media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={filename}"},
                )
            else:
                raise HTTPException(status_code=404, detail="Results not available.")
        except HTTPException:
            raise
        except Exception as exc:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to read email invoice CSV: {exc}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to download results.")
    
    raise HTTPException(status_code=404, detail="Job not found.")


@app.get("/api/scrape/google-maps", response_model=List[TaskStatus])
def list_scrape_tasks():
    return [TaskStatus(**tasks.get_status(task)) for task in tasks.list_all_tasks()]


@app.post("/api/scrape/google-maps/start", response_model=TaskResponse)
def start_scrape(config: ScrapeConfig):
    try:
        task = tasks.start_task(config.dict())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TaskResponse(task_id=task.id)


@app.get("/api/scrape/google-maps/{task_id}", response_model=TaskStatus)
def get_scrape_status(task_id: str):
    task = tasks.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskStatus(**tasks.get_status(task))


@app.post("/api/scrape/google-maps/{task_id}/control", response_model=TaskStatus)
def control_scrape(task_id: str, payload: TaskControlRequest):
    task = tasks.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    try:
        tasks.control_task(task, payload.action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return TaskStatus(**tasks.get_status(task))


@app.get("/api/scrape/google-maps/{task_id}/results", response_model=List[dict])
def get_scrape_results(task_id: str):
    task = tasks.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks.get_results(task)


@app.get("/api/scrape/google-maps/{task_id}/results-paged", response_model=MapsTaskResultsResponse)
def get_scrape_results_paged(task_id: str, page: int = 1, per_page: int = 100):
    task = tasks.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    per_page = max(1, min(1000, per_page))
    page = max(1, page)
    offset = (page - 1) * per_page
    data = tasks.get_results_slice(task, offset, per_page)
    return MapsTaskResultsResponse(
        task_id=task_id,
        page=page,
        per_page=per_page,
        total=data["total"],
        results=data["items"],
    )


@app.get("/api/scrape/google-maps/{task_id}/results.csv")
def download_results_csv(task_id: str):
    task = tasks.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    rows = tasks.get_results(task)
    if not rows:
        raise HTTPException(status_code=404, detail="No results yet")
    frame = pd.DataFrame(rows)
    buffer = io.StringIO()
    frame.to_csv(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue().encode("utf-8")]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={task_id}.csv"},
    )


@app.post("/api/enrich", response_model=EnrichResponse)
def enrich_company(payload: EnrichRequest):
    result = enrich_company_profile(payload.company, {"enhance_with_rejestr": False})
    return EnrichResponse(result=result)


@app.get("/api/kpo/config", response_model=KpoConfigResponse)
def get_kpo_categories(force_refresh: bool = False):
    entries = kpo_service.list_categories(refresh=force_refresh)
    return KpoConfigResponse(categories=entries)


@app.post("/api/kpo/scrape", response_model=KpoScrapeResponse)
def scrape_kpo(payload: KpoScrapeRequest):
    try:
        result = kpo_service.scrape_kpo_categories(
            payload.categories,
            select_all=payload.select_all,
            refresh_config=payload.refresh_config,
            voivodeships=payload.voivodeships,
            use_inference=payload.use_inference,
            limit=payload.limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return KpoScrapeResponse(**result)


@app.get("/api/kpo/files", response_model=KpoLocalFilesResponse)
def list_kpo_files():
    files = kpo_service.list_local_kpo_files()
    return KpoLocalFilesResponse(files=files)


@app.post("/api/kpo/files/load", response_model=KpoLoadResponse)
def load_kpo_files(payload: KpoLoadRequest):
    if not payload.files:
        raise HTTPException(status_code=400, detail="Brak plików do wczytania.")
    try:
        records = kpo_service.load_local_kpo_records(payload.files)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return KpoLoadResponse(records=records)


@app.post("/api/kpo/enrich-records", response_model=KpoLoadResponse)
def enrich_kpo_records(payload: KpoEnrichRequest):
    enriched = kpo_service.enrich_kpo_records(
        payload.records,
    )
    return KpoLoadResponse(records=enriched)


@app.post("/api/kpo/export", response_model=KpoExportResponse)
def export_kpo_records(payload: KpoExportRequest):
    if not payload.records:
        raise HTTPException(status_code=400, detail="Brak danych do zapisania.")
    try:
        filename = kpo_service.export_kpo_records(payload.records, prefix=payload.prefix or "kpo_beneficiaries")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return KpoExportResponse(filename=filename)


@app.post("/api/kpo/jobs", response_model=KpoJobStartResponse)
def start_kpo_job(payload: KpoScrapeRequest):
    job = kpo_jobs.start_job(payload.dict())
    return KpoJobStartResponse(job_id=job.id, created_at=job.created_at)


@app.get("/api/kpo/jobs/{job_id}", response_model=KpoJobStatus)
def get_kpo_job(job_id: str):
    job = kpo_jobs.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    snapshot = job.snapshot()
    return KpoJobStatus(**snapshot)


@app.post("/api/kpo/jobs/{job_id}/control", response_model=KpoJobStatus)
def control_kpo_job(job_id: str, payload: KpoJobControlRequest):
    job = kpo_jobs.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        snapshot = kpo_jobs.control_job(job_id, payload.action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return KpoJobStatus(**snapshot)


@app.get("/api/kpo/jobs/{job_id}/results", response_model=KpoJobResultsResponse)
def get_kpo_job_results(job_id: str, page: int = 1, per_page: int = 100):
    job = kpo_jobs.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    per_page = max(1, min(1000, per_page))
    page = max(1, page)
    offset = (page - 1) * per_page
    data = kpo_jobs.get_results_slice(job, offset, per_page)
    return KpoJobResultsResponse(
        job_id=job_id,
        page=page,
        per_page=per_page,
        total=data["total"],
        results=data["items"],
    )


@app.get("/api/kpo/jobs/{job_id}/results.csv")
def download_kpo_job_results(job_id: str):
    job = kpo_jobs.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    data = kpo_jobs.get_results_slice(job, 0, 10_000_000)  # all
    if not data["items"]:
        raise HTTPException(status_code=404, detail="No results yet")
    frame = pd.DataFrame(data["items"])
    buffer = io.StringIO()
    frame.to_csv(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue().encode("utf-8")]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=kpo_job_{job_id}.csv"},
    )


@app.post("/api/results/kpo", response_model=SavedDatasetSummary)
def save_kpo_dataset(payload: SaveDatasetRequest):
    job = kpo_jobs.get_job(payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    snapshot = job.snapshot()
    with job.lock:
        records = list(job.results)
    dataset = saved_results.save_dataset(
        payload.label or f"KPO {snapshot['created_at']}",
        source=payload.job_id,
        records=records,
        metadata={
            "categories": snapshot.get("categories_used", []),
            "voivodeships": snapshot.get("voivodeships_filter", []),
        },
    )
    return SavedDatasetSummary(**dataset.summary())


@app.get("/api/results/kpo", response_model=List[SavedDatasetSummary])
def list_saved_kpo_datasets():
    return [dataset.summary() for dataset in saved_results.list_datasets()]


@app.get("/api/results/kpo/{dataset_id}", response_model=SavedDatasetDetail)
def get_saved_kpo_dataset(dataset_id: str):
    dataset = saved_results.get_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return SavedDatasetDetail(**dataset.detail())


@app.get("/api/chat/sessions", response_model=List[ChatSessionInfo])
def list_chat_sessions(request: Request):
    sessions = agent.list_sessions(request.state.user.user_id)
    return [ChatSessionInfo(**session.meta()) for session in sessions]


@app.post("/api/chat/start", response_model=ChatStartResponse)
def chat_start(request: Request):
    # Include tenant_id in user dict for deep_search tool
    user_dict = request.state.user.dict()
    user_dict['tenant_id'] = request.state.tenant_id
    session = agent.start_session(user_dict)
    meta = session.meta()
    return ChatStartResponse(
        session_id=meta["session_id"],
        title=meta["title"],
        created_at=meta["created_at"],
        updated_at=meta["updated_at"],
    )


@app.get("/api/chat/{session_id}", response_model=ChatSessionDetail)
def chat_detail(session_id: str, request: Request):
    payload = agent.serialize_session(session_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Session not found")
    return ChatSessionDetail(**payload)


@app.post("/api/chat/{session_id}/message", response_model=ChatMessageResponse)
def chat_message(session_id: str, payload: ChatMessageRequest, request: Request):
    session = agent.get_session(session_id, request.state.user.user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    result = agent.process_message(session, payload.message)
    return ChatMessageResponse(**result)


@app.post("/api/chat/{session_id}/rename", response_model=ChatSessionInfo)
def rename_chat_session(session_id: str, payload: ChatRenameRequest, request: Request):
    session = agent.rename_session(session_id, payload.title, request.state.user.user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return ChatSessionInfo(**session.meta())


# ============================================================================
# UI Agent API - High-end agent with UI awareness
# ============================================================================

# Import UI Agent services
from .services.ui_agent import ui_agent_service
from .services.ui_agent.desktop_automation import desktop_automation
from .services.ui_agent.memory_service import memory_service

@app.post("/api/v1/agent/ui-command", response_model=UICommandResponse)
@rate_limit_if_available("20/minute")
async def process_ui_command(
    request: UICommandRequest,
    http_request: Request
):
    """
    Process UI command with full context awareness.
    
    High-end AI agent with:
    - UI awareness (DOM understanding)
    - Chain of Thoughts reasoning
    - Visual understanding (screenshot analysis)
    - Zero hardcoded solutions (fully configurable)
    
    This endpoint can be easily transferred to any CRM/web application
    by customizing the system prompt template.
    """
    try:
        # Process command with UI agent service
        response = await ui_agent_service.process_ui_command(
            message=request.message,
            ui_context=request.ui_context,
            current_route=request.current_route,
            screenshot_base64=request.screenshot_base64,
            session_id=request.session_id,
            chat_history=request.chat_history,
            enable_reasoning=request.enable_reasoning,
            enable_vision=request.enable_vision,
            executed_actions=None,  # Will be updated after frontend execution
        )
        
        return UICommandResponse(**response)
        
    except Exception as e:
        logger.error(f"Error in UI agent endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing UI command: {str(e)}"
        )


@app.post("/api/v1/agent/desktop-command", response_model=UICommandResponse)
@rate_limit_if_available("10/minute")
async def process_desktop_command(
    request: DesktopCommandRequest,
    http_request: Request
):
    """
    Process desktop-level command with full context awareness.
    
    Extended UI agent that can:
    - Interact with desktop (entire screen, system applications)
    - Control browser (multiple tabs, windows)
    - Navigate between applications
    - Capture desktop screenshots
    
    Scope options:
    - "desktop": Full desktop control
    - "browser": Browser automation only
    - "application": System application control
    
    IMPORTANT: Desktop automation is OPTIONAL and must be enabled via:
    - Environment variable: ENABLE_DESKTOP_AUTOMATION=true
    - Platform filter: DESKTOP_AUTOMATION_PLATFORM=windows (default: windows)
    
    UAC NOTE: Most operations do NOT require Windows UAC. Only system-level
    operations (opening Control Panel, modifying system settings) may trigger UAC.
    """
    try:
        # Check if desktop automation is enabled
        if not ENABLE_DESKTOP_AUTOMATION:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "Desktop automation is disabled",
                    "message": "To enable desktop automation, set ENABLE_DESKTOP_AUTOMATION=true in environment variables",
                    "requires_enable": True
                }
            )
        # Initialize desktop automation if needed
        if not desktop_automation.is_initialized:
            await desktop_automation.initialize()
        
        # Capture desktop context based on scope
        screenshot = request.screenshot_base64
        desktop_context = request.desktop_context or {}
        
        if request.scope == "desktop" and not screenshot:
            screenshot = await desktop_automation.capture_desktop_screenshot()
            desktop_context = await desktop_automation.get_desktop_context()
        elif request.scope == "browser" and not screenshot:
            screenshot = await desktop_automation.capture_browser_screenshot()
            desktop_context = {
                "browser_pages": await desktop_automation.get_browser_pages_info()
            }
        
        # Format desktop context for AI
        ui_context = f"""
## Desktop Context
Platform: {desktop_context.get('platform', 'Unknown')}
Scope: {request.scope}

## Browser Pages ({len(desktop_context.get('browser_pages', []))}):
{chr(10).join([f"- {p.get('title', 'Untitled')} ({p.get('url', 'N/A')})" for p in desktop_context.get('browser_pages', [])])}

## Available Actions:
- Browser: open_page, navigate, click, fill, select
- Desktop: open_application, click_coordinates, type_text, key_press, switch_application
"""
        
        # Process with UI agent service
        response = await ui_agent_service.process_ui_command(
            message=request.message,
            ui_context=ui_context,
            current_route=f"desktop:{request.scope}",
            screenshot_base64=screenshot,
            session_id=request.session_id,
            chat_history=request.chat_history,
            enable_reasoning=request.enable_reasoning,
            enable_vision=request.enable_vision,
        )
        
        # Execute desktop actions if needed
        if response.actions and response.shouldExecute:
            for action in response.actions:
                if action.type.startswith("browser_"):
                    # Browser action
                    action_type = action.type.replace("browser_", "")
                    page_id = action.targetId or "page_0"
                    await desktop_automation.execute_browser_action(
                        page_id,
                        action_type,
                        action.targetSelector or "",
                        action.value
                    )
                elif action.type.startswith("desktop_"):
                    # Desktop action
                    action_type = action.type.replace("desktop_", "")
                    await desktop_automation.execute_desktop_action(
                        action_type,
                        **({"value": action.value} if action.value else {})
                    )
        
        return UICommandResponse(**response)
        
    except Exception as e:
        logger.error(f"Error in desktop agent endpoint: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing desktop command: {str(e)}"
        )


@app.get("/api/v1/agent/desktop/context", response_model=DesktopContextResponse)
async def get_desktop_context(http_request: Request):
    """
    Get current desktop context (open applications, browser pages, etc.)
    
    Returns status information including:
    - Whether desktop automation is enabled
    - Platform information
    - UAC requirements
    - Available browser pages
    """
    try:
        # Always return context, even if not enabled (for status check)
        if not desktop_automation.is_initialized and ENABLE_DESKTOP_AUTOMATION:
            await desktop_automation.initialize()
        
        context = await desktop_automation.get_desktop_context()
        return DesktopContextResponse(**context)
        
    except Exception as e:
        logger.error(f"Error getting desktop context: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error getting desktop context: {str(e)}"
        )


@app.post("/api/v1/agent/desktop/screenshot")
async def capture_desktop_screenshot_endpoint(http_request: Request):
    """Capture screenshot of entire desktop"""
    try:
        if not desktop_automation.is_initialized:
            await desktop_automation.initialize()
        
        screenshot = await desktop_automation.capture_desktop_screenshot()
        
        return {
            "screenshot_base64": screenshot,
            "timestamp": datetime.now().isoformat(),
        }
        
    except Exception as e:
        logger.error(f"Error capturing desktop screenshot: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error capturing desktop screenshot: {str(e)}"
        )


@app.get("/api/v1/agent/memory/statistics", response_model=MemoryStatisticsResponse)
async def get_memory_statistics(http_request: Request):
    """
    Get memory store statistics (RAG system).
    Shows how many memories agent has learned and their distribution.
    """
    try:
        stats = memory_service.get_statistics()
        return MemoryStatisticsResponse(**stats)
        
    except Exception as e:
        logger.error(f"Error getting memory statistics: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error getting memory statistics: {str(e)}"
        )


@app.delete("/api/chat/{session_id}")
def delete_chat_session(session_id: str, request: Request):
    if not agent.delete_session(session_id, request.state.user.user_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted"}


@app.post("/api/export", response_model=ExportRecordsResponse)
def export_records(payload: ExportRecordsRequest):
    if not payload.records:
        raise HTTPException(status_code=400, detail="Brak danych do zapisania.")
    try:
        filename = kpo_service.export_kpo_records(payload.records, prefix=payload.prefix or "results")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ExportRecordsResponse(filename=filename)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


# ============================================================================
# EMAIL INVOICES ENDPOINTS
# ============================================================================

def _require_tenant(request: Request) -> str:
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return tenant_id


def _get_run_and_dir(run_id: str, request: Request, db: Session):
    try:
        tenant_id = _require_tenant(request)
        repo = EmailInvoiceRepository(db)
        run = repo.get_run(run_id, tenant_id)
        if not run:
            logger.error(f"[EmailInvoices] Run not found: run_id={run_id}, tenant_id={tenant_id}")
            raise HTTPException(status_code=404, detail="Run not found")
        config = repo.get_config(run.config_id, tenant_id)
        if not config:
            logger.error(f"[EmailInvoices] Config not found: config_id={run.config_id}, tenant_id={tenant_id}")
            raise HTTPException(status_code=404, detail="Config not found")
        try:
            run_dir = email_invoice_storage.run_dir(run.tenant_id, config.id, run.id)
        except Exception as e:
            logger.error(f"[EmailInvoices] Failed to get run_dir: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to access storage: {str(e)}")
        return repo, run, config, run_dir
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EmailInvoices] Error in _get_run_and_dir: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/api/email-invoices/configs", response_model=List[EmailInvoiceConfigDetail])
def list_email_invoice_configs(request: Request, db: Session = Depends(get_db)):
    try:
        tenant_id = _require_tenant(request)
        repo = EmailInvoiceRepository(db)
        configs = repo.list_configs(tenant_id)
        return [
            EmailInvoiceConfigDetail(
                id=c.id,
                tenant_id=c.tenant_id,
                name=c.name,
                enabled=c.enabled,
                imap_host=c.imap_host,
                imap_port=c.imap_port,
                imap_user=c.imap_user,
                imap_folder=c.imap_folder,
                settings=c.settings,
                created_at=c.created_at,
                updated_at=c.updated_at,
                last_check_at=c.last_check_at,
                last_processed_email_date=c.last_processed_email_date,
            )
            for c in configs
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EmailInvoices] Error listing configs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/api/email-invoices/configs", response_model=EmailInvoiceConfigDetail, status_code=status.HTTP_201_CREATED)
def create_email_invoice_config(payload: EmailInvoiceConfigCreate, request: Request, db: Session = Depends(get_db)):
    tenant_id = _require_tenant(request)
    repo = EmailInvoiceRepository(db)
    config = repo.create_config(
        tenant_id=tenant_id,
        name=payload.name,
        imap_host=payload.imap_host,
        imap_port=payload.imap_port,
        imap_user=payload.imap_user,
        imap_password=payload.imap_password,
        imap_folder=payload.imap_folder,
        settings=payload.settings,
        enabled=payload.enabled,
    )
    return EmailInvoiceConfigDetail(
        id=config.id,
        tenant_id=config.tenant_id,
        name=config.name,
        enabled=config.enabled,
        imap_host=config.imap_host,
        imap_port=config.imap_port,
        imap_user=config.imap_user,
        imap_folder=config.imap_folder,
        settings=config.settings,
        created_at=config.created_at,
        updated_at=config.updated_at,
        last_check_at=config.last_check_at,
        last_processed_email_date=config.last_processed_email_date,
    )


@app.get("/api/email-invoices/configs/{config_id}", response_model=EmailInvoiceConfigDetail)
def get_email_invoice_config(config_id: str, request: Request, db: Session = Depends(get_db)):
    tenant_id = _require_tenant(request)
    repo = EmailInvoiceRepository(db)
    config = repo.get_config(config_id, tenant_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return EmailInvoiceConfigDetail(
        id=config.id,
        tenant_id=config.tenant_id,
        name=config.name,
        enabled=config.enabled,
        imap_host=config.imap_host,
        imap_port=config.imap_port,
        imap_user=config.imap_user,
        imap_folder=config.imap_folder,
        settings=config.settings,
        created_at=config.created_at,
        updated_at=config.updated_at,
        last_check_at=config.last_check_at,
        last_processed_email_date=config.last_processed_email_date,
    )


@app.put("/api/email-invoices/configs/{config_id}", response_model=EmailInvoiceConfigDetail)
def update_email_invoice_config(config_id: str, payload: EmailInvoiceConfigUpdate, request: Request, db: Session = Depends(get_db)):
    tenant_id = _require_tenant(request)
    repo = EmailInvoiceRepository(db)
    config = repo.get_config(config_id, tenant_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    updates = {k: v for k, v in payload.dict(exclude_none=True).items()}
    config = repo.update_config(config, **updates)
    return EmailInvoiceConfigDetail(
        id=config.id,
        tenant_id=config.tenant_id,
        name=config.name,
        enabled=config.enabled,
        imap_host=config.imap_host,
        imap_port=config.imap_port,
        imap_user=config.imap_user,
        imap_folder=config.imap_folder,
        settings=config.settings,
        created_at=config.created_at,
        updated_at=config.updated_at,
        last_check_at=config.last_check_at,
        last_processed_email_date=config.last_processed_email_date,
    )


@app.delete("/api/email-invoices/configs/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_email_invoice_config(config_id: str, request: Request, db: Session = Depends(get_db)):
    tenant_id = _require_tenant(request)
    repo = EmailInvoiceRepository(db)
    config = repo.get_config(config_id, tenant_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    repo.delete_config(config)
    return JSONResponse(status_code=204, content=None)


@app.post("/api/email-invoices/configs/{config_id}/test")
def test_email_invoice_config(config_id: str, request: Request, db: Session = Depends(get_db)):
    # Placeholder test - only checks existence
    tenant_id = _require_tenant(request)
    repo = EmailInvoiceRepository(db)
    config = repo.get_config(config_id, tenant_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return {"success": True, "message": "Configuration is valid", "email_count": 0, "unread_count": 0, "run_id": None, "logs": []}


def _start_email_run(repo: EmailInvoiceRepository, config, run, process_all: bool, process_from_last: bool = False, monitoring: bool = False):
    """Start email invoice processing in a background thread with its own DB session"""
    # Store IDs needed to recreate objects in the thread (don't pass DB objects across threads)
    config_id = config.id
    run_id = run.id
    tenant_id = run.tenant_id
    
    def process_in_thread():
        # Create a new DB session for this thread
        db = SessionLocal()
        try:
            thread_repo = EmailInvoiceRepository(db)
            # Reload config and run objects in the new session
            thread_config = thread_repo.get_config(config_id, tenant_id)
            thread_run = thread_repo.get_run(run_id, tenant_id)
            if not thread_config or not thread_run:
                logger.error(f"Failed to reload config {config_id} or run {run_id} in thread")
                return
            # Use the global storage instance to ensure same directory
            orchestrator = EmailInvoiceOrchestrator(thread_repo, storage=email_invoice_storage)
            if monitoring:
                # Start continuous monitoring mode
                logger.info(f"[EmailInvoice] Starting continuous monitoring for config {config_id}, run {run_id}")
                orchestrator.start_continuous_monitoring(thread_config, thread_run, check_interval=300)  # 5 minutes default
            else:
                # Regular processing mode
                orchestrator.process_config(thread_config, thread_run, 50, process_all, process_from_last)
        except Exception as e:
            logger.error(f"Error in email invoice processing thread: {e}", exc_info=True)
        finally:
            db.close()
    
    thread = threading.Thread(target=process_in_thread, daemon=True)
    thread.start()


@app.post("/api/email-invoices/runs", response_model=EmailInvoiceRunStartResponse)
def start_email_invoice_run(
    payload: EmailInvoiceRunStartRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    tenant_id = _require_tenant(request)
    repo = EmailInvoiceRepository(db)
    config = repo.get_config(payload.config_id, tenant_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    run = repo.create_run(config_id=config.id, tenant_id=tenant_id, status="pending")
    process_all = payload.mode == "all"
    process_from_last = payload.process_from_last if hasattr(payload, 'process_from_last') else False
    monitoring = payload.monitoring if hasattr(payload, 'monitoring') else False
    
    # Update config monitoring_enabled flag if monitoring mode is requested
    if monitoring:
        repo.update_config(config, monitoring_enabled=True)
    
    _start_email_run(repo, config, run, process_all, process_from_last, monitoring)
    return EmailInvoiceRunStartResponse(run_id=run.id, status=run.status)


@app.get("/api/email-invoices/runs", response_model=EmailInvoiceRunsResponse)
def list_email_invoice_runs(
    request: Request,
    db: Session = Depends(get_db),
    config_id: Optional[str] = None,
    limit: int = 50,
):
    try:
        tenant_id = _require_tenant(request)
        repo = EmailInvoiceRepository(db)
        runs = repo.list_runs(tenant_id=tenant_id, config_id=config_id, limit=limit)
        return EmailInvoiceRunsResponse(
            runs=[
                EmailInvoiceRun(
                    id=r.id,
                    config_id=r.config_id,
                    status=r.status,
                    created_at=r.created_at,
                    processed_count=r.processed_count,
                    total_count=r.total_count,
                    error=r.error,
                    started_at=r.started_at,
                    completed_at=r.completed_at,
                )
                for r in runs
            ],
            total=len(runs),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EmailInvoices] Error listing runs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/api/email-invoices/runs/{run_id}", response_model=EmailInvoiceRunDetail)
def get_email_invoice_run(run_id: str, request: Request, db: Session = Depends(get_db)):
    repo, run, _, _ = _get_run_and_dir(run_id, request, db)
    logs = repo.get_run_logs(run_id)
    return EmailInvoiceRunDetail(
        id=run.id,
        config_id=run.config_id,
        status=run.status,
        created_at=run.created_at,
        processed_count=run.processed_count,
        total_count=run.total_count,
        error=run.error,
        started_at=run.started_at,
        completed_at=run.completed_at,
        logs=[
            EmailInvoiceLog(
                id=log.id,
                run_id=log.run_id,
                message=log.message,
                level=log.level,
                created_at=log.created_at,
            )
            for log in logs
        ],
    )


@app.post("/api/email-invoices/runs/{run_id}/pause", response_model=EmailInvoiceRun)
def pause_email_invoice_run(run_id: str, request: Request, db: Session = Depends(get_db)):
    repo, run, _, _ = _get_run_and_dir(run_id, request, db)
    run = repo.update_run_status(run, "paused")
    return EmailInvoiceRun(
        id=run.id,
        config_id=run.config_id,
        status=run.status,
        created_at=run.created_at,
        processed_count=run.processed_count,
        total_count=run.total_count,
        error=run.error,
        started_at=run.started_at,
        completed_at=run.completed_at,
    )


@app.post("/api/email-invoices/runs/{run_id}/resume", response_model=EmailInvoiceRun)
def resume_email_invoice_run(run_id: str, request: Request, db: Session = Depends(get_db)):
    repo, run, _, _ = _get_run_and_dir(run_id, request, db)
    run = repo.update_run_status(run, "running")
    return EmailInvoiceRun(
        id=run.id,
        config_id=run.config_id,
        status=run.status,
        created_at=run.created_at,
        processed_count=run.processed_count,
        total_count=run.total_count,
        error=run.error,
        started_at=run.started_at,
        completed_at=run.completed_at,
    )


@app.post("/api/email-invoices/runs/{run_id}/stop", response_model=EmailInvoiceRun)
def stop_email_invoice_run(run_id: str, request: Request, db: Session = Depends(get_db)):
    repo, run, _, _ = _get_run_and_dir(run_id, request, db)
    run = repo.update_run_status(run, "stopped")
    return EmailInvoiceRun(
        id=run.id,
        config_id=run.config_id,
        status=run.status,
        created_at=run.created_at,
        processed_count=run.processed_count,
        total_count=run.total_count,
        error=run.error,
        started_at=run.started_at,
        completed_at=run.completed_at,
    )


@app.get("/api/email-invoices/runs/{run_id}/logs", response_model=List[EmailInvoiceLog])
def get_email_invoice_run_logs(
    run_id: str,
    since: Optional[str] = Query(None, description="ISO datetime string to filter logs created after this time"),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """
    Get logs for an email invoice run.
    
    Args:
        run_id: The run ID
        since: Optional ISO datetime string to filter logs created after this time (e.g., "2025-12-17T12:00:00Z")
        request: FastAPI request object (for authentication)
        db: Database session
        
    Returns:
        List of log entries ordered by creation time
    """
    try:
        tenant_id = getattr(request.state, 'tenant_id', None)
        if not tenant_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        
        repo = EmailInvoiceRepository(db)
        
        # Verify run exists and belongs to tenant
        run = repo.get_run(run_id, tenant_id)
        if not run:
            logger.error(f"[EmailInvoices] Run not found for logs: run_id={run_id}, tenant_id={tenant_id}")
            raise HTTPException(status_code=404, detail="Run not found")
        
        # Parse since parameter if provided
        since_dt = None
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid datetime format for 'since' parameter. Use ISO format (e.g., '2025-12-17T12:00:00Z')")
        
        # Get logs with optional since filter
        logs = repo.get_run_logs(run_id, since=since_dt)
        
        # Convert to response model
        return [
            EmailInvoiceLog(
                id=log.id,
                run_id=log.run_id,
                message=log.message,
                level=log.level,
                created_at=log.created_at,
            )
            for log in logs
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EmailInvoices] Error getting run logs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


def _resolve_path(base: Path, relative: str) -> Path:
    target = (base / relative).resolve()
    if not str(target).startswith(str(base.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    return target


@app.get("/api/email-invoices/runs/{run_id}/files")
def list_email_invoice_files(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
    path: str = "",
):
    _, _, _, run_dir = _get_run_and_dir(run_id, request, db)
    target = _resolve_path(run_dir, path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if target.is_file():
        stat = target.stat()
        return {
            "path": str(target.relative_to(run_dir)),
            "type": "file",
            "size": stat.st_size,
            "modified": stat.st_mtime,
        }
    entries = []
    for item in target.iterdir():
        stat = item.stat()
        entries.append(
            {
                "name": item.name,
                "path": str(item.relative_to(run_dir)),
                "type": "dir" if item.is_dir() else "file",
                "size": stat.st_size,
                "modified": stat.st_mtime,
            }
        )
    return {"path": str(target.relative_to(run_dir)), "entries": entries}


@app.get("/api/email-invoices/runs/{run_id}/files/content")
def preview_email_invoice_file(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
    path: str = "",
    max_lines: int = 200,
):
    _, _, _, run_dir = _get_run_and_dir(run_id, request, db)
    target = _resolve_path(run_dir, path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    if target.suffix.lower() == ".csv":
        lines: List[str] = []
        with target.open("r", encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f):
                if i >= max_lines:
                    break
                lines.append(line.rstrip("\n"))
        return {"path": str(target.relative_to(run_dir)), "kind": "csv", "lines": lines}
    # Fallback: return first bytes for non-csv
    content = target.read_bytes()[:8192]
    try:
        text = content.decode("utf-8")
        return {"path": str(target.relative_to(run_dir)), "kind": "text", "content": text}
    except UnicodeDecodeError:
        return {"path": str(target.relative_to(run_dir)), "kind": "binary", "size": target.stat().st_size}


@app.get("/api/email-invoices/runs/{run_id}/files/download")
def download_email_invoice_file(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
    path: str = "",
):
    _, _, _, run_dir = _get_run_and_dir(run_id, request, db)
    target = _resolve_path(run_dir, path)
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return StreamingResponse(
        target.open("rb"),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{target.name}"'},
    )


@app.get("/api/email-invoices/runs/{run_id}/files/archive")
def archive_email_invoice_path(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
    path: str = "",
):
    _, _, config, run_dir = _get_run_and_dir(run_id, request, db)
    target_str = str(run_dir)
    
    # Check if using GCS
    if target_str.startswith("gs://"):
        # GCS storage - use storage methods
        from app.services.email_invoices.storage import EmailInvoiceStorage
        from app.config import EMAIL_INVOICES_STORAGE_DIR, GCS_RESULTS_BUCKET
        storage = EmailInvoiceStorage(EMAIL_INVOICES_STORAGE_DIR, bucket_name=GCS_RESULTS_BUCKET)
        
        # Extract tenant_id, config_id, run_id from run_dir path
        # Format: gs://bucket/email_invoices/tenant_id/config_id/run_id
        if "/" in target_str[5:]:
            relative_path = target_str[5:].split("/", 1)[1]
            parts = relative_path.split("/")
            if len(parts) >= 4:
                tenant_id, config_id, run_id_from_path = parts[1], parts[2], parts[3]
                
                buffer = io.BytesIO()
                files_added = 0
                
                with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
                    # List all blobs in the target path
                    if path:
                        # Archive specific subdirectory
                        blob_prefix = storage._gcs_path(tenant_id, config_id, run_id_from_path, path)
                    else:
                        # Archive entire run
                        blob_prefix = storage._gcs_path(tenant_id, config_id, run_id_from_path)
                    
                    blobs = storage.bucket.list_blobs(prefix=blob_prefix)
                    for blob in blobs:
                        # Skip directories (blobs ending with /)
                        if blob.name.endswith("/"):
                            continue
                        
                        # Calculate relative path for archive
                        if path:
                            # Remove the base path prefix
                            arcname = blob.name[len(blob_prefix):].lstrip("/")
                        else:
                            # Remove email_invoices/tenant_id/config_id/run_id prefix
                            arcname = blob.name[len(storage._gcs_path(tenant_id, config_id, run_id_from_path)):].lstrip("/")
                        
                        # Download blob and add to zip
                        blob_data = blob.download_as_bytes()
                        zipf.writestr(arcname, blob_data)
                        files_added += 1
                        logger.info(f"[EmailInvoices] Added GCS file to archive: {arcname} (size: {len(blob_data)} bytes)")
                
                logger.info(f"[EmailInvoices] GCS Archive created with {files_added} files, size: {buffer.tell()} bytes")
                buffer.seek(0)
                
                # Generate archive name
                if not path:
                    name = f"run-{run_id}"
                else:
                    name = path.split("/")[-1] or "archive"
                
                return StreamingResponse(
                    buffer,
                    media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}.zip"'},
                )
        raise HTTPException(status_code=400, detail="Invalid GCS path format")
    else:
        # Local filesystem storage
        target = _resolve_path(run_dir, path)
        if not target.exists():
            raise HTTPException(status_code=404, detail="Path not found")

        # Log for debugging
        logger.info(f"[EmailInvoices] Creating archive for run {run_id}, path: {path}, target: {target}")
        logger.info(f"[EmailInvoices] Target exists: {target.exists()}, is_dir: {target.is_dir()}, is_file: {target.is_file()}")

        buffer = io.BytesIO()
        files_added = 0
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
            if target.is_file():
                zipf.write(target, arcname=target.name)
                files_added = 1
                logger.info(f"[EmailInvoices] Added single file to archive: {target.name}")
            else:
                # Only include files, not directories
                all_files = list(target.rglob("*"))
                logger.info(f"[EmailInvoices] Found {len(all_files)} items in target directory")
                for file_path in all_files:
                    if file_path.is_file():
                        # Calculate relative path from target directory
                        arcname = str(file_path.relative_to(target))
                        zipf.write(file_path, arcname=arcname)
                        files_added += 1
                        logger.info(f"[EmailInvoices] Added file to archive: {arcname} (size: {file_path.stat().st_size} bytes)")
        
        logger.info(f"[EmailInvoices] Archive created with {files_added} files, size: {buffer.tell()} bytes")
        buffer.seek(0)
        
        # If path is empty, use run_id as archive name
        if not path:
            name = f"run-{run_id}"
        else:
            name = target.name or "archive"
        return StreamingResponse(
            buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{name}.zip"'},
        )


@app.post("/api/email-invoices/runs/{run_id}/files/mkdir")
def mkdir_email_invoice_path(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
    path: str = "",
    name: str = "",
):
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    _, _, _, run_dir = _get_run_and_dir(run_id, request, db)
    parent = _resolve_path(run_dir, path)
    if not parent.exists() or not parent.is_dir():
        raise HTTPException(status_code=404, detail="Parent path not found")
    target = parent / name
    target.mkdir(parents=True, exist_ok=True)
    return {"created": str(target.relative_to(run_dir))}


@app.get("/api/email-invoices/statistics", response_model=EmailInvoiceStatisticsResponse)
def get_email_invoice_statistics(
    request: Request,
    db: Session = Depends(get_db),
    config_id: Optional[str] = None,
    period: str = "all",  # "all" or "YYYY-MM" format
):
    """
    Get invoice statistics grouped by vendor (Nabywca/Nadawca).
    
    Args:
        config_id: Optional config ID to filter by specific config
        period: "all" for all time, or "YYYY-MM" for specific month (e.g., "2024-12")
    
    Returns:
        Statistics with total invoices, total amount, and breakdown by vendor
    """
    tenant_id = _require_tenant(request)
    repo = EmailInvoiceRepository(db)
    
    try:
        # Build query for pdf_hashes
        from sqlalchemy import func, select, case
        from datetime import date as date_type
        
        stmt = (
            select(
                models.EmailInvoicePdfHash.vendor,
                func.count(models.EmailInvoicePdfHash.id).label("count"),
                func.sum(
                    case(
                        (models.EmailInvoicePdfHash.amount.isnot(None), models.EmailInvoicePdfHash.amount),
                        else_=0.0
                    )
                ).label("total_amount")
            )
            .where(models.EmailInvoicePdfHash.tenant_id == tenant_id)
            .group_by(models.EmailInvoicePdfHash.vendor)
        )
        
        # Filter by config if provided
        if config_id:
            stmt = stmt.where(models.EmailInvoicePdfHash.config_id == config_id)
        
        # Filter by month if period is specified
        if period != "all":
            try:
                from datetime import datetime
                period_date = datetime.strptime(period, "%Y-%m").date()
                # Filter invoices where invoice_date is in the same month/year
                stmt = stmt.where(
                    func.extract("year", models.EmailInvoicePdfHash.invoice_date) == period_date.year,
                    func.extract("month", models.EmailInvoicePdfHash.invoice_date) == period_date.month
                )
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid period format. Use 'all' or 'YYYY-MM' (e.g., '2024-12')")
        
        # Execute query
        results = db.execute(stmt).all()
        
        # Build statistics
        by_vendor = []
        total_invoices = 0
        total_amount = 0.0
        
        for row in results:
            vendor = row.vendor or "Nieznany"
            count = row.count or 0
            amount = float(row.total_amount or 0.0)
            by_vendor.append(EmailInvoiceStatistics(
                vendor=vendor,
                count=count,
                total_amount=amount
            ))
            total_invoices += count
            total_amount += amount
        
        # Sort by amount descending
        by_vendor.sort(key=lambda x: x.total_amount, reverse=True)
        
        return EmailInvoiceStatisticsResponse(
            period=period,
            total_invoices=total_invoices,
            total_amount=total_amount,
            by_vendor=by_vendor,
        )
        
    except Exception as e:
        logger.error(f"[EmailInvoices] Error getting statistics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting statistics: {str(e)}")


@app.get("/api/email-invoices/runs/{run_id}/structure")
def get_email_invoice_structure(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Get invoice structure - list of months with invoice counts."""
    tenant_id = _require_tenant(request)
    repo = EmailInvoiceRepository(db)
    
    try:
        _, run, _, _ = _get_run_and_dir(run_id, request, db)
        
        # Get all invoices for this run's config, grouped by month
        from sqlalchemy import func, select, extract
        from datetime import date as date_type
        
        stmt = (
            select(
                extract("year", models.EmailInvoicePdfHash.invoice_date).label("year"),
                extract("month", models.EmailInvoicePdfHash.invoice_date).label("month"),
                func.count(models.EmailInvoicePdfHash.id).label("count")
            )
            .where(
                models.EmailInvoicePdfHash.tenant_id == tenant_id,
                models.EmailInvoicePdfHash.config_id == run.config_id,
                models.EmailInvoicePdfHash.invoice_date.isnot(None)
            )
            .group_by(
                extract("year", models.EmailInvoicePdfHash.invoice_date),
                extract("month", models.EmailInvoicePdfHash.invoice_date)
            )
            .order_by(
                extract("year", models.EmailInvoicePdfHash.invoice_date).desc(),
                extract("month", models.EmailInvoicePdfHash.invoice_date).desc()
            )
        )
        
        results = db.execute(stmt).all()
        months = []
        for row in results:
            if row.year and row.month:
                month_str = f"{int(row.year)}-{int(row.month):02d}"
                months.append({"month": month_str, "count": row.count or 0})
        
        return {"months": months}
        
    except Exception as e:
        logger.error(f"[EmailInvoices] Error getting structure: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting structure: {str(e)}")


@app.get("/api/email-invoices/runs/{run_id}/preview")
def get_email_invoice_preview(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 200,
):
    """Get CSV preview for email invoice run."""
    tenant_id = _require_tenant(request)
    repo = EmailInvoiceRepository(db)
    
    try:
        _, run, _, run_dir = _get_run_and_dir(run_id, request, db)
        
        # Look for CSV file in run directory
        csv_files = list(run_dir.glob("*.csv"))
        if not csv_files:
            # Try results subdirectory
            results_dir = run_dir / "results"
            if results_dir.exists():
                csv_files = list(results_dir.glob("*.csv"))
        
        if not csv_files:
            return {"results": [], "total": 0}
        
        # Use first CSV file found
        csv_file = csv_files[0]
        
        # Read CSV preview
        import pandas as pd
        frame = pd.read_csv(csv_file, nrows=limit, encoding='utf-8').fillna("")
        records = frame.to_dict(orient="records")
        
        # Get total count (approximate from file size or read all)
        try:
            total_frame = pd.read_csv(csv_file, encoding='utf-8')
            total = len(total_frame)
        except:
            total = len(records)
        
        return {"results": records, "total": total}
        
    except Exception as e:
        logger.error(f"[EmailInvoices] Error getting preview: {e}", exc_info=True)
        # Return empty preview on error (file might not exist yet)
        return {"results": [], "total": 0}


@app.get("/api/email-invoices/runs/{run_id}/invoices")
def get_email_invoices_by_month(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
    month: str = "",
):
    """Get invoices for a specific month (YYYY-MM format)."""
    tenant_id = _require_tenant(request)
    repo = EmailInvoiceRepository(db)
    
    try:
        _, run, _, _ = _get_run_and_dir(run_id, request, db)
        
        if not month:
            raise HTTPException(status_code=400, detail="Month parameter required (YYYY-MM)")
        
        # Parse month
        from datetime import datetime
        try:
            month_date = datetime.strptime(month, "%Y-%m").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")
        
        # Get invoices for this month
        from sqlalchemy import func, select, extract
        
        stmt = (
            select(models.EmailInvoicePdfHash)
            .where(
                models.EmailInvoicePdfHash.tenant_id == tenant_id,
                models.EmailInvoicePdfHash.config_id == run.config_id,
                extract("year", models.EmailInvoicePdfHash.invoice_date) == month_date.year,
                extract("month", models.EmailInvoicePdfHash.invoice_date) == month_date.month
            )
            .order_by(models.EmailInvoicePdfHash.invoice_date.desc())
        )
        
        results = db.execute(stmt).scalars().all()
        
        invoices = []
        for hash_obj in results:
            invoices.append({
                "id": str(hash_obj.id),
                "filename": hash_obj.filename or "unknown.pdf",
                "vendor": hash_obj.vendor or "Nieznany",
                "amount": float(hash_obj.amount or 0.0),
                "date": hash_obj.invoice_date.isoformat() if hash_obj.invoice_date else "",
            })
        
        return invoices
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EmailInvoices] Error getting invoices by month: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting invoices: {str(e)}")


@app.delete("/api/email-invoices/runs/{run_id}/files")
def delete_email_invoice_path(
    run_id: str,
    request: Request,
    db: Session = Depends(get_db),
    path: str = "",
):
    _, _, _, run_dir = _get_run_and_dir(run_id, request, db)
    target = _resolve_path(run_dir, path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return {"deleted": str(target.relative_to(run_dir))}


# ============================================================================
# Admin API Endpoints
# ============================================================================

@app.get("/api/v1/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(request: Request, db: Session = Depends(get_db)):
    """Get dashboard statistics (active jobs, completed, records scraped)"""
    user = request.state.user if hasattr(request.state, "user") else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    tenant_id = user.tenant_id
    repo = JobRepository(db)
    
    # Get active jobs (running or queued)
    all_jobs = repo.list_jobs(tenant_id, limit=100)
    active_jobs = [j for j in all_jobs if j.status in ["running", "queued", "pausing", "stopping"]]
    
    # Get completed jobs today
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    completed_today = [
        j for j in all_jobs 
        if j.status == "completed" and j.updated_at and j.updated_at >= today
    ]
    
    # Get records scraped this week
    week_ago = datetime.utcnow() - timedelta(days=7)
    records_scraped_week = 0
    for job in all_jobs:
        if job.updated_at and job.updated_at >= week_ago:
            # Try to get row count from results
            try:
                rows = repo.list_result_rows(tenant_id, job.id, include_deleted=False)
                records_scraped_week += len(rows)
            except Exception:
                # If no rows table or error, skip
                pass
    
    # Get pending tasks (queued)
    pending_tasks = [j for j in all_jobs if j.status == "queued"]
    
    # Get recent jobs (last 5)
    recent_jobs = []
    for job in all_jobs[:5]:
        # Calculate time ago
        if job.created_at:
            delta = datetime.utcnow() - job.created_at
            if delta.days > 0:
                createdAt = f"{delta.days} day{'s' if delta.days > 1 else ''} ago"
            elif delta.seconds > 3600:
                createdAt = f"{delta.seconds // 3600} hour{'s' if delta.seconds // 3600 > 1 else ''} ago"
            elif delta.seconds > 60:
                createdAt = f"{delta.seconds // 60} min{'s' if delta.seconds // 60 > 1 else ''} ago"
            else:
                createdAt = "just now"
        else:
            createdAt = "unknown"
        
        recent_jobs.append({
            "id": job.id,
            "name": job.params.get("name", job.source) if isinstance(job.params, dict) else str(job.source),
            "source": job.source,
            "status": job.status,
            "progress": job.progress,
            "createdAt": createdAt,
        })
    
    return DashboardStats(
        active_jobs=len(active_jobs),
        completed_today=len(completed_today),
        records_scraped_week=records_scraped_week,
        pending_tasks=len(pending_tasks),
        recent_jobs=recent_jobs,
    )


@app.get("/api/v1/admin/tenants", response_model=List[TenantResponse])
def list_tenants(request: Request, db: Session = Depends(get_db)):
    """List all tenants (admin only)"""
    require_admin(request)
    tenants = db.query(models.Tenant).all()
    return [
        TenantResponse(
            id=t.id,
            name=t.name,
            email="",  # Will be populated from first user if needed
            status="active",  # TODO: Add status field to Tenant model
            enabled_modules=[],  # TODO: Add enabled_modules field to Tenant model
            cloud_run_service_name=None,  # TODO: Add to Tenant model
            cloud_run_url=None,  # TODO: Add to Tenant model
            service_account_email=None,  # TODO: Add to Tenant model
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in tenants
    ]


@app.get("/api/v1/admin/tenants/{tenant_id}", response_model=TenantResponse)
def get_tenant(tenant_id: str, request: Request, db: Session = Depends(get_db)):
    """Get tenant details (admin only)"""
    require_admin(request)
    tenant = db.get(models.Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Get first user email for this tenant
    user = db.query(models.User).filter(models.User.tenant_id == tenant_id).first()
    email = user.email if user else ""
    
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        email=email,
        status="active",
        enabled_modules=[],
        cloud_run_service_name=None,
        cloud_run_url=None,
        service_account_email=None,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )


@app.post("/api/v1/admin/tenants", response_model=TenantResponse, status_code=201)
def create_tenant(payload: CreateTenantRequest, request: Request, db: Session = Depends(get_db)):
    """Create a new tenant (admin only)"""
    require_admin(request)
    
    # Generate tenant_id from email (deterministic)
    tenant_id = tenancy_service.tenant_id_for_email(payload.email)
    
    # Check if tenant already exists
    existing = db.get(models.Tenant, tenant_id)
    if existing:
        raise HTTPException(status_code=400, detail="Tenant with this email already exists")
    
    # Create tenant
    tenant = models.Tenant(id=tenant_id, name=payload.name)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        email=payload.email,
        status="active",
        enabled_modules=payload.modules,
        cloud_run_service_name=None,
        cloud_run_url=None,
        service_account_email=None,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )


@app.put("/api/v1/admin/tenants/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: str,
    payload: UpdateTenantRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Update tenant (admin only)"""
    require_admin(request)
    tenant = db.get(models.Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    if payload.name:
        tenant.name = payload.name
    # TODO: Add other fields when Tenant model is extended
    
    db.commit()
    db.refresh(tenant)
    
    user = db.query(models.User).filter(models.User.tenant_id == tenant_id).first()
    email = user.email if user else ""
    
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        email=email,
        status=payload.status or "active",
        enabled_modules=payload.modules or [],
        cloud_run_service_name=None,
        cloud_run_url=None,
        service_account_email=None,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )


@app.delete("/api/v1/admin/tenants/{tenant_id}", status_code=204)
def delete_tenant(tenant_id: str, request: Request, db: Session = Depends(get_db)):
    """Delete tenant (admin only)"""
    require_admin(request)
    tenant = db.get(models.Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # TODO: Add soft delete (status = "deleted") instead of hard delete
    db.delete(tenant)
    db.commit()
    return None


@app.post("/api/v1/admin/tenants/{tenant_id}/deploy", response_model=DeployTenantResponse)
def deploy_tenant_service(tenant_id: str, request: Request, db: Session = Depends(get_db)):
    """Deploy Cloud Run service for tenant (admin only)"""
    require_admin(request)
    tenant = db.get(models.Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # TODO: Implement Cloud Run deployment
    service_name = f"netatron-api-{tenant_id[:8]}"
    service_url = f"https://{service_name}-xxxxx.run.app"
    
    return DeployTenantResponse(
        tenant_id=tenant_id,
        service_name=service_name,
        service_url=service_url,
        status="pending",
        message="Deployment initiated. This is a placeholder implementation.",
    )


@app.get("/api/v1/admin/billing/{tenant_id}", response_model=TenantBillingReport)
def get_tenant_billing(
    tenant_id: str,
    request: Request,
    db: Session = Depends(get_db),
    period: str = "current",
):
    """Get billing report for a tenant (admin only)"""
    require_admin(request)
    tenant = db.get(models.Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Calculate date range based on period
    now = datetime.utcnow()
    if period == "current":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    elif period == "last":
        # Previous month
        first_day_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_date = (first_day_this_month - timedelta(days=1)).replace(day=1)
        end_date = first_day_this_month - timedelta(microseconds=1)
    else:  # quarter
        # Last 3 months
        start_date = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    
    # Get usage stats from database
    usage = usage_tracking.get_tenant_usage_period(db, tenant_id, start_date, end_date)
    
    # TODO: Get GCP costs from GCP Billing API (for now return 0.0)
    gcp_cost = 0.0
    
    return TenantBillingReport(
        tenant_id=tenant_id,
        tenant_name=tenant.name,
        period_start=start_date,
        period_end=end_date,
        gcp_cost=gcp_cost,
        openai_cost=usage["openai_cost"],
        total_cost=gcp_cost + usage["openai_cost"] + usage["google_maps_cost"],
        gcp_breakdown={
            "cloud_run": 0.0,
            "cloud_sql": 0.0,
            "cloud_storage": 0.0,
            "networking": 0.0,
            "other": 0.0,
        },
        openai_usage={
            "input_tokens": usage["openai_input_tokens"],
            "output_tokens": usage["openai_output_tokens"],
            "requests": usage["openai_requests"],
            "cost": usage["openai_cost"],
        },
    )


@app.post("/api/v1/admin/billing/refresh", status_code=200)
def refresh_billing(request: Request, db: Session = Depends(get_db)):
    """Refresh billing data from GCP (admin only)"""
    require_admin(request)
    # TODO: Implement billing refresh from GCP Billing API
    return {"status": "refresh_initiated", "message": "Billing data refresh initiated"}


@app.get("/api/v1/admin/billing/gcp", response_model=GCPCostReport)
def get_gcp_costs(request: Request, db: Session = Depends(get_db), period: str = "current"):
    """Get GCP costs summary (admin only)"""
    require_admin(request)
    
    # Calculate date ranges
    now = datetime.utcnow()
    if period == "current":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now
        prev_start = (start_date - timedelta(days=1)).replace(day=1)
        prev_end = start_date - timedelta(microseconds=1)
    elif period == "last":
        first_day_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_date = (first_day_this_month - timedelta(days=1)).replace(day=1)
        end_date = first_day_this_month - timedelta(microseconds=1)
        prev_start = (start_date - timedelta(days=1)).replace(day=1)
        prev_end = start_date - timedelta(microseconds=1)
    else:  # quarter
        start_date = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now
        prev_start = (start_date - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
        prev_end = start_date - timedelta(microseconds=1)
    
    # Get Google Maps costs from usage tracking (this is tracked)
    current_stats = usage_tracking.get_all_tenants_usage_period(db, start_date, end_date)
    previous_stats = usage_tracking.get_all_tenants_usage_period(db, prev_start, prev_end)
    
    current_maps_cost = sum(s.get("google_maps_cost", 0.0) for s in current_stats.values())
    previous_maps_cost = sum(s.get("google_maps_cost", 0.0) for s in previous_stats.values())
    
    # Get GCP billing costs (Cloud SQL, Cloud Run, etc.) from Cloud Monitoring API
    gcp_billing = gcp_monitoring.get_gcp_billing_costs(start_date, end_date)
    gcp_total = gcp_billing.get("total", 0.0)
    gcp_services = gcp_billing.get("services", [])
    
    # Get previous period GCP costs for trend calculation
    prev_gcp_billing = gcp_monitoring.get_gcp_billing_costs(prev_start, prev_end)
    prev_gcp_total = prev_gcp_billing.get("total", 0.0)
    
    # Combine with tracked costs
    total = current_maps_cost + gcp_total
    previous_total = previous_maps_cost + prev_gcp_total
    
    # Build services list
    services = [
        {
            "name": "Google Maps API",
            "cost": current_maps_cost,
            "trend": ((current_maps_cost - previous_maps_cost) / previous_maps_cost * 100) if previous_maps_cost > 0 else 0.0,
        },
    ]
    
    # Add GCP services with trend calculation
    for service in gcp_services:
        service_name = service.get("name", "Unknown")
        service_cost = service.get("cost", 0.0)
        # Find previous cost for this service
        prev_service = next((s for s in prev_gcp_billing.get("services", []) if s.get("name") == service_name), None)
        prev_service_cost = prev_service.get("cost", 0.0) if prev_service else 0.0
        trend = ((service_cost - prev_service_cost) / prev_service_cost * 100) if prev_service_cost > 0 else 0.0
        
        services.append({
            "name": service_name,
            "cost": service_cost,
            "trend": round(trend, 2),
        })
    
    return GCPCostReport(
        total=total,
        previous_month=previous_total,
        budget=2000.0,  # TODO: Make configurable
        services=services,
    )


@app.get("/api/v1/admin/billing/openai", response_model=OpenAIUsageReport)
def get_openai_usage(request: Request, db: Session = Depends(get_db), period: str = "current"):
    """Get OpenAI usage summary (admin only)"""
    require_admin(request)
    
    # Calculate date range
    now = datetime.utcnow()
    if period == "current":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    elif period == "last":
        first_day_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        start_date = (first_day_this_month - timedelta(days=1)).replace(day=1)
        end_date = first_day_this_month - timedelta(microseconds=1)
    else:  # quarter
        start_date = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    
    # Get usage for all tenants
    tenant_stats = usage_tracking.get_all_tenants_usage_period(db, start_date, end_date)
    
    # Build response
    tenants_list = []
    total_cost = 0.0
    total_input = 0
    total_output = 0
    
    for tid, stats in tenant_stats.items():
        tenant = db.get(models.Tenant, tid)
        tenant_name = tenant.name if tenant else tid
        
        tenants_list.append({
            "tenant_id": tid,
            "tenant_name": tenant_name,
            "modules": stats["module_usage"],
            "total_cost": stats["openai_cost"],
        })
        
        total_cost += stats["openai_cost"]
        total_input += stats["openai_input_tokens"]
        total_output += stats["openai_output_tokens"]
    
    return OpenAIUsageReport(
        total_cost=total_cost,
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        tenants=tenants_list,
    )


@app.get("/api/v1/admin/logs", response_model=List[LogEntry])
def get_tenant_logs(
    request: Request,
    db: Session = Depends(get_db),
    tenant_id: Optional[str] = None,
    service: Optional[str] = None,
    level: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
):
    """Get logs from Cloud Logging (admin only)"""
    require_admin(request)
    # TODO: Implement Cloud Logging API integration
    return []


@app.get("/api/v1/admin/infrastructure/status", response_model=InfrastructureStatus)
def get_infrastructure_status(request: Request, db: Session = Depends(get_db)):
    """Get infrastructure status (admin only)"""
    require_admin(request)
    
    # Get Cloud Run services
    cloud_run_services = []
    try:
        services = gcp_monitoring.get_cloud_run_services()
        cloud_run_services = [CloudRunService(**s) for s in services]
    except Exception as e:
        logger.error(f"Failed to get Cloud Run services: {e}", exc_info=True)
    
    # Get Cloud SQL instances
    cloud_sql_instances = []
    try:
        instances = gcp_monitoring.get_cloud_sql_instances()
        cloud_sql_instances = [CloudSQLInstance(**i) for i in instances]
    except Exception as e:
        logger.error(f"Failed to get Cloud SQL instances: {e}", exc_info=True)
    
    # Get migrations (from Alembic)
    migrations = []
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from alembic.runtime.migration import MigrationContext
        
        alembic_cfg = Config("alembic.ini")
        script = ScriptDirectory.from_config(alembic_cfg)
        
        # Get current revision from database
        with db.connection() as conn:
            context = MigrationContext.configure(conn)
            current_rev = context.get_current_revision()
            
            # Get all revisions
            for rev in script.walk_revisions():
                migrations.append(Migration(
                    version=rev.revision,
                    name=rev.doc or rev.revision,
                    status="applied" if rev.revision == current_rev else "pending",
                    applied_at=datetime.utcnow() if rev.revision == current_rev else None,
                ))
    except Exception as e:
        logger.warning(f"Failed to get migrations: {e}")
    
    # Get Cloud Run Jobs
    jobs = []
    try:
        # TODO: Implement Cloud Run Jobs API
        pass
    except Exception as e:
        logger.warning(f"Failed to get Cloud Run Jobs: {e}")
    
    return InfrastructureStatus(
        cloud_run_services=cloud_run_services,
        cloud_sql_instances=cloud_sql_instances,
        migrations=migrations,
        jobs=jobs,
        last_updated=datetime.utcnow(),
    )


@app.get("/api/v1/admin/infrastructure/cloudrun", response_model=List[CloudRunService])
def get_cloud_run_services(request: Request, db: Session = Depends(get_db)):
    """Get Cloud Run services (admin only)"""
    require_admin(request)
    try:
        services = gcp_monitoring.get_cloud_run_services()
        return [CloudRunService(**s) for s in services]
    except Exception as e:
        logger.error(f"Failed to get Cloud Run services: {e}", exc_info=True)
        return []


@app.get("/api/v1/admin/infrastructure/cloudsql", response_model=List[CloudSQLInstance])
def get_cloud_sql_instances(request: Request, db: Session = Depends(get_db)):
    """Get Cloud SQL instances (admin only)"""
    require_admin(request)
    try:
        instances = gcp_monitoring.get_cloud_sql_instances()
        return [CloudSQLInstance(**i) for i in instances]
    except Exception as e:
        logger.error(f"Failed to get Cloud SQL instances: {e}", exc_info=True)
        return []


@app.post("/api/v1/admin/settings/password", response_model=ChangePasswordResponse)
def change_password(
    request: Request,
    password_data: ChangePasswordRequest,
    db: Session = Depends(get_db),
):
    """Change admin password (admin only, simple auth only)"""
    require_admin(request)
    
    # Only allow password change if simple auth is enabled
    if not DISABLE_GOOGLE_AUTH:
        raise HTTPException(
            status_code=400,
            detail="Password change is only available when simple auth is enabled",
        )
    
    # Validate passwords match
    if password_data.new_password != password_data.confirm_password:
        raise HTTPException(
            status_code=400,
            detail="New password and confirmation do not match",
        )
    
    # Validate password length
    if len(password_data.new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 6 characters long",
        )
    
    # Verify current password
    try:
        from .auth.simple import DEV_PASSWORD, DEV_USERNAME
        if password_data.current_password != DEV_PASSWORD:
            raise HTTPException(
                status_code=401,
                detail="Current password is incorrect",
            )
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Simple auth module not available",
        )
    
    # Update password in Secret Manager
    try:
        from google.cloud import secretmanager
        import os
        
        project_id = os.getenv("GOOGLE_PROJECT_ID")
        if not project_id:
            raise HTTPException(
                status_code=500,
                detail="GOOGLE_PROJECT_ID not configured",
            )
        
        secret_id = "dev-password"
        client = secretmanager.SecretManagerServiceClient()
        secret_name = f"projects/{project_id}/secrets/{secret_id}"
        
        # Check if secret exists, create if not
        try:
            client.get_secret(request={"name": secret_name})
        except Exception:
            # Secret doesn't exist, create it
            parent = f"projects/{project_id}"
            client.create_secret(
                request={
                    "parent": parent,
                    "secret_id": secret_id,
                    "secret": {"replication": {"automatic": {}}},
                }
            )
        
        # Add new version with new password
        parent = f"projects/{project_id}/secrets/{secret_id}"
        client.add_secret_version(
            request={
                "parent": parent,
                "payload": {"data": password_data.new_password.encode("utf-8")},
            }
        )
        
        logger.info(f"[ADMIN] Password changed by admin user")
        
        return ChangePasswordResponse(
            success=True,
            message="Password changed successfully. Please restart the service for changes to take effect.",
        )
    except Exception as e:
        logger.error(f"[ADMIN] Error changing password: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update password: {str(e)}",
        )


@app.post("/api/v1/admin/clients/create", response_model=ClientResponse, status_code=201)
def create_client(
    request: Request,
    client_data: CreateClientRequest,
    db: Session = Depends(get_db),
):
    """Create a new client (tenant) in the database (admin only)"""
    require_admin(request)
    
    import uuid
    from sqlalchemy import select
    
    # Validate domain name
    domain_name = client_data.domain_name.lower().strip()
    if not domain_name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(
            status_code=400,
            detail="Domain name can only contain letters, numbers, hyphens, and underscores",
        )
    
    if len(domain_name) < 3 or len(domain_name) > 63:
        raise HTTPException(
            status_code=400,
            detail="Domain name must be between 3 and 63 characters",
        )
    
    try:
        # Check if tenant with this domain already exists
        existing_tenant = db.scalar(
            select(models.Tenant).where(models.Tenant.id == domain_name)
        )
        if existing_tenant:
            raise HTTPException(
                status_code=400,
                detail=f"Tenant with domain name '{domain_name}' already exists",
            )
        
        # Create tenant in database
        tenant_id = domain_name  # Use domain_name as tenant_id
        enabled_components = {
            "maps_scraper": client_data.components.maps_scraper,
            "kpo": client_data.components.kpo,
            "email_invoices": client_data.components.email_invoices,
            "schedule": client_data.components.schedule,
            "chat_agent": client_data.components.chat_agent,
        }
        
        tenant = models.Tenant(
            id=tenant_id,
            name=client_data.company_name,
            company_name=client_data.company_name,
            enabled_components=enabled_components,
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        
        # Create user credentials in Secret Manager for simple auth
        # Store username and password for this tenant
        from google.cloud import secretmanager
        import os
        
        project_id = os.getenv("GOOGLE_PROJECT_ID")
        if project_id:
            secret_client = secretmanager.SecretManagerServiceClient()
            
            # Create username secret for this tenant
            username_secret_id = f"tenant-{tenant_id}-username"
            username_secret_name = f"projects/{project_id}/secrets/{username_secret_id}"
            try:
                secret_client.get_secret(request={"name": username_secret_name})
            except Exception:
                # Secret doesn't exist, create it
                parent = f"projects/{project_id}"
                secret_client.create_secret(
                    request={
                        "parent": parent,
                        "secret_id": username_secret_id,
                        "secret": {"replication": {"automatic": {}}},
                    }
                )
            
            # Add username version
            secret_client.add_secret_version(
                request={
                    "parent": username_secret_name,
                    "payload": {"data": client_data.username.encode("utf-8")},
                }
            )
            
            # Create password secret for this tenant
            password_secret_id = f"tenant-{tenant_id}-password"
            password_secret_name = f"projects/{project_id}/secrets/{password_secret_id}"
            try:
                secret_client.get_secret(request={"name": password_secret_name})
            except Exception:
                # Secret doesn't exist, create it
                parent = f"projects/{project_id}"
                secret_client.create_secret(
                    request={
                        "parent": parent,
                        "secret_id": password_secret_id,
                        "secret": {"replication": {"automatic": {}}},
                    }
                )
            
            # Add password version
            secret_client.add_secret_version(
                request={
                    "parent": password_secret_name,
                    "payload": {"data": client_data.password.encode("utf-8")},
                }
            )
            
            # Create email secret for this tenant (to map email to tenant_id)
            email_secret_id = f"tenant-{tenant_id}-email"
            email_secret_name = f"projects/{project_id}/secrets/{email_secret_id}"
            try:
                secret_client.get_secret(request={"name": email_secret_name})
            except Exception:
                # Secret doesn't exist, create it
                parent = f"projects/{project_id}"
                secret_client.create_secret(
                    request={
                        "parent": parent,
                        "secret_id": email_secret_id,
                        "secret": {"replication": {"automatic": {}}},
                    }
                )
            
            # Add email version
            secret_client.add_secret_version(
                request={
                    "parent": email_secret_name,
                    "payload": {"data": client_data.email.encode("utf-8")},
                }
            )
            
            logger.info(f"[ADMIN] Created credentials in Secret Manager for tenant: {tenant_id}")
        
        # Add email to ALLOWED_EMAILS (or create a mechanism to allow tenant emails)
        # For now, we'll rely on the tenant_id matching logic in authentication
        
        logger.info(f"[ADMIN] Created tenant: {tenant_id} for {client_data.company_name} with user {client_data.email}")
        
        # Get service URL (same as main service)
        import os
        project_id = os.getenv("GOOGLE_PROJECT_ID", "")
        region = os.getenv("CLOUD_RUN_REGION", "europe-central2")
        service_url = f"https://netatron-{project_id.split('-')[-1] if project_id else '925803800516'}.{region}.run.app"
        
        return ClientResponse(
            client_id=tenant_id,
            company_name=client_data.company_name,
            email=client_data.email,
            domain_name=domain_name,
            service_url=service_url,  # Same service URL for all tenants
            components=client_data.components,
            created_at=datetime.utcnow(),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ADMIN] Error creating tenant: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create tenant: {str(e)}",
        )


@app.get("/api/v1/tenant/components", response_model=TenantComponentsResponse)
def get_tenant_components(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get enabled components for the current user's tenant"""
    # Get tenant_id from request state (set by authentication_middleware)
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )
    
    # Get tenant from database
    tenant = db.get(models.Tenant, tenant_id)
    if not tenant:
        # Create default tenant if it doesn't exist
        tenant = models.Tenant(
            id=tenant_id,
            name=tenant_id,
            enabled_components={},  # Default: all disabled
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
    
    # Return enabled components (default to empty dict if None)
    enabled_components = tenant.enabled_components or {}
    
    return TenantComponentsResponse(
        tenant_id=tenant.id,
        enabled_components=enabled_components,
        company_name=tenant.company_name,
    )


@app.get("/api/v1/admin/tenants/list", response_model=List[TenantComponentsResponse])
def list_all_tenants(
    request: Request,
    db: Session = Depends(get_db),
):
    """List all tenants with their enabled components (admin only)"""
    require_admin(request)
    
    from sqlalchemy import select
    
    tenants = db.scalars(select(models.Tenant)).all()
    
    return [
        TenantComponentsResponse(
            tenant_id=tenant.id,
            enabled_components=tenant.enabled_components or {},
            company_name=tenant.company_name,
        )
        for tenant in tenants
    ]


# Enable FastAPI CORSMiddleware - it should handle OPTIONS requests correctly now
# We also have explicit OPTIONS handler as backup
logger.info(f"[CORS] Enabling FastAPI CORSMiddleware with explicit origins")
logger.info(f"[CORS] Allowed origins: {allowed_origins_list}")
logger.info(f"[CORS] Regex pattern: {cors_regex}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Serve static files from frontend (MUST be at the end, after all API routes)
# This allows frontend and backend to be served from the same origin
if frontend_dist_path.exists():
    # Mount static files (JS, CSS, images, etc.)
    app.mount("/assets", StaticFiles(directory=str(frontend_dist_path / "assets")), name="assets")
    
    # Serve index.html for all non-API routes (SPA routing)
    # This catch-all route MUST be defined last to not interfere with API routes
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str, request: Request):
        """Serve frontend SPA - all non-API routes return index.html"""
        # Don't serve frontend for API routes
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi"):
            raise HTTPException(status_code=404, detail="Not found")
        
        # Serve index.html for all other routes (SPA routing)
        index_path = frontend_dist_path / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        else:
            raise HTTPException(status_code=404, detail="Frontend not found")
    
    logger.info(f"[FRONTEND] Serving static files from: {frontend_dist_path}")
else:
    logger.warning(f"[FRONTEND] Frontend dist not found at: {frontend_dist_path} - running API-only mode")
