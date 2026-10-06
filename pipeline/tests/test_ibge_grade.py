import json
import unittest

from imob_pipeline.fetch import FixtureFetcher
import tempfile
import unittest.mock
import zipfile
from dataclasses import replace
from importlib.util import find_spec
from pathlib import Path

from imob_pipeline.datasets import households_grid
from imob_pipeline.sources.ibge_grade import (
    GradeError, discover, file_bounds, load_edition, parse_dir_links, parse_listing, parse_other_links, quadrant_urls,
    read_grid_file, records_from_geojson, resolve_quadrants, to_wgs84_bounds,
)

from .helpers import FIXTURES, PROD_CONFIG, fixture_context
from imob_pipeline.config import load_config

COLUMNS = {"cell_id": "ID_UNICO", "parent_1km": "nome_1KM", "pop": "POP", "dom_ocu": "DOM_OCU"}
BASE_2010 = "https://geoftp.ibge.gov.br/recortes_para_fins_estatisticos/grade_estatistica/censo_2010/"
BASE_2022 = "https://geoftp.ibge.gov.br/recortes_para_fins_estatisticos/grade_estatistica/censo_2022/"
DF_BBOX = (-48.30, -16.06, -47.30, -15.48)
BASE_DIRS = "https://geoftp.ibge.gov.br/recortes_para_fins_estatisticos/grade_estatistica/censo_2022_dirs/"


