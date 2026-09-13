"""
Network status and locations router.
Upgraded for SIH 2026: adds /network/graph-metrics endpoint.
"""
from __future__ import annotations

import logging
import math
import statistics
from typing import Dict, List, Optional

import networkx as nx
from fastapi import APIRouter, HTTPException

from backend.graph.state import graph_state
from backend.config import LOCATIONS

log = logging.getLogger(__name__)
router = APIRouter(prefix="/network", tags=["network"])


@router.get("/locations")
async def get_locations():
    """Return the list of predefined landmark locations."""
    return [
        {
            "id":   loc.id,
            "name": loc.name,
            "lat":  loc.lat,
            "lon":  loc.lon,
        }
        for loc in LOCATIONS
    ]


@router.get("/status")
async def get_status():
    """Return current graph load status."""
    G = graph_state.G
    return {
        "initialized": graph_state._initialized,
        "nodes":       G.number_of_nodes() if G else 0,
        "edges":       G.number_of_edges() if G else 0,
        "traffic_events": len(graph_state.traffic_overlay),
    }


@router.get("/graph-metrics")
async def get_graph_metrics():
    """
    Return advanced graph-theoretic metrics for the SIH mathematical formulation panel.
    Deliverable #1: Graph-Based Network Model key metrics.
    """
    if not graph_state._initialized:
        raise HTTPException(503, "Graph not yet initialized.")

    G = graph_state.G
    n_nodes = G.number_of_nodes()
    n_edges = G.number_of_edges()

    # Degree statistics
    in_degrees  = [d for _, d in G.in_degree()]
    out_degrees = [d for _, d in G.out_degree()]
    avg_degree  = (sum(in_degrees) + sum(out_degrees)) / (2 * n_nodes) if n_nodes > 0 else 0

    # Density
    density = nx.density(G)

    # Strongly connected components
    scc_count = nx.number_strongly_connected_components(G)
    largest_scc = max((len(c) for c in nx.strongly_connected_components(G)), default=0)

    # Edge weight stats
    lengths = [data.get("length", 0) for _, _, data in G.edges(data=True)]
    avg_len = sum(lengths) / len(lengths) if lengths else 0
    max_len = max(lengths) if lengths else 0

    # Travel time stats
    times = [data.get("travel_time", 0) for _, _, data in G.edges(data=True)]
    avg_time = sum(times) / len(times) if times else 0

    # Speed stats
    speeds = [data.get("speed_kph", 0) for _, _, data in G.edges(data=True)]
    avg_speed = sum(speeds) / len(speeds) if speeds else 0

    return {
        "nodes": n_nodes,
        "edges": n_edges,
        "density": round(density, 6),
        "avg_degree": round(avg_degree, 2),
        "max_in_degree": max(in_degrees) if in_degrees else 0,
        "max_out_degree": max(out_degrees) if out_degrees else 0,
        "strongly_connected_components": scc_count,
        "largest_scc_nodes": largest_scc,
        "avg_edge_length_m": round(avg_len, 1),
        "max_edge_length_m": round(max_len, 1),
        "avg_travel_time_s": round(avg_time, 2),
        "avg_speed_kph": round(avg_speed, 1),
        "traffic_events_active": len(graph_state.traffic_overlay),
        "graph_type": "MultiDiGraph (Directed, Weighted)",
        "coordinate_system": "WGS-84 (EPSG:4326)",
        "coverage_area": "New Delhi — Connaught Place (4km radius)",
    }
