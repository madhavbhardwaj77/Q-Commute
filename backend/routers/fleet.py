"""
Fleet Router — POST /fleet/optimize

Multi-vehicle Vehicle Routing Problem (VRP) optimization endpoint.
Uses Quantum-Inspired Particle Swarm Optimization (QPSO) with discrete
permutation encoding and capacity/time-window constraint checking.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Dict, List, Optional, Union

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from backend.optimization.emissions import (
    DEFAULT_CO2_PER_KM,
    DEFAULT_COST_PER_KM,
    compute_co2_emissions,
    compute_fuel_cost,
)
from backend.optimization.fitness import vrp_fitness
from backend.optimization.genetic import solve_vrp_ga
from backend.optimization.qpso import solve_vrp_qpso
from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance, VRPSolution

log = logging.getLogger(__name__)
router = APIRouter(prefix="/fleet", tags=["fleet"])


class StopInput(BaseModel):
    id: Union[str, int]
    lat: float
    lon: float
    demand: float = 0.0
    time_window_start: Optional[float] = None
    time_window_end: Optional[float] = None
    service_time: float = 0.0


class VehicleInput(BaseModel):
    id: Union[str, int]
    capacity: float
    start_depot_id: Optional[Union[str, int]] = None
    max_route_duration: Optional[float] = None
    speed: float = 1.0


class FleetOptimizeRequest(BaseModel):
    stops: List[StopInput]
    vehicles: List[VehicleInput]
    depot_id: Union[str, int]
    profile: Optional[str] = "custom"
    custom_weights: Optional[Dict[str, float]] = None
    weights: Optional[Dict[str, float]] = None
    algorithm: Optional[str] = "QPSO"
    iterations: Optional[int] = 50
    swarm_size: Optional[int] = 30
    metric: Optional[str] = "euclidean"
    cost_per_km: Optional[float] = DEFAULT_COST_PER_KM
    emissions_factor_per_km: Optional[float] = DEFAULT_CO2_PER_KM


class VehicleMetric(BaseModel):
    vehicle_id: str
    num_stops: int
    stops: List[Any]
    load: float
    capacity: float
    distance: float
    time: float
    fuel_cost: float = 0.0
    co2_kg: float = 0.0


class FleetOptimizeResponse(BaseModel):
    algorithm: str
    routes: Dict[str, List[Any]]
    route_coordinates: Dict[str, List[List[float]]] = Field(default_factory=dict)
    vehicle_metrics: Dict[str, VehicleMetric] = Field(default_factory=dict)
    total_distance: float
    total_time: float
    total_congestion: float
    estimated_fuel_cost: float = 0.0
    estimated_co2_kg: float = 0.0
    violations: List[str]
    fitness: float
    profile: str = "custom"
    convergence: List[Dict[str, Any]] = Field(default_factory=list)


def _run_fleet_optimization(
    payload: FleetOptimizeRequest,
    callback: Optional[Callable[[int, float], None]] = None,
) -> FleetOptimizeResponse:
    """Core multi-vehicle optimization worker with optional iteration callback."""
    if not payload.stops:
        raise HTTPException(status_code=400, detail="stops list cannot be empty")
    if not payload.vehicles:
        raise HTTPException(status_code=400, detail="vehicles list cannot be empty")

    stop_ids = {s.id for s in payload.stops}
    if payload.depot_id not in stop_ids:
        raise HTTPException(
            status_code=400,
            detail=f"depot_id '{payload.depot_id}' not found in provided stops list",
        )

    # Convert request models to domain models
    domain_stops = [
        Stop(
            id=s.id,
            lat=s.lat,
            lon=s.lon,
            demand=s.demand,
            time_window_start=s.time_window_start,
            time_window_end=s.time_window_end,
            service_time=s.service_time,
        )
        for s in payload.stops
    ]

    domain_vehicles = [
        Vehicle(
            id=v.id,
            capacity=v.capacity,
            start_depot_id=v.start_depot_id or payload.depot_id,
            max_route_duration=v.max_route_duration,
            speed=v.speed,
        )
        for v in payload.vehicles
    ]

    instance = VRPInstance(
        stops=domain_stops,
        vehicles=domain_vehicles,
        depot_id=payload.depot_id,
        metric=payload.metric or "euclidean",
    )

    from backend.optimization.profiles import resolve_profile_weights
    resolved_weights = resolve_profile_weights(
        profile=payload.profile,
        custom_weights=payload.custom_weights or payload.weights,
    )

    algo = (payload.algorithm or "QPSO").upper()
    if "GENETIC" in algo or algo == "GA":
        chosen_algo = "Genetic Algorithm"
        solution: VRPSolution = solve_vrp_ga(
            instance=instance,
            weights=resolved_weights,
            generations=payload.iterations,
            population_size=payload.swarm_size,
            callback=callback,
        )
    else:
        chosen_algo = "QPSO"
        solution = solve_vrp_qpso(
            instance=instance,
            weights=resolved_weights,
            iterations=payload.iterations,
            swarm_size=payload.swarm_size,
            callback=callback,
        )

    # Ensure fitness and violations are updated
    fitness, violations = vrp_fitness(solution, instance, resolved_weights)

    # Convert routes keys to string for JSON compatibility
    clean_routes = {str(k): list(v) for k, v in solution.routes.items()}

    # Compute coordinates and per-vehicle metrics
    depot_stop = instance.get_stop(payload.depot_id)
    depot_coord = [depot_stop.lat, depot_stop.lon] if depot_stop else [0.0, 0.0]

    route_coordinates: Dict[str, List[List[float]]] = {}
    vehicle_metrics: Dict[str, VehicleMetric] = {}

    for v_id_str, stop_ids in clean_routes.items():
        coords: List[List[float]] = []
        if stop_ids:
            coords.append(depot_coord)
            for sid in stop_ids:
                stop_obj = instance.get_stop(sid)
                if stop_obj:
                    coords.append([stop_obj.lat, stop_obj.lon])
            coords.append(depot_coord)
        route_coordinates[v_id_str] = coords

        # Compute per-vehicle distance and load
        v_dist = 0.0
        v_time = 0.0
        v_load = 0.0
        v_obj = instance.get_vehicle(v_id_str)
        v_cap = v_obj.capacity if v_obj else 0.0
        speed = getattr(v_obj, "speed", 1.0) or 1.0

        prev = payload.depot_id
        for sid in stop_ids:
            st = instance.get_stop(sid)
            if st:
                v_load += st.demand
                v_dist += instance.get_distance(prev, sid)
                v_time += instance.get_travel_time(prev, sid, speed=speed)
            prev = sid
        if stop_ids:
            v_dist += instance.get_distance(prev, payload.depot_id)
            v_time += instance.get_travel_time(prev, payload.depot_id, speed=speed)

        v_fuel = compute_fuel_cost(v_dist, payload.cost_per_km)
        v_co2 = compute_co2_emissions(v_dist, payload.emissions_factor_per_km)

        vehicle_metrics[v_id_str] = VehicleMetric(
            vehicle_id=v_id_str,
            num_stops=len(stop_ids),
            stops=stop_ids,
            load=round(float(v_load), 2),
            capacity=round(float(v_cap), 2),
            distance=round(float(v_dist), 2),
            time=round(float(v_time), 2),
            fuel_cost=v_fuel,
            co2_kg=v_co2,
        )

    fleet_fuel_cost = compute_fuel_cost(solution.total_distance, payload.cost_per_km)
    fleet_co2_kg = compute_co2_emissions(solution.total_distance, payload.emissions_factor_per_km)
    solution.estimated_fuel_cost = fleet_fuel_cost
    solution.estimated_co2_kg = fleet_co2_kg

    return FleetOptimizeResponse(
        algorithm=chosen_algo,
        routes=clean_routes,
        route_coordinates=route_coordinates,
        vehicle_metrics=vehicle_metrics,
        total_distance=round(float(solution.total_distance), 2),
        total_time=round(float(solution.total_time), 2),
        total_congestion=round(float(solution.total_congestion), 4),
        estimated_fuel_cost=fleet_fuel_cost,
        estimated_co2_kg=fleet_co2_kg,
        violations=violations,
        fitness=round(float(fitness), 4),
        profile=resolved_weights.get("profile", "custom"),
        convergence=getattr(solution, "convergence", []),
    )


@router.post("/optimize", response_model=FleetOptimizeResponse)
async def optimize_fleet(payload: FleetOptimizeRequest) -> FleetOptimizeResponse:
    """
    Optimize multi-vehicle routes for the provided fleet and stops.
    """
    return _run_fleet_optimization(payload)


@router.websocket("/optimize/stream")
async def websocket_fleet_optimize(websocket: WebSocket):
    """
    WebSocket endpoint streaming live iteration progress and final solution.
    """
    await websocket.accept()
    try:
        raw_data = await websocket.receive_json()
        payload = FleetOptimizeRequest(**raw_data)
    except Exception as e:
        await websocket.send_json({"type": "error", "message": f"Invalid request payload: {e}"})
        await websocket.close()
        return

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def on_progress(iteration: int, best_cost: float):
        loop.call_soon_threadsafe(
            queue.put_nowait,
            {"type": "progress", "iteration": iteration, "best_fitness": round(best_cost, 4)},
        )

    async def run_solver():
        try:
            response = await asyncio.to_thread(_run_fleet_optimization, payload, on_progress)
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {"type": "done", "result": response.model_dump()},
            )
        except Exception as e:
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {"type": "error", "message": str(e)},
            )

    worker_task = asyncio.create_task(run_solver())

    try:
        while True:
            msg = await queue.get()
            await websocket.send_json(msg)
            if msg.get("type") in ("done", "error"):
                break
    except WebSocketDisconnect:
        log.info("WebSocket client disconnected during fleet optimization stream.")
    finally:
        await worker_task
        try:
            await websocket.close()
        except Exception:
            pass


