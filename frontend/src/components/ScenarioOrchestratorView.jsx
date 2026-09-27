import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Cpu,
  Play,
  CheckCircle2,
  AlertCircle,
  Zap,
  Atom,
  Clock,
  Navigation,
  Fuel,
  Leaf,
  Layers,
  Sliders,
  Award,
  Compass,
  ArrowRight,
  TrendingUp,
  BarChart3,
  HelpCircle,
  Check,
} from 'lucide-react';
import { API } from '../api';

const SOLVER_METADATA = {
  qpso: {
    label: 'Quantum-Behaved PSO',
    paradigm: 'Quantum-Inspired Swarm',
    color: 'badge-primary',
    barColor: 'bg-primary',
    desc: 'Excels at non-linear multi-vehicle fleets with congestion & emission constraints.',
  },
  quantum_annealing: {
    label: 'Quantum Annealing (Neal)',
    paradigm: 'Ising / QUBO Annealer',
    color: 'badge-secondary',
    barColor: 'bg-secondary',
    desc: 'Ultra-low latency (<30ms) combinatorial QUBO tour optimization on micro-clusters.',
  },
  exact: {
    label: 'OR-Tools CP-SAT (Exact)',
    paradigm: 'Classical Deterministic',
    color: 'badge-accent',
    barColor: 'bg-accent',
    desc: 'Mathematically provable global optimum with zero gap for instances ≤ 10 stops.',
  },
  qaoa: {
    label: 'Gate-Model QAOA',
    paradigm: 'Gate Quantum Circuit',
    color: 'badge-info',
    barColor: 'bg-info',
    desc: 'Quantum ground-state statevector optimization; requires small qubit footprint (≤ 8 stops).',
  },
  genetic: {
    label: 'Genetic Algorithm',
    paradigm: 'Classical Metaheuristic',
    color: 'badge-neutral',
    barColor: 'bg-neutral',
    desc: 'Solid evolutionary search for standard unconstrained logistics.',
  },
  dijkstra: {
    label: 'Dijkstra Shortest Path',
    paradigm: 'Classical Graph Shortest Path',
    color: 'badge-ghost',
    barColor: 'bg-base-content/40',
    desc: 'Deterministic polynomial-time single point-to-point routing.',
  },
};

