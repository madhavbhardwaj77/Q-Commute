/**
 * app.js — Main controller for Q-Commute v2.0
 * SIH 2026 upgrade: parameter sliders, benchmark flow, tab management,
 *                   active traffic event list, animated vehicle.
 */

const State = {
  locations:     [],
  algorithm:     'QPSO',
  eventType:     'congestion',
  currentRoute:  null,
  previousRoute: null,
  trafficApplied: false,
  n_particles:   20,
  n_iter:        40,
  weight_time:   0.5,
  weight_dist:   0.3,
  weight_cong:   0.2,
};

// ── Startup ───────────────────────────────────────────────────────────────────
async function init() {
  MapView.init();
  bindEvents();
  UI.setStatus('loading', 'Connecting…');
  await waitForBackend();
  await loadLocations();
  loadGraphMetrics();
  UI.setStatus('ready', 'Graph Ready');
  UI.toast('Q-Commute ready — select route and run QPSO!', 'success');
}

async function waitForBackend(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const h = await API.getHealth();
      if (h.graph_ready) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1500));
  }
  UI.setStatus('error', 'Backend unreachable');
}

async function loadLocations() {
  try {
    const locs = await API.getLocations();
    State.locations = locs;
    const src = $('srcSelect'), dst = $('dstSelect');
    [src, dst].forEach(el => {
      el.innerHTML = '<option value="">— Select location —</option>' +
        locs.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    });
    src.value = 'connaught_place';
    dst.value = 'india_gate';
  } catch (e) {
    UI.toast('Failed to load locations: ' + e.message, 'error');
  }
}

async function loadGraphMetrics() {
  try {
    const data = await API.getGraphMetrics();
    UI.showGraphMetrics(data);
  } catch (_) {}
}

function locById(id) {
  return State.locations.find(l => l.id === id);
}

// ── Event Bindings ────────────────────────────────────────────────────────────
function bindEvents() {
  // Algorithm tabs
  document.querySelectorAll('.algo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.algo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.algorithm = btn.dataset.algo;
    });
  });

  // Traffic event type buttons
  document.querySelectorAll('.event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.event-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.eventType = btn.dataset.event;
    });
  });

  // Swap button
  const swapBtn = $('swapBtn');
  if (swapBtn) swapBtn.addEventListener('click', () => {
    const tmp = $('srcSelect').value;
    $('srcSelect').value = $('dstSelect').value;
    $('dstSelect').value = tmp;
  });

  // Parameter sliders
  bindSlider('particlesSlider', 'particlesValue', v => { State.n_particles = +v; });
  bindSlider('iterSlider',      'iterValue',      v => { State.n_iter = +v; });
  bindSlider('weightTimeSlider','weightTimeValue',v => { State.weight_time = (+v)/100; });
  bindSlider('weightDistSlider','weightDistValue',v => { State.weight_dist = (+v)/100; });
  bindSlider('weightCongSlider','weightCongValue',v => { State.weight_cong = (+v)/100; });

  // Analytics tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => UI.switchTab(btn.dataset.tab));
  });

  // Buttons
  const optimizeBtn = $('optimizeBtn');
  if (optimizeBtn) optimizeBtn.addEventListener('click', runOptimize);

  const benchBtn = $('benchmarkBtn');
  if (benchBtn) benchBtn.addEventListener('click', runBenchmark);

  const applyBtn = $('applyTrafficBtn');
  if (applyBtn) applyBtn.addEventListener('click', applyTraffic);

  const rerouteBtn = $('rerouteBtn');
  if (rerouteBtn) rerouteBtn.addEventListener('click', runReroute);

  const resetBtn = $('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetDemo);
}

function bindSlider(sliderId, valueId, onChange) {
  const slider = $(sliderId);
  const label  = $(valueId);
  if (!slider) return;
  slider.addEventListener('input', () => {
    if (label) label.textContent = slider.value;
    onChange(slider.value);
  });
}

// ── Optimize ──────────────────────────────────────────────────────────────────
async function runOptimize() {
  const srcId = $('srcSelect').value;
  const dstId = $('dstSelect').value;
  if (!srcId || !dstId) { UI.toast('Select source and destination.', 'warning'); return; }
  if (srcId === dstId)  { UI.toast('Source and destination must differ.', 'error');  return; }

  UI.showLoading(State.algorithm === 'QPSO' ? 'Running Quantum PSO…' : `Running ${State.algorithm}…`);
  MapView.stopAnimation();

  try {
    const result = await API.optimize(
      srcId, dstId, State.algorithm,
      State.n_particles, State.n_iter,
      State.weight_time, State.weight_dist, State.weight_cong
    );

    if (!result.valid) { UI.toast(result.error || 'Routing failed.', 'error'); return; }

    State.currentRoute  = result;
    State.previousRoute = null;

    // Map
    MapView.showCurrentRoute(result.coordinates, State.algorithm);
    const src = locById(srcId), dst = locById(dstId);
    if (src) MapView.setSource(src.lat, src.lon, src.name);
    if (dst) MapView.setDestination(dst.lat, dst.lon, dst.name);
    MapView.animateVehicle(result.coordinates);

    // UI panels
    UI.showRouteResult(result);
    if (result.convergence?.length) UI.showAlgorithmDetails(result);

    // Enable traffic buttons
    const applyBtn = $('applyTrafficBtn');
    if (applyBtn) applyBtn.disabled = false;

    const label = `${State.algorithm} route: ${(result.distance_m/1000).toFixed(2)} km, ${Math.floor(result.travel_time_s)}s`;
    UI.toast(label, 'success');
  } catch (e) {
    UI.toast('Optimization error: ' + e.message, 'error');
  } finally {
    UI.hideLoading();
  }
}

