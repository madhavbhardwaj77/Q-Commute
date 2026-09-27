"""
Tests for AI Scenario Parser and Scenario Optimization Endpoint
"""
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance
from backend.orchestrator.router import evaluate_algorithm_suitability, select_solver_with_ai
from backend.orchestrator.scenario_parser import SCENARIO_PRESETS, parse_scenario

client = TestClient(app)


def test_parse_scenario_emergency():
    features = parse_scenario(
        prompt="Urgent ambulance siren dispatch during peak rush hour gridlock.",
        filters={},
    )
    assert features.urgency == "emergency"
    assert features.target_objective == "time_critical"
    assert features.weights["time"] > features.weights["dist"]
    assert "emergency" in features.extracted_keywords


def test_parse_scenario_quantum():
    features = parse_scenario(
        prompt="Solve micro-cluster tour on gate-model QAOA and quantum annealer to inspect Hamiltonian QUBO.",
        filters={},
    )
    assert features.quantum_affinity >= 0.5
    assert "qaoa_gate_quantum" in features.extracted_keywords or "quantum_annealing" in features.extracted_keywords


def test_parse_scenario_green_fleet():
    features = parse_scenario(
        prompt="Logistics delivery minimizing carbon emissions and fuel consumption.",
        filters={},
    )
    assert features.target_objective == "green_fleet"
    assert features.weights["emiss"] > 0.20


def test_scenario_presets_exist():
    assert "emergency_rush_hour" in SCENARIO_PRESETS
    assert "quantum_micro_cluster" in SCENARIO_PRESETS
    assert "green_multi_fleet" in SCENARIO_PRESETS
    assert "instant_reroute" in SCENARIO_PRESETS


def test_select_solver_ai_micro_cluster():
    stops = [
        Stop(id="depot", lat=28.63, lon=77.21),
        Stop(id="s1", lat=28.62, lon=77.22),
        Stop(id="s2", lat=28.61, lon=77.23),
    ]
    vehicles = [Vehicle(id="v1", capacity=100.0, start_depot_id="depot")]
    inst = VRPInstance(stops=stops, vehicles=vehicles, depot_id="depot")

    features = parse_scenario(
        prompt="Solve Hamiltonian QUBO on gate quantum QAOA circuit.",
        filters={"hardware_preference": "prefer_qaoa"},
    )
    decision = select_solver_with_ai(inst, features=features)
    assert decision.selected_solver in {"qaoa", "quantum_annealing"}
    assert decision.confidence > 0.6
    assert len(decision.rationale) > 20


def test_select_solver_ai_large_fleet():
    stops = [Stop(id="depot", lat=28.63, lon=77.21)] + [
        Stop(id=f"s{i}", lat=28.60 + i * 0.01, lon=77.20 + i * 0.01) for i in range(1, 12)
    ]
    vehicles = [
        Vehicle(id="v1", capacity=30.0, start_depot_id="depot"),
        Vehicle(id="v2", capacity=30.0, start_depot_id="depot"),
    ]
    inst = VRPInstance(stops=stops, vehicles=vehicles, depot_id="depot")

    features = parse_scenario(prompt="Multi-vehicle delivery fleet in traffic.", filters={})
    decision = select_solver_with_ai(inst, features=features)
    assert decision.selected_solver == "qpso"
    assert "Quantum-Behaved PSO" in decision.algorithm_display


def test_scenario_optimize_api_endpoint():
    payload = {
        "prompt": "Urgent medical courier delivery with 3 stops in Connaught Place.",
        "filters": {
            "target_objective": "time_critical",
            "latency_budget": "interactive",
        },
        "stops": [
            {"id": "depot", "lat": 28.6329, "lon": 77.2195, "demand": 0.0},
            {"id": "stop1", "lat": 28.6129, "lon": 77.2295, "demand": 2.0},
            {"id": "stop2", "lat": 28.6270, "lon": 77.2166, "demand": 2.0},
        ],
        "vehicles": [
            {"id": "v1", "capacity": 20.0, "start_depot_id": "depot"}
        ],
        "depot_id": "depot",
        "benchmark_all": True,
    }
    resp = client.post("/orchestrator/scenario_optimize", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "ai_analysis" in data
    assert "scenario_features" in data
    assert "optimal_route" in data
    assert "benchmark_comparison" in data
    assert len(data["benchmark_comparison"]) >= 2
    # Verify primary route has distance and coordinates
    assert data["optimal_route"]["total_distance"] > 0
    assert "v1" in data["optimal_route"]["route_coordinates"]


def test_get_presets_api():
    resp = client.get("/orchestrator/presets")
    assert resp.status_code == 200
    data = resp.json()
    assert "emergency_rush_hour" in data
