"""Download com cache, ETag e retentativa — e um Fetcher de fixture que NUNCA toca a rede.

`HttpFetcher` grava em `<cache>/<sha256(url)[:16]>/<nome>` com um `.meta.json` ao lado
(url, etag, last_modified, retrieved_at, bytes, sha256). Reexecução faz GET condicional;
`refresh=True` ignora o cache. `FixtureFetcher` só conhece as URLs que o teste mapeou e lança
`FixtureMissing` para qualquer outra: um teste que chegasse à rede por engano falha alto.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Mapping, Protocol

from . import __version__

USER_AGENT = f"imob-pipeline/{__version__} (+https://github.com/rafaleandrog/inteligencia-real-estate)"
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


class FetchError(RuntimeError):
    """Falha definitiva de download (depois das retentativas)."""


class FixtureMissing(FetchError):
    """URL pedida que o fixture não mapeia — o teste tentou ir à rede."""


def sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class Retrieval:
    url: str
    path: Path
    retrieved_at: str
    sha256: str
    bytes: int
    etag: str | None = None
    last_modified: str | None = None
    from_cache: bool = False

    def as_dict(self) -> dict:
        out = {
            "url": self.url,
            "retrieved_at": self.retrieved_at,
            "sha256": self.sha256,
            "bytes": self.bytes,
        }
        if self.etag:
            out["etag"] = self.etag
        if self.last_modified:
            out["last_modified"] = self.last_modified
        return out


class Fetcher(Protocol):
    def fetch(self, url: str, *, dest_name: str | None = None) -> Retrieval: ...


def cache_key(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def basename_of(url: str) -> str:
    path = urllib.parse.urlparse(url).path
    name = path.rstrip("/").rsplit("/", 1)[-1] if path else ""
    return name or "download"


class HttpFetcher:
    """Download HTTP(S) com cache em disco."""

    def __init__(
        self,
        cache_dir: str | Path,
        *,
        timeout: float = 120.0,
        retries: int = 5,
        backoff: float = 2.0,
        refresh: bool = False,
        opener: Callable[..., object] | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], str] = now_iso,
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.timeout = timeout
        self.retries = retries
        self.backoff = backoff
        self.refresh = refresh
        self._opener = opener or urllib.request.urlopen
        self._sleep = sleep
        self._clock = clock

    def _paths(self, url: str, dest_name: str | None) -> tuple[Path, Path]:
        folder = self.cache_dir / cache_key(url)
        dest = folder / (dest_name or basename_of(url))
        return dest, dest.with_name(dest.name + ".meta.json")

    def discard(self, url: str, *, dest_name: str | None = None) -> bool:
        """Tira um download do cache (arquivo, meta e parcial). A descoberta de quadrantes da Grade
        usa isto para não guardar o que ficou fora do bbox. Devolve se havia algo."""
        dest, meta_path = self._paths(url, dest_name)
        existed = False
        for path in (dest, meta_path, dest.with_name(dest.name + ".part")):
            if path.exists():
                path.unlink()
                existed = True
        return existed

    def fetch(self, url: str, *, dest_name: str | None = None) -> Retrieval:
        dest, meta_path = self._paths(url, dest_name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        meta: dict = {}
        if meta_path.exists() and dest.exists():
            try:
                meta = json.loads(meta_path.read_text("utf-8"))
            except json.JSONDecodeError:
                meta = {}

        headers = {"User-Agent": USER_AGENT}
        if meta and not self.refresh:
            if meta.get("etag"):
                headers["If-None-Match"] = meta["etag"]
            if meta.get("last_modified"):
                headers["If-Modified-Since"] = meta["last_modified"]

        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            request = urllib.request.Request(url, headers=headers)
            try:
                with self._opener(request, timeout=self.timeout) as response:  # type: ignore[call-arg]
                    return self._store(url, dest, meta_path, response)
            except urllib.error.HTTPError as error:
                if error.code == 304 and meta and dest.exists():
                    return Retrieval(
                        url=url, path=dest, retrieved_at=meta.get("retrieved_at", self._clock()),
                        sha256=meta.get("sha256", sha256_of_file(dest)), bytes=dest.stat().st_size,
                        etag=meta.get("etag"), last_modified=meta.get("last_modified"), from_cache=True,
                    )
                last_error = error
                if error.code not in RETRY_STATUSES:
                    raise FetchError(f"HTTP {error.code} em {url}") from error
            except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
                last_error = error
            if attempt < self.retries:
                self._sleep(self.backoff * (2 ** attempt))
        raise FetchError(f"download falhou após {self.retries + 1} tentativas: {url} ({last_error})")

    def _store(self, url: str, dest: Path, meta_path: Path, response) -> Retrieval:
        part = dest.with_name(dest.name + ".part")
        digest = hashlib.sha256()
        size = 0
        with part.open("wb") as handle:
            for chunk in iter(lambda: response.read(1 << 20), b""):
                handle.write(chunk)
                digest.update(chunk)
                size += len(chunk)
        part.replace(dest)
        getheader = getattr(response, "getheader", None) or (lambda name: response.headers.get(name))  # type: ignore[attr-defined]
        meta = {
            "url": url,
            "etag": getheader("ETag"),
            "last_modified": getheader("Last-Modified"),
            "retrieved_at": self._clock(),
            "bytes": size,
            "sha256": digest.hexdigest(),
        }
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2, sort_keys=True), "utf-8")
        return Retrieval(
            url=url, path=dest, retrieved_at=meta["retrieved_at"], sha256=meta["sha256"], bytes=size,
            etag=meta["etag"], last_modified=meta["last_modified"], from_cache=False,
        )


class FixtureFetcher:
    """Devolve arquivos locais por URL exata; qualquer outra URL lança `FixtureMissing`."""

    def __init__(self, mapping: Mapping[str, str | Path], *, base_dir: str | Path | None = None,
                 retrieved_at: str = "fixture") -> None:
        self.base_dir = Path(base_dir) if base_dir else None
        self.mapping = {str(url): Path(path) for url, path in mapping.items()}
        self.retrieved_at = retrieved_at
        self.calls: list[str] = []

    @classmethod
    def from_dir(cls, fixture_dir: str | Path, index_name: str = "fixture_urls.json") -> "FixtureFetcher":
        base = Path(fixture_dir)
        index = json.loads((base / index_name).read_text("utf-8"))
        return cls(index, base_dir=base)

    def fetch(self, url: str, *, dest_name: str | None = None) -> Retrieval:
        self.calls.append(url)
        if url not in self.mapping:
            raise FixtureMissing(f"URL sem fixture (o teste tentou ir à rede?): {url}")
        path = self.mapping[url]
        if self.base_dir and not path.is_absolute():
            path = self.base_dir / path
        if not path.exists():
            raise FixtureMissing(f"fixture mapeada mas ausente em disco: {path}")
        return Retrieval(
            url=url, path=path, retrieved_at=self.retrieved_at, sha256=sha256_of_file(path),
            bytes=path.stat().st_size, from_cache=True,
        )