// ── Benchmark ─────────────────────────────────────────────────────────────────
async function runBenchmark() {
  const srcId = $('srcSelect').value;
  const dstId = $('dstSelect').value;
  if (!srcId || !dstId) { UI.toast('Select source and destination first.', 'warning'); return; }
  if (srcId === dstId)  { UI.toast('Source and destination must differ.', 'error');   return; }

  UI.showLoading('Running all algorithms…');
  try {
    const data = await API.benchmark(
      srcId, dstId,
      ['QPSO', 'Dijkstra', 'Genetic Algorithm'],
      State.n_particles, State.n_iter,
      State.weight_time, State.weight_dist, State.weight_cong
    );
    UI.showBenchmark(data);

    // Show all routes on map
    const routeMap = {};
    data.results.filter(r => r.valid).forEach(r => {
      if (r.coordinates) routeMap[r.algorithm] = r.coordinates;
    });
    MapView.clearAll();
    MapView.showComparisonRoutes(routeMap);
    const src = locById(srcId), dst = locById(dstId);
    if (src) MapView.setSource(src.lat, src.lon, src.name);
    if (dst) MapView.setDestination(dst.lat, dst.lon, dst.name);

    UI.toast('Benchmark complete — see Benchmark tab.', 'success');
  } catch (e) {
    UI.toast('Benchmark error: ' + e.message, 'error');
  } finally {
    UI.hideLoading();
  }
}

// ── Apply Traffic ─────────────────────────────────────────────────────────────
async function applyTraffic() {
  const srcId    = $('srcSelect').value;
  const dstId    = $('dstSelect').value;
  const severity = $('severitySelect').value;
  if (!srcId || !dstId) { UI.toast('Select locations first.', 'warning'); return; }

  const currentPath = State.currentRoute?.path ?? [];
  UI.showLoading('Applying traffic event…');
  try {
    const result = await API.simulateTraffic(
      State.eventType, severity, srcId, dstId, currentPath
    );
    if (!result.success) { UI.toast(result.message, 'error'); return; }

    State.trafficApplied = true;
    UI.addTrafficEvent(result);

    if (result.affected_coordinates?.length >= 2) {
      MapView.highlightTrafficEdge(result.affected_coordinates, State.eventType);
    }

    const rerouteBtn = $('rerouteBtn');
    if (rerouteBtn) rerouteBtn.style.display = '';

    UI.toast(result.message, 'info');
  } catch (e) {
    UI.toast('Traffic error: ' + e.message, 'error');
  } finally {
    UI.hideLoading();
  }
}

// ── Reroute ───────────────────────────────────────────────────────────────────
async function runReroute() {
  const srcId = $('srcSelect').value;
  const dstId = $('dstSelect').value;
  UI.showLoading('Recalculating route…');
  MapView.stopAnimation();
  try {
    const result = await API.reroute(srcId, dstId, State.algorithm, State.n_particles, State.n_iter);
    if (State.currentRoute) {
      MapView.showPreviousRoute(State.currentRoute.coordinates);
    }
    const newRoute = result.new_route;
    if (newRoute?.valid) {
      MapView.showCurrentRoute(newRoute.coordinates, State.algorithm);
      MapView.animateVehicle(newRoute.coordinates);
      State.previousRoute = State.currentRoute;
      State.currentRoute  = newRoute;
      UI.showRouteResult(newRoute);
    }
    UI.showRerouteComparison(result);
    const rerouteBtn = $('rerouteBtn');
    if (rerouteBtn) rerouteBtn.style.display = 'none';

    const msg = result.diff.route_changed
      ? '✅ Route rerouted successfully!'
      : '⚠️ No better alternate — original route retained.';
    UI.toast(msg, result.diff.route_changed ? 'success' : 'info');
  } catch (e) {
    UI.toast('Reroute error: ' + e.message, 'error');
  } finally {
    UI.hideLoading();
  }
}

// ── Reset Demo ────────────────────────────────────────────────────────────────
async function resetDemo() {
  try {
    await API.resetTraffic();
    State.currentRoute   = null;
    State.previousRoute  = null;
    State.trafficApplied = false;
    MapView.clearAll();
    UI.clearTrafficEvents();
    const applyBtn  = $('applyTrafficBtn');
    const rerouteBtn = $('rerouteBtn');
    const rerouteSection = $('rerouteSection');
    if (applyBtn)      applyBtn.disabled = true;
    if (rerouteBtn)    rerouteBtn.style.display = 'none';
    if (rerouteSection) rerouteSection.style.display = 'none';
    UI.toast('Demo reset — free-flow conditions restored.', 'info');
  } catch (e) {
    UI.toast('Reset error: ' + e.message, 'error');
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
