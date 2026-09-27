"""
Rule-Based & AI-Driven Solver Selection Orchestrator

Selects the most suitable routing solver (QPSO, QAOA, Quantum Annealing,
OR-Tools Exact, Dijkstra, or GA) based on instance topology, fleet size,
execution urgency, latency budget, and user-provided scenario intent.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

from backend.optimization.vrp_models import VRPInstance
from backend.orchestrator.scenario_parser import ScenarioFeatures, parse_scenario
from backend.quantum.qaoa_subsolver import MAX_QAOA_STOPS, is_qaoa_available
from backend.quantum.annealing_subsolver import is_annealing_available


class DecisionRationale(BaseModel):
    selected_solver: str
    algorithm_display: str
    confidence: float
    scores: Dict[str, float] = Field(default_factory=dict)
    rationale: str
    factors_applied: Dict[str, float] = Field(default_factory=dict)
    candidate_algorithms: List[str] = Field(default_factory=list)


def evaluate_algorithm_suitability(
    instance: VRPInstance,
    features: ScenarioFeatures,
) -> Dict[str, float]:
    """
    Compute multi-criteria suitability score in [0.0, 1.0] for each candidate solver.
    """
    n_stops = len(instance.stops)
    n_veh = len(instance.vehicles)

    scores: Dict[str, float] = {
        "qpso": 0.70,
        "qaoa": 0.0,
        "quantum_annealing": 0.0,
        "dijkstra": 0.20,
        "exact": 0.30,
        "genetic": 0.50,
    }

    # 1. Gate-Model QAOA: Feasible only for small micro-clusters (<= 8 stops)
    if is_qaoa_available() and n_stops <= MAX_QAOA_STOPS and n_veh == 1:
        base_qaoa = 0.65
        if features.hardware_preference == "prefer_qaoa":
            base_qaoa += 0.30
        if features.quantum_affinity > 0.5:
            base_qaoa += 0.15
        if features.latency_budget == "real_time":
            base_qaoa -= 0.50  # Gate quantum simulation too slow for <100ms real-time
        scores["qaoa"] = max(0.0, min(1.0, base_qaoa))
    else:
        scores["qaoa"] = 0.0

    # 2. Quantum Annealing (Neal): Fast micro-cluster QUBO (<= 8 stops)
    if is_annealing_available() and n_stops <= MAX_QAOA_STOPS and n_veh == 1:
        base_anneal = 0.75
        if features.hardware_preference == "prefer_quantum_annealing":
            base_anneal += 0.25
        if features.quantum_affinity > 0.5:
            base_anneal += 0.15
        if features.latency_budget == "real_time":
            base_anneal += 0.10  # Neal executes in 15-30ms, excellent for real-time
        scores["quantum_annealing"] = max(0.0, min(1.0, base_anneal))
    else:
        scores["quantum_annealing"] = 0.0

    # 3. Dijkstra: Best for single point-A-to-B deterministic routes
    if n_stops <= 2 and n_veh == 1:
        scores["dijkstra"] = 0.95
    elif n_stops <= 3 and n_veh == 1:
        scores["dijkstra"] = 0.60
    else:
        scores["dijkstra"] = 0.10  # Dijkstra does not handle multi-stop VRP natively

    # 4. Exact Solver (OR-Tools CP-SAT): Provable optimum for <= 10 stops
    if n_stops <= 10 and n_veh <= 2:
        base_exact = 0.82
        if features.hardware_preference == "prefer_classical_exact":
            base_exact += 0.18
        if features.urgency == "live_reroute":
            base_exact -= 0.30
        scores["exact"] = max(0.0, min(1.0, base_exact))
    else:
        scores["exact"] = max(0.0, 0.40 - (0.05 * (n_stops - 10)))

    # 5. QPSO (Quantum-Behaved PSO): High scalability, multi-vehicle, traffic congestion
    base_qpso = 0.80
    if n_veh > 1 or n_stops > 8:
        base_qpso += 0.15  # Dominates for complex multi-vehicle fleet
    if features.urgency == "live_reroute":
        base_qpso += 0.15  # Excellent warm-start capability
    if features.target_objective in {"congestion_avoidance", "green_fleet"}:
        base_qpso += 0.10  # Non-linear multi-factor fitness handling
    if features.hardware_preference == "prefer_qpso":
        base_qpso += 0.15
    scores["qpso"] = max(0.0, min(1.0, base_qpso))

    # 6. Genetic Algorithm: Solid baseline
    base_ga = 0.65
    if n_veh > 1:
        base_ga += 0.10
    if features.urgency == "live_reroute":
        base_ga -= 0.20  # Slower convergence from scratch
    scores["genetic"] = max(0.0, min(1.0, base_ga))

    return {k: round(v, 3) for k, v in scores.items()}


def select_solver_with_ai(
    instance: VRPInstance,
    context: Optional[Dict[str, Any]] = None,
    features: Optional[ScenarioFeatures] = None,
) -> DecisionRationale:
    """
    Select the optimal solver and synthesize explainable decision rationale.
    """
    ctx = context or {}
    n_stops = len(instance.stops)
    n_veh = len(instance.vehicles)

    if features is None:
        raw_prompt = ctx.get("prompt") or ctx.get("scenario")
        features = parse_scenario(
            prompt=raw_prompt,
            filters=ctx,
            num_stops=n_stops,
            num_vehicles=n_veh,
        )

    scores = evaluate_algorithm_suitability(instance, features)

    # Respect explicit user hardware preference if viable
    chosen_key = "qpso"
    if features.hardware_preference == "prefer_qaoa" and scores.get("qaoa", 0) > 0.3:
        chosen_key = "qaoa"
    elif features.hardware_preference == "prefer_quantum_annealing" and scores.get("quantum_annealing", 0) > 0.3:
        chosen_key = "quantum_annealing"
    elif features.hardware_preference == "prefer_classical_exact" and scores.get("exact", 0) > 0.3:
        chosen_key = "exact"
    elif ctx.get("urgency") == "live_reroute" or features.urgency == "live_reroute":
        chosen_key = "qpso_warm_start"
    elif n_stops <= 10 and n_veh == 1 and features.hardware_preference != "prefer_qpso" and features.quantum_affinity < 0.6:
        chosen_key = "exact"
    else:
        # Pick highest scoring solver
        best_candidate = max(scores, key=lambda k: scores[k])
        chosen_key = best_candidate

    display_names = {
        "qpso": "Quantum-Behaved PSO (QPSO-VRP)",
        "qpso_warm_start": "Warm-Started QPSO",
        "qaoa": "Gate-Model QAOA (Statevector)",
        "quantum_annealing": "Quantum Annealing (D-Wave Neal)",
        "exact": "OR-Tools CP-SAT (Exact)",
        "dijkstra": "Dijkstra Shortest Path",
        "genetic": "Genetic Algorithm (GA-VRP)",
    }

    # Generate transparent explainability rationale
    if chosen_key == "qaoa":
        rationale = (
            f"Selected Gate-Model QAOA: Micro-cluster instance ({n_stops} stops) satisfies the "
            f"quantum circuit boundary (<= {MAX_QAOA_STOPS} stops). The TSP was formulated as an Ising "
            f"Hamiltonian QUBO to evaluate quantum ground-state statevector convergence with COBYLA."
        )
    elif chosen_key == "quantum_annealing":
        rationale = (
            f"Selected Simulated Quantum Annealing (Neal): Micro-cluster instance ({n_stops} stops) "
            f"is ideal for Ising spin-glass energy minimization. Solves the QUBO combinatorial tour "
            f"in ultra-low latency (<30ms) with zero qubit statevector overhead."
        )
    elif chosen_key == "exact":
        rationale = (
            f"Selected Exact Solver (OR-Tools CP-SAT): Instance topology ({n_stops} stops, {n_veh} vehicle) "
            f"is within the deterministic boundary (<= 10 stops). Guarantees mathematically provable "
            f"zero optimality gap under capacity and time-window constraints."
        )
    elif chosen_key == "qpso_warm_start":
        rationale = (
            f"Selected Warm-Started QPSO: Live incident/reroute scenario detected with latency budget "
            f"'{features.latency_budget}'. Seeds the quantum-behaved particle swarm from prior vehicle "
            f"trajectories to achieve sub-second re-convergence."
        )
    elif chosen_key == "dijkstra":
        rationale = (
            f"Selected Dijkstra: Single-vehicle direct route with minimal stops. Guarantees deterministic "
            f"polynomial-time shortest path without stochastic search variance."
        )
    else:
        rationale = (
            f"Selected Quantum-Behaved PSO (QPSO-VRP): Best suited for multi-vehicle fleet ({n_veh} vehicles, "
            f"{n_stops} stops) with non-linear objectives (distance, travel time, congestion, emissions). "
            f"Delta-potential well particle wavefunctions maintain broad exploration without quantum hardware limits."
        )

    confidence = features.confidence
    if chosen_key in scores:
        confidence = round(max(confidence, scores[chosen_key]), 2)

    return DecisionRationale(
        selected_solver=chosen_key,
        algorithm_display=display_names.get(chosen_key, chosen_key),
        confidence=confidence,
        scores=scores,
        rationale=rationale,
        factors_applied=features.weights,
        candidate_algorithms=list(scores.keys()),
    )


def select_solver(
    instance: VRPInstance,
    context: Optional[Dict[str, Any]] = None,
) -> Tuple[str, str]:
    """
    Select the optimal solver based on instance characteristics and context.
    Maintains 100% backward compatibility with legacy caller signatures.

    Returns:
        Tuple of (solver_name, reason).
    """
    ctx = context or {}

    # Strict backward compatibility rules
    if len(instance.stops) <= 10 and len(instance.vehicles) == 1 and ctx.get("urgency") != "live_reroute":
        return ("exact", "small single-vehicle instance, exact solver feasible")

    if ctx.get("urgency") == "live_reroute":
        return ("qpso_warm_start", "time-sensitive reroute, using fast warm-started QPSO")

    # If scenario prompt or advanced filters present, use AI decision engine
    if ctx.get("prompt") or ctx.get("target_objective") or ctx.get("hardware_preference"):
        decision = select_solver_with_ai(instance, context=ctx)
        return (decision.selected_solver, decision.rationale)

    return ("qpso_vrp", "default: full QPSO-VRP")
