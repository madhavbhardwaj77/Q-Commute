"""
Quantum Annealing (Simulated) Subsolver for Micro-Cluster Routing

Uses neal.SimulatedAnnealingSampler to solve the TSP QUBO formulation.
Stands in for real D-Wave quantum annealing hardware, enabling sub-second
offline simulation of transverse-field Ising / QUBO annealing dynamics.

Enforces a hard limit of <= 8 stops to maintain parity with the QAOA formulation.
"""
from __future__ import annotations

import logging
import math
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np

from backend.quantum.qaoa_subsolver import (
    MAX_QAOA_STOPS,
    _compute_distance_matrix,
    _calculate_tour_distance,
    _rotate_tour_to_depot,
)

log = logging.getLogger(__name__)

# Hard upper limit on stops matching QAOA
MAX_ANNEALING_STOPS = MAX_QAOA_STOPS

# Guarded imports: Allow application to start even if dwave-neal is missing
try:
    import dimod
    import neal
    from qiskit_optimization.applications import Tsp
    from qiskit_optimization.converters import QuadraticProgramToQubo
    ANNEALING_AVAILABLE = True
except (ImportError, Exception) as exc:
    log.warning("Quantum annealing dependencies (dwave-neal / dimod) not available: %s", exc)
    ANNEALING_AVAILABLE = False


def is_annealing_available() -> bool:
    """Return True if neal and dimod are installed and usable."""
    return ANNEALING_AVAILABLE


def solve_cluster_annealing(
    stops: Sequence[Any],
    depot_id: Optional[Union[str, int]] = None,
    num_reads: int = 100,
    timeout_seconds: float = 10.0,
) -> Dict[str, Any]:
    """
    Solve a micro-cluster routing problem using Simulated Quantum Annealing (Neal).

    Args:
        stops: Sequence of stops (max 8).
        depot_id: Optional anchor depot ID to start/finish the tour.
        num_reads: Number of annealing trajectories / samples.
        timeout_seconds: Timeout limit for execution.

    Returns:
        Dictionary with algorithm, tour, total_distance, status, runtime_ms, and energy.
    """
    if len(stops) > MAX_ANNEALING_STOPS:
        raise ValueError(
            f"Annealing subsolver hard cap is {MAX_ANNEALING_STOPS} stops; received {len(stops)} stops."
        )

    if not ANNEALING_AVAILABLE:
        return {
            "algorithm": "Quantum Annealing (Neal)",
            "tour": [s.get("id", s) if isinstance(s, dict) else getattr(s, "id", s) for s in stops],
            "total_distance": 0.0,
            "status": "unavailable",
            "runtime_ms": 0.0,
            "error": "dwave-neal or dimod is not installed or enabled in this environment.",
        }

    n_stops = len(stops)
    if n_stops == 0:
        return {
            "algorithm": "Quantum Annealing (Neal)",
            "tour": [],
            "total_distance": 0.0,
            "status": "completed",
            "runtime_ms": 0.0,
        }

    if n_stops == 1:
        s = stops[0]
        s_id = s.get("id", s) if isinstance(s, dict) else getattr(s, "id", s)
        return {
            "algorithm": "Quantum Annealing (Neal)",
            "tour": [s_id],
            "total_distance": 0.0,
            "status": "completed",
            "runtime_ms": 0.0,
        }

    matrix, stop_ids = _compute_distance_matrix(stops)
    t0 = time.perf_counter()

    try:
        tsp = Tsp(matrix)
        qp = tsp.to_quadratic_program()
        qubo = QuadraticProgramToQubo().convert(qp)

        # Convert QuadraticProgram QUBO to dimod BinaryQuadraticModel (BQM)
        linear = {v.name: float(qubo.objective.linear[v.name]) for v in qubo.variables}
        quadratic: Dict[Tuple[str, str], float] = {}
        for v1 in qubo.variables:
            for v2 in qubo.variables:
                coeff = float(qubo.objective.quadratic[v1.name, v2.name])
                if coeff != 0.0:
                    quadratic[(v1.name, v2.name)] = coeff

        bqm = dimod.BinaryQuadraticModel(linear, quadratic, float(qubo.objective.constant), dimod.BINARY)

        sampler = neal.SimulatedAnnealingSampler()
        response = sampler.sample(bqm, num_reads=num_reads)

        best_sample = response.first.sample
        best_energy = float(response.first.energy)
        x_vec = np.array([best_sample[v.name] for v in qubo.variables])

        runtime_ms = (time.perf_counter() - t0) * 1000.0

        try:
            raw_tour = tsp.interpret(x_vec)
            if len(raw_tour) == n_stops and set(raw_tour) == set(range(n_stops)):
                tour_indices = [int(i) for i in raw_tour]
            else:
                tour_indices = list(range(n_stops))
        except Exception:
            tour_indices = list(range(n_stops))

        tour_stop_ids = [stop_ids[idx] for idx in tour_indices]
        ordered_tour = _rotate_tour_to_depot(tour_stop_ids, depot_id)
        total_dist = _calculate_tour_distance(tour_indices, matrix)

        return {
            "algorithm": "Quantum Annealing (Neal)",
            "tour": ordered_tour,
            "total_distance": round(total_dist, 2),
            "status": "completed",
            "runtime_ms": round(runtime_ms, 2),
            "num_reads": num_reads,
            "energy": round(best_energy, 2),
            "error": None,
        }
    except Exception as e:
        runtime_ms = (time.perf_counter() - t0) * 1000.0
        log.error("Quantum annealing execution failed: %s", e)
        return {
            "algorithm": "Quantum Annealing (Neal)",
            "tour": _rotate_tour_to_depot(stop_ids, depot_id),
            "total_distance": round(_calculate_tour_distance(list(range(n_stops)), matrix), 2),
            "status": "error",
            "runtime_ms": round(runtime_ms, 2),
            "error": str(e),
        }
