from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Iterable, Mapping, Optional

try:  # Lazy import for environments bez GCS
    from google.cloud import storage as gcs_storage  # type: ignore
except ImportError:  # pragma: no cover
    gcs_storage = None  # type: ignore


class StorageClient:
    def __init__(self, base_dir: Path, bucket_name: Optional[str] = None):
        self.bucket_name = bucket_name
        if bucket_name:
            if gcs_storage is None:
                raise RuntimeError("google-cloud-storage not installed, cannot use GCS storage.")
            self.gcs_client = gcs_storage.Client()
            self.bucket = self.gcs_client.bucket(bucket_name)
            self.base_dir = None
        else:
            self.gcs_client = None
            self.bucket = None
            self.base_dir = Path(base_dir)
            self.base_dir.mkdir(parents=True, exist_ok=True)

    def save_records(self, tenant_id: str, job_id: str, records: Iterable[Mapping]) -> str:
        iterator = list(records)

        if self.bucket:
            blob_path = f"{tenant_id}/{job_id}.csv"
            blob = self.bucket.blob(blob_path)
            csv_data = self._build_csv(iterator)
            blob.upload_from_string(csv_data, content_type="text/csv")
            return f"gs://{self.bucket_name}/{blob_path}"

        tenant_dir = self.base_dir / tenant_id  # type: ignore[arg-type]
        tenant_dir.mkdir(parents=True, exist_ok=True)
        file_path = tenant_dir / f"{job_id}.csv"
        csv_data = self._build_csv(iterator)
        file_path.write_text(csv_data, encoding="utf-8")
        return file_path.as_uri()

    @staticmethod
    def _build_csv(rows: Iterable[Mapping]) -> str:
        iterator = list(rows)
        if not iterator:
            return ""
        fieldnames = sorted({key for row in iterator for key in row.keys()})
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=fieldnames)
        writer.writeheader()
        for row in iterator:
            writer.writerow(row)
        return buffer.getvalue()
