import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import RoutePlanner from './components/RoutePlanner';
import TrafficSimulator from './components/TrafficSimulator';
import MapView from './components/MapView';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import MatplotlibModal from './components/MatplotlibModal';
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

  const sourceLoc = locations.find((l) => l.id === sourceId);
  const destLoc = locations.find((l) => l.id === destinationId);

  return (
    <div className="flex flex-col h-screen w-screen bg-base-200 text-base-content overflow-hidden font-sans">
      <Header status={status} onOpenReport={() => setShowReportModal(true)} />

      {/* 3-Column Workspace Layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[320px_1fr_380px] overflow-hidden p-3 gap-3">
        {/* Left Column: Route Planner & Traffic Simulation */}
        <div className="flex flex-col gap-3 overflow-y-auto pr-0.5">
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
          />
        </div>

        {/* Right Column: Comprehensive Analytics & Visualizations */}
        <div className="flex flex-col overflow-hidden">
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