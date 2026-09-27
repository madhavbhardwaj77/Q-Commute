import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import RoutePlanner from './components/RoutePlanner';
import TrafficSimulator from './components/TrafficSimulator';
import MapView from './components/MapView';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import MatplotlibModal from './components/MatplotlibModal';
import FleetSetup from './components/FleetSetup';
import FleetResults from './components/FleetResults';
import ScenarioOrchestratorView from './components/ScenarioOrchestratorView';
import { API } from './api';

export default function App() {
  const [locations, setLocations] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [algorithm, setAlgorithm] = useState('QPSO');
  const [particles, setParticles] = useState(20);
  const [iterations, setIterations] = useState(40);
  const [weights, setWeights] = useState({ time: 0.5, dist: 0.3, cong: 0.2 });

  const [eventType, setEventType] = useState('congestion');
  const [severity, setSeverity] = useState('severe');
  const [activeEvents, setActiveEvents] = useState([]);

  const [activeRoute, setActiveRoute] = useState(null);
  const [previousRoute, setPreviousRoute] = useState(null);
  const [rerouteDiff, setRerouteDiff] = useState(null);
  const [comparisonRoutes, setComparisonRoutes] = useState(null);
  const [trafficIncident, setTrafficIncident] = useState(null);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [graphMetrics, setGraphMetrics] = useState(null);

  const [activeTab, setActiveTab] = useState('metrics');
  const [status, setStatus] = useState('loading');
  const [loading, setLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Mode Selection: 'single' (Point-to-Point) or 'fleet' (Multi-Vehicle VRP)
  const [mode, setMode] = useState('single');
  const [fleetParams, setFleetParams] = useState({
    numVehicles: 2,
    capacity: 15.0,
    algorithm: 'QPSO',
    useOrchestrator: true,
    urgency: 'standard',
    iterations: 40,
    swarmSize: 25,
    stops: [
      { id: 'connaught_place', name: 'Connaught Place (Depot)', lat: 28.6329, lon: 77.2195, demand: 0.0 },
      { id: 'india_gate', name: 'India Gate', lat: 28.6129, lon: 77.2295, demand: 3.0, time_window_start: 100, time_window_end: 800 },
      { id: 'jantar_mantar', name: 'Jantar Mantar', lat: 28.6270, lon: 77.2166, demand: 2.0, time_window_start: 50, time_window_end: 600 },
      { id: 'new_delhi_railway', name: 'New Delhi Rly Station', lat: 28.6419, lon: 77.2197, demand: 4.0, time_window_start: 150, time_window_end: 900 },
      { id: 'barakhamba_road', name: 'Barakhamba Road', lat: 28.6313, lon: 77.2279, demand: 2.5, time_window_start: 80, time_window_end: 700 },
      { id: 'mandi_house', name: 'Mandi House', lat: 28.6236, lon: 77.2337, demand: 3.5, time_window_start: 120, time_window_end: 850 },
      { id: 'khan_market', name: 'Khan Market', lat: 28.6004, lon: 77.2270, demand: 4.0, time_window_start: 200, time_window_end: 1000 },
      { id: 'national_museum', name: 'National Museum', lat: 28.6117, lon: 77.2197, demand: 2.0, time_window_start: 100, time_window_end: 750 },
    ],
    depotId: 'connaught_place',
    weights: { time: 0.5, dist: 0.3, cong: 0.2 },
  });
  const [fleetResult, setFleetResult] = useState(null);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [liveConvergence, setLiveConvergence] = useState([]);

  // AI Orchestrator mode — active route from scenario optimization
  const [scenarioMapRoute, setScenarioMapRoute] = useState(null);


  // Load locations and graph properties on initial mount
  useEffect(() => {
    async function startup() {
      try {
        const health = await API.getHealth();
        if (health.status === 'ok') setStatus('ready');
      } catch (_) {
        setStatus('error');
      }

      try {
        const [locs, metrics] = await Promise.all([
          API.getLocations(),
          API.getGraphMetrics(),
        ]);
        setLocations(locs);
        setGraphMetrics(metrics);
        if (locs.length >= 2) {
          setSourceId(locs[0].id);
          setDestinationId(locs[1].id);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }
    startup();
  }, []);

  const handleSwap = () => {
    const tmp = sourceId;
    setSourceId(destinationId);
    setDestinationId(tmp);
  };

  const handleWeightChange = (key, val) => {
    setWeights((prev) => ({ ...prev, [key]: val }));
  };

  // Optimize Route
  const handleOptimize = async () => {
    if (!sourceId || !destinationId || sourceId === destinationId) return;
    setLoading(true);
    setComparisonRoutes(null);
    setActiveTab('metrics');
    try {
      const res = await API.optimize(
        sourceId,
        destinationId,
        algorithm,
        particles,
        iterations,
        weights.time,
        weights.dist,
        weights.cong
      );
      if (res.valid) {
        if (activeRoute) {
          setPreviousRoute(activeRoute);
        }
        setActiveRoute(res);
        setRerouteDiff(null);
      }
    } catch (e) {
      console.error('Optimization error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Run Benchmark
  const handleBenchmark = async () => {
    if (!sourceId || !destinationId || sourceId === destinationId) return;
    setLoading(true);
    setActiveTab('benchmark');
    try {
      const data = await API.benchmark(
        sourceId,
        destinationId,
        ['QPSO', 'Dijkstra', 'Genetic Algorithm'],
        particles,
        iterations,
        weights.time,
        weights.dist,
        weights.cong
      );
      setBenchmarkData(data);

      const routes = {};
      data.results.filter((r) => r.valid).forEach((r) => {
        if (r.coordinates) routes[r.algorithm] = r.coordinates;
      });
      setComparisonRoutes(routes);
      setActiveRoute(null);
      setPreviousRoute(null);
    } catch (e) {
      console.error('Benchmark error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Apply Traffic Event
  const handleApplyTraffic = async () => {
    if (!sourceId || !destinationId) return;
    setLoading(true);
    try {
      const path = activeRoute?.path || [];
      const res = await API.simulateTraffic(eventType, severity, sourceId, destinationId, path);
      if (res.success) {
        setTrafficIncident(res);
        setActiveEvents((prev) => [res, ...prev]);
      }
    } catch (e) {
      console.error('Traffic simulation error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Dynamic Reroute
  const handleReroute = async () => {
    if (!sourceId || !destinationId) return;
    setLoading(true);
    setActiveTab('metrics');
    try {
      const res = await API.reroute(
        sourceId,
        destinationId,
        algorithm,
        particles,
        iterations,
        weights.time,
        weights.dist,
        weights.cong
      );
      if (res.new_route?.valid) {
        setPreviousRoute(activeRoute || res.previous_route);
        setActiveRoute(res.new_route);
        setRerouteDiff(res.diff);
      }
    } catch (e) {
      console.error('Rerouting error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Reset Demo
  const handleReset = async () => {
    setLoading(true);
    try {
      await API.resetTraffic();
      setActiveRoute(null);
      setPreviousRoute(null);
      setRerouteDiff(null);
      setComparisonRoutes(null);
      setTrafficIncident(null);
      setActiveEvents([]);
    } catch (e) {
      console.error('Reset error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Fleet VRP Optimization
  const handleFleetOptimize = async () => {
    setFleetLoading(true);
    setLiveConvergence([]);

    const payload = {
      stops: fleetParams.stops.map((s) => ({
        id: s.id,
        lat: s.lat,
        lon: s.lon,
        demand: s.demand,
        time_window_start: s.time_window_start,
        time_window_end: s.time_window_end,
      })),
      vehicles: Array.from({ length: fleetParams.numVehicles }, (_, i) => ({
        id: `v${i + 1}`,
        capacity: fleetParams.capacity,
        start_depot_id: fleetParams.depotId,
      })),
      depot_id: fleetParams.depotId,
      algorithm: fleetParams.algorithm,
      profile: fleetParams.profile || 'delivery',
      custom_weights: fleetParams.profile === 'custom' ? fleetParams.weights : null,
      iterations: fleetParams.iterations,
      swarm_size: fleetParams.swarmSize,
      weights: fleetParams.weights,
      context: {
        urgency: fleetParams.urgency || 'standard',
        previous_solution: fleetResult?.routes,
      },
      previous_solution: fleetResult?.routes,
    };

    // If small single-vehicle instance under orchestrator, exact solver runs immediately
    const isSmallExact = fleetParams.useOrchestrator !== false && fleetParams.stops.length <= 10 && fleetParams.numVehicles === 1;

    if (isSmallExact) {
      try {
        const res = await API.solveOrchestrator(payload);
        setFleetResult(res);
      } catch (e) {
        console.error('Orchestrator error:', e);
      } finally {
        setFleetLoading(false);
      }
      return;
    }

    // Stream live convergence via WebSocket with HTTP fallback
    try {
      API.streamFleetOptimize(
        payload,
        (iteration, bestFitness) => {
          setLiveConvergence((prev) => [...prev, { iteration, best_cost: bestFitness }]);
        },
        (res) => {
          if (fleetParams.useOrchestrator !== false) {
            res.solver_used = fleetParams.urgency === 'live_reroute' ? 'qpso_warm_start' : 'qpso_vrp';
            res.solver_reason = fleetParams.urgency === 'live_reroute'
              ? 'time-sensitive reroute, using fast warm-started QPSO'
              : 'default: full QPSO-VRP';
          }
          setFleetResult(res);
          setFleetLoading(false);
        },
        async (err) => {
          console.warn('WebSocket stream error, falling back to HTTP:', err);
          try {
            const res = fleetParams.useOrchestrator !== false
              ? await API.solveOrchestrator(payload)
              : await API.optimizeFleet(payload);
            setFleetResult(res);
          } catch (e) {
            console.error('Optimization fallback error:', e);
          } finally {
            setFleetLoading(false);
          }
        }
      );
    } catch (err) {
      console.warn('Streaming error, falling back:', err);
      try {
        const res = fleetParams.useOrchestrator !== false
          ? await API.solveOrchestrator(payload)
          : await API.optimizeFleet(payload);
        setFleetResult(res);
      } catch (e) {
        console.error('Fallback error:', e);
      } finally {
        setFleetLoading(false);
      }
    }
  };

  const sourceLoc = locations.find((l) => l.id === sourceId);
  const destLoc = locations.find((l) => l.id === destinationId);

  return (
    <div className="flex flex-col h-screen w-screen bg-base-200 text-base-content overflow-hidden font-sans">
      <Header status={status} onOpenReport={() => setShowReportModal(true)} />

      {/* Top Mode Selection Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-base-100 border-b border-base-300">
        <div className="tabs tabs-boxed bg-base-200/80 p-0.5 rounded-lg flex gap-1">
          <button
            type="button"
            className={`tab tab-sm font-bold text-xs rounded-md transition-all ${
              mode === 'single' ? 'tab-active !bg-primary !text-primary-content shadow-sm' : 'text-base-content/70'
            }`}
            onClick={() => setMode('single')}
          >
            🚗 Single-Route Optimization
          </button>
          <button
            type="button"
            className={`tab tab-sm font-bold text-xs rounded-md transition-all ${
              mode === 'fleet' ? 'tab-active !bg-primary !text-primary-content shadow-sm' : 'text-base-content/70'
            }`}
            onClick={() => setMode('fleet')}
          >
            🚚 Multi-Vehicle VRP Mode
          </button>
          <button
            type="button"
            className={`tab tab-sm font-bold text-xs rounded-md transition-all ${
              mode === 'orchestrator' ? 'tab-active !bg-secondary !text-secondary-content shadow-sm' : 'text-base-content/70'
            }`}
            onClick={() => setMode('orchestrator')}
          >
            🧠 AI Orchestrator & Quantum Benchmark
          </button>
        </div>
        <div className="text-[11px] text-base-content/60 font-mono hidden md:block">
          {mode === 'single'
            ? 'Point-A-to-B • QPSO vs GA vs Dijkstra • Traffic Congestion'
            : mode === 'fleet'
            ? 'Multi-Vehicle Fleet • Capacity & Time-Window Constraints • QPSO Swarm'
            : 'AI Scenario Analysis • Quantum vs Classical Benchmarking • NLP + Filters'}
        </div>
      </div>

      {/* 3-Column Workspace Layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[330px_1fr_380px] overflow-hidden p-3 gap-3">
        {/* Left Column: Route Planner & Traffic Simulation (Single) OR Fleet Setup (Fleet) OR AI Orchestrator (orchestrator) */}
        <div className="flex flex-col gap-3 overflow-y-auto pr-0.5">
          {mode === 'single' ? (
            <>
              <RoutePlanner
                locations={locations}
                sourceId={sourceId}
                destinationId={destinationId}
                algorithm={algorithm}
                particles={particles}
                iterations={iterations}
                weights={weights}
                onSourceChange={setSourceId}
                onDestinationChange={setDestinationId}
                onSwap={handleSwap}
                onAlgorithmChange={setAlgorithm}
                onParticlesChange={setParticles}
                onIterationsChange={setIterations}
                onWeightChange={handleWeightChange}
                onOptimize={handleOptimize}
                onBenchmark={handleBenchmark}
                loading={loading}
              />

              <TrafficSimulator
                eventType={eventType}
                severity={severity}
                onEventTypeChange={setEventType}
                onSeverityChange={setSeverity}
                onApplyTraffic={handleApplyTraffic}
                onReroute={handleReroute}
                onReset={handleReset}
                activeEvents={activeEvents}
                canReroute={Boolean(activeRoute && activeEvents.length > 0)}
                loading={loading}
              />
            </>
          ) : mode === 'fleet' ? (
            <FleetSetup
              onOptimize={handleFleetOptimize}
              loading={fleetLoading}
              fleetParams={fleetParams}
              setFleetParams={setFleetParams}
            />
          ) : (
            /* AI Orchestrator & Quantum Benchmark Hub */
            <ScenarioOrchestratorView
              fleetParams={fleetParams}
              onApplyRoute={(routeResult) => {
                // Push route coordinates into the map as a fleet-style overlay
                setScenarioMapRoute(routeResult);
              }}
            />
          )}
        </div>

        {/* Center Column: Interactive Leaflet Map */}
        <div className="card bg-base-100 border border-base-300 shadow-sm overflow-hidden h-full min-h-0 relative">
          <MapView
            sourceLoc={sourceLoc}
            destLoc={destLoc}
            activeRoute={activeRoute}
            previousRoute={previousRoute}
            comparisonRoutes={comparisonRoutes}
            trafficIncident={trafficIncident}
            isFleetMode={mode === 'fleet' || mode === 'orchestrator'}
            fleetRoutes={
              mode === 'orchestrator'
                ? scenarioMapRoute?.route_coordinates
                : fleetResult?.route_coordinates
            }
            fleetStops={fleetParams.stops}
            fleetDepotId={fleetParams.depotId}
          />
        </div>

        {/* Right Column: Analytics (Single) OR Fleet Results (Fleet) OR Orchestrator Info (orchestrator) */}
        <div className="flex flex-col overflow-hidden h-full">
          {mode === 'single' ? (
            <AnalyticsDashboard
              activeTab={activeTab}
              onTabChange={setActiveTab}
              routeResult={activeRoute}
              rerouteDiff={rerouteDiff}
              benchmarkData={benchmarkData}
              graphMetrics={graphMetrics}
              loading={loading}
              onOpenReport={() => setShowReportModal(true)}
            />
          ) : mode === 'fleet' ? (
            <FleetResults
              result={fleetResult}
              loading={fleetLoading}
              liveConvergence={liveConvergence}
            />
          ) : (
            /* Orchestrator Mode: Route Metrics Summary Panel */
            <div className="card bg-base-100 border border-base-300 p-3.5 shadow-sm flex flex-col gap-3 flex-1 overflow-y-auto">
              <div className="flex items-center gap-2 border-b border-base-200 pb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                  🧠 AI Orchestrator — Route Summary
                </span>
              </div>

              {scenarioMapRoute ? (
                <>
                  {/* Algorithm Badge */}
                  <div className="bg-secondary/10 border border-secondary/30 rounded-xl p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-secondary">Optimized By</span>
                      <span className="badge badge-secondary badge-sm font-bold font-mono text-[10px]">
                        {scenarioMapRoute.algorithm || scenarioMapRoute.solver_used || 'AI Recommended'}
                      </span>
                    </div>
                    {scenarioMapRoute.solver_reason && (
                      <p className="text-[10px] text-base-content/80 leading-relaxed">
                        {scenarioMapRoute.solver_reason}
                      </p>
                    )}
                  </div>

                  {/* Key Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-base-200/60 rounded-xl p-2.5 border border-base-300 text-center">
                      <div className="text-[9px] uppercase font-bold text-base-content/60 mb-0.5">Distance</div>
                      <div className="text-sm font-black font-mono text-primary">
                        {scenarioMapRoute.total_distance > 1000
                          ? `${(scenarioMapRoute.total_distance / 1000).toFixed(2)} km`
                          : `${scenarioMapRoute.total_distance?.toFixed(0)} m`}
                      </div>
                    </div>
                    <div className="bg-base-200/60 rounded-xl p-2.5 border border-base-300 text-center">
                      <div className="text-[9px] uppercase font-bold text-base-content/60 mb-0.5">Travel Time</div>
                      <div className="text-sm font-black font-mono text-warning">
                        {scenarioMapRoute.total_time?.toFixed(1)} s
                      </div>
                    </div>
                    <div className="bg-base-200/60 rounded-xl p-2.5 border border-base-300 text-center">
                      <div className="text-[9px] uppercase font-bold text-base-content/60 mb-0.5">Congestion</div>
                      <div className="text-sm font-black font-mono text-error">
                        {scenarioMapRoute.total_congestion?.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-base-200/60 rounded-xl p-2.5 border border-base-300 text-center">
                      <div className="text-[9px] uppercase font-bold text-base-content/60 mb-0.5">CO2</div>
                      <div className="text-sm font-black font-mono text-success">
                        {scenarioMapRoute.estimated_co2_kg?.toFixed(3)} kg
                      </div>
                    </div>
                  </div>

                  {/* Runtime */}
                  <div className="bg-base-200/40 rounded-lg p-2 border border-base-200 flex items-center justify-between text-[10px]">
                    <span className="text-base-content/70 font-bold">Solver Runtime</span>
                    <span className="font-mono font-bold text-primary">
                      {scenarioMapRoute.runtime_ms > 1000
                        ? `${(scenarioMapRoute.runtime_ms / 1000).toFixed(2)} s`
                        : `${scenarioMapRoute.runtime_ms?.toFixed(0)} ms`}
                    </span>
                  </div>

                  {/* Per-Vehicle Routes */}
                  {scenarioMapRoute.routes && Object.keys(scenarioMapRoute.routes).length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold uppercase text-base-content/70">Vehicle Routes</span>
                      {Object.entries(scenarioMapRoute.routes).map(([vid, stops]) => (
                        <div key={vid} className="bg-base-200/50 rounded-lg px-2.5 py-1.5 border border-base-300 text-[10px] flex flex-col gap-0.5">
                          <span className="font-bold text-primary">{vid}</span>
                          <span className="font-mono text-base-content/70 truncate">
                            {Array.isArray(stops) ? stops.join(' → ') : '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Violations */}
                  {scenarioMapRoute.violations?.length > 0 && (
                    <div className="alert alert-warning py-1.5 px-2 rounded-lg text-[10px]">
                      <span>⚠️ {scenarioMapRoute.violations.length} constraint violation(s) detected</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center gap-2 py-8">
                  <span className="text-4xl">🧠</span>
                  <p className="text-[11px] text-base-content/60 max-w-[200px] leading-relaxed">
                    Select a preset or type your scenario in the left panel, then click <b>Analyze Scenario & Optimize Route</b>.
                  </p>
                  <p className="text-[10px] text-secondary/80 font-mono">
                    The AI Orchestrator will choose the optimal quantum or classical algorithm and render the route on the map.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Matplotlib Publication Report Modal */}
      <MatplotlibModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        sourceId={sourceId}
        destinationId={destinationId}
        particles={particles}
        iterations={iterations}
      />
    </div>
  );
}