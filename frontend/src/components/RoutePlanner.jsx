import React from 'react';
import { ArrowDownUp, Zap, Sparkles } from 'lucide-react';

export default function RoutePlanner({
  locations,
  sourceId,
  destinationId,
  algorithm,
  particles,
  iterations,
  weights,
  onSourceChange,
  onDestinationChange,
  onSwap,
  onAlgorithmChange,
  onParticlesChange,
  onIterationsChange,
  onWeightChange,
  onOptimize,
  onBenchmark,
  loading,
}) {
  return (
    <div className="card bg-base-100 border border-base-300 p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-base-200">
        <h2 className="text-xs font-bold uppercase tracking-wider text-base-content flex items-center gap-1.5">
          <span>📍</span> Route Planner
        </h2>
        <span className="badge badge-ghost badge-sm text-[10px]">OSM Delhi</span>
      </div>

      {/* From Location */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-base-content/60 uppercase tracking-wider">Origin</label>
        <select
          value={sourceId}
          onChange={(e) => onSourceChange(e.target.value)}
          className="select select-bordered select-sm w-full text-xs font-medium focus:select-primary"
        >
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>

      {/* Swap Button */}
      <div className="flex justify-center -my-1">
        <button
          onClick={onSwap}
          className="btn btn-circle btn-ghost btn-xs border border-base-300 hover:btn-primary"
          title="Swap origin and destination"
        >
          <ArrowDownUp className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* To Location */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold text-base-content/60 uppercase tracking-wider">Destination</label>
        <select
          value={destinationId}
          onChange={(e) => onDestinationChange(e.target.value)}
          className="select select-bordered select-sm w-full text-xs font-medium focus:select-primary"
        >
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </div>

      {/* Algorithm Selector Toggle */}
      <div className="flex flex-col gap-1 pt-0.5">
        <label className="text-[10px] font-bold text-base-content/60 uppercase tracking-wider">Optimizer Engine</label>
        <div className="join w-full grid grid-cols-3">
          {[
            { id: 'QPSO', label: '⚛ QPSO' },
            { id: 'Dijkstra', label: '📊 Dijkstra' },
            { id: 'Genetic Algorithm', label: '🧬 GA' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onAlgorithmChange(item.id)}
              className={`btn btn-xs join-item font-bold ${
                algorithm === item.id
                  ? 'btn-primary text-primary-content'
                  : 'btn-outline border-base-300 text-base-content/70 hover:bg-base-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hyperparameters Sliders */}
      <div className="card bg-base-200/60 p-2.5 border border-base-300 flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-base-content/70 font-medium text-[11px]">Swarm Particles</span>
          <span className="badge badge-primary badge-xs font-bold">{particles}</span>
        </div>
        <input
          type="range"
          min={5}
          max={100}
          value={particles}
          onChange={(e) => onParticlesChange(Number(e.target.value))}
          className="range range-primary range-xs"
        />

        <div className="flex items-center justify-between">
          <span className="text-base-content/70 font-medium text-[11px]">Iterations (Generations)</span>
          <span className="badge badge-primary badge-xs font-bold">{iterations}</span>
        </div>
        <input
          type="range"
          min={10}
          max={150}
          value={iterations}
          onChange={(e) => onIterationsChange(Number(e.target.value))}
          className="range range-primary range-xs"
        />

        {/* Multi-criteria weights */}
        <div className="pt-2 border-t border-base-300 flex flex-col gap-1.5">
          <div className="text-[10px] font-bold text-base-content/60 uppercase tracking-wider">Multi-Objective Weights</div>

          <div className="flex items-center justify-between">
            <span className="text-base-content/70 text-[11px]">Time (w_t)</span>
            <span className="font-bold text-primary text-[11px]">{Math.round(weights.time * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={weights.time * 100}
            onChange={(e) => onWeightChange('time', Number(e.target.value) / 100)}
            className="range range-primary range-xs"
          />

          <div className="flex items-center justify-between">
            <span className="text-base-content/70 text-[11px]">Distance (w_d)</span>
            <span className="font-bold text-accent text-[11px]">{Math.round(weights.dist * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={weights.dist * 100}
            onChange={(e) => onWeightChange('dist', Number(e.target.value) / 100)}
            className="range range-accent range-xs"
          />

          <div className="flex items-center justify-between">
            <span className="text-base-content/70 text-[11px]">Congestion (w_c)</span>
            <span className="font-bold text-warning text-[11px]">{Math.round(weights.cong * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={weights.cong * 100}
            onChange={(e) => onWeightChange('cong', Number(e.target.value) / 100)}
            className="range range-warning range-xs"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={onOptimize}
          disabled={loading}
          className="btn btn-primary btn-sm w-full gap-1.5 shadow-sm text-xs font-bold"
        >
          {loading ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Zap className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{loading ? 'Optimizing Route…' : `Optimize Route (${algorithm})`}</span>
        </button>

        <button
          onClick={onBenchmark}
          disabled={loading}
          className="btn btn-outline btn-secondary btn-sm w-full gap-1.5 text-xs font-bold"
        >
          <Sparkles className="w-3.5 h-3.5 text-secondary" />
          <span>Run All 3 Algorithms Benchmark</span>
        </button>
      </div>
    </div>
  );
}