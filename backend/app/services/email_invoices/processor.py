"""
Email Invoice Processor - extracts invoice data from PDFs using AI
"""
from __future__ import annotations

from datetime import datetime
import json
import logging
import os
import re
from typing import Dict, Optional

import openai

logger = logging.getLogger(__name__)

openai.api_key = os.getenv("OPENAI_API_KEY")


EMAIL_FILTER_PROMPT = """Jesteś inteligentnym asystentem księgowym firmy Happy Deal sp. z o.o. Twoim zadaniem jest ocenić czy email zawiera dokumenty księgowe (faktury lub wyciągi bankowe), które wymagają przetworzenia.

Dane emaila:
Temat: {subject}
Nadawca: {sender}
Treść emaila: {body}
Załączniki PDF: {attachments}

WAŻNE - Zwróć "accept" TYLKO jeśli email zawiera:
- Fakturę VAT (koszty lub sprzedaż) - dokument z numerem faktury, datą, kwotami netto/VAT/brutto
- Wyciąg bankowy - dokument z transakcjami bankowymi, saldami, operacjami

ZWROĆ "reject" jeśli email zawiera:
- Reklamy, oferty handlowe, promocje
- Regulaminy, umowy, warunki korzystania
- Newsletter, biuletyny informacyjne
- Potwierdzenia zamówień (bez faktury)
- Dokumenty marketingowe
- Spam, phishing, nieistotne wiadomości
- Dokumenty które NIE są fakturami ani wyciągami bankowymi

Bądź RESTRYKCYJNY - jeśli masz wątpliwości czy to faktura/wyciąg, zwróć "reject".

Zwróć wynik w formacie JSON:
```json
{{
  "decision": "accept" lub "reject",
  "reason": "krótkie uzasadnienie decyzji"
}}
```"""

INVOICE_EXTRACTION_PROMPT = """Jesteś inteligentnym asystentem księgowym firmy Happy Deal sp. z o.o. Otrzymasz tekst wyodrębniony z dokumentu PDF przesłanego e-mailem.

========================
POCZĄTEK TEKSTU DOKUMENTU

{text}

KONIEC TEKSTU DOKUMENTU
========================

Twoim zadaniem jest precyzyjna analiza dokumentu:

1. Dokładnie określ kategorię dokumentu, wybierając jedną spośród:
   - koszty (Happy Deal sp. z o.o. jest nabywcą)
   - sprzedaż (Happy Deal sp. z o.o. jest sprzedawcą)
   - wyciąg (wyciąg bankowy)

2. Wyodrębnij poniższe dane faktury:
   - Typ (koszty, sprzedaż)
   - Data (data wystawienia dokumentu w formacie RRRR-MM-DD)
   - Numer (numer faktury)
   - Nabywca/Nadawca (nazwa sprzedawcy lub nadawcy dokumentu)
   - NIP (numer NIP sprzedawcy, jeśli dostępny)
   - Netto (kwota netto, np. 1000,00 - koniecznie z przecinkiem, nie z kropką)
   - VAT (kwota VAT, np. 230,00 - koniecznie z przecinkiem, nie z kropką)
   - Brutto (kwota brutto, np. 1230,00 - koniecznie z przecinkiem, nie z kropką)
   - Plik (nazwa pliku PDF)
   - ID pliku (opcjonalne pole identyfikatora, zostaw puste jeśli brak)

3. W przypadku wyciągu zwróć tylko datę MM-RRRR i kategorię (wyciąg) - data wyciągu jest okresem za który wyciąg jest wystawiany. Jeśli wyciąg jest za miesiąc 08 - to datą jest 08-2025 - jak w dokumencie.

Zwróć wynik dokładnie w takim formacie JSON (bez żadnych dodatkowych opisów czy komentarzy):

```json
{{
  "Typ": "",
  "Data": "",
  "Numer": "",
  "Nabywca/Nadawca": "",
  "NIP": "",
  "Netto": "",
  "VAT": "",
  "Brutto": "",
  "Plik": ""
}}
```"""


