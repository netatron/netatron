"""
Email Invoice Orchestrator - coordinates email fetching, PDF processing, and data extraction
"""
from __future__ import annotations

import email
import imaplib
import io
import logging
import os
import re
from pathlib import Path
import time
from datetime import datetime
from email.header import decode_header
from typing import Dict, List, Optional

from app.repos.email_invoice_repository import EmailInvoiceRepository
from app.services.email_invoices.processor import EmailInvoiceProcessor
from app.services.email_invoices.storage import EmailInvoiceStorage

logger = logging.getLogger(__name__)


class EmailInvoiceOrchestrator:
    """Orchestrates the email invoice processing workflow"""

    def __init__(self, repo: EmailInvoiceRepository, storage: EmailInvoiceStorage = None):
        self.repo = repo
        self.processor = EmailInvoiceProcessor()
        if storage:
            self.storage = storage
        else:
            # Fallback: create storage from env (for backward compatibility)
            base_dir = Path(os.getenv("EMAIL_INVOICES_STORAGE_DIR", "data/email_invoices"))
            bucket_name = os.getenv("GCS_RESULTS_BUCKET")
            self.storage = EmailInvoiceStorage(base_dir, bucket_name=bucket_name)

    def _check_and_handle_control_flags(self, run) -> bool:
        """
        Check pause/stop flags and handle accordingly.
        Returns True if processing should continue, False if stopped.
        """
        pause_requested, stop_requested = self.repo.check_control_flags(run)
        
        if stop_requested:
            logger.info(f"Stop requested for run {run.id}")
            self.repo.add_log(run=run, message="⏹️ Otrzymano żądanie zatrzymania. Przerwanie przetwarzania...", level="warning")
            self.repo.update_run_status(run, "stopped")
            return False
        
        if pause_requested:
            logger.info(f"Pause requested for run {run.id}")
            self.repo.add_log(run=run, message="⏸️ Otrzymano żądanie pauzy. Wstrzymywanie przetwarzania...", level="warning")
            self.repo.update_run_status(run, "paused")
            
            # Wait until resume is requested
            while pause_requested and not stop_requested:
                time.sleep(0.5)  # Check every 500ms
                pause_requested, stop_requested = self.repo.check_control_flags(run)
                
                if stop_requested:
                    logger.info(f"Stop requested while paused for run {run.id}")
                    self.repo.add_log(run=run, message="⏹️ Otrzymano żądanie zatrzymania podczas pauzy. Przerwanie przetwarzania...", level="warning")
                    self.repo.update_run_status(run, "stopped")
                    return False
            
            # Resume
            logger.info(f"Resume requested for run {run.id}")
            self.repo.add_log(run=run, message="▶️ Wznowiono przetwarzanie. Kontynuowanie...", level="info")
            self.repo.update_run_status(run, "running")
        
        return True

    def process_config(
        self,
        config,
        run,
        max_emails: int = 50,
        process_all: bool = False,
        process_from_last: bool = False,
    ) -> Dict[str, int]:
        """
        Process emails for a given config

        Args:
            config: EmailInvoiceConfig instance
            run: EmailInvoiceRun instance
            max_emails: Maximum number of emails to process per batch
            process_all: If True, process all emails (not just UNSEEN)
            process_from_last: If True, start from last processed email date

        Returns:
            Dictionary with processing statistics
        """
        try:
            self.repo.update_run_status(run, "running")
            mode_text = "wszystkich emaili" if process_all else "nieprzeczytanych emaili"
            logger.info(f"[EmailInvoice] Starting processing for config {config.id}, run {run.id}, mode: {mode_text}")
            self.repo.add_log(run=run, message=f"🚀 Rozpoczęto przetwarzanie {mode_text} dla konfiguracji: {config.name}")

            # Check control flags before starting
            if not self._check_and_handle_control_flags(run):
                return {"processed": 0, "errors": 0, "total": 0}

            # Connect to IMAP
            logger.info(f"[EmailInvoice] Connecting to IMAP server {config.imap_host}:{config.imap_port}")
            self.repo.add_log(run=run, message=f"🔌 Łączenie z serwerem IMAP: {config.imap_host}:{config.imap_port}")
            mail = imaplib.IMAP4_SSL(config.imap_host, config.imap_port)
            logger.info(f"[EmailInvoice] Logging in as {config.imap_user}")
            self.repo.add_log(run=run, message=f"🔐 Logowanie jako: {config.imap_user}")
            mail.login(config.imap_user, config.imap_password)
            logger.info(f"[EmailInvoice] Selecting folder: {config.imap_folder}")
            self.repo.add_log(run=run, message=f"📁 Wybór folderu: {config.imap_folder}")
            mail.select(config.imap_folder)

            # Search for emails (all or unread, optionally from last processed date)
            if process_from_last and config.last_processed_email_date:
                # Search for emails since last processed date
                from email.utils import parsedate_to_datetime
                last_date_str = config.last_processed_email_date.strftime("%d-%b-%Y")
                search_criteria = f'(SINCE "{last_date_str}")'
                logger.info(f"[EmailInvoice] Searching for emails since last processed date: {config.last_processed_email_date}")
                self.repo.add_log(run=run, message=f"🔍 Wyszukiwanie emaili od ostatniego przetworzenia: {config.last_processed_email_date.strftime('%Y-%m-%d')}")
            else:
                search_criteria = "ALL" if process_all else "UNSEEN"
                logger.info(f"[EmailInvoice] Searching for emails with criteria: {search_criteria}")
                self.repo.add_log(run=run, message=f"🔍 Wyszukiwanie emaili (kryterium: {search_criteria})")
            
            status, messages = mail.search(None, search_criteria)
            if status != "OK":
                error_msg = f"Błąd wyszukiwania emaili: {status}"
                logger.error(f"[EmailInvoice] {error_msg}")
                raise Exception(error_msg)

            email_ids = messages[0].split() if messages[0] else []
            total_emails = len(email_ids) if process_all else min(len(email_ids), max_emails)
            logger.info(f"[EmailInvoice] Found {len(email_ids)} emails, processing {total_emails}")
            self.repo.update_run_progress(run, 0, total_emails)
            self.repo.add_log(run=run, message=f"📊 Znaleziono {len(email_ids)} emaili (przetwarzanie {total_emails})")

            processed_count = 0
            error_count = 0
            skipped_count = 0
            last_email_date = None  # Track the date of the last processed email

            emails_to_process = email_ids if process_all else email_ids[:max_emails]
            for i, email_id in enumerate(emails_to_process):
                # Check control flags before processing each email
                if not self._check_and_handle_control_flags(run):
                    logger.info(f"[EmailInvoice] Processing stopped at email {i+1}/{total_emails}")
                    skipped_count = total_emails - i
                    break
                
                try:
                    logger.info(f"[EmailInvoice] Processing email {i+1}/{total_emails} (ID: {email_id.decode() if isinstance(email_id, bytes) else email_id})")
                    self.repo.add_log(run=run, message=f"📧 Przetwarzanie emaila {i+1}/{total_emails} (ID: {email_id.decode() if isinstance(email_id, bytes) else email_id})")
                    result = self._process_email(mail, email_id, config, run)
                    # result is a tuple (success: bool, email_date: datetime | None)
                    if isinstance(result, tuple) and len(result) == 2:
                        success, email_date = result
                        if success:
                            processed_count += 1
                            if email_date and (not last_email_date or email_date > last_email_date):
                                last_email_date = email_date
                            logger.info(f"[EmailInvoice] Successfully processed email {i+1}/{total_emails}")
                        else:
                            error_count += 1
                            logger.warning(f"[EmailInvoice] Failed to process email {i+1}/{total_emails}")
                    else:
                        # Fallback for old return format
                        if result:
                            processed_count += 1
                            logger.info(f"[EmailInvoice] Successfully processed email {i+1}/{total_emails}")
                        else:
                            error_count += 1
                            logger.warning(f"[EmailInvoice] Failed to process email {i+1}/{total_emails}")
                except Exception as e:
                    logger.error(f"[EmailInvoice] Error processing email {email_id}: {e}", exc_info=True)
                    self.repo.add_log(run=run, message=f"❌ Błąd przetwarzania emaila {i+1}/{total_emails}: {str(e)}", level="error")
                    error_count += 1

                self.repo.update_run_progress(run, i + 1, total_emails)

            logger.info(f"[EmailInvoice] Closing IMAP connection")
            self.repo.add_log(run=run, message=f"🔌 Zamykanie połączenia IMAP")
            mail.close()
            mail.logout()

            # Check if stopped before marking as completed
            pause_requested, stop_requested = self.repo.check_control_flags(run)
            if stop_requested:
                logger.info(f"[EmailInvoice] Run {run.id} was stopped, not marking as completed")
                return {
                    "processed": processed_count,
                    "errors": error_count,
                    "total": total_emails,
                }

            final_status = "completed"
            if skipped_count > 0:
                final_status = "stopped"
                logger.info(f"[EmailInvoice] Run {run.id} completed with {skipped_count} emails skipped")
            
            self.repo.update_run_status(run, final_status)
            
            # Update last processed email date if we processed any emails
            if last_email_date and processed_count > 0:
                self.repo.update_last_processed_email_date(config, last_email_date)
                logger.info(f"[EmailInvoice] Updated last processed email date to: {last_email_date}")
                self.repo.add_log(run=run, message=f"📅 Zaktualizowano datę ostatniego przetworzonego emaila: {last_email_date.strftime('%Y-%m-%d %H:%M:%S')}")
            
            summary_msg = f"✅ Zakończono przetwarzanie. Przetworzono: {processed_count}, Błędy: {error_count}"
            if skipped_count > 0:
                summary_msg += f", Pominięto: {skipped_count}"
            logger.info(f"[EmailInvoice] {summary_msg}")
            self.repo.add_log(run=run, message=summary_msg)

            return {
                "processed": processed_count,
                "errors": error_count,
                "total": total_emails,
            }

        except Exception as e:
            logger.error(f"Error in process_config: {e}", exc_info=True)
            self.repo.update_run_status(run, "failed", error=str(e))
            self.repo.add_log(run=run, message=f"Błąd krytyczny: {str(e)}", level="error")
            raise

    def start_continuous_monitoring(
        self,
        config,
        run,
        check_interval: int = 300,  # 5 minutes default
    ):
        """
        Start continuous monitoring of email inbox for new invoices
        
        Args:
            config: EmailInvoiceConfig instance
            run: EmailInvoiceRun instance
            check_interval: Interval in seconds between checks
        """
        import time
        
        try:
            self.repo.update_run_status(run, "running")
            logger.info(f"[EmailInvoice] Starting continuous monitoring for config {config.id}, run {run.id}")
            self.repo.add_log(run=run, message=f"🔄 Rozpoczęto ciągłe nasłuchiwanie skrzynki dla konfiguracji: {config.name}")
            self.repo.add_log(run=run, message=f"⏰ Sprawdzanie co {check_interval} sekund ({check_interval // 60} minut)")

            iteration = 0
            while True:
                # Check control flags before each iteration
                if not self._check_and_handle_control_flags(run):
                    logger.info(f"[EmailInvoice] Continuous monitoring stopped for run {run.id}")
                    break
                
                iteration += 1
                logger.info(f"[EmailInvoice] Continuous monitoring iteration {iteration}")
                self.repo.add_log(run=run, message=f"--- 🔄 Iteracja {iteration}: Sprawdzanie nowych emaili ---")
                
                try:
                    # Process new emails without changing run status to completed
                    processed_count = self._process_new_emails(config, run, max_emails=50)
                    if processed_count > 0:
                        logger.info(f"[EmailInvoice] Processed {processed_count} new invoices in iteration {iteration}")
                        self.repo.add_log(run=run, message=f"✅ Przetworzono {processed_count} nowych faktur w tej iteracji")
                    else:
                        logger.debug(f"[EmailInvoice] No new emails in iteration {iteration}")
                        self.repo.add_log(run=run, message="ℹ️ Brak nowych emaili do przetworzenia")
                except Exception as e:
                    logger.error(f"[EmailInvoice] Error in continuous monitoring iteration {iteration}: {e}", exc_info=True)
                    self.repo.add_log(run=run, message=f"❌ Błąd w iteracji {iteration}: {str(e)}", level="error")
                
                # Wait before next check, but check control flags during wait
                wait_interval = 1.0  # Check every second
                waited = 0
                while waited < check_interval:
                    if not self._check_and_handle_control_flags(run):
                        logger.info(f"[EmailInvoice] Continuous monitoring stopped during wait for run {run.id}")
                        break
                    time.sleep(wait_interval)
                    waited += wait_interval
                
                if not self._check_and_handle_control_flags(run):
                    break
                
        except KeyboardInterrupt:
            self.repo.update_run_status(run, "stopped")
            self.repo.update_config(config, monitoring_enabled=False)
            self.repo.add_log(run=run, message="Zatrzymano ciągłe nasłuchiwanie")
        except Exception as e:
            logger.error(f"Error in continuous monitoring: {e}", exc_info=True)
            self.repo.update_run_status(run, "failed", error=str(e))
            self.repo.update_config(config, monitoring_enabled=False)
            self.repo.add_log(run=run, message=f"Błąd krytyczny: {str(e)}", level="error")
            raise

    def _process_new_emails(
        self,
        config,
        run,
        max_emails: int = 50,
    ) -> int:
        """
        Process new unread emails without completing the run (for continuous monitoring)
        
        Returns:
            Number of successfully processed emails
        """
        try:
            # Check control flags before connecting
            if not self._check_and_handle_control_flags(run):
                return 0
            
            # Connect to IMAP
            logger.debug(f"[EmailInvoice] Connecting to IMAP for new emails check")
            mail = imaplib.IMAP4_SSL(config.imap_host, config.imap_port)
            mail.login(config.imap_user, config.imap_password)
            mail.select(config.imap_folder)

            # Search for unread emails
            logger.debug(f"[EmailInvoice] Searching for UNSEEN emails")
            status, messages = mail.search(None, "UNSEEN")
            if status != "OK":
                error_msg = f"Błąd wyszukiwania emaili: {status}"
                logger.error(f"[EmailInvoice] {error_msg}")
                raise Exception(error_msg)

            email_ids = messages[0].split() if messages[0] else []
            total_emails = min(len(email_ids), max_emails)
            
            logger.info(f"[EmailInvoice] Found {len(email_ids)} unread emails, processing {total_emails}")
            if total_emails == 0:
                logger.debug(f"[EmailInvoice] No unread emails to process")
                mail.close()
                mail.logout()
                return 0

            self.repo.add_log(run=run, message=f"📊 Znaleziono {total_emails} nieprzeczytanych emaili")

            processed_count = 0

            for i, email_id in enumerate(email_ids[:max_emails]):
                # Check control flags before processing each email
                if not self._check_and_handle_control_flags(run):
                    logger.info(f"[EmailInvoice] Processing stopped at email {i+1}/{total_emails}")
                    break
                
                try:
                    logger.debug(f"[EmailInvoice] Processing new email {i+1}/{total_emails}")
                    self.repo.add_log(run=run, message=f"📧 Przetwarzanie emaila {i+1}/{total_emails}")
                    result = self._process_email(mail, email_id, config, run)
                    if result:
                        processed_count += 1
                        logger.debug(f"[EmailInvoice] Successfully processed new email {i+1}/{total_emails}")
                    else:
                        logger.warning(f"[EmailInvoice] Failed to process new email {i+1}/{total_emails}")
                except Exception as e:
                    logger.error(f"[EmailInvoice] Error processing email {email_id}: {e}", exc_info=True)
                    self.repo.add_log(run=run, message=f"❌ Błąd przetwarzania emaila {i+1}/{total_emails}: {str(e)}", level="error")

            logger.debug(f"[EmailInvoice] Closing IMAP connection after new emails check")
            mail.close()
            mail.logout()

            return processed_count

        except Exception as e:
            logger.error(f"Error in _process_new_emails: {e}", exc_info=True)
            self.repo.add_log(run=run, message=f"Błąd przetwarzania nowych emaili: {str(e)}", level="error")
            return 0

    def _process_email(
        self,
        mail: imaplib.IMAP4_SSL,
        email_id: bytes,
        config,
        run,
    ) -> tuple[bool, datetime | None]:
        """
        Process a single email and extract invoice data

        Returns:
            Tuple of (success: bool, email_date: datetime | None)
        """
        email_date = None
        try:
            # Fetch email
            logger.debug(f"[EmailInvoice] Fetching email {email_id}")
            status, msg_data = mail.fetch(email_id, "(RFC822)")
            if status != "OK":
                logger.warning(f"[EmailInvoice] Failed to fetch email {email_id}: {status}")
                self.repo.add_log(run=run, message=f"⚠️ Nie udało się pobrać emaila: {status}", level="warning")
                return (False, None)

            email_body = msg_data[0][1]
            msg = email.message_from_bytes(email_body)
            
            # Extract email date
            from email.utils import parsedate_to_datetime
            date_str = msg.get("Date")
            if date_str:
                try:
                    email_date = parsedate_to_datetime(date_str)
                except Exception as e:
                    logger.warning(f"[EmailInvoice] Failed to parse email date: {e}")
                    email_date = datetime.now()
            else:
                email_date = datetime.now()
            
            # Extract email subject and sender
            subject = decode_header(msg["Subject"])[0][0]
            if isinstance(subject, bytes):
                subject = subject.decode()
            sender = msg.get("From", "Unknown")
            logger.info(f"[EmailInvoice] Processing email: Subject='{subject}', From='{sender}', Date='{email_date}'")
            self.repo.add_log(run=run, message=f"📨 Email: '{subject}' od {sender}")

            # Extract email body text
            email_body_text = self._extract_email_body(msg)
            
            # Extract attachment names first (without downloading)
            attachment_names = self._get_attachment_names(msg)
            pdf_attachment_names = [name for name, content_type in attachment_names if content_type == "application/pdf"]
            
            logger.info(f"[EmailInvoice] Found {len(pdf_attachment_names)} PDF attachments: {pdf_attachment_names}")
            
            if not pdf_attachment_names:
                logger.warning(f"[EmailInvoice] Email does not contain PDF attachments")
                self.repo.add_log(run=run, message="⚠️ Email nie zawiera załączników PDF", level="warning")
                return (False, email_date)

            # Filter email using AI - check if it contains invoices/statements before processing
            logger.debug(f"[EmailInvoice] Filtering email to check if it contains invoices/statements")
            self.repo.add_log(run=run, message="🔍 Sprawdzanie czy email zawiera faktury/wyciągi...")
            should_process, reason = self.processor.should_process_email(
                subject=subject,
                sender=sender,
                body=email_body_text,
                attachment_names=pdf_attachment_names,
            )
            
            if not should_process:
                logger.info(f"[EmailInvoice] Email rejected by filter: {reason}")
                self.repo.add_log(run=run, message=f"🚫 Email pominięty (nie zawiera faktur/wyciągów): {reason}", level="info")
                return (False, email_date)
            
            logger.info(f"[EmailInvoice] Email accepted by filter: {reason}")
            self.repo.add_log(run=run, message=f"✅ Email zaakceptowany: {reason}")

            # Extract attachments (now we know it's worth processing)
            logger.debug(f"[EmailInvoice] Extracting attachments from email")
            attachments = self._extract_attachments(msg)
            logger.info(f"[EmailInvoice] Found {len(attachments)} attachments")
            self.repo.add_log(run=run, message=f"📎 Znaleziono {len(attachments)} załączników")
            
            pdf_attachments = [att for att in attachments if att.get("content_type") == "application/pdf"]
            logger.info(f"[EmailInvoice] Found {len(pdf_attachments)} PDF attachments")

            # Process each PDF attachment
            for idx, attachment in enumerate(pdf_attachments):
                try:
                    logger.info(f"[EmailInvoice] Processing PDF attachment {idx+1}/{len(pdf_attachments)}: {attachment['filename']}")
                    self.repo.add_log(run=run, message=f"📄 Przetwarzanie załącznika PDF {idx+1}/{len(pdf_attachments)}: {attachment['filename']}")
                    
                    # Check for duplicate PDF (hash-based duplicate detection)
                    pdf_hash = self.storage.hash_pdf(attachment["data"])
                    existing_hash = self.repo.check_pdf_hash_exists(config.id, pdf_hash)
                    if existing_hash:
                        logger.info(f"[EmailInvoice] PDF duplicate detected (hash: {pdf_hash[:16]}...), skipping: {attachment['filename']}")
                        self.repo.add_log(
                            run=run,
                            message=f"⏭️ Duplikat wykryty - faktura już przetworzona: {attachment['filename']} (zapisaną wcześniej jako: {existing_hash.filename})",
                            level="info"
                        )
                        continue
                    
                    # Extract text from PDF
                    logger.debug(f"[EmailInvoice] Extracting text from PDF: {attachment['filename']}")
                    pdf_text = self._extract_pdf_text(attachment["data"])
                    if not pdf_text:
                        logger.warning(f"[EmailInvoice] No text extracted from PDF: {attachment['filename']}")
                        self.repo.add_log(run=run, message=f"⚠️ Nie udało się wyodrębnić tekstu z PDF: {attachment['filename']}", level="warning")
                        continue
                    
                    logger.info(f"[EmailInvoice] Extracted {len(pdf_text)} characters from PDF: {attachment['filename']}")
                    self.repo.add_log(run=run, message=f"📝 Wyodrębniono {len(pdf_text)} znaków z PDF")

                    # Process invoice
                    logger.debug(f"[EmailInvoice] Extracting invoice data using AI")
                    self.repo.add_log(run=run, message=f"🤖 Wyodrębnianie danych faktury przy użyciu AI...")
                    base_run_dir = self.storage.run_dir(config.tenant_id, config.id, run.id)

                    invoice_data = self.processor.extract_invoice_data(
                        pdf_text=pdf_text,
                        file_name=attachment["filename"],
                    )
                    logger.info(f"[EmailInvoice] Extracted invoice data: {invoice_data.get('Numer', 'brak numeru')}")

                    # Parse date and category
                    logger.debug(f"[EmailInvoice] Parsing date and category")
                    enhanced_data = self.processor.parse_date_and_category(
                        invoice_data=invoice_data,
                        file_name=attachment["filename"],
                        pdf_text=pdf_text,
                    )
                    logger.info(f"[EmailInvoice] Enhanced data: Type={enhanced_data.get('Typ')}, Date={enhanced_data.get('Data')}, Number={enhanced_data.get('Numer')}")

                    # Map category to folder name (matching workflow JSON logic)
                    category_type = enhanced_data.get('Typ', '').lower()
                    if category_type == 'koszty':
                        category_folder = 'koszty'
                    elif category_type == 'sprzedaż':
                        category_folder = 'sprzedaż'
                    elif category_type == 'wyciąg':
                        category_folder = 'wyciąg'
                    else:
                        # Default to 'koszty' if unknown
                        category_folder = 'koszty'
                        logger.warning(f"[EmailInvoice] Unknown category type '{category_type}', defaulting to 'koszty'")

                    # Create folder structure: run_dir / MM.RRRR / category / file.pdf
                    month_folder_name = enhanced_data.get('monthFolderName', f"{datetime.now().strftime('%m')}.{datetime.now().year}")
                    target_dir = base_run_dir / month_folder_name / category_folder
                    target_dir.mkdir(parents=True, exist_ok=True)
                    logger.info(f"[EmailInvoice] Created folder structure: {target_dir}")
                    logger.info(f"[EmailInvoice] Month folder: {month_folder_name}, Category: {category_folder}, Target dir: {target_dir}")

                    self.repo.add_log(
                        run=run,
                        message=(
                            "✅ Wyodrębniono dane z faktury: "
                            f"Numer={enhanced_data.get('Numer', 'brak')}, "
                            f"Typ={enhanced_data.get('Typ', 'brak')}, "
                            f"Data={enhanced_data.get('Data', 'brak')}, "
                            f"Brutto={enhanced_data.get('Brutto', 'brak')}, "
                            f"Folder={month_folder_name}/{category_folder}"
                        ),
                    )

                    # Save PDF in category folder
                    pdf_path = self.storage.save_pdf(target_dir, attachment["filename"], attachment["data"])
                    enhanced_data["Plik"] = str(Path(month_folder_name) / category_folder / pdf_path.name)
                    
                    # Prepare CSV record - only include invoice fields, exclude helper fields
                    csv_record = {
                        "Typ": enhanced_data.get("Typ", ""),
                        "Data": enhanced_data.get("Data", ""),
                        "Numer": enhanced_data.get("Numer", ""),
                        "Nabywca/Nadawca": enhanced_data.get("Nabywca/Nadawca", ""),
                        "NIP": enhanced_data.get("NIP", ""),
                        "Netto": enhanced_data.get("Netto", ""),
                        "VAT": enhanced_data.get("VAT", ""),
                        "Brutto": enhanced_data.get("Brutto", ""),
                        "Plik": enhanced_data["Plik"],
                    }
                    
                    # CSV is stored at run level (main records.csv)
                    self.storage.append_record(base_run_dir, csv_record)
                    
                    # Also store CSV per month folder (MM.RRRR/records.csv)
                    month_dir = base_run_dir / month_folder_name
                    month_dir.mkdir(parents=True, exist_ok=True)
                    self.storage.append_record(month_dir, csv_record)
                    
                    # Parse invoice date for hash record
                    invoice_date_parsed = None
                    invoice_date_str = enhanced_data.get("Data", "")
                    if invoice_date_str:
                        try:
                            from datetime import datetime as dt
                            invoice_date_parsed = dt.strptime(invoice_date_str, "%Y-%m-%d").date()
                        except (ValueError, AttributeError):
                            pass
                    
                    # Parse amount for hash record
                    amount_parsed = None
                    amount_str = enhanced_data.get("Brutto", "")
                    if amount_str:
                        try:
                            # Remove spaces and replace comma with dot
                            amount_cleaned = amount_str.replace(" ", "").replace(",", ".")
                            amount_parsed = float(amount_cleaned)
                        except (ValueError, AttributeError):
                            pass
                    
                    # Save PDF hash to prevent duplicates in future runs
                    storage_path = str(Path(month_folder_name) / category_folder / pdf_path.name)
                    self.repo.save_pdf_hash(
                        tenant_id=config.tenant_id,
                        config_id=config.id,
                        pdf_hash=pdf_hash,
                        filename=attachment["filename"],
                        storage_path=storage_path,
                        invoice_number=enhanced_data.get("Numer"),
                        invoice_date=invoice_date_parsed,
                        vendor=enhanced_data.get("Nabywca/Nadawca"),
                        amount=amount_parsed,
                    )
                    
                    # Increment processed count in config
                    self.repo.increment_processed_count(config)
                    
                    self.repo.add_log(run=run, message=f"💾 Zapisano PDF: {pdf_path} i rekord do CSV (główny i {month_folder_name})")

                except Exception as e:
                    logger.error(f"[EmailInvoice] Error processing PDF attachment {attachment.get('filename', 'unknown')}: {e}", exc_info=True)
                    self.repo.add_log(run=run, message=f"❌ Błąd przetwarzania PDF {attachment.get('filename', 'unknown')}: {str(e)}", level="error")

            logger.info(f"[EmailInvoice] Successfully processed email {email_id}")
            return (True, email_date)

        except Exception as e:
            logger.error(f"[EmailInvoice] Error in _process_email for {email_id}: {e}", exc_info=True)
            self.repo.add_log(run=run, message=f"❌ Błąd przetwarzania emaila: {str(e)}", level="error")
            return (False, email_date if 'email_date' in locals() else None)

    def _extract_email_body(self, msg: email.message.Message) -> str:
        """Extract text body from email message"""
        body_text = ""
        
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition", ""))
                
                # Skip attachments
                if "attachment" in content_disposition:
                    continue
                
                # Get text/plain or text/html body
                if content_type == "text/plain":
                    payload = part.get_payload(decode=True)
                    if payload:
                        try:
                            body_text += payload.decode("utf-8", errors="ignore")
                        except:
                            try:
                                body_text += payload.decode("latin-1", errors="ignore")
                            except:
                                pass
                elif content_type == "text/html":
                    # Extract text from HTML if no plain text available
                    if not body_text:
                        payload = part.get_payload(decode=True)
                        if payload:
                            try:
                                html_text = payload.decode("utf-8", errors="ignore")
                                # Simple HTML tag removal (basic)
                                body_text = re.sub(r'<[^>]+>', '', html_text)
                            except:
                                pass
        else:
            # Single part message
            payload = msg.get_payload(decode=True)
            if payload:
                try:
                    body_text = payload.decode("utf-8", errors="ignore")
                except:
                    try:
                        body_text = payload.decode("latin-1", errors="ignore")
                    except:
                        pass
        
        return body_text.strip()

    def _get_attachment_names(self, msg: email.message.Message) -> List[tuple[str, str]]:
        """Get list of attachment names and content types without downloading them"""
        attachments = []
        
        for part in msg.walk():
            if part.get_content_disposition() == "attachment":
                filename = part.get_filename()
                if filename:
                    # Decode filename
                    decoded_filename = decode_header(filename)[0][0]
                    if isinstance(decoded_filename, bytes):
                        decoded_filename = decoded_filename.decode()
                    attachments.append((decoded_filename, part.get_content_type()))
        
        return attachments

    def _extract_attachments(self, msg: email.message.Message) -> List[Dict]:
        """Extract attachments from email message"""
        attachments = []

        for part in msg.walk():
            if part.get_content_disposition() == "attachment":
                filename = part.get_filename()
                if filename:
                    # Decode filename
                    decoded_filename = decode_header(filename)[0][0]
                    if isinstance(decoded_filename, bytes):
                        decoded_filename = decoded_filename.decode()

                    attachments.append({
                        "filename": decoded_filename,
                        "content_type": part.get_content_type(),
                        "data": part.get_payload(decode=True),
                    })

        return attachments

    def _extract_pdf_text(self, pdf_data: bytes) -> str:
        """
        Extract text from PDF
        Note: This is a simplified version. In production, use PyPDF2 or pdfplumber
        """
        try:
            logger.debug(f"[EmailInvoice] Extracting text from PDF ({len(pdf_data)} bytes)")
            # Try to use pdfplumber if available
            try:
                import pdfplumber
                logger.debug(f"[EmailInvoice] Using pdfplumber to extract text")
                with pdfplumber.open(io.BytesIO(pdf_data)) as pdf:
                    text = ""
                    page_count = len(pdf.pages)
                    logger.info(f"[EmailInvoice] PDF has {page_count} pages")
                    for page_num, page in enumerate(pdf.pages, 1):
                        page_text = page.extract_text() or ""
                        text += page_text
                        logger.debug(f"[EmailInvoice] Extracted {len(page_text)} characters from page {page_num}/{page_count}")
                    logger.info(f"[EmailInvoice] Total extracted text: {len(text)} characters")
                    return text
            except ImportError:
                logger.debug(f"[EmailInvoice] pdfplumber not available, trying PyPDF2")
                pass

            # Fallback to PyPDF2
            try:
                import PyPDF2
                logger.debug(f"[EmailInvoice] Using PyPDF2 to extract text")
                pdf_file = io.BytesIO(pdf_data)
                pdf_reader = PyPDF2.PdfReader(pdf_file)
                text = ""
                page_count = len(pdf_reader.pages)
                logger.info(f"[EmailInvoice] PDF has {page_count} pages")
                for page_num, page in enumerate(pdf_reader.pages, 1):
                    page_text = page.extract_text() or ""
                    text += page_text
                    logger.debug(f"[EmailInvoice] Extracted {len(page_text)} characters from page {page_num}/{page_count}")
                logger.info(f"[EmailInvoice] Total extracted text: {len(text)} characters")
                return text
            except ImportError:
                logger.debug(f"[EmailInvoice] PyPDF2 not available")
                pass

            # If no PDF library available, return empty string
            logger.warning("[EmailInvoice] No PDF library available (pdfplumber or PyPDF2). Install one to extract text.")
            return ""

        except Exception as e:
            logger.error(f"[EmailInvoice] Error extracting PDF text: {e}", exc_info=True)
            return ""

