"""
Shared pytest fixtures for Q-Commute tests.
Provides a synthetic 6-node MultiDiGraph that mimics OSMnx structure.
"""
from __future__ import annotations
import pytest
import networkx as nx


@pytest.fixture(scope="session")
def sample_graph():
    """
    Synthetic 6-node MultiDiGraph with OSMnx-compatible node attributes.
    Nodes have x (lon) and y (lat) attributes.
    All edges have length, speed_kph, travel_time, congestion attributes.
    """
    G = nx.MultiDiGraph()
    nodes = [
        (1, {"x": 77.2195, "y": 28.6329}),
        (2, {"x": 77.2245, "y": 28.6280}),
        (3, {"x": 77.2295, "y": 28.6229}),
        (4, {"x": 77.2280, "y": 28.6160}),
        (5, {"x": 77.2200, "y": 28.6130}),
        (6, {"x": 77.2220, "y": 28.6200}),
    ]
    G.add_nodes_from(nodes)

    edges = [
        (1, 2, 0, {"length": 800.0,  "speed_kph": 40.0, "travel_time": 72.0,  "congestion": 0.0}),
        (2, 1, 0, {"length": 800.0,  "speed_kph": 40.0, "travel_time": 72.0,  "congestion": 0.0}),
        (2, 3, 0, {"length": 700.0,  "speed_kph": 40.0, "travel_time": 63.0,  "congestion": 0.0}),
        (3, 2, 0, {"length": 700.0,  "speed_kph": 40.0, "travel_time": 63.0,  "congestion": 0.0}),
        (3, 4, 0, {"length": 900.0,  "speed_kph": 50.0, "travel_time": 64.8,  "congestion": 0.0}),
        (4, 3, 0, {"length": 900.0,  "speed_kph": 50.0, "travel_time": 64.8,  "congestion": 0.0}),
        (4, 5, 0, {"length": 600.0,  "speed_kph": 30.0, "travel_time": 72.0,  "congestion": 0.0}),
        (5, 4, 0, {"length": 600.0,  "speed_kph": 30.0, "travel_time": 72.0,  "congestion": 0.0}),
        (2, 6, 0, {"length": 500.0,  "speed_kph": 30.0, "travel_time": 60.0,  "congestion": 0.0}),
        (6, 2, 0, {"length": 500.0,  "speed_kph": 30.0, "travel_time": 60.0,  "congestion": 0.0}),
        (6, 5, 0, {"length": 400.0,  "speed_kph": 30.0, "travel_time": 48.0,  "congestion": 0.0}),
        (5, 6, 0, {"length": 400.0,  "speed_kph": 30.0, "travel_time": 48.0,  "congestion": 0.0}),
        (1, 6, 0, {"length": 1200.0, "speed_kph": 50.0, "travel_time": 86.4,  "congestion": 0.0}),
        (6, 1, 0, {"length": 1200.0, "speed_kph": 50.0, "travel_time": 86.4,  "congestion": 0.0}),
    ]
    for u, v, k, data in edges:
        G.add_edge(u, v, key=k, **data)

    return G


@pytest.fixture
def refs():
    return {"T_ref": 72.0, "D_ref": 700.0, "C_ref": 1.0}


@pytest.fixture
def empty_overlay():
    return {}
