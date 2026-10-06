"""Configuração do pipeline, lida de um TOML.

Nenhuma chave tem valor padrão no código: chave ausente FALHA nomeando a chave (R8.30 —
palpite silencioso recria o bug que a configuração existe para evitar). O arquivo de
produção é `pipeline/config/df.toml`; o de teste é `pipeline/config/fixture.toml`.
"""

from __future__ import annotations

import hashlib
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


class ConfigError(ValueError):
    """Chave ou seção ausente/inválida no TOML."""


def _section(raw: Mapping[str, Any], name: str) -> Mapping[str, Any]:
    if name not in raw or not isinstance(raw[name], Mapping):
        raise ConfigError(f"seção ausente no config: [{name}]")
    return raw[name]


def _require(section: Mapping[str, Any], section_name: str, key: str) -> Any:
    if key not in section:
        raise ConfigError(f"chave ausente no config: {section_name}.{key}")
    return section[key]


def _breaks(section: Mapping[str, Any], section_name: str) -> dict[str, list[float]]:
    raw = _require(section, section_name, "breaks")
    if not isinstance(raw, Mapping) or not raw:
        raise ConfigError(f"{section_name}.breaks precisa ser uma tabela métrica → lista crescente")
    out: dict[str, list[float]] = {}
    for metric, values in raw.items():
        if not isinstance(values, list) or len(values) < 1:
            raise ConfigError(f"{section_name}.breaks.{metric} precisa ser lista com ao menos um corte")
        floats = [float(v) for v in values]
        if any(b >= a for a, b in zip(floats[1:], floats[:-1])):
            raise ConfigError(f"{section_name}.breaks.{metric} precisa ser estritamente crescente")
        out[str(metric)] = floats
    return out


def _source(section: Mapping[str, Any], section_name: str) -> "SourceInfo":
    raw = _require(section, section_name, "source")
    sub = f"{section_name}.source"
    return SourceInfo(
        name=str(_require(raw, sub, "name")),
        url=str(_require(raw, sub, "url")),
        license=str(_require(raw, sub, "license")),
        attribution_pt=str(_require(raw, sub, "attribution_pt")),
        license_url=str(raw.get("license_url", "")) or None,
    )


@dataclass(frozen=True)
class SourceInfo:
    name: str
    url: str
    license: str
    attribution_pt: str
    license_url: str | None = None

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": self.name,
            "url": self.url,
            "license": self.license,
            "attribution_pt": self.attribution_pt,
        }
        if self.license_url:
            out["license_url"] = self.license_url
        return out


@dataclass(frozen=True)
class ProjectConfig:
    crs: str
    coordinate_decimals: int
    bbox: tuple[float, float, float, float]


@dataclass(frozen=True)
class RaConfig:
    geoportal_layer_url: str
    out_fields: str
    roman_key_prefix: str
    expected_count: int
    assignment_method: str
    page_size: int
    source: SourceInfo


@dataclass(frozen=True)
class HouseholdsConfig:
    base_url_2010: str
    base_url_2022: str
    quadrant_ids: tuple[str, ...]
    columns_2010: Mapping[str, str]
    columns_2022: Mapping[str, str]
    cell_area_km2: Mapping[str, float]
    drop_if_empty_both_years: bool
    breaks: Mapping[str, list[float]]
    budgets: Mapping[str, int]
    source_2010: SourceInfo
    source_2022: SourceInfo
    # Ressalvas do conjunto declaradas no config (ex.: universo de domicílios a confirmar), publicadas
    # em `quality_flags` e `notes_pt` do manifest (#164).
    dataset_flags: tuple[str, ...]
    notes_pt: str
    # Com True, `households_delta` e `households_growth_pct` dos agregados por RA saem nulos (flag
    # `households_growth_suppressed`): a comparação entre edições só volta quando o universo de 2010
    # for confirmado e o site mostrar a ressalva ao lado do número (#164, #166).
    suppress_growth_in_aggregates: bool


@dataclass(frozen=True)
class JobsConfig:
    metadata_url: str
    metadata_fallback_urls: tuple[str, ...]
    probe_urls: tuple[str, ...]
    city: str
    year: int
    previous_year: int
    # População e renda vêm de outro arquivo do AOP (`population_<ano>_<cidade>`, base Censo 2010).
    population_year: int
    population_columns: Mapping[str, str]
    h3_resolution: int
    overview_resolution: int
    columns: Mapping[str, str]
    detail_min_jobs: int
    breaks: Mapping[str, list[float]]
    budgets: Mapping[str, int]
    source: SourceInfo


@dataclass(frozen=True)
class CentralityConfig:
    pbf_url: str
    highway_filter: tuple[str, ...]
    sample_sources: int
    seed: int
    publish_min_percentile: float
    overview_min_percentile: float
    always_publish_highways: tuple[str, ...]
    simplify_tolerance_deg: float
    min_refresh_days: int
    breaks: Mapping[str, list[float]]
    budgets: Mapping[str, int]
    source: SourceInfo


@dataclass(frozen=True)
class ManifestConfig:
    budgets: Mapping[str, int]
    attribution_pt: str


@dataclass(frozen=True)
class Config:
    project: ProjectConfig
    ra: RaConfig
    households: HouseholdsConfig
    jobs: JobsConfig
    centrality: CentralityConfig
    manifest: ManifestConfig
    path: Path
    sha256: str


def _bbox(raw: Any) -> tuple[float, float, float, float]:
    if not isinstance(raw, list) or len(raw) != 4:
        raise ConfigError("project.bbox precisa ter 4 números: lon_min, lat_min, lon_max, lat_max")
    lon_min, lat_min, lon_max, lat_max = (float(v) for v in raw)
    if not (lon_min < lon_max and lat_min < lat_max):
        raise ConfigError("project.bbox com mínimo maior ou igual ao máximo")
    return (lon_min, lat_min, lon_max, lat_max)


