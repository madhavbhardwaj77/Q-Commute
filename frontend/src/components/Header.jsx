import React from 'react';
import { Atom, ShieldCheck, Database, FileText } from 'lucide-react';

export default function Header({ status, onOpenReport }) {
  const isReady = status === 'ready';
  const statusBadge = isReady
    ? 'badge-success text-success-content'
    : status === 'loading'
    ? 'badge-warning text-warning-content animate-pulse'
    : 'badge-error text-error-content';
  const statusText = isReady ? 'Graph & SQLite Live' : status === 'loading' ? 'Initializing…' : 'Disconnected';

  return (
    <header className="navbar bg-base-100 border-b border-base-300 px-4 min-h-[3.5rem] flex items-center justify-between z-30 shadow-2xs flex-shrink-0">
      {/* Brand & Project Identity */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary text-primary-content flex items-center justify-center shadow-md">
          <Atom className="w-5 h-5 animate-[spin_12s_linear_infinite]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-extrabold tracking-tight text-base-content leading-none">
              Q-COMMUTE
            </h1>
            <span className="badge badge-primary badge-outline badge-xs font-bold">
              v2.0
            </span>
          </div>
          <p className="text-[10px] text-base-content/60 font-medium">
            Quantum-Inspired Traffic Optimization · Metaheuristic Engine
          </p>
        </div>

        {/* SIH and Organization Badges */}
        <div className="hidden sm:flex items-center gap-2 ml-3 pl-3 border-l border-base-300">
          <span className="badge badge-neutral badge-sm font-bold gap-1 text-[10px]">
            <span>SIH 2026</span>
            <span className="text-primary-content/70">#26137</span>
          </span>
          <span className="badge badge-success badge-outline badge-sm font-semibold text-[10px]">
            Egreen Quanta
          </span>
        </div>
      </div>

      {/* Right Controls & Status */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenReport}
          className="btn btn-sm btn-outline btn-primary gap-1.5 text-xs font-semibold"
          title="Open Publication-grade Matplotlib Visualizations"
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Matplotlib Report</span>
          <span className="sm:hidden">Report</span>
        </button>

        <div className="flex items-center gap-2 bg-base-200/80 border border-base-300 px-3 py-1 rounded-full text-xs font-medium text-base-content/80 shadow-2xs">
          <span className={`w-2 h-2 rounded-full ${isReady ? 'bg-success' : 'bg-warning animate-ping'}`} />
          <span className="text-[11px] font-semibold">{statusText}</span>
          <Database className="w-3 h-3 text-base-content/40 ml-0.5" />
        </div>
      </div>
    </header>
  );
}