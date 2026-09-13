"""
Traffic Simulation Module

Handles deterministic, local traffic events for the demo.

Event types:
    congestion  — heavy congestion, large travel-time multiplier
    slowdown    — moderate slowdown (construction, incident)
    closure     — edge completely closed (road blocked)

The module works with GraphState's traffic_overlay dict.
It also provides helpers for selecting a sensible edge to affect
from the current route (one that has a feasible alternative path).
"""
from __future__ import annotations

import logging
import math
import random
from typing import Dict, List, Optional, Tuple

import networkx as nx

from backend.config import TRAFFIC_SEVERITY, CONGESTION_PENALTY_FACTOR

log = logging.getLogger(__name__)


def _has_alternate_path(
    G: nx.MultiDiGraph,
    src: int,
    dst: int,
    exclude_edge: Tuple[int, int],
) -> bool:
    """
    Check whether there is still a path from src to dst after removing
    the given directed edge (u, v).

    Uses a lightweight BFS/DFS check on a view of the graph.
    """
    u_ex, v_ex = exclude_edge
    # Create a view that excludes the edge
    def filter_edge(u, v, k):
        return not (u == u_ex and v == v_ex)

    H = nx.subgraph_view(G, filter_edge=filter_edge)
    return nx.has_path(H, src, dst)


def choose_traffic_edge(
    G: nx.MultiDiGraph,
    path: List[int],
    src: int,
    dst: int,
    traffic_overlay: dict,
) -> Optional[Tuple[int, int, int]]:
    """
    Choose an edge from the current route to apply a traffic event to.

    Selection criteria:
    1. Not already congested or closed.
    2. An alternate path from src to dst still exists without this edge.
    3. Prefer edges that are not adjacent to src or dst (more dramatic reroute).
    4. Prefer longer edges (more visible on map).

    Returns (u, v, k) or None if no suitable edge found.
    """
    if len(path) < 3:
        return None

    candidates = []
    # Skip first and last edges (too close to endpoints)
    interior_pairs = list(zip(path[1:-2], path[2:-1]))

    for u, v in interior_pairs:
        if not G.has_edge(u, v):
            continue
        k = 0       # default key
        if (u, v, k) in traffic_overlay:
            continue    # already has an event
        # Check alternate path exists
        if not _has_alternate_path(G, src, dst, (u, v)):
            continue
        # Score by edge length (longer = more visible)
        edge_data = G[u][v][k]
        length = edge_data.get("length", 0.0)
        candidates.append((length, u, v, k))

    if not candidates:
        # Relax: allow edges adjacent to endpoints
        for u, v in zip(path[:-1], path[1:]):
            if not G.has_edge(u, v):
                continue
            k = 0
            if (u, v, k) in traffic_overlay:
                continue
            if not _has_alternate_path(G, src, dst, (u, v)):
                continue
            edge_data = G[u][v][k]
            length = edge_data.get("length", 0.0)
            candidates.append((length, u, v, k))

    if not candidates:
        return None

    # Pick the longest eligible edge
    candidates.sort(key=lambda x: x[0], reverse=True)
    _, u, v, k = candidates[0]
    return (u, v, k)


def build_traffic_summary(
    G: nx.MultiDiGraph,
    overlay: dict,
) -> List[dict]:
    """
    Return a human-readable summary of all active traffic events.
    """
    summary = []
    for (u, v, k), event in overlay.items():
        edge_data = G[u][v][k] if G.has_edge(u, v) else {}
        name = edge_data.get("name", f"Edge {u}→{v}")
        if isinstance(name, list):
            name = name[0]
        summary.append({
            "edge":       (u, v, k),
            "road_name":  name,
            "event_type": event.get("event_type", "unknown"),
            "severity":   event.get("severity", "unknown"),
            "closed":     event.get("closed", False),
            "time_multiplier": event.get("time_multiplier", 1.0),
        })
    return summary
