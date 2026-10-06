import tempfile
import unittest
from pathlib import Path

from imob_pipeline.fetch import FixtureFetcher
from imob_pipeline.sources.aop import (
    AopError, FixtureHexGeometry, extract_links, load_landuse, load_metadata, merge_population, parse_landuse,
    parse_population, resolve_landuse_url, resolve_url,
)
from imob_pipeline.sources.geoportal_ra import to_polygons
from imob_pipeline.transforms.assign_ra import RaIndex
from imob_pipeline.transforms.jobs import build_jobs, class_or_absent

from .helpers import FIXTURES, ra_features

COLUMNS = {"hex": "id_hex", "jobs_total": "T001", "jobs_low": "T002", "jobs_mid": "T003", "jobs_high": "T004"}
POP_COLUMNS = {"hex": "id_hex", "pop": "P001", "income_avg": "R001", "income_decile": "R003"}
POP = dict(population_year=2010, population_columns=POP_COLUMNS)
META_URL = "https://www.ipea.gov.br/acessooportunidades/dados/metadata.csv"
BREAKS = {"jobs_total": [75, 125, 250, 500, 1000, 1500, 2000, 2500, 5000], "jobs_low": [25, 50, 100, 200, 400, 600, 800, 1000, 2000]}


class AopTests(unittest.TestCase):
    def test_resolve_from_metadata(self):
        meta = (FIXTURES / "aop_metadata.txt").read_text("utf-8")
        url = resolve_landuse_url(meta, city="bra", year=2019, base_url="https://x/dados/")
        self.assertEqual(url, "https://x/dados/aop_landuse_bra_2019.txt")
        self.assertEqual(resolve_url(meta, city="bra", year=2010, kind="population", base_url="https://x/dados/"),
                         "https://x/dados/aop_population_bra_2010.txt")
        with self.assertRaises(AopError):
            resolve_url(meta, city="bra", year=2019, kind="population", base_url="https://x/dados/")   # só há população de 2010
        with self.assertRaises(AopError) as caught:
            resolve_landuse_url(meta, city="bra", year=2030, base_url="https://x/dados/")
        self.assertIn("Linhas disponíveis", str(caught.exception))

    def test_parse_landuse_filters_city_and_year_and_names_missing_columns(self):
        text = (FIXTURES / "aop_landuse_bra_2019.txt").read_text("utf-8")
        records = parse_landuse(text, city="bra", year=2019, columns=COLUMNS)
        self.assertEqual(len(records), 5)   # linha de São Paulo fora
        first = {r.h3_index: r for r in records}["89a8c0a1b03ffff"]
        self.assertEqual((first.jobs_total, first.jobs_low, first.pop_total, first.income_decile), (1200, 400, None, None))
        with self.assertRaises(AopError) as caught:
            parse_landuse(text, city="bra", year=2019, columns={**COLUMNS, "jobs_total": "T999"})
        self.assertIn("T999", str(caught.exception))

    def test_parse_population_and_merge(self):
        text = (FIXTURES / "aop_population_bra_2010.txt").read_text("utf-8")
        population = parse_population(text, city="bra", year=2010, columns=POP_COLUMNS)
        self.assertEqual(population["89a8c0a1b03ffff"], {"pop_total": 820, "income_avg_brl": 2500.5, "income_decile": 7})
        self.assertNotIn("spo", {k[:3] for k in population})
        landuse = parse_landuse((FIXTURES / "aop_landuse_bra_2019.txt").read_text("utf-8"), city="bra", year=2019, columns=COLUMNS)
        stats: dict = {}
        merged = {r.h3_index: r for r in merge_population(landuse, population, stats=stats)}
        self.assertEqual((merged["89a8c0a1b03ffff"].pop_total, merged["89a8c0a1b03ffff"].income_decile), (820, 7))
        self.assertEqual(stats["population_matched"], len(landuse))
        self.assertEqual(stats["population_only_hexes"], 0)
        with self.assertRaises(AopError) as caught:
            parse_population(text, city="bra", year=2010, columns={**POP_COLUMNS, "pop": "P999"})
        self.assertIn("P999", str(caught.exception))

    def test_load_landuse_through_fixture_fetcher(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        records, retrievals = load_landuse(fetcher, metadata_url=META_URL, city="bra", year=2017, columns=COLUMNS)
        self.assertEqual(len(records), 3)
        self.assertEqual(len(retrievals), 2)
        self.assertTrue(all(r.pop_total is None for r in records))
        stats: dict = {}
        with_pop, retrievals = load_landuse(fetcher, metadata_url=META_URL, city="bra", year=2019, columns=COLUMNS, stats=stats, **POP)
        self.assertEqual(len(retrievals), 3)   # índice, uso do solo e população
        self.assertEqual(retrievals[2]["url"].rsplit("/", 1)[-1], "aop_population_bra_2010.txt")
        self.assertEqual({r.h3_index: r.pop_total for r in with_pop}["89a8c0a1b03ffff"], 820)
        self.assertEqual(stats["population_matched"], len(with_pop))

    def test_class_or_absent(self):
        self.assertIsNone(class_or_absent(0, BREAKS["jobs_total"], zero_is_absent=True))
        self.assertEqual(class_or_absent(0, BREAKS["jobs_total"], zero_is_absent=False), 0)
        self.assertEqual(class_or_absent(75, BREAKS["jobs_total"], zero_is_absent=True), 1)
        self.assertEqual(class_or_absent(5400, BREAKS["jobs_total"], zero_is_absent=True), 9)
        self.assertIsNone(class_or_absent(None, BREAKS["jobs_total"], zero_is_absent=True))

    def test_build_jobs_detail_overview_and_counts(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        main, _ = load_landuse(fetcher, metadata_url=META_URL, city="bra", year=2019, columns=COLUMNS, **POP)
        prev, _ = load_landuse(fetcher, metadata_url=META_URL, city="bra", year=2017, columns=COLUMNS)
        geometry = FixtureHexGeometry.from_file(FIXTURES / "hex_geometries.json")
        index = RaIndex(to_polygons(ra_features()), use_shapely=False)
        result = build_jobs(main, prev, geometry=geometry, overview_resolution=8, detail_min_jobs=1, breaks=BREAKS, assign_ra=index.assign)
        detail = {f["id"]: f["properties"] for f in result.detail}
        self.assertEqual(sorted(detail), ["89a8c0a1b03ffff", "89a8c0a1b07ffff", "89a8c0a1b0fffff", "89a8c0a1b13ffff"])
        self.assertEqual(result.counts["omitted_zero_jobs"], 1)
        self.assertEqual(result.counts["published"], 4)
        big = detail["89a8c0a1b0fffff"]
        self.assertEqual(big["class_jobs_total"], 9)
        self.assertEqual(big["ra_geo_id"], "RA_11")
        self.assertEqual(big["jobs_total_2017"], 5000)
        far = detail["89a8c0a1b13ffff"]
        self.assertIsNone(far["ra_geo_id"])
        self.assertIn("hex_missing_2017", far["quality_flags"])
        self.assertIsNone(far["jobs_total_2017"])
        self.assertIsNone(far["class_jobs_mid"] if "class_jobs_mid" in far else None)
        overview = {f["id"]: f["properties"] for f in result.overview}
        parent = overview["88a8c0a1b1fffff"]
        self.assertEqual(parent["hexes"], 3)
        self.assertEqual(parent["jobs_total"], 1260)
        self.assertEqual(parent["pop_total"], 2180)
        self.assertIsNone(parent["jobs_total_2017"])   # um filho sem 2017 → soma estrita nula
        self.assertNotIn("partial_children", parent["quality_flags"])
        self.assertEqual(parent["ra_geo_id"], "RA_19")
        self.assertEqual(parent["class_jobs_total"], 5)



class MetadataFallbackTests(unittest.TestCase):
    """`metadata.csv` do AOP: primeira URL que responde vence; sem nenhuma, o erro traz as tentativas e os
    links de dados das páginas sondadas (#164)."""

    def test_fallback_url_is_used_when_the_first_fails(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        records, retrievals = load_landuse(fetcher, metadata_url="https://exemplo.invalido/dados/metadata.csv",
                                           fallback_urls=[META_URL], city="bra", year=2017, columns=COLUMNS)
        self.assertEqual(len(records), 3)
        self.assertEqual(retrievals[0]["url"], META_URL)

    def test_extract_links_keeps_only_data_like_links_from_html_and_json(self):
        text = ('<a href="aop_landuse_2019_v2.csv">x</a> <a href="/outra/coisa.pdf">y</a> <a href="/sobre/">z</a> '
                '{"browser_download_url": "https://github.com/ipeaGIT/aopdata/releases/download/v1/metadata.csv"}')
        self.assertEqual(extract_links(text), ["aop_landuse_2019_v2.csv", "https://github.com/ipeaGIT/aopdata/releases/download/v1/metadata.csv"])

    def test_all_urls_failing_names_attempts_and_probe_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            page = Path(tmp) / "dados.html"
            page.write_text('<a href="aop_landuse_2019_v2.csv">x</a> <a href="leia.pdf">y</a>', "utf-8")
            fetcher = FixtureFetcher({"https://exemplo.invalido/dados/": page})
            with self.assertRaises(AopError) as caught:
                load_metadata(fetcher, metadata_url="https://exemplo.invalido/dados/metadata.csv",
                              fallback_urls=["https://exemplo.invalido/b/metadata.csv"],
                              probe_urls=["https://exemplo.invalido/dados/", "https://exemplo.invalido/sem-pagina/"])
        message = str(caught.exception)
        self.assertIn("exemplo.invalido/dados/metadata.csv", message)
        self.assertIn("exemplo.invalido/b/metadata.csv", message)
        self.assertIn("aop_landuse_2019_v2.csv", message)
        self.assertNotIn("leia.pdf", message)
        self.assertIn("sem-pagina", message)


if __name__ == "__main__":
    unittest.main()
