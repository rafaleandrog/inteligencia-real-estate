"""Ipea — Projeto Acesso a Oportunidades: resolução pelo `metadata.csv` e leitura do uso do solo.

O pacote R `aopdata` resolve os arquivos por um índice CSV no mesmo diretório; replicamos a
ideia sem assumir o layout exato: procuramos, entre as linhas, a que tem a cidade, o ano e o
tipo pedidos, olhando as colunas que existirem. Não achou → erro que LISTA as linhas
disponíveis (nunca um palpite). A geometria H3 vem de `h3` (produção) ou de um mapa de
fixtures (teste) pelo mesmo seam `HexGeometry`.
"""

from __future__ import annotations

import re

import csv
import io
import json
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Iterable, Mapping, Protocol, Sequence

from ..fetch import FetchError, Fetcher


class AopError(RuntimeError):
    pass


@dataclass(frozen=True)
class HexRecord:
    h3_index: str
    year: int
    jobs_total: int | None
    jobs_low: int | None
    jobs_mid: int | None
    jobs_high: int | None
    pop_total: int | None
    income_avg_brl: float | None
    income_decile: int | None


class HexGeometry(Protocol):
    def boundary(self, h3_index: str) -> dict: ...
    def parent(self, h3_index: str, resolution: int) -> str: ...


class H3Library:
    """Produção: biblioteca h3 (v4)."""

    def __init__(self) -> None:
        try:
            import h3  # type: ignore
        except ImportError as error:  # pragma: no cover
            raise AopError("geometria H3 exige o pacote h3 (pip install -r pipeline/requirements.txt)") from error
        self._h3 = h3

    def boundary(self, h3_index: str) -> dict:
        ring = [[float(lon), float(lat)] for lat, lon in self._h3.cell_to_boundary(h3_index)]
        ring.append(list(ring[0]))
        return {"type": "Polygon", "coordinates": [ring]}

    def parent(self, h3_index: str, resolution: int) -> str:
        return self._h3.cell_to_parent(h3_index, resolution)


class FixtureHexGeometry:
    """Teste: `{ "boundaries": {h3: polygon}, "parents": {h3: parent_r8} }`."""

    def __init__(self, payload: Mapping[str, Any]) -> None:
        self.boundaries = dict(payload.get("boundaries", {}))
        self.parents = dict(payload.get("parents", {}))

    @classmethod
    def from_file(cls, path: Path) -> "FixtureHexGeometry":
        return cls(json.loads(path.read_text("utf-8")))

    def boundary(self, h3_index: str) -> dict:
        try:
            return self.boundaries[h3_index]
        except KeyError as error:
            raise AopError(f"fixture sem geometria para o hexágono {h3_index}") from error

    def parent(self, h3_index: str, resolution: int) -> str:
        try:
            return self.parents[h3_index]
        except KeyError as error:
            raise AopError(f"fixture sem pai para o hexágono {h3_index}") from error


def _rows(text: str) -> list[dict[str, str]]:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]


_KIND_HINTS: Mapping[str, tuple[str, ...]] = {
    "land_use": ("land_use", "landuse", "uso"),
    "population": ("population", "populacao", "população"),
}


def resolve_url(metadata_text: str, *, city: str, year: int, kind: str, base_url: str) -> str:
    """Linha do índice cuja cidade, ano e tipo (`land_use` ou `population`) batem; o caminho vira URL absoluta.

    Layout real do índice (release v1.0.0 do aopdata): `type,city,year,mode,download_path,download_path2,name_muni`,
    com `download_path` absoluto; a cidade de Brasília é `bsb`. Sem linha → erro que LISTA as disponíveis."""
    hints = _KIND_HINTS.get(kind)
    if not hints:
        raise AopError(f"tipo de arquivo do AOP desconhecido: {kind!r} (esperado land_use ou population)")
    rows = _rows(metadata_text)
    wanted_city = city.lower()
    candidates = []
    for row in rows:
        values = {k.lower(): v for k, v in row.items()}
        joined = " ".join(values.values()).lower()
        city_ok = any(v.lower() == wanted_city for v in values.values()) or f"_{wanted_city}" in joined
        year_ok = any(v == str(year) for v in values.values()) or str(year) in joined
        kind_value = (values.get("type") or "").lower()
        type_ok = any(h in kind_value for h in hints) if kind_value else any(h in joined for h in hints)
        if city_ok and year_ok and type_ok:
            candidates.append(values)
    if not candidates:
        available = "\n".join(" | ".join(r.values()) for r in rows[:50])
        raise AopError(f"metadata.csv sem linha para cidade={city} ano={year} tipo={kind}. Linhas disponíveis:\n{available}")
    row = candidates[0]
    path = next((row[k] for k in ("download_path", "file", "path", "url", "arquivo") if k in row and row[k]), None)
    if not path:
        path = next((v for v in row.values() if v.lower().endswith((".csv", ".csv.gz", ".gpkg", ".zip"))), None)
    if not path:
        raise AopError(f"linha do metadata.csv sem caminho de download: {row}")
    if path.startswith("http://") or path.startswith("https://"):
        return path
    base = base_url if base_url.endswith("/") else base_url + "/"
    return base + path.lstrip("/")


