"""
Q-Commute — Central Configuration
All constants, weights, and location definitions live here.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

# ---------------------------------------------------------------------------
# Location Dataset — 10 verified anchors near Connaught Place, New Delhi
# ---------------------------------------------------------------------------

@dataclass
class Location:
    id: str
    name: str
    lat: float
    lon: float

LOCATIONS: List[Location] = [
    Location("connaught_place",      "Connaught Place — Central Park",  28.6329, 77.2195),
    Location("india_gate",           "India Gate",                       28.6129, 77.2295),
    Location("jantar_mantar",        "Jantar Mantar",                    28.6270, 77.2166),
    Location("new_delhi_railway",    "New Delhi Railway Station",        28.6419, 77.2197),
    Location("rajiv_chowk_metro",   "Rajiv Chowk Metro Station",        28.6328, 77.2197),
    Location("barakhamba_road",      "Barakhamba Road",                  28.6313, 77.2279),
    Location("mandi_house",          "Mandi House",                      28.6236, 77.2337),
    Location("khan_market",          "Khan Market",                      28.6004, 77.2270),
    Location("national_museum",      "National Museum",                  28.6117, 77.2197),
    Location("gole_market",          "Gole Market",                      28.6378, 77.2046),
]

LOCATION_MAP: Dict[str, Location] = {loc.id: loc for loc in LOCATIONS}

# ---------------------------------------------------------------------------
# Graph Download Parameters
# ---------------------------------------------------------------------------

# Centre of the bounding box that covers all 10 locations
GRAPH_CENTRE_LAT = 0.5 * (28.6004 + 28.6419)   # ≈ 28.6212
GRAPH_CENTRE_LON = 0.5 * (77.2046 + 77.2337)   # ≈ 77.2192

# Radius large enough to cover all locations with margin (metres)
GRAPH_RADIUS_M = 4_000

# NetworkType: drive gives the road network used by cars/auto-rickshaws
GRAPH_NETWORK_TYPE = "drive"

# Cache file — stored in backend/data/ so demo works offline
GRAPH_CACHE_PATH = "backend/data/newdelhi_drive.graphml"

# ---------------------------------------------------------------------------
# Objective Function Weights
# ---------------------------------------------------------------------------
# Cost = WT * norm_travel_time + WD * norm_distance + WC * norm_congestion
# Weights must sum to 1 (or they are normalised internally)

WEIGHT_TIME: float       = 0.50
WEIGHT_DISTANCE: float   = 0.30
WEIGHT_CONGESTION: float = 0.20

# ---------------------------------------------------------------------------
# Default Speeds (km/h) by OSM highway type — used when maxspeed is missing
# ---------------------------------------------------------------------------

DEFAULT_SPEEDS: Dict[str, float] = {
    "motorway":       90.0,
    "trunk":          70.0,
    "primary":        50.0,
    "secondary":      40.0,
    "tertiary":       30.0,
    "residential":    20.0,
    "unclassified":   25.0,
    "service":        15.0,
    "living_street":  10.0,
    "pedestrian":      5.0,
    "road":           25.0,
}
DEFAULT_SPEED_FALLBACK: float = 25.0   # km/h

# ---------------------------------------------------------------------------
# Traffic Simulation Parameters
# ---------------------------------------------------------------------------

# Severity multipliers applied to edge travel_time
TRAFFIC_SEVERITY: Dict[str, float] = {
    "mild":     3.0,
    "moderate": 6.0,
    "severe":   12.0,
}

# Congestion penalty added on top of base travel_time (fraction of travel_time)
CONGESTION_PENALTY_FACTOR: Dict[str, float] = {
    "mild":     0.5,
    "moderate": 1.0,
    "severe":   2.0,
}

# ---------------------------------------------------------------------------
# QPSO Hyperparameters
# ---------------------------------------------------------------------------

QPSO_POPULATION:    int   = 30
QPSO_ITERATIONS:    int   = 80
QPSO_BETA_MAX:      float = 0.90   # contraction factor at start (exploration)
QPSO_BETA_MIN:      float = 0.40   # contraction factor at end (exploitation)
QPSO_TUNNEL_PROB:   float = 0.10   # probability of quantum tunnelling jump
QPSO_RANDOM_SEED:   int   = 42
QPSO_MAX_PATH_MULT: int   = 5      # reject paths longer than this × Dijkstra path
