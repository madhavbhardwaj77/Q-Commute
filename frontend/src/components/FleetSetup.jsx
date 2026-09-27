import React, { useState } from 'react';
import { Truck, Plus, Trash2, Upload, Play, RefreshCw, MapPin } from 'lucide-react';

const DEFAULT_SAMPLE_STOPS = [
  { id: 'connaught_place', name: 'Connaught Place (Depot)', lat: 28.6329, lon: 77.2195, demand: 0.0 },
  { id: 'india_gate', name: 'India Gate', lat: 28.6129, lon: 77.2295, demand: 3.0, time_window_start: 100, time_window_end: 800 },
  { id: 'jantar_mantar', name: 'Jantar Mantar', lat: 28.6270, lon: 77.2166, demand: 2.0, time_window_start: 50, time_window_end: 600 },
  { id: 'new_delhi_railway', name: 'New Delhi Rly Station', lat: 28.6419, lon: 77.2197, demand: 4.0, time_window_start: 150, time_window_end: 900 },
  { id: 'barakhamba_road', name: 'Barakhamba Road', lat: 28.6313, lon: 77.2279, demand: 2.5, time_window_start: 80, time_window_end: 700 },
  { id: 'mandi_house', name: 'Mandi House', lat: 28.6236, lon: 77.2337, demand: 3.5, time_window_start: 120, time_window_end: 850 },
  { id: 'khan_market', name: 'Khan Market', lat: 28.6004, lon: 77.2270, demand: 4.0, time_window_start: 200, time_window_end: 1000 },
  { id: 'national_museum', name: 'National Museum', lat: 28.6117, lon: 77.2197, demand: 2.0, time_window_start: 100, time_window_end: 750 },
];

