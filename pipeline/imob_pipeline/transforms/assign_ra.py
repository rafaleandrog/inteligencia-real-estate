"""Atribuição de feição a Região Administrativa: ponto (centroide / ponto médio) dentro do limite.

Puro por padrão (bbox + ponto-em-polígono); com shapely instalado usa STRtree, que dá o mesmo
resultado mais rápido. Fora de todo limite → `None` (publicado em `SEM_RA`, nunca escondido).
"""

from __future__ import annotations

from typing import Iterable, Sequence

from ..geo import bbox_contains_point, point_in_geometry
from ..records import RaPolygon
from .ra_names import ra_geo_id

try:  # aceleração opcional
    from shapely.geometry import Point, shape  # type: ignore
    from shapely.strtree import STRtree  # type: ignore
    HAS_SHAPELY = True
except ImportError:  # pragma: no cover - depende do ambiente
    HAS_SHAPELY = False


class RaIndex:
    def __init__(self, polygons: Iterable[RaPolygon], *, use_shapely: bool | None = None) -> None:
        self.polygons = list(polygons)
        self.geo_ids = [ra_geo_id(p.ra_number) for p in self.polygons]
        self._shapely = HAS_SHAPELY if use_shapely is None else (use_shapely and HAS_SHAPELY)
        if self._shapely:
            self._shapes = [shape(p.geometry) for p in self.polygons]
            self._tree = STRtree(self._shapes)

    def assign(self, point: Sequence[float]) -> str | None:
        if self._shapely:
            candidates = self._tree.query(Point(point[0], point[1]))
            for index in candidates:
                if self._shapes[int(index)].covers(Point(point[0], point[1])):
                    return self.geo_ids[int(index)]
            return None
        for polygon, geo_id in zip(self.polygons, self.geo_ids):
            if bbox_contains_point(polygon.bbox, point) and point_in_geometry(point, polygon.geometry):
                return geo_id
        return None
