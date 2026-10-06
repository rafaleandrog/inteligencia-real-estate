"""Classes e percentis — a mesma definição nos dois lados do contrato.

`assign_class(valor, cortes)`: cortes crescentes `[b1..bk]` definem k+1 classes; valor
**igual ao corte cai na classe de cima** (docs/DATA_CONTRACT.md, "Arquivos públicos").
Ausência (`None`/NaN/inf) devolve `None`, nunca 0.

`percentile(ordenados, p)` é a mesma interpolação linear de `src/map/comparables.js`.
"""

from __future__ import annotations

import math
from typing import Sequence


def is_absent(value: object) -> bool:
    if value is None:
        return True
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return True
    return math.isnan(number) or math.isinf(number)


def assign_class(value: object, breaks: Sequence[float]) -> int | None:
    if is_absent(value):
        return None
    number = float(value)  # type: ignore[arg-type]
    return sum(1 for cut in breaks if number >= cut)


def class_count(breaks: Sequence[float]) -> int:
    return len(breaks) + 1


def percentile(sorted_values: Sequence[float], p: float) -> float | None:
    if not sorted_values:
        return None
    clamped = min(100.0, max(0.0, float(p)))
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    pos = (clamped / 100.0) * (len(sorted_values) - 1)
    lower = math.floor(pos)
    upper = math.ceil(pos)
    if lower == upper:
        return float(sorted_values[lower])
    weight = pos - lower
    return float(sorted_values[lower]) + (float(sorted_values[upper]) - float(sorted_values[lower])) * weight


def percentile_ranks(values: Sequence[float]) -> list[float]:
    """Posição percentual de cada valor no conjunto, 0–100, empates com posição média.

    `rank = 100 × (menores + (iguais − 1) / 2) / (n − 1)`; conjunto de um elemento → 100.
    É esta a definição de `betweenness_percentile` publicada em `road_centrality`.
    """
    n = len(values)
    if n == 0:
        return []
    if n == 1:
        return [100.0]
    ordered = sorted(float(v) for v in values)
    # posição inicial e contagem de cada valor distinto
    first_index: dict[float, int] = {}
    counts: dict[float, int] = {}
    for index, value in enumerate(ordered):
        first_index.setdefault(value, index)
        counts[value] = counts.get(value, 0) + 1
    out = []
    for value in values:
        v = float(value)
        less = first_index[v]
        equal = counts[v]
        out.append(100.0 * (less + (equal - 1) / 2.0) / (n - 1))
    return out
