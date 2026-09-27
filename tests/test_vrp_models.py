"""
Unit tests for VRP data models, constraint validation, and VRP fitness scoring.
"""
import pytest

from backend.optimization.constraints import (
    check_all_constraints,
    check_capacity,
    check_max_duration,
    check_time_windows,
)
from backend.optimization.fitness import vrp_fitness
from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance, VRPSolution


def test_valid_solution_scores_only_base_metrics():
    """A valid solution with no violations scores based only on time/distance/congestion."""
    depot = Stop(id="depot", lat=0.0, lon=0.0)
    stop1 = Stop(
        id="s1",
        lat=3.0,
        lon=4.0,
        demand=5.0,
        time_window_start=0.0,
        time_window_end=50.0,
    )
    vehicle = Vehicle(
        id="v1",
        capacity=20.0,
        start_depot_id="depot",
        max_route_duration=100.0,
    )
    instance = VRPInstance(stops=[depot, stop1], vehicles=[vehicle], depot_id="depot")

    # Provided metrics: distance=10.0, time=10.0, congestion=2.0
    solution = VRPSolution(
        routes={"v1": ["s1"]},
        total_distance=10.0,
        total_time=10.0,
        total_congestion=2.0,
    )

    weights = {
        "time": 0.5,
        "distance": 0.3,
        "congestion": 0.2,
        "T_ref": 1.0,
        "D_ref": 1.0,
        "C_ref": 1.0,
    }
    fitness, violations = vrp_fitness(solution, instance, weights)

    assert violations == []
    expected_cost = 0.5 * 10.0 + 0.3 * 10.0 + 0.2 * 2.0  # 5 + 3 + 0.4 = 8.4
    assert pytest.approx(fitness) == expected_cost
    assert solution.violations == []


def test_capacity_violation_flagged_and_penalized():
    """A solution exceeding a vehicle's capacity is flagged and heavily penalized."""
    depot = Stop(id="depot", lat=0.0, lon=0.0)
    stop1 = Stop(id="s1", lat=1.0, lon=0.0, demand=12.0)
    stop2 = Stop(id="s2", lat=2.0, lon=0.0, demand=5.0)
    vehicle = Vehicle(id="v1", capacity=15.0, start_depot_id="depot")
    instance = VRPInstance(stops=[depot, stop1, stop2], vehicles=[vehicle], depot_id="depot")

    # Standalone constraint check: 12 + 5 = 17 > 15
    violations = check_capacity({"v1": ["s1", "s2"]}, instance)
    assert len(violations) == 1
    assert "capacity" in violations[0].lower()

    # Fitness check with base metrics
    solution = VRPSolution(
        routes={"v1": ["s1", "s2"]},
        total_distance=4.0,
        total_time=4.0,
        total_congestion=0.0,
    )
    weights = {"time": 0.5, "distance": 0.5, "congestion": 0.0, "penalty_multiplier": 1000.0}
    fitness, reported_violations = vrp_fitness(solution, instance, weights)

    assert len(reported_violations) == 1
    assert "capacity" in reported_violations[0].lower()
    base_cost = 0.5 * 4.0 + 0.5 * 4.0  # 4.0
    assert fitness >= base_cost + 1000.0


def test_time_window_violation_flagged_and_penalized():
    """A solution violating a stop's time window is flagged and penalized."""
    depot = Stop(id="depot", lat=0.0, lon=0.0)
    # Distance from depot (0,0) to s1 (0, 10) is 10.0. Travel time is 10.0.
    # Window end is 6.0, so arrival at 10.0 violates the deadline.
    stop1 = Stop(
        id="s1",
        lat=0.0,
        lon=10.0,
        demand=2.0,
        time_window_start=0.0,
        time_window_end=6.0,
    )
    vehicle = Vehicle(id="v1", capacity=10.0, start_depot_id="depot")
    instance = VRPInstance(stops=[depot, stop1], vehicles=[vehicle], depot_id="depot")

    # Standalone constraint check
    violations = check_time_windows({"v1": ["s1"]}, instance)
    assert len(violations) == 1
    assert "late" in violations[0].lower() or "window" in violations[0].lower()

    # vrp_fitness check
    solution = VRPSolution(
        routes={"v1": ["s1"]},
        total_distance=20.0,
        total_time=20.0,
    )
    fitness, reported_violations = vrp_fitness(solution, instance)
    assert len(reported_violations) == 1
    assert fitness >= 1000.0


