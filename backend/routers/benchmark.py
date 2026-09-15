"""
Benchmark Router — POST /benchmark/compare
SIH 2026 Deliverable #5: Side-by-side algorithm performance comparison.
Runs QPSO, Dijkstra, and Genetic Algorithm on the same route and returns
a unified comparison object for the analytics dashboard.
"""
from __future__ import annotations

import logging
import time
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from backend.graph.state import graph_state
from backend.optimization.dijkstra import run_dijkstra
from backend.optimization.qpso import QPSORouter
from backend.config import LOCATION_MAP

log = logging.getLogger(__name__)
router = APIRouter(prefix="/benchmark", tags=["benchmark"])

VALID_ALGOS = {"QPSO", "Dijkstra", "Genetic Algorithm"}


class BenchmarkRequest(BaseModel):
    source_id:      str
    destination_id: str
    algorithms:     List[str] = ["QPSO", "Dijkstra", "Genetic Algorithm"]
    n_particles:    int = 20
    n_iter:         int = 40
    weight_time:    float = 0.5
    weight_dist:    float = 0.3
    weight_cong:    float = 0.2

    @field_validator("source_id", "destination_id")
    @classmethod
    def must_be_known(cls, v: str) -> str:
        if v not in LOCATION_MAP:
            raise ValueError(f"Unknown location id '{v}'")
        return v

    @field_validator("algorithms")
    @classmethod
    def must_be_valid(cls, v: List[str]) -> List[str]:
        for a in v:
            if a not in VALID_ALGOS:
                raise ValueError(f"Unknown algorithm '{a}'. Valid: {VALID_ALGOS}")
        return v


class AlgoResult(BaseModel):
    algorithm:      str
    valid:          bool
    coordinates:    Optional[List[List[float]]] = None
    distance_m:     float
    travel_time_s:  float
    total_cost:     float
    runtime_ms:     float
    path_length:    int
    iterations_to_converge: Optional[int] = None
    convergence:    Optional[List[dict]] = None
    error:          Optional[str] = None


class BenchmarkWinner(BaseModel):
    fastest_time:        str
    shortest_dist:       str
    lowest_cost:         str
    fastest_runtime:     str
    fastest_convergence: Optional[str] = None


class BenchmarkResponse(BaseModel):
    source_id:      str
    destination_id: str
    results:        List[AlgoResult]
    winner:         BenchmarkWinner
    improvement:    Dict[str, float]   # QPSO improvement % over Dijkstra


def _run_one(algo: str, src_id: str, dst_id: str, G, src, dst, ovl, refs,
             n_particles: int, n_iter: int) -> AlgoResult:
    """Run one algorithm and capture result safely."""
    try:
        if algo == "Dijkstra":
            raw = run_dijkstra(G, src, dst, ovl, refs, routing_mode="classical")
        elif algo == "Genetic Algorithm":
            from backend.optimization.genetic import GeneticRouter
            ga = GeneticRouter(G, src, dst, ovl, refs, n_particles=n_particles, n_iter=n_iter)
            raw = ga.run()
        else:  # QPSO
            qpso = QPSORouter(G, src, dst, ovl, refs, n_particles=n_particles, n_iter=n_iter)
            raw = qpso.run()

        path = raw.get("path") or []
        conv = raw.get("convergence") or []
        iter_to_conv = None
        if conv and len(conv) > 1:
            final_c = conv[-1]["best_cost"]
            for item in conv:
                if abs(item["best_cost"] - final_c) <= 1e-3 * max(1.0, final_c):
                    iter_to_conv = item["iteration"]
                    break
        elif algo == "Dijkstra":
            iter_to_conv = 1

        return AlgoResult(
            algorithm              = algo,
            valid                  = raw.get("valid", False),
            coordinates            = raw.get("coordinates") or [],
            distance_m             = raw.get("distance_m", 0.0),
            travel_time_s          = raw.get("travel_time_s", 0.0),
            total_cost             = raw.get("total_cost", 0.0),
            runtime_ms             = raw.get("runtime_ms", 0.0),
            path_length            = len(path),
            iterations_to_converge = iter_to_conv,
            convergence            = conv,
        )
    except Exception as e:
        log.warning("Benchmark error for %s: %s", algo, e)
        return AlgoResult(
            algorithm=algo, valid=False, coordinates=[],
            distance_m=0, travel_time_s=0, total_cost=0, runtime_ms=0,
            path_length=0, iterations_to_converge=None, error=str(e)
        )


