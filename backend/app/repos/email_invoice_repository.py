from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models


class EmailInvoiceRepository:
    def __init__(self, db: Session):
        self.db = db

    # Config methods
    def create_config(
        self,
        *,
        tenant_id: str,
        name: str,
        imap_host: str,
        imap_port: int,
        imap_user: str,
        imap_password: str,
        imap_folder: str,
        settings: dict,
        enabled: bool = True,
    ) -> models.EmailInvoiceConfig:
        config = models.EmailInvoiceConfig(
            tenant_id=tenant_id,
            name=name,
            enabled=enabled,
            imap_host=imap_host,
            imap_port=imap_port,
            imap_user=imap_user,
            imap_password=imap_password,
            imap_folder=imap_folder,
            settings=settings or {},
        )
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return config

    def get_config(self, config_id: str, tenant_id: str) -> Optional[models.EmailInvoiceConfig]:
        stmt = (
            select(models.EmailInvoiceConfig)
            .where(models.EmailInvoiceConfig.id == config_id)
            .where(models.EmailInvoiceConfig.tenant_id == tenant_id)
        )
        return self.db.scalar(stmt)

    def list_configs(self, tenant_id: str) -> List[models.EmailInvoiceConfig]:
        stmt = (
            select(models.EmailInvoiceConfig)
            .where(models.EmailInvoiceConfig.tenant_id == tenant_id)
            .order_by(models.EmailInvoiceConfig.created_at.desc())
        )
        return list(self.db.scalars(stmt))

    def update_config(
        self,
        config: models.EmailInvoiceConfig,
        **kwargs,
    ) -> models.EmailInvoiceConfig:
        for key, value in kwargs.items():
            if hasattr(config, key):
                setattr(config, key, value)
        self.db.commit()
        self.db.refresh(config)
        return config

    def update_last_processed_email_date(
        self,
        config: models.EmailInvoiceConfig,
        email_date: datetime,
    ) -> models.EmailInvoiceConfig:
        """Update the last processed email date for a config"""
        config.last_processed_email_date = email_date
        self.db.commit()
        self.db.refresh(config)
        return config

    def delete_config(self, config: models.EmailInvoiceConfig) -> None:
        self.db.delete(config)
        self.db.commit()

    def get_enabled_configs(self, tenant_id: Optional[str] = None) -> List[models.EmailInvoiceConfig]:
        stmt = select(models.EmailInvoiceConfig).where(models.EmailInvoiceConfig.enabled == True)
        if tenant_id:
            stmt = stmt.where(models.EmailInvoiceConfig.tenant_id == tenant_id)
        return list(self.db.scalars(stmt))

    # Run methods
    def create_run(
        self,
        *,
        config_id: str,
        tenant_id: str,
        status: str = "pending",
    ) -> models.EmailInvoiceRun:
        run = models.EmailInvoiceRun(
            config_id=config_id,
            tenant_id=tenant_id,
            status=status,
            processed_count=0,
            total_count=0,
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def get_run(self, run_id: str, tenant_id: Optional[str] = None) -> Optional[models.EmailInvoiceRun]:
        stmt = select(models.EmailInvoiceRun).where(models.EmailInvoiceRun.id == run_id)
        if tenant_id:
            stmt = stmt.where(models.EmailInvoiceRun.tenant_id == tenant_id)
        return self.db.scalar(stmt)

    def list_runs(
        self,
        tenant_id: str,
        config_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[models.EmailInvoiceRun]:
        stmt = (
            select(models.EmailInvoiceRun)
            .where(models.EmailInvoiceRun.tenant_id == tenant_id)
            .order_by(models.EmailInvoiceRun.created_at.desc())
            .limit(limit)
        )
        if config_id:
            stmt = stmt.where(models.EmailInvoiceRun.config_id == config_id)
        return list(self.db.scalars(stmt))

    def update_run_status(
        self,
        run: models.EmailInvoiceRun,
        status: str,
        error: Optional[str] = None,
    ) -> models.EmailInvoiceRun:
        run.status = status
        if error:
            run.error = error
        if status == "running" and not run.started_at:
            run.started_at = datetime.utcnow()
        if status in ("completed", "failed"):
            run.completed_at = datetime.utcnow()
        self.db.commit()
        # Don't refresh - it can cause issues if run is from different session
        # self.db.refresh(run)
        return run

    def update_run_progress(
        self,
        run: models.EmailInvoiceRun,
        processed_count: int,
        total_count: int,
    ) -> models.EmailInvoiceRun:
        run.processed_count = processed_count
        run.total_count = total_count
        self.db.commit()
        # Don't refresh - it can cause issues if run is from different session
        # self.db.refresh(run)
        return run

    # Log methods
    def add_log(
        self,
        *,
        run: models.EmailInvoiceRun,
        message: str,
        level: str = "info",
    ) -> models.EmailInvoiceLog:
        log = models.EmailInvoiceLog(
            run_id=run.id,
            message=message,
            level=level,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def get_run_logs(self, run_id: str, since: Optional[datetime] = None) -> List[models.EmailInvoiceLog]:
        """
        Get logs for a run, optionally filtered by timestamp.
        
        Args:
            run_id: The run ID
            since: Optional datetime to filter logs created after this time
            
        Returns:
            List of log entries ordered by creation time
        """
        stmt = (
            select(models.EmailInvoiceLog)
            .where(models.EmailInvoiceLog.run_id == run_id)
        )
        if since:
            stmt = stmt.where(models.EmailInvoiceLog.created_at > since)
        stmt = stmt.order_by(models.EmailInvoiceLog.created_at.asc())
        return list(self.db.scalars(stmt))

    def request_pause(self, run: models.EmailInvoiceRun) -> models.EmailInvoiceRun:
        """Request pause for a running email invoice run"""
        run.pause_requested = True
        run.status = "pausing"
        self.db.commit()
        return run

    def request_resume(self, run: models.EmailInvoiceRun) -> models.EmailInvoiceRun:
        """Request resume for a paused email invoice run"""
        run.pause_requested = False
        run.status = "running"
        self.db.commit()
        return run

    def request_stop(self, run: models.EmailInvoiceRun) -> models.EmailInvoiceRun:
        """Request stop for a running email invoice run"""
        run.stop_requested = True
        run.status = "stopping"
        self.db.commit()
        return run

    def check_control_flags(self, run: models.EmailInvoiceRun) -> tuple[bool, bool]:
        """Check pause and stop flags. Returns (is_paused, is_stopped)"""
        # Refresh from database to get latest flags
        self.db.refresh(run)
        return run.pause_requested, run.stop_requested

    # PDF Hash methods for duplicate detection
    def check_pdf_hash_exists(self, config_id: str, pdf_hash: str) -> Optional[models.EmailInvoicePdfHash]:
        """Check if a PDF hash already exists for this config (duplicate detection)"""
        stmt = (
            select(models.EmailInvoicePdfHash)
            .where(models.EmailInvoicePdfHash.config_id == config_id)
            .where(models.EmailInvoicePdfHash.pdf_hash == pdf_hash)
        )
        return self.db.scalar(stmt)

    def save_pdf_hash(
        self,
        *,
        tenant_id: str,
        config_id: str,
        pdf_hash: str,
        filename: str,
        storage_path: str,
        invoice_number: Optional[str] = None,
        invoice_date: Optional[date] = None,
        vendor: Optional[str] = None,
        amount: Optional[float] = None,
    ) -> models.EmailInvoicePdfHash:
        """Save a PDF hash record to track processed invoices"""
        pdf_hash_record = models.EmailInvoicePdfHash(
            tenant_id=tenant_id,
            config_id=config_id,
            pdf_hash=pdf_hash,
            filename=filename,
            storage_path=storage_path,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            vendor=vendor,
            amount=amount,
        )
        self.db.add(pdf_hash_record)
        self.db.commit()
        self.db.refresh(pdf_hash_record)
        return pdf_hash_record

    def increment_processed_count(self, config: models.EmailInvoiceConfig) -> models.EmailInvoiceConfig:
        """Increment the total processed count for a config"""
        config.total_processed_count += 1
        self.db.commit()
        self.db.refresh(config)
        return config

