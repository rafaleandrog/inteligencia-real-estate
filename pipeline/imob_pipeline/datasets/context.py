"""Contexto compartilhado por uma execução: config, fetcher, saída, relógio e sumário."""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from ..config import Config
from ..fetch import Fetcher, now_iso
from ..records import RunSummary


def git_commit(repo_root: Path) -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo_root, capture_output=True, text=True, timeout=10)
        return out.stdout.strip() or "desconhecido"
    except (OSError, subprocess.SubprocessError):
        return "desconhecido"


@dataclass
class RunContext:
    config: Config
    fetcher: Fetcher
    out_dir: Path
    clock: Callable[[], str] = now_iso
    pipeline_commit: str = "desconhecido"
    summary: RunSummary = field(default_factory=RunSummary)
    log: logging.Logger = field(default_factory=lambda: logging.getLogger("imob_pipeline"))
    cache_dir: Path = field(default_factory=lambda: Path(".cache"))
    # Geometria H3 injetável: produção usa a biblioteca h3; fixture usa um mapa JSON (seam).
    hex_geometry: object | None = None
    # Motor de betweenness: "auto" (igraph se houver, senão puro), "igraph" ou "pure".
    centrality_engine: str = "auto"

    def now(self) -> str:
        return self.clock()

    def version_stamp(self) -> str:
        return self.now()[:10]
