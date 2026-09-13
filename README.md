# Q-Commute: Quantum-Inspired Intelligent Traffic Route Optimization

[![Python](https://img.shields.io/badge/Python-3.11%2B%20%7C%203.13-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://reactjs.org/)
[![DaisyUI](https://img.shields.io/badge/DaisyUI-4-5A0EF8.svg)](https://daisyui.com/)
[![Tests](https://img.shields.io/badge/Tests-88%2F88%20Passing-brightgreen.svg)]()
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)

> **Smart India Hackathon (SIH) 2026**  
> **Problem Statement ID**: 26137  
> **Title**: Quantum-Inspired Intelligent Traffic Route Optimization in Transportation Systems Using Metaheuristic Optimization  
> **Category**: Software / Intelligent Transportation Systems (ITS)

---

## Overview

Modern urban road networks face persistent challenges of severe congestion, dynamic bottlenecks, and high operational transit costs. Classical optimization techniques struggle with large-scale Vehicle Routing Problems (VRP) due to their NP-hard combinatorial explosion. While physical quantum hardware remains constrained by NISQ-era qubit limits and decoherence, **Quantum-Inspired Metaheuristics (QPSO)** bridge this gap today.

**Q-Commute** simulates quantum-mechanical phenomena—such as quantum wave-function collapse, potential-well attraction, and quantum tunnelling—on classical processors. It optimizes multi-objective urban routing (travel time, path distance, congestion severity) over real-world road networks extracted from OpenStreetMap, delivering faster convergence and superior global exploration without getting trapped in local optima.

---

## Key Features

- ⚛️ **Quantum-Inspired Particle Swarm Optimization (QPSO)**: Discrete path-encoded swarm routing utilizing mean-best contraction-expansion equations, Monte Carlo wave-function sampling, and quantum tunnelling to escape congested local minima.
- 🧬 **Genetic Algorithm (GA) Optimizer**: Metaheuristic benchmark featuring tournament selection, single-point path crossover, and stochastic node mutation.
- ⚡ **Classical Dijkstra Baseline**: NetworkX-powered shortest-path benchmark for comparative baseline evaluation.
- 🚦 **Dynamic Traffic Simulation**: Real-time injection of mild, moderate, and severe congestion or full road closures with live path diffing and ghost-line detour rendering.
- 📊 **3-Way Benchmark Suite**: Side-by-side performance comparison across QPSO, GA, and Dijkstra with interactive Chart.js bar graphs (Distance, Travel Time, Runtime).
- 🗺️ **Geospatial UI**: React 18 + TailwindCSS + DaisyUI 4 modern interface with responsive Leaflet mapping, live metric counters, and convergence curves.
- 💾 **SQLite Persistence & History**: Automated logging of all optimization runs with REST endpoints for historical analysis.
- 📈 **Publication-Grade Analytics**: Matplotlib generation endpoints (`/analytics/plot/convergence`, `/analytics/plot/benchmark`) exporting 300 DPI analytical charts.
- 🐳 **Containerized & Tested**: Docker & Docker Compose ready, validated with an 88-test automated Pytest suite.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend API** | Python 3.13, FastAPI, Uvicorn, Pydantic v2 |
| **Quantum & Metaheuristics** | Discrete QPSO, Genetic Algorithm, NumPy, SciPy |
| **Geospatial & Graph** | NetworkX, OSMnx, OpenStreetMap (New Delhi Network) |
| **Frontend UI** | React 18, Vite, TailwindCSS, DaisyUI 4, Leaflet.js |
| **Data & Analytics** | Chart.js, Matplotlib, SQLite 3 |
| **DevOps & Testing** | Docker, Docker Compose, Pytest (88/88 tests passing) |

---

## Quick Start

### Option 1: Direct Python Execution (Recommended)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/madhavbhardwaj77/Q-Commute.git
   cd Q-Commute
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the server**:
   ```bash
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8080
   ```

4. **Access the application**:
   - Web UI: [http://127.0.0.1:8080/](http://127.0.0.1:8080/)
   - Swagger Interactive API Docs: [http://127.0.0.1:8080/docs](http://127.0.0.1:8080/docs)
   - Health Check: [http://127.0.0.1:8080/health](http://127.0.0.1:8080/health)

*(The compiled frontend in `frontend/dist` is served directly by FastAPI at `/`.)*

---

### Option 2: Docker & Docker Compose

Run the entire stack with a single command:
```bash
docker compose up --build
```
Then visit [http://localhost:8080](http://localhost:8080).

---

## Running the Automated Test Suite

The project includes an extensive test suite verifying graph snapping, multi-objective fitness calculation, Dijkstra baseline, QPSO convergence, GA routing, and FastAPI endpoints:

```bash
python -m pytest tests/ -v
```

**Result**: `88 passed in ~1.5s`

---

## Multi-Objective Fitness Function

Q-Commute evaluates candidate paths using a dimensionless multi-objective cost function:

$$\text{Cost}(P) = w_t \cdot \frac{T(P)}{T_{\text{ref}}} + w_d \cdot \frac{D(P)}{D_{\text{ref}}} + w_c \cdot \frac{C(P)}{C_{\text{ref}}}$$

- $T(P)$: Total estimated travel time in seconds
- $D(P)$: Total route distance in meters
- $C(P)$: Accumulated congestion penalty
- $T_{\text{ref}}, D_{\text{ref}}, C_{\text{ref}}$: Reference normalization baselines derived from network topology percentiles
- $w_t, w_d, w_c$: User-configurable priority weights (default: $0.50, 0.30, 0.20$)

---

## Project Structure

```
quantra/
├── backend/
│   ├── config.py                 # Network coordinates, QPSO & GA hyperparameters
│   ├── main.py                   # FastAPI application & static mount
│   ├── data/
│   │   └── newdelhi_drive.graphml# Cached OpenStreetMap road network
│   ├── db/
│   │   └── database.py           # SQLite connection & schema initializer
│   ├── graph/
│   │   ├── loader.py             # OSMnx loader with local caching
│   │   ├── snapper.py            # Lat/Lon KD-Tree nearest node snapper
│   │   └── state.py              # Thread-safe global network state
│   ├── optimization/
│   │   ├── fitness.py            # Multi-objective cost evaluation
│   │   ├── dijkstra.py           # Classical shortest path baseline
│   │   ├── genetic.py            # Genetic Algorithm optimizer
│   │   └── qpso.py               # Quantum Particle Swarm Optimizer
│   ├── simulation/
│   │   └── traffic.py            # Dynamic congestion & incident injector
│   └── routers/
│       ├── route.py              # /route/optimize & /route/reroute
│       ├── traffic.py            # /traffic/simulate & /traffic/reset
│       ├── network.py            # /locations & /network/status
│       ├── benchmark.py          # /benchmark/compare (3-way)
│       ├── history.py            # /history/routes & /history/stats
│       └── analytics.py          # /analytics/plot/* (Matplotlib charts)
├── frontend/
│   ├── index.html                # Vite entry point
│   ├── src/
│   │   ├── App.jsx               # Main React dashboard controller
│   │   ├── components/           # MapView, ControlPanel, BenchmarkView, HistoryModal
│   │   └── index.css             # TailwindCSS & DaisyUI imports
│   └── dist/                     # Pre-compiled static production bundle
├── scripts/
│   ├── smoke_test.py             # Rapid end-to-end API validator
│   └── verify_real_graph.py      # Real graph routing validation
├── tests/
│   ├── conftest.py               # Shared test fixtures (synthetic graph)
│   ├── test_graph.py             # Snapping & coordinate tests
│   ├── test_routing.py           # QPSO, GA, Dijkstra algorithm tests
│   ├── test_traffic.py           # Congestion overlay & penalty tests
│   └── test_api.py               # FastAPI TestClient integration tests
├── Dockerfile                    # Container definition
├── docker-compose.yml            # Multi-container orchestration
├── requirements.txt              # Pinned Python dependencies
└── README.md                     # Documentation
```

---

## License

This project is submitted for the **Smart India Hackathon 2026 (SIH 2026)** under Problem Statement **#26137**.
