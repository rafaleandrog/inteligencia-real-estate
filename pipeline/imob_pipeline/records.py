"""Registros que atravessam o pipeline (fonte → transformação → saída)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class RaPolygon:
    objectid: int
    ra_number: int
    ra_code: str
    ra_name_source: str
    ra_area_km2: float | None
    geometry: dict
    bbox: tuple[float, float, float, float]


@dataclass
class RunSummary:
    """O que uma execução contou — vai para o log, para o corpo da PR e para o manifest."""

    datasets: dict[str, dict[str, Any]] = field(default_factory=dict)

    def dataset(self, dataset_id: str) -> dict[str, Any]:
        return self.datasets.setdefault(dataset_id, {})