def resolve_landuse_url(metadata_text: str, *, city: str, year: int, base_url: str) -> str:
    return resolve_url(metadata_text, city=city, year=year, kind="land_use", base_url=base_url)


def _int_or_none(value: str) -> int | None:
    if value in ("", "NA", "NaN", "null"):
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    if number < 0:
        return None
    return int(round(number))


def _float_or_none(value: str) -> float | None:
    if value in ("", "NA", "NaN", "null"):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _city_year_columns(present: set[str]) -> tuple[str | None, str | None]:
    city_col = next((c for c in ("abbrev_muni", "city", "abbrev") if c in present), None)
    year_col = next((c for c in ("year", "ano") if c in present), None)
    return city_col, year_col


def parse_landuse(text: str, *, city: str, year: int, columns: Mapping[str, str]) -> list[HexRecord]:
    """Uso do solo do AOP: hexágono + empregos T001–T004. População e renda ficam em outro arquivo
    (`parse_population`); `columns` pode trazê-las só quando o arquivo as tiver (fixture antiga)."""
    rows = _rows(text)
    if not rows:
        return []
    present = set(rows[0].keys())
    missing = [name for name in columns.values() if name not in present]
    if missing:
        raise AopError(f"uso do solo AOP: colunas ausentes {missing}; encontradas {sorted(present)}")
    city_col, year_col = _city_year_columns(present)
    out: list[HexRecord] = []
    for row in rows:
        if city_col and row[city_col].lower() != city.lower():
            continue
        if year_col and row[year_col] not in ("", str(year)):
            continue
        out.append(HexRecord(
            h3_index=row[columns["hex"]],
            year=year,
            jobs_total=_int_or_none(row[columns["jobs_total"]]),
            jobs_low=_int_or_none(row[columns["jobs_low"]]),
            jobs_mid=_int_or_none(row[columns["jobs_mid"]]),
            jobs_high=_int_or_none(row[columns["jobs_high"]]),
            pop_total=_int_or_none(row[columns["pop"]]) if "pop" in columns else None,
            income_avg_brl=_float_or_none(row[columns["income_avg"]]) if "income_avg" in columns else None,
            income_decile=_int_or_none(row[columns["income_decile"]]) if "income_decile" in columns else None,
        ))
    return out


def parse_population(text: str, *, city: str, year: int, columns: Mapping[str, str]) -> dict[str, dict[str, Any]]:
    """População e renda do AOP por hexágono (arquivo `population_<ano>_<cidade>`, base Censo 2010):
    P001 população, R001 renda média, R003 decil de renda. Célula vazia é `None`."""
    rows = _rows(text)
    if not rows:
        return {}
    present = set(rows[0].keys())
    missing = [columns[k] for k in ("hex", "pop", "income_avg", "income_decile") if columns[k] not in present]
    if missing:
        raise AopError(f"população AOP: colunas ausentes {missing}; encontradas {sorted(present)}")
    city_col, year_col = _city_year_columns(present)
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        if city_col and row[city_col].lower() != city.lower():
            continue
        if year_col and row[year_col] not in ("", str(year)):
            continue
        out[row[columns["hex"]]] = {
            "pop_total": _int_or_none(row[columns["pop"]]),
            "income_avg_brl": _float_or_none(row[columns["income_avg"]]),
            "income_decile": _int_or_none(row[columns["income_decile"]]),
        }
    return out


