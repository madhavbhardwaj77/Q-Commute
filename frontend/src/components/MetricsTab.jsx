import React from 'react';
import { Clock, Navigation, Gauge, Cpu, Layers, GitFork } from 'lucide-react';

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
    { label: 'Travel Time', value: formatSecs(routeResult.travel_time_s), icon: Clock, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Distance', value: `${(routeResult.distance_m / 1000).toFixed(2)} km`, icon: Navigation, color: 'text-blue-600 bg-blue-50' },
    { label: 'Objective Cost', value: routeResult.total_cost?.toFixed(4) || '—', icon: Gauge, color: 'text-violet-600 bg-violet-50' },
    { label: 'Runtime (Latency)', value: `${Math.round(routeResult.runtime_ms)} ms`, icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: 'Route Nodes', value: `${routeResult.path?.length || 0} nodes`, icon: GitFork, color: 'text-slate-600 bg-slate-100' },
  ];

  return (
    <div className="flex flex-col gap-3">
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