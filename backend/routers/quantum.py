"""
Quantum Validation Router — POST /quantum/validate

Provides isolated side-by-side benchmarking of:
1. Discrete Quantum-Inspired PSO (QPSO-VRP)
2. Gate-model QAOA (Qiskit Optimization + Statevector Simulator)
3. Simulated Quantum Annealing (D-Wave Neal)

Enforces strict micro-cluster sizing (<= 8 stops) and timeouts to ensure
safe, reliable execution that never destabilizes production routing.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.optimization.qpso import solve_vrp_qpso
from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance
from backend.quantum.annealing_subsolver import (
    is_annealing_available,
    solve_cluster_annealing,
)
from backend.quantum.qaoa_subsolver import (
    MAX_QAOA_STOPS,
    is_qaoa_available,
    solve_cluster_qaoa,
)
from backend.routers.fleet import StopInput

log = logging.getLogger(__name__)
router = APIRouter(prefix="/quantum", tags=["quantum"])


class QuantumValidateRequest(BaseModel):
    stops: List[StopInput]
    depot_id: Optional[Union[str, int]] = None
    timeout_seconds: Optional[float] = 15.0
    qpso_iterations: Optional[int] = 30
    annealing_reads: Optional[int] = 100


class SolverValidationResult(BaseModel):
    algorithm: str
    tour: List[Any]
    total_distance: float
    status: str
    runtime_ms: float
    metadata: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None


class QuantumValidateResponse(BaseModel):
    num_stops: int
    depot_id: Union[str, int]
    solvers: Dict[str, SolverValidationResult]
    comparison: Dict[str, Any]


@router.get("/status")
async def get_quantum_capabilities() -> Dict[str, Any]:
    """Inspect availability of gate-model and annealing quantum libraries."""
    return {
        "qaoa_available": is_qaoa_available(),
        "annealing_available": is_annealing_available(),
        "max_cluster_stops": MAX_QAOA_STOPS,
    }


@router.post("/validate", response_model=QuantumValidateResponse)
async def validate_quantum_solvers(
    payload: QuantumValidateRequest,
) -> QuantumValidateResponse:
    """
    Run a three-way side-by-side comparison of QPSO, QAOA, and Quantum Annealing
    on a small cluster (<= 8 stops).
    """
    stops = payload.stops
    if not stops:
        raise HTTPException(status_code=400, detail="stops list cannot be empty")

    if len(stops) > MAX_QAOA_STOPS:
        raise HTTPException(
            status_code=400,
            detail=f"Quantum validation is capped at {MAX_QAOA_STOPS} stops to prevent simulator statevector explosion; received {len(stops)} stops.",
        )

    depot_id = payload.depot_id or stops[0].id
    stop_ids = [s.id for s in stops]
    if depot_id not in stop_ids:
        depot_id = stop_ids[0]

    timeout = max(1.0, float(payload.timeout_seconds or 15.0))
    results: Dict[str, SolverValidationResult] = {}

    # 1. Run Discrete QPSO
    t0 = time.perf_counter()
    try:
        domain_stops = [
            Stop(
                id=s.id,
                lat=s.lat,
                lon=s.lon,
                demand=s.demand or 0.0,
            )
            for s in stops
        ]
        # Single vehicle with infinite capacity to model TSP
        domain_vehicles = [
            Vehicle(id="v1", capacity=1e6, start_depot_id=depot_id)
        ]
        inst = VRPInstance(
            stops=domain_stops,
            vehicles=domain_vehicles,
            depot_id=depot_id,
            metric="haversine",
        )
        qpso_sol = solve_vrp_qpso(
            instance=inst,
            iterations=payload.qpso_iterations or 30,
            swarm_size=20,
        )
        qpso_ms = (time.perf_counter() - t0) * 1000.0

        v1_route = qpso_sol.routes.get("v1", [])
        qpso_tour = [depot_id] + [sid for sid in v1_route if sid != depot_id]

        results["qpso"] = SolverValidationResult(
            algorithm="QPSO",
            tour=qpso_tour,
            total_distance=round(float(qpso_sol.total_distance), 2),
            status="completed",
            runtime_ms=round(qpso_ms, 2),
            metadata={"iterations": payload.qpso_iterations or 30, "swarm_size": 20},
        )
    except Exception as e:
        qpso_ms = (time.perf_counter() - t0) * 1000.0
        log.error("QPSO run error in quantum validation: %s", e)
        results["qpso"] = SolverValidationResult(
            algorithm="QPSO",
            tour=stop_ids,
            total_distance=0.0,
            status="error",
            runtime_ms=round(qpso_ms, 2),
            error=str(e),
        )

    # 2. Run Gate-Model QAOA
    qaoa_res = solve_cluster_qaoa(
        stops=stops,
        depot_id=depot_id,
        timeout_seconds=timeout,
        reps=1,
        maxiter=4,
    )
    results["qaoa"] = SolverValidationResult(
        algorithm=qaoa_res.get("algorithm", "QAOA"),
        tour=qaoa_res.get("tour", []),
        total_distance=float(qaoa_res.get("total_distance", 0.0)),
        status=qaoa_res.get("status", "error"),
        runtime_ms=float(qaoa_res.get("runtime_ms", 0.0)),
        metadata={
            "qubits": qaoa_res.get("qubits"),
            "ansatz_depth": qaoa_res.get("ansatz_depth"),
            "qubo_fval": qaoa_res.get("qubo_fval"),
        },
        error=qaoa_res.get("error"),
    )

    # 3. Run Quantum Annealing (Neal)
    anneal_res = solve_cluster_annealing(
        stops=stops,
        depot_id=depot_id,
        num_reads=payload.annealing_reads or 100,
        timeout_seconds=timeout,
    )
    results["quantum_annealing"] = SolverValidationResult(
        algorithm=anneal_res.get("algorithm", "Quantum Annealing (Neal)"),
        tour=anneal_res.get("tour", []),
        total_distance=float(anneal_res.get("total_distance", 0.0)),
        status=anneal_res.get("status", "error"),
        runtime_ms=float(anneal_res.get("runtime_ms", 0.0)),
        metadata={
            "num_reads": anneal_res.get("num_reads"),
            "energy": anneal_res.get("energy"),
        },
        error=anneal_res.get("error"),
    )

    # Compute comparison summary
    completed_runs = {
        k: v for k, v in results.items() if v.status == "completed" and v.total_distance > 0
    }

    best_dist_key = min(completed_runs, key=lambda k: completed_runs[k].total_distance) if completed_runs else None
    fastest_key = min(completed_runs, key=lambda k: completed_runs[k].runtime_ms) if completed_runs else None

    comparison = {
        "best_distance_solver": results[best_dist_key].algorithm if best_dist_key else None,
        "best_distance": results[best_dist_key].total_distance if best_dist_key else None,
        "fastest_solver": results[fastest_key].algorithm if fastest_key else None,
        "fastest_runtime_ms": results[fastest_key].runtime_ms if fastest_key else None,
        "solvers_completed": len(completed_runs),
    }

    return QuantumValidateResponse(
        num_stops=len(stops),
        depot_id=depot_id,
        solvers=results,
        comparison=comparison,
    )
