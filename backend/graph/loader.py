"""
Graph Loader — Downloads and caches the OSM road network for the demo area.

Uses osmnx to fetch the drive network within GRAPH_RADIUS_M of the
centre of our 10 predefined locations.  The graph is cached as .graphml
so the demo works completely offline after the first download.
"""
from __future__ import annotations

import logging
import math
import os
from pathlib import Path
from typing import Optional

import networkx as nx
import osmnx as ox

from backend.config import (
    GRAPH_CACHE_PATH,
    GRAPH_CENTRE_LAT,
    GRAPH_CENTRE_LON,
    GRAPH_RADIUS_M,
    GRAPH_NETWORK_TYPE,
    DEFAULT_SPEEDS,
    DEFAULT_SPEED_FALLBACK,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Speed / travel-time helpers
# ---------------------------------------------------------------------------

def _parse_speed(val) -> Optional[float]:
    """Parse maxspeed value from OSM (string, list, or number) → km/h float."""
    if val is None:
        return None
    if isinstance(val, list):
        val = val[0]
    try:
        return float(str(val).split()[0])
    except (ValueError, IndexError):
        return None


def _add_speeds_and_times(G: nx.MultiDiGraph) -> nx.MultiDiGraph:
    """
    Add `speed_kph`, `travel_time` (seconds), and `congestion` (0.0)
    to every edge.  Falls back to highway-type defaults when maxspeed
    is absent.
    """
    for u, v, k, data in G.edges(data=True, keys=True):
        # -- speed_kph
        speed = _parse_speed(data.get("maxspeed"))
        if speed is None:
            hw = data.get("highway", "road")
            if isinstance(hw, list):
                hw = hw[0]
            speed = DEFAULT_SPEEDS.get(hw, DEFAULT_SPEED_FALLBACK)
        data["speed_kph"] = speed

        # -- travel_time (seconds)
        length_m = data.get("length", 1.0)
        speed_ms = speed * 1000.0 / 3600.0
        data["travel_time"] = length_m / speed_ms

        # -- congestion level (0 = free-flow, 1 = max congestion)
        data["congestion"] = 0.0

    return G


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_graph(force_download: bool = False) -> nx.MultiDiGraph:
    """
    Return the road network MultiDiGraph.

    1. If the .graphml cache exists (and force_download is False), load it.
    2. Otherwise download from OSM and save the cache.

    After loading, edge attributes speed_kph, travel_time, and congestion
    are guaranteed to exist on every edge.
    """
    cache = Path(GRAPH_CACHE_PATH)

    if cache.exists() and not force_download:
        log.info("Loading road graph from cache: %s", cache)
        G = ox.load_graphml(cache)
        # Ensure our custom attributes are present (may be missing from old cache)
        G = _add_speeds_and_times(G)
        log.info("Graph loaded: %d nodes, %d edges", G.number_of_nodes(), G.number_of_edges())
        return G

    log.info(
        "Downloading road graph (centre=%.4f,%.4f radius=%dm)…",
        GRAPH_CENTRE_LAT, GRAPH_CENTRE_LON, GRAPH_RADIUS_M,
    )
    G = ox.graph_from_point(
        (GRAPH_CENTRE_LAT, GRAPH_CENTRE_LON),
        dist=GRAPH_RADIUS_M,
        network_type=GRAPH_NETWORK_TYPE,
        simplify=True,
    )
    # Graph is already in WGS-84 (lat/lon) — no reprojection needed
    G = _add_speeds_and_times(G)

    cache.parent.mkdir(parents=True, exist_ok=True)
    ox.save_graphml(G, filepath=str(cache))
    log.info("Graph cached to %s (%d nodes, %d edges)", cache, G.number_of_nodes(), G.number_of_edges())
    return G
