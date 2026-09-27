import React, { useState } from 'react';
import {
  Truck,
  Plus,
  Trash2,
  Play,
  RotateCcw,
  MapPin,
  Sparkles,
  Navigation,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

const DEFAULT_SAMPLE_STOPS = [
  { id: 'connaught_place', name: 'Connaught Place', lat: 28.6329, lon: 77.2195, demand: 0.0 },
  { id: 'india_gate', name: 'India Gate', lat: 28.6129, lon: 77.2295, demand: 3.0 },
  { id: 'jantar_mantar', name: 'Jantar Mantar', lat: 28.6270, lon: 77.2166, demand: 2.0 },
  { id: 'new_delhi_railway', name: 'New Delhi Rly Station', lat: 28.6419, lon: 77.2197, demand: 4.0 },
  { id: 'mandi_house', name: 'Mandi House', lat: 28.6236, lon: 77.2337, demand: 3.5 },
  { id: 'khan_market', name: 'Khan Market', lat: 28.6004, lon: 77.2270, demand: 4.0 },
  { id: 'national_museum', name: 'National Museum', lat: 28.6117, lon: 77.2197, demand: 2.0 },
];

export default function FleetSetup({
  onOptimize,
  loading = false,
  fleetParams,
  setFleetParams,
  locations = [],
}) {
  const {
    numVehicles = 2,
    capacity = 15.0,
    algorithm = 'QPSO',
    iterations = 40,
    swarmSize = 25,
    stops = [],
    depotId = 'connaught_place',
    profile = 'delivery',
  } = fleetParams;

  const [inputDestinationName, setInputDestinationName] = useState('');

  // Fallback landmarks pool from locations or default samples
  const knownLocations = locations.length > 0 ? locations : DEFAULT_SAMPLE_STOPS;

  // Filter locations not yet in the stop list
  const existingStopIds = new Set(stops.map((s) => s.id));
  const existingStopNames = new Set(stops.map((s) => s.name.toLowerCase()));
  const availableLocations = knownLocations.filter(
    (loc) => !existingStopIds.has(loc.id) && !existingStopNames.has(loc.name.toLowerCase())
  );

  // Helper to add stop from a known location object
  const addStopByLocation = (loc) => {
    if (!loc) return;
    const newStopObj = {
      id: loc.id || loc.name.toLowerCase().replace(/\s+/g, '_'),
      name: loc.name.replace(/– Central Park|Metro Station/g, '').trim() || loc.id,
      lat: loc.lat,
      lon: loc.lon,
      demand: loc.demand !== undefined ? loc.demand : 2.5,
    };

    setFleetParams((prev) => ({
      ...prev,
      stops: [...prev.stops.filter((s) => s.id !== newStopObj.id), newStopObj],
    }));
  };

  // Add stop simply by entering destination name
  const handleAddDestination = (e) => {
    e?.preventDefault();
    const query = inputDestinationName.trim();
    if (!query) return;

    // Check if query matches any known location
    const matched = knownLocations.find(
      (l) =>
        l.name.toLowerCase().includes(query.toLowerCase()) ||
        l.id.toLowerCase().includes(query.toLowerCase())
    );

    if (matched) {
      addStopByLocation(matched);
    } else {
      // Create stop with deterministic hash-based Delhi offset coordinates
      let hash = 0;
      for (let i = 0; i < query.length; i++) {
        hash = (hash << 5) - hash + query.charCodeAt(i);
        hash |= 0;
      }
      const latOffset = ((hash % 100) / 100) * 0.03;
      const lonOffset = (((hash >> 3) % 100) / 100) * 0.03;

      const newStopObj = {
        id: query.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
        name: query,
        lat: 28.6250 + latOffset,
        lon: 77.2150 + lonOffset,
        demand: 2.0,
      };

      setFleetParams((prev) => ({
        ...prev,
        stops: [...prev.stops.filter((s) => s.id !== newStopObj.id), newStopObj],
      }));
    }

    setInputDestinationName('');
  };

  const handleRemoveStop = (idToRemove) => {
    setFleetParams((prev) => {
      const remaining = prev.stops.filter((s) => s.id !== idToRemove);
      let newDepot = prev.depotId;
      if (newDepot === idToRemove && remaining.length > 0) {
        newDepot = remaining[0].id;
      }
      return { ...prev, stops: remaining, depotId: newDepot };
    });
  };

  const handleResetToDefault = () => {
    setFleetParams((prev) => ({
      ...prev,
      stops: DEFAULT_SAMPLE_STOPS,
      depotId: 'connaught_place',
      numVehicles: 2,
    }));
  };

  const handleSelectPriority = (newProfile) => {
    let newWeights = { time: 0.5, dist: 0.3, cong: 0.2 };
    if (newProfile === 'fastest') {
      newWeights = { time: 0.7, dist: 0.1, cong: 0.2 };
    } else if (newProfile === 'shortest') {
      newWeights = { time: 0.2, dist: 0.7, cong: 0.1 };
    } else if (newProfile === 'green') {
      newWeights = { time: 0.2, dist: 0.3, cong: 0.5 };
    }

    setFleetParams((prev) => ({
      ...prev,
      profile: newProfile,
      weights: newWeights,
    }));
  };

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm p-3.5 flex flex-col gap-3 h-full overflow-y-auto">
      {/* Title Header */}
      <div className="flex items-center justify-between pb-2 border-b border-base-300">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Truck size={18} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-base-content leading-tight">
              Multi-Vehicle Route Optimization
            </h2>
            <p className="text-[10px] text-base-content/60">
              Distribute stops optimally across your fleet
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleResetToDefault}
          className="btn btn-ghost btn-xs text-primary gap-1"
          title="Reset to default Delhi route stops"
        >
          <RotateCcw size={11} /> Reset
        </button>
      </div>

      {/* 1. Starting Depot (Hub) */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold text-base-content/80 flex items-center gap-1.5">
          <MapPin size={13} className="text-secondary" />
          <span>Starting Point (Depot)</span>
        </label>
        <select
          value={depotId}
          onChange={(e) => setFleetParams((prev) => ({ ...prev, depotId: e.target.value }))}
          className="select select-bordered select-sm w-full text-xs font-medium focus:select-primary"
        >
          {stops.map((s) => (
            <option key={s.id} value={s.id}>
              🏢 {s.name || s.id}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Number of Vehicles (Fleet Size) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-base-content/80 flex items-center gap-1.5">
            <Truck size={13} className="text-primary" />
            <span>Number of Vehicles</span>
          </label>
          <span className="badge badge-primary badge-xs font-mono font-bold">
            {numVehicles} {numVehicles === 1 ? 'Vehicle' : 'Vehicles'}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {[1, 2, 3, 4, 5].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setFleetParams((prev) => ({ ...prev, numVehicles: count }))}
              className={`btn btn-xs font-bold text-[10px] ${
                numVehicles === count
                  ? 'btn-primary shadow-xs'
                  : 'btn-outline border-base-300 text-base-content/70'
              }`}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Add Destination by Name (Super Simple) */}
      <div className="flex flex-col gap-1.5 p-2.5 bg-base-200/50 rounded-xl border border-base-300">
        <label className="text-[11px] font-bold text-base-content flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Plus size={13} className="text-primary" />
            <span>Add Destination Name</span>
          </span>
          <span className="text-[9px] text-base-content/50">Just type or pick name</span>
        </label>

        {/* Input box + Add button */}
        <form onSubmit={handleAddDestination} className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              list="known-destinations"
              placeholder="e.g. India Gate, Khan Market..."
              value={inputDestinationName}
              onChange={(e) => setInputDestinationName(e.target.value)}
              className="input input-sm input-bordered w-full text-xs font-medium focus:input-primary pr-2"
            />
            <datalist id="known-destinations">
              {availableLocations.map((loc) => (
                <option key={loc.id} value={loc.name} />
              ))}
            </datalist>
          </div>
          <button
            type="submit"
            disabled={!inputDestinationName.trim()}
            className="btn btn-sm btn-primary px-3 text-xs font-bold gap-1 shadow-xs"
          >
            <Plus size={14} /> Add
          </button>
        </form>

        {/* Quick-Add Chips for Remaining Available Locations */}
        {availableLocations.length > 0 && (
          <div className="flex flex-col gap-1 pt-1">
            <span className="text-[9px] font-bold uppercase text-base-content/50">
              Popular Delhi Destinations (Click to add)
            </span>
            <div className="flex flex-wrap gap-1">
              {availableLocations.slice(0, 5).map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => addStopByLocation(loc)}
                  className="btn btn-xs btn-outline btn-ghost border-base-300 text-[10px] normal-case truncate max-w-[130px] font-medium hover:border-primary hover:text-primary"
                  title={`Add ${loc.name}`}
                >
                  + {loc.name.replace(/– Central Park|Metro Station/g, '').trim()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. List of Scheduled Destinations */}
      <div className="flex flex-col gap-1 flex-1 min-h-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-base-content/80">
            Destinations to Visit ({stops.length})
          </span>
          <span className="text-[9px] font-mono text-base-content/50">
            {stops.filter((s) => s.id !== depotId).length} stops + 1 depot
          </span>
        </div>

        <div className="overflow-y-auto max-h-48 border border-base-300 rounded-xl divide-y divide-base-200 bg-base-100 shadow-2xs">
          {stops.map((stop, idx) => {
            const isDepot = stop.id === depotId;
            return (
              <div
                key={stop.id}
                className={`p-2 flex items-center justify-between transition-colors ${
                  isDepot ? 'bg-secondary/5 font-semibold' : 'hover:bg-base-200/40'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 pr-1">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono shrink-0 ${
                      isDepot
                        ? 'bg-secondary text-secondary-content'
                        : 'bg-base-200 text-base-content/80'
                    }`}
                  >
                    {isDepot ? '★' : idx}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs text-base-content font-bold truncate">
                      {stop.name || stop.id}
                    </span>
                    <span className="text-[9px] text-base-content/50 font-mono">
                      {isDepot ? 'Start & Return Depot' : `Stop destination`}
                    </span>
                  </div>
                </div>

                {!isDepot && stops.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveStop(stop.id)}
                    className="btn btn-ghost btn-xs text-error/70 hover:text-error hover:bg-error/10 p-1"
                    title={`Remove ${stop.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Optimization Priority (Clean & Simple) */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-base-content/60">
          Optimization Priority
        </label>
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => handleSelectPriority('fastest')}
            className={`btn btn-xs text-[10px] normal-case ${
              profile === 'fastest' ? 'btn-primary' : 'btn-outline border-base-300'
            }`}
          >
            ⚡ Fastest
          </button>
          <button
            type="button"
            onClick={() => handleSelectPriority('shortest')}
            className={`btn btn-xs text-[10px] normal-case ${
              profile === 'shortest' || profile === 'delivery' ? 'btn-primary' : 'btn-outline border-base-300'
            }`}
          >
            📏 Shortest
          </button>
          <button
            type="button"
            onClick={() => handleSelectPriority('green')}
            className={`btn btn-xs text-[10px] normal-case ${
              profile === 'green' ? 'btn-primary' : 'btn-outline border-base-300'
            }`}
          >
            🌱 Green / Eco
          </button>
        </div>
      </div>

      {/* 6. Optional Advanced Settings (Collapsible, out of the way) */}
      <details className="collapse collapse-arrow bg-base-200/40 rounded-xl border border-base-300 text-[11px]">
        <summary className="collapse-title text-[10px] font-semibold py-1 px-3 min-h-0 text-base-content/60 flex items-center gap-1">
          <Sliders size={11} /> Advanced Parameters (Optional)
        </summary>
        <div className="collapse-content px-3 pb-2 pt-1 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-base-content/70">Vehicle Capacity</span>
              <input
                type="number"
                min="5"
                max="50"
                value={capacity}
                onChange={(e) =>
                  setFleetParams((prev) => ({
                    ...prev,
                    capacity: parseFloat(e.target.value) || 15.0,
                  }))
                }
                className="input input-xs input-bordered font-mono"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-base-content/70">Algorithm</span>
              <select
                value={fleetParams.useOrchestrator !== false ? 'orchestrator' : algorithm}
                onChange={(e) => {
                  if (e.target.value === 'orchestrator') {
                    setFleetParams((prev) => ({ ...prev, useOrchestrator: true, algorithm: 'orchestrator' }));
                  } else {
                    setFleetParams((prev) => ({
                      ...prev,
                      useOrchestrator: false,
                      algorithm: e.target.value,
                    }));
                  }
                }}
                className="select select-bordered select-xs font-semibold"
              >
                <option value="orchestrator">🧠 AI Orchestrator (Auto-Solver)</option>
                <option value="QPSO">⚛ QPSO (Quantum Swarm)</option>
                <option value="GA">🧬 Genetic Algorithm (GA)</option>
                <option value="Exact">⚖ OR-Tools CP-SAT (Exact)</option>
                <option value="Quantum Annealing">🌀 Quantum Annealing (QUBO)</option>
                <option value="QAOA">🔬 Gate-Model QAOA (Quantum)</option>
              </select>
            </div>
          </div>
        </div>
      </details>

      {/* 7. Action Button */}
      <button
        type="button"
        onClick={onOptimize}
        disabled={loading || stops.length < 2}
        className="btn btn-primary btn-sm w-full font-bold shadow-md shadow-primary/20 gap-2 mt-auto text-xs"
      >
        {loading ? (
          <>
            <span className="loading loading-spinner loading-xs" />
            <span>Optimizing Fleet Routes...</span>
          </>
        ) : (
          <>
            <Play size={14} fill="currentColor" />
            <span>Optimize Multi-Vehicle Routes</span>
          </>
        )}
      </button>
    </div>
  );
}
