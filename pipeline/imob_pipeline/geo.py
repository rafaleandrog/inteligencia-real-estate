"""Geometria em Python puro — o bastante para célula, hexágono, aresta e ponto‑em‑polígono.

Tudo aqui opera sobre GeoJSON em dicionários (`[lon, lat]`), sem shapely: é o que permite
testar o núcleo onde a stack geoespacial não está instalada. Quando shapely existir, as
rotinas caras (atribuição de RA em massa) podem acelerar — ver `transforms/assign_ra.py`.
"""

from __future__ import annotations

import math
import re
from typing import Iterable, Sequence

Position = Sequence[float]
BBox = tuple[float, float, float, float]
# Folga, em graus, tolerada em torno do bbox do projeto: o validador aceita e o pipeline publica até aqui.
BBOX_MARGIN_DEG = 0.05

_CELL_SIZE = re.compile(r"^(\d+)(KM|M)E", re.IGNORECASE)
EARTH_RADIUS_M = 6_371_008.8


def round_coords(geometry: dict, decimals: int) -> dict:
    """Arredonda todas as coordenadas de uma geometria GeoJSON (cópia)."""
    def rec(value):
        if isinstance(value, (list, tuple)):
            if value and all(isinstance(v, (int, float)) for v in value):
                return [round(float(v), decimals) for v in value]
            return [rec(v) for v in value]
        return value
    return {"type": geometry["type"], "coordinates": rec(geometry["coordinates"])}


def ring_closed(ring: Sequence[Position]) -> bool:
    return len(ring) >= 4 and list(ring[0]) == list(ring[-1])


def close_ring(ring: Sequence[Position]) -> list[list[float]]:
    out = [list(map(float, p)) for p in ring]
    if out and out[0] != out[-1]:
        out.append(list(out[0]))
    return out


def iter_positions(geometry: dict) -> Iterable[Position]:
    kind = geometry["type"]
    coords = geometry["coordinates"]
    if kind == "Point":
        yield coords
    elif kind in ("LineString", "MultiPoint"):
        yield from coords
    elif kind in ("Polygon", "MultiLineString"):
        for part in coords:
            yield from part
    elif kind == "MultiPolygon":
        for polygon in coords:
            for ring in polygon:
                yield from ring
    else:
        raise ValueError(f"geometria não suportada: {kind}")


def geometry_bbox(geometry: dict) -> BBox:
    xs: list[float] = []
    ys: list[float] = []
    for lon, lat in ((p[0], p[1]) for p in iter_positions(geometry)):
        xs.append(float(lon))
        ys.append(float(lat))
    if not xs:
        raise ValueError("geometria sem coordenadas")
    return (min(xs), min(ys), max(xs), max(ys))


def bbox_union(a: BBox | None, b: BBox) -> BBox:
    if a is None:
        return b
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def bbox_intersects(a: BBox, b: BBox) -> bool:
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


def bbox_contains_point(bbox: BBox, point: Position, margin: float = 0.0) -> bool:
    return (bbox[0] - margin) <= point[0] <= (bbox[2] + margin) and (bbox[1] - margin) <= point[1] <= (bbox[3] + margin)


def cell_size_from_id(cell_id: str) -> str:
    """`200ME57000N92000` → `200M`; `1KME5700N9200` → `1KM`. Qualquer outra forma é erro."""
    match = _CELL_SIZE.match(str(cell_id))
    if not match:
        raise ValueError(f"id de célula fora do padrão da Grade Estatística: {cell_id!r}")
    return f"{match.group(1)}{match.group(2).upper()}"


def _ring_area_signed(ring: Sequence[Position]) -> float:
    total = 0.0
    n = len(ring)
    for i in range(n - 1):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[i + 1][0], ring[i + 1][1]
        total += x1 * y2 - x2 * y1
    return total / 2.0


def ring_centroid(ring: Sequence[Position]) -> tuple[float, float]:
    """Centroide de área (fórmula do laço); anel degenerado cai na média dos vértices."""
    closed = close_ring(ring)
    area = _ring_area_signed(closed)
    if abs(area) < 1e-18:
        xs = [p[0] for p in closed[:-1]]
        ys = [p[1] for p in closed[:-1]]
        return (sum(xs) / len(xs), sum(ys) / len(ys))
    cx = cy = 0.0
    for i in range(len(closed) - 1):
        x1, y1 = closed[i][0], closed[i][1]
        x2, y2 = closed[i + 1][0], closed[i + 1][1]
        cross = x1 * y2 - x2 * y1
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    return (cx / (6 * area), cy / (6 * area))


def polygon_centroid(geometry: dict) -> tuple[float, float]:
    """Centroide do anel externo (MultiPolygon: do maior anel externo)."""
    if geometry["type"] == "Polygon":
        return ring_centroid(geometry["coordinates"][0])
    if geometry["type"] == "MultiPolygon":
        best = max(geometry["coordinates"], key=lambda poly: abs(_ring_area_signed(close_ring(poly[0]))))
        return ring_centroid(best[0])
    raise ValueError(f"centroide de polígono pedido para {geometry['type']}")


