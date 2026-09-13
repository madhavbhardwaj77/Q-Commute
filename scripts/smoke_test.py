"""
HTTP Smoke Test for Q-Commute API.
Can be executed when server is running to verify end-to-end HTTP communication.
"""
import json
import os
import sys
import urllib.request
import urllib.error

BASE = os.environ.get("API_BASE", "http://127.0.0.1:8080")

def post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        BASE + path,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    r = urllib.request.urlopen(req, timeout=10)
    return json.loads(r.read())

def get(path):
    req = urllib.request.Request(BASE + path, method="GET")
    r = urllib.request.urlopen(req, timeout=10)
    return json.loads(r.read())

def main():
    print(f"Connecting to {BASE}...")
    try:
        h = get("/health")
        print("HEALTH:", h)
    except urllib.error.URLError as e:
        print(f"Could not connect to {BASE}: {e}")
        print("Make sure server is running: python -m uvicorn backend.main:app --host 127.0.0.1 --port 8080")
        sys.exit(1)

    locs = get("/locations")
    print("LOCATIONS:", len(locs), "locations loaded")

    r = post("/route/optimize", {
        "source_id": "connaught_place",
        "destination_id": "india_gate",
        "algorithm": "QPSO",
    })
    print("QPSO - valid:", r["valid"], "| dist_m:", round(r["distance_m"], 0),
          "| time_s:", round(r["travel_time_s"], 1), "| cost:", round(r["total_cost"], 4),
          "| runtime_ms:", round(r["runtime_ms"], 0))

    r2 = post("/route/optimize", {
        "source_id": "connaught_place",
        "destination_id": "india_gate",
        "algorithm": "Dijkstra",
    })
    print("DIJKSTRA - valid:", r2["valid"], "| dist_m:", round(r2["distance_m"], 0),
          "| cost:", round(r2["total_cost"], 4))

    t = post("/traffic/simulate", {
        "event_type": "congestion",
        "severity": "severe",
        "source_id": "connaught_place",
        "destination_id": "india_gate",
        "current_route": r.get("path"),
    })
    print("TRAFFIC - success:", t["success"], "| road:", t.get("road_name"))

    rr = post("/route/reroute", {
        "source_id": "connaught_place",
        "destination_id": "india_gate",
        "algorithm": "QPSO",
    })
    d = rr["diff"]
    print("REROUTE - valid:", rr["new_route"]["valid"], "| changed:", d["route_changed"],
          "| time_diff:", round(d["travel_time_s_diff"], 1), "s")

    res = post("/traffic/reset", {})
    print("RESET - success:", res["success"])
    print("--- ALL SMOKE TESTS PASSED ---")

if __name__ == "__main__":
    main()
