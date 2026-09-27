"""
Standard VRP Benchmark Dataset Loader

Parses and provides Solomon-style VRPTW benchmark instances across
clustered (C1), random (R1), and mixed (RC1) problem topologies.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance

BENCHMARK_DIR = Path(__file__).resolve().parent.parent / "data" / "benchmarks"

BENCHMARK_CATALOG: Dict[str, Dict[str, Any]] = {
    "c101_small": {
        "id": "c101_small",
        "name": "Solomon C101 (Clustered)",
        "category": "clustered",
        "description": "Geographically clustered customer stops with tight time windows.",
        "filename": "c101_small.csv",
        "default_vehicles": 2,
        "default_capacity": 80.0,
    },
    "r101_small": {
        "id": "r101_small",
        "name": "Solomon R101 (Random)",
        "category": "random",
        "description": "Uniformly dispersed customer locations over an open spatial grid.",
        "filename": "r101_small.csv",
        "default_vehicles": 2,
        "default_capacity": 70.0,
    },
    "rc101_small": {
        "id": "rc101_small",
        "name": "Solomon RC101 (Mixed)",
        "category": "mixed",
        "description": "Composite topology containing both clustered and random customers.",
        "filename": "rc101_small.csv",
        "default_vehicles": 2,
        "default_capacity": 75.0,
    },
}


def get_available_datasets() -> List[Dict[str, Any]]:
    """Return catalog of available benchmark datasets with metadata."""
    results = []
    for d_id, meta in BENCHMARK_CATALOG.items():
        csv_path = BENCHMARK_DIR / meta["filename"]
        num_stops = 0
        if csv_path.exists():
            with open(csv_path, mode="r", encoding="utf-8") as f:
                reader = csv.reader(f)
                num_stops = max(0, sum(1 for _ in reader) - 1)

        results.append({
            "id": meta["id"],
            "name": meta["name"],
            "category": meta["category"],
            "description": meta["description"],
            "num_stops": num_stops,
            "default_vehicles": meta["default_vehicles"],
            "default_capacity": meta["default_capacity"],
        })
    return results


def load_benchmark_instance(
    dataset_id: str,
    num_vehicles: Optional[int] = None,
    capacity: Optional[float] = None,
) -> VRPInstance:
    """
    Parse a benchmark dataset into a VRPInstance.

    Args:
        dataset_id: Identifier of the dataset (e.g., 'c101_small').
        num_vehicles: Optional vehicle count override.
        capacity: Optional vehicle capacity override.

    Returns:
        VRPInstance ready for optimization.
    """
    clean_id = dataset_id.lower().strip()
    if clean_id not in BENCHMARK_CATALOG:
        valid_ids = list(BENCHMARK_CATALOG.keys())
        raise ValueError(f"Unknown benchmark dataset '{dataset_id}'. Available: {valid_ids}")

    meta = BENCHMARK_CATALOG[clean_id]
    csv_path = BENCHMARK_DIR / meta["filename"]

    if not csv_path.exists():
        raise FileNotFoundError(f"Benchmark file not found: {csv_path}")

    stops: List[Stop] = []
    depot_id = "depot"

    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            s_id = row["id"].strip()
            lat = float(row["lat"])
            lon = float(row["lon"])
            demand = float(row.get("demand", 0.0))
            tws = float(row["time_window_start"]) if row.get("time_window_start") else None
            twe = float(row["time_window_end"]) if row.get("time_window_end") else None
            serv = float(row.get("service_time", 0.0))

            if s_id.lower() == "depot":
                depot_id = s_id

            stops.append(Stop(
                id=s_id,
                lat=lat,
                lon=lon,
                demand=demand,
                time_window_start=tws,
                time_window_end=twe,
                service_time=serv,
            ))

    n_veh = num_vehicles if num_vehicles is not None and num_vehicles > 0 else meta["default_vehicles"]
    cap = capacity if capacity is not None and capacity > 0 else meta["default_capacity"]

    vehicles = [
        Vehicle(
            id=f"v{i + 1}",
            capacity=float(cap),
            start_depot_id=depot_id,
        )
        for i in range(n_veh)
    ]

    return VRPInstance(
        stops=stops,
        vehicles=vehicles,
        depot_id=depot_id,
        metric="euclidean",
    )
