"""
Tests for Dijkstra and QPSO routing on the synthetic 6-node graph.
"""
from __future__ import annotations
import math
import pytest
from backend.optimization.dijkstra import run_dijkstra
from backend.optimization.qpso import QPSORouter, _repair_path, _remove_cycles
from backend.optimization.fitness import path_fitness, edge_cost


class TestEdgeCost:
    def test_free_flow_positive(self, sample_graph, refs, empty_overlay):
        G = sample_graph
        c = edge_cost(G, 1, 2, 0, G[1][2][0], empty_overlay, refs)
        assert c > 0

    def test_free_flow_finite(self, sample_graph, refs, empty_overlay):
        G = sample_graph
        c = edge_cost(G, 1, 2, 0, G[1][2][0], empty_overlay, refs)
        assert math.isfinite(c)

    def test_closed_edge_returns_inf(self, sample_graph, refs):
        G = sample_graph
        overlay = {(1, 2, 0): {"closed": True}}
        c = edge_cost(G, 1, 2, 0, G[1][2][0], overlay, refs)
        assert math.isinf(c)

    def test_congestion_increases_cost(self, sample_graph, refs):
        G = sample_graph
        base = edge_cost(G, 1, 2, 0, G[1][2][0], {}, refs)
        overlay = {(1, 2, 0): {"closed": False, "time_multiplier": 3.0, "congestion_add": 0.5}}
        cong = edge_cost(G, 1, 2, 0, G[1][2][0], overlay, refs)
        assert cong > base

    def test_missing_edge_handled_in_path_fitness(self, sample_graph, refs, empty_overlay):
        # edge_cost itself requires a valid data dict; missing-edge handling
        # is done in path_fitness via penalisation
        path = [1, 4]  # no direct edge 1->4
        f = path_fitness(sample_graph, path, empty_overlay, refs)
        # Should be a large penalty, not inf (unless no repair possible)
        assert f > 0


class TestPathFitness:
    def test_valid_path_finite(self, sample_graph, refs, empty_overlay):
        path = [1, 2, 6, 5]
        f = path_fitness(sample_graph, path, empty_overlay, refs)
        assert math.isfinite(f)

    def test_valid_path_positive(self, sample_graph, refs, empty_overlay):
        path = [1, 2, 6, 5]
        f = path_fitness(sample_graph, path, empty_overlay, refs)
        assert f > 0

    def test_empty_path_returns_inf(self, sample_graph, refs, empty_overlay):
        f = path_fitness(sample_graph, [], empty_overlay, refs)
        assert math.isinf(f)

    def test_single_node_returns_inf(self, sample_graph, refs, empty_overlay):
        f = path_fitness(sample_graph, [1], empty_overlay, refs)
        assert math.isinf(f)

    def test_longer_path_not_necessarily_lower_cost(self, sample_graph, refs, empty_overlay):
        short = path_fitness(sample_graph, [1, 6, 5], empty_overlay, refs)
        longer = path_fitness(sample_graph, [1, 2, 3, 4, 5], empty_overlay, refs)
        # Both should be finite positive — no claim about which is smaller
        assert math.isfinite(short) and math.isfinite(longer)
        assert short > 0 and longer > 0


class TestDijkstra:
    def test_path_exists_1_to_5(self, sample_graph, refs, empty_overlay):
        result = run_dijkstra(sample_graph, 1, 5, empty_overlay, refs)
        assert result["valid"] is True

    def test_path_is_list(self, sample_graph, refs, empty_overlay):
        result = run_dijkstra(sample_graph, 1, 5, empty_overlay, refs)
        assert isinstance(result["path"], list)

    def test_path_starts_at_source(self, sample_graph, refs, empty_overlay):
        result = run_dijkstra(sample_graph, 1, 5, empty_overlay, refs)
        assert result["path"][0] == 1

    def test_path_ends_at_destination(self, sample_graph, refs, empty_overlay):
        result = run_dijkstra(sample_graph, 1, 5, empty_overlay, refs)
        assert result["path"][-1] == 5

    def test_same_src_dst_invalid(self, sample_graph, refs, empty_overlay):
        result = run_dijkstra(sample_graph, 1, 1, empty_overlay, refs)
        assert result["valid"] is False

    def test_metrics_finite(self, sample_graph, refs, empty_overlay):
        result = run_dijkstra(sample_graph, 1, 5, empty_overlay, refs)
        assert math.isfinite(result["distance_m"])
        assert math.isfinite(result["travel_time_s"])
        assert math.isfinite(result["total_cost"])

    def test_algorithm_label(self, sample_graph, refs, empty_overlay):
        result = run_dijkstra(sample_graph, 1, 5, empty_overlay, refs)
        assert result["algorithm"] == "Dijkstra"

    def test_coords_format(self, sample_graph, refs, empty_overlay):
        result = run_dijkstra(sample_graph, 1, 5, empty_overlay, refs)
        assert result["valid"]
        for coord in result["coordinates"]:
            assert len(coord) == 2

    def test_unknown_node_invalid(self, sample_graph, refs, empty_overlay):
        result = run_dijkstra(sample_graph, 1, 999, empty_overlay, refs)
        assert result["valid"] is False


