import React, { useEffect, useState } from 'react';
import { Database, Clock, RefreshCw } from 'lucide-react';
import { API } from '../api';

export default function HistoryTab() {
  const [history, setHistory] = useState([]);
  const [dbStats, setDbStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routes, stats] = await Promise.all([
        API.getRouteHistory(15),
        API.getDbStats(),
      ]);
      setHistory(routes);
      setDbStats(stats);
    } catch (_) {}
    finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Database Status Card */}
      {dbStats && (
        <div className="card bg-base-100 border border-base-300 rounded-xl p-3 flex flex-col gap-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>SQLite Persistence Engine</span>
            </span>
            <button
              onClick={loadData}
              disabled={loading}
              className="btn btn-ghost btn-xs gap-1 text-primary hover:bg-base-200"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="card bg-base-200/50 p-2 border border-base-300/50">
              <span className="text-[10px] text-base-content/60 block">Total Runs Saved</span>
              <span className="font-extrabold text-base-content">{dbStats.total_routes_optimized}</span>
            </div>
            <div className="card bg-base-200/50 p-2 border border-base-300/50">
              <span className="text-[10px] text-base-content/60 block">Avg Engine Latency</span>
              <span className="font-extrabold text-primary">{dbStats.avg_routing_runtime_ms} ms</span>
            </div>
          </div>
        </div>
      )}

      {/* History List */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold text-base-content/60 uppercase tracking-wider px-0.5">
          <span>Recent SQLite Logs</span>
          <span className="badge badge-ghost badge-xs px-2.5 py-1 font-medium">{history.length} records</span>
        </div>
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-0.5">
          {history.length === 0 ? (
            <p className="text-base-content/50 italic text-center py-6">No historical runs recorded in SQLite yet.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="card bg-base-100 border border-base-300 rounded-lg p-2.5 flex flex-col gap-1 shadow-2xs hover:border-primary/40 transition">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-base-content text-[11px] truncate capitalize flex-1 min-w-0">
                    {h.source_id.replace(/_/g, ' ')} → {h.destination_id.replace(/_/g, ' ')}
                  </span>
                  <span className="badge badge-primary badge-outline badge-xs font-semibold px-2.5 py-1 tracking-wider flex-shrink-0">
                    {h.algorithm}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-base-content/70">
                  <span>{(h.distance_m / 1000).toFixed(2)} km · {Math.round(h.travel_time_s)}s</span>
                  <span className="font-semibold text-primary">Cost: {h.total_cost.toFixed(4)}</span>
                  <span className="flex items-center gap-0.5 text-base-content/50">
                    <Clock className="w-2.5 h-2.5" />
                    {h.created_at ? h.created_at.split(' ')[1] : ''}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}