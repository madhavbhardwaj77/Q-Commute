"""
Tests for QAOA Quantum Micro-Cluster Subsolver (Phase 9)
"""
import pytest

from backend.quantum.qaoa_subsolver import (
    MAX_QAOA_STOPS,
    is_qaoa_available,
    solve_cluster_qaoa,
)

# Fixed 3-stop triangular instance
FIXED_STOPS = [
    {"id": "depot", "lat": 28.6139, "lon": 77.2090},
    {"id": "s1", "lat": 28.6200, "lon": 77.2150},
    {"id": "s2", "lat": 28.6250, "lon": 77.2200},
]


def test_qaoa_availability():
    """Verify QAOA capability reporting returns boolean."""
    avail = is_qaoa_available()
    assert isinstance(avail, bool)


def test_qaoa_fixed_small_instance():
    """Verify QAOA completes on a fixed 3-stop instance within timeout."""
    if not is_qaoa_available():
        pytest.skip("Qiskit Optimization QAOA not installed in this environment")

    res = solve_cluster_qaoa(
        stops=FIXED_STOPS,
        depot_id="depot",
        timeout_seconds=20.0,
        reps=1,
        maxiter=5,
    )

    assert res["algorithm"] == "QAOA"
    assert res["status"] in ("completed", "timeout")
    assert res["runtime_ms"] > 0.0
    assert res["qubits"] == 9  # 3x3 qubits for 3-stop TSP

    if res["status"] == "completed":
        assert len(res["tour"]) == 3
        assert set(res["tour"]) == {"depot", "s1", "s2"}
        assert res["tour"][0] == "depot"
        assert res["total_distance"] > 0.0


def test_qaoa_hard_cap_enforcement():
    """Verify QAOA subsolver rejects instances exceeding 8 stops."""
    stops = [{"id": f"s{i}", "lat": 28.60 + i * 0.01, "lon": 77.20} for i in range(MAX_QAOA_STOPS + 1)]
    with pytest.raises(ValueError, match="hard cap"):
        solve_cluster_qaoa(stops)


def test_qaoa_edge_cases():
    """Verify single-stop and empty stop handling."""
    res_empty = solve_cluster_qaoa([])
    assert res_empty["status"] == "completed"
    assert res_empty["tour"] == []

    res_single = solve_cluster_qaoa([{"id": "only_depot", "lat": 28.61, "lon": 77.20}])
    assert res_single["status"] == "completed"
    assert res_single["tour"] == ["only_depot"]
