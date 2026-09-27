"""
Tests for Exact VRP Solver using Google OR-Tools (backend/optimization/exact_solver.py)
"""
import pytest
from backend.optimization.benchmark_data import load_benchmark_instance
from backend.optimization.exact_solver import EXACT_SOLVER_MAX_STOPS, solve_vrp_exact
from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance, VRPSolution


def test_exact_solver_c101_small():
    """Verify OR-Tools exact solver produces valid solution on c101_small."""
    inst = load_benchmark_instance("c101_small")
    sol = solve_vrp_exact(inst, time_limit_seconds=1)

    assert isinstance(sol, VRPSolution)
    assert len(sol.routes) == 2
    assert sol.total_distance > 0.0
    assert sol.fitness > 0.0

    all_visited = []
    for vehicle_id, route in sol.routes.items():
        all_visited.extend(route)

    customer_stops = [s.id for s in inst.stops if s.id != inst.depot_id]
    assert sorted(all_visited) == sorted(customer_stops)
    assert len(sol.violations) == 0


def test_exact_solver_capacity_respect():
    """Verify exact solver distributes load to respect vehicle capacity."""
    stops = [
        Stop(id="depot", lat=0.0, lon=0.0, demand=0.0),
        Stop(id="s1", lat=1.0, lon=1.0, demand=10.0),
        Stop(id="s2", lat=2.0, lon=2.0, demand=10.0),
    ]
    # Each vehicle capacity 15: neither vehicle can carry both s1 and s2
    vehicles = [
        Vehicle(id="v1", capacity=15.0, start_depot_id="depot"),
        Vehicle(id="v2", capacity=15.0, start_depot_id="depot"),
    ]
    inst = VRPInstance(stops=stops, vehicles=vehicles, depot_id="depot")
    sol = solve_vrp_exact(inst, time_limit_seconds=1)

    assert isinstance(sol, VRPSolution)
    assert len(sol.routes["v1"]) == 1
    assert len(sol.routes["v2"]) == 1
    assert len(sol.violations) == 0


def test_exact_solver_max_stops_cap():
    """Verify exact solver rejects instances exceeding safe cap (>15 stops)."""
    stops = [Stop(id=f"s{i}", lat=float(i), lon=float(i)) for i in range(16)]
    vehicles = [Vehicle(id="v1", capacity=100.0, start_depot_id="s0")]
    inst = VRPInstance(stops=stops, vehicles=vehicles, depot_id="s0")

    with pytest.raises(ValueError) as excinfo:
        solve_vrp_exact(inst)

    assert "limit exceeded" in str(excinfo.value)
    assert str(EXACT_SOLVER_MAX_STOPS) in str(excinfo.value)


def test_exact_solver_empty_stops():
    """Verify exact solver gracefully handles empty instance."""
    inst = VRPInstance(
        stops=[Stop(id="depot", lat=0.0, lon=0.0)],
        vehicles=[Vehicle(id="v1", capacity=50.0, start_depot_id="depot")],
        depot_id="depot",
    )
    sol = solve_vrp_exact(inst, time_limit_seconds=1)
    assert isinstance(sol, VRPSolution)
    assert sol.routes["v1"] == []