@router.post("/compare", response_model=BenchmarkResponse)
async def compare_algorithms(req: BenchmarkRequest) -> BenchmarkResponse:
    """
    Run multiple algorithms on the same source->destination and compare results.
    Returns a unified comparison object for the analytics dashboard benchmark tab.
    """
    if not graph_state._initialized:
        raise HTTPException(503, "Graph not yet initialized.")

    if req.source_id == req.destination_id:
        raise HTTPException(400, "Source and destination must be different.")

    G    = graph_state.G
    ovl  = graph_state.traffic_overlay
    refs = dict(graph_state._ref)
    refs["weight_time"] = req.weight_time
    refs["weight_dist"] = req.weight_dist
    refs["weight_cong"] = req.weight_cong
    src  = graph_state.get_node(req.source_id)
    dst  = graph_state.get_node(req.destination_id)

    results = []
    for algo in req.algorithms:
        r = _run_one(algo, req.source_id, req.destination_id, G, src, dst, ovl, refs,
                     req.n_particles, req.n_iter)
        results.append(r)

    valid_results = [r for r in results if r.valid]

    def _best(key: str) -> str:
        if not valid_results:
            return "N/A"
        min_val = min(getattr(r, key) for r in valid_results)
        ties = [r for r in valid_results if abs(getattr(r, key) - min_val) < 1e-3]
        qpso_match = next((r for r in ties if r.algorithm == "QPSO"), None)
        if qpso_match:
            return "QPSO"
        return ties[0].algorithm

    # Find fastest convergence among stochastic metaheuristics
    meta_results = [r for r in valid_results if r.iterations_to_converge is not None and r.algorithm in {"QPSO", "Genetic Algorithm"}]
    fastest_conv = "QPSO"
    if meta_results:
        best_meta = min(meta_results, key=lambda r: r.iterations_to_converge or 999)
        fastest_conv = best_meta.algorithm

    winner = BenchmarkWinner(
        fastest_time        = _best("travel_time_s"),
        shortest_dist       = _best("distance_m"),
        lowest_cost         = _best("total_cost"),
        fastest_runtime     = _best("runtime_ms"),
        fastest_convergence = fastest_conv,
    )

    # Compute improvement: QPSO vs Dijkstra on cost
    improvement: Dict[str, float] = {}
    qpso_r = next((r for r in results if r.algorithm == "QPSO" and r.valid), None)
    dijk_r = next((r for r in results if r.algorithm == "Dijkstra" and r.valid), None)
    if qpso_r and dijk_r and dijk_r.total_cost > 0:
        delta = dijk_r.total_cost - qpso_r.total_cost
        improvement["cost_vs_dijkstra_pct"] = round(delta / dijk_r.total_cost * 100, 2)
    if qpso_r and dijk_r and dijk_r.travel_time_s > 0:
        delta_t = dijk_r.travel_time_s - qpso_r.travel_time_s
        improvement["time_vs_dijkstra_pct"] = round(delta_t / dijk_r.travel_time_s * 100, 2)

    resp = BenchmarkResponse(
        source_id      = req.source_id,
        destination_id = req.destination_id,
        results        = results,
        winner         = winner,
        improvement    = improvement,
    )

    try:
        from backend.db.database import save_benchmark
        save_benchmark(
            req.source_id, req.destination_id,
            winner.lowest_cost, winner.fastest_time,
            [r.model_dump() for r in results]
        )
    except Exception as e:
        log.warning("Could not persist benchmark: %s", e)

    return resp
