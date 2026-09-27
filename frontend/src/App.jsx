import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import RoutePlanner from './components/RoutePlanner';
import TrafficSimulator from './components/TrafficSimulator';
import MapView from './components/MapView';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import MatplotlibModal from './components/MatplotlibModal';
import FleetSetup from './components/FleetSetup';
import FleetResults from './components/FleetResults';
import AlgorithmBenchmarkView from './components/AlgorithmBenchmarkView';
import BenchmarkAnalysisDashboard from './components/BenchmarkAnalysisDashboard';
import { API } from './api';

export default function App() {
  const [locations, setLocations] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [destinationIds, setDestinationIds] = useState([]);
  const [optimizeOrder, setOptimizeOrder] = useState(true);
  const [roundTrip, setRoundTrip] = useState(false);
  const [algorithm, setAlgorithm] = useState('AI Orchestrator');
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

  // Algorithm Benchmarking state — suite results & active map route
  const [benchmarkSuiteResult, setBenchmarkSuiteResult] = useState(null);
  const [benchmarkMapRoute, setBenchmarkMapRoute] = useState(null);
  const [activeBenchmarkAlgo, setActiveBenchmarkAlgo] = useState(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);


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
          setDestinationIds([locs[1].id]);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }
    startup();
  }, []);

  const handleDestinationChange = (index, newDestId) => {
    setDestinationIds((prev) => {
      const next = [...prev];
      next[index] = newDestId;
      if (index === 0) setDestinationId(newDestId);
      return next;
    });
  };

  const handleAddDestination = () => {
    const existing = new Set([sourceId, ...destinationIds]);
    const candidate = locations.find((l) => !existing.has(l.id)) || locations[0];
    if (candidate) {
      setDestinationIds((prev) => [...prev, candidate.id]);
    }
  };

  const handleRemoveDestination = (index) => {
    if (destinationIds.length <= 1) return;
    setDestinationIds((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (index === 0 && next.length > 0) setDestinationId(next[0]);
      return next;
    });
  };

  const handleReorderDestinations = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= destinationIds.length) return;
    setDestinationIds((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      if (toIdx === 0 || fromIdx === 0) setDestinationId(next[0]);
      return next;
    });
  };

  const handleSwap = () => {
    if (destinationIds.length <= 1) {
      const tmp = sourceId;
      setSourceId(destinationId);
      setDestinationId(tmp);
      setDestinationIds([tmp]);
    } else {
      const firstDest = destinationIds[0];
      const newDests = [sourceId, ...destinationIds.slice(1)];
      setSourceId(firstDest);
      setDestinationId(newDests[0]);
      setDestinationIds(newDests);
    }
  };

  const handleWeightChange = (key, val) => {
    setWeights((prev) => ({ ...prev, [key]: val }));
  };

  // Optimize Route (Single or Multi-Destination)
  const handleOptimize = async () => {
    const dests = destinationIds.length > 0 ? destinationIds : (destinationId ? [destinationId] : []);
    if (!sourceId || dests.length === 0) return;
    setLoading(true);
    setComparisonRoutes(null);
    setActiveTab('metrics');
    try {
      const res = await API.optimize(
        sourceId,
        dests[0],
        algorithm,
        particles,
        iterations,
        weights.time,
        weights.dist,
        weights.cong,
        dests,
        optimizeOrder,
        roundTrip
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

  // Run Benchmark (Single or Multi-Destination)
  const handleBenchmark = async () => {
    const dests = destinationIds.length > 0 ? destinationIds : (destinationId ? [destinationId] : []);
    if (!sourceId || dests.length === 0) return;
    setLoading(true);
    setActiveTab('benchmark');
    try {
      const data = await API.benchmark(
        sourceId,
        dests[0],
        ['QPSO', 'Dijkstra', 'Genetic Algorithm'],
        particles,
        iterations,
        weights.time,
        weights.dist,
        weights.cong,
        dests,
        optimizeOrder,
        roundTrip
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
    const finalDest = destinationIds.length > 0 ? destinationIds[destinationIds.length - 1] : destinationId;
    if (!sourceId || !finalDest) return;
    setLoading(true);
    try {
      const path = activeRoute?.path || [];
      const res = await API.simulateTraffic(eventType, severity, sourceId, finalDest, path);
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

  // Dynamic Reroute (Single or Multi-Destination)
  const handleReroute = async () => {
    const dests = destinationIds.length > 0 ? destinationIds : (destinationId ? [destinationId] : []);
    if (!sourceId || dests.length === 0) return;
    setLoading(true);
    setActiveTab('metrics');
    try {
      const res = await API.reroute(
        sourceId,
        dests[0],
        algorithm,
        particles,
        iterations,
        weights.time,
        weights.dist,
        weights.cong,
        dests,
        optimizeOrder,
        roundTrip
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

    // If user selected AI Orchestrator:
    if (fleetParams.useOrchestrator !== false) {
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

    const algoUpper = (fleetParams.algorithm || '').toUpperCase();
    const isDirectSolver = algoUpper.includes('EXACT') || algoUpper.includes('ANNEAL') || algoUpper.includes('QAOA');

    if (isDirectSolver) {
      try {
        const res = await API.optimizeFleet(payload);
        setFleetResult(res);
      } catch (e) {
        console.error('Fleet optimization error:', e);
      } finally {
        setFleetLoading(false);
      }
      return;
    }

    // Stream live convergence via WebSocket for swarm/metaheuristic solvers (QPSO, GA)
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
  const destinationLocs = destinationIds
    .map((id) => locations.find((l) => l.id === id))
    .filter(Boolean);

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
            🚗 Route Optimization
          </button>
          <button
            type="button"
            className={`tab tab-sm font-bold text-xs rounded-md transition-all ${
              mode === 'fleet' ? 'tab-active !bg-primary !text-primary-content shadow-sm' : 'text-base-content/70'
            }`}
            onClick={() => setMode('fleet')}
          >
            🚚 Multi-Vehicle Route Optimization
          </button>
          <button
            type="button"
            className={`tab tab-sm font-bold text-xs rounded-md transition-all ${
              mode === 'benchmark' ? 'tab-active !bg-secondary !text-secondary-content shadow-sm' : 'text-base-content/70'
            }`}
            onClick={() => setMode('benchmark')}
          >
            📊 Algorithm Benchmarking
          </button>
        </div>
        <div className="text-[11px] text-base-content/60 font-mono hidden md:block">
          {mode === 'single'
            ? 'Point-to-Point & Multi-Stop • QPSO vs GA vs Dijkstra • Traffic Congestion'
            : mode === 'fleet'
            ? 'Multi-Vehicle Fleet • Capacity & Time-Window Constraints • QPSO Swarm'
            : 'Comparative Performance Analysis • Classical, Exact & Quantum Solvers'}
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
                destinationIds={destinationIds}
                optimizeOrder={optimizeOrder}
                roundTrip={roundTrip}
                algorithm={algorithm}
                particles={particles}
                iterations={iterations}
                weights={weights}
                onSourceChange={setSourceId}
                onDestinationChange={handleDestinationChange}
                onAddDestination={handleAddDestination}
                onRemoveDestination={handleRemoveDestination}
                onReorderDestinations={handleReorderDestinations}
                onOptimizeOrderChange={setOptimizeOrder}
                onRoundTripChange={setRoundTrip}
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
              locations={locations}
            />
          ) : (
            /* Algorithm Benchmarking Control Panel */
            <AlgorithmBenchmarkView
              locations={locations}
              onBenchmarkComplete={(result) => {
                setBenchmarkSuiteResult(result);
                if (result?.suggested_algorithm) {
                  setActiveBenchmarkAlgo(result.suggested_algorithm);
                }
              }}
              onApplyRoute={(routeResult) => {
                setBenchmarkMapRoute(routeResult);
                if (routeResult?.algorithm) {
                  setActiveBenchmarkAlgo(routeResult.algorithm);
                }
              }}
            />
          )}
        </div>

        {/* Center Column: Interactive Leaflet Map */}
        <div className="card bg-base-100 border border-base-300 shadow-sm overflow-hidden h-full min-h-0 relative">
          <MapView
            sourceLoc={sourceLoc}
            destLoc={destLoc}
            destinationLocs={destinationLocs}
            activeRoute={activeRoute}
            previousRoute={previousRoute}
            comparisonRoutes={comparisonRoutes}
            trafficIncident={trafficIncident}
            isFleetMode={mode === 'fleet' || mode === 'benchmark'}
            fleetRoutes={
              mode === 'benchmark'
                ? benchmarkMapRoute?.route_coordinates
                : fleetResult?.route_coordinates
            }
            fleetStops={
              mode === 'benchmark'
                ? (benchmarkMapRoute?.activeStops || benchmarkSuiteResult?.selectedStops || [])
                : fleetParams.stops
            }
            fleetDepotId={
              mode === 'benchmark'
                ? (benchmarkSuiteResult?.sourceId || 'connaught_place')
                : fleetParams.depotId
            }
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
            /* Algorithm Benchmarking Dashboard */
            <BenchmarkAnalysisDashboard
              benchmarkResult={benchmarkSuiteResult}
              loading={benchmarkLoading}
              activeAlgo={activeBenchmarkAlgo}
              onHighlightAlgo={(item) => {
                setActiveBenchmarkAlgo(item.algorithm);
                setBenchmarkMapRoute({
                  algorithm: item.algorithm,
                  total_distance: item.total_distance,
                  total_time: item.total_time,
                  route_coordinates: item.route_coordinates || {},
                  routes: item.routes || {},
                  activeStops: benchmarkSuiteResult?.selectedStops,
                });
              }}
            />
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