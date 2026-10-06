import unittest

from imob_pipeline.transforms.aggregate_ra import aggregate_households, aggregate_jobs, build_rows

CROSSWALK = [
    {"ra_number": 11, "ra_geo_id": "RA_11", "ra_geo_id_roman": "RA2026_RA-XI", "ra_name": "Cruzeiro", "ra_area_km2": 3.19116356},
    {"ra_number": 19, "ra_geo_id": "RA_19", "ra_geo_id_roman": "RA2026_RA-XIX", "ra_name": "Candangolândia", "ra_area_km2": 6.6018644},
]


def cell(ra, d10, d22, p10=1, p22=1, flags=()):
    return {"properties": {"ra_geo_id": ra, "dom_ocu_2010": d10, "dom_ocu_2022": d22, "pop_2010": p10, "pop_2022": p22, "quality_flags": list(flags)}}


class AggregateTests(unittest.TestCase):
    def test_households_sum_with_sem_ra_and_rural(self):
        detail = [cell("RA_19", 40, 55), cell("RA_19", None, 25), cell("RA_11", 100, 120), cell(None, 10, 12)]
        overview = [{"properties": {"ra_geo_id": "RA_11", "children": 0, "dom_ocu_2010": 250, "dom_ocu_2022": 270, "pop_2010": 1, "pop_2022": 1, "quality_flags": []}},
                    {"properties": {"ra_geo_id": "RA_19", "children": 4, "dom_ocu_2010": None, "dom_ocu_2022": None, "pop_2010": None, "pop_2022": None, "quality_flags": ["partial_children"]}}]
        out = aggregate_households(detail, overview)
        self.assertEqual(out["RA_19"]["households_2010"], 40)         # nulo não vira zero nem derruba a soma
        self.assertEqual(out["RA_19"]["households_2022"], 80)
        self.assertEqual(out["RA_19"]["households_delta"], 40)
        self.assertEqual(out["RA_19"]["households_growth_pct"], 1.0)
        self.assertEqual(out["RA_19"]["cells_2010"], 1)
        self.assertEqual(out["RA_19"]["cells_2022"], 2)
        self.assertEqual(out["RA_11"]["households_2022"], 390)         # 120 + célula rural 270
        self.assertEqual(out["SEM_RA"]["households_2022"], 12)
        total = sum(v["households_2022"] for v in out.values())
        self.assertEqual(total, 55 + 25 + 120 + 12 + 270)
        # buraco assimétrico (R8.55): 2010 só tem uma célula, 2022 duas → a soma é parcial e diz isso
        self.assertEqual(out["RA_19"]["cells_partial"], 1)
        self.assertEqual(out["RA_11"]["cells_partial"], 0)

    def test_resolution_changed_cell_counts_each_edition_once(self):
        # Célula de 1 km inteira em 2010 (50) e subdividida em 2022 (30 + 40): 2010 vem do overview, 2022 das filhas (#167).
        detail = [cell("RA_19", None, 30, p10=None, p22=100, flags=("cell_missing_2010",)),
                  cell("RA_19", None, 40, p10=None, p22=130, flags=("cell_missing_2010",))]
        overview = [{"properties": {"ra_geo_id": "RA_19", "children": 2, "children_2010": 0, "children_2022": 2,
                                    "dom_ocu_2010": 50, "dom_ocu_2022": 70, "pop_2010": 160, "pop_2022": 230,
                                    "quality_flags": ["resolution_changed"]}}]
        out = aggregate_households(detail, overview)
        self.assertEqual(out["RA_19"]["households_2010"], 50)
        self.assertEqual(out["RA_19"]["households_2022"], 70)      # não 140: as filhas já contam o 2022
        self.assertEqual(out["RA_19"]["pop_2010"], 160)
        self.assertEqual(out["RA_19"]["pop_2022"], 230)
        self.assertEqual(out["RA_19"]["households_delta"], 20)
        self.assertEqual(out["RA_19"]["cells_2010"], 1)
        self.assertEqual(out["RA_19"]["cells_2022"], 2)
        # a célula inteira entrou só em 2010 e tinha valor: não é parcial; as filhas sem 2010 são
        self.assertEqual(out["RA_19"]["cells_partial"], 2)
        # overview subdividido nas duas edições continua fora da soma (as filhas já contam)
        both = [{"properties": {"ra_geo_id": "RA_19", "children": 2, "children_2010": 2, "children_2022": 2,
                                "dom_ocu_2010": 1000, "dom_ocu_2022": 1000, "pop_2010": 1, "pop_2022": 1, "quality_flags": []}}]
        self.assertEqual(aggregate_households(detail, both)["RA_19"]["households_2022"], 70)

    def test_jobs_sum_and_basis(self):
        detail = [{"properties": {"ra_geo_id": "RA_19", "jobs_total": 1200, "jobs_low": 400, "jobs_mid": 500, "jobs_high": 300}},
                  {"properties": {"ra_geo_id": "RA_19", "jobs_total": 60, "jobs_low": 30, "jobs_mid": 20, "jobs_high": 10}},
                  {"properties": {"ra_geo_id": None, "jobs_total": 15, "jobs_low": 15, "jobs_mid": 0, "jobs_high": 0}}]
        overview = [{"properties": {"ra_geo_id": "RA_19", "pop_total": 2180}}, {"properties": {"ra_geo_id": "RA_11", "pop_total": 300}}]
        out = aggregate_jobs(detail, overview)
        self.assertEqual(out["RA_19"]["jobs_total"], 1260)
        self.assertEqual(out["RA_19"]["jobs_population_basis"], 2180)
        self.assertEqual(out["RA_19"]["jobs_per_1000_residents"], 578.0)
        self.assertEqual(out["RA_19"]["hexes"], 2)
        self.assertIsNone(out["RA_11"]["jobs_total"])
        self.assertIsNone(out["RA_11"]["jobs_per_1000_residents"])
        self.assertEqual(out["SEM_RA"]["jobs_total"], 15)

    def test_rows_null_blocks_and_flags(self):
        households = {"RA_19": {"households_2010": 40, "households_2022": 80, "households_delta": 40, "households_growth_pct": 1.0,
                                "pop_2010": 1, "pop_2022": 2, "cells_2010": 1, "cells_2022": 2, "cells_partial": 1}}
        rows = build_rows(CROSSWALK, households=households, jobs=None, roads=None, sources={"households": "IBGE"})
        by = {r["ra_geo_id"]: r for r in rows}
        self.assertEqual(by["RA_19"]["households_per_km2_2022"], round(80 / 6.6018644, 1))
        self.assertEqual(by["RA_19"]["quality_flags"], ["centrality_missing", "jobs_missing", "partial_children"])
        self.assertIsNone(by["RA_11"]["households_2022"])
        self.assertIn("households_missing", by["RA_11"]["quality_flags"])
        self.assertIsNone(by["RA_19"]["jobs_total"])
        self.assertEqual(by["RA_19"]["households_source"], "IBGE")


if __name__ == "__main__":
    unittest.main()
