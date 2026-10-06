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


def load(name):
    return records_from_geojson(json.loads((FIXTURES / name).read_text("utf-8")), COLUMNS, name)


class HouseholdsTests(unittest.TestCase):
    def setUp(self):
        self.index = RaIndex(to_polygons(ra_features()), use_shapely=False)
        self.c10, self.s10 = load("grade_2010.json")
        self.c22, self.s22 = load("grade_2022.json")

    def build(self, drop=True):
        return build_households(self.c10, self.c22, suppressed_2010=self.s10, suppressed_2022=self.s22, cell_area_km2=AREAS,
                                breaks=BREAKS, drop_if_empty_both_years=drop, assign_ra=self.index.assign)

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
        self.assertEqual(result.counts["published"], 6)
        self.assertEqual(result.counts["ra_unassigned"], 1)
        self.assertEqual(result.counts["cells_2010"], 8)
        self.assertEqual(result.counts["cells_2022"], 7)

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
        self.assertEqual(rural["households_delta"], 20)
        self.assertEqual(rural["households_delta_per_km2"], 20.0)
        self.assertEqual(result.counts["partial_children"], 1)
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
        self.assertEqual(len(shards["RA_19"]), 4)
        self.assertEqual(len(shards["SEM_RA"]), 1)


if __name__ == "__main__":
    unittest.main()
