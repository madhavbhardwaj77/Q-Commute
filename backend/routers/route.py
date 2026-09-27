"""
Route Router — POST /route/optimize and POST /route/reroute
Upgraded for SIH 2026: accepts n_particles, n_iter, weight sliders.
"""
from __future__ import annotations

import logging
import math
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from backend.graph.state import graph_state
from backend.graph.snapper import path_coords
from backend.optimization.dijkstra import run_dijkstra
from backend.optimization.qpso import QPSORouter
from backend.config import LOCATIONS, LOCATION_MAP

log = logging.getLogger(__name__)
router = APIRouter(prefix="/route", tags=["route"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class RouteLeg(BaseModel):
    leg_index:       int
    from_id:         str
    to_id:           str
    from_name:       str
    to_name:         str
    distance_m:      float
    travel_time_s:   float
    congestion_cost: float
    total_cost:      float
    path_length:     int
    coordinates:     List[List[float]] = []


class OptimizeRequest(BaseModel):
    source_id:        str
    destination_id:   Optional[str] = None
    destination_ids:  Optional[List[str]] = None
    optimize_order:   bool = True
    round_trip:       bool = False
    algorithm:        str = "AI Orchestrator"
    # QPSO tuning
    n_particles:      int   = 20
    n_iter:           int   = 40
    # Cost weights (must sum to ~1.0)
    weight_time:      float = 0.5
    weight_dist:      float = 0.3
    weight_cong:      float = 0.2
    profile:          Optional[Literal["delivery", "emergency", "vip", "custom"]] = "custom"
    custom_weights:   Optional[Dict[str, float]] = None

    @field_validator("source_id")
    @classmethod
    def must_be_known_source(cls, v: str) -> str:
        if v not in LOCATION_MAP:
            ids = list(LOCATION_MAP.keys())
            raise ValueError(f"Unknown location id '{v}'. Valid ids: {ids}")
        return v

    @field_validator("destination_id")
    @classmethod
    def must_be_known_destination(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in LOCATION_MAP:
            ids = list(LOCATION_MAP.keys())
            raise ValueError(f"Unknown location id '{v}'. Valid ids: {ids}")
        return v

    @field_validator("destination_ids")
    @classmethod
    def must_be_known_destinations(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            if not v:
                raise ValueError("destination_ids cannot be empty if specified.")
            for d in v:
                if d not in LOCATION_MAP:
                    ids = list(LOCATION_MAP.keys())
                    raise ValueError(f"Unknown location id '{d}'. Valid ids: {ids}")
        return v


class RouteResult(BaseModel):
    algorithm:        str
    source_id:        str
    destination_id:   str
    destination_ids:  Optional[List[str]] = None
    ordered_stops:    Optional[List[str]] = None
    legs:             Optional[List[RouteLeg]] = None
    is_multi_dest:    bool = False
    source_node:      int
    destination_node: int
    path:             Optional[List[int]] = None
    coordinates:      List[List[float]]
    distance_m:       float
    travel_time_s:    float
    congestion_cost:  float
    total_cost:       float
    runtime_ms:       float
    iterations:       Optional[int] = None
    population:       Optional[int] = None
    convergence:      Optional[List[dict]] = None
    quantum_params:   Optional[Dict] = None
    valid:            bool
    error:            Optional[str] = None
    solver_used:      Optional[str] = None
    solver_reason:    Optional[str] = None


class RerouteRequest(BaseModel):
    source_id:        str
    destination_id:   Optional[str] = None
    destination_ids:  Optional[List[str]] = None
    optimize_order:   bool = True
    round_trip:       bool = False
    algorithm:        str = "AI Orchestrator"
    n_particles:      int   = 20
    n_iter:           int   = 40
    weight_time:      float = 0.5
    weight_dist:      float = 0.3
    weight_cong:      float = 0.2

    @field_validator("source_id")
    @classmethod
    def must_be_known_source(cls, v: str) -> str:
        if v not in LOCATION_MAP:
            raise ValueError(f"Unknown location id '{v}'")
        return v

    @field_validator("destination_id")
    @classmethod
    def must_be_known_destination(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in LOCATION_MAP:
            raise ValueError(f"Unknown location id '{v}'")
        return v

    @field_validator("destination_ids")
    @classmethod
    def must_be_known_destinations(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            if not v:
                raise ValueError("destination_ids cannot be empty if specified.")
            for d in v:
                if d not in LOCATION_MAP:
                    raise ValueError(f"Unknown location id '{d}'")
        return v


class MetricDiff(BaseModel):
    distance_m_diff:    float
    travel_time_s_diff: float
    total_cost_diff:    float
    route_changed:      bool
    feasible_alternate: bool


class RerouteResult(BaseModel):
    previous_route: RouteResult
    new_route:      RouteResult
    diff:           MetricDiff


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_algorithm(
    source_id: str,
    dest_id: str,
    algorithm: str,
    n_particles: int = 20,
    n_iter: int = 40,
    refs_override: Optional[dict] = None,
) -> dict:
    """Dispatch to the selected algorithm and return raw result dict."""
    state = graph_state
    src   = state.get_node(source_id)
    dst   = state.get_node(dest_id)
    G     = state.G
    ovl   = state.traffic_overlay
    refs  = refs_override or state._ref

    if algorithm == "Dijkstra":
        return run_dijkstra(G, src, dst, ovl, refs)
    elif algorithm == "Genetic Algorithm":
        try:
            from backend.optimization.genetic import GeneticRouter
            ga = GeneticRouter(G, src, dst, ovl, refs, n_particles=n_particles, n_iter=n_iter)
            return ga.run()
        except ImportError:
            return run_dijkstra(G, src, dst, ovl, refs)
    else:
        qpso = QPSORouter(G, src, dst, ovl, refs, n_particles=n_particles, n_iter=n_iter)
        return qpso.run()


def _optimize_destination_order(
    source_id: str,
    dest_ids: List[str],
    round_trip: bool,
    G,
    ovl,
    refs,
) -> List[str]:
    """
    Find optimal visiting order for multiple destinations starting from source_id.
    Uses cost evaluated via Dijkstra shortest paths.
    """
    import itertools

    if len(dest_ids) <= 1:
        seq = [source_id] + list(dest_ids)
        if round_trip:
            seq.append(source_id)
        return seq

    all_stops = [source_id] + list(dest_ids)
    stop_nodes = {sid: graph_state.get_node(sid) for sid in all_stops}
    cost_matrix = {}

    for u_id in all_stops:
        for v_id in all_stops:
            if u_id == v_id:
                cost_matrix[(u_id, v_id)] = 0.0
            else:
                d = run_dijkstra(G, stop_nodes[u_id], stop_nodes[v_id], ovl, refs)
                cost_matrix[(u_id, v_id)] = d.get("total_cost", d.get("distance_m", 1e6))

    # If small number of stops, check all permutations
    if len(dest_ids) <= 7:
        best_perm = None
        best_cost = float("inf")
        for perm in itertools.permutations(dest_ids):
            c = cost_matrix.get((source_id, perm[0]), 1e6)
            for i in range(len(perm) - 1):
                c += cost_matrix.get((perm[i], perm[i + 1]), 1e6)
            if round_trip:
                c += cost_matrix.get((perm[-1], source_id), 1e6)
            if c < best_cost:
                best_cost = c
                best_perm = perm
        res = [source_id] + list(best_perm)
        if round_trip:
            res.append(source_id)
        return res

    # Otherwise Nearest Neighbor greedy + 2-opt
    curr = source_id
    unvisited = list(dest_ids)
    tour = []
    while unvisited:
        nxt = min(unvisited, key=lambda x: cost_matrix.get((curr, x), 1e6))
        tour.append(nxt)
        unvisited.remove(nxt)
        curr = nxt

    improved = True
    best_tour = list(tour)
    while improved:
        improved = False
        for i in range(len(best_tour) - 1):
            for j in range(i + 1, len(best_tour)):
                cand = best_tour[:i] + best_tour[i : j + 1][::-1] + best_tour[j + 1 :]
                c_cand = cost_matrix.get((source_id, cand[0]), 1e6)
                for k in range(len(cand) - 1):
                    c_cand += cost_matrix.get((cand[k], cand[k + 1]), 1e6)
                if round_trip:
                    c_cand += cost_matrix.get((cand[-1], source_id), 1e6)

                c_curr = cost_matrix.get((source_id, best_tour[0]), 1e6)
                for k in range(len(best_tour) - 1):
                    c_curr += cost_matrix.get((best_tour[k], best_tour[k + 1]), 1e6)
                if round_trip:
                    c_curr += cost_matrix.get((best_tour[-1], source_id), 1e6)

                if c_cand < c_curr - 1e-4:
                    best_tour = cand
                    improved = True
                    break
            if improved:
                break

    res = [source_id] + best_tour
    if round_trip:
        res.append(source_id)
    return res


def _run_multi_legs(
    ordered_sequence: List[str],
    algorithm: str,
    n_particles: int,
    n_iter: int,
    refs_override: Optional[dict] = None,
) -> dict:
    """Run algorithm on each consecutive pair in ordered_sequence and merge results."""
    legs = []
    combined_path = []
    combined_coords = []
    total_dist = 0.0
    total_time = 0.0
    total_cong = 0.0
    total_cost = 0.0
    total_runtime = 0.0
    all_valid = True
    combined_conv = []

    for idx in range(len(ordered_sequence) - 1):
        u_id = ordered_sequence[idx]
        v_id = ordered_sequence[idx + 1]
        raw_leg = _run_algorithm(
            u_id, v_id, algorithm, n_particles, n_iter, refs_override
        )
        if not raw_leg.get("valid", False):
            all_valid = False

        leg_path = raw_leg.get("path") or []
        leg_coords = raw_leg.get("coordinates") or []
        leg_dist = float(raw_leg.get("distance_m", 0.0))
        leg_time = float(raw_leg.get("travel_time_s", 0.0))
        leg_cong = float(raw_leg.get("congestion_cost", 0.0))
        leg_cost = float(raw_leg.get("total_cost", 0.0))
        leg_rt = float(raw_leg.get("runtime_ms", 0.0))

        total_dist += leg_dist
        total_time += leg_time
        total_cong += leg_cong
        total_cost += leg_cost
        total_runtime += leg_rt

        if raw_leg.get("convergence"):
            combined_conv = raw_leg.get("convergence")

        if not combined_path:
            combined_path.extend(leg_path)
        else:
            combined_path.extend(leg_path[1:] if len(leg_path) > 1 else leg_path)

        if not combined_coords:
            combined_coords.extend(leg_coords)
        else:
            combined_coords.extend(leg_coords[1:] if len(leg_coords) > 1 else leg_coords)

        u_loc = LOCATION_MAP.get(u_id)
        v_loc = LOCATION_MAP.get(v_id)

        legs.append({
            "leg_index": idx + 1,
            "from_id": u_id,
            "to_id": v_id,
            "from_name": u_loc.name if u_loc else u_id,
            "to_name": v_loc.name if v_loc else v_id,
            "distance_m": round(leg_dist, 2),
            "travel_time_s": round(leg_time, 2),
            "congestion_cost": round(leg_cong, 4),
            "total_cost": round(leg_cost, 4),
            "path_length": len(leg_path),
            "coordinates": leg_coords,
        })

    return {
        "algorithm": algorithm,
        "valid": all_valid,
        "path": combined_path,
        "coordinates": combined_coords,
        "distance_m": round(total_dist, 2),
        "travel_time_s": round(total_time, 2),
        "congestion_cost": round(total_cong, 4),
        "total_cost": round(total_cost, 4),
        "runtime_ms": round(total_runtime, 2),
        "convergence": combined_conv,
        "legs": legs,
        "ordered_stops": ordered_sequence,
    }


def _result_to_model(
    raw: dict,
    source_id: str,
    dest_id: str,
    source_node: int,
    dest_node: int,
    quantum_params: Optional[dict] = None,
    destination_ids: Optional[List[str]] = None,
    ordered_stops: Optional[List[str]] = None,
    legs: Optional[List[dict]] = None,
    is_multi_dest: bool = False,
    solver_used: Optional[str] = None,
    solver_reason: Optional[str] = None,
) -> RouteResult:
    route_legs = None
    if legs:
        route_legs = [RouteLeg(**lg) if isinstance(lg, dict) else lg for lg in legs]

    return RouteResult(
        algorithm        = raw["algorithm"],
        source_id        = source_id,
        destination_id   = dest_id,
        destination_ids  = destination_ids or [dest_id],
        ordered_stops    = ordered_stops or [source_id, dest_id],
        legs             = route_legs,
        is_multi_dest    = is_multi_dest,
        source_node      = source_node,
        destination_node = dest_node,
        path             = raw.get("path"),
        coordinates      = raw.get("coordinates", []),
        distance_m       = raw.get("distance_m", 0.0),
        travel_time_s    = raw.get("travel_time_s", 0.0),
        congestion_cost  = raw.get("congestion_cost", 0.0),
        total_cost       = raw.get("total_cost", 0.0),
        runtime_ms       = raw.get("runtime_ms", 0.0),
        iterations       = raw.get("iterations"),
        population       = raw.get("population"),
        convergence      = raw.get("convergence"),
        quantum_params   = quantum_params,
        valid            = raw.get("valid", False),
        error            = raw.get("error"),
        solver_used      = solver_used,
        solver_reason    = solver_reason,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/optimize", response_model=RouteResult)
async def optimize_route(req: OptimizeRequest) -> RouteResult:
    """Run QPSO, Dijkstra or GA on single or multiple destinations with active traffic overlay."""
    if not graph_state._initialized:
        raise HTTPException(503, "Graph not yet initialized. Please wait.")

    # Determine destination list
    if req.destination_ids and len(req.destination_ids) > 0:
        dest_list = [d for d in req.destination_ids if d != req.source_id]
        # Preserve order while removing duplicates
        seen = set()
        dest_list = [d for d in dest_list if not (d in seen or seen.add(d))]
    elif req.destination_id:
        if req.source_id == req.destination_id:
            raise HTTPException(400, "Source and destination must be different locations.")
        dest_list = [req.destination_id]
    else:
        raise HTTPException(400, "Must provide either destination_id or destination_ids.")

    if not dest_list:
        raise HTTPException(400, "Source and destination must be different locations.")

    try:
        src = graph_state.get_node(req.source_id)
        custom_refs = dict(graph_state._ref)

        from backend.optimization.profiles import resolve_profile_weights
        resolved = resolve_profile_weights(
            profile=req.profile,
            custom_weights=req.custom_weights or {
                "weight_time": req.weight_time,
                "weight_dist": req.weight_dist,
                "weight_cong": req.weight_cong,
            },
        )
        custom_refs["weight_time"] = resolved["time"]
        custom_refs["weight_dist"] = resolved["distance"]
        custom_refs["weight_cong"] = resolved["congestion"]
        custom_refs["profile"] = resolved.get("profile", "custom")

        solver_used = None
        solver_reason = None
        actual_algo = req.algorithm

        if req.algorithm.lower() in ("ai orchestrator", "orchestrator", "ai_orchestrator"):
            ovl = graph_state.traffic_overlay
            active_events = [e for e in ovl.values() if e.get("type") in ("closed", "congested") or e.get("factor", 1.0) > 1.2]
            has_traffic_incident = len(active_events) > 0

            if len(dest_list) == 1 and not req.round_trip:
                if not has_traffic_incident and custom_refs.get("weight_cong", 0.2) <= 0.35:
                    actual_algo = "Dijkstra"
                    solver_used = "Dijkstra"
                    solver_reason = "Point-to-point corridor with free-flow traffic. Deterministic Dijkstra shortest path guarantees mathematical optimum in polynomial time."
                else:
                    actual_algo = "QPSO"
                    solver_used = "QPSO"
                    solver_reason = f"Active traffic overlay ({len(active_events)} congestion incidents) detected. Quantum-behaved particle swarm explores non-convex congestion landscapes."
            else:
                actual_algo = "QPSO"
                solver_used = "QPSO"
                solver_reason = f"Multi-destination routing tour ({len(dest_list)} destinations). AI Orchestrator deployed QPSO for non-linear traveling salesperson tour and swarm convergence."

        qparams = None
        if actual_algo == "QPSO":
            qparams = {
                "algorithm_class": "Quantum PSO",
                "n_particles": req.n_particles,
                "n_iter": req.n_iter,
                "weight_time": req.weight_time,
                "weight_dist": req.weight_dist,
                "weight_cong": req.weight_cong,
            }

        # Check if single destination or multiple
        if len(dest_list) == 1 and not req.round_trip:
            dst_id = dest_list[0]
            dst = graph_state.get_node(dst_id)
            raw = _run_algorithm(
                req.source_id, dst_id,
                actual_algo, req.n_particles, req.n_iter,
                refs_override=custom_refs,
            )
            result_model = _result_to_model(
                raw, req.source_id, dst_id, src, dst, qparams,
                destination_ids=[dst_id],
                ordered_stops=[req.source_id, dst_id],
                is_multi_dest=False,
                solver_used=solver_used,
                solver_reason=solver_reason,
            )
        else:
            # Multi-destination route optimization
            G = graph_state.G
            ovl = graph_state.traffic_overlay
            if req.optimize_order:
                ordered_sequence = _optimize_destination_order(
                    req.source_id, dest_list, req.round_trip, G, ovl, custom_refs
                )
            else:
                ordered_sequence = [req.source_id] + dest_list
                if req.round_trip:
                    ordered_sequence.append(req.source_id)

            raw = _run_multi_legs(
                ordered_sequence,
                actual_algo,
                req.n_particles,
                req.n_iter,
                refs_override=custom_refs,
            )
            final_dst_id = ordered_sequence[-1]
            final_dst_node = graph_state.get_node(final_dst_id)

            result_model = _result_to_model(
                raw,
                req.source_id,
                final_dst_id,
                src,
                final_dst_node,
                qparams,
                destination_ids=dest_list,
                ordered_stops=ordered_sequence,
                legs=raw.get("legs"),
                is_multi_dest=True,
                solver_used=solver_used,
                solver_reason=solver_reason,
            )

        if solver_used:
            result_model.algorithm = f"AI Orchestrator ({solver_used})"

        if result_model.valid:
            try:
                from backend.db.database import save_route
                save_route(
                    req.source_id, result_model.destination_id, req.algorithm,
                    result_model.distance_m, result_model.travel_time_s,
                    result_model.total_cost, result_model.runtime_ms,
                    result_model.path
                )
            except Exception as e:
                log.warning("Could not persist route: %s", e)

        return result_model
    except KeyError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        log.exception("Error in /route/optimize")
        raise HTTPException(500, f"Routing failed: {e}")


@router.post("/reroute", response_model=RerouteResult)
async def reroute(req: RerouteRequest) -> RerouteResult:
    """Re-run the selected algorithm with the current traffic overlay (supports single or multi-dest)."""
    if not graph_state._initialized:
        raise HTTPException(503, "Graph not yet initialized.")

    if req.destination_ids and len(req.destination_ids) > 0:
        dest_list = [d for d in req.destination_ids if d != req.source_id]
        seen = set()
        dest_list = [d for d in dest_list if not (d in seen or seen.add(d))]
    elif req.destination_id:
        if req.source_id == req.destination_id:
            raise HTTPException(400, "Source and destination must be different locations.")
        dest_list = [req.destination_id]
    else:
        raise HTTPException(400, "Must provide either destination_id or destination_ids.")

    if not dest_list:
        raise HTTPException(400, "Source and destination must be different locations.")

    try:
        src = graph_state.get_node(req.source_id)

        custom_refs = dict(graph_state._ref)
        custom_refs["weight_time"] = req.weight_time
        custom_refs["weight_dist"] = req.weight_dist
        custom_refs["weight_cong"] = req.weight_cong

        saved_overlay = dict(graph_state.traffic_overlay)

        is_multi = len(dest_list) > 1 or req.round_trip

        reroute_algo = req.algorithm
        solver_used = None
        solver_reason = None
        if req.algorithm.lower() in ("ai orchestrator", "orchestrator", "ai_orchestrator"):
            reroute_algo = "QPSO"
            solver_used = "QPSO"
            solver_reason = "Dynamic traffic incident detected. AI Orchestrator deployed QPSO with adaptive swarm velocity for real-time evasive rerouting."

        if not is_multi:
            dst_id = dest_list[0]
            dst = graph_state.get_node(dst_id)

            graph_state.traffic_overlay.clear()
            baseline_raw = _run_algorithm(req.source_id, dst_id, reroute_algo,
                                          req.n_particles, req.n_iter, refs_override=custom_refs)
            graph_state.traffic_overlay.update(saved_overlay)

            new_raw = _run_algorithm(req.source_id, dst_id, reroute_algo,
                                     req.n_particles, req.n_iter, refs_override=custom_refs)

            prev_model = _result_to_model(baseline_raw, req.source_id, dst_id, src, dst, is_multi_dest=False)
            new_model  = _result_to_model(
                new_raw, req.source_id, dst_id, src, dst,
                is_multi_dest=False,
                solver_used=solver_used,
                solver_reason=solver_reason,
            )
        else:
            G = graph_state.G
            # Compute ordering based on baseline free-flow or overlay
            graph_state.traffic_overlay.clear()
            if req.optimize_order:
                ordered_sequence = _optimize_destination_order(
                    req.source_id, dest_list, req.round_trip, G, {}, custom_refs
                )
            else:
                ordered_sequence = [req.source_id] + dest_list
                if req.round_trip:
                    ordered_sequence.append(req.source_id)

            baseline_raw = _run_multi_legs(
                ordered_sequence, reroute_algo, req.n_particles, req.n_iter, refs_override=custom_refs
            )

            graph_state.traffic_overlay.update(saved_overlay)
            new_raw = _run_multi_legs(
                ordered_sequence, reroute_algo, req.n_particles, req.n_iter, refs_override=custom_refs
            )

            final_dst_id = ordered_sequence[-1]
            final_dst_node = graph_state.get_node(final_dst_id)

            prev_model = _result_to_model(
                baseline_raw, req.source_id, final_dst_id, src, final_dst_node,
                destination_ids=dest_list, ordered_stops=ordered_sequence,
                legs=baseline_raw.get("legs"), is_multi_dest=True
            )
            new_model = _result_to_model(
                new_raw, req.source_id, final_dst_id, src, final_dst_node,
                destination_ids=dest_list, ordered_stops=ordered_sequence,
                legs=new_raw.get("legs"), is_multi_dest=True,
                solver_used=solver_used,
                solver_reason=solver_reason,
            )

        if solver_used:
            new_model.algorithm = f"AI Orchestrator ({solver_used})"

        route_changed = (
            new_model.valid and prev_model.valid and
            new_model.coordinates != prev_model.coordinates
        )

        if not new_model.valid:
            diff = MetricDiff(
                distance_m_diff    = 0.0,
                travel_time_s_diff = 0.0,
                total_cost_diff    = 0.0,
                route_changed      = False,
                feasible_alternate = False,
            )
        else:
            diff = MetricDiff(
                distance_m_diff    = round(new_model.distance_m    - prev_model.distance_m,    2),
                travel_time_s_diff = round(new_model.travel_time_s - prev_model.travel_time_s, 2),
                total_cost_diff    = round(new_model.total_cost    - prev_model.total_cost,     6),
                route_changed      = route_changed,
                feasible_alternate = True,
            )

        return RerouteResult(
            previous_route = prev_model,
            new_route      = new_model,
            diff           = diff,
        )

    except KeyError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        log.exception("Error in /route/reroute")
        raise HTTPException(500, f"Rerouting failed: {e}")
