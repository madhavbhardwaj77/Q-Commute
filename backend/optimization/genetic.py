"""
Genetic Algorithm path optimizer for Q-Commute — SIH 2026.
Interface-compatible with QPSORouter. Uses correct API signatures.
"""
from __future__ import annotations

import math
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import networkx as nx
import numpy as np

from backend.optimization.qpso import _remove_cycles, _repair_path
from backend.optimization.fitness import path_fitness, edge_cost
from backend.graph.snapper import path_coords


# ---------------------------------------------------------------------------
# Internal helpers (no dependency on qpso._random_path to avoid rng conflict)
# ---------------------------------------------------------------------------

def _ga_random_path(
    G: nx.MultiDiGraph,
    src: int,
    dst: int,
    rng: np.random.Generator,
    max_steps: int = 80,
) -> Optional[List[int]]:
    """
    Destination-biased random walk from src to dst.
    Falls back to networkx shortest path if walk fails.
    """
    dst_x = G.nodes[dst].get("x", 0)
    dst_y = G.nodes[dst].get("y", 0)

    for _ in range(4):  # 4 attempts
        path = [src]
        current = src
        for _ in range(max_steps):
            if current == dst:
                return path
            nbrs = list(G.successors(current))
            if not nbrs:
                break
            # Weight by inverse distance to destination
            dists = []
            for n in nbrs:
                dx = G.nodes[n].get("x", 0) - dst_x
                dy = G.nodes[n].get("y", 0) - dst_y
                dists.append(math.hypot(dx, dy) + 1e-9)
            weights = np.array([1.0 / d for d in dists])
            weights /= weights.sum()
            chosen = rng.choice(nbrs, p=weights)
            if chosen in path and chosen != dst:
                # Avoid revisiting — pick random neighbour instead
                chosen = rng.choice(nbrs)
            path.append(chosen)
            current = chosen
        # failed attempt — try again

    # Fallback: networkx shortest path
    try:
        return nx.shortest_path(G, src, dst, weight="travel_time")
    except Exception:
        return None


def _tournament_select(
    population: List[List[int]],
    fitnesses: List[float],
    k: int,
    rng: np.random.Generator,
) -> List[int]:
    """Tournament selection: return best of k random individuals."""
    idxs = rng.choice(len(population), size=min(k, len(population)), replace=False).tolist()
    best = min(idxs, key=lambda i: fitnesses[i])
    return list(population[best])


def _crossover(
    parent_a: List[int],
    parent_b: List[int],
    src: int,
    dst: int,
    rng: np.random.Generator,
) -> List[int]:
    """
    Find a shared intermediate node, splice prefix of A with suffix of B.
    Falls back to a random parent if no common node exists.
    """
    set_b = set(parent_b)
    common = [n for n in parent_a[1:-1] if n in set_b and n != src and n != dst]
    if not common:
        return list(parent_a if rng.random() < 0.5 else parent_b)
    pivot = rng.choice(common)
    idx_a = parent_a.index(pivot)
    idx_b = parent_b.index(pivot)
    child = parent_a[: idx_a + 1] + parent_b[idx_b + 1:]
    return child


def _mutate(
    path: List[int],
    rng: np.random.Generator,
    mutation_rate: float = 0.25,
) -> List[int]:
    """Swap two random interior nodes with probability mutation_rate."""
    if len(path) <= 2 or rng.random() > mutation_rate:
        return path
    path = list(path)
    intermediates = list(range(1, len(path) - 1))
    if len(intermediates) >= 2:
        i, j = rng.choice(intermediates, size=2, replace=False).tolist()
        path[i], path[j] = path[j], path[i]
    return path


