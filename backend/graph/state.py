"""
Graph State — singleton that holds the live graph, traffic overlay,
reference weights, and normalization constants.

The GraphState object is created once at startup and shared across
all request handlers via FastAPI dependency injection.

Design principles:
  * The underlying NetworkX MultiDiGraph is NEVER mutated by traffic events.
  * All traffic modifications live in the `traffic_overlay` dict.
  * Cost functions read the overlay at query time.
  * reset() restores the overlay to an empty dict.
"""
from __future__ import annotations

import copy
import logging
import math
from typing import Dict, List, Optional, Tuple

import networkx as nx
import numpy as np

from backend.config import (
    WEIGHT_TIME, WEIGHT_DISTANCE, WEIGHT_CONGESTION,
    LOCATIONS, LOCATION_MAP,
)
from backend.graph.loader import load_graph
from backend.graph.snapper import snap_to_node

log = logging.getLogger(__name__)

# Edge key in overlay dict: (u, v, k)
EdgeKey = Tuple[int, int, int]


class GraphState:
    """
    Manages the road graph and traffic overlay for the demo session.
    """

    def __init__(self) -> None:
        self.G: nx.MultiDiGraph = None          # base graph (never mutated)
        self.traffic_overlay: Dict[EdgeKey, dict] = {}   # live traffic state
        self._node_cache: Dict[str, int] = {}   # location_id → nearest node
        self._ref: dict = {}                     # normalization refs (T_ref, D_ref, C_ref)
        self._initialized = False

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    def initialize(self, force_download: bool = False) -> None:
        """Load graph, snap all locations, compute normalization refs."""
        if self._initialized:
            return
        self.G = load_graph(force_download=force_download)
        self._snap_all_locations()
        self._compute_refs()
        self._initialized = True
        log.info("GraphState initialized. Nodes=%d Edges=%d",
                 self.G.number_of_nodes(), self.G.number_of_edges())

    def _snap_all_locations(self) -> None:
        """Pre-snap every location to its nearest graph node."""
        for loc in LOCATIONS:
            node_id = snap_to_node(self.G, loc.lat, loc.lon)
            self._node_cache[loc.id] = node_id
            log.info("Snapped %s → node %d", loc.name, node_id)

    def _compute_refs(self) -> None:
        """
        Compute normalization reference values from graph edge statistics.

        T_ref = 75th-percentile edge travel_time (seconds)
        D_ref = 75th-percentile edge length (metres)
        C_ref = 1.0 (max possible congestion penalty scale)
        """
        times  = [d.get("travel_time", 1.0)
                  for _, _, d in self.G.edges(data=True)]
        dists  = [d.get("length", 1.0)
                  for _, _, d in self.G.edges(data=True)]
        self._ref = {
            "T_ref": float(np.percentile(times, 75)),
            "D_ref": float(np.percentile(dists, 75)),
            "C_ref": 1.0,
        }
        log.info("Normalization refs: %s", self._ref)

    # ------------------------------------------------------------------
    # Node snapping
    # ------------------------------------------------------------------

    def get_node(self, location_id: str) -> int:
        """Return the graph node nearest to a predefined location."""
        if not self._initialized:
            raise RuntimeError("GraphState not initialized")
        if location_id not in self._node_cache:
            raise KeyError(f"Unknown location: {location_id}")
        return self._node_cache[location_id]

    def snap_coords(self, lat: float, lon: float) -> int:
        """Snap arbitrary coordinates to nearest graph node."""
        return snap_to_node(self.G, lat, lon)

    # ------------------------------------------------------------------
    # Edge cost (traffic-aware)
    # ------------------------------------------------------------------

    def edge_cost(self, u: int, v: int, k: int, data: dict) -> float:
        """
        Compute the objective cost for a single edge under current traffic.

        Cost = WT * (travel_time / T_ref)
             + WD * (length / D_ref)
             + WC * (congestion_penalty / C_ref)
        """
        overlay = self.traffic_overlay.get((u, v, k), {})
        if overlay.get("closed", False):
            return math.inf

        base_tt  = data.get("travel_time", 1.0)
        length   = data.get("length", 1.0)
        cong     = data.get("congestion", 0.0)

        # Apply traffic modifiers from overlay
        tt_mult   = overlay.get("time_multiplier", 1.0)
        cong_add  = overlay.get("congestion_add", 0.0)

        travel_time = base_tt * tt_mult
        congestion  = min(1.0, cong + cong_add)

        T_ref = self._ref.get("T_ref", 60.0)
        D_ref = self._ref.get("D_ref", 200.0)
        C_ref = self._ref.get("C_ref", 1.0)

        cost = (
            WEIGHT_TIME       * (travel_time / T_ref)
            + WEIGHT_DISTANCE * (length / D_ref)
            + WEIGHT_CONGESTION * (congestion / C_ref)
        )
        return cost

    def path_metrics(self, path: List[int]) -> dict:
        """
        Compute aggregate metrics for a node-sequence path.

        Returns:
          distance_m, travel_time_s, congestion_cost, total_cost, valid
        """
        if len(path) < 2:
            return {"valid": False, "error": "Path too short"}

        total_dist  = 0.0
        total_tt    = 0.0
        total_cong  = 0.0
        total_cost  = 0.0

        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            if not self.G.has_node(u) or not self.G.has_node(v):
                return {"valid": False, "error": f"Invalid node {u} or {v}"}
            if not self.G.has_edge(u, v):
                return {"valid": False, "error": f"No edge {u}→{v}"}

            # Use the cheapest parallel edge (key=0 in most OSM graphs)
            edges = self.G[u][v]
            k = min(edges.keys(), key=lambda k: self.edge_cost(u, v, k, edges[k]))
            data = edges[k]

            overlay   = self.traffic_overlay.get((u, v, k), {})
            tt_mult   = overlay.get("time_multiplier", 1.0)
            cong_add  = overlay.get("congestion_add", 0.0)

            edge_dist = data.get("length", 0.0)
            edge_tt   = data.get("travel_time", 0.0) * tt_mult
            edge_cong = min(1.0, data.get("congestion", 0.0) + cong_add)
            edge_cost = self.edge_cost(u, v, k, data)

            if math.isinf(edge_cost):
                return {"valid": False, "error": f"Edge {u}→{v} is closed"}

            total_dist  += edge_dist
            total_tt    += edge_tt
            total_cong  += edge_cong
            total_cost  += edge_cost

        return {
            "valid":           True,
            "distance_m":      round(total_dist, 2),
            "travel_time_s":   round(total_tt, 2),
            "congestion_cost": round(total_cong, 4),
            "total_cost":      round(total_cost, 6),
        }

    # ------------------------------------------------------------------
    # Traffic overlay management
    # ------------------------------------------------------------------

    def apply_traffic_event(
        self,
        event_type: str,           # "congestion" | "slowdown" | "closure"
        u: int,
        v: int,
        k: int = 0,
        severity: str = "moderate",
    ) -> dict:
        """
        Apply a traffic event to a specific edge.
        Returns the overlay entry that was applied.
        """
        from backend.config import TRAFFIC_SEVERITY, CONGESTION_PENALTY_FACTOR

        if not self.G.has_edge(u, v):
            raise ValueError(f"Edge ({u},{v}) does not exist in graph")

        if event_type == "closure":
            entry = {"closed": True, "event_type": "closure", "severity": severity}
        elif event_type == "congestion":
            entry = {
                "closed":          False,
                "event_type":      "congestion",
                "severity":        severity,
                "time_multiplier": TRAFFIC_SEVERITY.get(severity, 2.5),
                "congestion_add":  CONGESTION_PENALTY_FACTOR.get(severity, 0.5),
            }
        elif event_type == "slowdown":
            entry = {
                "closed":          False,
                "event_type":      "slowdown",
                "severity":        severity,
                "time_multiplier": TRAFFIC_SEVERITY.get(severity, 1.5) * 0.6 + 1,
                "congestion_add":  CONGESTION_PENALTY_FACTOR.get(severity, 0.2) * 0.4,
            }
        else:
            raise ValueError(f"Unknown event type: {event_type}")

        self.traffic_overlay[(u, v, k)] = entry
        # For undirected-style streets also apply reverse edge if it exists
        if self.G.has_edge(v, u):
            self.traffic_overlay[(v, u, k)] = entry.copy()

        log.info("Traffic event applied: %s on edge (%d,%d,%d)", event_type, u, v, k)
        return entry

    def reset_traffic(self) -> None:
        """Remove all traffic events, restoring free-flow conditions."""
        self.traffic_overlay.clear()
        log.info("Traffic overlay reset")

    # ------------------------------------------------------------------
    # Graph info
    # ------------------------------------------------------------------

    def status(self) -> dict:
        if not self._initialized:
            return {"initialized": False}
        return {
            "initialized":    True,
            "nodes":          self.G.number_of_nodes(),
            "edges":          self.G.number_of_edges(),
            "traffic_events": len(self.traffic_overlay),
            "normalization_refs": self._ref,
            "locations":      [
                {
                    "id":   loc.id,
                    "name": loc.name,
                    "lat":  loc.lat,
                    "lon":  loc.lon,
                    "node": self._node_cache.get(loc.id),
                }
                for loc in LOCATIONS
            ],
        }


# ---------------------------------------------------------------------------
# Module-level singleton — imported by FastAPI app
# ---------------------------------------------------------------------------
graph_state = GraphState()
