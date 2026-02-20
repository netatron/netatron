from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


def generate_uuid() -> str:
    return uuid.uuid4().hex


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    enabled_components: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)  # {"maps_scraper": bool, "kpo": bool, ...}
    company_name: Mapped[str | None] = mapped_column(String, nullable=True)  # Display name for the tenant

    users = relationship("User", back_populates="tenant")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("tenants.id"), nullable=False)
    google_sub: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)

    tenant = relationship("Tenant", back_populates="users")


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("tenants.id"), nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    desired_results: Mapped[int | None] = mapped_column(Integer, nullable=True)
    storage_uri: Mapped[str | None] = mapped_column(String, nullable=True)
    pause_requested: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stop_requested: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenant = relationship("Tenant")
    logs = relationship("JobLog", back_populates="job", cascade="all, delete-orphan")
    results = relationship("JobResultMetadata", back_populates="job", cascade="all, delete-orphan")
    result_rows = relationship("JobResultRow", back_populates="job", cascade="all, delete-orphan")


class JobLog(Base):
    __tablename__ = "job_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("tenants.id"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    job = relationship("Job", back_populates="logs")


class JobResultMetadata(Base, TimestampMixin):
    __tablename__ = "job_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("tenants.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    uri: Mapped[str] = mapped_column(String, nullable=False)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    job = relationship("Job", back_populates="results")


class JobResultRow(Base, TimestampMixin):
    __tablename__ = "job_result_rows"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    job = relationship("Job", back_populates="result_rows")


class EmailInvoiceConfig(Base, TimestampMixin):
    __tablename__ = "email_invoice_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    imap_host: Mapped[str] = mapped_column(String, nullable=False)
    imap_port: Mapped[int] = mapped_column(Integer, nullable=False, default=993)
    imap_user: Mapped[str] = mapped_column(String, nullable=False)
    imap_password: Mapped[str] = mapped_column(String, nullable=False)  # Should be encrypted in production
    imap_folder: Mapped[str] = mapped_column(String, default="INBOX", nullable=False)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    last_check_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_processed_email_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Date of last processed email
    monitoring_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    total_processed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    tenant = relationship("Tenant")
    runs = relationship("EmailInvoiceRun", back_populates="config", cascade="all, delete-orphan")
    pdf_hashes = relationship("EmailInvoicePdfHash", back_populates="config", cascade="all, delete-orphan")


class EmailInvoiceRun(Base, TimestampMixin):
    __tablename__ = "email_invoice_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    config_id: Mapped[str] = mapped_column(String, ForeignKey("email_invoice_configs.id"), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # pending, running, completed, failed
    processed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    pause_requested: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stop_requested: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    config = relationship("EmailInvoiceConfig", back_populates="runs")
    logs = relationship("EmailInvoiceLog", back_populates="run", cascade="all, delete-orphan")


class EmailInvoiceLog(Base):
    __tablename__ = "email_invoice_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    run_id: Mapped[str] = mapped_column(String, ForeignKey("email_invoice_runs.id"), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(String, default="info", nullable=False)  # info, warning, error
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    run = relationship("EmailInvoiceRun", back_populates="logs")


class EmailInvoicePdfHash(Base, TimestampMixin):
    """Tracks processed PDF hashes to detect duplicates"""
    __tablename__ = "email_invoice_pdf_hashes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    config_id: Mapped[str] = mapped_column(String, ForeignKey("email_invoice_configs.id"), nullable=False, index=True)
    pdf_hash: Mapped[str] = mapped_column(String, nullable=False, index=True)  # SHA256 hash of PDF content
    filename: Mapped[str | None] = mapped_column(String, nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String, nullable=True)
    invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    vendor: Mapped[str | None] = mapped_column(String, nullable=True)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    storage_path: Mapped[str] = mapped_column(String, nullable=False)  # Path where PDF is stored

    tenant = relationship("Tenant")
    config = relationship("EmailInvoiceConfig", back_populates="pdf_hashes")

    __table_args__ = (
        UniqueConstraint("config_id", "pdf_hash", name="uq_config_pdf_hash"),
    )


class TenantUsageStats(Base, TimestampMixin):
    """Track API usage and costs per tenant per day"""
    __tablename__ = "tenant_usage_stats"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("tenants.id"), nullable=False, index=True)
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)  # Date (start of day)
    
    # OpenAI usage
    openai_input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    openai_output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    openai_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    openai_cost: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    
    # Google Maps usage
    google_maps_queries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    google_maps_cost: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    
    # Other usage
    web_scraping_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rejestr_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # Module-specific tracking (JSON: {"module_name": {"tokens": int, "cost": float}})
    module_usage: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    
    tenant = relationship("Tenant")