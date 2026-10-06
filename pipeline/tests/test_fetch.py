import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path

from imob_pipeline.fetch import FetchError, FixtureFetcher, FixtureMissing, HttpFetcher, cache_key, basename_of

from .helpers import FIXTURES


class FakeResponse(io.BytesIO):
    def __init__(self, data: bytes, headers: dict):
        super().__init__(data)
        self._headers = headers

    def getheader(self, name):
        return self._headers.get(name)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
        return False


class FetchTests(unittest.TestCase):
    def test_fixture_fetcher_refuses_unknown_url(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        with self.assertRaises(FixtureMissing):
            fetcher.fetch("https://example.invalid/nope")
        self.assertEqual(fetcher.calls, ["https://example.invalid/nope"])

    def test_fixture_fetcher_returns_mapped_file(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        url = next(iter(fetcher.mapping))
        retrieval = fetcher.fetch(url)
        self.assertTrue(retrieval.path.exists())
        self.assertEqual(retrieval.retrieved_at, "fixture")
        self.assertEqual(len(retrieval.sha256), 64)

    def test_http_fetcher_retries_then_caches_with_etag(self):
        calls = []
        sleeps = []

        def opener(request, timeout):
            calls.append(dict(request.header_items()))
            if len(calls) == 1:
                raise urllib.error.HTTPError(request.full_url, 503, "busy", {}, None)
            if "If-none-match" in calls[-1] or "If-None-Match" in calls[-1]:
                raise urllib.error.HTTPError(request.full_url, 304, "not modified", {}, None)
            return FakeResponse(b'{"ok":true}', {"ETag": '"abc"', "Last-Modified": "Mon, 01 Jan 2026 00:00:00 GMT"})

        with tempfile.TemporaryDirectory() as tmp:
            fetcher = HttpFetcher(tmp, retries=2, backoff=0.0, opener=opener, sleep=sleeps.append, clock=lambda: "2026-10-05T00:00:00Z")
            first = fetcher.fetch("https://example.invalid/data.json")
            self.assertEqual(first.path.read_bytes(), b'{"ok":true}')
            self.assertEqual(first.etag, '"abc"')
            self.assertFalse(first.from_cache)
            self.assertEqual(len(sleeps), 1)
            meta = json.loads(first.path.with_name("data.json.meta.json").read_text("utf-8"))
            self.assertEqual(meta["etag"], '"abc"')
            second = fetcher.fetch("https://example.invalid/data.json")
            self.assertTrue(second.from_cache)
            self.assertEqual(second.sha256, first.sha256)
            self.assertEqual(len(calls), 3)

    def test_http_fetcher_gives_up_after_retries(self):
        def opener(request, timeout):
            raise urllib.error.URLError("down")

        with tempfile.TemporaryDirectory() as tmp:
            fetcher = HttpFetcher(tmp, retries=1, backoff=0.0, opener=opener, sleep=lambda s: None)
            with self.assertRaises(FetchError):
                fetcher.fetch("https://example.invalid/x")

    def test_non_retryable_status_fails_at_once(self):
        calls = []

        def opener(request, timeout):
            calls.append(1)
            raise urllib.error.HTTPError(request.full_url, 404, "nope", {}, None)

        with tempfile.TemporaryDirectory() as tmp:
            fetcher = HttpFetcher(tmp, retries=3, backoff=0.0, opener=opener, sleep=lambda s: None)
            with self.assertRaises(FetchError):
                fetcher.fetch("https://example.invalid/x")
        self.assertEqual(len(calls), 1)

    def test_cache_key_and_basename(self):
        self.assertEqual(len(cache_key("https://a/b")), 16)
        self.assertEqual(basename_of("https://a/b/c.zip?x=1"), "c.zip")
        self.assertEqual(basename_of("https://a/"), "download")


if __name__ == "__main__":
    unittest.main()