class EmailInvoiceProcessor:
    """Processes PDF invoices and extracts structured data using AI"""

    def __init__(self):
        self.openai_client = openai

    def should_process_email(
        self,
        subject: str,
        sender: str,
        body: str,
        attachment_names: list[str],
    ) -> tuple[bool, str]:
        """
        Determine if email should be processed based on subject, body, and attachment names.
        Uses AI to filter out spam, advertisements, and non-accounting documents.

        Args:
            subject: Email subject
            sender: Email sender
            body: Email body text (first 2000 chars)
            attachment_names: List of PDF attachment filenames

        Returns:
            Tuple of (should_process: bool, reason: str)
        """
        try:
            # Limit body length to avoid token limits
            body_preview = body[:2000] if body else ""
            attachments_str = ", ".join(attachment_names) if attachment_names else "brak"

            prompt = EMAIL_FILTER_PROMPT.format(
                subject=subject or "brak",
                sender=sender or "brak",
                body=body_preview or "brak",
                attachments=attachments_str,
            )

            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Jesteś asystentem księgowym. Filtrujesz emaile i decydujesz czy zawierają dokumenty księgowe wymagające przetworzenia."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0,
            )

            content = response.choices[0].message.content.strip()

            # Extract JSON from markdown code block if present
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            result = json.loads(content)
            decision = result.get("decision", "reject").lower()
            reason = result.get("reason", "Brak uzasadnienia")

            should_process = decision == "accept"
            logger.info(f"[EmailFilter] Decision: {decision}, Reason: {reason}")
            return should_process, reason

        except Exception as e:
            logger.error(f"Error filtering email: {e}", exc_info=True)
            # On error, default to processing (safer than rejecting valid invoices)
            return True, f"Błąd filtrowania, przetwarzanie: {str(e)}"

    def extract_invoice_data(
        self,
        pdf_text: str,
        file_name: str,
    ) -> Dict[str, str]:
        """
        Extract structured invoice data from PDF text using AI

        Args:
            pdf_text: Extracted text from PDF
            file_name: Name of the PDF file
            drive_file_id: Google Drive file ID (optional)

        Returns:
            Dictionary with extracted invoice fields
        """
        try:
            prompt = INVOICE_EXTRACTION_PROMPT.format(text=pdf_text)

            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Jesteś asystentem księgowym. Wyodrębniaj dane z faktur dokładnie według instrukcji."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0,
            )

            content = response.choices[0].message.content.strip()

            # Extract JSON from markdown code block if present
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            invoice_data = json.loads(content)

            # Ensure file name and drive ID are set
            if not invoice_data.get("Plik"):
                invoice_data["Plik"] = file_name
            logger.info(f"Extracted invoice data: {invoice_data}")
            return invoice_data

        except Exception as e:
            logger.error(f"Error extracting invoice data: {e}", exc_info=True)
            # Return empty structure on error
            return {
                "Typ": "",
                "Data": "",
                "Numer": "",
                "Nabywca/Nadawca": "",
                "NIP": "",
                "Netto": "",
                "VAT": "",
                "Brutto": "",
                "Plik": file_name,
            }

    def parse_date_and_category(
        self,
        invoice_data: Dict[str, str],
        file_name: str,
        pdf_text: str,
    ) -> Dict[str, str]:
        """
        Parse date and determine category folder
        Documents are organized by their invoice date (MM.RRRR format)

        Args:
            invoice_data: Extracted invoice data
            file_name: PDF file name
            pdf_text: PDF text content

        Returns:
            Enhanced invoice data with date/category parsing
        """
        ai_typ = invoice_data.get("Typ", "")
        data_str = (invoice_data.get("Data", "") or "").strip()

        # Detect month from name (Polish month names)
        month_map = {
            "styczeń": "01", "sty": "01",
            "luty": "02", "lut": "02",
            "marzec": "03", "mar": "03",
            "kwiecień": "04", "kw": "04",
            "maj": "05",
            "czerwiec": "06", "czer": "06",
            "lipiec": "07", "lip": "07",
            "sierpień": "08", "sie": "08",
            "wrzesień": "09", "wrz": "09",
            "październik": "10", "paź": "10",
            "listopad": "11", "lis": "11",
            "grudzień": "12", "gru": "12",
        }

        # Extract year and month from date string
        faktura_year = None
        faktura_month = None

        if data_str:
            date_match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", data_str)
            if date_match:
                faktura_year = int(date_match.group(1))
                faktura_month = int(date_match.group(2))

        # Prepare combined text for searching (always define it)
        combined_text = (file_name + " " + pdf_text).lower()

        # Try to detect from filename/text if date not found
        if not faktura_month:
            # Try YYYY-MM or MM-YYYY pattern
            year_month_match = re.search(r"\b(20\d{2})[-_/\.](0[1-9]|1[0-2])\b", combined_text)
            if year_month_match:
                faktura_month = int(year_month_match.group(2))
                faktura_year = int(year_month_match.group(1))
            else:
                month_year_match = re.search(r"\b(0[1-9]|1[0-2])[-_/\.](20\d{2})\b", combined_text)
                if month_year_match:
                    faktura_month = int(month_year_match.group(1))
                    faktura_year = int(month_year_match.group(2))

        # Try month names
        if not faktura_month:
            for month_name, month_num in month_map.items():
                if month_name in combined_text:
                    faktura_month = int(month_num)
                    if not faktura_year:
                        faktura_year = datetime.now().year
                    break

        # Default to current date if not found
        if not faktura_year:
            faktura_year = datetime.now().year
        if not faktura_month:
            faktura_month = datetime.now().month

        # Use invoice date directly (no supplement logic)
        target_year = faktura_year
        target_month = faktura_month

        # Create folder and sheet names based on invoice date
        month_folder_name = f"{str(target_month).zfill(2)}.{target_year}"
        ledger_sheet_name = f"Ledger_{str(target_month).zfill(2)}_{target_year}"

        # Return enhanced data (keep original type from AI)
        result = {
            **invoice_data,
            "Typ": ai_typ,
            "year": str(target_year),
            "month": str(target_month).zfill(2),
            "monthFolderName": month_folder_name,
            "ledgerSheetName": ledger_sheet_name,
        }

        return result