def parse_config(raw: Mapping[str, Any], *, path: Path, sha256: str) -> Config:
    project = _section(raw, "project")
    ra = _section(raw, "ra")
    hh = _section(raw, "households_grid")
    jobs = _section(raw, "jobs_hex")
    cen = _section(raw, "road_centrality")
    man = _section(raw, "manifest")

    hh_sources = _require(hh, "households_grid", "sources")
    return Config(
        project=ProjectConfig(
            crs=str(_require(project, "project", "crs")),
            coordinate_decimals=int(_require(project, "project", "coordinate_decimals")),
            bbox=_bbox(_require(project, "project", "bbox")),
        ),
        ra=RaConfig(
            geoportal_layer_url=str(_require(ra, "ra", "geoportal_layer_url")),
            out_fields=str(_require(ra, "ra", "out_fields")),
            roman_key_prefix=str(_require(ra, "ra", "roman_key_prefix")),
            expected_count=int(_require(ra, "ra", "expected_count")),
            assignment_method=str(_require(ra, "ra", "assignment_method")),
            page_size=int(_require(ra, "ra", "page_size")),
            source=_source(ra, "ra"),
        ),
        households=HouseholdsConfig(
            base_url_2010=str(_require(hh, "households_grid", "base_url_2010")),
            base_url_2022=str(_require(hh, "households_grid", "base_url_2022")),
            quadrant_ids=tuple(str(q) for q in _require(hh, "households_grid", "quadrant_ids")),
            columns_2010=dict(_require(hh, "households_grid", "columns_2010")),
            columns_2022=dict(_require(hh, "households_grid", "columns_2022")),
            cell_area_km2={str(k): float(v) for k, v in _require(hh, "households_grid", "cell_area_km2").items()},
            drop_if_empty_both_years=bool(_require(hh, "households_grid", "drop_if_empty_both_years")),
            breaks=_breaks(hh, "households_grid"),
            budgets={str(k): int(v) for k, v in _require(hh, "households_grid", "budgets").items()},
            source_2010=_source({"source": _require(hh_sources, "households_grid.sources", "censo_2010")}, "households_grid.sources.censo_2010"),
            source_2022=_source({"source": _require(hh_sources, "households_grid.sources", "censo_2022")}, "households_grid.sources.censo_2022"),
            dataset_flags=tuple(str(f) for f in hh.get("dataset_flags", [])),
            notes_pt=str(hh.get("notes_pt", "")),
            suppress_growth_in_aggregates=bool(hh.get("suppress_growth_in_aggregates", False)),
        ),
        jobs=JobsConfig(
            metadata_url=str(_require(jobs, "jobs_hex", "metadata_url")),
            # Opcionais: candidatas tentadas após `metadata_url` e páginas sondadas quando todas falham (#164).
            metadata_fallback_urls=tuple(str(u) for u in jobs.get("metadata_fallback_urls", [])),
            probe_urls=tuple(str(u) for u in jobs.get("probe_urls", [])),
            city=str(_require(jobs, "jobs_hex", "city")),
            year=int(_require(jobs, "jobs_hex", "year")),
            previous_year=int(_require(jobs, "jobs_hex", "previous_year")),
            population_year=int(_require(jobs, "jobs_hex", "population_year")),
            population_columns=dict(_require(jobs, "jobs_hex", "population_columns")),
            h3_resolution=int(_require(jobs, "jobs_hex", "h3_resolution")),
            overview_resolution=int(_require(jobs, "jobs_hex", "overview_resolution")),
            columns=dict(_require(jobs, "jobs_hex", "columns")),
            detail_min_jobs=int(_require(jobs, "jobs_hex", "detail_min_jobs")),
            breaks=_breaks(jobs, "jobs_hex"),
            budgets={str(k): int(v) for k, v in _require(jobs, "jobs_hex", "budgets").items()},
            source=_source(jobs, "jobs_hex"),
        ),
        centrality=CentralityConfig(
            pbf_url=str(_require(cen, "road_centrality", "pbf_url")),
            highway_filter=tuple(str(h) for h in _require(cen, "road_centrality", "highway_filter")),
            sample_sources=int(_require(cen, "road_centrality", "sample_sources")),
            seed=int(_require(cen, "road_centrality", "seed")),
            publish_min_percentile=float(_require(cen, "road_centrality", "publish_min_percentile")),
            overview_min_percentile=float(_require(cen, "road_centrality", "overview_min_percentile")),
            always_publish_highways=tuple(str(h) for h in _require(cen, "road_centrality", "always_publish_highways")),
            simplify_tolerance_deg=float(_require(cen, "road_centrality", "simplify_tolerance_deg")),
            min_refresh_days=int(_require(cen, "road_centrality", "min_refresh_days")),
            breaks=_breaks(cen, "road_centrality"),
            budgets={str(k): int(v) for k, v in _require(cen, "road_centrality", "budgets").items()},
            source=_source(cen, "road_centrality"),
        ),
        manifest=ManifestConfig(
            budgets={str(k): int(v) for k, v in _require(man, "manifest", "budgets").items()},
            attribution_pt=str(_require(man, "manifest", "attribution_pt")),
        ),
        path=path,
        sha256=sha256,
    )


def load_config(path: str | Path) -> Config:
    p = Path(path)
    data = p.read_bytes()
    try:
        raw = tomllib.loads(data.decode("utf-8"))
    except tomllib.TOMLDecodeError as error:
        raise ConfigError(f"TOML inválido em {p}: {error}") from error
    return parse_config(raw, path=p, sha256=hashlib.sha256(data).hexdigest())
