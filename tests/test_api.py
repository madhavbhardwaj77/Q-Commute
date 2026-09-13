"""
API integration tests using FastAPI TestClient.
Uses a synthetic GraphState to avoid OSM network downloads.
"""
from __future__ import annotations
import pytest
import networkx as nx
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


# ---- Build synthetic GraphState before importing app ----

def _make_synthetic_state():
    """Create a fully initialized GraphState backed by the 6-node test graph."""
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

    from backend.graph.state import GraphState
    from backend.config import LOCATIONS
    state = GraphState.__new__(GraphState)
    state.G = G
    state._initialized = True
    state.traffic_overlay = {}
    # Map all 10 locations to nodes in our test graph
    state._node_cache = {
        "connaught_place":   1,
        "india_gate":        5,
        "jantar_mantar":     2,
        "new_delhi_railway": 3,
        "rajiv_chowk_metro": 4,
        "barakhamba_road":   6,
        "mandi_house":       6,
        "khan_market":       5,
        "national_museum":   5,
        "gole_market":       1,
    }
    state._ref = {"T_ref": 72.0, "D_ref": 700.0, "C_ref": 1.0}
    return state


SYNTHETIC_STATE = _make_synthetic_state()


@pytest.fixture(scope="module")
def client():
    """TestClient with graph_state replaced by synthetic state."""
    import backend.graph.state as gs_mod
    import backend.routers.route as route_mod
    import backend.routers.traffic as traffic_mod
    import backend.routers.network as network_mod
    import backend.routers.benchmark as benchmark_mod
    import backend.routers.analytics as analytics_mod

    with patch.object(gs_mod, "graph_state", SYNTHETIC_STATE), \
         patch.object(route_mod, "graph_state", SYNTHETIC_STATE), \
         patch.object(traffic_mod, "graph_state", SYNTHETIC_STATE), \
         patch.object(network_mod, "graph_state", SYNTHETIC_STATE), \
         patch.object(benchmark_mod, "graph_state", SYNTHETIC_STATE), \
         patch.object(analytics_mod, "graph_state", SYNTHETIC_STATE):
        from backend.main import app
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c


# ---- Tests ----

class TestHealth:
    def test_status_200(self, client):
        r = client.get("/health")
        assert r.status_code == 200

    def test_status_ok(self, client):
        r = client.get("/health")
        assert r.json()["status"] == "ok"


class TestLocations:
    def test_returns_10_locations(self, client):
        r = client.get("/locations")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 10

    def test_connaught_place_in_list(self, client):
        r = client.get("/locations")
        ids = [loc["id"] for loc in r.json()]
        assert "connaught_place" in ids

    def test_india_gate_in_list(self, client):
        r = client.get("/locations")
        ids = [loc["id"] for loc in r.json()]
        assert "india_gate" in ids


class TestNetworkStatus:
    def test_initialized_true(self, client):
        r = client.get("/network/status")
        assert r.status_code == 200
        assert r.json()["initialized"] is True

    def test_node_count_positive(self, client):
        data = client.get("/network/status").json()
        assert data["nodes"] > 0

    def test_edge_count_positive(self, client):
        data = client.get("/network/status").json()
        assert data["edges"] > 0


class TestRouteDijkstra:
    def test_status_200(self, client):
        r = client.post("/route/optimize", json={
            "source_id": "connaught_place",
            "destination_id": "india_gate",
            "algorithm": "Dijkstra",
        })
        assert r.status_code == 200

    def test_valid_true(self, client):
        r = client.post("/route/optimize", json={
            "source_id": "connaught_place",
            "destination_id": "india_gate",
            "algorithm": "Dijkstra",
        })
        assert r.json()["valid"] is True

    def test_has_coordinates(self, client):
        r = client.post("/route/optimize", json={
            "source_id": "connaught_place",
            "destination_id": "india_gate",
            "algorithm": "Dijkstra",
        })
        coords = r.json()["coordinates"]
        assert len(coords) >= 2