export default function FleetSetup({
  onOptimize,
  loading = false,
  fleetParams,
  setFleetParams,
}) {
  const {
    numVehicles,
    capacity,
    algorithm,
    iterations,
    swarmSize,
    stops,
    depotId,
    weights,
  } = fleetParams;

  // New stop form state
  const [newStop, setNewStop] = useState({
    id: '',
    lat: '',
    lon: '',
    demand: '2',
    twStart: '',
    twEnd: '',
  });

  const [csvError, setCsvError] = useState(null);

  const handleAddStop = (e) => {
    e.preventDefault();
    if (!newStop.id || !newStop.lat || !newStop.lon) return;

    const latVal = parseFloat(newStop.lat);
    const lonVal = parseFloat(newStop.lon);
    const demVal = parseFloat(newStop.demand) || 0;
    const tws = newStop.twStart ? parseFloat(newStop.twStart) : null;
    const twe = newStop.twEnd ? parseFloat(newStop.twEnd) : null;

    if (isNaN(latVal) || isNaN(lonVal)) return;

    const stopObj = {
      id: newStop.id.trim().toLowerCase().replace(/\s+/g, '_'),
      name: newStop.id.trim(),
      lat: latVal,
      lon: lonVal,
      demand: demVal,
      time_window_start: tws,
      time_window_end: twe,
    };

    setFleetParams((prev) => ({
      ...prev,
      stops: [...prev.stops.filter((s) => s.id !== stopObj.id), stopObj],
    }));

    setNewStop({ id: '', lat: '', lon: '', demand: '2', twStart: '', twEnd: '' });
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

  const handleLoadSample = () => {
    setFleetParams((prev) => ({
      ...prev,
      stops: DEFAULT_SAMPLE_STOPS,
      depotId: 'connaught_place',
    }));
  };

  const handleCsvUpload = (event) => {
    setCsvError(null);
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setCsvError('CSV must have a header and at least one stop.');
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const nameIdx = headers.indexOf('name');
        const latIdx = headers.indexOf('lat');
        const lonIdx = headers.indexOf('lon');
        const demIdx = headers.indexOf('demand');
        const twsIdx = headers.indexOf('time_window_start');
        const tweIdx = headers.indexOf('time_window_end');

        if (nameIdx === -1 || latIdx === -1 || lonIdx === -1) {
          setCsvError('CSV must include "name", "lat", and "lon" columns.');
          return;
        }

        const parsedStops = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim());
          if (cols.length <= Math.max(nameIdx, latIdx, lonIdx)) continue;

          const name = cols[nameIdx];
          const lat = parseFloat(cols[latIdx]);
          const lon = parseFloat(cols[lonIdx]);
          const demand = demIdx !== -1 ? parseFloat(cols[demIdx]) || 0 : 0;
          const twStart = twsIdx !== -1 && cols[twsIdx] ? parseFloat(cols[twsIdx]) : null;
          const twEnd = tweIdx !== -1 && cols[tweIdx] ? parseFloat(cols[tweIdx]) : null;

          if (!name || isNaN(lat) || isNaN(lon)) continue;

          parsedStops.push({
            id: name.toLowerCase().replace(/\s+/g, '_'),
            name,
            lat,
            lon,
            demand,
            time_window_start: twStart,
            time_window_end: twEnd,
          });
        }

        if (parsedStops.length === 0) {
          setCsvError('No valid stop records found in CSV.');
          return;
        }

        setFleetParams((prev) => ({
          ...prev,
          stops: parsedStops,
          depotId: parsedStops[0].id,
        }));
      } catch (err) {
        setCsvError(`Failed to parse CSV: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm p-4 flex flex-col gap-3">
      {/* Title Header */}
      <div className="flex items-center justify-between pb-2 border-b border-base-300">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Truck size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-base-content leading-tight">Fleet VRP Setup</h2>
            <p className="text-[10px] text-base-content/60">Multi-Vehicle Capacity & Time-Window VRP</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLoadSample}
          className="btn btn-ghost btn-xs text-primary gap-1"
          title="Load 8 Connaught Place verified anchor stops"
        >
          <RefreshCw size={12} /> Load Demo
        </button>
      </div>

      {/* Fleet Size & Capacity Controls */}
      <div className="grid grid-cols-2 gap-2">
        <div className="form-control">
          <label className="label py-1">
            <span className="label-text text-[11px] font-semibold">Fleet Size (Vehicles)</span>
          </label>
          <input
            type="number"
            min="1"
            max="12"
            value={numVehicles}
            onChange={(e) =>
              setFleetParams((prev) => ({ ...prev, numVehicles: Math.max(1, parseInt(e.target.value) || 1) }))
            }
            className="input input-sm input-bordered w-full font-mono text-xs"
          />
        </div>

        <div className="form-control">
          <label className="label py-1">
            <span className="label-text text-[11px] font-semibold">Capacity / Vehicle</span>
          </label>
          <input
            type="number"
            min="1"
            step="0.5"
            value={capacity}
            onChange={(e) =>
              setFleetParams((prev) => ({ ...prev, capacity: Math.max(1, parseFloat(e.target.value) || 1) }))
            }
            className="input input-sm input-bordered w-full font-mono text-xs"
          />
        </div>
      </div>

      {/* Algorithm & Tuning */}
      <div className="grid grid-cols-3 gap-2">
        <div className="form-control col-span-1">
          <label className="label py-1">
            <span className="label-text text-[10px] font-semibold">Routing Engine</span>
          </label>
          <select
            value={fleetParams.useOrchestrator !== false ? 'orchestrator' : algorithm}
            onChange={(e) => {
              if (e.target.value === 'orchestrator') {
                setFleetParams((prev) => ({ ...prev, useOrchestrator: true }));
              } else {
                setFleetParams((prev) => ({ ...prev, useOrchestrator: false, algorithm: e.target.value }));
              }
            }}
            className="select select-bordered select-xs w-full text-[10px] font-semibold"
          >
            <option value="orchestrator">🧠 Orchestrator</option>
            <option value="QPSO">QPSO</option>
            <option value="GA">GA</option>
          </select>
        </div>

        <div className="form-control col-span-1">
          <label className="label py-1">
            <span className="label-text text-[10px] font-semibold">Iterations</span>
          </label>
          <input
            type="number"
            min="10"
            max="200"
            value={iterations}
            onChange={(e) =>
              setFleetParams((prev) => ({ ...prev, iterations: parseInt(e.target.value) || 40 }))
            }
            className="input input-xs input-bordered w-full font-mono text-[11px]"
          />
        </div>

        <div className="form-control col-span-1">
          <label className="label py-1">
            <span className="label-text text-[10px] font-semibold">Swarm Size</span>
          </label>
          <input
            type="number"
            min="5"
            max="100"
            value={swarmSize}
            onChange={(e) =>
              setFleetParams((prev) => ({ ...prev, swarmSize: parseInt(e.target.value) || 25 }))
            }
            className="input input-xs input-bordered w-full font-mono text-[11px]"
          />
        </div>
      </div>

      {/* Urgency Context (When using Orchestrator) */}
      {fleetParams.useOrchestrator !== false && (
        <div className="flex items-center justify-between p-1.5 bg-base-200/50 rounded-lg border border-base-300 text-[11px]">
          <span className="font-semibold text-base-content/80 text-[10px]">Context Urgency:</span>
          <select
            value={fleetParams.urgency || 'standard'}
            onChange={(e) => setFleetParams((prev) => ({ ...prev, urgency: e.target.value }))}
            className="select select-bordered select-xs text-[10px] font-mono h-6 min-h-6 py-0"
          >
            <option value="standard">Standard (Full Optimization)</option>
            <option value="live_reroute">⚡ Live Reroute (Warm Start)</option>
          </select>
        </div>
      )}

      {/* Priority Profile Selector */}
      <div className="flex flex-col gap-1.5 p-2 bg-base-200/50 rounded-lg border border-base-300">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-base-content flex items-center gap-1">
            Optimization Priority
          </label>
          <select
            value={fleetParams.profile || 'delivery'}
            onChange={(e) => setFleetParams((prev) => ({ ...prev, profile: e.target.value }))}
            className="select select-bordered select-xs text-[11px] font-semibold"
          >
            <option value="delivery">📦 Delivery (Min Distance)</option>
            <option value="emergency">🚑 Emergency (Min Time & Strict Congestion)</option>
            <option value="vip">⭐ VIP (Min Congestion)</option>
            <option value="custom">⚙️ Custom Weights</option>
          </select>
        </div>

        {/* Profile Description */}
        {(!fleetParams.profile || fleetParams.profile === 'delivery') && (
          <div className="text-[10px] text-base-content/70 flex justify-between font-mono bg-base-100 p-1.5 rounded">
            <span>Prioritizes shortest overall travel mileage</span>
            <span className="font-bold text-primary">Dist: 60% • Time: 20% • Cong: 20%</span>
          </div>
        )}
        {fleetParams.profile === 'emergency' && (
          <div className="text-[10px] text-error flex justify-between font-mono bg-error/10 p-1.5 rounded border border-error/20">
            <span>Critical rapid response • Avoids congested corridors</span>
            <span className="font-bold">Time: 80% • Dist: 10% • Cong: 10%</span>
          </div>
        )}
        {fleetParams.profile === 'vip' && (
          <div className="text-[10px] text-warning flex justify-between font-mono bg-warning/10 p-1.5 rounded border border-warning/20">
            <span>Smooth transit • Heavily penalizes traffic bottlenecks</span>
            <span className="font-bold">Cong: 60% • Time: 20% • Dist: 20%</span>
          </div>
        )}

        {/* Custom Weight Sliders (Only visible if profile === 'custom') */}
        {fleetParams.profile === 'custom' && (
          <div className="flex flex-col gap-1.5 pt-1.5 border-t border-base-300/60 mt-1">
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[10px] font-semibold">
                <span>Time Weight</span>
                <span className="font-mono">{((weights?.time || 0.5) * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights?.time || 0.5}
                onChange={(e) =>
                  setFleetParams((prev) => ({
                    ...prev,
                    weights: { ...prev.weights, time: parseFloat(e.target.value) },
                  }))
                }
                className="range range-primary range-xs"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[10px] font-semibold">
                <span>Distance Weight</span>
                <span className="font-mono">{((weights?.dist || 0.3) * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights?.dist || 0.3}
                onChange={(e) =>
                  setFleetParams((prev) => ({
                    ...prev,
                    weights: { ...prev.weights, dist: parseFloat(e.target.value) },
                  }))
                }
                className="range range-secondary range-xs"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[10px] font-semibold">
                <span>Congestion Weight</span>
                <span className="font-mono">{((weights?.cong || 0.2) * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={weights?.cong || 0.2}
                onChange={(e) =>
                  setFleetParams((prev) => ({
                    ...prev,
                    weights: { ...prev.weights, cong: parseFloat(e.target.value) },
                  }))
                }
                className="range range-accent range-xs"
              />
            </div>
          </div>
        )}
      </div>


      {/* Primary Depot Selection */}
      <div className="form-control">
        <label className="label py-1">
          <span className="label-text text-[11px] font-semibold flex items-center gap-1">
            <MapPin size={12} className="text-secondary" /> Primary Depot (Start & Finish)
          </span>
        </label>
        <select
          value={depotId}
          onChange={(e) => setFleetParams((prev) => ({ ...prev, depotId: e.target.value }))}
          className="select select-bordered select-sm w-full text-xs font-semibold"
        >
          {stops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || s.id} ({s.lat.toFixed(4)}, {s.lon.toFixed(4)})
            </option>
          ))}
        </select>
      </div>

      {/* Stop List Section */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-base-200">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-base-content/80">
            Stops & Destinations ({stops.length})
          </span>
          <label className="btn btn-xs btn-outline btn-secondary gap-1 cursor-pointer">
            <Upload size={12} /> Import CSV
            <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
          </label>
        </div>

        {csvError && <div className="text-[10px] text-error bg-error/10 p-1.5 rounded">{csvError}</div>}

        {/* Scrollable list of stops */}
        <div className="max-h-36 overflow-y-auto border border-base-200 rounded-lg divide-y divide-base-200 text-xs">
          {stops.map((s) => {
            const isDepot = s.id === depotId;
            return (
              <div
                key={s.id}
                className={`p-1.5 flex items-center justify-between hover:bg-base-200/50 ${
                  isDepot ? 'bg-primary/5 font-semibold' : ''
                }`}
              >
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="truncate text-[11px] text-base-content">
                    {s.name || s.id} {isDepot && <span className="badge badge-primary badge-xs">Depot</span>}
                  </span>
                  <span className="text-[9px] text-base-content/50">
                    Demand: {s.demand} | ({s.lat.toFixed(3)}, {s.lon.toFixed(3)})
                    {s.time_window_end ? ` | TW: [${s.time_window_start || 0}-${s.time_window_end}]` : ''}
                  </span>
                </div>
                {!isDepot && (
                  <button
                    type="button"
                    onClick={() => handleRemoveStop(s.id)}
                    className="btn btn-ghost btn-xs text-error p-0.5"
                    title="Remove stop"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Add manual stop accordion/form */}
        <form onSubmit={handleAddStop} className="grid grid-cols-6 gap-1.5 pt-1">
          <input
            type="text"
            placeholder="Name/ID"
            value={newStop.id}
            onChange={(e) => setNewStop({ ...newStop, id: e.target.value })}
            className="input input-xs input-bordered col-span-2 text-[10px]"
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Lat"
            value={newStop.lat}
            onChange={(e) => setNewStop({ ...newStop, lat: e.target.value })}
            className="input input-xs input-bordered col-span-2 text-[10px]"
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Lon"
            value={newStop.lon}
            onChange={(e) => setNewStop({ ...newStop, lon: e.target.value })}
            className="input input-xs input-bordered col-span-2 text-[10px]"
          />
          <input
            type="number"
            step="0.5"
            placeholder="Demand"
            value={newStop.demand}
            onChange={(e) => setNewStop({ ...newStop, demand: e.target.value })}
            className="input input-xs input-bordered col-span-2 text-[10px]"
          />
          <input
            type="number"
            placeholder="TW End"
            value={newStop.twEnd}
            onChange={(e) => setNewStop({ ...newStop, twEnd: e.target.value })}
            className="input input-xs input-bordered col-span-2 text-[10px]"
          />
          <button type="submit" className="btn btn-xs btn-primary col-span-2 gap-1">
            <Plus size={12} /> Add
          </button>
        </form>
      </div>

      {/* Action Button */}
      <button
        type="button"
        onClick={onOptimize}
        disabled={loading || stops.length < 2}
        className="btn btn-primary btn-sm w-full font-bold shadow-md shadow-primary/20 gap-2 mt-1"
      >
        {loading ? (
          <>
            <span className="loading loading-spinner loading-xs" /> Optimizing Fleet...
          </>
        ) : (
          <>
            <Play size={16} fill="currentColor" /> Run Fleet Optimization
          </>
        )}
      </button>
    </div>
  );
}
