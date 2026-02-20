from __future__ import annotations

import csv
import hashlib
import io
import os
from pathlib import Path
from typing import Dict, Optional

try:
    from google.cloud import storage as gcs_storage
except ImportError:
    gcs_storage = None


class EmailInvoiceStorage:
    """
    Storage for email invoices: saves PDFs per run and appends extracted
    invoice data to a CSV file. Supports both local filesystem and GCS.
    
    On production (when GCS_RESULTS_BUCKET is set), uses Cloud Storage.
    Otherwise uses local filesystem.
    """

    def __init__(self, base_dir: Path, bucket_name: Optional[str] = None):
        self.bucket_name = bucket_name
        if bucket_name and gcs_storage:
            # Use GCS for production
            self.gcs_client = gcs_storage.Client()
            self.bucket = self.gcs_client.bucket(bucket_name)
            self.base_dir = None
            self.use_gcs = True
        else:
            # Use local filesystem for development
            self.gcs_client = None
            self.bucket = None
            self.base_dir = Path(base_dir)
            self.base_dir.mkdir(parents=True, exist_ok=True)
            self.use_gcs = False

    def _gcs_path(self, tenant_id: str, config_id: str, run_id: str, *parts: str) -> str:
        """Build GCS path for email invoices"""
        path_parts = ["email_invoices", tenant_id, config_id, run_id] + list(parts)
        return "/".join(path_parts)

    def run_dir(self, tenant_id: str, config_id: str, run_id: str) -> Path:
        """Get run directory path (for compatibility, returns Path even for GCS)"""
        if self.use_gcs:
            # Return a virtual path for GCS (not used directly, but kept for compatibility)
            return Path(f"gs://{self.bucket_name}/{self._gcs_path(tenant_id, config_id, run_id)}")
        run_dir = self.base_dir / tenant_id / config_id / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        return run_dir

    def save_pdf(self, run_dir: Path, filename: str, data: bytes) -> Path:
        """Save PDF file. Returns Path for compatibility."""
        sanitized = filename.replace("/", "_").replace("\\", "_")
        
        if self.use_gcs:
            # Extract tenant_id, config_id, run_id from run_dir path
            # Format: gs://bucket/email_invoices/tenant_id/config_id/run_id
            path_str = str(run_dir)
            if path_str.startswith(f"gs://{self.bucket_name}/"):
                relative_path = path_str[len(f"gs://{self.bucket_name}/"):]
                parts = relative_path.split("/")
                if len(parts) >= 4:
                    tenant_id, config_id, run_id = parts[1], parts[2], parts[3]
                    blob_path = self._gcs_path(tenant_id, config_id, run_id, sanitized)
                    
                    # Handle duplicates
                    counter = 1
                    original_blob_path = blob_path
                    while self.bucket.blob(blob_path).exists():
                        stem = Path(sanitized).stem
                        suffix = Path(sanitized).suffix
                        blob_path = self._gcs_path(tenant_id, config_id, run_id, f"{stem}_{counter}{suffix}")
                        counter += 1
                    
                    blob = self.bucket.blob(blob_path)
                    blob.upload_from_string(data, content_type="application/pdf")
                    return Path(f"gs://{self.bucket_name}/{blob_path}")
        
        # Local filesystem
        target = run_dir / sanitized
        counter = 1
        while target.exists():
            stem = target.stem
            suffix = target.suffix
            target = run_dir / f"{stem}_{counter}{suffix}"
            counter += 1
        target.write_bytes(data)
        return target

    def append_record(self, run_dir: Path, record: Dict[str, str]) -> Path:
        """Append record to CSV. Returns Path for compatibility."""
        if self.use_gcs:
            # Extract tenant_id, config_id, run_id from run_dir path
            path_str = str(run_dir)
            if path_str.startswith(f"gs://{self.bucket_name}/"):
                relative_path = path_str[len(f"gs://{self.bucket_name}/"):]
                parts = relative_path.split("/")
                if len(parts) >= 4:
                    tenant_id, config_id, run_id = parts[1], parts[2], parts[3]
                    csv_blob_path = self._gcs_path(tenant_id, config_id, run_id, "records.csv")
                    blob = self.bucket.blob(csv_blob_path)
                    
                    # Read existing CSV if it exists
                    existing_data = ""
                    fieldnames = sorted(record.keys())
                    if blob.exists():
                        existing_data = blob.download_as_text()
                    
                    # Append new record
                    output = io.StringIO()
                    if existing_data:
                        output.write(existing_data)
                        # Check if header exists
                        reader = csv.DictReader(io.StringIO(existing_data))
                        if reader.fieldnames:
                            fieldnames = reader.fieldnames
                    else:
                        # Write header
                        writer = csv.DictWriter(output, fieldnames=fieldnames)
                        writer.writeheader()
                    
                    writer = csv.DictWriter(output, fieldnames=fieldnames)
                    writer.writerow(record)
                    
                    blob.upload_from_string(output.getvalue(), content_type="text/csv")
                    return Path(f"gs://{self.bucket_name}/{csv_blob_path}")
        
        # Local filesystem
        csv_path = run_dir / "records.csv"
        file_exists = csv_path.exists()
        fieldnames = sorted(record.keys())
        with csv_path.open("a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()
            writer.writerow(record)
        return csv_path

    def get_file_path(self, tenant_id: str, config_id: str, run_id: str, filename: str) -> Path:
        """Get the full path to a file within a run's directory"""
        if self.use_gcs:
            blob_path = self._gcs_path(tenant_id, config_id, run_id, filename)
            return Path(f"gs://{self.bucket_name}/{blob_path}")
        run_dir = self.run_dir(tenant_id, config_id, run_id)
        return run_dir / filename

    @staticmethod
    def hash_pdf(pdf_data: bytes) -> str:
        """Calculate SHA256 hash of PDF data for duplicate detection"""
        return hashlib.sha256(pdf_data).hexdigest()

    def month_dir(self, tenant_id: str, config_id: str, run_id: str, month_folder_name: str) -> Path:
        """Get directory path for a specific month folder (MM.RRRR format)"""
        if self.use_gcs:
            return Path(f"gs://{self.bucket_name}/{self._gcs_path(tenant_id, config_id, run_id, month_folder_name)}")
        run_dir = self.run_dir(tenant_id, config_id, run_id)
        month_dir = run_dir / month_folder_name
        month_dir.mkdir(parents=True, exist_ok=True)
        return month_dir

    def get_month_csv_path(self, tenant_id: str, config_id: str, run_id: str, month_folder_name: str) -> Path:
        """Get CSV file path for a specific month folder"""
        if self.use_gcs:
            blob_path = self._gcs_path(tenant_id, config_id, run_id, month_folder_name, "records.csv")
            return Path(f"gs://{self.bucket_name}/{blob_path}")
        month_dir = self.month_dir(tenant_id, config_id, run_id, month_folder_name)
        return month_dir / "records.csv"

    def file_exists(self, file_path: Path) -> bool:
        """Check if file exists (works with both local and GCS paths)"""
        path_str = str(file_path)
        if path_str.startswith("gs://"):
            # Extract blob path from gs:// URL
            if "/" in path_str[5:]:
                blob_path = path_str[5:].split("/", 1)[1]
                blob = self.bucket.blob(blob_path)
                return blob.exists()
            return False
        return file_path.exists()

    def read_file_bytes(self, file_path: Path) -> bytes:
        """Read file as bytes (works with both local and GCS paths)"""
        path_str = str(file_path)
        if path_str.startswith("gs://"):
            # Extract blob path from gs:// URL
            if "/" in path_str[5:]:
                blob_path = path_str[5:].split("/", 1)[1]
                blob = self.bucket.blob(blob_path)
                return blob.download_as_bytes()
            raise FileNotFoundError(f"Invalid GCS path: {file_path}")
        return file_path.read_bytes()

    def read_file_text(self, file_path: Path, encoding: str = "utf-8") -> str:
        """Read file as text (works with both local and GCS paths)"""
        path_str = str(file_path)
        if path_str.startswith("gs://"):
            # Extract blob path from gs:// URL
            if "/" in path_str[5:]:
                blob_path = path_str[5:].split("/", 1)[1]
                blob = self.bucket.blob(blob_path)
                return blob.download_as_text(encoding=encoding)
            raise FileNotFoundError(f"Invalid GCS path: {file_path}")
        return file_path.read_text(encoding=encoding)
