import React, { useState } from 'react';
import { X, Download, RefreshCw, BarChart3, TrendingUp, Compass } from 'lucide-react';
import { API } from '../api';

export default function MatplotlibModal({ isOpen, onClose, sourceId, destinationId, particles, iterations }) {
  if (!isOpen) return null;

  const [activePlot, setActivePlot] = useState('convergence');
  const [reloadKey, setReloadKey] = useState(Date.now());

  const plotUrl = activePlot === 'convergence'
    ? API.getPlotConvergenceUrl(sourceId, destinationId, particles, iterations) + `&k=${reloadKey}`
    : activePlot === 'benchmark'
    ? API.getPlotBenchmarkUrl(sourceId, destinationId) + `&k=${reloadKey}`
    : API.getPlotRadarUrl() + `&k=${reloadKey}`;

  return (
    <div className="modal modal-open z-[1000] bg-black/50 backdrop-blur-xs">
      <div className="modal-box max-w-3xl p-0 border border-base-300 shadow-2xl rounded-2xl flex flex-col max-h-[90vh] overflow-hidden bg-base-100">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-base-200 flex items-center justify-between bg-base-200/50">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-primary/10 text-primary rounded-lg"><BarChart3 className="w-4 h-4" /></span>
            <div>
              <h3 className="text-sm font-bold text-base-content">Matplotlib Publication-Ready Analytics</h3>
              <p className="text-[10px] text-base-content/60 font-medium">Server-generated scientific figures for technical reports and slides</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-4 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 border-b border-base-200 bg-base-100">
          <div className="tabs tabs-boxed bg-base-200/70 p-1 rounded-xl flex items-center gap-1">
            {[
              { id: 'convergence', label: 'Convergence', icon: TrendingUp },
              { id: 'benchmark', label: 'Benchmark', icon: BarChart3 },
              { id: 'radar', label: 'Radar Matrix', icon: Compass },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activePlot === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActivePlot(tab.id)}
                  className={`tab tab-sm h-auto py-1.5 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                    isActive
                      ? 'tab-active bg-primary text-primary-content shadow-xs'
                      : 'text-base-content/70 hover:text-base-content'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setReloadKey(Date.now())}
              className="btn btn-sm btn-square btn-ghost border border-base-300"
              title="Regenerate Plot"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <a
              href={plotUrl}
              download={`qcommute_${activePlot}.png`}
              className="btn btn-sm btn-primary gap-1.5 text-xs font-semibold whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PNG</span>
            </a>
          </div>
        </div>

        {/* Image Preview Container */}
        <div className="p-6 overflow-y-auto flex items-center justify-center bg-base-200/40 min-h-[350px]">
          <img
            key={plotUrl}
            src={plotUrl}
            alt="Matplotlib generated plot"
            className="max-h-[60vh] object-contain rounded-xl border border-base-300 shadow-md bg-base-100 p-2"
          />
        </div>
      </div>
    </div>
  );
}