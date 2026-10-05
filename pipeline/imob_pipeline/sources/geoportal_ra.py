"""Limites oficiais das RAs no GeoPortal/SEDUH (ArcGIS REST), em resolução plena.

Os mesmos parâmetros que `fetchAdministrativeRegionsGeoJson_` no Code.gs (outFields,
outSR=4326, geometryPrecision=6, f=geojson) — SEM `maxAllowableOffset`: aqui a geometria
serve para atribuir célula/hexágono/aresta a RA, e simplificação mudaria o resultado.
"""

from __future__ import annotations

import json
import urllib.parse
from typing import Any

from ..fetch import Fetcher
from ..geo import geometry_bbox
from ..records import RaPolygon


class GeoPortalError(RuntimeError):
    pass


def query_url(layer_url: str, *, out_fields: str, where: str = "1=1", result_offset: int | None = None,
              result_record_count: int | None = None) -> str:
    params: dict[str, str] = {
        "where": where,
        "outFields": out_fields,
        "returnGeometry": "true",
        "returnTrueCurves": "false",
        "outSR": "4326",
        "geometryPrecision": "6",
        "f": "geojson",
    }
    if result_offset is not None:
        params["resultOffset"] = str(result_offset)
    if result_record_count is not None:
        params["resultRecordCount"] = str(result_record_count)
    return f"{layer_url.rstrip('/')}/query?{urllib.parse.urlencode(params)}"


def parse_page(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
    if "error" in payload:
        error = payload["error"]
        message = error.get("message") if isinstance(error, dict) else str(error)
        raise GeoPortalError(f"GeoPortal: {message}")
    features = payload.get("features")
    if not isinstance(features, list):
        raise GeoPortalError("GeoPortal: resposta sem 'features'")
    exceeded = bool(payload.get("exceededTransferLimit")) or bool(
        (payload.get("properties") or {}).get("exceededTransferLimit")
    )
    return features, exceeded


def fetch_ra_features(fetcher: Fetcher, layer_url: str, *, out_fields: str, page_size: int = 1000,
                      max_pages: int = 20) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Todas as feições, paginando por `resultOffset` enquanto `exceededTransferLimit`."""
    features: list[dict[str, Any]] = []
    retrievals: list[dict[str, Any]] = []
    offset = 0
    for _ in range(max_pages):
        url = query_url(layer_url, out_fields=out_fields, result_offset=offset, result_record_count=page_size)
        retrieval = fetcher.fetch(url, dest_name=f"ras_{offset}.geojson")
        retrievals.append(retrieval.as_dict())
        page, exceeded = parse_page(json.loads(retrieval.path.read_text("utf-8")))
        features.extend(page)
        if not exceeded or not page:
            return features, retrievals
        offset += len(page)
    raise GeoPortalError(f"GeoPortal: mais de {max_pages} páginas — paginação sem fim?")


def to_polygons(features: list[dict[str, Any]]) -> list[RaPolygon]:
    out: list[RaPolygon] = []
    for feature in features:
        props = feature.get("properties") or {}
        geometry = feature.get("geometry")
        if not geometry or geometry.get("type") not in ("Polygon", "MultiPolygon"):
            raise GeoPortalError(f"feição sem polígono: objectid={props.get('objectid')}")
        try:
            number = int(float(props.get("ra_cira")))
        except (TypeError, ValueError) as error:
            raise GeoPortalError(f"ra_cira ausente/inválido no objectid {props.get('objectid')}") from error
        area = props.get("ra_areakm2")
        out.append(RaPolygon(
            objectid=int(props.get("objectid") if props.get("objectid") is not None else feature.get("id")),
            ra_number=number,
            ra_code=str(props.get("ra_codigo") or ""),
            ra_name_source=str(props.get("ra_nome") or ""),
            ra_area_km2=float(area) if area is not None else None,
            geometry=geometry,
            bbox=geometry_bbox(geometry),
        ))
    return out


def load_ra_polygons(fetcher: Fetcher, layer_url: str, *, out_fields: str, page_size: int) -> tuple[list[RaPolygon], list[dict[str, Any]]]:
    features, retrievals = fetch_ra_features(fetcher, layer_url, out_fields=out_fields, page_size=page_size)
    return to_polygons(features), retrievals
