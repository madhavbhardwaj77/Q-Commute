"""
VRP Constraint Checking

Pure, independently testable constraint functions for Vehicle Routing Problems.
Functions return lists of human-readable violation strings (empty if valid).
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Sequence, Union

from backend.optimization.vrp_models import VRPInstance, VRPSolution


def _get_routes(solution: Union[VRPSolution, Mapping[Any, Sequence[Any]]]) -> Mapping[Any, Sequence[Any]]:
    """Helper to extract routes mapping from VRPSolution or dict."""
    if hasattr(solution, "routes") and isinstance(solution.routes, dict):
        return solution.routes
    if isinstance(solution, Mapping):
        return solution
    return {}


def check_capacity(
    solution: Union[VRPSolution, Mapping[Any, Sequence[Any]]],
    instance: VRPInstance,
) -> List[str]:
    """
    Verify vehicle capacity constraints.

    Args:
        solution: Proposed VRP solution or routes mapping.
        instance: VRP problem instance containing vehicles and stops.

    Returns:
        List of human-readable violation descriptions. Empty if no violations.
    """
    violations: List[str] = []
    routes = _get_routes(solution)

    for vehicle_id, stop_ids in routes.items():
        vehicle = instance.get_vehicle(vehicle_id)
        if vehicle is None:
            continue

        route_demand = 0.0
        for stop_id in stop_ids:
            stop = instance.get_stop(stop_id)
            if stop is not None:
                route_demand += stop.demand

        if route_demand > vehicle.capacity:
            violations.append(
                f"Vehicle '{vehicle_id}' exceeded capacity: load {route_demand:.2f} > capacity {vehicle.capacity:.2f}"
            )

    return violations


def check_time_windows(
    solution: Union[VRPSolution, Mapping[Any, Sequence[Any]]],
    instance: VRPInstance,
) -> List[str]:
    """
    Verify stop time-window constraints along each vehicle route.

    Args:
        solution: Proposed VRP solution or routes mapping.
        instance: VRP problem instance.

    Returns:
        List of human-readable violation descriptions. Empty if no violations.
    """
    violations: List[str] = []
    routes = _get_routes(solution)
    precomputed_arrivals = getattr(solution, "arrival_times", {}) or {}

    for vehicle_id, stop_ids in routes.items():
        vehicle = instance.get_vehicle(vehicle_id)
        speed = getattr(vehicle, "speed", None)

        if vehicle_id in precomputed_arrivals:
            # Check precomputed arrivals directly
            arrivals = precomputed_arrivals[vehicle_id]
            for stop_id, arrival_time in arrivals.items():
                stop = instance.get_stop(stop_id)
                if stop is None:
                    continue
                if stop.time_window_start is not None and arrival_time < stop.time_window_start:
                    violations.append(
                        f"Vehicle '{vehicle_id}' arrived early at stop '{stop_id}': "
                        f"arrival {arrival_time:.2f} < window start {stop.time_window_start:.2f}"
                    )
                if stop.time_window_end is not None and arrival_time > stop.time_window_end:
                    violations.append(
                        f"Vehicle '{vehicle_id}' arrived late at stop '{stop_id}': "
                        f"arrival {arrival_time:.2f} > window end {stop.time_window_end:.2f}"
                    )
            continue

        # Simulate timeline along route
        current_time = 0.0
        prev_stop = (vehicle.start_depot_id if vehicle else None) or instance.depot_id

        for stop_id in stop_ids:
            if prev_stop is not None and prev_stop != stop_id:
                current_time += instance.get_travel_time(prev_stop, stop_id, speed=speed)

            stop = instance.get_stop(stop_id)
            if stop is not None:
                if stop.time_window_start is not None and current_time < stop.time_window_start:
                    violations.append(
                        f"Vehicle '{vehicle_id}' arrived early at stop '{stop_id}': "
                        f"arrival {current_time:.2f} < window start {stop.time_window_start:.2f}"
                    )
                    current_time = max(current_time, stop.time_window_start)

                if stop.time_window_end is not None and current_time > stop.time_window_end:
                    violations.append(
                        f"Vehicle '{vehicle_id}' arrived late at stop '{stop_id}': "
                        f"arrival {current_time:.2f} > window end {stop.time_window_end:.2f}"
                    )

                current_time += getattr(stop, "service_time", 0.0)

            prev_stop = stop_id

    return violations


def check_max_duration(
    solution: Union[VRPSolution, Mapping[Any, Sequence[Any]]],
    instance: VRPInstance,
) -> List[str]:
    """
    Verify maximum route duration constraints for each vehicle.

    Args:
        solution: Proposed VRP solution or routes mapping.
        instance: VRP problem instance.

    Returns:
        List of human-readable violation descriptions. Empty if no violations.
    """
    violations: List[str] = []
    routes = _get_routes(solution)
    route_durations = getattr(solution, "route_durations", {}) or {}

    for vehicle_id, stop_ids in routes.items():
        vehicle = instance.get_vehicle(vehicle_id)
        if vehicle is None or vehicle.max_route_duration is None:
            continue

        if vehicle_id in route_durations:
            duration = float(route_durations[vehicle_id])
        else:
            # Simulate total route duration including return to depot
            speed = getattr(vehicle, "speed", None)
            depot_id = vehicle.start_depot_id or instance.depot_id
            current_time = 0.0
            prev_stop = depot_id

            for stop_id in stop_ids:
                if prev_stop is not None and prev_stop != stop_id:
                    current_time += instance.get_travel_time(prev_stop, stop_id, speed=speed)

                stop = instance.get_stop(stop_id)
                if stop is not None:
                    if stop.time_window_start is not None and current_time < stop.time_window_start:
                        current_time = max(current_time, stop.time_window_start)
                    current_time += getattr(stop, "service_time", 0.0)

                prev_stop = stop_id

            # Add return trip to depot if not already at depot
            if stop_ids and prev_stop != depot_id:
                current_time += instance.get_travel_time(prev_stop, depot_id, speed=speed)

            duration = current_time

        if duration > vehicle.max_route_duration:
            violations.append(
                f"Vehicle '{vehicle_id}' exceeded max route duration: "
                f"duration {duration:.2f} > max {vehicle.max_route_duration:.2f}"
            )

    return violations


def check_emergency_congestion(
    solution: Union[VRPSolution, Mapping[Any, Sequence[Any]]],
    instance: VRPInstance,
    max_threshold: float = 0.5,
) -> List[str]:
    """
    Verify emergency profile congestion threshold constraint.

    Args:
        solution: Proposed VRP solution.
        instance: VRP problem instance.
        max_threshold: Upper limit on allowable congestion.

    Returns:
        List of violation descriptions. Empty if within threshold.
    """
    violations: List[str] = []
    total_congestion = getattr(solution, "total_congestion", 0.0)
    if total_congestion > max_threshold:
        violations.append(
            f"Emergency route violated congestion constraint: "
            f"congestion {total_congestion:.2f} > threshold {max_threshold:.2f}"
        )
    return violations


def check_all_constraints(
    solution: Union[VRPSolution, Mapping[Any, Sequence[Any]]],
    instance: VRPInstance,
    weights: Optional[Dict[str, Any]] = None,
) -> List[str]:
    """
    Run all constraint checks and aggregate violations.

    Args:
        solution: Proposed VRP solution.
        instance: VRP problem instance.
        weights: Optional dictionary containing profile and threshold parameters.

    Returns:
        Combined list of all constraint violation descriptions.
    """
    all_violations: List[str] = []
    all_violations.extend(check_capacity(solution, instance))
    all_violations.extend(check_time_windows(solution, instance))
    all_violations.extend(check_max_duration(solution, instance))

    if weights and weights.get("profile") == "emergency":
        thresh = float(weights.get("emergency_max_congestion", 0.5))
        all_violations.extend(check_emergency_congestion(solution, instance, max_threshold=thresh))

    return all_violations

