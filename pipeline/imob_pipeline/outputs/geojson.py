"""Escrita determinística de GeoJSON: mesma entrada → mesmos bytes.

Feições ordenadas por `id`, chaves ordenadas, separadores compactos, coordenadas
arredondadas a N casas, `allow_nan=False` (NaN em JSON é inválido e o cliente recusaria).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

from ..geo import bbox_union, geometry_bbox, round_coords


def dumps_canonical(obj: Any, *, indent: int | None = None) -> str:
    separators = (",", ":") if indent is None else (",", ": ")
    return json.dumps(obj, sort_keys=True, separators=separators, ensure_ascii=False, allow_nan=False, indent=indent)


def make_feature(fid: str, geometry: dict, properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "Feature", "id": str(fid), "geometry": geometry, "properties": properties}


def feature_collection(features: Iterable[dict[str, Any]], *, decimals: int) -> dict[str, Any]:
    ordered = sorted(features, key=lambda f: str(f["id"]))
    rounded = [
        {"type": "Feature", "id": str(f["id"]), "geometry": round_coords(f["geometry"], decimals),
         "properties": f["properties"]}
        for f in ordered
    ]
    return {"type": "FeatureCollection", "features": rounded}


def write_feature_collection(path: str | Path, features: Iterable[dict[str, Any]], *, decimals: int) -> dict[str, Any]:
    collection = feature_collection(features, decimals=decimals)
    text = dumps_canonical(collection)
    data = text.encode("utf-8")
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    bbox = None
    for feature in collection["features"]:
        bbox = bbox_union(bbox, geometry_bbox(feature["geometry"]))
    return {
        "path": target,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "features": len(collection["features"]),
        "bbox": [round(v, decimals) for v in bbox] if bbox else None,
    }


def write_json(path: str | Path, payload: Any, *, indent: int | None = 2) -> dict[str, Any]:
    text = dumps_canonical(payload, indent=indent)
    if indent is not None:
        text += "\n"
    data = text.encode("utf-8")
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"path": target, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
