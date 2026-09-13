"""
Coordinate-to-Node Snapper

Finds the nearest graph node to a (lat, lon) coordinate.
Uses osmnx.nearest_nodes when the graph has CRS metadata (real OSM graph),
falls back to pure Haversine distance otherwise (synthetic test graphs).
"""
from __future__ import annotations

import logging
import math
from typing import Tuple

import networkx as nx

log = logging.getLogger(__name__)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine great-circle distance in metres."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi  = math.radians(lat2 - lat1)
    dlam  = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _snap_haversine(G: nx.MultiDiGraph, lat: float, lon: float) -> int:
    """Find nearest node by Haversine distance — works on any graph with x/y attrs."""
    best_node, best_dist = None, math.inf
    for node, data in G.nodes(data=True):
        node_lat = data.get("y")
        node_lon = data.get("x")
        if node_lat is None or node_lon is None:
            continue
        d = _haversine_m(lat, lon, node_lat, node_lon)
        if d < best_dist:
            best_dist, best_node = d, node
    if best_node is None:
        raise ValueError("Graph has no nodes with valid x/y coordinates")
    return int(best_node)


def snap_to_node(G: nx.MultiDiGraph, lat: float, lon: float) -> int:
    """
    Return the graph node ID nearest to (lat, lon).

    For OSM-downloaded graphs (with G.graph["crs"]), uses osmnx.nearest_nodes
    which leverages a spatial index for speed.

    For synthetic/test graphs without CRS metadata, falls back to brute-force
    Haversine distance (still correct, just slower at large scale).

    Args:
        G:   The road network MultiDiGraph (nodes must have x and y attrs).
        lat: Latitude in WGS-84.
        lon: Longitude in WGS-84.

    Returns:
        Integer node ID.

    Raises:
        ValueError: If the graph has no nodes with valid coordinates.
    """
    if G.number_of_nodes() == 0:
        raise ValueError("Graph has no nodes")

    if "crs" in G.graph:
        # Real OSMnx graph — use fast spatial index
        import osmnx as ox
        node_id = ox.nearest_nodes(G, X=lon, Y=lat)
        log.debug("Snapped (%.5f, %.5f) -> node %d (osmnx)", lat, lon, node_id)
        return int(node_id)
    else:
        # Synthetic/test graph — use brute-force Haversine
        node_id = _snap_haversine(G, lat, lon)
        log.debug("Snapped (%.5f, %.5f) -> node %d (haversine)", lat, lon, node_id)
        return node_id


def node_coords(G: nx.MultiDiGraph, node_id: int) -> Tuple[float, float]:
    """Return (lat, lon) of a graph node."""
    data = G.nodes[node_id]
    return float(data["y"]), float(data["x"])


def path_coords(G: nx.MultiDiGraph, path: list) -> list:
    """Convert a list of node IDs to a list of [lat, lon] pairs for Leaflet."""
    return [[G.nodes[n]["y"], G.nodes[n]["x"]] for n in path]
