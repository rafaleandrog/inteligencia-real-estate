"""IBGE Grade Estatística (Censos 2010 e 2022): listagem, resolução dos quadrantes e leitura.

Leitura de shapefile (zip) exige pyogrio; a leitura de GeoJSON (`.json`/`.geojson`) é pura e é
o que os fixtures usam. As colunas são mapeadas pelo config por edição e validadas na carga:
coluna ausente FALHA nomeando as colunas encontradas, nunca cai num palpite.
"""

from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

from ..fetch import Fetcher

ZIP_LINK = re.compile(r'href="?(?P<name>grade_id\w+\.zip)"?', re.IGNORECASE)


class GradeError(RuntimeError):
    pass


@dataclass(frozen=True)
class GridCellRecord:
    cell_id: str
    parent_1km: str | None
    pop: int | None
    dom_ocu: int | None
    geometry: dict


def parse_listing(html: str) -> list[str]:
    """Nomes `grade_id*.zip` numa página de listagem do geoftp (ordem estável, sem repetição)."""
    names: list[str] = []
    for match in ZIP_LINK.finditer(html):
        name = match.group("name")
        if name not in names:
            names.append(name)
    return sorted(names)


def quadrant_urls(base_url: str, quadrant_ids: Iterable[str]) -> list[str]:
    base = base_url if base_url.endswith("/") else base_url + "/"
    return [f"{base}{qid}.zip" if not qid.endswith(".zip") else f"{base}{qid}" for qid in quadrant_ids]


def _to_int_or_none(value: Any) -> tuple[int | None, bool]:
    """(valor, suprimido). Negativo ou não inteiro é supressão: vira None + flag, nunca é saturado."""
    if value is None or value == "":
        return None, False
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None, True
    if number < 0 or number != int(number):
        return None, True
    return int(number), False


def _check_columns(available: Iterable[str], columns: Mapping[str, str], label: str) -> None:
    present = set(available)
    missing = {role: name for role, name in columns.items() if name not in present}
    if missing:
        raise GradeError(
            f"{label}: colunas ausentes {sorted(missing.values())}; encontradas {sorted(present)}"
        )


def records_from_geojson(payload: dict[str, Any], columns: Mapping[str, str], label: str) -> tuple[list[GridCellRecord], list[str]]:
    features = payload.get("features") or []
    if not features:
        return [], []
    _check_columns(features[0].get("properties", {}).keys(), columns, label)
    suppressed: list[str] = []
    out: list[GridCellRecord] = []
    for feature in features:
        props = feature["properties"]
        cell_id = str(props[columns["cell_id"]])
        pop, sup_pop = _to_int_or_none(props.get(columns["pop"]))
        dom, sup_dom = _to_int_or_none(props.get(columns["dom_ocu"]))
        if sup_pop or sup_dom:
            suppressed.append(cell_id)
        parent = props.get(columns["parent_1km"])
        out.append(GridCellRecord(
            cell_id=cell_id,
            parent_1km=str(parent) if parent not in (None, "") else None,
            pop=pop, dom_ocu=dom, geometry=feature["geometry"],
        ))
    return out, suppressed


def read_grid_file(path: Path, columns: Mapping[str, str], label: str) -> tuple[list[GridCellRecord], list[str]]:
    """GeoJSON direto (fixture) ou zip de shapefile (produção, exige pyogrio)."""
    suffix = path.suffix.lower()
    if suffix in (".json", ".geojson"):
        return records_from_geojson(json.loads(path.read_text("utf-8")), columns, label)
    if suffix == ".zip":
        return _records_from_zip(path, columns, label)
    raise GradeError(f"formato de arquivo da grade não suportado: {path.name}")


def _records_from_zip(path: Path, columns: Mapping[str, str], label: str) -> tuple[list[GridCellRecord], list[str]]:
    try:
        import pyogrio  # type: ignore
    except ImportError as error:  # pragma: no cover - depende do ambiente
        raise GradeError("ler shapefile da Grade exige pyogrio (pip install -r pipeline/requirements.txt)") from error
    with zipfile.ZipFile(path) as archive:
        shapefiles = [n for n in archive.namelist() if n.lower().endswith(".shp")]
    if not shapefiles:
        raise GradeError(f"{path.name}: nenhum .shp dentro do zip")
    frame = pyogrio.read_dataframe(f"zip://{path}!{shapefiles[0]}")
    _check_columns(frame.columns, columns, label)
    if frame.crs is not None and not str(frame.crs).upper().endswith("4326"):
        frame = frame.to_crs(4326)
    payload = json.loads(frame.to_json())
    return records_from_geojson(payload, columns, label)


def load_edition(fetcher: Fetcher, *, base_url: str, quadrant_ids: Iterable[str], columns: Mapping[str, str],
                 label: str) -> tuple[list[GridCellRecord], list[str], list[dict[str, Any]]]:
    ids = list(quadrant_ids)
    if not ids:
        raise GradeError(
            f"{label}: households_grid.quadrant_ids vazio — rode `python -m imob_pipeline discover grade` "
            "e pine os quadrantes que cruzam o bbox no config"
        )
    records: list[GridCellRecord] = []
    suppressed: list[str] = []
    retrievals: list[dict[str, Any]] = []
    for url in quadrant_urls(base_url, ids):
        retrieval = fetcher.fetch(url)
        retrievals.append(retrieval.as_dict())
        part, sup = read_grid_file(retrieval.path, columns, f"{label} {retrieval.path.name}")
        records.extend(part)
        suppressed.extend(sup)
    return records, suppressed, retrievals


def discover(fetcher: Fetcher, base_url: str) -> list[str]:
    retrieval = fetcher.fetch(base_url if base_url.endswith("/") else base_url + "/", dest_name="listing.html")
    return parse_listing(retrieval.path.read_text("utf-8", errors="replace"))
