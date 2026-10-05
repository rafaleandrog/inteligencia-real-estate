import unittest

from imob_pipeline.transforms.ra_names import (
    int_to_roman, normalize_slug, ra_geo_id, ra_number_from_code, roman_to_int, title_case_ra_name,
)


class RaNamesTests(unittest.TestCase):
    def test_title_case_matches_code_gs(self):
        self.assertEqual(title_case_ra_name("CANDANGOLÂNDIA"), "Candangolândia")
        self.assertEqual(title_case_ra_name("SETOR DE INDÚSTRIA E ABASTECIMENTO"), "Setor de Indústria e Abastecimento")
        self.assertEqual(title_case_ra_name("SIA"), "SIA")
        self.assertEqual(title_case_ra_name("SCIA"), "SCIA")
        self.assertEqual(title_case_ra_name("SOL NASCENTE/PÔR DO SOL"), "Sol Nascente/pôr do Sol")
        self.assertEqual(title_case_ra_name("  PLANO   PILOTO "), "Plano Piloto")
        self.assertEqual(title_case_ra_name(None), "")

    def test_slug_matches_code_gs(self):
        self.assertEqual(normalize_slug("CANDANGOLÂNDIA"), "candangolandia")
        self.assertEqual(normalize_slug("Sol Nascente/Pôr do Sol"), "sol_nascente_por_do_sol")
        self.assertEqual(normalize_slug("  -- SIA -- "), "sia")
        self.assertEqual(normalize_slug(None), "")

    def test_roman_round_trip_rejects_malformed(self):
        self.assertEqual(int_to_roman(19), "XIX")
        self.assertEqual(int_to_roman(37), "XXXVII")
        self.assertEqual(roman_to_int("XIX"), 19)
        self.assertEqual(roman_to_int("xxxvii"), 37)
        self.assertIsNone(roman_to_int("IIII"))
        self.assertIsNone(roman_to_int("IXX"))
        self.assertIsNone(roman_to_int("ABC"))
        self.assertIsNone(roman_to_int(""))

    def test_ra_number_from_code_strips_prefix(self):
        self.assertEqual(ra_number_from_code("RA-XIX"), 19)
        self.assertEqual(ra_number_from_code("ra xi"), 11)
        self.assertIsNone(ra_number_from_code("RA-IIII"))

    def test_ra_geo_id_pads_two_digits(self):
        self.assertEqual(ra_geo_id(1), "RA_01")
        self.assertEqual(ra_geo_id(19), "RA_19")
        self.assertEqual(ra_geo_id(37), "RA_37")


if __name__ == "__main__":
    unittest.main()
