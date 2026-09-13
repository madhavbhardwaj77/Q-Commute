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

class OptimizeRequest(BaseModel):
    source_id:      str
    destination_id: str
    algorithm:      Literal["QPSO", "Dijkstra", "Genetic Algorithm"] = "QPSO"
    # QPSO tuning
    n_particles:    int   = 20
    n_iter:         int   = 40
    # Cost weights (must sum to ~1.0)
    weight_time:    float = 0.5
    weight_dist:    float = 0.3
    weight_cong:    float = 0.2

    @field_validator("source_id", "destination_id")
    @classmethod
    def must_be_known(cls, v: str) -> str:
        if v not in LOCATION_MAP:
            ids = list(LOCATION_MAP.keys())
            raise ValueError(f"Unknown location id '{v}'. Valid ids: {ids}")
        return v


class RouteResult(BaseModel):
    algorithm:        str
    source_id:        str
    destination_id:   str
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


class RerouteRequest(BaseModel):
    source_id:      str
    destination_id: str
    algorithm:      Literal["QPSO", "Dijkstra", "Genetic Algorithm"] = "QPSO"
    n_particles:    int   = 20
    n_iter:         int   = 40
    weight_time:    float = 0.5
    weight_dist:    float = 0.3
    weight_cong:    float = 0.2

    @field_validator("source_id", "destination_id")
    @classmethod
    def must_be_known(cls, v: str) -> str:
        if v not in LOCATION_MAP:
            raise ValueError(f"Unknown location id '{v}'")
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


def _result_to_model(
    raw: dict,
    source_id: str,
    dest_id: str,
    source_node: int,
    dest_node: int,
    quantum_params: Optional[dict] = None,
) -> RouteResult:
    return RouteResult(
        algorithm        = raw["algorithm"],
        source_id        = source_id,
        destination_id   = dest_id,
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
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/optimize", response_model=RouteResult)
async def optimize_route(req: OptimizeRequest) -> RouteResult:
    """Run QPSO, Dijkstra or GA on the current graph with active traffic overlay."""
    if not graph_state._initialized:
        raise HTTPException(503, "Graph not yet initialized. Please wait.")

    if req.source_id == req.destination_id:
        raise HTTPException(400, "Source and destination must be different locations.")

    try:
        src = graph_state.get_node(req.source_id)
        dst = graph_state.get_node(req.destination_id)
        custom_refs = dict(graph_state._ref)
        custom_refs["weight_time"] = req.weight_time
        custom_refs["weight_dist"] = req.weight_dist
        custom_refs["weight_cong"] = req.weight_cong

        raw = _run_algorithm(
            req.source_id, req.destination_id,
            req.algorithm, req.n_particles, req.n_iter,
            refs_override=custom_refs,
        )

        qparams = None
        if req.algorithm == "QPSO":
            qparams = {
                "algorithm_class": "Quantum PSO",
                "n_particles": req.n_particles,
                "n_iter": req.n_iter,
                "weight_time": req.weight_time,
                "weight_dist": req.weight_dist,
                "weight_cong": req.weight_cong,
            }

        result_model = _result_to_model(raw, req.source_id, req.destination_id, src, dst, qparams)
        if result_model.valid:
            try:
                from backend.db.database import save_route
                save_route(
                    req.source_id, req.destination_id, req.algorithm,
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
    """Re-run the selected algorithm with the current traffic overlay."""
    if not graph_state._initialized:
        raise HTTPException(503, "Graph not yet initialized.")

    if req.source_id == req.destination_id:
        raise HTTPException(400, "Source and destination must be different locations.")

    try:
        src = graph_state.get_node(req.source_id)
        dst = graph_state.get_node(req.destination_id)

        custom_refs = dict(graph_state._ref)
        custom_refs["weight_time"] = req.weight_time
        custom_refs["weight_dist"] = req.weight_dist
        custom_refs["weight_cong"] = req.weight_cong

        saved_overlay = dict(graph_state.traffic_overlay)
        graph_state.traffic_overlay.clear()
        baseline_raw = _run_algorithm(req.source_id, req.destination_id, req.algorithm,
                                      req.n_particles, req.n_iter, refs_override=custom_refs)
        graph_state.traffic_overlay.update(saved_overlay)

        new_raw = _run_algorithm(req.source_id, req.destination_id, req.algorithm,
                                 req.n_particles, req.n_iter, refs_override=custom_refs)

        prev_model = _result_to_model(baseline_raw, req.source_id, req.destination_id, src, dst)
        new_model  = _result_to_model(new_raw,      req.source_id, req.destination_id, src, dst)

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