class GradeSourceTests(unittest.TestCase):
    def test_parse_listing_dedupes_and_sorts(self):
        html = (FIXTURES / "grade_listing.html").read_text("utf-8")
        self.assertEqual(parse_listing(html), ["grade_id45.zip", "grade_id46.zip"])

    def test_quadrant_urls(self):
        self.assertEqual(quadrant_urls(BASE_2010, ["grade_id45", "grade_id46.zip"]),
                         [BASE_2010 + "grade_id45.zip", BASE_2010 + "grade_id46.zip"])

    def test_missing_columns_name_what_was_found(self):
        payload = {"features": [{"properties": {"ID": "x", "POP": 1}, "geometry": None}]}
        with self.assertRaises(GradeError) as caught:
            records_from_geojson(payload, COLUMNS, "teste")
        self.assertIn("ID_UNICO", str(caught.exception))
        self.assertIn("encontradas", str(caught.exception))

    def test_suppressed_values_become_none_and_flag(self):
        payload = json.loads((FIXTURES / "grade_2010.json").read_text("utf-8"))
        records, suppressed = records_from_geojson(payload, COLUMNS, "2010")
        by_id = {r.cell_id: r for r in records}
        self.assertEqual(suppressed, ["200ME57001N92000"])
        self.assertIsNone(by_id["200ME57001N92000"].dom_ocu)
        self.assertIsNone(by_id["200ME57001N92000"].pop)
        self.assertEqual(by_id["200ME57000N92000"].dom_ocu, 40)
        self.assertEqual(by_id["1KME581N931"].parent_1km, "1KME581N931")

    def test_load_edition_requires_pinned_quadrants(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        with self.assertRaises(GradeError) as caught:
            load_edition(fetcher, base_url=BASE_2010, quadrant_ids=[], columns=COLUMNS, label="Grade 2010")
        self.assertIn("discover grade", str(caught.exception))
        self.assertIn("resolvê-los pelo bbox", str(caught.exception))
        records, suppressed, retrievals = load_edition(fetcher, base_url=BASE_2010, quadrant_ids=["grade_fixture"], columns=COLUMNS, label="Grade 2010")
        self.assertEqual(len(records), 8)
        self.assertEqual(len(retrievals), 1)

    def test_discover_lists_zip_names(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        self.assertEqual(discover(fetcher, BASE_2010), ["grade_id45.zip", "grade_id46.zip"])



class QuadrantDiscoveryTests(unittest.TestCase):
    """`quadrant_ids` vazio: os quadrantes são resolvidos pelos limites de cada arquivo contra o bbox (#162)."""

    def test_file_bounds_of_geojson_is_union_of_features(self):
        bounds = file_bounds(FIXTURES / "grade_2010.json")
        self.assertLess(bounds[0], bounds[2])
        self.assertLess(bounds[1], bounds[3])
        self.assertTrue(DF_BBOX[0] <= bounds[0] and bounds[2] <= DF_BBOX[2], bounds)
        self.assertEqual([round(v, 3) for v in file_bounds(FIXTURES / "grade_far.json")], [-40.0, -10.0, -39.998, -9.998])
        with self.assertRaises(GradeError):
            file_bounds(FIXTURES / "grade_listing.html")

    def test_to_wgs84_bounds_without_crs_passes_through(self):
        self.assertEqual(to_wgs84_bounds((-48.0, -16.0, -47.0, -15.0), None), (-48.0, -16.0, -47.0, -15.0))

    @unittest.skipUnless(find_spec("pyproj"), "pyproj ausente (instalado na CI pipeline-tests.yml)")
    def test_to_wgs84_bounds_reprojects_projected_crs_and_keeps_geographic(self):
        self.assertEqual(to_wgs84_bounds((-48.0, -16.0, -47.0, -15.0), "EPSG:4674"), (-48.0, -16.0, -47.0, -15.0))
        # SIRGAS 2000 / UTM 23S: Brasília fica perto de E 190000, N 8250000.
        lon_min, lat_min, lon_max, lat_max = to_wgs84_bounds((180000.0, 8220000.0, 240000.0, 8270000.0), "EPSG:31983")
        self.assertTrue(-48.5 < lon_min < lon_max < -47.0, (lon_min, lon_max))
        self.assertTrue(-16.2 < lat_min < lat_max < -15.5, (lat_min, lat_max))

    @unittest.skipUnless(find_spec("pyogrio") and find_spec("geopandas") and find_spec("shapely"),
                         "stack geo ausente (instalada na CI pipeline-tests.yml)")
    def test_zip_shapefile_bounds_and_records_through_pyogrio(self):
        """Produção lê zip de shapefile; aqui um shapefile real é escrito, zipado e lido pelo mesmo caminho
        (`zip://…!arquivo.shp`), em CRS geográfico e projetado."""
        import geopandas as gpd  # type: ignore
        import pyogrio  # type: ignore
        from shapely.geometry import box  # type: ignore

        for crs in ("EPSG:4674", "EPSG:31983"):
            with self.subTest(crs=crs), tempfile.TemporaryDirectory() as tmp:
                frame = gpd.GeoDataFrame(
                    {"ID_UNICO": ["200ME57000N92000", "1KME570N920"], "nome_1KM": ["1KME570N920", "1KME570N920"],
                     "POP": [120, 120], "DOM_OCU": [40, 40]},
                    geometry=[box(-47.9475, -15.86, -47.9456, -15.8582), box(-47.95, -15.87, -47.94, -15.86)],
                    crs="EPSG:4674",
                ).to_crs(crs)
                shp = Path(tmp) / "grade_id45" / "grade_id45.shp"
                shp.parent.mkdir()
                pyogrio.write_dataframe(frame, shp)
                archive = Path(tmp) / "grade_id45.zip"
                with zipfile.ZipFile(archive, "w") as zf:
                    for part in sorted(shp.parent.iterdir()):
                        zf.write(part, part.name)
                bounds = file_bounds(archive)
                self.assertAlmostEqual(bounds[0], -47.95, places=3)
                self.assertAlmostEqual(bounds[1], -15.87, places=3)
                self.assertAlmostEqual(bounds[2], -47.94, places=3)
                self.assertAlmostEqual(bounds[3], -15.8582, places=3)
                records, suppressed = read_grid_file(archive, COLUMNS, "Grade teste")
                self.assertEqual(sorted(r.cell_id for r in records), ["1KME570N920", "200ME57000N92000"])
                self.assertEqual(suppressed, [])
                lon, lat = records[0].geometry["coordinates"][0][0][:2]
                self.assertTrue(-48.0 < lon < -47.9 and -15.9 < lat < -15.8, (lon, lat))

    def test_parse_other_links_lists_every_file_link(self):
        html = '<a href="/x/grade_estatistica_2022.gpkg">a</a> <a href="leia-me.pdf">b</a> <a href="leia-me.pdf">c</a> <a href="pasta/">d</a>'
        self.assertEqual(parse_other_links(html), ["grade_estatistica_2022.gpkg", "leia-me.pdf"])

    def test_resolve_quadrants_keeps_only_files_crossing_bbox(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        ids, report = resolve_quadrants(fetcher, BASE_2010, bbox=DF_BBOX, label="Grade 2010")
        self.assertEqual(ids, ["grade_id45"])
        self.assertEqual([(r["file"], r["keep"]) for r in report], [("grade_id45.zip", True), ("grade_id46.zip", False)])
        # A listagem e os DOIS arquivos são baixados (os limites vêm do próprio arquivo) — uma vez.
        self.assertEqual([u.rsplit("/", 1)[-1] for u in fetcher.calls], ["", "grade_id45.zip", "grade_id46.zip"])

    def test_resolve_quadrants_discards_from_cache_what_is_outside_bbox(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        fetcher.discard = unittest.mock.Mock(return_value=True)  # o HttpFetcher real tem; a fixture ganha um para o teste
        resolve_quadrants(fetcher, BASE_2010, bbox=DF_BBOX, label="Grade 2010")
        fetcher.discard.assert_called_once_with(BASE_2010 + "grade_id46.zip")

    def test_parse_dir_links_skips_parent_and_files(self):
        html = (FIXTURES / "grade_listing_dirs.html").read_text("utf-8")
        self.assertEqual(parse_dir_links(html), ["grade_estatistica", "documentacao"])

    def test_discovery_descends_one_level_when_listing_has_only_subdirectories(self):
        """`censo_2022/` no geoftp só tem subpastas; os zips estão em `censo_2022/grade_estatistica/`."""
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        self.assertEqual(discover(fetcher, BASE_DIRS), ["grade_estatistica/grade_id45.zip", "grade_estatistica/grade_id46.zip"])
        ids, report = resolve_quadrants(fetcher, BASE_DIRS, bbox=DF_BBOX, label="Grade 2022")
        self.assertEqual(ids, ["grade_estatistica/grade_id45"])
        self.assertEqual([r["file"] for r in report], ["grade_estatistica/grade_id45.zip", "grade_estatistica/grade_id46.zip"])
        # o id prefixado é o que se pina no config: load_edition monta a URL certa a partir dele
        records, _, retrievals = load_edition(fetcher, base_url=BASE_DIRS, quadrant_ids=ids, columns=COLUMNS, label="Grade 2022")
        self.assertEqual(retrievals[0]["url"], BASE_DIRS + "grade_estatistica/grade_id45.zip")
        self.assertGreater(len(records), 0)

    def test_discovery_error_names_links_one_level_down_too(self):
        with tempfile.TemporaryDirectory() as tmp:
            top = Path(tmp) / "top.html"
            top.write_text('<a href="docs/">docs/</a> <a href="nota.txt">nota</a>', "utf-8")
            sub = Path(tmp) / "sub.html"
            sub.write_text('<a href="grade_2022.gpkg">g</a>', "utf-8")
            fetcher = FixtureFetcher({BASE_2022: top, BASE_2022 + "docs/": sub})
            with self.assertRaises(GradeError) as caught:
                resolve_quadrants(fetcher, BASE_2022, bbox=DF_BBOX, label="Grade 2022")
        self.assertIn("nota.txt", str(caught.exception))
        self.assertIn("docs/grade_2022.gpkg", str(caught.exception))

    def test_resolve_quadrants_fails_naming_other_links_when_no_grade_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            listing = Path(tmp) / "listing.html"
            listing.write_text('<a href="grade_estatistica_2022.gpkg">x</a> <a href="leia-me.pdf">y</a>', "utf-8")
            fetcher = FixtureFetcher({BASE_2022: listing})
            with self.assertRaises(GradeError) as caught:
                resolve_quadrants(fetcher, BASE_2022, bbox=DF_BBOX, label="Grade 2022")
        self.assertIn("grade_estatistica_2022.gpkg", str(caught.exception))
        self.assertIn("leia-me.pdf", str(caught.exception))

    def test_resolve_quadrants_fails_when_nothing_crosses_bbox(self):
        fetcher = FixtureFetcher.from_dir(FIXTURES)
        with self.assertRaises(GradeError) as caught:
            resolve_quadrants(fetcher, BASE_2010, bbox=(-60.0, -5.0, -59.0, -4.0), label="Grade 2010")
        self.assertIn("nenhum quadrante cruza", str(caught.exception))

    def test_dataset_run_discovers_quadrants_when_config_is_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            ctx = fixture_context(Path(tmp))
            ctx.config = replace(ctx.config, households=replace(ctx.config.households, quadrant_ids=()))
            manifest = households_grid.run(ctx)
            info = ctx.summary.dataset("households_grid")
            self.assertEqual(info["quadrant_ids_2010"], ["grade_id45"])
            self.assertEqual(info["quadrant_ids_2022"], ["grade_id45"])
            self.assertEqual([r["keep"] for r in info["quadrant_discovery"]["2022"]], [True, False])
            dataset = next(d for d in manifest["datasets"] if d["id"] == "households_grid")
            self.assertEqual(dataset["counts"]["quadrants_2010"], 1)
            self.assertIn("grade_id45", dataset["notes_pt"])
            self.assertEqual(dataset["sources"][0]["files"], ["grade_id45.zip"])
            self.assertEqual(dataset["sources"][1]["files"], ["grade_id45.zip"])

    def test_dataset_run_with_pinned_quadrants_does_not_discover(self):
        with tempfile.TemporaryDirectory() as tmp:
            ctx = fixture_context(Path(tmp))
            manifest = households_grid.run(ctx)
            info = ctx.summary.dataset("households_grid")
            self.assertEqual(info["quadrant_ids_2010"], ["grade_fixture"])
            self.assertNotIn("quadrant_discovery", info)
            dataset = next(d for d in manifest["datasets"] if d["id"] == "households_grid")
            self.assertNotIn("resolvidos pelo bbox", dataset["notes_pt"])
            self.assertNotIn(BASE_2010, ctx.fetcher.calls)  # a listagem não é baixada



class Grade2022ColumnsTests(unittest.TestCase):
    def test_production_config_maps_the_real_2022_columns(self):
        """Layout real visto na primeira execução (#164): TOTAL, TOTAL_DOM, nome_1km em minúsculas."""
        cfg = load_config(PROD_CONFIG).households
        payload = {"features": [{"properties": {"ID_UNICO": "200ME57000N92000", "QUADRANTE": "45", "TOTAL": 120, "TOTAL_DOM": 40,
                                                 "nome_1km": "1KME570N920", "nome_5KM": "5KME570N920", "nome_10KM": "10KME570N920",
                                                 "nome_50KM": "x", "nome_100KM": "x", "nome_500KM": "x"},
                                  "geometry": {"type": "Polygon", "coordinates": [[[-47.9475, -15.86], [-47.9475, -15.8582], [-47.9456, -15.8582], [-47.9456, -15.86], [-47.9475, -15.86]]]}}]}
        records, suppressed = records_from_geojson(payload, cfg.columns_2022, "Grade 2022")
        self.assertEqual((records[0].pop, records[0].dom_ocu, records[0].parent_1km), (120, 40, "1KME570N920"))
        self.assertEqual(suppressed, [])
        self.assertEqual(cfg.columns_2010["dom_ocu"], "DOM_OCU")


if __name__ == "__main__":
    unittest.main()