class TestRouteQPSO:
    def test_status_200(self, client):
        r = client.post("/route/optimize", json={
            "source_id": "connaught_place",
            "destination_id": "india_gate",
            "algorithm": "QPSO",
        })
        assert r.status_code == 200

    def test_valid_true(self, client):
        r = client.post("/route/optimize", json={
            "source_id": "connaught_place",
            "destination_id": "india_gate",
            "algorithm": "QPSO",
        })
        assert r.json()["valid"] is True

    def test_has_convergence(self, client):
        r = client.post("/route/optimize", json={
            "source_id": "connaught_place",
            "destination_id": "india_gate",
            "algorithm": "QPSO",
        })
        conv = r.json()["convergence"]
        assert conv is not None and len(conv) > 0


class TestRouteErrors:
    def test_same_source_destination_400(self, client):
        r = client.post("/route/optimize", json={
            "source_id": "connaught_place",
            "destination_id": "connaught_place",
            "algorithm": "QPSO",
        })
        assert r.status_code == 400

    def test_invalid_location_422(self, client):
        r = client.post("/route/optimize", json={
            "source_id": "nowhere",
            "destination_id": "india_gate",
            "algorithm": "QPSO",
        })
        assert r.status_code == 422


class TestTrafficReset:
    def test_reset_success(self, client):
        r = client.post("/traffic/reset")
        assert r.status_code == 200
        assert r.json()["success"] is True


class TestGraphMetrics:
    def test_graph_metrics_200(self, client):
        r = client.get("/network/graph-metrics")
        assert r.status_code == 200
        data = r.json()
        assert data["nodes"] == 6
        assert data["edges"] == 14
        assert "density" in data
        assert "avg_degree" in data


class TestBenchmarkCompare:
    def test_benchmark_200(self, client):
        r = client.post("/benchmark/compare", json={
            "source_id": "connaught_place",
            "destination_id": "india_gate",
            "algorithms": ["QPSO", "Dijkstra", "Genetic Algorithm"],
            "n_particles": 10,
            "n_iter": 15,
        })
        assert r.status_code == 200
        data = r.json()
        assert "results" in data
        assert len(data["results"]) == 3
        assert "winner" in data
        assert "improvement" in data
        for res in data["results"]:
            assert res["valid"] is True
            assert "coordinates" in res
            assert len(res["coordinates"]) > 0


class TestRouteGeneticAlgorithm:
    def test_ga_valid_route(self, client):
        r = client.post("/route/optimize", json={
            "source_id": "connaught_place",
            "destination_id": "india_gate",
            "algorithm": "Genetic Algorithm",
            "n_particles": 10,
            "n_iter": 15,
            "weight_time": 0.7,
            "weight_dist": 0.2,
            "weight_cong": 0.1,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True
        assert data["algorithm"] == "Genetic Algorithm"
        assert len(data["coordinates"]) > 0


class TestAnalyticsPlots:
    def test_plot_convergence_png(self, client):
        r = client.get("/analytics/plot/convergence?source_id=connaught_place&destination_id=india_gate&n_particles=10&n_iter=15")
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/png"
        assert len(r.content) > 1000  # PNG image bytes

    def test_plot_benchmark_png(self, client):
        r = client.get("/analytics/plot/benchmark?source_id=connaught_place&destination_id=india_gate")
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/png"
        assert len(r.content) > 1000

    def test_plot_radar_png(self, client):
        r = client.get("/analytics/plot/radar")
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/png"
        assert len(r.content) > 1000


class TestHistoryEndpoints:
    def test_history_routes(self, client):
        r = client.get("/history/routes")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_history_benchmarks(self, client):
        r = client.get("/history/benchmarks")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_history_stats(self, client):
        r = client.get("/history/stats")
        assert r.status_code == 200
        data = r.json()
        assert "storage_engine" in data
        assert data["storage_engine"] == "SQLite 3"

