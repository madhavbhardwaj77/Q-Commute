"""
Fitness / Objective Function

Shared between QPSO and Dijkstra so both algorithms use identical cost
definitions.  This is critical for an honest comparison.

Cost = WT * (travel_time / T_ref)
     + WD * (length / D_ref)
     + WC * (congestion / C_ref)

All three terms are dimensionless and approximately unit-scale, preventing
any single term from dominating simply because of its measurement units.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

import networkx as nx

from backend.config import WEIGHT_TIME, WEIGHT_DISTANCE, WEIGHT_CONGESTION
from backend.optimization.constraints import check_all_constraints

if TYPE_CHECKING:
    from backend.optimization.vrp_models import VRPInstance, VRPSolution


def edge_cost(
    G: nx.MultiDiGraph,
    u: int,
    v: int,
    k: int,
    data: dict,
    traffic_overlay: Dict[Tuple[int, int, int], dict],
    refs: Dict[str, float],
) -> float:
    """
    Return the objective cost of a single edge under current traffic conditions.

    Args:
        G:               The road graph.
        u, v, k:         Edge identifiers.
        data:            Edge attribute dict from G[u][v][k].
        traffic_overlay: Active traffic events.
        refs:            Normalisation refs {T_ref, D_ref, C_ref}.

    Returns:
        float: Non-negative cost; math.inf if the edge is closed.
    """
    overlay = traffic_overlay.get((u, v, k), {})
    if overlay.get("closed", False):
        return math.inf

    base_tt   = data.get("travel_time", 1.0)
    length    = data.get("length", 1.0)
    base_cong = data.get("congestion", 0.0)

    tt_mult  = overlay.get("time_multiplier", 1.0)
    cong_add = overlay.get("congestion_add", 0.0)

    travel_time = base_tt * tt_mult
    congestion  = min(1.0, base_cong + cong_add)

    T_ref = refs.get("T_ref", 60.0)
    D_ref = refs.get("D_ref", 200.0)
    C_ref = refs.get("C_ref", 1.0)

    wt = refs.get("weight_time", WEIGHT_TIME)
    wd = refs.get("weight_dist", WEIGHT_DISTANCE)
    wc = refs.get("weight_cong", WEIGHT_CONGESTION)

    cost = (
        wt * (travel_time / T_ref)
        + wd * (length / D_ref)
        + wc * (congestion / C_ref)
    )
    return float(cost)


def path_fitness(
    G: nx.MultiDiGraph,
    path: List[int],
    traffic_overlay: Dict[Tuple[int, int, int], dict],
    refs: Dict[str, float],
    penalty_multiplier: float = 10.0,
) -> float:
    """
    Compute the total objective cost for a complete path.

    Invalid paths (missing edges, missing nodes) receive a large penalty
    rather than raising an exception, so QPSO can handle mid-evolution
    invalid candidates gracefully.

    Args:
        G:                  Road graph.
        path:               Ordered list of node IDs.
        traffic_overlay:    Active traffic events.
        refs:               Normalisation refs.
        penalty_multiplier: Multiplier applied to the worst-edge cost
                            for each invalid/missing edge in a repaired path.

    Returns:
        float: Total cost (lower is better).  math.inf for completely invalid paths.
    """
    if not path or len(path) < 2:
        return math.inf

    total = 0.0
    for i in range(len(path) - 1):
        u, v = path[i], path[i + 1]
        if not G.has_node(u) or not G.has_node(v):
            return math.inf
        if not G.has_edge(u, v):
            # Penalise rather than reject: large constant cost per missing edge
            total += penalty_multiplier
            continue

        edges = G[u][v]
        k_best = min(
            edges.keys(),
            key=lambda k: edge_cost(G, u, v, k, edges[k], traffic_overlay, refs),
        )
        c = edge_cost(G, u, v, k_best, edges[k_best], traffic_overlay, refs)
        if math.isinf(c):
            return math.inf
        total += c

    return total


def make_cost_fn(
    traffic_overlay: Dict[Tuple[int, int, int], dict],
    refs: Dict[str, float],
):
    """
    Return a weight function compatible with networkx.shortest_path(weight=…).

    Usage:
        weight_fn = make_cost_fn(state.traffic_overlay, state._ref)
        path = nx.shortest_path(G, src, dst, weight=weight_fn)
    """
    def cost_fn(u: int, v: int, data: dict) -> float:
        # networkx passes edge data dict for single edge; for MultiDiGraph
        # it passes the dict for the minimum-weight parallel edge.
        # We pick the parallel edge with lowest cost.
        if isinstance(data, dict) and any(isinstance(k, int) for k in data):
            # MultiDiGraph: data is {k: edge_attr_dict, ...}
            costs = [
                edge_cost(None, u, v, k, edata, traffic_overlay, refs)
                for k, edata in data.items()
            ]
            return min(costs)
        # DiGraph (shouldn't happen with OSMnx but handle gracefully)
        return edge_cost(None, u, v, 0, data, traffic_overlay, refs)

    return cost_fn


def vrp_fitness(
    solution: Any,
    instance: Any,
    weights: Optional[Dict[str, float]] = None,
) -> Tuple[float, List[str]]:
    """
    Compute fitness for a VRP solution using a weighted sum of travel time,
    distance, and congestion, heavily penalising any constraint violations.

    Cost = WT * (total_time / T_ref)
         + WD * (total_distance / D_ref)
         + WC * (total_congestion / C_ref)
         + sum(penalties for constraint violations)

    Args:
        solution: VRPSolution instance or mapping.
        instance: VRPInstance problem definition.
        weights: Dictionary of weights with keys "time", "distance", "congestion",
                 and optional normalisation refs "T_ref", "D_ref", "C_ref",
                 and "penalty_multiplier".

    Returns:
        Tuple of (fitness_score, violations_list). Lower fitness is better.
    """
    if weights is None:
        weights = {}

    wt = float(weights.get("time", WEIGHT_TIME))
    wd = float(weights.get("distance", WEIGHT_DISTANCE))
    wc = float(weights.get("congestion", WEIGHT_CONGESTION))

    t_ref = float(weights.get("T_ref", 1.0))
    d_ref = float(weights.get("D_ref", 1.0))
    c_ref = float(weights.get("C_ref", 1.0))

    total_time = float(getattr(solution, "total_time", 0.0))
    total_distance = float(getattr(solution, "total_distance", 0.0))
    total_congestion = float(getattr(solution, "total_congestion", 0.0))

    routes = getattr(solution, "routes", None)
    if routes is None and isinstance(solution, dict):
        routes = solution

    if total_time == 0.0 and total_distance == 0.0 and routes:
        calc_dist = 0.0
        calc_time = 0.0
        for vehicle_id, stop_ids in routes.items():
            vehicle = instance.get_vehicle(vehicle_id) if hasattr(instance, "get_vehicle") else None
            speed = getattr(vehicle, "speed", None)
            depot_id = (vehicle.start_depot_id if vehicle else None) or getattr(instance, "depot_id", None)
            prev = depot_id
            for stop_id in stop_ids:
                if prev is not None and prev != stop_id:
                    calc_dist += instance.get_distance(prev, stop_id)
                    calc_time += instance.get_travel_time(prev, stop_id, speed=speed)
                prev = stop_id
            if stop_ids and depot_id is not None and prev != depot_id:
                calc_dist += instance.get_distance(prev, depot_id)
                calc_time += instance.get_travel_time(prev, depot_id, speed=speed)
        total_distance = calc_dist
        total_time = calc_time
        if hasattr(solution, "total_distance"):
            solution.total_distance = total_distance
        if hasattr(solution, "total_time"):
            solution.total_time = total_time

    base_cost = (
        wt * (total_time / t_ref)
        + wd * (total_distance / d_ref)
        + wc * (total_congestion / c_ref)
    )

    violations = check_all_constraints(solution, instance, weights)
    if hasattr(solution, "violations"):
        solution.violations = list(violations)

    penalty_multiplier = float(weights.get("penalty_multiplier", 1000.0))
    unit_penalty = max(penalty_multiplier, 10.0 * float(base_cost))
    penalty = len(violations) * unit_penalty

    fitness_score = float(base_cost + penalty)
    return fitness_score, violations
