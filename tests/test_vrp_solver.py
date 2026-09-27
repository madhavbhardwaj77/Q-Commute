"""
Unit and integration tests for multi-vehicle VRP solvers (QPSO and GA) and POST /fleet/optimize.
"""
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.optimization.fitness import vrp_fitness
from backend.optimization.genetic import solve_vrp_ga
from backend.optimization.qpso import solve_vrp_qpso
from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance, VRPSolution


@pytest.fixture
def synthetic_vrp_instance():
    """
    Synthetic 8-stop instance with 2 vehicles.
    Total demand = 20.0.
    v_tight capacity = 9.0 (tight constraint).
    v_large capacity = 15.0.
    Both vehicles must be utilized to avoid capacity violations.
    """
    depot = Stop(id="depot", lat=0.0, lon=0.0, demand=0.0)
    stops = [
        depot,
        Stop(id="s1", lat=1.0, lon=1.0, demand=2.0),
        Stop(id="s2", lat=1.0, lon=2.0, demand=2.0),
        Stop(id="s3", lat=2.0, lon=1.0, demand=2.0),
        Stop(id="s4", lat=2.0, lon=2.0, demand=2.0),
        Stop(id="s5", lat=-1.0, lon=-1.0, demand=3.0),
        Stop(id="s6", lat=-1.0, lon=-2.0, demand=3.0),
        Stop(id="s7", lat=-2.0, lon=-1.0, demand=3.0),
        Stop(id="s8", lat=-2.0, lon=-2.0, demand=3.0),
    ]
    vehicles = [
        Vehicle(id="v_tight", capacity=9.0, start_depot_id="depot"),
        Vehicle(id="v_large", capacity=15.0, start_depot_id="depot"),
    ]
    return VRPInstance(stops=stops, vehicles=vehicles, depot_id="depot")


def inline_nearest_neighbor(instance: VRPInstance):
    """Inline greedy nearest-neighbor solver for baseline comparison."""
    unassigned = [s.id for s in instance.stops if s.id != instance.depot_id]
    routes = {v.id: [] for v in instance.vehicles}

    for v in instance.vehicles:
        curr = v.start_depot_id or instance.depot_id
        curr_load = 0.0
        while unassigned:
            best_s = min(unassigned, key=lambda sid: instance.get_distance(curr, sid))
            dem = instance.get_stop(best_s).demand
            if curr_load + dem <= v.capacity or len(routes[v.id]) == 0:
                routes[v.id].append(best_s)
                curr_load += dem
                unassigned.remove(best_s)
                curr = best_s
            else:
                break

    for i, s in enumerate(unassigned):
        routes[instance.vehicles[i % len(instance.vehicles)].id].append(s)

    return routes


def test_both_vehicles_assigned_and_capacity_respected(synthetic_vrp_instance):
    """
    Verify QPSO assigns stops to both vehicles (no vehicle silently ignored)
    and respects vehicle capacity constraints.
    """
    solution = solve_vrp_qpso(
        instance=synthetic_vrp_instance,
        iterations=40,
        swarm_size=25,
        seed=42,
    )

    # 1. Both vehicles must be assigned stops
    assert len(solution.routes["v_tight"]) > 0, "v_tight was silently ignored"
    assert len(solution.routes["v_large"]) > 0, "v_large was silently ignored"

    # 2. All 8 customer stops must be partitioned across the vehicles
    all_assigned = set(solution.routes["v_tight"]) | set(solution.routes["v_large"])
    expected_stops = {f"s{i}" for i in range(1, 9)}
    assert all_assigned == expected_stops
    assert len(solution.routes["v_tight"]) + len(solution.routes["v_large"]) == 8

    # 3. Capacity constraints must be respected
    tight_load = sum(
        synthetic_vrp_instance.get_stop(sid).demand
        for sid in solution.routes["v_tight"]
    )
    large_load = sum(
        synthetic_vrp_instance.get_stop(sid).demand
        for sid in solution.routes["v_large"]
    )

    assert tight_load <= 9.0, f"v_tight exceeded capacity: {tight_load} > 9.0"
    assert large_load <= 15.0, f"v_large exceeded capacity: {large_load} > 15.0"
    assert solution.violations == []


def test_deliberately_infeasible_instance_flags_capacity_violation():
    """Verify that an over-demanded instance is clearly flagged with violations."""
    depot = Stop(id="depot", lat=0.0, lon=0.0, demand=0.0)
    stops = [
        depot,
        Stop(id="s1", lat=1.0, lon=1.0, demand=8.0),
        Stop(id="s2", lat=2.0, lon=2.0, demand=8.0),
    ]
    # Total demand = 16.0, Total capacity = 10.0 (infeasible)
    vehicles = [
        Vehicle(id="v1", capacity=5.0, start_depot_id="depot"),
        Vehicle(id="v2", capacity=5.0, start_depot_id="depot"),
    ]
    instance = VRPInstance(stops=stops, vehicles=vehicles, depot_id="depot")

    solution = solve_vrp_qpso(instance=instance, iterations=15, swarm_size=15, seed=42)

    assert len(solution.violations) > 0
    assert any("capacity" in v.lower() for v in solution.violations)


