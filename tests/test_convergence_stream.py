"""
Tests for Live Convergence Progress Callback & Streaming Endpoint
"""
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.optimization.benchmark_data import load_benchmark_instance
from backend.optimization.genetic import solve_vrp_ga
from backend.optimization.qpso import solve_vrp_qpso
from backend.optimization.vrp_models import Stop, Vehicle, VRPInstance

client = TestClient(app)


def test_qpso_callback_monotonicity():
    """Verify QPSO callback fires expected number of times with monotonically non-increasing cost."""
    inst = load_benchmark_instance("c101_small")
    history = []

    def callback(iteration: int, best_fitness: float):
        history.append((iteration, best_fitness))

    n_iter = 12
    sol = solve_vrp_qpso(inst, iterations=n_iter, swarm_size=10, callback=callback)

    # Must fire at iter 0 plus each of the n_iter iterations
    assert len(history) == n_iter + 1
    assert history[0][0] == 0
    assert history[-1][0] == n_iter

    costs = [item[1] for item in history]
    # Verify monotonically non-increasing (each cost <= previous cost)
    for i in range(1, len(costs)):
        assert costs[i] <= costs[i - 1] + 1e-9, f"Cost increased at iteration {i}: {costs[i]} > {costs[i-1]}"


def test_ga_callback_monotonicity():
    """Verify GA callback fires expected number of times with monotonically non-increasing cost."""
    inst = load_benchmark_instance("c101_small")
    history = []

    def callback(iteration: int, best_fitness: float):
        history.append((iteration, best_fitness))

    n_gen = 10
    sol = solve_vrp_ga(inst, generations=n_gen, population_size=10, callback=callback)

    assert len(history) == n_gen + 1
    assert history[0][0] == 0
    assert history[-1][0] == n_gen

    costs = [item[1] for item in history]
    for i in range(1, len(costs)):
        assert costs[i] <= costs[i - 1] + 1e-9, f"Cost increased at generation {i}: {costs[i]} > {costs[i-1]}"


def test_websocket_stream_progress_and_done():
    """Verify /fleet/optimize/stream WebSocket returns valid sequence of progress messages."""
    payload = {
        "stops": [
            {"id": "depot", "lat": 12.97, "lon": 77.59, "demand": 0.0},
            {"id": "s1", "lat": 12.98, "lon": 77.60, "demand": 2.0},
            {"id": "s2", "lat": 12.99, "lon": 77.61, "demand": 2.0},
        ],
        "vehicles": [
            {"id": "v1", "capacity": 10.0, "start_depot_id": "depot"}
        ],
        "depot_id": "depot",
        "iterations": 6,
        "swarm_size": 10,
    }

    with client.websocket_connect("/fleet/optimize/stream") as ws:
        ws.send_json(payload)

        messages = []
        while True:
            msg = ws.receive_json()
            messages.append(msg)
            if msg.get("type") in ("done", "error"):
                break

    progress_msgs = [m for m in messages if m.get("type") == "progress"]
    assert len(progress_msgs) >= 6

    # Verify progress structure and iteration ordering
    for idx, p in enumerate(progress_msgs):
        assert "iteration" in p
        assert "best_fitness" in p
        assert p["iteration"] == idx

    # Verify done message
    done_msg = next((m for m in messages if m.get("type") == "done"), None)
    assert done_msg is not None
    assert "result" in done_msg
    assert "routes" in done_msg["result"]
    assert "v1" in done_msg["result"]["routes"]
    assert done_msg["result"]["total_distance"] > 0.0