export default function ScenarioOrchestratorView({
  fleetParams,
  onApplyRoute,
}) {
  const [presets, setPresets] = useState({});
  const [prompt, setPrompt] = useState(
    'Urgent ambulance dispatch during severe rush hour congestion. Bypass all traffic bottlenecks with lowest possible arrival time.'
  );
  const [targetObjective, setTargetObjective] = useState('time_critical');
  const [latencyBudget, setLatencyBudget] = useState('real_time');
  const [hardwarePreference, setHardwarePreference] = useState('auto');
  const [urgency, setUrgency] = useState('emergency');
  const [stopCountMode, setStopCountMode] = useState('micro'); // 'micro' (3 stops) or 'fleet' (7 stops)

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('decision'); // 'decision', 'optimal_route', 'benchmark'
  const [activeRenderedAlgo, setActiveRenderedAlgo] = useState(null);

  // Load presets on mount
  useEffect(() => {
    API.getScenarioPresets()
      .then(setPresets)
      .catch((e) => console.warn('Could not load presets:', e));
  }, []);

  const handleSelectPreset = (key) => {
    const p = presets[key];
    if (!p) return;
    setPrompt(p.prompt);
    if (p.filters) {
      if (p.filters.target_objective) setTargetObjective(p.filters.target_objective);
      if (p.filters.latency_budget) setLatencyBudget(p.filters.latency_budget);
      if (p.filters.hardware_preference) setHardwarePreference(p.filters.hardware_preference);
      if (p.filters.urgency) setUrgency(p.filters.urgency);
    }
    if (key === 'quantum_micro_cluster') {
      setStopCountMode('micro');
    } else if (key === 'green_multi_fleet') {
      setStopCountMode('fleet');
    }
  };

  const handleOptimize = async () => {
    setLoading(true);
    setError(null);

    // Pick active stops based on scale mode
    const allStops = fleetParams?.stops || [];
    const activeStops =
      stopCountMode === 'micro'
        ? allStops.slice(0, 3)
        : allStops.slice(0, 7);

    const activeVehicles =
      stopCountMode === 'micro'
        ? [{ id: 'v1', capacity: 30.0, start_depot_id: fleetParams?.depotId }]
        : (fleetParams?.numVehicles > 1
            ? Array.from({ length: fleetParams.numVehicles }, (_, i) => ({
                id: `v${i + 1}`,
                capacity: fleetParams.capacity || 15.0,
                start_depot_id: fleetParams.depotId,
              }))
            : [{ id: 'v1', capacity: 30.0, start_depot_id: fleetParams?.depotId }]);

    const payload = {
      prompt,
      filters: {
        target_objective: targetObjective,
        latency_budget: latencyBudget,
        hardware_preference: hardwarePreference,
        urgency,
      },
      stops: activeStops.map((s) => ({
        id: s.id,
        lat: s.lat,
        lon: s.lon,
        demand: s.demand || 0.0,
        time_window_start: s.time_window_start,
        time_window_end: s.time_window_end,
      })),
      vehicles: activeVehicles,
      depot_id: fleetParams?.depotId || activeStops[0]?.id || 'connaught_place',
      iterations: 30,
      swarm_size: 20,
      benchmark_all: true,
    };

    try {
      const res = await API.scenarioOptimize(payload);
      setResult(res);
      setActiveTab('decision');
      setActiveRenderedAlgo(res.suggested_algorithm || res.optimal_route?.algorithm);

      // Notify parent to render optimal route on the map
      if (onApplyRoute && res.optimal_route) {
        onApplyRoute({
          ...res.optimal_route,
          ai_analysis: res.ai_analysis,
          scenario_features: res.scenario_features,
          suggested_algorithm: res.suggested_algorithm,
          benchmark_comparison: res.benchmark_comparison,
          winners: res.winners,
          activeStops: activeStops,
          prompt: prompt,
        });
      }
    } catch (err) {
      setError(err.message || 'Scenario optimization failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApplySpecificRoute = (benchmarkItem) => {
    if (!result?.optimal_route) return;
    setActiveRenderedAlgo(benchmarkItem.algorithm);
    if (onApplyRoute) {
      onApplyRoute({
        ...result.optimal_route,
        routes: benchmarkItem.routes || result.optimal_route.routes,
        route_coordinates: benchmarkItem.route_coordinates || result.optimal_route.route_coordinates,
        total_distance: benchmarkItem.total_distance,
        total_time: benchmarkItem.total_time,
        total_congestion: benchmarkItem.total_congestion || 0.0,
        estimated_fuel_cost: benchmarkItem.fuel_cost || 0.0,
        estimated_co2_kg: benchmarkItem.co2_kg || 0.0,
        runtime_ms: benchmarkItem.runtime_ms,
        algorithm: benchmarkItem.algorithm,
        ai_analysis: result.ai_analysis,
        scenario_features: result.scenario_features,
        suggested_algorithm: result.suggested_algorithm,
        benchmark_comparison: result.benchmark_comparison,
        winners: result.winners,
        activeStops: stopCountMode === 'micro' ? (fleetParams?.stops || []).slice(0, 3) : (fleetParams?.stops || []).slice(0, 7),
        prompt: prompt,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1">
      {/* Scenario Presets Quick-Chips */}
      <div className="card bg-base-100 border border-base-300 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/80">
              Operational Scenarios (Quick-Load)
            </span>
          </div>
          <span className="badge badge-xs font-mono text-[9px] badge-primary">NLP + AI Orchestrator</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => handleSelectPreset('emergency_rush_hour')}
            className="btn btn-xs btn-outline btn-error justify-start text-[10px] normal-case truncate"
          >
            🚑 Rush Hour Ambulance
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset('quantum_micro_cluster')}
            className="btn btn-xs btn-outline btn-secondary justify-start text-[10px] normal-case truncate"
          >
            ⚛️ Quantum Hamiltonian (QAOA)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset('green_multi_fleet')}
            className="btn btn-xs btn-outline btn-success justify-start text-[10px] normal-case truncate"
          >
            🌱 Green Multi-Fleet Delivery
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset('instant_reroute')}
            className="btn btn-xs btn-outline btn-warning justify-start text-[10px] normal-case truncate"
          >
            ⚡ Sudden Blockage Reroute
          </button>
        </div>
      </div>

      {/* Manual Scenario Text Input & Filters */}
      <div className="card bg-base-100 border border-base-300 rounded-xl p-3 shadow-2xs flex flex-col gap-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-base-content/80 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Scenario Input & Context</span>
          </span>
          <span className="text-[9px] text-base-content/50 font-normal">Parsed by NLP Engine</span>
        </label>
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your operational scenario (e.g., 'Urgent medical delivery with 3 stops in heavy rain, minimize delay...')"
          className="textarea textarea-bordered textarea-sm w-full text-xs font-sans leading-relaxed focus:textarea-primary"
        />

        {/* Interactive User Filters */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {/* Target Objective */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-base-content/70">Optimization Priority</span>
            <select
              value={targetObjective}
              onChange={(e) => setTargetObjective(e.target.value)}
              className="select select-bordered select-xs text-[10px]"
            >
              <option value="time_critical">⏱️ Time-Critical (Rush Hour)</option>
              <option value="congestion_avoidance">🚦 Avoid Congestion Choke-points</option>
              <option value="distance_minimal">📏 Shortest Distance (Direct)</option>
              <option value="green_fleet">🌱 Green Fleet (Lowest CO2)</option>
              <option value="balanced">⚖️ Balanced Multi-Factor</option>
            </select>
          </div>

          {/* Latency Budget */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-base-content/70">Latency Budget</span>
            <select
              value={latencyBudget}
              onChange={(e) => setLatencyBudget(e.target.value)}
              className="select select-bordered select-xs text-[10px]"
            >
              <option value="real_time">⚡ Real-Time (&lt;100ms)</option>
              <option value="interactive">⏱️ Interactive (&lt;2s)</option>
              <option value="rigorous_batch">🔬 Rigorous Quantum/Exact</option>
            </select>
          </div>

          {/* Hardware / Paradigm Preference */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-base-content/70">Hardware / Paradigm</span>
            <select
              value={hardwarePreference}
              onChange={(e) => setHardwarePreference(e.target.value)}
              className="select select-bordered select-xs text-[10px]"
            >
              <option value="auto">🤖 Auto-Select (AI Decision)</option>
              <option value="prefer_quantum_annealing">⚛️ Prefer Quantum Annealing (Neal)</option>
              <option value="prefer_qaoa">⚛️ Prefer Gate-Model QAOA</option>
              <option value="prefer_qpso">🌀 Prefer QPSO Swarm</option>
              <option value="prefer_classical_exact">🎯 Prefer Exact (CP-SAT)</option>
            </select>
          </div>

          {/* Problem Scale */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-base-content/70">Topology Scale</span>
            <select
              value={stopCountMode}
              onChange={(e) => setStopCountMode(e.target.value)}
              className="select select-bordered select-xs text-[10px]"
            >
              <option value="micro">🔬 Micro-Cluster (3 stops, QAOA ready)</option>
              <option value="fleet">🚚 Fleet Topology (7 stops, Multi-VRP)</option>
            </select>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleOptimize}
          disabled={loading}
          className="btn btn-primary btn-sm w-full mt-1 flex items-center justify-center gap-1.5 font-bold text-xs shadow-xs"
        >
          {loading ? (
            <>
              <span className="loading loading-spinner loading-xs" />
              <span>Analyzing Scenario & Evaluating Solvers...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Analyze Scenario & Optimize Route</span>
            </>
          )}
        </button>

        {error && (
          <div className="alert alert-error py-1 px-2 rounded-lg text-[10px] flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Tabs Switcher for Results */}
      {result && (
        <div className="tabs tabs-boxed bg-base-200/90 p-1 rounded-xl flex gap-1 border border-base-300">
          <button
            type="button"
            className={`tab tab-xs flex-1 font-bold rounded-lg transition-all ${
              activeTab === 'decision'
                ? '!bg-secondary !text-secondary-content shadow-xs'
                : 'text-base-content/70'
            }`}
            onClick={() => setActiveTab('decision')}
          >
            🧠 How Decisions Were Made
          </button>
          <button
            type="button"
            className={`tab tab-xs flex-1 font-bold rounded-lg transition-all ${
              activeTab === 'optimal_route'
                ? '!bg-primary !text-primary-content shadow-xs'
                : 'text-base-content/70'
            }`}
            onClick={() => setActiveTab('optimal_route')}
          >
            ✨ Suggested Route
          </button>
          <button
            type="button"
            className={`tab tab-xs flex-1 font-bold rounded-lg transition-all ${
              activeTab === 'benchmark'
                ? '!bg-accent !text-accent-content shadow-xs'
                : 'text-base-content/70'
            }`}
            onClick={() => setActiveTab('benchmark')}
          >
            📊 Solver Benchmark
          </button>
        </div>
      )}

      {/* SECTION 1: HOW DECISIONS WERE MADE (AI ORCHESTRATOR DECISION ENGINE) */}
      {result && activeTab === 'decision' && (
        <div className="flex flex-col gap-2.5">
          {/* Executive Decision Banner */}
          <div className="card bg-secondary/10 border border-secondary/30 rounded-xl p-3 shadow-2xs flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-secondary/20 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-secondary animate-pulse" />
                <span className="text-[11px] font-black uppercase tracking-wider text-secondary">
                  AI Orchestrator Decision Audit
                </span>
              </div>
              <span className="badge badge-secondary badge-sm font-mono font-bold text-[10px]">
                {Math.round((result.ai_analysis?.confidence || 0.9) * 100)}% Confidence
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-[10px] uppercase font-bold text-secondary flex items-center justify-between">
                <span>Selected Optimal Algorithm</span>
                <span className="badge badge-secondary badge-xs font-mono font-bold">
                  {result.suggested_algorithm}
                </span>
              </div>
              <p className="text-[11px] text-base-content/90 font-medium leading-relaxed bg-base-100/70 p-2 rounded-lg border border-secondary/20">
                {result.ai_analysis?.rationale}
              </p>
            </div>

            {/* Input & Filter Attributes Summary */}
            <div className="flex flex-wrap gap-1 text-[9px]">
              <span className="badge badge-outline badge-xs text-base-content/80">
                🎯 Priority: <b>{targetObjective.replace('_', ' ')}</b>
              </span>
              <span className="badge badge-outline badge-xs text-base-content/80">
                ⚡ Latency: <b>{latencyBudget}</b>
              </span>
              <span className="badge badge-outline badge-xs text-base-content/80">
                🚨 Urgency: <b>{urgency}</b>
              </span>
              <span className="badge badge-outline badge-xs text-base-content/80">
                🗺️ Scale: <b>{stopCountMode === 'micro' ? '3 Stops' : '7 Stops'}</b>
              </span>
              {result.scenario_features?.extracted_keywords?.length > 0 && (
                <span className="badge badge-ghost badge-xs font-mono">
                  Keywords: {result.scenario_features.extracted_keywords.join(', ')}
                </span>
              )}
            </div>
          </div>

          {/* Inferred Factor Weights Applied */}
          <div className="card bg-base-100 border border-base-300 rounded-xl p-3 shadow-2xs flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/80 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-primary" />
                <span>Inferred Objective Weight Synthesis</span>
              </span>
              <span className="text-[9px] text-base-content/50 font-mono">Normalized to 100%</span>
            </div>

            {/* Visual Color Bar */}
            <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-base-300">
              <div
                style={{ width: `${(result.scenario_features?.weights?.time || 0.4) * 100}%` }}
                className="bg-info"
                title={`Time: ${Math.round((result.scenario_features?.weights?.time || 0.4) * 100)}%`}
              />
              <div
                style={{ width: `${(result.scenario_features?.weights?.dist || 0.3) * 100}%` }}
                className="bg-warning"
                title={`Distance: ${Math.round((result.scenario_features?.weights?.dist || 0.3) * 100)}%`}
              />
              <div
                style={{ width: `${(result.scenario_features?.weights?.cong || 0.2) * 100}%` }}
                className="bg-error"
                title={`Congestion: ${Math.round((result.scenario_features?.weights?.cong || 0.2) * 100)}%`}
              />
              <div
                style={{ width: `${(result.scenario_features?.weights?.emiss || 0.1) * 100}%` }}
                className="bg-success"
                title={`Emissions: ${Math.round((result.scenario_features?.weights?.emiss || 0.1) * 100)}%`}
              />
            </div>

            <div className="grid grid-cols-4 gap-1 text-center font-mono text-[9px]">
              <div className="bg-info/10 border border-info/30 p-1 rounded">
                <div className="text-info font-bold">Time</div>
                <div>{Math.round((result.scenario_features?.weights?.time || 0) * 100)}%</div>
              </div>
              <div className="bg-warning/10 border border-warning/30 p-1 rounded">
                <div className="text-warning font-bold">Dist</div>
                <div>{Math.round((result.scenario_features?.weights?.dist || 0) * 100)}%</div>
              </div>
              <div className="bg-error/10 border border-error/30 p-1 rounded">
                <div className="text-error font-bold">Cong</div>
                <div>{Math.round((result.scenario_features?.weights?.cong || 0) * 100)}%</div>
              </div>
              <div className="bg-success/10 border border-success/30 p-1 rounded">
                <div className="text-success font-bold">CO2</div>
                <div>{Math.round((result.scenario_features?.weights?.emiss || 0) * 100)}%</div>
              </div>
            </div>
          </div>

          {/* Algorithm Suitability Comparison Bars */}
          {result.ai_analysis?.scores && (
            <div className="card bg-base-100 border border-base-300 rounded-xl p-3 shadow-2xs flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/80 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-secondary" />
                  <span>Candidate Algorithm Suitability</span>
                </span>
                <span className="badge badge-xs font-mono text-[8px] badge-outline">Suitability Score</span>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                {Object.entries(result.ai_analysis.scores)
                  .sort((a, b) => b[1] - a[1])
                  .map(([algoKey, scoreVal]) => {
                    const meta = SOLVER_METADATA[algoKey] || {
                      label: algoKey.toUpperCase(),
                      paradigm: 'Heuristic',
                      color: 'badge-ghost',
                      barColor: 'bg-primary',
                      desc: '',
                    };
                    const isWinner =
                      result.ai_analysis?.selected_solver === algoKey ||
                      result.suggested_algorithm?.toLowerCase().includes(algoKey);
                    const pct = Math.round(scoreVal * 100);

                    return (
                      <div key={algoKey} className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-1">
                            {isWinner && <span className="text-warning">🏆</span>}
                            <span className={`font-bold ${isWinner ? 'text-secondary' : 'text-base-content/80'}`}>
                              {meta.label}
                            </span>
                            {isWinner && (
                              <span className="badge badge-secondary badge-xs scale-75 origin-left font-bold">
                                WINNER
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-bold text-[9px]">{pct}%</span>
                        </div>
                        <div className="w-full bg-base-200 rounded-full h-2 overflow-hidden border border-base-300">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isWinner ? 'bg-secondary' : meta.barColor
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* 4-Step Decision Pipeline Stepper */}
          {result.ai_analysis?.decision_steps?.length > 0 && (
            <div className="card bg-base-100 border border-base-300 rounded-xl p-3 shadow-2xs flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/80 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                <span>Decision Pipeline Audit Trail</span>
              </span>

              <div className="flex flex-col gap-2">
                {result.ai_analysis.decision_steps.map((step, sIdx) => (
                  <div
                    key={sIdx}
                    className="p-2 rounded-lg bg-base-200/50 border border-base-300 flex flex-col gap-1 text-[10px]"
                  >
                    <div className="flex items-center justify-between font-bold text-primary">
                      <div className="flex items-center gap-1.5">
                        <span className="badge badge-primary badge-xs rounded-full w-4 h-4 p-0 flex items-center justify-center font-mono text-[9px]">
                          {step.step_number || sIdx + 1}
                        </span>
                        <span>{step.title}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-base-content/80 leading-relaxed pl-5">
                      {step.detail}
                    </p>
                    {step.impact && (
                      <div className="pl-5 text-[9px] text-secondary font-mono bg-secondary/5 py-0.5 px-1.5 rounded border border-secondary/20">
                        {step.impact}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: AI SUGGESTED OPTIMAL ROUTE */}
      {result && activeTab === 'optimal_route' && (
        <div className="flex flex-col gap-2.5">
          {/* Route Overview Header Card */}
          <div className="card bg-base-100 border border-primary/40 rounded-xl p-3.5 shadow-2xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-base-200 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-black uppercase tracking-wider text-primary">
                  Suggested Optimal Route
                </span>
              </div>
              <span className="badge badge-primary badge-sm font-mono font-bold text-[10px]">
                {result.suggested_algorithm}
              </span>
            </div>

            {/* Quick Metrics 4-Box Grid */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-primary/5 rounded-xl p-2 border border-primary/20">
                <div className="text-[9px] uppercase font-bold text-base-content/60">Distance</div>
                <div className="text-sm font-black font-mono text-primary">
                  {result.optimal_route?.total_distance > 1000
                    ? `${(result.optimal_route.total_distance / 1000).toFixed(2)} km`
                    : `${result.optimal_route?.total_distance?.toFixed(0)} m`}
                </div>
              </div>
              <div className="bg-warning/5 rounded-xl p-2 border border-warning/20">
                <div className="text-[9px] uppercase font-bold text-base-content/60">Travel Time</div>
                <div className="text-sm font-black font-mono text-warning">
                  {result.optimal_route?.total_time > 60
                    ? `${(result.optimal_route.total_time / 60).toFixed(1)} min`
                    : `${result.optimal_route?.total_time?.toFixed(1)} s`}
                </div>
              </div>
              <div className="bg-success/5 rounded-xl p-2 border border-success/20">
                <div className="text-[9px] uppercase font-bold text-base-content/60">CO2 Emissions</div>
                <div className="text-sm font-black font-mono text-success">
                  {result.optimal_route?.estimated_co2_kg?.toFixed(3)} kg
                </div>
              </div>
              <div className="bg-info/5 rounded-xl p-2 border border-info/20">
                <div className="text-[9px] uppercase font-bold text-base-content/60">Solver Latency</div>
                <div className="text-sm font-black font-mono text-info">
                  {result.optimal_route?.runtime_ms > 1000
                    ? `${(result.optimal_route.runtime_ms / 1000).toFixed(2)} s`
                    : `${result.optimal_route?.runtime_ms?.toFixed(0)} ms`}
                </div>
              </div>
            </div>

            {/* Detailed Stop-by-Stop Itinerary Sequence */}
            {result.optimal_route?.routes && Object.keys(result.optimal_route.routes).length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/70">
                  Optimal Stop Sequence (Itinerary)
                </span>
                {Object.entries(result.optimal_route.routes).map(([vId, stopList]) => (
                  <div
                    key={vId}
                    className="p-2.5 rounded-lg bg-base-200/60 border border-base-300 flex flex-col gap-1 text-[10px]"
                  >
                    <div className="flex items-center justify-between font-bold text-primary">
                      <span>Vehicle: {vId}</span>
                      <span className="text-[9px] font-mono text-base-content/60">
                        {Array.isArray(stopList) ? `${stopList.length} nodes` : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 font-mono text-[9px] pt-1">
                      {Array.isArray(stopList) &&
                        stopList.map((stopName, idx) => (
                          <React.Fragment key={idx}>
                            <span className="badge badge-neutral badge-xs font-semibold">
                              {stopName}
                            </span>
                            {idx < stopList.length - 1 && (
                              <ArrowRight className="w-2.5 h-2.5 text-base-content/40 shrink-0" />
                            )}
                          </React.Fragment>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Apply / Render to Map Button */}
            <button
              type="button"
              onClick={() => {
                if (onApplyRoute && result.optimal_route) {
                  setActiveRenderedAlgo(result.suggested_algorithm);
                  onApplyRoute({
                    ...result.optimal_route,
                    ai_analysis: result.ai_analysis,
                    scenario_features: result.scenario_features,
                    suggested_algorithm: result.suggested_algorithm,
                    benchmark_comparison: result.benchmark_comparison,
                    winners: result.winners,
                    activeStops: stopCountMode === 'micro' ? (fleetParams?.stops || []).slice(0, 3) : (fleetParams?.stops || []).slice(0, 7),
                    prompt: prompt,
                  });
                }
              }}
              className="btn btn-primary btn-xs w-full flex items-center justify-center gap-1.5 font-bold"
            >
              {activeRenderedAlgo === result.suggested_algorithm ? (
                <>
                  <Check className="w-3.5 h-3.5 text-success" />
                  <span>Currently Displayed on Map</span>
                </>
              ) : (
                <>
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Render Optimal Route on Map</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* SECTION 3: UNIFIED QUANTUM & CLASSICAL BENCHMARK MATRIX */}
      {result && activeTab === 'benchmark' && (
        <div className="card bg-base-100 border border-base-300 rounded-xl p-3 shadow-2xs flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-base-200 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Award className="w-4 h-4 text-warning" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/80">
                Multi-Solver Benchmark
              </span>
            </div>
            <span className="badge badge-ghost badge-xs font-mono text-[9px]">
              {result.benchmark_comparison?.length || 0} Solvers Evaluated
            </span>
          </div>

          {/* Metric Winners Summary Badges */}
          {result.winners && (
            <div className="grid grid-cols-2 gap-1.5 text-[9px]">
              {result.winners.fastest_runtime && (
                <div className="bg-info/10 border border-info/30 rounded p-1.5 flex items-center justify-between">
                  <span className="text-info-content font-bold flex items-center gap-1">
                    <Zap className="w-3 h-3 text-info" /> Lowest Latency:
                  </span>
                  <span className="font-mono font-bold truncate max-w-[100px]">{result.winners.fastest_runtime}</span>
                </div>
              )}
              {result.winners.shortest_distance && (
                <div className="bg-success/10 border border-success/30 rounded p-1.5 flex items-center justify-between">
                  <span className="text-success-content font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-success" /> Shortest Dist:
                  </span>
                  <span className="font-mono font-bold truncate max-w-[100px]">{result.winners.shortest_distance}</span>
                </div>
              )}
            </div>
          )}

          {/* Benchmark Table */}
          <div className="overflow-x-auto rounded-lg border border-base-200">
            <table className="table table-xs w-full">
              <thead>
                <tr className="bg-base-200/80 text-[9px] uppercase font-bold text-base-content/70">
                  <th>Algorithm</th>
                  <th>Distance</th>
                  <th>Time</th>
                  <th>Runtime</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {result.benchmark_comparison?.map((item, idx) => {
                  const isRecommended =
                    item.algorithm.includes(result.ai_analysis?.selected_solver) ||
                    result.suggested_algorithm?.includes(item.algorithm);
                  const isCurrent = activeRenderedAlgo === item.algorithm;

                  return (
                    <tr
                      key={idx}
                      className={`text-[10px] hover:bg-base-200/50 transition-colors ${
                        isCurrent ? 'bg-primary/10 font-bold' : isRecommended ? 'bg-primary/5' : ''
                      }`}
                    >
                      <td>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1">
                            <span className="font-bold">{item.algorithm}</span>
                            {isRecommended && (
                              <span className="badge badge-primary badge-xs scale-90">AI Pick</span>
                            )}
                          </div>
                          <span className="text-[8px] text-base-content/60 font-mono">
                            {item.paradigm}
                          </span>
                        </div>
                      </td>

                      <td className="font-mono">
                        {item.status === 'completed' && item.total_distance > 0 ? (
                          item.total_distance > 1000
                            ? `${(item.total_distance / 1000).toFixed(2)} km`
                            : `${item.total_distance.toFixed(0)} m`
                        ) : (
                          <span className="text-base-content/40 italic">{item.status}</span>
                        )}
                      </td>

                      <td className="font-mono">
                        {item.status === 'completed' && item.total_time > 0
                          ? `${item.total_time.toFixed(1)} s`
                          : '-'}
                      </td>

                      <td className="font-mono font-bold">
                        {item.status === 'completed' ? (
                          item.runtime_ms > 1000
                            ? `${(item.runtime_ms / 1000).toFixed(1)} s`
                            : `${item.runtime_ms.toFixed(0)} ms`
                        ) : '-'}
                      </td>

                      <td>
                        {item.routes && Object.keys(item.routes).length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleApplySpecificRoute(item)}
                            className={`btn btn-xs text-[9px] px-1.5 ${
                              isCurrent ? 'btn-primary' : 'btn-ghost text-primary'
                            }`}
                            title="Render route on map"
                          >
                            {isCurrent ? 'Active' : 'Map'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
