"""
Traffic Router — POST /traffic/simulate
"""
from __future__ import annotations

import logging
from typing import Literal, Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.graph.state import graph_state
from backend.simulation.traffic import choose_traffic_edge, build_traffic_summary

log = logging.getLogger(__name__)
router = APIRouter(prefix="/traffic", tags=["traffic"])


class SimulateRequest(BaseModel):
    event_type:    Literal["congestion", "slowdown", "closure"] = "congestion"
    severity:      Literal["mild", "moderate", "severe"] = "moderate"
    source_id:     str          # used to identify the current route edges
    destination_id: str
    current_route: Optional[List[int]] = None   # node IDs of current route


class SimulateResponse(BaseModel):
    success:              bool
    event_type:           str
    severity:             str
    affected_edge:        Optional[List[int]] = None  # [u, v, k]
    affected_coordinates: Optional[List[List[float]]] = None
    road_name:            Optional[str] = None
    message:              str
    traffic_state:        List[dict]


class ResetResponse(BaseModel):
    success: bool
    message: str


@router.post("/simulate", response_model=SimulateResponse)
async def simulate_traffic(req: SimulateRequest) -> SimulateResponse:
    """
    Apply a traffic event to the road network.

    Chooses an edge from the current_route (if provided) that has a
    feasible alternate path.  Applies the event to the GraphState overlay.
    """
    if not graph_state._initialized:
        raise HTTPException(503, "Graph not yet initialized.")

    from backend.config import LOCATION_MAP
    if req.source_id not in LOCATION_MAP or req.destination_id not in LOCATION_MAP:
        raise HTTPException(400, "Unknown source_id or destination_id.")

    try:
        src = graph_state.get_node(req.source_id)
        dst = graph_state.get_node(req.destination_id)
        G   = graph_state.G

        # Determine which edge to affect
        edge_key = None
        if req.current_route and len(req.current_route) >= 2:
            edge_key = choose_traffic_edge(
                G, req.current_route, src, dst, graph_state.traffic_overlay
            )

        if edge_key is None:
            # Fallback: pick any interior edge on the Dijkstra path
            import networkx as nx
            try:
                fallback_path = nx.shortest_path(G, src, dst, weight="length")
                edge_key = choose_traffic_edge(
                    G, fallback_path, src, dst, graph_state.traffic_overlay
                )
            except Exception:
                pass

        if edge_key is None:
            return SimulateResponse(
                success       = False,
                event_type    = req.event_type,
                severity      = req.severity,
                affected_edge = None,
                road_name     = None,
                message       = "No suitable edge found for traffic event. All edges already affected or no alternate path.",
                traffic_state = build_traffic_summary(G, graph_state.traffic_overlay),
            )

        u, v, k = edge_key
        entry = graph_state.apply_traffic_event(req.event_type, u, v, k, req.severity)

        # Get road name for display
        edge_data = G[u][v][k] if G.has_edge(u, v) else {}
        name = edge_data.get("name", f"Road segment {u}→{v}")
        if isinstance(name, list):
            name = name[0]

        msg = {
            "congestion": f"Heavy congestion applied to '{name}' (×{entry.get('time_multiplier', 1):.1f} travel time).",
            "slowdown":   f"Slowdown applied to '{name}'.",
            "closure":    f"'{name}' is now closed to traffic.",
        }.get(req.event_type, "Traffic event applied.")

        # Get coordinates of affected edge endpoints
        u_lat, u_lon = float(G.nodes[u]["y"]), float(G.nodes[u]["x"])
        v_lat, v_lon = float(G.nodes[v]["y"]), float(G.nodes[v]["x"])
        affected_coords = [[u_lat, u_lon], [v_lat, v_lon]]

        try:
            from backend.db.database import save_traffic_event
            save_traffic_event(
                req.event_type, req.severity, str(name),
                u, v, k, entry.get("time_multiplier", 1.0)
            )
        except Exception as e:
            log.warning("Could not persist traffic event: %s", e)

        return SimulateResponse(
            success              = True,
            event_type           = req.event_type,
            severity             = req.severity,
            affected_edge        = [u, v, k],
            affected_coordinates = affected_coords,
            road_name            = str(name),
            message              = msg,
            traffic_state        = build_traffic_summary(G, graph_state.traffic_overlay),
        )

    except Exception as e:
        log.exception("Error in /traffic/simulate")
        raise HTTPException(500, f"Traffic simulation failed: {e}")


@router.post("/reset", response_model=ResetResponse)
async def reset_traffic() -> ResetResponse:
    """Remove all traffic events and restore free-flow conditions."""
    graph_state.reset_traffic()
    return ResetResponse(success=True, message="Traffic overlay cleared. Free-flow conditions restored.")