def _compute_metrics(
    G: nx.MultiDiGraph,
    path: List[int],
    overlay: Dict[Tuple[int, int, int], dict],
    refs: Dict[str, float],
) -> dict:
    """
    Compute distance_m, travel_time_s, congestion_cost for a valid path.
    """
    dist = 0.0
    time_s = 0.0
    cong = 0.0
    for u, v in zip(path, path[1:]):
        if not G.has_edge(u, v):
            return {"distance_m": 0.0, "travel_time_s": 0.0, "congestion_cost": 0.0}
        edges = G[u][v]
        best_k = min(edges.keys(), key=lambda k: edge_cost(G, u, v, k, edges[k], overlay, refs))
        edata = edges[best_k]
        ov    = overlay.get((u, v, best_k), {})
        dist  += edata.get("length", 0.0)
        tt    = edata.get("travel_time", 0.0) * ov.get("time_multiplier", 1.0)
        time_s += tt
        cong  += min(1.0, edata.get("congestion", 0.0) + ov.get("congestion_add", 0.0))
    return {"distance_m": dist, "travel_time_s": time_s, "congestion_cost": cong}


# ---------------------------------------------------------------------------
# GeneticRouter
# ---------------------------------------------------------------------------

class GeneticRouter:
    """
    Genetic Algorithm route optimiser — SIH 2026 Deliverable #3 (alt. benchmark).

    Interface-compatible with QPSORouter: same constructor signature and
    same return dict from run().
    """

    def __init__(
        self,
        G: nx.MultiDiGraph,
        src: int,
        dst: int,
        traffic_overlay: dict,
        refs: dict,
        n_particles: int = 30,
        n_iter: int = 60,
        seed: Optional[int] = None,
    ):
        self.G       = G
        self.src     = src
        self.dst     = dst
        self.overlay = traffic_overlay
        self.refs    = refs
        self.pop_size = n_particles
        self.n_iter   = n_iter
        self.rng      = np.random.default_rng(seed)

    def run(self) -> dict:
        """Run GA and return a result dict matching QPSORouter contract."""
        t0 = time.perf_counter()

        # ── Initialize population ─────────────────────────────────────
        try:
            base_len = nx.shortest_path(self.G, self.src, self.dst, weight="length")
        except Exception:
            base_len = [self.src, self.dst]

        population: List[List[int]] = [list(base_len)]
        for _ in range(1, self.pop_size):
            path = _ga_random_path(self.G, self.src, self.dst, self.rng)
            if path:
                path = _remove_cycles(path)
                path = _repair_path(self.G, path, self.src, self.dst, traffic_overlay=self.overlay, refs=self.refs)
            if not path or len(path) < 2:
                mutated = _mutate(list(base_len), self.rng, mutation_rate=0.45)
                path = _repair_path(self.G, mutated, self.src, self.dst, traffic_overlay=self.overlay, refs=self.refs) or list(base_len)
            population.append(path)

        # ── Initial fitnesses ─────────────────────────────────────────
        fitnesses = [path_fitness(self.G, p, self.overlay, self.refs) for p in population]

        best_idx  = int(np.argmin(fitnesses))
        best_path = list(population[best_idx])
        best_cost = fitnesses[best_idx]

        convergence: List[dict] = [{"iteration": 0, "best_cost": best_cost}]

        # ── Generational loop ─────────────────────────────────────────
        for gen in range(self.n_iter):
            new_pop: List[List[int]] = [list(best_path)]  # elitism

            while len(new_pop) < self.pop_size:
                pa = _tournament_select(population, fitnesses, k=3, rng=self.rng)
                pb = _tournament_select(population, fitnesses, k=3, rng=self.rng)
                child = _crossover(pa, pb, self.src, self.dst, self.rng)
                child = _mutate(child, self.rng, mutation_rate=0.25)
                child = _repair_path(self.G, child, self.src, self.dst, traffic_overlay=self.overlay, refs=self.refs)
                child = _remove_cycles(child)
                if not child or len(child) < 2:
                    child = list(best_path)
                new_pop.append(child)

            new_fit = [path_fitness(self.G, p, self.overlay, self.refs) for p in new_pop]
            population = new_pop
            fitnesses  = new_fit

            gen_best_idx  = int(np.argmin(fitnesses))
            gen_best_cost = fitnesses[gen_best_idx]
            if gen_best_cost < best_cost:
                best_cost = gen_best_cost
                best_path = list(population[gen_best_idx])

            convergence.append({"iteration": gen + 1, "best_cost": best_cost})

        # ── Build result dict ─────────────────────────────────────────
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        if (
            math.isinf(best_cost)
            or len(best_path) < 2
            or best_path[0] != self.src
            or best_path[-1] != self.dst
        ):
            return self._error("GA could not find a valid path", elapsed_ms, convergence)

        try:
            coords  = path_coords(self.G, best_path)
            metrics = _compute_metrics(self.G, best_path, self.overlay, self.refs)
        except Exception as exc:
            return self._error(str(exc), elapsed_ms, convergence)

        return {
            "valid":         True,
            "algorithm":     "Genetic Algorithm",
            "path":          best_path,
            "coordinates":   coords,
            "distance_m":    metrics["distance_m"],
            "travel_time_s": metrics["travel_time_s"],
            "congestion_cost": metrics["congestion_cost"],
            "total_cost":    best_cost,
            "runtime_ms":    elapsed_ms,
            "convergence":   convergence,
            "iterations":    self.n_iter,
            "population":    self.pop_size,
        }

    def _error(self, msg: str, elapsed_ms: float, convergence: list) -> dict:
        return {
            "valid": False, "algorithm": "Genetic Algorithm",
            "path": [], "coordinates": [],
            "distance_m": 0.0, "travel_time_s": 0.0,
            "congestion_cost": 0.0, "total_cost": math.inf,
            "runtime_ms": elapsed_ms, "convergence": convergence,
            "iterations": self.n_iter, "population": self.pop_size,
            "error": msg,
        }


