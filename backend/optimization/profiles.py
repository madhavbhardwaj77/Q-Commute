"""
Optimization Profiles

Defines named multi-objective weight presets and profile-specific constraints
(e.g., delivery, emergency, VIP, custom).
"""
from __future__ import annotations

from typing import Any, Dict, Optional

# Named objective weight presets: (time, distance, congestion)
PROFILES: Dict[str, Dict[str, float]] = {
    "delivery": {
        "time": 0.2,
        "distance": 0.6,
        "congestion": 0.2,
    },
    "emergency": {
        "time": 0.8,
        "distance": 0.1,
        "congestion": 0.1,
    },
    "vip": {
        "time": 0.2,
        "distance": 0.2,
        "congestion": 0.6,
    },
}

# Congestion threshold above which an emergency route triggers a hard constraint violation
EMERGENCY_MAX_CONGESTION_THRESHOLD: float = 0.5


def resolve_profile_weights(
    profile: Optional[str] = "custom",
    custom_weights: Optional[Dict[str, float]] = None,
) -> Dict[str, float]:
    """
    Resolve profile name to normalized objective weights and profile metadata.

    Args:
        profile: Profile name ("delivery", "emergency", "vip", "custom").
        custom_weights: User-supplied weights dictionary when profile is "custom".

    Returns:
        Dict with "time", "distance", "congestion", and metadata keys.
    """
    p_name = (profile or "custom").lower().strip()

    if p_name in PROFILES:
        weights = dict(PROFILES[p_name])
    elif custom_weights and any(k in custom_weights for k in ("time", "distance", "congestion", "weight_time")):
        weights = {
            "time": float(custom_weights.get("time", custom_weights.get("weight_time", 0.5))),
            "distance": float(custom_weights.get("distance", custom_weights.get("weight_dist", 0.3))),
            "congestion": float(custom_weights.get("congestion", custom_weights.get("weight_cong", 0.2))),
        }
        if "T_ref" in custom_weights:
            weights["T_ref"] = float(custom_weights["T_ref"])
        if "D_ref" in custom_weights:
            weights["D_ref"] = float(custom_weights["D_ref"])
        if "C_ref" in custom_weights:
            weights["C_ref"] = float(custom_weights["C_ref"])
    else:
        # Default balanced weights
        weights = {"time": 0.5, "distance": 0.3, "congestion": 0.2}

    weights["profile"] = p_name
    if p_name == "emergency":
        weights["emergency_max_congestion"] = EMERGENCY_MAX_CONGESTION_THRESHOLD

    return weights
