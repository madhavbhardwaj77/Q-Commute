import React from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, Construction, Ban, AlertOctagon } from 'lucide-react';

export default function TrafficSimulator({
  eventType,
  severity,
  onEventTypeChange,
  onSeverityChange,
  onApplyTraffic,
  onReroute,
  onReset,
  activeEvents,
  canReroute,
  loading,
}) {
  return (
    <div className="card bg-base-100 border border-base-300 p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-base-200">
        <h2 className="text-xs font-bold uppercase tracking-wider text-base-content flex items-center gap-1.5">
          <span>🚦</span> Dynamic Traffic Simulation
        </h2>
        <span className="badge badge-warning badge-sm text-[10px] font-semibold whitespace-nowrap flex-shrink-0">
          Live Injection
        </span>
      </div>

      {/* Event Type selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold text-base-content/60 uppercase tracking-wider">Incident Type</label>
        <div className="grid grid-cols-3 gap-1.5 w-full">
          {[
            { id: 'congestion', label: 'Congestion', icon: AlertTriangle },
            { id: 'slowdown', label: 'Roadwork', icon: Construction },
            { id: 'closure', label: 'Closure', icon: Ban },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = eventType === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onEventTypeChange(item.id)}
                className={`btn btn-sm text-[11px] font-semibold px-1 py-1.5 h-auto min-h-[2.35rem] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-all ${
                  isSelected
                    ? 'btn-warning text-warning-content shadow-xs'
                    : 'bg-base-100 hover:bg-base-200 text-base-content border border-base-300 hover:border-base-content/20'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Severity */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold text-base-content/60 uppercase tracking-wider">Severity Impact</label>
        <select
          value={severity}
          onChange={(e) => onSeverityChange(e.target.value)}
          className="select select-bordered select-sm w-full text-xs font-medium focus:select-warning"
        >
          <option value="severe">Severe (12x Delay · Forced Detour)</option>
          <option value="moderate">Moderate (6x Delay)</option>
          <option value="mild">Mild (3x Delay)</option>
        </select>
      </div>

      {/* Trigger Buttons */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={onApplyTraffic}
          disabled={loading}
          className="btn btn-warning btn-sm w-full gap-1.5 shadow-sm text-xs font-bold text-warning-content"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Apply Traffic Event to Active Route</span>
        </button>

        {canReroute && (
          <button
            onClick={onReroute}
            disabled={loading}
            className="btn btn-success btn-sm w-full gap-1.5 shadow-sm text-xs font-bold text-success-content animate-pulse"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Recalculate Dynamic Reroute</span>
          </button>
        )}

        <button
          onClick={onReset}
          disabled={loading}
          className="btn btn-ghost btn-xs w-full gap-1.5 border border-base-300 text-xs text-base-content/70 hover:btn-error hover:text-error-content"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Network (Free-Flow)</span>
        </button>
      </div>

      {/* Active Events Log */}
      <div className="flex flex-col gap-1 pt-1">
        <div className="flex items-center justify-between text-[10px] font-bold text-base-content/60 uppercase tracking-wider">
          <span>Active Road Incidents</span>
          <span className="badge badge-xs font-bold">{activeEvents.length}</span>
        </div>
        <div className="max-h-24 overflow-y-auto flex flex-col gap-1 bg-base-200/50 p-2 rounded-lg border border-base-300">
          {activeEvents.length === 0 ? (
            <p className="text-[11px] text-base-content/50 italic text-center py-1">
              No active incidents. Free-flow conditions.
            </p>
          ) : (
            activeEvents.map((evt, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-[11px] bg-base-100 p-1.5 rounded border border-warning/30 shadow-2xs">
                <span className="text-warning flex-shrink-0">⚠️</span>
                <div className="flex-1 min-w-0 flex items-center justify-between gap-1">
                  <span className="font-semibold text-base-content truncate">{evt.road_name || 'Corridor Segment'}</span>
                  <span className="badge badge-warning badge-xs uppercase font-bold text-[9px] flex-shrink-0">{evt.event_type}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}