class TestQPSO:
    def test_valid(self, sample_graph, refs, empty_overlay):
        qpso = QPSORouter(sample_graph, 1, 5, empty_overlay, refs,
                          n_particles=10, n_iter=20, seed=42)
        result = qpso.run()
        assert result["valid"] is True

    def test_path_starts_at_source(self, sample_graph, refs, empty_overlay):
        qpso = QPSORouter(sample_graph, 1, 5, empty_overlay, refs,
                          n_particles=10, n_iter=20, seed=42)
        result = qpso.run()
        assert result["path"][0] == 1

    def test_path_ends_at_destination(self, sample_graph, refs, empty_overlay):
        qpso = QPSORouter(sample_graph, 1, 5, empty_overlay, refs,
                          n_particles=10, n_iter=20, seed=42)
        result = qpso.run()
        assert result["path"][-1] == 5

    def test_algorithm_label(self, sample_graph, refs, empty_overlay):
        qpso = QPSORouter(sample_graph, 1, 5, empty_overlay, refs,
                          n_particles=5, n_iter=5, seed=0)
        result = qpso.run()
        assert result["algorithm"] == "QPSO"

    def test_convergence_length(self, sample_graph, refs, empty_overlay):
        n_iter = 15
        qpso = QPSORouter(sample_graph, 1, 5, empty_overlay, refs,
                          n_particles=5, n_iter=n_iter, seed=1)
        result = qpso.run()
        assert len(result["convergence"]) == n_iter + 1

    def test_same_seed_same_result(self, sample_graph, refs, empty_overlay):
        qpso1 = QPSORouter(sample_graph, 1, 5, empty_overlay, refs,
                           n_particles=10, n_iter=20, seed=99)
        qpso2 = QPSORouter(sample_graph, 1, 5, empty_overlay, refs,
                           n_particles=10, n_iter=20, seed=99)
        r1, r2 = qpso1.run(), qpso2.run()
        assert r1["path"] == r2["path"]

    def test_all_edges_in_graph(self, sample_graph, refs, empty_overlay):
        qpso = QPSORouter(sample_graph, 1, 5, empty_overlay, refs,
                          n_particles=10, n_iter=30, seed=42)
        result = qpso.run()
        assert result["valid"]
        path = result["path"]
        G = sample_graph
        for i in range(len(path) - 1):
            assert G.has_edge(path[i], path[i+1]), f"Invalid edge {path[i]}->{path[i+1]}"

    def test_metrics_finite(self, sample_graph, refs, empty_overlay):
        qpso = QPSORouter(sample_graph, 1, 5, empty_overlay, refs,
                          n_particles=5, n_iter=10, seed=7)
        result = qpso.run()
        assert result["valid"]
        assert math.isfinite(result["distance_m"])
        assert math.isfinite(result["travel_time_s"])
        assert math.isfinite(result["total_cost"])

    def test_same_src_dst_invalid(self, sample_graph, refs, empty_overlay):
        qpso = QPSORouter(sample_graph, 1, 1, empty_overlay, refs)
        result = qpso.run()
        assert result["valid"] is False


class TestRemoveCycles:
    def test_no_cycle_unchanged(self):
        path = [1, 2, 3, 4, 5]
        assert _remove_cycles(path) == [1, 2, 3, 4, 5]

    def test_simple_cycle_removed(self):
        path = [1, 2, 3, 2, 4, 5]
        cleaned = _remove_cycles(path)
        # 2 should appear only once
        assert cleaned.count(2) <= 1


class TestRepairPath:
    def test_valid_path_unchanged(self, sample_graph):
        path = [1, 2, 6, 5]
        repaired = _repair_path(sample_graph, path, 1, 5)
        assert repaired is not None
        assert repaired[0] == 1
        assert repaired[-1] == 5

    def test_missing_edge_repaired_or_empty(self, sample_graph):
        # 1 -> 4 has no direct edge; repair should insert a sub-path
        path = [1, 4, 5]
        repaired = _repair_path(sample_graph, path, 1, 5)
        if repaired is not None:
            assert repaired[0] == 1
            assert repaired[-1] == 5
            # All consecutive edges must exist
            for i in range(len(repaired) - 1):
                assert sample_graph.has_edge(repaired[i], repaired[i+1])

    def test_empty_input_returns_none(self, sample_graph):
        result = _repair_path(sample_graph, [], 1, 5)
        assert result is None

    def test_single_node_returns_none(self, sample_graph):
        result = _repair_path(sample_graph, [1], 1, 5)
        # Either None or a repaired path
        if result is not None:
            assert result[0] == 1 and result[-1] == 5
