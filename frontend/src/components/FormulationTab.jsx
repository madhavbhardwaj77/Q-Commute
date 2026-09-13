import React from 'react';
import { Network, FileCode } from 'lucide-react';

export default function FormulationTab({ graphMetrics }) {
  const metricsRows = graphMetrics ? [
    { key: 'Nodes (|V|)', val: graphMetrics.nodes },
    { key: 'Edges (|E|)', val: graphMetrics.edges },
    { key: 'Graph Density', val: graphMetrics.density?.toFixed(6) },
    { key: 'Avg Node Degree', val: graphMetrics.avg_degree },
    { key: 'Strongly Connected Comp.', val: graphMetrics.strongly_connected_components },
    { key: 'Avg Edge Length', val: `${graphMetrics.avg_edge_length_m} m` },
    { key: 'Avg Travel Time', val: `${graphMetrics.avg_travel_time_s} s` },
    { key: 'Free-flow Avg Speed', val: `${graphMetrics.avg_speed_kph} km/h` },
    { key: 'Spatial Coordinate System', val: graphMetrics.coordinate_system },
  ] : [];

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Objective Function Box */}
      <div className="card bg-base-100 border border-base-300 rounded-xl p-3 flex flex-col gap-2 shadow-2xs">
        <div className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
          <FileCode className="w-3.5 h-3.5" />
          <span>Multi-Criteria Objective Formulation</span>
        </div>
        <div className="card bg-base-200/60 border border-base-300 p-2.5 font-mono text-[11px] text-base-content leading-relaxed overflow-x-auto">
          min F(p) = w<sub>t</sub>·[T(p)/T<sub>ref</sub>] + w<sub>d</sub>·[D(p)/D<sub>ref</sub>] + w<sub>c</sub>·[C(p)/C<sub>ref</sub>]
        </div>
        <div className="text-[11px] text-base-content/70 flex flex-col gap-1">
          <div><b>T(p)</b>: Total travel time under dynamic congestion multipliers.</div>
          <div><b>D(p)</b>: Total path distance in metres.</div>
          <div><b>C(p)</b>: Cumulative edge congestion penalty index.</div>
          <div><b>T<sub>ref</sub>, D<sub>ref</sub>, C<sub>ref</sub></b>: 75th-percentile scaling constants.</div>
        </div>
      </div>

      {/* Constraints Box */}
      <div className="card bg-base-100 border border-base-300 rounded-xl p-3 flex flex-col gap-2 shadow-2xs">
        <div className="text-[10px] font-bold text-base-content/70 uppercase tracking-wider">
          Road Network Constraints
        </div>
        <div className="card bg-base-200/50 border border-base-300 p-2 font-mono text-[10px] text-base-content space-y-1">
          <div>1. p = (v<sub>0</sub>, v<sub>1</sub>, …, v<sub>n</sub>) with v<sub>0</sub> = src, v<sub>n</sub> = dst</div>
          <div>2. (v<sub>i</sub>, v<sub>i+1</sub>) ∈ E(G) &nbsp; ∀ i ∈ &#123;0, …, n-1&#125;</div>
          <div>3. e<sub>k</sub> ∉ Closed(E) &nbsp; (Strict avoidance of closures)</div>
        </div>
      </div>

      {/* NetworkX Real Graph Metrics */}
      <div className="card bg-base-100 border border-base-300 rounded-xl p-3 flex flex-col gap-2 shadow-2xs">
        <div className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5" />
            <span>OpenStreetMap & NetworkX Properties</span>
          </div>
          <span className="badge badge-primary badge-outline badge-xs">Connected</span>
        </div>
        <div className="divide-y divide-base-200 border border-base-200 rounded-lg overflow-hidden">
          {metricsRows.map((row, i) => (
            <div key={i} className="flex items-center justify-between p-2 text-[11px] hover:bg-base-200/50">
              <span className="text-base-content/60 font-medium">{row.key}</span>
              <span className="font-bold text-base-content">{row.val || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}