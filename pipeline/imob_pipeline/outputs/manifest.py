"""`manifest.json`: procedência, hash e orçamento de cada arquivo publicado.

Um dataset cujo `content_hash` (sha256 dos sha256 dos arquivos, em ordem de caminho) não
mudou preserva `version` e `generated_at` da versão anterior; o `generated_at` do manifest
só avança quando algum dataset mudou. Mês sem mudança = bytes idênticos = diff zero = sem PR.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .. import __version__
from .geojson import write_json

MANIFEST_VERSION = 1
MANIFEST_NAME = "manifest.json"
FILE_ROLES = ("overview", "detail", "detail_shard", "data")


def file_entry(public_dir: Path, rel_path: str, *, role: str, budget_bytes: int,
               features: int | None = None, bbox: list[float] | None = None,
               shard_key: str | None = None, shard_value: str | None = None,
               zoom_min: int | None = None) -> dict[str, Any]:
    if role not in FILE_ROLES:
        raise ValueError(f"role de arquivo desconhecido: {role}")
    full = public_dir / rel_path
    data = full.read_bytes()
    entry: dict[str, Any] = {
        "path": rel_path.replace("\\", "/"),
        "role": role,
        "bytes": len(data),
        "budget_bytes": int(budget_bytes),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    if features is None:
        features = count_features(data)
    entry["features"] = int(features)
    if bbox:
        entry["bbox"] = bbox
    if shard_key:
        entry["shard_key"] = shard_key
        entry["shard_value"] = shard_value
    if zoom_min is not None:
        entry["zoom_min"] = int(zoom_min)
    return entry


def count_features(data: bytes) -> int:
    payload = json.loads(data.decode("utf-8"))
    if isinstance(payload, dict):
        if payload.get("type") == "FeatureCollection":
            return len(payload.get("features", []))
        if isinstance(payload.get("rows"), list):
            return len(payload["rows"])
    return 0


def content_hash(files: list[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for entry in sorted(files, key=lambda f: f["path"]):
        digest.update(f"{entry['path']}:{entry['sha256']}\n".encode("utf-8"))
    return digest.hexdigest()


def dataset_entry(*, dataset_id: str, title_pt: str, version: str, generated_at: str,
                  files: list[dict[str, Any]], sources: list[dict[str, Any]], years: list[int],
                  crs: str, bbox: list[float] | None, method_pt: str, ra_assignment_method: str | None,
                  class_breaks: dict[str, Any] | None, counts: dict[str, Any], quality_flags: list[str],
                  notes_pt: str, schema: str | None = None) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "id": dataset_id,
        "title_pt": title_pt,
        "version": version,
        "generated_at": generated_at,
        "content_hash": content_hash(files),
        "years": years,
        "crs": crs,
        "files": sorted(files, key=lambda f: f["path"]),
        "sources": sources,
        "method_pt": method_pt,
        "counts": counts,
        "quality_flags": sorted(set(quality_flags)),
        "notes_pt": notes_pt,
    }
    if schema:
        entry["schema"] = schema
    if bbox:
        entry["bbox"] = bbox
    if ra_assignment_method:
        entry["ra_assignment_method"] = ra_assignment_method
    if class_breaks:
        entry["class_breaks"] = class_breaks
    return entry


def read_manifest(public_dir: Path) -> dict[str, Any] | None:
    path = public_dir / MANIFEST_NAME
    if not path.exists():
        return None
    return json.loads(path.read_text("utf-8"))


def merge_dataset(previous: dict[str, Any] | None, entry: dict[str, Any]) -> dict[str, Any]:
    """Preserva version/generated_at quando o conteúdo não mudou."""
    if previous and previous.get("content_hash") == entry["content_hash"]:
        merged = dict(entry)
        merged["version"] = previous.get("version", entry["version"])
        merged["generated_at"] = previous.get("generated_at", entry["generated_at"])
        return merged
    return entry


def upsert_manifest(public_dir: Path, entry: dict[str, Any], *, generated_at: str,
                    pipeline_commit: str, config_sha256: str, attribution_pt: str) -> dict[str, Any]:
    previous = read_manifest(public_dir) or {}
    datasets = {d["id"]: d for d in previous.get("datasets", []) if isinstance(d, dict) and "id" in d}
    merged = merge_dataset(datasets.get(entry["id"]), entry)
    changed = datasets.get(entry["id"]) != merged
    datasets[entry["id"]] = merged
    manifest = {
        "manifest_version": MANIFEST_VERSION,
        "generated_at": generated_at if changed or not previous.get("generated_at") else previous["generated_at"],
        "pipeline_version": __version__,
        "pipeline_commit": pipeline_commit,
        "config_sha256": config_sha256,
        "attribution_pt": attribution_pt,
        "datasets": [datasets[key] for key in sorted(datasets)],
    }
    write_json(public_dir / MANIFEST_NAME, manifest, indent=2)
    return manifest


def write_empty_manifest(public_dir: Path, *, generated_at: str, pipeline_commit: str,
                         config_sha256: str, attribution_pt: str) -> dict[str, Any]:
    """`manifest.json` com `datasets: []` — o estado ANTES da primeira execução real.

    Existe para o site nunca pedir um arquivo que não existe: um 404 de `manifest.json` é
    um erro no console em toda abertura de página, e o smoke test (com razão) não o filtra.
    Com o manifest vazio o cliente lê "publicado sem nenhum conjunto" e desliga as camadas
    dizendo por quê. Recusa sobrescrever um manifest que já lista datasets — apagar dado
    publicado é trabalho do pipeline, não de um comando de inicialização.
    """
    previous = read_manifest(public_dir)
    if previous and previous.get("datasets"):
        raise FileExistsError(f"{public_dir / MANIFEST_NAME} já lista {len(previous['datasets'])} dataset(s); nada feito")
    manifest = {
        "manifest_version": MANIFEST_VERSION,
        "generated_at": generated_at,
        "pipeline_version": __version__,
        "pipeline_commit": pipeline_commit,
        "config_sha256": config_sha256,
        "attribution_pt": attribution_pt,
        "datasets": [],
    }
    write_json(public_dir / MANIFEST_NAME, manifest, indent=2)
    return manifest
