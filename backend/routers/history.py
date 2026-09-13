"""
History Router — Endpoints for querying SQLite-persisted optimization runs and events.
"""
from __future__ import annotations

from typing import Any, Dict, List
from fastapi import APIRouter, Query

from backend.db import database as db

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/routes")
async def list_routes(limit: int = Query(20, ge=1, le=100)) -> List[Dict[str, Any]]:
    """Return recent route optimization calculations."""
    return db.get_recent_routes(limit=limit)


@router.get("/benchmarks")
async def list_benchmarks(limit: int = Query(10, ge=1, le=50)) -> List[Dict[str, Any]]:
    """Return recent multi-algorithm benchmark comparisons."""
    return db.get_recent_benchmarks(limit=limit)


@router.get("/traffic-events")
async def list_traffic_events(limit: int = Query(20, ge=1, le=100)) -> List[Dict[str, Any]]:
    """Return historical log of injected traffic events."""
    return db.get_recent_traffic_events(limit=limit)


@router.get("/stats")
async def database_stats() -> Dict[str, Any]:
    """Return overall database and optimization session summary."""
    return db.get_db_stats()