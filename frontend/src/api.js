/**
 * API client for Q-Commute Backend
 */

const API_BASE = window.location.origin.includes(':5173') 
  ? 'http://127.0.0.1:8080' 
  : window.location.origin;

async function apiFetch(method, endpoint, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${endpoint}`, opts);
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      errMsg = err.detail || err.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }
  return res.json();
}

export const API = {
  getHealth: () => apiFetch('GET', '/health'),
  getLocations: () => apiFetch('GET', '/locations'),
  getGraphMetrics: () => apiFetch('GET', '/network/graph-metrics'),

  optimize: (source_id, destination_id, algorithm, n_particles = 20, n_iter = 40, weight_time = 0.5, weight_dist = 0.3, weight_cong = 0.2) =>
    apiFetch('POST', '/route/optimize', {
      source_id,
      destination_id,
      algorithm,
      n_particles,
      n_iter,
      weight_time,
      weight_dist,
      weight_cong,
    }),

  reroute: (source_id, destination_id, algorithm, n_particles = 20, n_iter = 40, weight_time = 0.5, weight_dist = 0.3, weight_cong = 0.2) =>
    apiFetch('POST', '/route/reroute', {
      source_id,
      destination_id,
      algorithm,
      n_particles,
      n_iter,
      weight_time,
      weight_dist,
      weight_cong,
    }),

  simulateTraffic: (event_type, severity, source_id, destination_id, current_route) =>
    apiFetch('POST', '/traffic/simulate', { event_type, severity, source_id, destination_id, current_route }),

  resetTraffic: () => apiFetch('POST', '/traffic/reset'),

  benchmark: (source_id, destination_id, algorithms, n_particles = 20, n_iter = 40, weight_time = 0.5, weight_dist = 0.3, weight_cong = 0.2) =>
    apiFetch('POST', '/benchmark/compare', {
      source_id,
      destination_id,
      algorithms,
      n_particles,
      n_iter,
      weight_time,
      weight_dist,
      weight_cong,
    }),

  // History & SQLite Endpoints
  getRouteHistory: (limit = 20) => apiFetch('GET', `/history/routes?limit=${limit}`),
  getBenchmarkHistory: (limit = 10) => apiFetch('GET', `/history/benchmarks?limit=${limit}`),
  getDbStats: () => apiFetch('GET', '/history/stats'),

  // Matplotlib plot URLs
  getPlotConvergenceUrl: (src, dst, p = 20, it = 40) => `${API_BASE}/analytics/plot/convergence?source_id=${src}&destination_id=${dst}&n_particles=${p}&n_iter=${it}&t=${Date.now()}`,
  getPlotBenchmarkUrl: (src, dst) => `${API_BASE}/analytics/plot/benchmark?source_id=${src}&destination_id=${dst}&t=${Date.now()}`,
  getPlotRadarUrl: () => `${API_BASE}/analytics/plot/radar?t=${Date.now()}`,
};