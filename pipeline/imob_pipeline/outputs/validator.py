"""O portão que a CI aplica a `data/public/` em toda PR (R2.8).

Cada checagem tem um teste que a planta quebrada e vê falhar (R8.23). O validador é
só‑stdlib; quando `jsonschema` está instalado, as propriedades também são conferidas contra
os JSON Schemas publicados em `data/public/schemas/` — sem ele, o relatório diz que essa
camada não rodou (R6.6: limitação se declara, não se mascara).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from ..geo import BBOX_MARGIN_DEG, bbox_contains_point, iter_positions, ring_closed
from ..transforms.classify import assign_class
from .manifest import FILE_ROLES, MANIFEST_NAME, MANIFEST_VERSION, content_hash

try:  # opcional: a CI instala, o sandbox pode não ter
    import jsonschema  # type: ignore
except ImportError:  # pragma: no cover - depende do ambiente
    jsonschema = None

ALLOWED_LOOSE = {"README.md", MANIFEST_NAME}
ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
SHA_PATTERN = re.compile(r"^[0-9a-f]{64}$")
PATH_PATTERN = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_./-]*\.json$")
DATASET_REQUIRED = (
    "id", "title_pt", "version", "generated_at", "content_hash", "years", "crs", "files", "sources",
    "method_pt", "counts", "quality_flags", "notes_pt",
)
FILE_REQUIRED = ("path", "role", "bytes", "budget_bytes", "sha256", "features")
SOURCE_REQUIRED = ("name", "url", "retrieved_at", "license", "attribution_pt")
AREA_GEOMETRIES = ("Polygon", "MultiPolygon")
LINE_GEOMETRIES = ("LineString", "MultiLineString")

# Os mesmos padrões da varredura de secret do CI (validate.yml), montados por concatenação
# para que este arquivo nunca contenha um literal que a própria varredura casaria.
SECRET_PATTERNS = (
    re.compile("sk-" + "[A-Za-z0-9_-]{20,}"),
    re.compile("github_" + "pat_[A-Za-z0-9_]{22,}"),
    re.compile("gh" + "[pousr]_[A-Za-z0-9]{30,}"),
    re.compile("AI" + "za[A-Za-z0-9_-]{35}"),
    re.compile("-----BEGIN " + "[A-Z ]*PRIVATE " + "KEY-----"),
)


@dataclass(frozen=True)
class Finding:
    level: str  # "erro" | "aviso" | "info"
    check: str
    message: str

    def __str__(self) -> str:
        return f"{self.level.upper():5} {self.check}: {self.message}"


def _reject_constant(value: str) -> None:
    raise ValueError(f"constante JSON inválida no arquivo: {value}")


def load_json_strict(path: Path) -> Any:
    return json.loads(path.read_text("utf-8"), parse_constant=_reject_constant)


def has_errors(findings: Iterable[Finding]) -> bool:
    return any(f.level == "erro" for f in findings)


def _safe_path(rel: str) -> bool:
    if not PATH_PATTERN.match(rel):
        return False
    parts = rel.split("/")
    return ".." not in parts and "" not in parts


def _is_area_dataset(dataset_id: str) -> bool:
    return dataset_id in ("households_grid", "jobs_hex")


def _is_line_dataset(dataset_id: str) -> bool:
    return dataset_id == "road_centrality"


def _check_geojson(dataset: dict[str, Any], entry: dict[str, Any], payload: Any, *, decimals: int,
                   bbox: tuple[float, float, float, float] | None) -> list[Finding]:
    out: list[Finding] = []
    path = entry["path"]
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        return [Finding("erro", "geojson", f"{path}: não é uma FeatureCollection")]
    dataset_id = dataset["id"]
    allowed = AREA_GEOMETRIES if _is_area_dataset(dataset_id) else LINE_GEOMETRIES if _is_line_dataset(dataset_id) else AREA_GEOMETRIES + LINE_GEOMETRIES
    seen: set[str] = set()
    breaks = dataset.get("class_breaks") or {}
    for index, feature in enumerate(payload["features"]):
        fid = feature.get("id")
        if not isinstance(fid, str) or not fid:
            out.append(Finding("erro", "geojson", f"{path}: feição #{index} sem id string"))
            continue
        if fid in seen:
            out.append(Finding("erro", "geojson", f"{path}: id repetido {fid}"))
        seen.add(fid)
        geometry = feature.get("geometry") or {}
        kind = geometry.get("type")
        if kind not in allowed:
            out.append(Finding("erro", "geojson", f"{path}: {fid} tem geometria {kind}, esperado {'/'.join(allowed)}"))
            continue
        rings: list = []
        if kind == "Polygon":
            rings = geometry["coordinates"]
        elif kind == "MultiPolygon":
            rings = [ring for polygon in geometry["coordinates"] for ring in polygon]
        for ring in rings:
            if not ring_closed(ring):
                out.append(Finding("erro", "geojson", f"{path}: {fid} tem anel aberto ou com menos de 4 posições"))
                break
        for position in iter_positions(geometry):
            lon, lat = float(position[0]), float(position[1])
            # Espelha o escritor (`round(v, decimals)`): multiplicar por 10^decimals e comparar reprovava
            # valores legítimos de 5 casas (ex.: -16.06) por erro de ponto flutuante (#164).
            if round(lon, decimals) != lon or round(lat, decimals) != lat:
                out.append(Finding("erro", "geojson", f"{path}: {fid} tem coordenada com mais de {decimals} casas"))
                break
            if bbox and not bbox_contains_point(bbox, (lon, lat), BBOX_MARGIN_DEG):
                out.append(Finding("erro", "geojson", f"{path}: {fid} fora do bbox configurado ({lon}, {lat})"))
                break
        props = feature.get("properties")
        if not isinstance(props, dict):
            out.append(Finding("erro", "geojson", f"{path}: {fid} sem properties"))
            continue
        for metric, spec in breaks.items():
            cuts = spec.get("breaks") if isinstance(spec, dict) else spec
            zero_absent = bool(spec.get("zero_is_absent")) if isinstance(spec, dict) else False
            class_key = f"class_{metric}"
            if class_key in props and metric in props:
                expected = None if (zero_absent and props[metric] == 0) else assign_class(props[metric], cuts)
                if props[class_key] != expected:
                    out.append(Finding("erro", "classes", f"{path}: {fid} publica {class_key}={props[class_key]} mas os cortes dão {expected}"))
    return out


def _check_crosswalk(payload: Any, counts: dict[str, Any]) -> list[Finding]:
    out: list[Finding] = []
    rows = payload.get("rows") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or not rows:
        return [Finding("erro", "crosswalk", "ra_crosswalk.json sem rows")]
    expected = counts.get("ras")
    if expected is not None and len(rows) != expected:
        out.append(Finding("erro", "crosswalk", f"{len(rows)} linhas, manifest declara {expected}"))
    for key in ("ra_number", "ra_geo_id", "ra_geo_id_roman", "ra_code"):
        values = [r.get(key) for r in rows]
        if len(set(values)) != len(values) or any(v in (None, "") for v in values):
            out.append(Finding("erro", "crosswalk", f"{key} repetido ou vazio"))
    for row in rows:
        number = row.get("ra_number")
        if not isinstance(number, int) or row.get("ra_geo_id") != "RA_" + ("0" + str(number))[-2:]:
            out.append(Finding("erro", "crosswalk", f"ra_geo_id não casa com ra_number na linha {row.get('ra_number')}"))
            break
    return out


def _check_aggregates(payload: Any, crosswalk_ids: set[str] | None) -> list[Finding]:
    out: list[Finding] = []
    rows = payload.get("rows") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return [Finding("erro", "aggregates", "ra_aggregates.json sem rows")]
    ids = [r.get("ra_geo_id") for r in rows]
    if len(set(ids)) != len(ids):
        out.append(Finding("erro", "aggregates", "ra_geo_id repetido"))
    if crosswalk_ids is not None:
        unknown = sorted(i for i in ids if i not in crosswalk_ids)
        if unknown:
            out.append(Finding("erro", "aggregates", f"RA fora da ponte: {unknown}"))
    return out


_VALIDATORS: dict[Path, Any] = {}


def _compiled_validator(schema_path: Path) -> Any:
    """Um validador compilado por schema: validar 50 mil feições relendo o arquivo a cada uma
    era o que fazia o laço parecer caro demais para cobrir tudo."""
    validator = _VALIDATORS.get(schema_path)
    if validator is None:
        schema = json.loads(schema_path.read_text("utf-8"))
        validator = jsonschema.Draft202012Validator(schema)
        _VALIDATORS[schema_path] = validator
    return validator


def _schema_validate(schemas_dir: Path | None, schema_rel: str | None, instance: Any, label: str) -> list[Finding]:
    if jsonschema is None or not schemas_dir or not schema_rel:
        return []
    schema_path = schemas_dir.parent / schema_rel if schema_rel.startswith("schemas/") else schemas_dir / schema_rel
    if not schema_path.exists():
        return [Finding("erro", "schema", f"{label}: schema ausente {schema_rel}")]
    validator = _compiled_validator(schema_path)
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.path))
    out = []
    for error in errors[:20]:
        where = "/".join(str(p) for p in error.path) or "(raiz)"
        out.append(Finding("erro", "schema", f"{label}: {where}: {error.message}"))
    return out


def validate_public_dir(public_dir: str | Path, *, bbox: tuple[float, float, float, float] | None = None,
                        decimals: int = 5) -> list[Finding]:
    root = Path(public_dir)
    findings: list[Finding] = []
    if not root.exists():
        return [Finding("erro", "dir", f"diretório ausente: {root}")]
    schemas_dir = root / "schemas"
    manifest_path = root / MANIFEST_NAME
    present = sorted(p for p in root.rglob("*") if p.is_file())
    loose = [p for p in present if not str(p.relative_to(root)).startswith("schemas/")]

    if not manifest_path.exists():
        extra = [str(p.relative_to(root)) for p in loose if p.name not in ALLOWED_LOOSE]
        if extra:
            findings.append(Finding("erro", "manifest", f"arquivos sem manifest: {extra}"))
        else:
            findings.append(Finding("info", "manifest", "diretório vazio antes da primeira execução — ok"))
        return findings

    try:
        manifest = load_json_strict(manifest_path)
    except (ValueError, UnicodeDecodeError) as error:
        return [Finding("erro", "manifest", f"manifest.json inválido: {error}")]
    if jsonschema is None:
        findings.append(Finding("info", "schema", "jsonschema ausente: validação por schema não rodou"))
    if not schemas_dir.is_dir():
        # Diretório gerado fora de data/public (fixtures de teste do site): os schemas moram
        # só no repositório. Dizer que não rodou é informação; falhar seria recusar um
        # diretório íntegro por um arquivo que ele nunca deveria carregar.
        findings.append(Finding("info", "schema", "schemas/ ausente neste diretório: validação por schema não rodou"))
        schemas_dir = None
    findings.extend(_schema_validate(schemas_dir, "schemas/manifest.schema.json", manifest, "manifest.json"))

    if manifest.get("manifest_version") != MANIFEST_VERSION:
        findings.append(Finding("erro", "manifest", f"manifest_version {manifest.get('manifest_version')} ≠ {MANIFEST_VERSION}"))
    for key in ("generated_at", "pipeline_version", "pipeline_commit", "config_sha256", "attribution_pt", "datasets"):
        if key not in manifest:
            findings.append(Finding("erro", "manifest", f"chave ausente: {key}"))
    datasets = manifest.get("datasets")
    if not isinstance(datasets, list):
        return findings + [Finding("erro", "manifest", "datasets precisa ser lista")]

    listed: set[str] = set()
    crosswalk_ids: set[str] | None = None
    aggregates_payload: Any = None
    seen_ids: set[str] = set()
    for dataset in datasets:
        if not isinstance(dataset, dict):
            findings.append(Finding("erro", "manifest", "dataset que não é objeto"))
            continue
        dataset_id = str(dataset.get("id", "?"))
        if dataset_id in seen_ids:
            findings.append(Finding("erro", "manifest", f"dataset repetido: {dataset_id}"))
        seen_ids.add(dataset_id)
        if not ID_PATTERN.match(dataset_id):
            findings.append(Finding("erro", "manifest", f"id de dataset inválido: {dataset_id!r}"))
        for key in DATASET_REQUIRED:
            if key not in dataset:
                findings.append(Finding("erro", "manifest", f"{dataset_id}: chave ausente {key}"))
        for source in dataset.get("sources", []) or []:
            for key in SOURCE_REQUIRED:
                if key not in source:
                    findings.append(Finding("erro", "manifest", f"{dataset_id}: fonte sem {key}"))
            url = str(source.get("url", ""))
            if not (url.startswith("https://") or url.startswith("http://")):
                findings.append(Finding("erro", "manifest", f"{dataset_id}: url de fonte inválida {url!r}"))
        for metric, spec in (dataset.get("class_breaks") or {}).items():
            cuts = spec.get("breaks") if isinstance(spec, dict) else spec
            if not isinstance(cuts, list) or any(b >= a for a, b in zip(cuts[1:], cuts[:-1])):
                findings.append(Finding("erro", "classes", f"{dataset_id}: cortes de {metric} não são crescentes"))
        files = dataset.get("files")
        if not isinstance(files, list) or not files:
            findings.append(Finding("erro", "manifest", f"{dataset_id}: sem files"))
            continue
        if dataset.get("content_hash") != content_hash([f for f in files if isinstance(f, dict) and "path" in f and "sha256" in f]):
            findings.append(Finding("erro", "manifest", f"{dataset_id}: content_hash não confere"))
        shard_total = 0
        has_shards = False
        for entry in files:
            if not isinstance(entry, dict):
                findings.append(Finding("erro", "manifest", f"{dataset_id}: arquivo que não é objeto"))
                continue
            missing = [k for k in FILE_REQUIRED if k not in entry]
            if missing:
                findings.append(Finding("erro", "manifest", f"{dataset_id}: arquivo sem {missing}"))
                continue
            rel = str(entry["path"])
            if not _safe_path(rel):
                findings.append(Finding("erro", "manifest", f"{dataset_id}: caminho inválido {rel!r}"))
                continue
            if entry["role"] not in FILE_ROLES:
                findings.append(Finding("erro", "manifest", f"{dataset_id}: role inválido {entry['role']!r} em {rel}"))
            if not SHA_PATTERN.match(str(entry["sha256"])):
                findings.append(Finding("erro", "manifest", f"{dataset_id}: sha256 inválido em {rel}"))
            listed.add(rel)
            full = root / rel
            if not full.exists():
                findings.append(Finding("erro", "arquivo", f"{rel}: listado no manifest mas ausente"))
                continue
            data = full.read_bytes()
            import hashlib
            if len(data) != entry["bytes"]:
                findings.append(Finding("erro", "arquivo", f"{rel}: {len(data)} bytes, manifest diz {entry['bytes']}"))
            if hashlib.sha256(data).hexdigest() != entry["sha256"]:
                findings.append(Finding("erro", "arquivo", f"{rel}: sha256 não confere com o manifest"))
            if len(data) > int(entry["budget_bytes"]):
                findings.append(Finding("erro", "orcamento", f"{rel}: {len(data)} bytes acima do orçamento {entry['budget_bytes']}"))
            text = data.decode("utf-8", errors="replace")
            for pattern in SECRET_PATTERNS:
                if pattern.search(text):
                    findings.append(Finding("erro", "secret", f"{rel}: conteúdo casa um padrão de credencial"))
                    break
            try:
                payload = load_json_strict(full)
            except (ValueError, UnicodeDecodeError) as error:
                findings.append(Finding("erro", "arquivo", f"{rel}: JSON inválido ({error})"))
                continue
            if isinstance(payload, dict) and payload.get("type") == "FeatureCollection":
                actual = len(payload.get("features", []))
                findings.extend(_check_geojson(dataset, entry, payload, decimals=decimals, bbox=bbox))
                # TODA feição passa pelo schema (achado do Codex na PR #157: um teto de 5.000
                # deixava o resto do arquivo entrar sem contrato). O laço para na primeira
                # feição inválida — basta uma para reprovar o arquivo.
                for feature in payload.get("features", []):
                    props = feature.get("properties") if isinstance(feature, dict) else None
                    if isinstance(props, dict):
                        findings.extend(_schema_validate(schemas_dir, dataset.get("schema"), props, f"{rel}#{feature.get('id')}"))
                        if findings and findings[-1].check == "schema":
                            break
            elif isinstance(payload, dict) and isinstance(payload.get("rows"), list):
                actual = len(payload["rows"])
                findings.extend(_schema_validate(schemas_dir, dataset.get("schema"), payload, rel))
                if dataset_id == "ra_crosswalk":
                    findings.extend(_check_crosswalk(payload, dataset.get("counts") or {}))
                    crosswalk_ids = {str(r.get("ra_geo_id")) for r in payload["rows"]}
                elif dataset_id == "ra_aggregates":
                    aggregates_payload = payload
            else:
                actual = 0
                findings.append(Finding("erro", "arquivo", f"{rel}: nem FeatureCollection nem objeto com rows"))
            if actual != int(entry["features"]):
                findings.append(Finding("erro", "arquivo", f"{rel}: {actual} feições/linhas, manifest diz {entry['features']}"))
            if entry["role"] == "detail_shard":
                has_shards = True
                shard_total += actual
        published = (dataset.get("counts") or {}).get("published")
        if has_shards and isinstance(published, int) and shard_total != published:
            findings.append(Finding("erro", "shards", f"{dataset_id}: shards somam {shard_total}, counts.published diz {published}"))

    if aggregates_payload is not None:
        findings.extend(_check_aggregates(aggregates_payload, crosswalk_ids))

    for file in loose:
        rel = str(file.relative_to(root))
        if rel not in listed and file.name not in ALLOWED_LOOSE:
            findings.append(Finding("erro", "arquivo", f"{rel}: existe no diretório mas não está no manifest"))
    if not has_errors(findings):
        findings.append(Finding("info", "resultado", f"{len(listed)} arquivo(s) conferido(s) sem erro"))
    return findings
