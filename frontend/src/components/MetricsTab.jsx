import React from 'react';
import { Clock, Navigation, Gauge, Cpu, Layers, GitFork, Milestone, ArrowRight } from 'lucide-react';

export default function MetricsTab({ routeResult, rerouteDiff }) {
  if (!routeResult) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
        <Cpu className="w-8 h-8 stroke-1 text-slate-300 animate-pulse" />
        <p className="text-xs font-medium">Select locations and optimize to view live metrics.</p>
      </div>
    );
  }

  const formatSecs = (s) => {
    if (s == null) return '—';
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const cards = [
    { label: 'Algorithm', value: routeResult.algorithm, icon: Cpu, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Total Travel Time', value: formatSecs(routeResult.travel_time_s), icon: Clock, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Total Distance', value: `${(routeResult.distance_m / 1000).toFixed(2)} km`, icon: Navigation, color: 'text-blue-600 bg-blue-50' },
    { label: 'Objective Cost', value: routeResult.total_cost?.toFixed(4) || '—', icon: Gauge, color: 'text-violet-600 bg-violet-50' },
    { label: 'Runtime (Latency)', value: `${Math.round(routeResult.runtime_ms)} ms`, icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: 'Route Nodes', value: `${routeResult.path?.length || 0} nodes`, icon: GitFork, color: 'text-slate-600 bg-slate-100' },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* AI Orchestrator Solver Selection Banner */}
      {(routeResult.solver_used || routeResult.solver_reason) && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-2.5 flex items-center justify-between text-xs">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="badge badge-primary badge-xs uppercase font-bold tracking-wider">
                {routeResult.solver_used}
              </span>
              <span className="font-semibold text-base-content text-[11px]">
                AI Orchestrator: {routeResult.solver_used}
              </span>
            </div>
            {routeResult.solver_reason && (
              <span className="text-[10px] text-base-content/70 font-mono">
                {routeResult.solver_reason}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="card bg-base-100 border border-base-300 p-2.5 flex flex-col gap-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-base-content/60 uppercase tracking-wider">{c.label}</span>
                <span className={`p-1 rounded-md ${c.color}`}><Icon className="w-3 h-3" /></span>
              </div>
              <span className="text-sm font-extrabold text-base-content">{c.value}</span>
            </div>
          );
        })}
      </div>

      {/* Multi-Destination Itinerary Breakdown (if multi-dest or legs present) */}
      {routeResult.legs && routeResult.legs.length > 0 && (
        <div className="card bg-base-100 border border-base-300 rounded-xl p-3 flex flex-col gap-2 shadow-2xs">
          <div className="flex items-center justify-between pb-1 border-b border-base-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
              <Milestone className="w-3 h-3" /> Multi-Destination Itinerary ({routeResult.legs.length} Legs)
            </span>
            <span className="badge badge-primary badge-xs font-semibold">
              {routeResult.is_multi_dest ? 'Optimized Tour' : 'Multi-Leg'}
            </span>
          </div>

          {/* Ordered Stop Chain */}
          {routeResult.ordered_stops && routeResult.ordered_stops.length > 1 && (
            <div className="bg-base-200/50 p-2 rounded-lg border border-base-300 flex flex-wrap items-center gap-1 text-[11px]">
              {routeResult.ordered_stops.map((stopId, idx) => (
                <React.Fragment key={idx}>
                  <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                    idx === 0
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : idx === routeResult.ordered_stops.length - 1
                      ? 'bg-red-100 text-red-800 border border-red-300'
                      : 'bg-base-100 text-base-content border border-base-300'
                  }`}>
                    {idx === 0 ? 'Start: ' : idx === routeResult.ordered_stops.length - 1 ? 'End: ' : `${idx}. `}
                    {stopId.replace(/_/g, ' ')}
                  </span>
                  {idx < routeResult.ordered_stops.length - 1 && (
                    <ArrowRight className="w-3 h-3 text-base-content/40 flex-shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Leg-by-leg details table */}
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-0.5">
            {routeResult.legs.map((leg) => (
              <div
                key={leg.leg_index}
                className="flex items-center justify-between p-2 rounded-lg bg-base-200/30 border border-base-300 text-[11px]"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="badge badge-neutral badge-xs font-bold font-mono">{leg.leg_index}</span>
                  <span className="font-semibold text-base-content truncate">
                    {leg.from_name} ➔ {leg.to_name}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 text-base-content/80 text-[10px] font-mono">
                  <span>{(leg.distance_m / 1000).toFixed(2)} km</span>
                  <span>•</span>
                  <span>{formatSecs(leg.travel_time_s)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hyperparameters Grid */}
      {routeResult.quantum_params && (
        <div className="card bg-base-100 border border-base-300 rounded-xl p-3 flex flex-col gap-2 shadow-2xs">
          <div className="flex items-center justify-between pb-1 border-b border-base-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Quantum Hyperparameters</span>
            <span className="badge badge-primary badge-xs font-semibold">Active</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 text-center">
            <div className="bg-base-200/60 rounded-lg p-1.5 border border-base-300/40 flex flex-col justify-center">
              <span className="text-[9px] font-semibold text-base-content/60 uppercase block">Particles</span>
              <span className="text-xs font-bold text-base-content">{routeResult.quantum_params.n_particles}</span>
            </div>
            <div className="bg-base-200/60 rounded-lg p-1.5 border border-base-300/40 flex flex-col justify-center">
              <span className="text-[9px] font-semibold text-base-content/60 uppercase block">Iter</span>
              <span className="text-xs font-bold text-base-content">{routeResult.quantum_params.n_iter}</span>
            </div>
            <div className="bg-base-200/60 rounded-lg p-1.5 border border-base-300/40 flex flex-col justify-center">
              <span className="text-[9px] font-semibold text-primary uppercase block">w_time</span>
              <span className="text-xs font-bold text-primary">{Math.round(routeResult.quantum_params.weight_time * 100)}%</span>
            </div>
            <div className="bg-base-200/60 rounded-lg p-1.5 border border-base-300/40 flex flex-col justify-center">
              <span className="text-[9px] font-semibold text-accent uppercase block">w_dist</span>
              <span className="text-xs font-bold text-accent">{Math.round(routeResult.quantum_params.weight_dist * 100)}%</span>
            </div>
            <div className="bg-base-200/60 rounded-lg p-1.5 border border-base-300/40 flex flex-col justify-center">
              <span className="text-[9px] font-semibold text-warning uppercase block">w_cong</span>
              <span className="text-xs font-bold text-warning">{Math.round(routeResult.quantum_params.weight_cong * 100)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Reroute Comparison if available */}
      {rerouteDiff && (
        <div className="card bg-warning/10 border border-warning/30 rounded-xl p-3 flex flex-col gap-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-base-content">Dynamic Rerouting Delta</span>
            <span className={`badge badge-sm font-bold ${
              rerouteDiff.route_changed ? 'badge-success text-success-content' : 'badge-warning text-warning-content'
            }`}>
              {rerouteDiff.route_changed ? '✓ Route Diverted' : 'Original Optimal'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="card bg-base-100 p-2 border border-base-300">
              <span className="text-[10px] text-base-content/60 block">Time Delta</span>
              <span className="font-bold text-base-content">{rerouteDiff.travel_time_s_diff > 0 ? `+${rerouteDiff.travel_time_s_diff.toFixed(1)}s` : `${rerouteDiff.travel_time_s_diff.toFixed(1)}s`}</span>
            </div>
            <div className="card bg-base-100 p-2 border border-base-300">
              <span className="text-[10px] text-base-content/60 block">Dist Delta</span>
              <span className="font-bold text-base-content">{rerouteDiff.distance_m_diff > 0 ? `+${rerouteDiff.distance_m_diff.toFixed(0)}m` : `${rerouteDiff.distance_m_diff.toFixed(0)}m`}</span>
            </div>
            <div className="card bg-base-100 p-2 border border-base-300">
              <span className="text-[10px] text-base-content/60 block">Cost Delta</span>
              <span className="font-bold text-base-content">{rerouteDiff.total_cost_diff > 0 ? `+${rerouteDiff.total_cost_diff.toFixed(4)}` : `${rerouteDiff.total_cost_diff.toFixed(4)}`}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}