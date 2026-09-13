/**
 * api.js — Q-Commute API wrappers (v2.0)
 * SIH 2026 upgrade: benchmark, graph-metrics, param sliders.
 */

const API_BASE = (window.location.protocol && window.location.protocol.startsWith('http') && window.location.origin)
  ? window.location.origin
  : 'http://127.0.0.1:8080';

async function apiFetch(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(API_BASE + path, opts);
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json.detail || json.error || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return json;
}

const API = {
  getLocations:   ()        => apiFetch('GET',  '/locations'),
  getStatus:      ()        => apiFetch('GET',  '/network/status'),
  getHealth:      ()        => apiFetch('GET',  '/health'),
  getGraphMetrics:()        => apiFetch('GET',  '/network/graph-metrics'),

  optimize: (source_id, destination_id, algorithm, n_particles=20, n_iter=40, weight_time=0.5, weight_dist=0.3, weight_cong=0.2) =>
    apiFetch('POST', '/route/optimize', { source_id, destination_id, algorithm, n_particles, n_iter, weight_time, weight_dist, weight_cong }),

  reroute: (source_id, destination_id, algorithm, n_particles=20, n_iter=40) =>
    apiFetch('POST', '/route/reroute', { source_id, destination_id, algorithm, n_particles, n_iter }),

  simulateTraffic: (event_type, severity, source_id, destination_id, current_route) =>
    apiFetch('POST', '/traffic/simulate', { event_type, severity, source_id, destination_id, current_route }),

  resetTraffic: () => apiFetch('POST', '/traffic/reset'),

  benchmark: (source_id, destination_id, algorithms, n_particles=20, n_iter=40, weight_time=0.5, weight_dist=0.3, weight_cong=0.2) =>
    apiFetch('POST', '/benchmark/compare', { source_id, destination_id, algorithms, n_particles, n_iter, weight_time, weight_dist, weight_cong }),
};
