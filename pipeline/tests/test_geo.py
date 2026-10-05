import unittest

from imob_pipeline.geo import (
    bbox_intersects, bbox_union, cell_size_from_id, close_ring, geometry_bbox, linestring_midpoint,
    point_in_geometry, point_in_ring, polygon_area_km2, polygon_centroid, ring_closed, round_coords,
)

SQUARE = {"type": "Polygon", "coordinates": [[[-47.9, -15.8], [-47.9, -15.79], [-47.89, -15.79], [-47.89, -15.8], [-47.9, -15.8]]]}


class GeoTests(unittest.TestCase):
    def test_cell_size_from_id(self):
        self.assertEqual(cell_size_from_id("200ME57000N92000"), "200M")
        self.assertEqual(cell_size_from_id("1KME5700N9200"), "1KM")
        self.assertEqual(cell_size_from_id("1kmE5700N9200"), "1KM")
        with self.assertRaises(ValueError):
            cell_size_from_id("ABC")

    def test_rings(self):
        self.assertTrue(ring_closed(SQUARE["coordinates"][0]))
        opened = SQUARE["coordinates"][0][:-1]
        self.assertFalse(ring_closed(opened))
        self.assertTrue(ring_closed(close_ring(opened)))

    def test_bbox(self):
        self.assertEqual(geometry_bbox(SQUARE), (-47.9, -15.8, -47.89, -15.79))
        self.assertEqual(bbox_union(None, (0, 0, 1, 1)), (0, 0, 1, 1))
        self.assertEqual(bbox_union((0, 0, 1, 1), (-1, 2, 0.5, 3)), (-1, 0, 1, 3))
        self.assertTrue(bbox_intersects((0, 0, 1, 1), (0.5, 0.5, 2, 2)))
        self.assertFalse(bbox_intersects((0, 0, 1, 1), (2, 2, 3, 3)))

    def test_point_in_polygon(self):
        self.assertTrue(point_in_ring((-47.895, -15.795), SQUARE["coordinates"][0]))
        self.assertFalse(point_in_ring((-47.95, -15.795), SQUARE["coordinates"][0]))
        self.assertTrue(point_in_geometry((-47.895, -15.795), SQUARE))
        multi = {"type": "MultiPolygon", "coordinates": [SQUARE["coordinates"]]}
        self.assertTrue(point_in_geometry((-47.895, -15.795), multi))
        with_hole = {"type": "Polygon", "coordinates": [SQUARE["coordinates"][0],
                     [[-47.897, -15.797], [-47.897, -15.793], [-47.893, -15.793], [-47.893, -15.797], [-47.897, -15.797]]]}
        self.assertFalse(point_in_geometry((-47.895, -15.795), with_hole))
        self.assertTrue(point_in_geometry((-47.899, -15.799), with_hole))

    def test_centroid_and_area(self):
        cx, cy = polygon_centroid(SQUARE)
        self.assertAlmostEqual(cx, -47.895, places=6)
        self.assertAlmostEqual(cy, -15.795, places=6)
        # ~0.01° × 0.01° em -15.8° ≈ 1.07 km × 1.11 km ≈ 1.19 km²
        self.assertAlmostEqual(polygon_area_km2(SQUARE), 1.19, delta=0.05)

    def test_round_coords(self):
        rounded = round_coords({"type": "Point", "coordinates": [-47.123456789, -15.987654321]}, 5)
        self.assertEqual(rounded["coordinates"], [-47.12346, -15.98765])

    def test_midpoint(self):
        mid = linestring_midpoint([[-47.9, -15.8], [-47.8, -15.8]])
        self.assertAlmostEqual(mid[0], -47.85, places=4)
        self.assertAlmostEqual(mid[1], -15.8, places=6)


if __name__ == "__main__":
    unittest.main()
