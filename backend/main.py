"""
Q-Commute — FastAPI Application Entry Point
SIH 2026 Upgrade: includes benchmark router and graph-metrics endpoint.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.graph.state import graph_state
from backend.db.database import init_db
from backend.routers import route as route_router
from backend.routers import traffic as traffic_router
from backend.routers import network as network_router
from backend.routers import benchmark as benchmark_router
from backend.routers import history as history_router
from backend.routers import analytics as analytics_router

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Q-Commute backend starting up...")
    try:
        init_db()
        graph_state.initialize()
        log.info("Graph ready & SQLite DB active. Q-Commute is live.")
    except Exception as e:
        log.error("Failed to initialize backend services: %s", e)
    yield
    log.info("Q-Commute shutting down.")


app = FastAPI(
    title       = "Q-Commute API",
    description = "Quantum-Inspired Metaheuristic Optimization for Intelligent Traffic Routing. SIH 2026 — PS #26137 — Egreen Quanta.",
    version     = "2.0.0",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# Health check MUST be before static file mount
@app.get("/health", tags=["system"])
async def health():
    return {
        "status": "ok",
        "graph_ready": graph_state._initialized,
        "database": "SQLite 3",
        "version": "2.0.0",
        "tech_stack": {
            "backend": "FastAPI + Uvicorn + Python 3.13",
            "quantum_engine": "QPSO + NumPy + SciPy",
            "geospatial": "OpenStreetMap + NetworkX",
            "analytics": "Chart.js + Matplotlib",
            "persistence": "SQLite",
            "deployment": "Docker",
        }
    }

# Routers
app.include_router(route_router.router)
app.include_router(traffic_router.router)
app.include_router(network_router.router)
app.include_router(benchmark_router.router)
app.include_router(history_router.router)
app.include_router(analytics_router.router)

# Convenience root-level locations endpoint
_convenience = APIRouter()

@_convenience.get("/locations", tags=["network"])
async def locations_root():
    from backend.routers.network import get_locations
    return await get_locations()

app.include_router(_convenience)

# Static files — Check for compiled frontend/dist first, fallback to frontend/
base_frontend = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "frontend")
)
dist_dir = os.path.join(base_frontend, "dist")
frontend_dir = dist_dir if (os.path.isdir(dist_dir) and os.path.isfile(os.path.join(dist_dir, "index.html"))) else base_frontend

if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    log.info("Serving frontend from %s", frontend_dir)
