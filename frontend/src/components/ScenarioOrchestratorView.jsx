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
} from 'lucide-react';
import { API } from '../api';

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
  const [stopCountMode, setStopCountMode] = useState('micro'); // 'micro' (3-4 stops) or 'fleet' (all stops)

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

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

      // Notify parent to render primary route on map
      if (onApplyRoute && res.optimal_route) {
        onApplyRoute(res.optimal_route);
      }
    } catch (err) {
      setError(err.message || 'Scenario optimization failed');
    } finally {
      setLoading(false);
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

      {/* Manual Scenario Text Input */}
      <div className="card bg-base-100 border border-base-300 rounded-xl p-3 shadow-2xs flex flex-col gap-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-base-content/80 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Manual Scenario Description</span>
        </label>
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your operational scenario (e.g., 'Urgent medical delivery with 3 stops in heavy rain, minimize delay...')"
          className="textarea textarea-bordered textarea-sm w-full text-xs font-sans leading-relaxed focus:textarea-primary"
        />

        {/* Interactive Filters Grid */}
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

        {/* Submit Optimization Action */}
        <button
          onClick={handleOptimize}
          disabled={loading}
          className="btn btn-primary btn-sm w-full mt-1 flex items-center justify-center gap-1.5 font-bold text-xs shadow-xs"
        >
          {loading ? (
            <>
              <span className="loading loading-spinner loading-xs" />
              <span>Synthesizing AI Decision & Benchmarking...</span>
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

      {/* AI Decision & Explainability Card */}
      {result?.ai_analysis && (
        <div className="card bg-base-100 border border-primary/30 rounded-xl p-3 shadow-2xs flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-base-200 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                AI Orchestrator Decision
              </span>
            </div>
            <span className="badge badge-success badge-sm font-mono text-[10px] font-bold">
              {Math.round(result.ai_analysis.confidence * 100)}% Confidence
            </span>
          </div>

          {/* Selected Algorithm Header */}
          <div className="bg-primary/10 rounded-lg p-2.5 border border-primary/20 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-primary">Recommended Algorithm</span>
              <span className="badge badge-primary badge-xs font-mono font-bold">
                {result.suggested_algorithm}
              </span>
            </div>
            <p className="text-[11px] text-base-content/90 font-medium leading-relaxed">
              {result.ai_analysis.rationale}
            </p>
          </div>

          {/* Inferred Factor Weights */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase text-base-content/60">
              Inferred Multi-Factor Weights Applied
            </span>
            <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
              <div className="bg-base-200/70 p-1 rounded border border-base-300">
                <span className="text-info font-bold">Time</span>
                <div>{Math.round((result.scenario_features?.weights?.time || 0) * 100)}%</div>
              </div>
              <div className="bg-base-200/70 p-1 rounded border border-base-300">
                <span className="text-warning font-bold">Dist</span>
                <div>{Math.round((result.scenario_features?.weights?.dist || 0) * 100)}%</div>
              </div>
              <div className="bg-base-200/70 p-1 rounded border border-base-300">
                <span className="text-error font-bold">Cong</span>
                <div>{Math.round((result.scenario_features?.weights?.cong || 0) * 100)}%</div>
              </div>
              <div className="bg-base-200/70 p-1 rounded border border-base-300">
                <span className="text-success font-bold">CO2</span>
                <div>{Math.round((result.scenario_features?.weights?.emiss || 0) * 100)}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified Quantum vs Classical Benchmark Matrix */}
      {result?.benchmark_comparison?.length > 0 && (
        <div className="card bg-base-100 border border-base-300 rounded-xl p-3 shadow-2xs flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-base-200 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Award className="w-4 h-4 text-warning" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/80">
                Unified Quantum & Classical Benchmark
              </span>
            </div>
            <span className="badge badge-ghost badge-xs font-mono text-[9px]">
              {result.benchmark_comparison.length} Solvers Evaluated
            </span>
          </div>

          {/* Metric Winners Summary Badges */}
          {result.winners && (
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              {result.winners.fastest_runtime && (
                <div className="bg-info/10 border border-info/30 rounded p-1.5 flex items-center justify-between">
                  <span className="text-info-content font-bold flex items-center gap-1">
                    <Zap className="w-3 h-3 text-info" /> Lowest Latency:
                  </span>
                  <span className="font-mono font-bold truncate max-w-[110px]">{result.winners.fastest_runtime}</span>
                </div>
              )}
              {result.winners.shortest_distance && (
                <div className="bg-success/10 border border-success/30 rounded p-1.5 flex items-center justify-between">
                  <span className="text-success-content font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-success" /> Shortest Dist:
                  </span>
                  <span className="font-mono font-bold truncate max-w-[110px]">{result.winners.shortest_distance}</span>
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
                  <th>CO2 (kg)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {result.benchmark_comparison.map((item, idx) => {
                  const isRecommended = item.algorithm.includes(result.ai_analysis?.selected_solver) ||
                    result.suggested_algorithm?.includes(item.algorithm);

                  return (
                    <tr
                      key={idx}
                      className={`text-[10px] hover:bg-base-200/50 transition-colors ${
                        isRecommended ? 'bg-primary/5 font-semibold' : ''
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

                      <td className="font-mono">
                        {item.status === 'completed' && item.co2_kg > 0
                          ? `${item.co2_kg.toFixed(3)}`
                          : '-'}
                      </td>

                      <td>
                        {item.routes && Object.keys(item.routes).length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (onApplyRoute && result.optimal_route) {
                                onApplyRoute({
                                  ...result.optimal_route,
                                  routes: item.routes,
                                  total_distance: item.total_distance,
                                  total_time: item.total_time,
                                  algorithm: item.algorithm,
                                });
                              }
                            }}
                            className="btn btn-ghost btn-xs text-[9px] px-1 text-primary"
                            title="Render route on map"
                          >
                            Map
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
