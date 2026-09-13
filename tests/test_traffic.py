"""
Tests for traffic simulation: edge weight updates, choose_traffic_edge,
build_traffic_summary.
"""
from __future__ import annotations
import math
import pytest
from backend.optimization.fitness import path_fitness, edge_cost
from backend.simulation.traffic import choose_traffic_edge, build_traffic_summary


class TestEdgeWeightUpdates:
    def test_congestion_increases_cost(self, sample_graph, refs):
        G = sample_graph
        data = G[1][2][0]
        base = edge_cost(G, 1, 2, 0, data, {}, refs)
        overlay = {(1, 2, 0): {"closed": False, "time_multiplier": 3.0, "congestion_add": 0.8}}
        cong = edge_cost(G, 1, 2, 0, data, overlay, refs)
        assert cong > base

    def test_closure_returns_inf(self, sample_graph, refs):
        G = sample_graph
        data = G[1][2][0]
        overlay = {(1, 2, 0): {"closed": True}}
        c = edge_cost(G, 1, 2, 0, data, overlay, refs)
        assert math.isinf(c)

    def test_slowdown_increases_cost(self, sample_graph, refs):
        G = sample_graph
        data = G[1][2][0]
        base = edge_cost(G, 1, 2, 0, data, {}, refs)
        overlay = {(1, 2, 0): {"closed": False, "time_multiplier": 1.5, "congestion_add": 0.1}}
        slow = edge_cost(G, 1, 2, 0, data, overlay, refs)
        assert slow > base

    def test_path_fitness_increases_with_overlay(self, sample_graph, refs):
        path = [1, 2, 6, 5]
        free = path_fitness(sample_graph, path, {}, refs)
        overlay = {(2, 6, 0): {"closed": False, "time_multiplier": 3.0, "congestion_add": 0.5}}
        congested = path_fitness(sample_graph, path, overlay, refs)
        assert congested > free

    def test_closed_path_is_inf(self, sample_graph, refs):
        path = [1, 2, 6, 5]
        overlay = {(2, 6, 0): {"closed": True}}
        cost = path_fitness(sample_graph, path, overlay, refs)
        assert math.isinf(cost)


class TestChooseTrafficEdge:
    def test_returns_valid_edge(self, sample_graph, empty_overlay):
        path = [1, 2, 6, 5]
        edge = choose_traffic_edge(sample_graph, path, 1, 5, empty_overlay)
        if edge is not None:
            u, v, k = edge
            assert sample_graph.has_edge(u, v)

    def test_two_node_path_returns_none(self, sample_graph, empty_overlay):
        path = [1, 2]
        edge = choose_traffic_edge(sample_graph, path, 1, 2, empty_overlay)
        assert edge is None

    def test_avoids_already_congested(self, sample_graph):
        path = [1, 2, 6, 5]
        existing = {(2, 6, 0): {"event_type": "congestion"}}
        edge = choose_traffic_edge(sample_graph, path, 1, 5, existing)
        if edge is not None:
            assert edge != (2, 6, 0)

    def test_returns_three_tuple(self, sample_graph, empty_overlay):
        path = [1, 2, 6, 5]
        edge = choose_traffic_edge(sample_graph, path, 1, 5, empty_overlay)
        if edge is not None:
            assert len(edge) == 3


class TestBuildTrafficSummary:
    def test_empty_overlay(self, sample_graph):
        summary = build_traffic_summary(sample_graph, {})
        assert summary == []

    def test_single_event_listed(self, sample_graph):
        overlay = {(1, 2, 0): {"event_type": "congestion", "severity": "moderate",
                               "closed": False, "time_multiplier": 2.5}}
        summary = build_traffic_summary(sample_graph, overlay)
        assert len(summary) == 1

    def test_summary_has_event_type(self, sample_graph):
        overlay = {(1, 2, 0): {"event_type": "closure", "severity": "severe",
                               "closed": True}}
        summary = build_traffic_summary(sample_graph, overlay)
        assert summary[0]["event_type"] == "closure"

    def test_closed_edge_marked(self, sample_graph):
        overlay = {(1, 2, 0): {"event_type": "closure", "closed": True}}
        summary = build_traffic_summary(sample_graph, overlay)
        assert summary[0]["closed"] is True


class TestReroutingBehavior:
    def test_reroute_on_closed_edge(self, sample_graph, refs):
        from backend.optimization.dijkstra import run_dijkstra
        # Base route from 1 to 5
        base = run_dijkstra(sample_graph, 1, 5, {}, refs)
        assert base["valid"] is True
        # In sample_graph: 1-2 (800m), 2-6 (500m), 6-5 (400m) -> 1700m
        # Or 1-6 (1200m), 6-5 (400m) -> 1600m
        # Close an edge on the chosen route
        chosen_edge = (base["path"][0], base["path"][1], 0)
        overlay = {chosen_edge: {"closed": True, "event_type": "closure"}}
        rerouted = run_dijkstra(sample_graph, 1, 5, overlay, refs)
        assert rerouted["valid"] is True
        assert rerouted["path"] != base["path"]
