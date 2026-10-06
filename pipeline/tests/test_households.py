import json
import unittest

from imob_pipeline.sources.geoportal_ra import to_polygons
from imob_pipeline.sources.ibge_grade import records_from_geojson
from imob_pipeline.transforms.assign_ra import RaIndex
from imob_pipeline.transforms.households import HouseholdsError, build_households, shard_by_ra

from .helpers import FIXTURES, ra_features

COLUMNS = {"cell_id": "ID_UNICO", "parent_1km": "nome_1KM", "pop": "POP", "dom_ocu": "DOM_OCU"}
BREAKS = {"households_delta_per_km2": [100, 350, 750, 1000, 2000], "households_delta": [5, 10, 20, 40, 80]}
AREAS = {"200M": 0.04, "1KM": 1.0}
BBOX = (-48.30, -16.06, -47.30, -15.48)  # o mesmo do config


def load(name):
    return records_from_geojson(json.loads((FIXTURES / name).read_text("utf-8")), COLUMNS, name)


class HouseholdsTests(unittest.TestCase):
    def setUp(self):
        self.index = RaIndex(to_polygons(ra_features()), use_shapely=False)
        self.c10, self.s10 = load("grade_2010.json")
        self.c22, self.s22 = load("grade_2022.json")

    def build(self, drop=True):
        return build_households(self.c10, self.c22, suppressed_2010=self.s10, suppressed_2022=self.s22, cell_area_km2=AREAS,
                                breaks=BREAKS, drop_if_empty_both_years=drop, assign_ra=self.index.assign, bbox=BBOX)

    def test_join_deltas_flags_and_drop(self):
        result = self.build()
        by_id = {f["id"]: f["properties"] for f in result.detail}
        # presente nos dois anos
        c = by_id["200ME57000N92000"]
        self.assertEqual((c["dom_ocu_2010"], c["dom_ocu_2022"], c["households_delta"]), (40, 55, 15))
        self.assertEqual(c["households_delta_per_km2"], 375.0)
        self.assertEqual(c["households_delta_pct_change"], 0.375)
        self.assertEqual(c["class_households_delta_per_km2"], 2)
        self.assertEqual(c["class_households_delta"], 2)
        self.assertEqual(c["ra_geo_id"], "RA_19")
        self.assertEqual(c["quality_flags"], [])
        # suprimida em 2010 → nulos + flag, nunca saturada
        s = by_id["200ME57001N92000"]
        self.assertIsNone(s["dom_ocu_2010"])
        self.assertIsNone(s["households_delta"])
        self.assertIsNone(s["class_households_delta_per_km2"])
        self.assertIn("value_suppressed_2010", s["quality_flags"])
        # ausente em 2022 → flag, 2022 nulo
        m = by_id["200ME57001N92001"]
        self.assertIsNone(m["dom_ocu_2022"])
        self.assertIn("cell_missing_2022", m["quality_flags"])
        # fora de toda RA → SEM_RA, contada
        self.assertIsNone(by_id["200ME5900N9400"]["ra_geo_id"])
        self.assertIn("ra_unassigned", by_id["200ME5900N9400"]["quality_flags"])
        # vazia nos dois anos → descartada e contada
        self.assertNotIn("200ME5703N9200", by_id)
        self.assertEqual(result.counts["dropped_empty_both_years"], 1)
        self.assertEqual(result.counts["published"], 8)   # 6 + as duas filhas de 2022 da célula que mudou de resolução
        self.assertEqual(result.counts["ra_unassigned"], 1)
        self.assertEqual(result.counts["cells_2010"], 9)
        self.assertEqual(result.counts["cells_2022"], 9)
        self.assertEqual(result.counts["dropped_outside_bbox"], 0)
        # filhas de 2022 de uma célula inteira em 2010: no detalhe, 2010 é ausente (nunca o valor da célula de 1 km rateado)
        child = by_id["200ME5750N9250"]
        self.assertIsNone(child["dom_ocu_2010"])
        self.assertIn("cell_missing_2010", child["quality_flags"])
        self.assertIsNone(child["households_delta"])

    def test_zero_in_2010_makes_pct_null_not_infinite(self):
        for c in self.c10:
            if c.cell_id == "200ME5800N9300":
                object.__setattr__(c, "dom_ocu", 0)
        result = self.build()
        c = {f["id"]: f["properties"] for f in result.detail}["200ME5800N9300"]
        self.assertEqual(c["households_delta"], 120)
        self.assertIsNone(c["households_delta_pct_change"])

    def test_overview_strict_sums_and_rural_cells(self):
        result = self.build()
        by_id = {f["id"]: f["properties"] for f in result.overview}
        parent = by_id["1KME570N920"]
        # 4 filhos publicados + 1 descartado (vazio) — todos contam como filhos; nulos tornam a soma nula
        self.assertEqual(parent["children"], 4)
        self.assertIsNone(parent["dom_ocu_2010"])          # um filho suprimido em 2010
        self.assertIsNone(parent["dom_ocu_2022"])          # um filho ausente em 2022
        self.assertEqual(parent["children_missing"], 1)
        self.assertIn("partial_children", parent["quality_flags"])
        self.assertEqual(parent["cell_size"], "1KM")
        self.assertEqual(parent["ra_geo_id"], "RA_19")
        self.assertEqual(len(parent["geometry"] if "geometry" in parent else [0]), 1)
        single = by_id["1KME580N930"]
        self.assertEqual(single["children"], 1)
        self.assertEqual((single["dom_ocu_2010"], single["dom_ocu_2022"]), (100, 120))
        rural = by_id["1KME581N931"]
        self.assertEqual(rural["children"], 0)
        self.assertEqual((rural["children_2010"], rural["children_2022"]), (0, 0))
        self.assertEqual(rural["households_delta"], 20)
        self.assertEqual(rural["households_delta_per_km2"], 20.0)
        self.assertEqual((parent["children_2010"], parent["children_2022"]), (4, 3))   # uma filha ausente em 2022
        self.assertEqual(result.counts["partial_children"], 1)
        self.assertEqual(len(result.overview), 5)
        self.assertEqual(len({f["id"] for f in result.overview}), 5)   # nunca um id repetido (#167)
        feature = next(f for f in result.overview if f["id"] == "1KME570N920")
        ring = feature["geometry"]["coordinates"][0]
        self.assertEqual(ring[0], ring[-1])
        self.assertGreaterEqual(len(ring), 5)

    def test_area_mismatch_fails_loudly(self):
        bad = [c for c in self.c10]
        from imob_pipeline.sources.ibge_grade import GridCellRecord
        huge = GridCellRecord(cell_id="200ME9999N9999", parent_1km="1KME999N999", pop=1, dom_ocu=1,
                              geometry={"type": "Polygon", "coordinates": [[[-47.95, -15.86], [-47.95, -15.85], [-47.94, -15.85], [-47.94, -15.86], [-47.95, -15.86]]]})
        with self.assertRaises(HouseholdsError) as caught:
            build_households(bad + [huge], self.c22, suppressed_2010=[], suppressed_2022=[], cell_area_km2=AREAS,
                             breaks=BREAKS, drop_if_empty_both_years=True, assign_ra=self.index.assign)
        self.assertIn("200ME9999N9999", str(caught.exception))

    def test_shards_by_ra_with_sem_ra_bucket(self):
        result = self.build()
        shards = shard_by_ra(result.detail)
        self.assertEqual(sorted(shards), ["RA_11", "RA_19", "SEM_RA"])
        self.assertEqual(len(shards["RA_19"]), 6)
        self.assertEqual(len(shards["SEM_RA"]), 1)


