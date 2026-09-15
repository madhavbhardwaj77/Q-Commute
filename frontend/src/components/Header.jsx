import React from 'react';
import { Atom, ShieldCheck, Database, FileText } from 'lucide-react';

export default function Header({ status, onOpenReport }) {
  const isReady = status === 'ready';
  const statusBadge = isReady
    ? 'badge-success text-success-content'
    : status === 'loading'
    ? 'badge-warning text-warning-content animate-pulse'
    : 'badge-error text-error-content';
  const statusText = isReady ? 'Live' : status === 'loading' ? 'Initializing…' : 'Disconnected';

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
          </div>
          <p className="text-[10px] text-base-content/60 font-medium">
            Quantum-Inspired Traffic Optimization
          </p>
        </div>
      </div>

      {/* Right Controls */}
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
      </div>
    </header>
  );
}