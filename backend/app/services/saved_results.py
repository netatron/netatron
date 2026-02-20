import uuid
from datetime import datetime
from typing import Dict, List, Optional


class SavedDataset:
    def __init__(self, label: str, source: str, records: List[Dict], metadata: Dict):
        self.id = str(uuid.uuid4())
        self.label = label or f"Dataset {datetime.utcnow().isoformat()}"
        self.source = source
        self.created_at = datetime.utcnow().isoformat()
        self.records = list(records)
        self.metadata = metadata or {}

    def summary(self) -> Dict:
        return {
            "dataset_id": self.id,
            "label": self.label,
            "source": self.source,
            "created_at": self.created_at,
            "total_records": len(self.records),
            "metadata": self.metadata,
        }

    def detail(self) -> Dict:
        return {
            **self.summary(),
            "records": self.records,
        }


_saved: Dict[str, SavedDataset] = {}


def save_dataset(label: str, source: str, records: List[Dict], metadata: Dict) -> SavedDataset:
    dataset = SavedDataset(label, source, records, metadata)
    _saved[dataset.id] = dataset
    return dataset


def list_datasets() -> List[SavedDataset]:
    return list(_saved.values())


def get_dataset(dataset_id: str) -> Optional[SavedDataset]:
    return _saved.get(dataset_id)
