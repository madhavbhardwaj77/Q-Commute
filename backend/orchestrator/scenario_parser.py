"""
AI Scenario Parser & Feature Extractor

Parses free-text scenario descriptions and structured interactive filters
to infer operational priorities, multi-factor optimization weights,
urgency/latency constraints, and quantum hardware affinities.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ScenarioFeatures(BaseModel):
    raw_prompt: str = ""
    urgency: str = "standard"  # "emergency", "live_reroute", "standard", "deep_exploration"
    target_objective: str = "balanced"  # "time_critical", "distance_minimal", "congestion_avoidance", "green_fleet", "balanced"
    latency_budget: str = "interactive"  # "real_time" (<100ms), "interactive" (<2s), "rigorous_batch" (unbounded)
    hardware_preference: str = "auto"  # "auto", "prefer_quantum_annealing", "prefer_qaoa", "prefer_qpso", "prefer_classical_exact", "prefer_dijkstra"
    quantum_affinity: float = 0.0  # 0.0 to 1.0
    congestion_sensitivity: float = 0.5
    emissions_sensitivity: float = 0.3
    time_sensitivity: float = 0.5
    distance_sensitivity: float = 0.5
    weights: Dict[str, float] = Field(
        default_factory=lambda: {"time": 0.35, "dist": 0.25, "cong": 0.25, "emiss": 0.15}
    )
    extracted_keywords: List[str] = Field(default_factory=list)
    confidence: float = 0.90


SCENARIO_PRESETS: Dict[str, Dict[str, Any]] = {
    "emergency_rush_hour": {
        "title": "Emergency Rush Hour Dispatch",
        "description": "Ambulance / emergency response during severe peak congestion. Lowest travel time is critical, avoiding all congestion bottlenecks.",
        "prompt": "Urgent ambulance dispatch during severe rush hour congestion. Bypass all traffic bottlenecks with lowest possible arrival time.",
        "filters": {
            "target_objective": "time_critical",
            "latency_budget": "real_time",
            "urgency": "emergency",
            "hardware_preference": "auto",
        },
    },
    "quantum_micro_cluster": {
        "title": "Quantum Hamiltonian Ground-State Validation",
        "description": "Validation of micro-cluster (<= 8 stops) TSP on gate-model QAOA and D-Wave Neal quantum annealing to inspect energy ground-state.",
        "prompt": "Solve 4-stop micro-cluster tour on gate-model QAOA and quantum annealer to inspect Hamiltonian QUBO ground-state convergence.",
        "filters": {
            "target_objective": "distance_minimal",
            "latency_budget": "rigorous_batch",
            "urgency": "deep_exploration",
            "hardware_preference": "prefer_qaoa",
        },
    },
    "green_multi_fleet": {
        "title": "Green Multi-Vehicle Delivery Fleet",
        "description": "E-commerce logistics delivery balancing vehicle capacity, fuel consumption, and CO2 emissions across 2-4 delivery vans.",
        "prompt": "Multi-drop logistics delivery with strict vehicle capacity constraints, minimizing total fuel cost and carbon dioxide emissions.",
        "filters": {
            "target_objective": "green_fleet",
            "latency_budget": "interactive",
            "urgency": "standard",
            "hardware_preference": "prefer_qpso",
        },
    },
    "instant_reroute": {
        "title": "Instant Road-Blockage Dynamic Reroute",
        "description": "Sudden traffic incident or waterlogging event requiring sub-100ms warm-started reroute seeded from previous vehicle positions.",
        "prompt": "Severe road blockage detected on primary arterial road. Re-compute optimal route immediately using warm-started trajectory.",
        "filters": {
            "target_objective": "congestion_avoidance",
            "latency_budget": "real_time",
            "urgency": "live_reroute",
            "hardware_preference": "auto",
        },
    },
}


# Regex keyword patterns for natural language scenario interpretation
KEYWORD_PATTERNS = {
    "emergency": re.compile(r"\b(ambulance|emergency|critical|hospital|urgent|siren|rescue|life-threatening)\b", re.IGNORECASE),
    "reroute": re.compile(r"\b(reroute|re-route|incident|blockage|accident|waterlogging|blocked|detour|sudden)\b", re.IGNORECASE),
    "quantum_qaoa": re.compile(r"\b(qaoa|gate-model|gate\s+quantum|hamiltonian|qubits?|qubo|ansatz|statevector)\b", re.IGNORECASE),
    "quantum_anneal": re.compile(r"\b(annealing|d-wave|neal|ising|transverse|spin\s+glass|energy\s+ground)\b", re.IGNORECASE),
    "quantum_general": re.compile(r"\b(quantum|qpso|quantum-inspired|superposition|tunneling)\b", re.IGNORECASE),
    "green": re.compile(r"\b(green|carbon|co2|emissions?|fuel|eco|electric|sustainable|sustainability)\b", re.IGNORECASE),
    "congestion": re.compile(r"\b(congestion|traffic|jam|rush\s+hour|bottleneck|gridlock|peak\s+hour)\b", re.IGNORECASE),
    "fastest_time": re.compile(r"\b(fastest|quickest|least\s+time|minimize\s+time|speed|time-critical)\b", re.IGNORECASE),
    "shortest_dist": re.compile(r"\b(shortest|least\s+distance|minimize\s+distance|direct|closest)\b", re.IGNORECASE),
    "exact_optimal": re.compile(r"\b(exact|provable|mathematical|zero-gap|optimal|cp-sat|or-tools|integer\s+programming)\b", re.IGNORECASE),
}


def parse_scenario(
    prompt: Optional[str] = None,
    filters: Optional[Dict[str, Any]] = None,
    num_stops: int = 4,
    num_vehicles: int = 1,
) -> ScenarioFeatures:
    """
    Synthesize user prompt and filter selections into quantified scenario features.
    
    Weights are normalized such that:
        w_time + w_dist + w_cong + w_emiss = 1.0
    """
    filters = filters or {}
    text = (prompt or "").strip()
    extracted_keywords: List[str] = []

    # 1. Base values from filters if specified
    urgency = filters.get("urgency", "standard")
    target_obj = filters.get("target_objective", "balanced")
    latency_budget = filters.get("latency_budget", "interactive")
    hardware_pref = filters.get("hardware_preference", "auto")

    # 2. Extract features from natural language prompt
    quantum_hits = 0
    if KEYWORD_PATTERNS["emergency"].search(text):
        urgency = "emergency"
        target_obj = "time_critical"
        latency_budget = "real_time"
        extracted_keywords.append("emergency")

    if KEYWORD_PATTERNS["reroute"].search(text):
        urgency = "live_reroute"
        latency_budget = "real_time"
        extracted_keywords.append("live_reroute")

    if KEYWORD_PATTERNS["quantum_qaoa"].search(text):
        quantum_hits += 2
        hardware_pref = "prefer_qaoa" if hardware_pref == "auto" else hardware_pref
        extracted_keywords.append("qaoa_gate_quantum")

    if KEYWORD_PATTERNS["quantum_anneal"].search(text):
        quantum_hits += 2
        hardware_pref = "prefer_quantum_annealing" if hardware_pref == "auto" else hardware_pref
        extracted_keywords.append("quantum_annealing")

    if KEYWORD_PATTERNS["quantum_general"].search(text):
        quantum_hits += 1
        extracted_keywords.append("quantum_inspired")

    if KEYWORD_PATTERNS["green"].search(text):
        target_obj = "green_fleet"
        extracted_keywords.append("green_emissions")

    if KEYWORD_PATTERNS["congestion"].search(text) and target_obj != "time_critical":
        target_obj = "congestion_avoidance"
        extracted_keywords.append("congestion_avoidance")

    if KEYWORD_PATTERNS["exact_optimal"].search(text):
        hardware_pref = "prefer_classical_exact" if hardware_pref == "auto" else hardware_pref
        extracted_keywords.append("exact_optimal")

    # 3. Compute factor weights based on objective
    if target_obj == "time_critical":
        raw_w = {"time": 0.65, "dist": 0.10, "cong": 0.20, "emiss": 0.05}
    elif target_obj == "congestion_avoidance":
        raw_w = {"time": 0.25, "dist": 0.15, "cong": 0.50, "emiss": 0.10}
    elif target_obj == "green_fleet":
        raw_w = {"time": 0.15, "dist": 0.35, "cong": 0.15, "emiss": 0.35}
    elif target_obj == "distance_minimal":
        raw_w = {"time": 0.15, "dist": 0.65, "cong": 0.10, "emiss": 0.10}
    else:  # balanced
        raw_w = {"time": 0.35, "dist": 0.25, "cong": 0.25, "emiss": 0.15}

    # Normalize weights so sum == 1.0
    total_w = sum(raw_w.values())
    normalized_weights = {k: round(v / total_w, 4) for k, v in raw_w.items()}

    # Compute sensitivities
    time_sens = normalized_weights["time"] * 1.5
    dist_sens = normalized_weights["dist"] * 1.5
    cong_sens = normalized_weights["cong"] * 1.5
    emiss_sens = normalized_weights["emiss"] * 1.5

    quantum_affinity = min(1.0, 0.25 * quantum_hits)
    if "prefer_qaoa" in hardware_pref or "prefer_quantum_annealing" in hardware_pref:
        quantum_affinity = max(quantum_affinity, 0.85)
    elif "prefer_qpso" in hardware_pref:
        quantum_affinity = max(quantum_affinity, 0.70)

    # Confidence score based on signal strength
    confidence = 0.85
    if text:
        confidence = min(0.98, 0.85 + (len(extracted_keywords) * 0.03))

    return ScenarioFeatures(
        raw_prompt=text,
        urgency=urgency,
        target_objective=target_obj,
        latency_budget=latency_budget,
        hardware_preference=hardware_pref,
        quantum_affinity=round(quantum_affinity, 2),
        congestion_sensitivity=round(min(1.0, cong_sens), 2),
        emissions_sensitivity=round(min(1.0, emiss_sens), 2),
        time_sensitivity=round(min(1.0, time_sens), 2),
        distance_sensitivity=round(min(1.0, dist_sens), 2),
        weights=normalized_weights,
        extracted_keywords=extracted_keywords,
        confidence=round(confidence, 2),
    )
