"""
Real-Graph Verification Script for Q-Commute SIH 2026 MVP.

Tests:
1. Loading the real cached graph (backend/data/newdelhi_drive.graphml).
2. All 10 locations snapped to real road graph nodes.
3. Dijkstra baseline calculation on real graph.
4. QPSO optimization on real road graph (particles, iterations, convergence).
5. Deterministic traffic event injection on active route.
6. Rerouting comparison: verifies delta in travel time, distance, cost.
7. Road closure event & alternate route detection.
8. State reset restores baseline network state.
"""
from __future__ import annotations
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.graph.state import graph_state
from backend.config import LOCATIONS
from backend.optimization.dijkstra import run_dijkstra
from backend.optimization.qpso import QPSORouter
from backend.simulation.traffic import choose_traffic_edge, build_traffic_summary

def main():
    print("=== Step 1: Initializing GraphState on Real Network ===")
    graph_state.initialize()
    status = graph_state.status()
    print(f"Nodes: {status['nodes']}, Edges: {status['edges']}")
    assert status['nodes'] > 0 and status['edges'] > 0, "Graph failed to load!"

    print("\n=== Step 2: Verifying Location Snapping ===")
    for loc in LOCATIONS:
        node_id = graph_state.get_node(loc.id)
        assert graph_state.G.has_node(node_id), f"Snapped node {node_id} not in graph!"
        print(f"  [OK] {loc.name} -> Node {node_id}")

    src_id = "connaught_place"
    dst_id = "india_gate"
    src_node = graph_state.get_node(src_id)
    dst_node = graph_state.get_node(dst_id)

    print(f"\n=== Step 3: Dijkstra Baseline ({src_id} -> {dst_id}) ===")
    dijk_res = run_dijkstra(
        graph_state.G, src_node, dst_node,
        graph_state.traffic_overlay, graph_state._ref
    )
    assert dijk_res["valid"], f"Dijkstra failed: {dijk_res.get('error')}"
    print(f"  Valid: {dijk_res['valid']}")
    print(f"  Path length: {len(dijk_res['path'])} nodes")
    print(f"  Distance: {dijk_res['distance_m']:.1f} m")
    print(f"  Travel Time: {dijk_res['travel_time_s']:.1f} s")
    print(f"  Objective Cost: {dijk_res['total_cost']:.4f}")
    print(f"  Runtime: {dijk_res['runtime_ms']:.2f} ms")

    print(f"\n=== Step 4: QPSO Optimization ({src_id} -> {dst_id}) ===")
    qpso = QPSORouter(
        graph_state.G, src_node, dst_node,
        graph_state.traffic_overlay, graph_state._ref,
        n_particles=20, n_iter=40, seed=42
    )
    qpso_res = qpso.run()
    assert qpso_res["valid"], f"QPSO failed: {qpso_res.get('error')}"
    print(f"  Valid: {qpso_res['valid']}")
    print(f"  Path length: {len(qpso_res['path'])} nodes")
    print(f"  Distance: {qpso_res['distance_m']:.1f} m")
    print(f"  Travel Time: {qpso_res['travel_time_s']:.1f} s")
    print(f"  Objective Cost: {qpso_res['total_cost']:.4f}")
    print(f"  Runtime: {qpso_res['runtime_ms']:.2f} ms")
    print(f"  Convergence points: {len(qpso_res['convergence'])}")
    print(f"  Initial Best Cost: {qpso_res['convergence'][0]['best_cost']}")
    print(f"  Final Best Cost: {qpso_res['convergence'][-1]['best_cost']}")

    print("\n=== Step 5: Simulating Traffic Event on Active Route ===")
    chosen_edge = choose_traffic_edge(
        graph_state.G, qpso_res["path"], src_node, dst_node,
        graph_state.traffic_overlay
    )
    assert chosen_edge is not None, "Failed to find traffic candidate edge!"
    u, v, k = chosen_edge
    road_name = graph_state.G[u][v][k].get("name", f"{u}->{v}")
    print(f"  Targeted edge: ({u}, {v}, {k}) - {road_name}")

    event = graph_state.apply_traffic_event("congestion", u, v, k, severity="severe")
    print(f"  Applied event: {event}")
    assert len(graph_state.traffic_overlay) > 0

    print("\n=== Step 6: Dynamic Rerouting under Congestion ===")
    qpso_reroute = QPSORouter(
        graph_state.G, src_node, dst_node,
        graph_state.traffic_overlay, graph_state._ref,
        n_particles=20, n_iter=40, seed=42
    )
    new_res = qpso_reroute.run()
    assert new_res["valid"], f"Reroute failed: {new_res.get('error')}"
    time_diff = new_res["travel_time_s"] - qpso_res["travel_time_s"]
    dist_diff = new_res["distance_m"] - qpso_res["distance_m"]
    cost_diff = new_res["total_cost"] - qpso_res["total_cost"]
    changed = new_res["path"] != qpso_res["path"]

    print(f"  New Route Valid: {new_res['valid']}")
    print(f"  Route Changed: {changed}")
    print(f"  Travel Time Delta: {time_diff:+.1f} s")
    print(f"  Distance Delta: {dist_diff:+.1f} m")
    print(f"  Cost Delta: {cost_diff:+.4f}")

    print("\n=== Step 7: Testing Road Closure Event ===")
    graph_state.reset_traffic()
    graph_state.apply_traffic_event("closure", u, v, k)
    dijk_closed = run_dijkstra(
        graph_state.G, src_node, dst_node,
        graph_state.traffic_overlay, graph_state._ref
    )
    assert dijk_closed["valid"], "Failed to find alternate route around road closure!"
    path_edges = list(zip(dijk_closed["path"][:-1], dijk_closed["path"][1:]))
    assert (u, v) not in path_edges, "Closed edge was used in route!"
    print(f"  Alternate path found bypassing closed edge ({u}, {v})!")

    print("\n=== Step 8: Testing Demo Reset ===")
    graph_state.reset_traffic()
    assert len(graph_state.traffic_overlay) == 0
    print("  Traffic overlay successfully cleared.")

    print("\n=======================================================")
    print(">>> ALL REAL-GRAPH VERIFICATION CHECKS PASSED! <<<")
    print("=======================================================")

if __name__ == "__main__":
    main()