def test_multiple_violation_types_reported_together():
    """A solution with multiple violation types reports all of them, not just the first one found."""
    depot = Stop(id="depot", lat=0.0, lon=0.0)
    # Stop with demand exceeding capacity (15 > 10) and time window ending too early (4.0 < 10.0)
    stop1 = Stop(
        id="s1",
        lat=0.0,
        lon=10.0,
        demand=15.0,
        time_window_end=4.0,
    )
    # Vehicle has max route duration 12.0 (round trip depot -> s1 -> depot = 20.0 > 12.0)
    vehicle = Vehicle(
        id="v1",
        capacity=10.0,
        start_depot_id="depot",
        max_route_duration=12.0,
    )
    instance = VRPInstance(stops=[depot, stop1], vehicles=[vehicle], depot_id="depot")
    solution = VRPSolution(routes={"v1": ["s1"]})

    fitness, violations = vrp_fitness(solution, instance)

    # Must catch all 3 distinct violation types: capacity, time window, and max duration
    assert len(violations) >= 3
    violation_blob = " ".join(violations).lower()
    assert "capacity" in violation_blob
    assert "late" in violation_blob or "window" in violation_blob
    assert "duration" in violation_blob

    # Multi-violation penalty scales additively
    assert fitness >= 3000.0


def test_max_duration_constraint_independently():
    """Verify max route duration constraint catches violations and passes valid routes."""
    depot = Stop(id="depot", lat=0.0, lon=0.0)
    s1 = Stop(id="s1", lat=0.0, lon=5.0)
    v_tight = Vehicle(id="v_tight", capacity=10.0, start_depot_id="depot", max_route_duration=8.0)
    v_ample = Vehicle(id="v_ample", capacity=10.0, start_depot_id="depot", max_route_duration=25.0)

    # Round trip is 5 + 5 = 10
    instance = VRPInstance(stops=[depot, s1], vehicles=[v_tight, v_ample], depot_id="depot")

    tight_violations = check_max_duration({"v_tight": ["s1"]}, instance)
    assert len(tight_violations) == 1
    assert "duration" in tight_violations[0].lower()

    ample_violations = check_max_duration({"v_ample": ["s1"]}, instance)
    assert len(ample_violations) == 0


def test_vrp_models_dictionary_compatibility():
    """Verify VRPSolution behaves like a dictionary and tracks metadata."""
    sol = VRPSolution(
        routes={"v1": ["s1", "s2"], "v2": ["s3"]},
        total_distance=12.5,
        total_time=15.0,
        total_congestion=0.5,
    )

    # Dictionary access
    assert sol["v1"] == ["s1", "s2"]
    assert sol.get("v2") == ["s3"]
    assert "v1" in sol
    assert len(sol) == 2
    assert list(sol.keys()) == ["v1", "v2"]

    # Dataclass field access
    assert sol.total_distance == 12.5
    assert sol.total_time == 15.0
    assert sol.total_congestion == 0.5
    assert sol.violations == []


def test_haversine_distance_computation():
    """Verify VRPInstance supports Haversine metric for geographic coordinates."""
    # Delhi Connaught Place to India Gate: ~2.4 km
    cp = Stop(id="cp", lat=28.6329, lon=77.2195)
    ig = Stop(id="ig", lat=28.6129, lon=77.2295)
    v = Vehicle(id="v1", capacity=10, start_depot_id="cp")
    instance = VRPInstance(stops=[cp, ig], vehicles=[v], depot_id="cp", metric="haversine")

    dist = instance.get_distance("cp", "ig")
    assert 2000 < dist < 3000  # meters