def _to_local_meters(ring: Sequence[Position], lat0: float) -> list[tuple[float, float]]:
    k = math.cos(math.radians(lat0))
    return [
        (math.radians(p[0]) * EARTH_RADIUS_M * k, math.radians(p[1]) * EARTH_RADIUS_M)
        for p in ring
    ]


def ring_area_km2(ring: Sequence[Position]) -> float:
    """Área aproximada (projeção equirretangular local) — serve para conferir ordem de grandeza."""
    closed = close_ring(ring)
    lat0 = sum(p[1] for p in closed[:-1]) / (len(closed) - 1)
    local = _to_local_meters(closed, lat0)
    return abs(_ring_area_signed(local)) / 1e6


def polygon_area_km2(geometry: dict) -> float:
    if geometry["type"] == "Polygon":
        rings = [geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        rings = geometry["coordinates"]
    else:
        raise ValueError(f"área pedida para {geometry['type']}")
    total = 0.0
    for polygon in rings:
        total += ring_area_km2(polygon[0])
        for hole in polygon[1:]:
            total -= ring_area_km2(hole)
    return total


def point_in_ring(point: Position, ring: Sequence[Position]) -> bool:
    """Ray casting; ponto exatamente na borda conta como dentro."""
    x, y = float(point[0]), float(point[1])
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = float(ring[i][0]), float(ring[i][1])
        xj, yj = float(ring[j][0]), float(ring[j][1])
        if (xi == x and yi == y):
            return True
        if (yi > y) != (yj > y):
            x_cross = (xj - xi) * (y - yi) / (yj - yi) + xi
            if abs(x_cross - x) < 1e-12:
                return True
            if x < x_cross:
                inside = not inside
        j = i
    return inside


def point_in_polygon(point: Position, polygon: Sequence[Sequence[Position]]) -> bool:
    if not point_in_ring(point, polygon[0]):
        return False
    return not any(point_in_ring(point, hole) for hole in polygon[1:])


def point_in_geometry(point: Position, geometry: dict) -> bool:
    if geometry["type"] == "Polygon":
        return point_in_polygon(point, geometry["coordinates"])
    if geometry["type"] == "MultiPolygon":
        return any(point_in_polygon(point, poly) for poly in geometry["coordinates"])
    raise ValueError(f"ponto-em-polígono pedido para {geometry['type']}")


def haversine_m(a: Position, b: Position) -> float:
    lat1, lon1 = math.radians(a[1]), math.radians(a[0])
    lat2, lon2 = math.radians(b[1]), math.radians(b[0])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def linestring_length_m(coords: Sequence[Position]) -> float:
    return sum(haversine_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def linestring_midpoint(coords: Sequence[Position]) -> tuple[float, float]:
    """Ponto a meio caminho ao longo da linha (por comprimento)."""
    if len(coords) == 1:
        return (float(coords[0][0]), float(coords[0][1]))
    total = linestring_length_m(coords)
    if total <= 0:
        return (float(coords[0][0]), float(coords[0][1]))
    walked = 0.0
    half = total / 2
    for i in range(len(coords) - 1):
        seg = haversine_m(coords[i], coords[i + 1])
        if walked + seg >= half:
            t = 0.0 if seg == 0 else (half - walked) / seg
            return (
                float(coords[i][0]) + (float(coords[i + 1][0]) - float(coords[i][0])) * t,
                float(coords[i][1]) + (float(coords[i + 1][1]) - float(coords[i][1])) * t,
            )
        walked += seg
    return (float(coords[-1][0]), float(coords[-1][1]))


def convex_hull(points: Iterable[Position]) -> list[list[float]]:
    """Casco convexo (cadeia monótona), anel fechado em sentido anti-horário."""
    pts = sorted({(float(p[0]), float(p[1])) for p in points})
    if len(pts) <= 2:
        ring = [list(p) for p in pts]
        return close_ring(ring) if len(ring) > 1 else ring

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    return close_ring([list(p) for p in hull])


def _perpendicular_distance(point: Position, start: Position, end: Position) -> float:
    (x, y), (x1, y1), (x2, y2) = point, start, end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplify_line(coords: Sequence[Position], tolerance: float) -> list[list[float]]:
    """Douglas–Peucker; tolerância nas unidades das coordenadas (graus)."""
    if len(coords) <= 2 or tolerance <= 0:
        return [list(map(float, p)) for p in coords]
    index = 0
    max_dist = 0.0
    for i in range(1, len(coords) - 1):
        d = _perpendicular_distance(coords[i], coords[0], coords[-1])
        if d > max_dist:
            index, max_dist = i, d
    if max_dist > tolerance:
        left = simplify_line(coords[: index + 1], tolerance)
        right = simplify_line(coords[index:], tolerance)
        return left[:-1] + right
    return [list(map(float, coords[0])), list(map(float, coords[-1]))]
