"""
Tests for VRP Benchmark Dataset Catalog and Multi-Algorithm Comparison Endpoint
"""
import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_get_vrp_datasets():
    """Verify GET /benchmark/vrp_datasets returns standard benchmark catalog."""
    resp = client.get("/benchmark/vrp_datasets")
    assert resp.status_code == 200
    datasets = resp.json()
    assert isinstance(datasets, list)
    assert len(datasets) >= 3

    dataset_ids = [d["id"] for d in datasets]
    assert "c101_small" in dataset_ids
    assert "r101_small" in dataset_ids
    assert "rc101_small" in dataset_ids

    # Check schema of first entry
    first = datasets[0]
    for key in ("id", "name", "category", "description", "num_stops", "default_vehicles", "default_capacity"):
        assert key in first


def test_compare_vrp_c101_small():
    """Verify POST /benchmark/vrp_compare runs QPSO, GA, and Exact on clustered c101."""
    payload = {
        "dataset_id": "c101_small",
        "iterations": 10,
        "population": 10,
        "time_limit_seconds": 1,
    }
    resp = client.post("/benchmark/vrp_compare", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["dataset_id"] == "c101_small"
    assert data["num_stops"] == 10
    assert data["num_vehicles"] == 2
    assert len(data["results"]) == 3

    algos = {r["algorithm"]: r for r in data["results"]}
    assert "QPSO" in algos
    assert "Genetic Algorithm" in algos
    assert "OR-Tools (Exact)" in algos

    for r in data["results"]:
        assert r["status"] == "completed"
        assert r["fitness"] > 0.0
        assert r["runtime_ms"] > 0.0

    assert data["winner"]["lowest_cost"] is not None
    assert "qpso_optimality_gap_pct" in data["comparison_summary"]


def test_compare_vrp_r101_small():
    """Verify POST /benchmark/vrp_compare on random r101."""
    payload = {
        "dataset_id": "r101_small",
        "iterations": 10,
        "population": 10,
        "time_limit_seconds": 1,
    }
    resp = client.post("/benchmark/vrp_compare", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["dataset_id"] == "r101_small"
    completed = [r for r in data["results"] if r["status"] == "completed"]
    assert len(completed) == 3


def test_compare_vrp_rc101_small():
    """Verify POST /benchmark/vrp_compare on mixed rc101."""
    payload = {
        "dataset_id": "rc101_small",
        "iterations": 10,
        "population": 10,
        "time_limit_seconds": 1,
    }
    resp = client.post("/benchmark/vrp_compare", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["dataset_id"] == "rc101_small"
    completed = [r for r in data["results"] if r["status"] == "completed"]
    assert len(completed) == 3



def test_compare_vrp_exact_skipped_for_large_instance():
    """Verify OR-Tools exact solver is cleanly skipped when stops > 15."""
    stops = [{"id": "depot", "lat": 0.0, "lon": 0.0, "demand": 0.0}]
    for i in range(16):
        stops.append({"id": f"s{i}", "lat": float(i + 1), "lon": float(i + 1), "demand": 1.0})

    vehicles = [{"id": "v1", "capacity": 50.0, "start_depot_id": "depot"}]

    payload = {
        "stops": stops,
        "vehicles": vehicles,
        "depot_id": "depot",
        "iterations": 5,
        "population": 5,
    }
    resp = client.post("/benchmark/vrp_compare", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    exact_res = next((r for r in data["results"] if "Exact" in r["algorithm"]), None)
    assert exact_res is not None
    assert exact_res["status"] == "skipped"
    assert "exceeds safe limit" in exact_res["message"]

    # QPSO and GA still succeed
    qpso_res = next((r for r in data["results"] if r["algorithm"] == "QPSO"), None)
    assert qpso_res is not None
    assert qpso_res["status"] == "completed"


def test_compare_vrp_invalid_dataset():
    """Verify 400 error when unknown dataset is requested."""
    resp = client.post("/benchmark/vrp_compare", json={"dataset_id": "unknown_dataset_xyz"})
    assert resp.status_code == 400
