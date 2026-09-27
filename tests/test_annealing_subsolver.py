"""
Tests for Quantum Annealing (Neal) Subsolver & /quantum/validate Router (Phase 9)
"""
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.quantum.annealing_subsolver import (
    MAX_ANNEALING_STOPS,
    is_annealing_available,
    solve_cluster_annealing,
)

client = TestClient(app)

# Same fixed 3-stop triangular instance as test_qaoa_subsolver.py
FIXED_STOPS = [
    {"id": "depot", "lat": 28.6139, "lon": 77.2090},
    {"id": "s1", "lat": 28.6200, "lon": 77.2150},
    {"id": "s2", "lat": 28.6250, "lon": 77.2200},
]


def test_annealing_availability():
    """Verify quantum annealing capability reporting returns boolean."""
    avail = is_annealing_available()
    assert isinstance(avail, bool)


def test_annealing_fixed_small_instance():
    """Verify Simulated Annealing completes within timeout on fixed 3-stop instance."""
    if not is_annealing_available():
        pytest.skip("dwave-neal / dimod not installed in this environment")

    res = solve_cluster_annealing(
        stops=FIXED_STOPS,
        depot_id="depot",
        num_reads=50,
        timeout_seconds=10.0,
    )

    assert res["algorithm"] == "Quantum Annealing (Neal)"
    assert res["status"] == "completed"
    assert res["runtime_ms"] > 0.0
    assert len(res["tour"]) == 3
    assert set(res["tour"]) == {"depot", "s1", "s2"}
    assert res["tour"][0] == "depot"
    assert res["total_distance"] > 0.0
    assert "energy" in res


def test_annealing_hard_cap():
    """Verify annealing subsolver enforces hard cap of 8 stops."""
    stops = [{"id": f"s{i}", "lat": 28.60 + i * 0.01, "lon": 77.20} for i in range(MAX_ANNEALING_STOPS + 1)]
    with pytest.raises(ValueError, match="hard cap"):
        solve_cluster_annealing(stops)


def test_quantum_status_api():
    """Verify GET /quantum/status endpoint."""
    resp = client.get("/quantum/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "qaoa_available" in data
    assert "annealing_available" in data
    assert data["max_cluster_stops"] == 8


def test_quantum_validate_api():
    """Verify POST /quantum/validate runs three-way side-by-side comparison."""
    payload = {
        "stops": FIXED_STOPS,
        "depot_id": "depot",
        "timeout_seconds": 15.0,
        "qpso_iterations": 20,
        "annealing_reads": 50,
    }
    resp = client.post("/quantum/validate", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["num_stops"] == 3
    assert data["depot_id"] == "depot"
    assert "qpso" in data["solvers"]
    assert "qaoa" in data["solvers"]
    assert "quantum_annealing" in data["solvers"]

    # Verify QPSO result structure
    qpso = data["solvers"]["qpso"]
    assert qpso["status"] == "completed"
    assert qpso["total_distance"] > 0.0

    # Verify Annealing result structure
    anneal = data["solvers"]["quantum_annealing"]
    assert anneal["status"] == "completed"
    assert anneal["total_distance"] > 0.0

    # Verify QAOA result structure
    qaoa = data["solvers"]["qaoa"]
    assert qaoa["status"] in ("completed", "timeout")

    # Verify comparison summary
    comp = data["comparison"]
    assert "solvers_completed" in comp
    assert comp["solvers_completed"] >= 2
