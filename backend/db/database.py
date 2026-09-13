"""
SQLite Database Layer for Q-Commute.
Persists route optimization results, benchmark comparisons, and simulated traffic events.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "qcommute.db"


def get_connection() -> sqlite3.Connection:
    """Return a connection with Row factory enabled."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they do not exist."""
    conn = get_connection()
    try:
        with conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS routes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    destination_id TEXT NOT NULL,
                    algorithm TEXT NOT NULL,
                    distance_m REAL NOT NULL,
                    travel_time_s REAL NOT NULL,
                    total_cost REAL NOT NULL,
                    runtime_ms REAL NOT NULL,
                    path_nodes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS benchmarks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    destination_id TEXT NOT NULL,
                    winner_cost TEXT,
                    winner_time TEXT,
                    results_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS traffic_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    road_name TEXT,
                    edge_u INTEGER,
                    edge_v INTEGER,
                    edge_k INTEGER,
                    time_multiplier REAL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
        log.info("SQLite database initialized at %s", DB_PATH)
    finally:
        conn.close()


def save_route(
    source_id: str,
    destination_id: str,
    algorithm: str,
    distance_m: float,
    travel_time_s: float,
    total_cost: float,
    runtime_ms: float,
    path_nodes: Optional[List[int]] = None,
) -> int:
    """Save an executed route optimization run."""
    conn = get_connection()
    try:
        now = datetime.now(timezone.utc).isoformat()
        path_str = json.dumps(path_nodes) if path_nodes else None
        with conn:
            cursor = conn.execute(
                """
                INSERT INTO routes (timestamp, source_id, destination_id, algorithm, distance_m, travel_time_s, total_cost, runtime_ms, path_nodes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (now, source_id, destination_id, algorithm, distance_m, travel_time_s, total_cost, runtime_ms, path_str),
            )
            return cursor.lastrowid
    except Exception as e:
        log.warning("Failed to save route to SQLite: %s", e)
        return -1
    finally:
        conn.close()


def get_recent_routes(limit: int = 20) -> List[Dict[str, Any]]:
    """Retrieve most recent route calculations."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT id, timestamp, source_id, destination_id, algorithm, distance_m, travel_time_s, total_cost, runtime_ms, path_nodes, created_at
            FROM routes ORDER BY id DESC LIMIT ?
            """,
            (limit,),
        )
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            if d.get("path_nodes"):
                try:
                    d["path_nodes"] = json.loads(d["path_nodes"])
                except Exception:
                    pass
            result.append(d)
        return result
    finally:
        conn.close()


def save_benchmark(
    source_id: str,
    destination_id: str,
    winner_cost: str,
    winner_time: str,
    results: List[Dict[str, Any]],
) -> int:
    """Save a multi-algorithm benchmark run."""
    conn = get_connection()
    try:
        now = datetime.now(timezone.utc).isoformat()
        res_str = json.dumps(results)
        with conn:
            cursor = conn.execute(
                """
                INSERT INTO benchmarks (timestamp, source_id, destination_id, winner_cost, winner_time, results_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (now, source_id, destination_id, winner_cost, winner_time, res_str),
            )
            return cursor.lastrowid
    except Exception as e:
        log.warning("Failed to save benchmark to SQLite: %s", e)
        return -1
    finally:
        conn.close()


def get_recent_benchmarks(limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve recent benchmark comparisons."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT id, timestamp, source_id, destination_id, winner_cost, winner_time, results_json, created_at
            FROM benchmarks ORDER BY id DESC LIMIT ?
            """,
            (limit,),
        )
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            if d.get("results_json"):
                try:
                    d["results"] = json.loads(d["results_json"])
                except Exception:
                    pass
            result.append(d)
        return result
    finally:
        conn.close()


def save_traffic_event(
    event_type: str,
    severity: str,
    road_name: Optional[str],
    edge_u: int,
    edge_v: int,
    edge_k: int,
    time_multiplier: float,
) -> int:
    """Log an active traffic event insertion."""
    conn = get_connection()
    try:
        now = datetime.now(timezone.utc).isoformat()
        with conn:
            cursor = conn.execute(
                """
                INSERT INTO traffic_events (timestamp, event_type, severity, road_name, edge_u, edge_v, edge_k, time_multiplier)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (now, event_type, severity, road_name, edge_u, edge_v, edge_k, time_multiplier),
            )
            return cursor.lastrowid
    except Exception as e:
        log.warning("Failed to save traffic event to SQLite: %s", e)
        return -1
    finally:
        conn.close()


def get_recent_traffic_events(limit: int = 20) -> List[Dict[str, Any]]:
    """Retrieve recent traffic events."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT id, timestamp, event_type, severity, road_name, edge_u, edge_v, edge_k, time_multiplier, created_at
            FROM traffic_events ORDER BY id DESC LIMIT ?
            """,
            (limit,),
        )
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


def get_db_stats() -> Dict[str, Any]:
    """Return database aggregate summary metrics."""
    conn = get_connection()
    try:
        route_cnt = conn.execute("SELECT COUNT(*) FROM routes").fetchone()[0]
        bench_cnt = conn.execute("SELECT COUNT(*) FROM benchmarks").fetchone()[0]
        event_cnt = conn.execute("SELECT COUNT(*) FROM traffic_events").fetchone()[0]
        avg_runtime = conn.execute("SELECT AVG(runtime_ms) FROM routes").fetchone()[0] or 0.0
        return {
            "total_routes_optimized": route_cnt,
            "total_benchmarks_run": bench_cnt,
            "total_traffic_events_applied": event_cnt,
            "avg_routing_runtime_ms": round(avg_runtime, 2),
            "db_path": str(DB_PATH),
            "storage_engine": "SQLite 3",
        }
    finally:
        conn.close()