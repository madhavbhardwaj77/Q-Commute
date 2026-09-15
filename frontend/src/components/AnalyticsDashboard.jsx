import React, { useState } from 'react';
import { Gauge, Sparkles, BarChart2, FileCode, History, Image } from 'lucide-react';
import MetricsTab from './MetricsTab';
import IntelligenceTab from './IntelligenceTab';
import BenchmarkTab from './BenchmarkTab';
import FormulationTab from './FormulationTab';
import HistoryTab from './HistoryTab';

export default function AnalyticsDashboard({
  activeTab,
  onTabChange,
  routeResult,
  rerouteDiff,
  benchmarkData,
  graphMetrics,
  loading,
  onOpenReport,
}) {
  const tabs = [
    { id: 'metrics', label: 'Metrics', icon: Gauge },
    { id: 'intelligence', label: 'Quantum', icon: Sparkles },
    { id: 'benchmark', label: 'Benchmark', icon: BarChart2 },
    { id: 'formulation', label: 'Formula', icon: FileCode },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="card bg-base-100 border border-base-300 p-3.5 shadow-sm flex flex-col gap-3 flex-1 overflow-hidden">
      {/* Tab Navigation */}
      <div className="tabs tabs-boxed bg-base-200/80 p-1 rounded-xl border border-base-300 flex-shrink-0 grid grid-cols-5 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`tab tab-sm flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 text-[10px] font-bold rounded-lg transition whitespace-nowrap h-auto min-w-0 ${
                isActive
                  ? 'tab-active bg-primary text-primary-content shadow-xs'
                  : 'text-base-content/70 hover:text-base-content hover:bg-base-300/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Panels */}
      <div className="flex-1 overflow-y-auto pr-0.5">
        {activeTab === 'metrics' && <MetricsTab routeResult={routeResult} rerouteDiff={rerouteDiff} />}
        {activeTab === 'intelligence' && <IntelligenceTab routeResult={routeResult} />}
        {activeTab === 'benchmark' && <BenchmarkTab benchmarkData={benchmarkData} loading={loading} />}
        {activeTab === 'formulation' && <FormulationTab graphMetrics={graphMetrics} />}
        {activeTab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}