def merge_population(records: Sequence[HexRecord], population: Mapping[str, Mapping[str, Any]],
                     *, stats: dict[str, Any] | None = None) -> list[HexRecord]:
    """Junta população/renda aos hexágonos do uso do solo pelo índice H3. Hexágono sem linha de
    população fica com `None`; hexágono só na população é contado em `stats`, nunca inventado."""
    merged: list[HexRecord] = []
    matched = 0
    for rec in records:
        extra = population.get(rec.h3_index)
        if extra is None:
            merged.append(rec)
            continue
        matched += 1
        merged.append(replace(rec, pop_total=extra.get("pop_total"), income_avg_brl=extra.get("income_avg_brl"),
                              income_decile=extra.get("income_decile")))
    if stats is not None:
        stats.update({
            "population_hexes": len(population),
            "population_matched": matched,
            "population_only_hexes": len(set(population) - {r.h3_index for r in records}),
        })
    return merged


_DATA_LINK_HINTS = ("aop", "landuse", "land_use", "metadata", ".csv", ".gpkg", ".zip", ".gz", ".parquet")
_HREF = re.compile(r'href="?(?P<name>[^"\s>]+)"?', re.IGNORECASE)
_BARE_URL = re.compile(r'https?://[^\s"\'<>\\]+')


def extract_links(text: str) -> list[str]:
    """Links que parecem dado do AOP numa página HTML ou num JSON (ex.: assets de release no GitHub)."""
    found: list[str] = []
    for match in list(_HREF.finditer(text)) + list(_BARE_URL.finditer(text)):
        name = match.group("name") if "name" in match.groupdict() else match.group(0)
        lowered = name.lower()
        if any(hint in lowered for hint in _DATA_LINK_HINTS) and name not in found:
            found.append(name)
    return found


def load_metadata(fetcher: Fetcher, *, metadata_url: str, fallback_urls: Sequence[str] = (),
                  probe_urls: Sequence[str] = ()) -> tuple[str, Any]:
    """`metadata.csv` pela primeira URL que responder. Quando nenhuma responde, sonda `probe_urls`
    e FALHA nomeando cada tentativa e os links de dados encontrados — o layout real da fonte vai
    para o log em vez de exigir um palpite por ciclo (#164)."""
    errors: list[str] = []
    for url in (metadata_url, *fallback_urls):
        try:
            retrieval = fetcher.fetch(url, dest_name="metadata.csv")
        except FetchError as error:
            errors.append(f"{url} → {error}")
            continue
        return retrieval.path.read_text("utf-8", errors="replace"), retrieval
    probed: list[str] = []
    for page in probe_urls:
        try:
            body = fetcher.fetch(page, dest_name="sondagem.html").path.read_text("utf-8", errors="replace")
        except FetchError as error:
            probed.append(f"{page} → {error}")
            continue
        links = extract_links(body)
        probed.append(f"{page} → {links[:40] if links else 'nenhum link de dados'}")
    raise AopError(
        "metadata.csv do AOP indisponível em todas as URLs:\n  " + "\n  ".join(errors)
        + "\nLinks de dados nas páginas sondadas:\n  " + ("\n  ".join(probed) if probed else "(nenhuma página sondada)")
    )


def load_landuse(fetcher: Fetcher, *, metadata_url: str, city: str, year: int, columns: Mapping[str, str],
                 fallback_urls: Sequence[str] = (), probe_urls: Sequence[str] = (),
                 population_year: int | None = None, population_columns: Mapping[str, str] | None = None,
                 stats: dict[str, Any] | None = None) -> tuple[list[HexRecord], list[dict[str, Any]]]:
    """Uso do solo de `year` e, se pedido, população/renda de `population_year` juntadas por hexágono."""
    metadata_text, meta = load_metadata(fetcher, metadata_url=metadata_url, fallback_urls=fallback_urls, probe_urls=probe_urls)
    base_url = meta.url.rsplit("/", 1)[0] + "/"
    url = resolve_url(metadata_text, city=city, year=year, kind="land_use", base_url=base_url)
    data = fetcher.fetch(url)
    records = parse_landuse(_read_text(data.path), city=city, year=year, columns=columns)
    retrievals = [meta.as_dict(), data.as_dict()]
    if population_year is not None and population_columns:
        pop_url = resolve_url(metadata_text, city=city, year=population_year, kind="population", base_url=base_url)
        pop = fetcher.fetch(pop_url)
        population = parse_population(_read_text(pop.path), city=city, year=population_year, columns=population_columns)
        records = merge_population(records, population, stats=stats)
        retrievals.append(pop.as_dict())
    return records, retrievals


def _read_text(path: Path) -> str:
    if path.suffix == ".gz":
        import gzip
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
            return handle.read()
    return path.read_text("utf-8", errors="replace")
