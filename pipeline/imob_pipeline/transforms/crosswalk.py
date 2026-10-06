"""Ponte declarada entre as grafias de RA — derivada SÓ dos atributos do GeoPortal.

`ra_cira` → `ra_number` → `RA_nn`; `ra_codigo` → `ra_code`, validado por ida‑e‑volta contra
`int_to_roman(ra_number)` (divergência FALHA nomeando a RA — nunca se adivinha); o nome é o
`titleCaseRaName_` do Code.gs. Nunca por semelhança de nome (docs/DATA_CONTRACT.md, R2.9).
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterable

from ..records import RaPolygon
from .ra_names import int_to_roman, normalize_slug, ra_geo_id, ra_number_from_code, title_case_ra_name

CROSSWALK_COLUMNS = (
    "ra_number", "ra_geo_id", "ra_code", "ra_geo_id_roman", "ra_name", "ra_name_source",
    "ra_slug", "ra_area_km2", "geoportal_objectid", "geometry_sha256",
)


class CrosswalkError(ValueError):
    """Invariante da ponte violado — a execução para, o arquivo não é gravado."""


def geometry_sha256(geometry: dict) -> str:
    canonical = json.dumps(geometry, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalize_ra_code(raw: object) -> str:
    """`ra-xix`, `RA XIX`, `XIX` → `RA-XIX`. Só normaliza a forma; a validade é checada depois."""
    text = re.sub(r"\s+", "", str(raw or "").strip().upper())
    roman = re.sub(r"^RA-?", "", text)
    return f"RA-{roman}" if roman else ""


def crosswalk_row(polygon: RaPolygon, *, roman_key_prefix: str) -> dict[str, Any]:
    number = int(polygon.ra_number)
    if number < 1:
        raise CrosswalkError(f"ra_cira inválido ({polygon.ra_number}) no objectid {polygon.objectid}")
    code = normalize_ra_code(polygon.ra_code)
    parsed = ra_number_from_code(code)
    if parsed != number or code != f"RA-{int_to_roman(number)}":
        raise CrosswalkError(
            f"ra_codigo {polygon.ra_code!r} não corresponde a ra_cira {number} "
            f"(esperado RA-{int_to_roman(number)}) no objectid {polygon.objectid}"
        )
    return {
        "ra_number": number,
        "ra_geo_id": ra_geo_id(number),
        "ra_code": code,
        "ra_geo_id_roman": f"{roman_key_prefix}{code}",
        "ra_name": title_case_ra_name(polygon.ra_name_source),
        "ra_name_source": str(polygon.ra_name_source),
        "ra_slug": normalize_slug(polygon.ra_name_source),
        "ra_area_km2": polygon.ra_area_km2,
        "geoportal_objectid": int(polygon.objectid),
        "geometry_sha256": geometry_sha256(polygon.geometry),
    }


def check_invariants(rows: list[dict[str, Any]], *, expected_count: int) -> None:
    if len(rows) != expected_count:
        raise CrosswalkError(f"esperava {expected_count} RAs no GeoPortal, vieram {len(rows)}")
    numbers = [r["ra_number"] for r in rows]
    if len(set(numbers)) != len(numbers):
        raise CrosswalkError(f"número de RA repetido: {sorted(n for n in numbers if numbers.count(n) > 1)}")
    for key in ("ra_geo_id", "ra_geo_id_roman", "ra_code", "ra_slug"):
        values = [r[key] for r in rows]
        if len(set(values)) != len(values):
            raise CrosswalkError(f"chave repetida em {key}: {sorted(v for v in values if values.count(v) > 1)}")


def build_crosswalk(polygons: Iterable[RaPolygon], *, roman_key_prefix: str, expected_count: int,
                    source: dict[str, Any]) -> dict[str, Any]:
    """Sem carimbo de hora no arquivo: a data vive no manifest. Fonte igual → bytes iguais."""
    rows = sorted((crosswalk_row(p, roman_key_prefix=roman_key_prefix) for p in polygons),
                  key=lambda r: r["ra_number"])
    check_invariants(rows, expected_count=expected_count)
    return {
        "source": source,
        "roman_key_prefix": roman_key_prefix,
        "rows": rows,
    }
