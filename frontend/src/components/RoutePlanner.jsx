import React from 'react';
import { ArrowDownUp, Zap, Sparkles, Plus, Trash2, ChevronUp, ChevronDown, Route, RefreshCw } from 'lucide-react';

export default function RoutePlanner({
  locations,
  sourceId,
  destinationId,
  destinationIds = [],
  optimizeOrder = true,
  roundTrip = false,
  algorithm,
  particles,
  iterations,
  weights,
  onSourceChange,
  onDestinationChange,
  onAddDestination,
  onRemoveDestination,
  onReorderDestinations,
  onOptimizeOrderChange,
  onRoundTripChange,
  onSwap,
  onAlgorithmChange,
  onParticlesChange,
  onIterationsChange,
  onWeightChange,
  onOptimize,
  onBenchmark,
  loading,
}) {
  // If destinationIds array is not provided, fall back to [destinationId]
  const dests = destinationIds && destinationIds.length > 0 ? destinationIds : [destinationId];
  const isMultiDest = dests.length > 1 || roundTrip;

  return (
    <div className="card bg-base-100 border border-base-300 p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-base-200">
        <h2 className="text-xs font-bold uppercase tracking-wider text-base-content flex items-center gap-1.5">
          <span>📍</span> Route Optimization
        </h2>
        <div className="flex items-center gap-1.5">
          {dests.length > 1 && (
            <span className="badge badge-primary badge-xs font-bold">
              {dests.length} Destinations
            </span>
          )}
          <span className="badge badge-ghost badge-sm text-[10px]">OSM Delhi</span>
        </div>
      </div>

      {/* Origin Location */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-base-content/60 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Origin (Start)
          </label>
        </div>
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

      {/* Swap Button (shown between Origin and Destinations) */}
      <div className="flex justify-center -my-1">
        <button
          onClick={onSwap}
          className="btn btn-circle btn-ghost btn-xs border border-base-300 hover:btn-primary"
          title="Swap or reverse origin and destination"
        >
          <ArrowDownUp className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Destinations Section */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-base-content/60 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            {dests.length > 1 ? `Destinations (${dests.length} stops)` : 'Destination'}
          </label>
          <button
            type="button"
            onClick={onAddDestination}
            className="btn btn-ghost btn-xs text-[10px] font-bold text-primary hover:bg-primary/10 gap-1 px-1.5 h-6 min-h-0"
            title="Add another destination stop to the route"
          >
            <Plus className="w-3 h-3" />
            <span>Add Destination</span>
          </button>
        </div>

        {/* List of destinations */}
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-0.5">
          {dests.map((destId, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-1.5 p-1 rounded-lg border transition-all ${
                dests.length > 1
                  ? 'bg-base-200/50 border-base-300'
                  : 'border-transparent'
              }`}
            >
              {dests.length > 1 && (
                <div className="badge badge-neutral badge-xs font-mono font-bold w-5 h-5 rounded-full p-0 flex items-center justify-center flex-shrink-0 text-[10px]">
                  {idx + 1}
                </div>
              )}

              <select
                value={destId}
                onChange={(e) => onDestinationChange(idx, e.target.value)}
                className="select select-bordered select-sm flex-1 text-xs font-medium focus:select-primary min-w-0"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>

              {/* Reordering and remove controls when multiple destinations */}
              {dests.length > 1 && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => onReorderDestinations(idx, idx - 1)}
                    className="btn btn-ghost btn-xs p-0.5 h-6 w-6 min-h-0 text-base-content/60 hover:text-base-content disabled:opacity-30"
                    title="Move stop up"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === dests.length - 1}
                    onClick={() => onReorderDestinations(idx, idx + 1)}
                    className="btn btn-ghost btn-xs p-0.5 h-6 w-6 min-h-0 text-base-content/60 hover:text-base-content disabled:opacity-30"
                    title="Move stop down"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveDestination(idx)}
                    className="btn btn-ghost btn-xs p-0.5 h-6 w-6 min-h-0 text-error hover:bg-error/10"
                    title="Remove destination stop"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Multi-destination options panel */}
        {dests.length > 1 && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-2 flex flex-col gap-1.5 text-xs mt-1">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => onOptimizeOrderChange(!optimizeOrder)}>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-base-content flex items-center gap-1">
                  ⚡ Optimize Visit Order (TSP)
                </span>
                <span className="text-[10px] text-base-content/60">
                  {optimizeOrder ? 'Auto-orders stops for shortest total time/dist' : 'Visits stops strictly in the order listed above'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={optimizeOrder}
                onChange={(e) => onOptimizeOrderChange(e.target.checked)}
                className="checkbox checkbox-primary checkbox-xs"
              />
            </div>

            <div className="divider my-0 opacity-20" />

            <div className="flex items-center justify-between cursor-pointer" onClick={() => onRoundTripChange(!roundTrip)}>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-base-content flex items-center gap-1">
                  🔄 Round Trip (Return to Origin)
                </span>
                <span className="text-[10px] text-base-content/60">
                  {roundTrip ? 'Adds return journey back to start location' : 'Finishes at last visited destination'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={roundTrip}
                onChange={(e) => onRoundTripChange(e.target.checked)}
                className="checkbox checkbox-secondary checkbox-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* Algorithm Selector Toggle */}
      <div className="flex flex-col gap-1.5 pt-0.5">
        <label className="text-[10px] font-bold text-base-content/60 uppercase tracking-wider flex items-center justify-between">
          <span>Optimizer Engine</span>
          {algorithm === 'AI Orchestrator' && (
            <span className="badge badge-primary badge-xs font-mono font-bold">Auto-Solver</span>
          )}
        </label>
        <div className="grid grid-cols-2 gap-1.5 w-full">
          {[
            { id: 'AI Orchestrator', label: '🧠 AI Orchestrator' },
            { id: 'QPSO', label: '⚛ QPSO' },
            { id: 'Dijkstra', label: '📊 Dijkstra' },
            { id: 'Genetic Algorithm', label: '🧬 GA' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onAlgorithmChange(item.id)}
              className={`btn btn-sm text-[11px] font-bold px-1 py-1.5 h-auto min-h-[2.35rem] flex items-center justify-center rounded-lg transition-all ${
                algorithm === item.id
                  ? 'btn-primary text-primary-content shadow-xs'
                  : 'bg-base-100 hover:bg-base-200 text-base-content border border-base-300 hover:border-base-content/20'
              }`}
            >
              <span className="leading-none whitespace-nowrap">{item.label}</span>
            </button>
          ))}
        </div>
        {algorithm === 'AI Orchestrator' && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-2 text-[10px] text-base-content/70">
            <span className="font-bold text-primary">🧠 AI Orchestrator:</span> Evaluates live traffic conditions, number of stops, and objective weights to dynamically pick the optimal solver (Dijkstra, QPSO, or GA).
          </div>
        )}
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
          <span>
            {loading
              ? 'Optimizing Route…'
              : isMultiDest
              ? `Optimize Route (${dests.length} Destinations · ${algorithm})`
              : `Optimize Route (${algorithm})`}
          </span>
        </button>

        <button
          onClick={onBenchmark}
          disabled={loading}
          className="btn btn-outline btn-secondary btn-sm w-full gap-1.5 text-xs font-bold"
        >
          <Sparkles className="w-3.5 h-3.5 text-secondary" />
          <span>
            {isMultiDest
              ? `Run 3-Algorithm Benchmark (${dests.length} Destinations)`
              : 'Run All 3 Algorithms Benchmark'}
          </span>
        </button>
      </div>
    </div>
  );
}