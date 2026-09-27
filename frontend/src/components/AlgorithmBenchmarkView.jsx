import React, { useState } from 'react';
import {
  BarChart3,
  Play,
  Award,
  Zap,
  CheckCircle2,
  Trash2,
  Plus,
  MapPin,
  Layers,
  Sliders,
  Check,
} from 'lucide-react';
import { API } from '../api';

export default function AlgorithmBenchmarkView({
  locations = [],
  onBenchmarkComplete,
  onApplyRoute,
}) {
  const [sourceId, setSourceId] = useState('connaught_place');
  const [selectedStops, setSelectedStops] = useState([
    { id: 'connaught_place', name: 'Connaught Place', lat: 28.6329, lon: 77.2195 },
    { id: 'india_gate', name: 'India Gate', lat: 28.6129, lon: 77.2295 },
    { id: 'jantar_mantar', name: 'Jantar Mantar', lat: 28.6270, lon: 77.2166 },
    { id: 'mandi_house', name: 'Mandi House', lat: 28.6236, lon: 77.2337 },
  ]);
  const [inputDestName, setInputDestName] = useState('');
  const [targetObjective, setTargetObjective] = useState('time_critical');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeAlgoName, setActiveAlgoName] = useState(null);

  // Available locations not yet added
  const existingIds = new Set(selectedStops.map((s) => s.id));
  const availableLocations = locations.filter((l) => !existingIds.has(l.id));


  const handleAddStop = (loc) => {
    if (!loc) return;
    const newStop = {
      id: loc.id || loc.name.toLowerCase().replace(/\s+/g, '_'),
      name: loc.name.replace(/– Central Park|Metro Station/g, '').trim(),
      lat: loc.lat,
      lon: loc.lon,
      demand: 2.0,
    };
    setSelectedStops((prev) => [...prev.filter((s) => s.id !== newStop.id), newStop]);
  };

  const handleAddInputDestination = (e) => {
    e?.preventDefault();
    const query = inputDestName.trim();
    if (!query) return;

    const matched = locations.find(
      (l) =>
        l.name.toLowerCase().includes(query.toLowerCase()) ||
        l.id.toLowerCase().includes(query.toLowerCase())
    );

    if (matched) {
      handleAddStop(matched);
    } else {
      let hash = 0;
      for (let i = 0; i < query.length; i++) {
        hash = (hash << 5) - hash + query.charCodeAt(i);
        hash |= 0;
      }
      const latOffset = ((hash % 100) / 100) * 0.03;
      const lonOffset = (((hash >> 3) % 100) / 100) * 0.03;

      const newStop = {
        id: query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
        name: query,
        lat: 28.6250 + latOffset,
        lon: 77.2150 + lonOffset,
        demand: 2.0,
      };
      setSelectedStops((prev) => [...prev.filter((s) => s.id !== newStop.id), newStop]);
    }

    setInputDestName('');
  };

  const handleRemoveStop = (id) => {
    if (selectedStops.length <= 2) return;
    setSelectedStops((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (sourceId === id && next.length > 0) {
        setSourceId(next[0].id);
      }
      return next;
    });
  };

  const handleRunBenchmark = async () => {
    if (selectedStops.length < 2) return;
    setLoading(true);
    setError(null);

    const payload = {
      stops: selectedStops.map((s) => ({
        id: s.id,
        lat: s.lat,
        lon: s.lon,
        demand: s.demand || 2.0,
      })),
      vehicles: [{ id: 'v1', capacity: 30.0, start_depot_id: sourceId }],
      depot_id: sourceId,
      filters: {
        target_objective: targetObjective,
        latency_budget: 'interactive',
        hardware_preference: 'auto',
        urgency: 'standard',
      },
      iterations: 30,
      swarm_size: 20,
      benchmark_all: true,
    };

    try {
      const res = await API.scenarioOptimize(payload);
      if (onBenchmarkComplete) {
        onBenchmarkComplete({
          ...res,
          selectedStops,
          sourceId,
        });
      }
      if (onApplyRoute && res.optimal_route) {
        setActiveAlgoName(res.suggested_algorithm || 'QPSO-VRP');
        onApplyRoute({
          ...res.optimal_route,
          algorithm: res.suggested_algorithm,
          benchmark_comparison: res.benchmark_comparison,
          winners: res.winners,
          activeStops: selectedStops,
        });
      }
    } catch (err) {
      setError(err.message || 'Benchmark execution failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm p-3.5 flex flex-col gap-3 h-full overflow-y-auto">
      {/* Title Header */}
      <div className="flex items-center justify-between pb-2 border-b border-base-300">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <BarChart3 size={18} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-base-content leading-tight">
              Algorithm Benchmark Suite
            </h2>
            <p className="text-[10px] text-base-content/60">
              Cross-compare Quantum, Exact & Classical solvers
            </p>
          </div>
        </div>
        <span className="badge badge-primary badge-xs font-mono text-[9px] font-bold">
          All Algorithms
        </span>
      </div>


      {/* Starting Hub / Depot */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-base-content/80 flex items-center gap-1.5">
          <MapPin size={13} className="text-secondary" />
          <span>Starting Depot (Anchor)</span>
        </label>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="select select-bordered select-sm w-full text-xs font-medium"
        >
          {selectedStops.map((s) => (
            <option key={s.id} value={s.id}>
              🏢 {s.name || s.id}
            </option>
          ))}
        </select>
      </div>

      {/* Add Destination by Name */}
      <div className="flex flex-col gap-1.5 p-2 bg-base-200/50 rounded-xl border border-base-300">
        <label className="text-[11px] font-bold text-base-content flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Plus size={13} className="text-primary" />
            <span>Add Destination to Benchmark</span>
          </span>
          <span className="text-[9px] text-base-content/50">Type name or pick</span>
        </label>

        <form onSubmit={handleAddInputDestination} className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              list="bench-locations"
              placeholder="e.g. Khan Market, India Gate..."
              value={inputDestName}
              onChange={(e) => setInputDestName(e.target.value)}
              className="input input-sm input-bordered w-full text-xs font-medium pr-2"
            />
            <datalist id="bench-locations">
              {availableLocations.map((loc) => (
                <option key={loc.id} value={loc.name} />
              ))}
            </datalist>
          </div>
          <button
            type="submit"
            disabled={!inputDestName.trim()}
            className="btn btn-sm btn-primary px-3 text-xs font-bold gap-1 shadow-xs"
          >
            <Plus size={14} /> Add
          </button>
        </form>

        {/* Quick add chips */}
        {availableLocations.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {availableLocations.slice(0, 4).map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => handleAddStop(loc)}
                className="btn btn-xs btn-outline btn-ghost border-base-300 text-[10px] normal-case truncate max-w-[120px]"
              >
                + {loc.name.replace(/– Central Park|Metro Station/g, '').trim()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stops Scheduled for Benchmark */}
      <div className="flex flex-col gap-1 flex-1 min-h-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-base-content/80">
            Selected Destinations ({selectedStops.length})
          </span>
          <span className="text-[9px] font-mono text-base-content/50">
            {selectedStops.length - 1} stops + 1 depot
          </span>
        </div>

        <div className="overflow-y-auto max-h-40 border border-base-300 rounded-xl divide-y divide-base-200 bg-base-100 shadow-2xs">
          {selectedStops.map((stop, idx) => {
            const isDepot = stop.id === sourceId;
            return (
              <div
                key={stop.id}
                className={`p-2 flex items-center justify-between text-xs ${
                  isDepot ? 'bg-primary/5 font-bold' : 'hover:bg-base-200/40'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold font-mono shrink-0 ${
                      isDepot
                        ? 'bg-primary text-primary-content'
                        : 'bg-base-200 text-base-content/80'
                    }`}
                  >
                    {isDepot ? '★' : idx}
                  </span>
                  <span className="truncate">{stop.name || stop.id}</span>
                </div>
                {!isDepot && selectedStops.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveStop(stop.id)}
                    className="btn btn-ghost btn-xs text-error/60 hover:text-error p-1"
                    title={`Remove ${stop.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Algorithms Being Evaluated (Badge Matrix) */}
      <div className="flex flex-col gap-1.5 p-2 bg-base-200/40 rounded-xl border border-base-300">
        <span className="text-[9px] font-bold uppercase tracking-wider text-base-content/60 flex items-center justify-between">
          <span>Evaluated Algorithms</span>
          <span className="font-mono text-primary font-bold">6 Solvers</span>
        </span>
        <div className="grid grid-cols-2 gap-1 text-[9px] font-mono">
          <div className="bg-base-100 p-1 rounded border border-base-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="font-bold">QPSO Swarm</span>
          </div>
          <div className="bg-base-100 p-1 rounded border border-base-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span className="font-bold">Quantum Annealing</span>
          </div>
          <div className="bg-base-100 p-1 rounded border border-base-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="font-bold">OR-Tools CP-SAT</span>
          </div>
          <div className="bg-base-100 p-1 rounded border border-base-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
            <span className="font-bold">Genetic Algorithm</span>
          </div>
          <div className="bg-base-100 p-1 rounded border border-base-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-info" />
            <span className="font-bold">Gate-Model QAOA</span>
          </div>
          <div className="bg-base-100 p-1 rounded border border-base-300 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span className="font-bold">Dijkstra Shortest</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error py-1 px-2 rounded-lg text-[10px]">
          <span>{error}</span>
        </div>
      )}

      {/* Benchmark Action Button */}
      <button
        type="button"
        onClick={handleRunBenchmark}
        disabled={loading || selectedStops.length < 2}
        className="btn btn-primary btn-sm w-full font-bold shadow-md shadow-primary/20 gap-2 mt-auto text-xs"
      >
        {loading ? (
          <>
            <span className="loading loading-spinner loading-xs" />
            <span>Benchmarking All Algorithms...</span>
          </>
        ) : (
          <>
            <Play size={14} fill="currentColor" />
            <span>Run Benchmark Across All Solvers</span>
          </>
        )}
      </button>
    </div>
  );
}