# ---------------------------------------------------------------------------
# Multi-Vehicle VRP GA Solver
# ---------------------------------------------------------------------------

def solve_vrp_ga(
    instance: Any,
    weights: Optional[Dict[str, float]] = None,
    generations: Optional[int] = None,
    population_size: Optional[int] = None,
    seed: Optional[int] = None,
    callback: Optional[Callable[[int, float], None]] = None,
) -> Any:
    """
    Solve a multi-vehicle VRP instance using a Genetic Algorithm.

    Reuses permutation representation with vehicle split markers, tournament
    selection, Order Crossover (OX), swap/inversion mutations, and elitism.

    Args:
        instance: VRPInstance defining stops, vehicles, and depot.
        weights: Objective weights for time, distance, congestion.
        generations: Number of GA generations.
        population_size: Population size.
        seed: Random seed for reproducibility.

    Returns:
        VRPSolution with best routes, fitness, violations, and convergence curve.
    """
    from backend.optimization.fitness import vrp_fitness
    from backend.optimization.vrp_models import VRPSolution
    from backend.optimization.qpso import (
        _VRPSplitMarker,
        _decode_vrp_chromosome,
        _encode_vrp_chromosome,
        _vrp_order_crossover,
        _vrp_mutate,
        _nearest_neighbor_vrp,
    )

    n_gen = generations if generations is not None and generations > 0 else 50
    pop_size = population_size if population_size is not None and population_size > 0 else 30
    rng = np.random.default_rng(seed if seed is not None else 42)

    customer_stops = [s.id for s in instance.stops if s.id != instance.depot_id]
    vehicle_ids = [v.id for v in instance.vehicles]

    if not customer_stops:
        empty_sol = VRPSolution(routes={v: [] for v in vehicle_ids})
        fitness, violations = vrp_fitness(empty_sol, instance, weights)
        empty_sol.fitness = fitness
        empty_sol.violations = violations
        return empty_sol

    if not vehicle_ids:
        return VRPSolution()

    num_vehicles = len(vehicle_ids)
    base_delims = [_VRPSplitMarker(i) for i in range(1, num_vehicles)]
    all_genes = customer_stops + base_delims

    # Population initialization
    population: List[List[Any]] = []

    # Individual 0: Nearest-neighbor heuristic
    nn_routes = _nearest_neighbor_vrp(instance)
    population.append(_encode_vrp_chromosome(nn_routes, vehicle_ids))

    # Individual 1: Balanced partition
    if pop_size > 1:
        shuffled = list(customer_stops)
        rng.shuffle(shuffled)
        balanced_routes: Dict[Any, List[Any]] = {v: [] for v in vehicle_ids}
        for idx, cid in enumerate(shuffled):
            balanced_routes[vehicle_ids[idx % num_vehicles]].append(cid)
        population.append(_encode_vrp_chromosome(balanced_routes, vehicle_ids))

    # Remaining individuals: Random permutations
    while len(population) < pop_size:
        p = list(all_genes)
        rng.shuffle(p)
        population.append(p)

    def _eval(chrom: List[Any]) -> Tuple[float, VRPSolution]:
        routes = _decode_vrp_chromosome(chrom, vehicle_ids)
        sol = VRPSolution(routes=routes)
        fit, violations = vrp_fitness(sol, instance, weights)
        sol.fitness = fit
        sol.violations = violations
        return fit, sol

    fitnesses: List[float] = []
    solutions: List[VRPSolution] = []
    for chrom in population:
        f, s = _eval(chrom)
        fitnesses.append(f)
        solutions.append(s)

    best_idx = int(np.argmin(fitnesses))
    best_chrom = list(population[best_idx])
    best_fitness = fitnesses[best_idx]
    best_solution = solutions[best_idx]

    convergence: List[Dict[str, Any]] = [
        {"iteration": 0, "best_cost": round(best_fitness, 6)}
    ]
    if callback is not None:
        try:
            callback(0, float(best_fitness))
        except Exception as e:
            pass

    for gen in range(1, n_gen + 1):
        new_population: List[List[Any]] = []
        new_fitnesses: List[float] = []
        new_solutions: List[VRPSolution] = []

        # Elitism: Keep top 2 individuals
        sorted_indices = np.argsort(fitnesses)
        for elitism_idx in sorted_indices[: min(2, len(population))]:
            new_population.append(list(population[elitism_idx]))
            new_fitnesses.append(fitnesses[elitism_idx])
            new_solutions.append(solutions[elitism_idx])

        # Breed rest of population
        while len(new_population) < pop_size:
            # Tournament selection (k=3)
            p1_idx = int(rng.choice(len(population)))
            p2_idx = int(rng.choice(len(population)))
            p3_idx = int(rng.choice(len(population)))
            parent_a = population[min([p1_idx, p2_idx, p3_idx], key=lambda idx: fitnesses[idx])]

            q1_idx = int(rng.choice(len(population)))
            q2_idx = int(rng.choice(len(population)))
            q3_idx = int(rng.choice(len(population)))
            parent_b = population[min([q1_idx, q2_idx, q3_idx], key=lambda idx: fitnesses[idx])]

            child = _vrp_order_crossover(parent_a, parent_b, rng)
            child = _vrp_mutate(child, rng, mutation_rate=0.35)

            fit, sol = _eval(child)
            new_population.append(child)
            new_fitnesses.append(fit)
            new_solutions.append(sol)

            if fit < best_fitness:
                best_fitness = fit
                best_chrom = list(child)
                best_solution = sol

        population = new_population
        fitnesses = new_fitnesses
        solutions = new_solutions

        convergence.append({"iteration": gen, "best_cost": round(best_fitness, 6)})
        if callback is not None:
            try:
                callback(gen, float(best_fitness))
            except Exception as e:
                pass

    best_solution.fitness = best_fitness
    best_solution.convergence = convergence
    return best_solution