class ResolutionChangeTests(unittest.TestCase):
    """Célula de 1 km inteira numa edição e subdividida em 200 m na outra (área que urbanizou): o overview
    publica UMA feição por id — a segunda execução real publicou as duas e o validador achou id repetido (#167)."""

    def setUp(self):
        self.index = RaIndex(to_polygons(ra_features()), use_shapely=False)
        self.c10, self.s10 = load("grade_2010.json")
        self.c22, self.s22 = load("grade_2022.json")

    def build(self, c10, c22, **kw):
        args = dict(suppressed_2010=self.s10, suppressed_2022=self.s22, cell_area_km2=AREAS, breaks=BREAKS,
                    drop_if_empty_both_years=True, assign_ra=self.index.assign, bbox=BBOX)
        args.update(kw)
        return build_households(c10, c22, **args)

    def test_whole_in_2010_children_in_2022_becomes_one_overview_feature(self):
        result = self.build(self.c10, self.c22)
        merged = next(f for f in result.overview if f["id"] == "1KME575N925")
        p = merged["properties"]
        self.assertEqual((p["dom_ocu_2010"], p["dom_ocu_2022"]), (50, 70))       # 2010 da célula inteira, 2022 da soma das filhas
        self.assertEqual((p["pop_2010"], p["pop_2022"]), (160, 230))
        self.assertEqual(p["households_delta"], 20)
        self.assertEqual(p["households_delta_pct_change"], 0.4)
        self.assertEqual((p["children"], p["children_2010"], p["children_2022"]), (2, 0, 2))
        self.assertEqual(p["children_missing"], 0)
        self.assertIn("resolution_changed", p["quality_flags"])
        self.assertNotIn("partial_children", p["quality_flags"])
        self.assertNotIn("cell_missing_2010", p["quality_flags"])
        self.assertEqual(p["ra_geo_id"], "RA_19")
        ring = merged["geometry"]["coordinates"][0]
        self.assertEqual(ring[0], ring[-1])
        self.assertEqual(min(x for x, _ in ring), -47.956)   # geometria da célula de 1 km inteira, não o casco das filhas
        self.assertEqual(result.counts["resolution_changed"], 1)
        self.assertIn("resolution_changed", result.flags)

    def test_whole_in_2022_children_in_2010_is_symmetric(self):
        result = self.build(self.c22, self.c10, suppressed_2010=self.s22, suppressed_2022=self.s10)
        p = next(f for f in result.overview if f["id"] == "1KME575N925")["properties"]
        self.assertEqual((p["dom_ocu_2010"], p["dom_ocu_2022"]), (70, 50))
        self.assertEqual((p["children_2010"], p["children_2022"]), (2, 0))
        self.assertIn("resolution_changed", p["quality_flags"])

    def test_whole_and_children_in_the_same_edition_fails_naming_the_cell(self):
        whole = next(c for c in self.c10 if c.cell_id == "1KME575N925")
        with self.assertRaises(HouseholdsError) as caught:
            self.build(self.c10, list(self.c22) + [whole])
        self.assertIn("1KME575N925", str(caught.exception))
        self.assertIn("2022", str(caught.exception))

    def test_empty_whole_cell_without_children_is_dropped_and_counted(self):
        from imob_pipeline.sources.ibge_grade import GridCellRecord
        whole = next(c for c in self.c10 if c.cell_id == "1KME575N925")
        empty = GridCellRecord(cell_id="1KME575N925", parent_1km="1KME575N925", pop=0, dom_ocu=0, geometry=whole.geometry)
        c10 = [c for c in self.c10 if c.cell_id != "1KME575N925"] + [empty]
        c22 = [c for c in self.c22 if not c.cell_id.startswith("200ME575")]
        result = self.build(c10, c22)
        self.assertNotIn("1KME575N925", {f["id"] for f in result.overview})
        self.assertEqual(result.counts["dropped_empty_both_years"], 2)   # + a célula de 200 m vazia de sempre


