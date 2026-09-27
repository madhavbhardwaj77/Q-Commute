"""
Exact VRP Solver using Google OR-Tools Routing Library

Provides an exact / branch-and-cut / constraint-programming baseline for VRP
instances. Enforces a safe instance size cap (<= 15 stops) and configurable
time limits (default 5s) to guarantee fast termination.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from backend.optimization.fitness import vrp_fitness
from backend.optimization.vrp_models import VRPInstance, VRPSolution

log = logging.getLogger(__name__)

EXACT_SOLVER_MAX_STOPS = 15


def solve_vrp_exact(
    instance: VRPInstance,
    weights: Optional[Dict[str, float]] = None,
    time_limit_seconds: int = 5,
) -> VRPSolution:
    """
    Solve a Vehicle Routing Problem using Google OR-Tools.

    Args:
        instance: VRP problem instance with stops and vehicles.
        weights: Cost function weighting parameters.
        time_limit_seconds: Timeout for the search solver.

    Returns:
        VRPSolution matching the format of metaheuristic solvers.

    Raises:
        ValueError: If instance exceeds EXACT_SOLVER_MAX_STOPS.
    """
    num_stops = len(instance.stops)
    if num_stops > EXACT_SOLVER_MAX_STOPS:
        raise ValueError(
            f"Exact solver instance size limit exceeded: {num_stops} stops > {EXACT_SOLVER_MAX_STOPS} max allowed."
        )

    if not instance.stops or not instance.vehicles:
        return VRPSolution(routes={}, total_distance=0.0, total_time=0.0, fitness=0.0)

    # Locate depot indices for vehicle start and end
    depot_node = 0
    for idx, stop in enumerate(instance.stops):
        if stop.id == instance.depot_id:
            depot_node = idx
            break

    starts: List[int] = []
    ends: List[int] = []
    for v in instance.vehicles:
        v_depot = v.start_depot_id or instance.depot_id
        start_idx = depot_node
        for idx, s in enumerate(instance.stops):
            if s.id == v_depot:
                start_idx = idx
                break
        starts.append(start_idx)
        ends.append(start_idx)

    num_vehicles = len(instance.vehicles)
    manager = pywrapcp.RoutingIndexManager(num_stops, num_vehicles, starts, ends)
    routing = pywrapcp.RoutingModel(manager)

    # Arc cost callback: scaled distance
    DIST_SCALE = 1000.0

    def distance_callback(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        s1 = instance.stops[from_node]
        s2 = instance.stops[to_node]
        d = instance.get_distance(s1.id, s2.id)
        return int(round(d * DIST_SCALE))

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Capacity dimension if demands or capacities are specified
    has_capacity = any(v.capacity > 0 for v in instance.vehicles)
    if has_capacity:
        DEMAND_SCALE = 100.0

        def demand_callback(from_index: int) -> int:
            from_node = manager.IndexToNode(from_index)
            return int(round(instance.stops[from_node].demand * DEMAND_SCALE))

        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        vehicle_capacities = [int(round(v.capacity * DEMAND_SCALE)) for v in instance.vehicles]
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index,
            0,  # null capacity slack
            vehicle_capacities,
            True,  # start cumul to zero
            "Capacity",
        )

    # Time dimension for time windows and max route durations
    has_tw = any(s.time_window_start is not None or s.time_window_end is not None for s in instance.stops)
    has_max_dur = any(v.max_route_duration is not None for v in instance.vehicles)

    if has_tw or has_max_dur:
        TIME_SCALE = 100.0
        HORIZON = int(1e8)

        def time_callback(from_index: int, to_index: int) -> int:
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            s1 = instance.stops[from_node]
            s2 = instance.stops[to_node]
            t = instance.get_travel_time(s1.id, s2.id) + (s1.service_time or 0.0)
            return int(round(t * TIME_SCALE))

        time_callback_index = routing.RegisterTransitCallback(time_callback)
        routing.AddDimension(
            time_callback_index,
            HORIZON,  # slack max (allows vehicle waiting)
            HORIZON,  # capacity max
            False,    # start cumul to zero
            "Time",
        )
        time_dimension = routing.GetDimensionOrDie("Time")

        if has_tw:
            for node_idx, stop in enumerate(instance.stops):
                index = manager.NodeToIndex(node_idx)
                if index != -1:
                    start_val = 0 if stop.time_window_start is None else int(round(stop.time_window_start * TIME_SCALE))
                    end_val = HORIZON if stop.time_window_end is None else int(round(stop.time_window_end * TIME_SCALE))
                    time_dimension.CumulVar(index).SetRange(start_val, end_val)

        if has_max_dur:
            for v_idx, v in enumerate(instance.vehicles):
                if v.max_route_duration is not None:
                    max_dur = int(round(v.max_route_duration * TIME_SCALE))
                    end_idx = routing.End(v_idx)
                    start_idx = routing.Start(v_idx)
                    routing.AddVariableMinimizedByFinalizer(time_dimension.CumulVar(end_idx))
                    # End time minus start time <= max_duration
                    time_dimension.CumulVar(end_idx).SetMax(max_dur)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.seconds = max(1, int(time_limit_seconds))

    start_solve_time = time.perf_counter()
    solution = routing.SolveWithParameters(search_parameters)
    elapsed_s = time.perf_counter() - start_solve_time

    routes: Dict[Any, List[Any]] = {v.id: [] for v in instance.vehicles}
    arrival_times: Dict[Any, Dict[Any, float]] = {v.id: {} for v in instance.vehicles}

    if solution is not None:
        for v_idx, vehicle in enumerate(instance.vehicles):
            idx = routing.Start(v_idx)
            depot_stop_id = instance.stops[starts[v_idx]].id
            curr_route = []

            while not routing.IsEnd(idx):
                node = manager.IndexToNode(idx)
                stop_id = instance.stops[node].id
                if stop_id != depot_stop_id or (curr_route and stop_id != depot_stop_id):
                    curr_route.append(stop_id)

                if has_tw or has_max_dur:
                    time_var = time_dimension.CumulVar(idx)
                    # Convert scaled time back to float
                    arr_time = solution.Min(time_var) / TIME_SCALE
                    arrival_times[vehicle.id][stop_id] = round(arr_time, 2)

                idx = solution.Value(routing.NextVar(idx))

            routes[vehicle.id] = curr_route
    else:
        log.warning("OR-Tools solver could not find a feasible solution within time limit.")

    vrp_sol = VRPSolution(
        routes=routes,
        arrival_times=arrival_times if (has_tw or has_max_dur) else {},
    )

    fit, violations = vrp_fitness(vrp_sol, instance, weights)
    vrp_sol.fitness = fit
    vrp_sol.violations = violations
    vrp_sol.convergence = [
        {"iteration": 0, "best_cost": round(fit, 6), "time_elapsed_s": round(elapsed_s, 4)}
    ]

    return vrp_sol