def test_qpso_no_worse_than_nearest_neighbor_baseline(synthetic_vrp_instance):
    """
    Running solve_vrp_qpso multiple times produces solutions with fitness
    scores no worse than a naive nearest-neighbor baseline.
    """
    # 1. Compute inline nearest-neighbor baseline
    nn_routes = inline_nearest_neighbor(synthetic_vrp_instance)
    nn_solution = VRPSolution(routes=nn_routes)
    nn_fitness, _ = vrp_fitness(nn_solution, synthetic_vrp_instance)

    # 2. Run solve_vrp_qpso with multiple random seeds
    seeds = [42, 123, 999]
    for seed in seeds:
        qpso_solution = solve_vrp_qpso(
            instance=synthetic_vrp_instance,
            iterations=40,
            swarm_size=25,
            seed=seed,
        )
        qpso_fitness, _ = vrp_fitness(qpso_solution, synthetic_vrp_instance)

        assert qpso_fitness <= nn_fitness + 1e-4, (
            f"Seed {seed}: QPSO fitness ({qpso_fitness:.4f}) was worse than "
            f"nearest-neighbor baseline ({nn_fitness:.4f})"
        )


def test_ga_vrp_solver(synthetic_vrp_instance):
    """Verify solve_vrp_ga solves VRP instance and satisfies constraints."""
    solution = solve_vrp_ga(
        instance=synthetic_vrp_instance,
        generations=30,
        population_size=25,
        seed=42,
    )

    assert len(solution.routes["v_tight"]) > 0
    assert len(solution.routes["v_large"]) > 0
    assert solution.violations == []
    assert len(solution.convergence) == 31


def test_fleet_optimize_api_endpoint():
    """Verify POST /fleet/optimize end-to-end on a synthetic VRP instance."""
    client = TestClient(app)
    payload = {
        "stops": [
            {"id": "depot", "lat": 0.0, "lon": 0.0, "demand": 0.0},
            {"id": "s1", "lat": 1.0, "lon": 1.0, "demand": 2.0},
            {"id": "s2", "lat": 1.0, "lon": 2.0, "demand": 2.0},
            {"id": "s3", "lat": 2.0, "lon": 1.0, "demand": 2.0},
            {"id": "s4", "lat": 2.0, "lon": 2.0, "demand": 2.0},
            {"id": "s5", "lat": -1.0, "lon": -1.0, "demand": 3.0},
            {"id": "s6", "lat": -1.0, "lon": -2.0, "demand": 3.0},
            {"id": "s7", "lat": -2.0, "lon": -1.0, "demand": 3.0},
            {"id": "s8", "lat": -2.0, "lon": -2.0, "demand": 3.0},
        ],
        "vehicles": [
            {"id": "v_tight", "capacity": 9.0, "start_depot_id": "depot"},
            {"id": "v_large", "capacity": 15.0, "start_depot_id": "depot"},
        ],
        "depot_id": "depot",
        "algorithm": "QPSO",
        "iterations": 25,
        "swarm_size": 20,
    }

    response = client.post("/fleet/optimize", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["algorithm"] == "QPSO"
    assert "v_tight" in data["routes"]
    assert "v_large" in data["routes"]
    assert len(data["routes"]["v_tight"]) > 0
    assert len(data["routes"]["v_large"]) > 0
    assert data["violations"] == []
    assert data["total_distance"] > 0
    assert data["fitness"] > 0
    assert len(data["convergence"]) > 0

    # Verify route_coordinates for frontend map rendering
    assert "route_coordinates" in data
    assert "v_tight" in data["route_coordinates"]
    assert "v_large" in data["route_coordinates"]
    assert len(data["route_coordinates"]["v_tight"]) >= 3  # depot -> stop(s) -> depot
    assert len(data["route_coordinates"]["v_large"]) >= 3

    # Verify vehicle_metrics for summary panel
    assert "vehicle_metrics" in data
    assert "v_tight" in data["vehicle_metrics"]
    assert "v_large" in data["vehicle_metrics"]
    tight_metric = data["vehicle_metrics"]["v_tight"]
    assert tight_metric["num_stops"] == len(data["routes"]["v_tight"])
    assert tight_metric["capacity"] == 9.0
    assert tight_metric["load"] <= 9.0
    assert tight_metric["distance"] > 0

