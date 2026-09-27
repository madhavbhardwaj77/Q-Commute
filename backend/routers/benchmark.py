"""
Benchmark Router — POST /benchmark/compare
SIH 2026 Deliverable #5: Side-by-side algorithm performance comparison.
Runs QPSO, Dijkstra, and Genetic Algorithm on the same route and returns
a unified comparison object for the analytics dashboard.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from backend.graph.state import graph_state
from backend.optimization.benchmark_data import get_available_datasets, load_benchmark_instance
from backend.optimization.dijkstra import run_dijkstra
from backend.optimization.exact_solver import EXACT_SOLVER_MAX_STOPS, solve_vrp_exact
from backend.optimization.genetic import solve_vrp_ga
from backend.optimization.qpso import QPSORouter, solve_vrp_qpso
from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance, VRPSolution
from backend.routers.fleet import StopInput, VehicleInput
from backend.config import LOCATION_MAP

log = logging.getLogger(__name__)
router = APIRouter(prefix="/benchmark", tags=["benchmark"])

VALID_ALGOS = {"QPSO", "Dijkstra", "Genetic Algorithm"}


class BenchmarkRequest(BaseModel):
    source_id:        str
    destination_id:   Optional[str] = None
    destination_ids:  Optional[List[str]] = None
    optimize_order:   bool = True
    round_trip:       bool = False
    algorithms:       List[str] = ["QPSO", "Dijkstra", "Genetic Algorithm"]
    n_particles:      int = 20
    n_iter:           int = 40
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
    source_id:        str
    destination_id:   str
    destination_ids:  Optional[List[str]] = None
    ordered_stops:    Optional[List[str]] = None
    results:          List[AlgoResult]
    winner:           BenchmarkWinner
    improvement:      Dict[str, float]   # QPSO improvement % over Dijkstra


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


def _run_multi_one(algo: str, ordered_sequence: List[str], n_particles: int, n_iter: int, refs: dict) -> AlgoResult:
    """Run one algorithm on multiple destination legs."""
    from backend.routers.route import _run_multi_legs
    try:
        raw = _run_multi_legs(ordered_sequence, algo, n_particles, n_iter, refs_override=refs)
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
        log.warning("Multi-dest benchmark error for %s: %s", algo, e)
        return AlgoResult(
            algorithm=algo, valid=False, coordinates=[],
            distance_m=0, travel_time_s=0, total_cost=0, runtime_ms=0,
            path_length=0, iterations_to_converge=None, error=str(e)
        )


@router.post("/compare", response_model=BenchmarkResponse)
async def compare_algorithms(req: BenchmarkRequest) -> BenchmarkResponse:
    """
    Run multiple algorithms on the same route (single or multi-destination) and compare results.
    Returns a unified comparison object for the analytics dashboard benchmark tab.
    """
    if not graph_state._initialized:
        raise HTTPException(503, "Graph not yet initialized.")

    if req.destination_ids and len(req.destination_ids) > 0:
        dest_list = [d for d in req.destination_ids if d != req.source_id]
        seen = set()
        dest_list = [d for d in dest_list if not (d in seen or seen.add(d))]
    elif req.destination_id:
        if req.source_id == req.destination_id:
            raise HTTPException(400, "Source and destination must be different.")
        dest_list = [req.destination_id]
    else:
        raise HTTPException(400, "Must provide destination_id or destination_ids.")

    if not dest_list:
        raise HTTPException(400, "Source and destination must be different.")

    G    = graph_state.G
    ovl  = graph_state.traffic_overlay
    refs = dict(graph_state._ref)
    refs["weight_time"] = req.weight_time
    refs["weight_dist"] = req.weight_dist
    refs["weight_cong"] = req.weight_cong

    is_multi = len(dest_list) > 1 or req.round_trip

    results = []
    ordered_sequence = None
    final_dst = dest_list[0]

    if not is_multi:
        src = graph_state.get_node(req.source_id)
        dst = graph_state.get_node(dest_list[0])
        for algo in req.algorithms:
            r = _run_one(algo, req.source_id, dest_list[0], G, src, dst, ovl, refs,
                         req.n_particles, req.n_iter)
            results.append(r)
    else:
        from backend.routers.route import _optimize_destination_order
        if req.optimize_order:
            ordered_sequence = _optimize_destination_order(
                req.source_id, dest_list, req.round_trip, G, ovl, refs
            )
        else:
            ordered_sequence = [req.source_id] + dest_list
            if req.round_trip:
                ordered_sequence.append(req.source_id)

        final_dst = ordered_sequence[-1]

        for algo in req.algorithms:
            r = _run_multi_one(algo, ordered_sequence, req.n_particles, req.n_iter, refs)
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
        destination_id = final_dst,
        destination_ids= dest_list if is_multi else None,
        ordered_stops  = ordered_sequence if is_multi else [req.source_id, dest_list[0]],
        results        = results,
        winner         = winner,
        improvement    = improvement,
    )

    try:
        from backend.db.database import save_benchmark
        save_benchmark(
            req.source_id, final_dst,
            winner.lowest_cost, winner.fastest_time,
            [r.model_dump() for r in results]
        )
    except Exception as e:
        log.warning("Could not persist benchmark: %s", e)

    return resp


class VRPBenchmarkRequest(BaseModel):
    dataset_id: Optional[str] = None
    stops: Optional[List[StopInput]] = None
    vehicles: Optional[List[VehicleInput]] = None
    depot_id: Optional[str] = None
    algorithms: List[str] = ["QPSO", "GA", "OR-Tools (Exact)"]
    num_vehicles: Optional[int] = None
    capacity: Optional[float] = None
    iterations: int = 30
    population: int = 20
    time_limit_seconds: int = 5


class VRPAlgoResult(BaseModel):
    algorithm: str
    status: str = "completed"
    routes: Dict[str, List[Any]] = {}
    fitness: float = 0.0
    total_distance: float = 0.0
    total_time: float = 0.0
    violations: List[str] = []
    runtime_ms: float = 0.0
    convergence: Optional[List[dict]] = None
    message: Optional[str] = None


class VRPBenchmarkWinner(BaseModel):
    lowest_cost: Optional[str] = None
    shortest_distance: Optional[str] = None
    fastest_time: Optional[str] = None
    fastest_runtime: Optional[str] = None


class VRPBenchmarkResponse(BaseModel):
    dataset_id: Optional[str] = None
    instance_name: str
    num_stops: int
    num_vehicles: int
    results: List[VRPAlgoResult]
    winner: VRPBenchmarkWinner
    comparison_summary: Dict[str, Any] = {}


@router.get("/vrp_datasets")
async def list_vrp_datasets() -> List[Dict[str, Any]]:
    """Return catalog of available standard benchmark datasets for VRP evaluation."""
    return get_available_datasets()


@router.post("/vrp_compare", response_model=VRPBenchmarkResponse)
async def compare_vrp_algorithms(req: VRPBenchmarkRequest) -> VRPBenchmarkResponse:
    """
    Compare QPSO, GA, and OR-Tools exact solver on standard VRP benchmarks or custom instances.
    """
    dataset_id = req.dataset_id
    if not dataset_id and not (req.stops and req.vehicles and req.depot_id):
        dataset_id = "c101_small"

    if dataset_id:
        try:
            instance = load_benchmark_instance(
                dataset_id,
                num_vehicles=req.num_vehicles,
                capacity=req.capacity,
            )
            instance_name = f"Benchmark {dataset_id.upper()}"
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    elif req.stops and req.vehicles and req.depot_id:
        domain_stops = [
            Stop(
                id=s.id,
                lat=s.lat,
                lon=s.lon,
                demand=s.demand,
                time_window_start=s.time_window_start,
                time_window_end=s.time_window_end,
                service_time=s.service_time,
            )
            for s in req.stops
        ]
        domain_vehicles = [
            Vehicle(
                id=v.id,
                capacity=v.capacity,
                start_depot_id=v.start_depot_id or req.depot_id,
                max_route_duration=v.max_route_duration,
                speed=v.speed,
            )
            for v in req.vehicles
        ]
        instance = VRPInstance(
            stops=domain_stops,
            vehicles=domain_vehicles,
            depot_id=req.depot_id,
        )
        instance_name = "Custom VRP Instance"
    else:
        raise HTTPException(
            status_code=400,
            detail="Must provide either dataset_id or (stops, vehicles, depot_id)",
        )

    results: List[VRPAlgoResult] = []
    algo_set = set(req.algorithms)

    # 1. QPSO
    if any(a.upper() in {"QPSO", "QPSO-VRP"} for a in algo_set):
        t0 = time.perf_counter()
        try:
            qpso_sol = solve_vrp_qpso(
                instance,
                swarm_size=req.population,
                iterations=req.iterations,
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000
            results.append(
                VRPAlgoResult(
                    algorithm="QPSO",
                    status="completed",
                    routes={str(k): list(v) for k, v in qpso_sol.routes.items()},
                    fitness=round(qpso_sol.fitness, 4),
                    total_distance=round(qpso_sol.total_distance, 4),
                    total_time=round(qpso_sol.total_time, 4),
                    violations=list(qpso_sol.violations),
                    runtime_ms=round(elapsed_ms, 2),
                    convergence=qpso_sol.convergence,
                )
            )
        except Exception as e:
            elapsed_ms = (time.perf_counter() - t0) * 1000
            results.append(
                VRPAlgoResult(
                    algorithm="QPSO",
                    status="error",
                    runtime_ms=round(elapsed_ms, 2),
                    message=str(e),
                )
            )

    # 2. GA
    if any(a.upper() in {"GA", "GENETIC", "GENETIC ALGORITHM", "GA-VRP"} for a in algo_set):
        t0 = time.perf_counter()
        try:
            ga_sol = solve_vrp_ga(
                instance,
                population_size=req.population,
                generations=req.iterations,
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000
            results.append(
                VRPAlgoResult(
                    algorithm="Genetic Algorithm",
                    status="completed",
                    routes={str(k): list(v) for k, v in ga_sol.routes.items()},
                    fitness=round(ga_sol.fitness, 4),
                    total_distance=round(ga_sol.total_distance, 4),
                    total_time=round(ga_sol.total_time, 4),
                    violations=list(ga_sol.violations),
                    runtime_ms=round(elapsed_ms, 2),
                    convergence=ga_sol.convergence,
                )
            )
        except Exception as e:
            elapsed_ms = (time.perf_counter() - t0) * 1000
            results.append(
                VRPAlgoResult(
                    algorithm="Genetic Algorithm",
                    status="error",
                    runtime_ms=round(elapsed_ms, 2),
                    message=str(e),
                )
            )

    # 3. Exact Solver (OR-Tools)
    if any("EXACT" in a.upper() or "OR-TOOLS" in a.upper() or "ORTOOLS" in a.upper() for a in algo_set):
        if len(instance.stops) > EXACT_SOLVER_MAX_STOPS:
            results.append(
                VRPAlgoResult(
                    algorithm="OR-Tools (Exact)",
                    status="skipped",
                    message=f"Instance size ({len(instance.stops)} stops) exceeds safe limit of {EXACT_SOLVER_MAX_STOPS} stops.",
                )
            )
        else:
            t0 = time.perf_counter()
            try:
                exact_sol = solve_vrp_exact(
                    instance,
                    time_limit_seconds=req.time_limit_seconds,
                )
                elapsed_ms = (time.perf_counter() - t0) * 1000
                results.append(
                    VRPAlgoResult(
                        algorithm="OR-Tools (Exact)",
                        status="completed",
                        routes={str(k): list(v) for k, v in exact_sol.routes.items()},
                        fitness=round(exact_sol.fitness, 4),
                        total_distance=round(exact_sol.total_distance, 4),
                        total_time=round(exact_sol.total_time, 4),
                        violations=list(exact_sol.violations),
                        runtime_ms=round(elapsed_ms, 2),
                        convergence=exact_sol.convergence,
                    )
                )
            except Exception as e:
                elapsed_ms = (time.perf_counter() - t0) * 1000
                results.append(
                    VRPAlgoResult(
                        algorithm="OR-Tools (Exact)",
                        status="error",
                        runtime_ms=round(elapsed_ms, 2),
                        message=str(e),
                    )
                )

    completed = [r for r in results if r.status == "completed"]
    lowest_cost = None
    shortest_dist = None
    fastest_time = None
    fastest_runtime = None

    if completed:
        lowest_cost = min(completed, key=lambda r: r.fitness).algorithm
        shortest_dist = min(completed, key=lambda r: r.total_distance).algorithm
        fastest_time = min(completed, key=lambda r: r.total_time).algorithm
        fastest_runtime = min(completed, key=lambda r: r.runtime_ms).algorithm

    winner = VRPBenchmarkWinner(
        lowest_cost=lowest_cost,
        shortest_distance=shortest_dist,
        fastest_time=fastest_time,
        fastest_runtime=fastest_runtime,
    )

    comparison_summary: Dict[str, Any] = {}
    qpso_res = next((r for r in completed if r.algorithm == "QPSO"), None)
    ga_res = next((r for r in completed if r.algorithm == "Genetic Algorithm"), None)
    exact_res = next((r for r in completed if "OR-Tools" in r.algorithm), None)

    if qpso_res and exact_res and exact_res.fitness > 0:
        gap_pct = ((qpso_res.fitness - exact_res.fitness) / exact_res.fitness) * 100
        comparison_summary["qpso_optimality_gap_pct"] = round(gap_pct, 2)

    if qpso_res and ga_res and ga_res.fitness > 0:
        diff_pct = ((ga_res.fitness - qpso_res.fitness) / ga_res.fitness) * 100
        comparison_summary["qpso_improvement_over_ga_pct"] = round(diff_pct, 2)

    return VRPBenchmarkResponse(
        dataset_id=req.dataset_id,
        instance_name=instance_name,
        num_stops=len(instance.stops),
        num_vehicles=len(instance.vehicles),
        results=results,
        winner=winner,
        comparison_summary=comparison_summary,
    )

