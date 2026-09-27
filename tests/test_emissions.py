"""
Tests for Fuel Cost and Carbon Emissions Sustainability Estimator
"""
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.optimization.emissions import (
    DEFAULT_CO2_PER_KM,
    DEFAULT_COST_PER_KM,
    compute_co2_emissions,
    compute_fuel_cost,
    compute_sustainability_metrics,
)

client = TestClient(app)


def test_compute_fuel_cost():
    """Verify fuel cost calculation with meter conversion and custom rate."""
    # Distance <= 50 treated as km
    assert compute_fuel_cost(10.0, cost_per_km=10.0) == 100.0
    # Distance > 50 treated as meters -> converted to km
    assert compute_fuel_cost(5000.0, cost_per_km=8.50) == 42.50
    # Zero distance
    assert compute_fuel_cost(0.0) == 0.0


def test_compute_co2_emissions():
    """Verify CO2 calculation with default and custom emission factors."""
    # 10,000 meters = 10 km * 0.210 kg/km = 2.100 kg CO2
    assert compute_co2_emissions(10000.0) == 2.10
    # Custom factor: 5 km * 0.300 = 1.500 kg
    assert compute_co2_emissions(5.0, emissions_kg_per_km=0.300) == 1.50


def test_compute_sustainability_metrics():
    """Verify combined dictionary metrics helper."""
    metrics = compute_sustainability_metrics(20000.0)
    assert metrics["distance_km"] == 20.0
    assert metrics["estimated_fuel_cost"] == round(20.0 * DEFAULT_COST_PER_KM, 2)
    assert metrics["estimated_co2_kg"] == round(20.0 * DEFAULT_CO2_PER_KM, 3)


def test_fleet_optimize_emissions_response():
    """Verify POST /fleet/optimize calculates and returns fuel cost and CO2 metrics."""
    payload = {
        "stops": [
            {"id": "depot", "lat": 28.6139, "lon": 77.2090, "demand": 0.0},
            {"id": "s1", "lat": 28.6200, "lon": 77.2150, "demand": 2.0},
            {"id": "s2", "lat": 28.6250, "lon": 77.2200, "demand": 3.0},
        ],
        "vehicles": [
            {"id": "v1", "capacity": 10.0, "speed": 1.0},
            {"id": "v2", "capacity": 10.0, "speed": 1.0},
        ],
        "depot_id": "depot",
        "iterations": 10,
        "swarm_size": 10,
        "cost_per_km": 10.0,
        "emissions_factor_per_km": 0.250,
    }
    resp = client.post("/fleet/optimize", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "estimated_fuel_cost" in data
    assert "estimated_co2_kg" in data
    assert data["estimated_fuel_cost"] >= 0.0
    assert data["estimated_co2_kg"] >= 0.0

    for v_id, vm in data["vehicle_metrics"].items():
        assert "fuel_cost" in vm
        assert "co2_kg" in vm
        assert vm["fuel_cost"] >= 0.0
        assert vm["co2_kg"] >= 0.0


def test_orchestrator_solve_emissions_response():
    """Verify POST /orchestrator/solve includes fuel cost and CO2 in vehicle metrics and fleet summary."""
    payload = {
        "stops": [
            {"id": "depot", "lat": 28.6139, "lon": 77.2090, "demand": 0.0},
            {"id": "s1", "lat": 28.6200, "lon": 77.2150, "demand": 2.0},
        ],
        "vehicles": [
            {"id": "v1", "capacity": 10.0, "speed": 1.0},
        ],
        "depot_id": "depot",
        "iterations": 10,
        "swarm_size": 10,
    }
    resp = client.post("/orchestrator/solve", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "estimated_fuel_cost" in data
    assert "estimated_co2_kg" in data
    assert data["estimated_fuel_cost"] >= 0.0
    assert data["estimated_co2_kg"] >= 0.0

    vm = data["vehicle_metrics"]["v1"]
    assert "fuel_cost" in vm
    assert "co2_kg" in vm
