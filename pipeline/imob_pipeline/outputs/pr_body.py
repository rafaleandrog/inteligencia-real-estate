"""Corpo da PR automática: o que mudou, de onde veio, quanto pesa."""

from __future__ import annotations

from typing import Any


def _size(num_bytes: int) -> str:
    if num_bytes >= 1_000_000:
        return f"{num_bytes / 1_000_000:.1f} MB"
    if num_bytes >= 1_000:
        return f"{num_bytes / 1_000:.0f} kB"
    return f"{num_bytes} B"


def render_pr_body(manifest: dict[str, Any], summary: dict[str, Any] | None = None) -> str:
    lines = [
        "## Dados públicos — atualização automática",
        "",
        f"Gerado em `{manifest.get('generated_at', '?')}` pelo pipeline `{manifest.get('pipeline_version', '?')}` "
        f"(commit `{str(manifest.get('pipeline_commit', '?'))[:12]}`).",
        "",
        "PR só de dados: `data/public/` + manifest. Validador e testes de integridade rodam na CI; "
        "não exige revisão do Codex (docs/ENGINEERING_RULES.md, R7.2).",
        "",
        "| Dataset | Versão | Arquivos | Tamanho | Feições | Fontes |",
        "|---|---|---|---|---|---|",
    ]
    for dataset in manifest.get("datasets", []):
        files = dataset.get("files", [])
        total = sum(int(f.get("bytes", 0)) for f in files)
        features = sum(int(f.get("features", 0)) for f in files)
        sources = "; ".join(s.get("name", "?") for s in dataset.get("sources", []))
        lines.append(
            f"| `{dataset.get('id')}` | {dataset.get('version')} | {len(files)} | {_size(total)} | {features} | {sources} |"
        )
    lines.append("")
    for dataset in manifest.get("datasets", []):
        counts = dataset.get("counts") or {}
        flags = dataset.get("quality_flags") or []
        if counts or flags:
            lines.append(f"### `{dataset.get('id')}`")
            for key in sorted(counts):
                lines.append(f"- {key}: {counts[key]}")
            if flags:
                lines.append(f"- quality_flags: {', '.join(flags)}")
            lines.append("")
    if summary:
        lines.append("### Execução")
        for dataset_id in sorted(summary):
            info = summary[dataset_id]
            if not isinstance(info, dict):
                continue
            parts = [f"{k}={v}" for k, v in sorted(info.items()) if not isinstance(v, (dict, list))]
            lines.append(f"- `{dataset_id}`: " + ", ".join(parts))
        lines.append("")
    lines.append("Atribuição: " + str(manifest.get("attribution_pt", "")))
    lines.append("")
    return "\n".join(lines)
