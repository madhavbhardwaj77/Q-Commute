import React from 'react';
import { AlertTriangle, CheckCircle, Clock, Navigation, ShieldAlert, Award, Fuel, Leaf } from 'lucide-react';
import ConvergenceChart from './ConvergenceChart';

const VEHICLE_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
];

export default function FleetResults({ result, loading, liveConvergence = [] }) {
  if (loading) {
    return (
      <div className="card bg-base-100 border border-base-300 shadow-sm p-4 flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between pb-2 border-b border-base-300">
          <div className="flex items-center gap-2">
            <span className="loading loading-spinner loading-xs text-primary" />
            <span className="text-xs font-bold text-base-content">
              Optimizing Routes in Real Time...
            </span>
          </div>
          {liveConvergence.length > 0 && (
            <span className="badge badge-primary badge-sm font-mono text-[10px] animate-pulse">
              Iter {liveConvergence[liveConvergence.length - 1].iteration} | Cost: {liveConvergence[liveConvergence.length - 1].best_cost.toFixed(2)}
            </span>
          )}
        </div>

        {liveConvergence.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-[11px] text-base-content/70">
              <span className="font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success animate-ping" /> Live Swarm Convergence
              </span>
              <span className="font-mono text-[10px] text-primary">
                {liveConvergence.length} data points
              </span>
            </div>
            <ConvergenceChart data={liveConvergence} isLive={true} />
            <p className="text-[10px] text-base-content/50 font-mono text-center">
              Pushed live via WebSocket /fleet/optimize/stream
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 gap-3 text-base-content/60">
            <span className="loading loading-bars loading-md text-primary" />
            <p className="text-xs font-semibold">Initializing quantum swarm & calculating distances...</p>
          </div>
        )}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card bg-base-100 border border-base-300 shadow-sm p-6 flex flex-col items-center justify-center text-center gap-2 h-full text-base-content/50">
        <Navigation size={32} className="opacity-40" />
        <p className="text-xs font-semibold">No Fleet Optimization Executed Yet</p>
        <p className="text-[11px]">Configure fleet size and stops on the left, then click Run Fleet Optimization.</p>
      </div>
    );
  }

  const {
    algorithm,
    routes = {},
    vehicle_metrics = {},
    total_distance = 0,
    total_time = 0,
    estimated_fuel_cost = 0,
    estimated_co2_kg = 0,
    violations = [],
    fitness = 0,
    convergence = [],
  } = result;

  const vehicleIds = Object.keys(routes);
  const hasViolations = violations && violations.length > 0;

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm p-4 flex flex-col gap-3 h-full overflow-y-auto">
      {/* Header with Algorithm & Status */}
      <div className="flex items-center justify-between pb-2 border-b border-base-300">
        <div className="flex items-center gap-2">
          <span className="badge badge-primary badge-sm font-bold">{algorithm}</span>
          <h3 className="text-sm font-bold text-base-content">Fleet VRP Results</h3>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono text-base-content/60">
          <Award size={13} className="text-primary" /> Fitness: {fitness.toFixed(2)}
        </div>
      </div>

      {/* Orchestrator Solver Selection Badge */}
      {(result.solver_used || result.solver_reason) && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 flex items-center justify-between text-xs">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="badge badge-primary badge-xs uppercase font-bold tracking-wider">
                {result.solver_used}
              </span>
              <span className="font-semibold text-base-content text-[11px]">
                Solved using: {result.algorithm || result.solver_used}
              </span>
            </div>
            {result.solver_reason && (
              <span className="text-[10px] text-base-content/70 font-mono">
                {result.solver_reason}
              </span>
            )}
          </div>
          {result.runtime_ms > 0 && (
            <span className="text-[10px] font-mono text-primary font-bold">
              {result.runtime_ms.toFixed(1)} ms
            </span>
          )}
        </div>
      )}

      {/* Constraints Status / Violations Alert Banner */}
      {hasViolations ? (
        <div className="alert alert-warning py-2.5 px-3 rounded-lg border border-warning/30 bg-warning/10 text-xs shadow-sm flex flex-col items-start gap-1">
          <div className="flex items-center gap-1.5 font-bold text-warning-content">
            <AlertTriangle size={15} className="text-warning flex-shrink-0" />
            <span>{violations.length} Constraint Violation{violations.length > 1 ? 's' : ''} Detected</span>
          </div>
          <ul className="list-disc list-inside text-[11px] text-base-content/80 space-y-0.5 mt-0.5">
            {violations.map((v, i) => (
              <li key={i} className="font-mono text-error font-medium">{v}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="alert alert-success py-2 px-3 rounded-lg border border-success/30 bg-success/10 text-xs shadow-sm flex items-center gap-2 text-success-content">
          <CheckCircle size={15} className="text-success flex-shrink-0" />
          <span className="font-semibold text-[11px]">All Vehicle Capacity & Time-Window Constraints Satisfied</span>
        </div>
      )}

      {/* Global Fleet Metrics Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-base-200/60 p-2.5 rounded-lg border border-base-300/50 flex flex-col">
          <span className="text-[10px] text-base-content/60 font-semibold uppercase tracking-wider">Total Distance</span>
          <span className="text-base font-black font-mono text-base-content mt-0.5">
            {total_distance > 1000 ? `${(total_distance / 1000).toFixed(2)} km` : `${total_distance.toFixed(1)} m`}
          </span>
        </div>
        <div className="bg-base-200/60 p-2.5 rounded-lg border border-base-300/50 flex flex-col">
          <span className="text-[10px] text-base-content/60 font-semibold uppercase tracking-wider flex items-center gap-1">
            <Clock size={11} /> Total Duration
          </span>
          <span className="text-base font-black font-mono text-base-content mt-0.5">
            {total_time > 60 ? `${(total_time / 60).toFixed(1)} min` : `${total_time.toFixed(1)} s`}
          </span>
        </div>
        <div className="bg-base-200/60 p-2.5 rounded-lg border border-base-300/50 flex flex-col">
          <span className="text-[10px] text-base-content/60 font-semibold uppercase tracking-wider flex items-center gap-1">
            <Fuel size={11} className="text-amber-500" /> Est. Fuel Cost
          </span>
          <span className="text-base font-black font-mono text-base-content mt-0.5">
            ₹{estimated_fuel_cost.toFixed(2)}
          </span>
        </div>
        <div className="bg-base-200/60 p-2.5 rounded-lg border border-base-300/50 flex flex-col">
          <span className="text-[10px] text-base-content/60 font-semibold uppercase tracking-wider flex items-center gap-1">
            <Leaf size={11} className="text-emerald-500" /> Est. CO₂
          </span>
          <span className="text-base font-black font-mono text-base-content mt-0.5">
            {estimated_co2_kg.toFixed(3)} kg
          </span>
        </div>
      </div>

      {/* Per-Vehicle Summary Cards */}
      <div className="flex flex-col gap-2 mt-1">
        <span className="text-xs font-bold text-base-content/80">Vehicle Assignment Breakdown</span>

        <div className="flex flex-col gap-2">
          {vehicleIds.map((vId, idx) => {
            const stopsAssigned = routes[vId] || [];
            const metric = vehicle_metrics[vId] || {};
            const color = VEHICLE_COLORS[idx % VEHICLE_COLORS.length];
            const load = metric.load || 0;
            const cap = metric.capacity || 0;
            const dist = metric.distance || 0;
            const duration = metric.time || 0;
            const loadPercent = cap > 0 ? Math.min(100, Math.round((load / cap) * 100)) : 0;
            const isOverCapacity = cap > 0 && load > cap;

            return (
              <div
                key={vId}
                className="bg-base-100 border border-base-200 rounded-lg p-2.5 shadow-sm flex flex-col gap-1.5"
                style={{ borderLeft: `4px solid ${color}` }}
              >
                {/* Vehicle Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-bold text-xs text-base-content uppercase">{vId}</span>
                  </div>
                  <span className="badge badge-sm font-mono text-[10px]">
                    {stopsAssigned.length} stop{stopsAssigned.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Capacity Progress Bar */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-base-content/60">Load: {load.toFixed(1)} / {cap.toFixed(1)}</span>
                    <span className={`font-bold ${isOverCapacity ? 'text-error' : 'text-success'}`}>
                      {loadPercent}%
                    </span>
                  </div>
                  <progress
                    className={`progress w-full h-1.5 ${isOverCapacity ? 'progress-error' : 'progress-primary'}`}
                    value={loadPercent}
                    max="100"
                  />
                </div>

                {/* Sub-tour Distance & Time */}
                <div className="flex justify-between text-[10px] text-base-content/70 font-mono pt-1 border-t border-base-200">
                  <span>Dist: {dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${dist.toFixed(1)} m`}</span>
                  <span>Time: {duration > 60 ? `${(duration / 60).toFixed(1)} m` : `${duration.toFixed(1)} s`}</span>
                </div>

                {/* Sub-tour Cost & Emissions */}
                {(metric.fuel_cost !== undefined || metric.co2_kg !== undefined) && (
                  <div className="flex justify-between text-[10px] font-mono text-base-content/70">
                    <span className="flex items-center gap-1">
                      <Fuel size={10} className="text-amber-500" /> ₹{(metric.fuel_cost || 0).toFixed(2)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Leaf size={10} className="text-emerald-500" /> {(metric.co2_kg || 0).toFixed(3)} kg CO₂
                    </span>
                  </div>
                )}

                {/* Sub-tour Stops Sequence */}
                {stopsAssigned.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5 pt-1 border-t border-base-200/60">
                    {stopsAssigned.map((sid, sIdx) => (
                      <span key={sIdx} className="badge badge-ghost badge-xs text-[9px] font-mono">
                        {sIdx + 1}. {sid}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Convergence Curve Details */}
      {convergence.length > 0 && (
        <div className="bg-base-200/40 border border-base-300/40 rounded-lg p-2.5 flex flex-col gap-1.5 mt-1">
          <div className="flex justify-between font-semibold text-base-content/70 text-[11px]">
            <span>Optimization Convergence</span>
            <span className="font-mono text-primary text-[10px]">{convergence.length - 1} Iterations</span>
          </div>
          <ConvergenceChart data={convergence} isLive={false} />
          <div className="flex justify-between font-mono text-[10px] text-base-content/50 pt-1 border-t border-base-300/50">
            <span>Initial: {convergence[0]?.best_cost?.toFixed(2)}</span>
            <span>Final: {convergence[convergence.length - 1]?.best_cost?.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