class BboxFilterTests(unittest.TestCase):
    """O quadrante da Grade cobre muito mais que o DF: célula com centroide fora do bbox do projeto é descartada
    ANTES da checagem de área e contada — a segunda execução real publicou Goiás inteiro (#167)."""

    def setUp(self):
        self.index = RaIndex(to_polygons(ra_features()), use_shapely=False)
        self.c10, self.s10 = load("grade_2010.json")
        self.c22, self.s22 = load("grade_2022.json")
        self.far, _ = load("grade_far.json")   # 200ME99000N99000 em (-40, -10): longe e com área nominal errada na latitude

    def build(self, **kw):
        args = dict(suppressed_2010=self.s10, suppressed_2022=self.s22, cell_area_km2=AREAS, breaks=BREAKS,
                    drop_if_empty_both_years=True, assign_ra=self.index.assign)
        args.update(kw)
        return build_households(list(self.c10) + list(self.far), list(self.c22) + list(self.far), **args)

    def test_far_cell_is_dropped_and_counted(self):
        result = self.build(bbox=BBOX)
        ids = {f["id"] for f in result.detail} | {f["id"] for f in result.overview}
        self.assertNotIn("200ME99000N99000", ids)
        self.assertNotIn("1KME990N990", ids)
        self.assertEqual(result.counts["dropped_outside_bbox"], 1)
        self.assertEqual(result.counts["cells_2010"], 10)   # contagem da fonte, antes do descarte
        self.assertEqual(result.counts["published"], 8)

    def test_without_bbox_the_far_cell_fails_the_area_check(self):
        with self.assertRaises(HouseholdsError) as caught:
            self.build(bbox=None)
        self.assertIn("200ME99000N99000", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
