"""
Tests for Rule-Based Solver Selection and Orchestrator Endpoint
"""
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance
from backend.orchestrator.router import select_solver

client = TestClient(app)


def test_select_solver_small_single_vehicle_picks_exact():
    """Instances with <= 10 stops and 1 vehicle should select exact solver."""
    stops = [Stop(id="depot", lat=0.0, lon=0.0)] + [
        Stop(id=f"s{i}", lat=float(i), lon=float(i)) for i in range(1, 6)
    ]
    vehicles = [Vehicle(id="v1", capacity=100.0, start_depot_id="depot")]
    inst = VRPInstance(stops=stops, vehicles=vehicles, depot_id="depot")

    solver_name, reason = select_solver(inst, context={})
    assert solver_name == "exact"
    assert "exact solver feasible" in reason


def test_select_solver_live_reroute_picks_warm_start():
    """Urgency context 'live_reroute' should select qpso_warm_start."""
    stops = [Stop(id="depot", lat=0.0, lon=0.0)] + [
        Stop(id=f"s{i}", lat=float(i), lon=float(i)) for i in range(1, 15)
    ]
    vehicles = [
        Vehicle(id="v1", capacity=50.0, start_depot_id="depot"),
        Vehicle(id="v2", capacity=50.0, start_depot_id="depot"),
    ]
    inst = VRPInstance(stops=stops, vehicles=vehicles, depot_id="depot")

    solver_name, reason = select_solver(inst, context={"urgency": "live_reroute"})
    assert solver_name == "qpso_warm_start"
    assert "time-sensitive reroute" in reason


def test_select_solver_default_picks_qpso_vrp():
    """Standard instances should default to qpso_vrp."""
    stops = [Stop(id="depot", lat=0.0, lon=0.0)] + [
        Stop(id=f"s{i}", lat=float(i), lon=float(i)) for i in range(1, 12)
    ]
    vehicles = [
        Vehicle(id="v1", capacity=50.0, start_depot_id="depot"),
        Vehicle(id="v2", capacity=50.0, start_depot_id="depot"),
    ]
    inst = VRPInstance(stops=stops, vehicles=vehicles, depot_id="depot")

    solver_name, reason = select_solver(inst, context={})
    assert solver_name == "qpso_vrp"
    assert "default: full QPSO-VRP" in reason


def test_orchestrator_solve_endpoint_exact():
    """POST /orchestrator/solve routes small single-vehicle instance to exact solver."""
    payload = {
        "stops": [
            {"id": "depot", "lat": 12.97, "lon": 77.59, "demand": 0.0},
            {"id": "stop1", "lat": 12.98, "lon": 77.60, "demand": 5.0},
            {"id": "stop2", "lat": 12.99, "lon": 77.61, "demand": 5.0},
        ],
        "vehicles": [
            {"id": "v1", "capacity": 20.0, "start_depot_id": "depot"}
        ],
        "depot_id": "depot",
        "profile": "delivery",
    }
    resp = client.post("/orchestrator/solve", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["solver_used"] == "exact"
    assert "exact solver feasible" in data["solver_reason"]
    assert "v1" in data["routes"]
    assert len(data["routes"]["v1"]) == 2
    assert data["total_distance"] > 0.0
    assert data["profile"] == "delivery"


def test_orchestrator_solve_endpoint_warm_start():
    """POST /orchestrator/solve routes live reroutes to warm-start QPSO."""
    payload = {
        "stops": [
            {"id": "depot", "lat": 12.97, "lon": 77.59, "demand": 0.0},
            {"id": "stop1", "lat": 12.98, "lon": 77.60, "demand": 5.0},
            {"id": "stop2", "lat": 12.99, "lon": 77.61, "demand": 5.0},
            {"id": "stop3", "lat": 12.96, "lon": 77.58, "demand": 5.0},
        ],
        "vehicles": [
            {"id": "v1", "capacity": 20.0, "start_depot_id": "depot"},
            {"id": "v2", "capacity": 20.0, "start_depot_id": "depot"},
        ],
        "depot_id": "depot",
        "context": {"urgency": "live_reroute"},
        "previous_solution": {
            "v1": ["stop1", "stop2"],
            "v2": ["stop3"]
        },
        "iterations": 10,
        "swarm_size": 10,
    }
    resp = client.post("/orchestrator/solve", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["solver_used"] == "qpso_warm_start"
    assert "time-sensitive reroute" in data["solver_reason"]
    assert len(data["routes"]) == 2


def test_orchestrator_solve_endpoint_default_qpso():
    """POST /orchestrator/solve routes multi-vehicle normal requests to full QPSO-VRP."""
    payload = {
        "stops": [
            {"id": "depot", "lat": 12.97, "lon": 77.59, "demand": 0.0},
            {"id": "stop1", "lat": 12.98, "lon": 77.60, "demand": 5.0},
            {"id": "stop2", "lat": 12.99, "lon": 77.61, "demand": 5.0},
        ],
        "vehicles": [
            {"id": "v1", "capacity": 20.0, "start_depot_id": "depot"},
            {"id": "v2", "capacity": 20.0, "start_depot_id": "depot"},
        ],
        "depot_id": "depot",
        "profile": "emergency",
        "iterations": 10,
        "swarm_size": 10,
    }
    resp = client.post("/orchestrator/solve", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["solver_used"] == "qpso_vrp"
    assert "default: full QPSO-VRP" in data["solver_reason"]
    assert data["profile"] == "emergency"
    assert data["fitness"] > 0.0
