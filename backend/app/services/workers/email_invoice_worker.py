"""
Email Invoice Worker - processes email invoice jobs
"""
from __future__ import annotations

from app.repos.email_invoice_repository import EmailInvoiceRepository
from app.services.email_invoices.orchestrator import EmailInvoiceOrchestrator
from app.services.storage import StorageClient
from app.services.email_invoices.storage import EmailInvoiceStorage
from app.config import EMAIL_INVOICES_STORAGE_DIR, GCS_RESULTS_BUCKET


def run_email_invoice_job(
    repo: EmailInvoiceRepository,
    run_id: str,
    storage: StorageClient,
) -> None:
    """
    Process an email invoice run

    Args:
        repo: EmailInvoiceRepository instance
        run_id: EmailInvoiceRun ID
        storage: StorageClient instance (not used for email invoices, but kept for consistency)
    """
    run = repo.get_run(run_id)
    if not run:
        return

    config = repo.get_config(run.config_id, run.tenant_id)
    if not config:
        repo.update_run_status(run, "failed", error="Config not found")
        return

    if not config.enabled:
        repo.update_run_status(run, "failed", error="Config is disabled")
        return

    # Create storage with GCS support if bucket is configured
    storage = EmailInvoiceStorage(EMAIL_INVOICES_STORAGE_DIR, bucket_name=GCS_RESULTS_BUCKET)
    orchestrator = EmailInvoiceOrchestrator(repo, storage=storage)
    try:
        orchestrator.process_config(config, run)
    except Exception as e:
        repo.update_run_status(run, "failed", error=str(e))
        raise

