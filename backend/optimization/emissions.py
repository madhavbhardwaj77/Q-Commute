"""
Cost and Environmental Emissions Estimator for Fleet Logistics

Calculates fuel expenditure and carbon dioxide emissions based on distance traversed,
vehicle fuel economy, and standard greenhouse gas emission factors.
"""
from __future__ import annotations

from typing import Dict

# Default configuration parameters (configurable)
DEFAULT_COST_PER_KM = 8.50          # INR per km (standard delivery van / diesel)
DEFAULT_CO2_PER_KM = 0.210          # kg CO2 per km (Euro 6 / BS-VI light commercial vehicle)


def compute_fuel_cost(distance_m: float, cost_per_km: float = DEFAULT_COST_PER_KM) -> float:
    """
    Compute estimated fuel expenditure.
    Distances > 50 are assumed to be in metres and converted to km.
    """
    dist_km = distance_m / 1000.0 if distance_m > 50.0 else distance_m
    rate = cost_per_km if (cost_per_km is not None and cost_per_km > 0) else DEFAULT_COST_PER_KM
    return round(float(dist_km * rate), 2)


def compute_co2_emissions(distance_m: float, emissions_kg_per_km: float = DEFAULT_CO2_PER_KM) -> float:
    """
    Compute estimated CO2 emissions in kilograms.
    Distances > 50 are assumed to be in metres and converted to km.
    """
    dist_km = distance_m / 1000.0 if distance_m > 50.0 else distance_m
    factor = (
        emissions_kg_per_km
        if (emissions_kg_per_km is not None and emissions_kg_per_km > 0)
        else DEFAULT_CO2_PER_KM
    )
    return round(float(dist_km * factor), 3)


def compute_sustainability_metrics(
    distance_m: float,
    cost_per_km: float = DEFAULT_COST_PER_KM,
    emissions_kg_per_km: float = DEFAULT_CO2_PER_KM,
) -> Dict[str, float]:
    """
    Compute combined sustainability and operational cost summary.

    Returns:
        Dictionary with distance_km, estimated_fuel_cost, and estimated_co2_kg.
    """
    dist_km = distance_m / 1000.0 if distance_m > 50.0 else distance_m
    rate = cost_per_km if (cost_per_km is not None and cost_per_km > 0) else DEFAULT_COST_PER_KM
    factor = (
        emissions_kg_per_km
        if (emissions_kg_per_km is not None and emissions_kg_per_km > 0)
        else DEFAULT_CO2_PER_KM
    )
    return {
        "distance_km": round(float(dist_km), 2),
        "estimated_fuel_cost": round(float(dist_km * rate), 2),
        "estimated_co2_kg": round(float(dist_km * factor), 3),
    }
