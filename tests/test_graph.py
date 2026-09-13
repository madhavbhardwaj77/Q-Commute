"""
Tests for graph loading, node snapping, and location validation.
"""
from __future__ import annotations
import pytest
import networkx as nx
from backend.graph.snapper import snap_to_node, node_coords, path_coords
from backend.config import LOCATIONS, LOCATION_MAP


class TestLocationMap:
    def test_all_ten_locations_defined(self):
        expected = [
            "connaught_place", "india_gate", "jantar_mantar",
            "new_delhi_railway", "rajiv_chowk_metro", "barakhamba_road",
            "mandi_house", "khan_market", "national_museum", "gole_market",
        ]
        for loc_id in expected:
            assert loc_id in LOCATION_MAP, f"Missing: {loc_id}"

    def test_exactly_ten_locations(self):
        assert len(LOCATIONS) == 10

    def test_latitude_in_delhi_range(self):
        for loc in LOCATIONS:
            assert 28.5 < loc.lat < 28.8, f"{loc.name}: lat={loc.lat}"

    def test_longitude_in_delhi_range(self):
        for loc in LOCATIONS:
            assert 77.0 < loc.lon < 77.4, f"{loc.name}: lon={loc.lon}"


class TestSnapToNode:
    def test_returns_int(self, sample_graph):
        node = snap_to_node(sample_graph, 28.6329, 77.2195)
        assert isinstance(node, int)

    def test_snaps_to_node_in_graph(self, sample_graph):
        node = snap_to_node(sample_graph, 28.6329, 77.2195)
        assert node in sample_graph.nodes

    def test_nearest_to_node1(self, sample_graph):
        # Exact coordinates of node 1
        node = snap_to_node(sample_graph, 28.6329, 77.2195)
        assert node == 1

    def test_nearest_to_node5(self, sample_graph):
        # Exact coordinates of node 5
        node = snap_to_node(sample_graph, 28.6130, 77.2200)
        assert node == 5

    def test_empty_graph_raises(self):
        G = nx.MultiDiGraph()
        with pytest.raises(ValueError):
            snap_to_node(G, 28.6329, 77.2195)


class TestNodeCoords:
    def test_node1_lat_close(self, sample_graph):
        lat, lon = node_coords(sample_graph, 1)
        assert abs(lat - 28.6329) < 1e-4

    def test_node1_lon_close(self, sample_graph):
        lat, lon = node_coords(sample_graph, 1)
        assert abs(lon - 77.2195) < 1e-4


class TestPathCoords:
    def test_length_matches_path(self, sample_graph):
        path = [1, 2, 3]
        coords = path_coords(sample_graph, path)
        assert len(coords) == 3

    def test_each_coord_has_two_elements(self, sample_graph):
        coords = path_coords(sample_graph, [1, 2, 6, 5])
        for c in coords:
            assert len(c) == 2

    def test_first_coord_is_lat_lon(self, sample_graph):
        coords = path_coords(sample_graph, [1])
        lat, lon = coords[0]
        assert abs(lat - 28.6329) < 1e-4
        assert abs(lon - 77.2195) < 1e-4
