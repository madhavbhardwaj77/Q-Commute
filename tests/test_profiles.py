"""
Unit and integration tests for optimization priority profiles (delivery, emergency, VIP, custom).
"""
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.optimization.fitness import vrp_fitness
from backend.optimization.profiles import (
    EMERGENCY_MAX_CONGESTION_THRESHOLD,
    PROFILES,
    resolve_profile_weights,
)
from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance, VRPSolution


def test_named_profiles_resolve_correctly():
    """Verify each named profile resolves to its correct weight values."""
    # 1. Delivery: time=0.2, distance=0.6, congestion=0.2
    del_w = resolve_profile_weights("delivery")
    assert del_w["time"] == 0.2
    assert del_w["distance"] == 0.6
    assert del_w["congestion"] == 0.2
    assert del_w["profile"] == "delivery"

    # 2. Emergency: time=0.8, distance=0.1, congestion=0.1 + threshold
    em_w = resolve_profile_weights("emergency")
    assert em_w["time"] == 0.8
    assert em_w["distance"] == 0.1
    assert em_w["congestion"] == 0.1
    assert em_w["profile"] == "emergency"
    assert em_w["emergency_max_congestion"] == EMERGENCY_MAX_CONGESTION_THRESHOLD

    # 3. VIP: time=0.2, distance=0.2, congestion=0.6
    vip_w = resolve_profile_weights("vip")
    assert vip_w["time"] == 0.2
    assert vip_w["distance"] == 0.2
    assert vip_w["congestion"] == 0.6
    assert vip_w["profile"] == "vip"

    # 4. Custom: user weights preserved
    custom_w = resolve_profile_weights(
        "custom",
        custom_weights={"time": 0.4, "distance": 0.4, "congestion": 0.2},
    )
    assert custom_w["time"] == 0.4
    assert custom_w["distance"] == 0.4
    assert custom_w["congestion"] == 0.2
    assert custom_w["profile"] == "custom"


def test_emergency_profile_flags_or_avoids_congested_route_compared_to_delivery():
    """
    Verify emergency profile treats congestion above threshold as a hard violation,
    whereas delivery profile accepts shorter routes even if congested.
    """
    depot = Stop(id="depot", lat=0.0, lon=0.0, demand=0.0)
    stop1 = Stop(id="s1", lat=1.0, lon=0.0, demand=5.0)
    vehicle = Vehicle(id="v1", capacity=10.0, start_depot_id="depot")
    instance = VRPInstance(stops=[depot, stop1], vehicles=[vehicle], depot_id="depot")

    # Route A: Short distance & fast, but high congestion (0.85 > 0.5 threshold)
    sol_congested = VRPSolution(
        routes={"v1": ["s1"]},
        total_distance=10.0,
        total_time=10.0,
        total_congestion=0.85,
    )

    # Route B: Longer detour, but completely clear of congestion (0.05 <= 0.5)
    sol_clear = VRPSolution(
        routes={"v1": ["s1"]},
        total_distance=28.0,
        total_time=14.0,
        total_congestion=0.05,
    )

    # --- Delivery Profile ---
    del_weights = resolve_profile_weights("delivery")
    del_fit_congested, del_viol_congested = vrp_fitness(sol_congested, instance, del_weights)
    del_fit_clear, del_viol_clear = vrp_fitness(sol_clear, instance, del_weights)

    # Delivery profile has NO congestion violation
    assert len(del_viol_congested) == 0
    assert len(del_viol_clear) == 0

    # Under delivery, short congested route is preferred because of lower distance
    # del_cost_congested = 0.2 * 10 + 0.6 * 10 + 0.2 * 0.85 = 8.17
    # del_cost_clear = 0.2 * 14 + 0.6 * 28 + 0.2 * 0.05 = 19.61
    assert del_fit_congested < del_fit_clear

    # --- Emergency Profile ---
    em_weights = resolve_profile_weights("emergency")
    em_fit_congested, em_viol_congested = vrp_fitness(sol_congested, instance, em_weights)
    em_fit_clear, em_viol_clear = vrp_fitness(sol_clear, instance, em_weights)

    # Emergency profile flags the congested route as a hard violation
    assert len(em_viol_congested) > 0
    assert any("congestion" in v.lower() for v in em_viol_congested)
    assert len(em_viol_clear) == 0

    # Because of heavy penalty on the violation, clear detour wins overwhelmingly
    assert em_fit_clear < em_fit_congested
    assert em_fit_congested >= 1000.0


def test_fleet_optimize_api_with_profiles():
    """Verify POST /fleet/optimize accepts profile field and returns profile metadata."""
    client = TestClient(app)
    payload = {
        "stops": [
            {"id": "depot", "lat": 0.0, "lon": 0.0, "demand": 0.0},
            {"id": "s1", "lat": 1.0, "lon": 1.0, "demand": 2.0},
            {"id": "s2", "lat": 2.0, "lon": 2.0, "demand": 2.0},
        ],
        "vehicles": [
            {"id": "v1", "capacity": 10.0, "start_depot_id": "depot"},
        ],
        "depot_id": "depot",
        "profile": "emergency",
        "iterations": 20,
        "swarm_size": 15,
    }

    response = client.post("/fleet/optimize", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["profile"] == "emergency"
    assert "v1" in data["routes"]
    assert data["fitness"] > 0


def test_single_route_optimize_with_profiles():
    """Verify POST /route/optimize accepts profile field without breaking single route."""
    from unittest.mock import patch
    import backend.graph.state as gs_mod
    import backend.routers.route as route_mod
    from tests.test_api import SYNTHETIC_STATE

    with patch.object(gs_mod, "graph_state", SYNTHETIC_STATE), \
         patch.object(route_mod, "graph_state", SYNTHETIC_STATE):
        client = TestClient(app)
        payload = {
            "source_id": "connaught_place",
            "destination_id": "india_gate",
            "algorithm": "Dijkstra",
            "profile": "emergency",
        }
        response = client.post("/route/optimize", json=payload)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["valid"] is True
        assert data["distance_m"] > 0

