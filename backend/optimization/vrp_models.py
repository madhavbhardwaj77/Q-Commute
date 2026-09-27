"""
VRP Data Models

Defines domain models for multi-vehicle Vehicle Routing Problems (VRP),
including stops, vehicles, instances, and solutions with constraint support.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union


@dataclass
class Stop:
    """
    A single stop or customer location in the VRP.

    Attributes:
        id: Unique identifier for the stop.
        lat: Latitude of the stop.
        lon: Longitude of the stop.
        demand: Customer demand (default 0.0).
        time_window_start: Optional earliest allowed arrival/service time.
        time_window_end: Optional latest allowed arrival/service time.
        service_time: Optional service duration at the stop (default 0.0).
    """
    id: Union[str, int]
    lat: float
    lon: float
    demand: float = 0.0
    time_window_start: Optional[float] = None
    time_window_end: Optional[float] = None
    service_time: float = 0.0


@dataclass
class Vehicle:
    """
    A vehicle available for routing.

    Attributes:
        id: Unique identifier for the vehicle.
        capacity: Maximum carrying capacity.
        start_depot_id: Identifier of the depot where the vehicle starts.
        max_route_duration: Optional maximum allowed route duration.
        speed: Vehicle travel speed factor (default 1.0 unit/second or km/h).
    """
    id: Union[str, int]
    capacity: float
    start_depot_id: Union[str, int]
    max_route_duration: Optional[float] = None
    speed: float = 1.0


@dataclass
class VRPInstance:
    """
    A complete problem instance for VRP.

    Attributes:
        stops: List of all stops, including the depot(s).
        vehicles: List of available vehicles.
        depot_id: Identifier of the primary depot stop.
        time_matrix: Optional lookup mapping (from_id, to_id) -> travel time.
        distance_matrix: Optional lookup mapping (from_id, to_id) -> distance.
        default_speed: Speed used to calculate travel time from distance (default 1.0).
        metric: Distance calculation metric ("euclidean" or "haversine").
    """
    stops: List[Stop]
    vehicles: List[Vehicle]
    depot_id: Union[str, int]
    time_matrix: Optional[Dict[Tuple[Any, Any], float]] = None
    distance_matrix: Optional[Dict[Tuple[Any, Any], float]] = None
    default_speed: float = 1.0
    metric: str = "euclidean"

    def __post_init__(self):
        self._stop_map: Dict[Any, Stop] = {s.id: s for s in self.stops}
        self._vehicle_map: Dict[Any, Vehicle] = {v.id: v for v in self.vehicles}

    def get_stop(self, stop_id: Any) -> Optional[Stop]:
        """Retrieve Stop by identifier."""
        if not hasattr(self, "_stop_map") or len(self._stop_map) != len(self.stops):
            self._stop_map = {s.id: s for s in self.stops}
        return self._stop_map.get(stop_id)

    def get_vehicle(self, vehicle_id: Any) -> Optional[Vehicle]:
        """Retrieve Vehicle by identifier."""
        if not hasattr(self, "_vehicle_map") or len(self._vehicle_map) != len(self.vehicles):
            self._vehicle_map = {v.id: v for v in self.vehicles}
        return self._vehicle_map.get(vehicle_id)

    def get_distance(self, from_id: Any, to_id: Any) -> float:
        """Return distance between two stops by ID."""
        if from_id == to_id:
            return 0.0
        if self.distance_matrix and (from_id, to_id) in self.distance_matrix:
            return float(self.distance_matrix[(from_id, to_id)])

        s1 = self.get_stop(from_id)
        s2 = self.get_stop(to_id)
        if s1 is None or s2 is None:
            return 0.0

        if self.metric == "haversine":
            r = 6_371_000.0  # Earth radius in metres
            phi1, phi2 = math.radians(s1.lat), math.radians(s2.lat)
            dphi = math.radians(s2.lat - s1.lat)
            dlam = math.radians(s2.lon - s1.lon)
            a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
            return float(r * 2 * math.asin(math.sqrt(max(0.0, min(1.0, a)))))

        return float(math.hypot(s1.lat - s2.lat, s1.lon - s2.lon))

    def get_travel_time(self, from_id: Any, to_id: Any, speed: Optional[float] = None) -> float:
        """Return travel time between two stops by ID."""
        if from_id == to_id:
            return 0.0
        if self.time_matrix and (from_id, to_id) in self.time_matrix:
            return float(self.time_matrix[(from_id, to_id)])

        dist = self.get_distance(from_id, to_id)
        effective_speed = speed if (speed is not None and speed > 0) else self.default_speed
        if effective_speed <= 0:
            effective_speed = 1.0
        return float(dist / effective_speed)


@dataclass
class VRPSolution:
    """
    A proposed solution to a VRPInstance.

    Can be accessed both as an object with fields and as a dictionary
    mapping vehicle_id -> ordered list of stop IDs.

    Attributes:
        routes: Dict mapping vehicle_id -> ordered list of stop ids.
        total_distance: Total distance traversed across all routes.
        total_time: Total travel and service duration.
        total_congestion: Total congestion cost/score across routes.
        violations: Human-readable descriptions of constraint violations.
        arrival_times: Optional mapping of vehicle_id -> {stop_id: arrival_time}.
        route_durations: Optional mapping of vehicle_id -> route duration.
    """
    routes: Dict[Any, List[Any]] = field(default_factory=dict)
    total_distance: float = 0.0
    total_time: float = 0.0
    total_congestion: float = 0.0
    violations: List[str] = field(default_factory=list)
    arrival_times: Dict[Any, Dict[Any, float]] = field(default_factory=dict)
    route_durations: Dict[Any, float] = field(default_factory=dict)
    fitness: float = 0.0
    convergence: List[Dict[str, Any]] = field(default_factory=list)
    estimated_fuel_cost: float = 0.0
    estimated_co2_kg: float = 0.0

    def __post_init__(self):
        if not isinstance(self.routes, dict):
            self.routes = dict(self.routes)

    # Dictionary emulation methods for convenience
    def __getitem__(self, key: Any) -> List[Any]:
        return self.routes[key]

    def __setitem__(self, key: Any, value: List[Any]) -> None:
        self.routes[key] = value

    def __contains__(self, key: Any) -> bool:
        return key in self.routes

    def __iter__(self):
        return iter(self.routes)

    def __len__(self) -> int:
        return len(self.routes)

    def get(self, key: Any, default: Any = None) -> Any:
        return self.routes.get(key, default)

    def items(self):
        return self.routes.items()

    def keys(self):
        return self.routes.keys()

    def values(self):
        return self.routes.values()
