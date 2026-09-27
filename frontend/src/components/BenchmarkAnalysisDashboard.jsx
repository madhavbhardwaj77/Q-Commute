import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import {
  Award,
  Trophy,
  Zap,
  CheckCircle2,
  Clock,
  Fuel,
  Leaf,
  BarChart3,
  TrendingDown,
  Navigation,
} from 'lucide-react';

export default function BenchmarkAnalysisDashboard({
  benchmarkResult,
  loading = false,
  onHighlightAlgo,
  activeAlgo,
}) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !benchmarkResult?.benchmark_comparison?.length) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const items = benchmarkResult.benchmark_comparison.filter((i) => i.status === 'completed');
    const labels = items.map((i) => i.algorithm);
    const distances = items.map((i) =>
      i.total_distance > 1000 ? (i.total_distance / 1000).toFixed(2) : (i.total_distance / 1000).toFixed(2)
    );
    const times = items.map((i) => (i.total_time / 60).toFixed(1));

    chartInstance.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Distance (km)',
            data: distances,
            backgroundColor: 'rgba(99, 102, 241, 0.4)',
            borderColor: '#6366f1',
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'yDist',
          },
          {
            label: 'Travel Time (min)',
            data: times,
            backgroundColor: 'rgba(245, 158, 11, 0.4)',
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'yTime',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        scales: {
          yDist: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Distance (km)', font: { size: 9, weight: 'bold' } },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
          yTime: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Time (min)', font: { size: 9, weight: 'bold' } },
            grid: { drawOnChartArea: false },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { size: 10, weight: 'bold' } },
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [benchmarkResult]);

  if (loading) {
    return (
      <div className="card bg-base-100 border border-base-300 p-6 shadow-sm flex flex-col items-center justify-center gap-3 h-full text-center">
        <span className="loading loading-spinner loading-lg text-primary" />
        <span className="text-xs font-bold text-base-content">
          Benchmarking All Solvers in Parallel...
        </span>
        <span className="text-[10px] text-base-content/60 max-w-xs">
          Computing routing solutions across Quantum Annealing, QPSO Swarm, OR-Tools CP-SAT, GA, and Dijkstra.
        </span>
      </div>
    );
  }

  if (!benchmarkResult || !benchmarkResult.benchmark_comparison?.length) {
    return (
      <div className="card bg-base-100 border border-base-300 p-6 shadow-sm flex flex-col items-center justify-center text-center gap-2.5 h-full text-base-content/60">
        <BarChart3 className="w-10 h-10 opacity-30 text-primary" />
        <span className="text-xs font-bold">No Benchmark Executed Yet</span>
        <p className="text-[11px] text-base-content/50 max-w-xs">
          Select or add destinations in the left panel and click <b>Run Benchmark Across All Solvers</b> to see a full comparative analysis.
        </p>
      </div>
    );
  }

  const { benchmark_comparison = [], winners = {} } = benchmarkResult;

  return (
    <div className="card bg-base-100 border border-base-300 p-3.5 shadow-sm flex flex-col gap-3 flex-1 overflow-y-auto">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-base-200 pb-2">
        <div className="flex items-center gap-1.5">
          <Award className="w-4 h-4 text-warning" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/80">
            Multi-Algorithm Benchmark Analysis
          </span>
        </div>
        <span className="badge badge-primary badge-xs font-mono font-bold">
          {benchmark_comparison.length} Algorithms Tested
        </span>
      </div>

      {/* Winner Trophies Grid */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        {winners.fastest_runtime && (
          <div className="bg-info/10 border border-info/30 rounded-xl p-2 flex flex-col gap-0.5">
            <span className="text-info font-bold flex items-center gap-1 text-[9px] uppercase tracking-wider">
              <Zap className="w-3 h-3 text-info" /> Lowest Compute Latency
            </span>
            <span className="font-bold font-mono text-base-content truncate">
              {winners.fastest_runtime}
            </span>
          </div>
        )}
        {winners.shortest_distance && (
          <div className="bg-success/10 border border-success/30 rounded-xl p-2 flex flex-col gap-0.5">
            <span className="text-success font-bold flex items-center gap-1 text-[9px] uppercase tracking-wider">
              <CheckCircle2 className="w-3 h-3 text-success" /> Shortest Tour Mileage
            </span>
            <span className="font-bold font-mono text-base-content truncate">
              {winners.shortest_distance}
            </span>
          </div>
        )}
      </div>

      {/* Chart.js Comparison Graph */}
      <div className="bg-base-200/50 p-2.5 rounded-xl border border-base-300 flex flex-col gap-1.5">
        <span className="text-[10px] font-bold text-base-content/70 uppercase tracking-wider">
          Distance vs Travel Time Comparison
        </span>
        <div className="h-44 w-full">
          <canvas ref={chartRef} />
        </div>
      </div>

      {/* Comprehensive Results Table */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/70">
          Detailed Solver Performance Matrix
        </span>
        <div className="overflow-x-auto rounded-xl border border-base-200">
          <table className="table table-xs w-full">
            <thead>
              <tr className="bg-base-200/80 text-[9px] uppercase font-bold text-base-content/70">
                <th>Algorithm</th>
                <th>Distance</th>
                <th>Time</th>
                <th>Runtime</th>
                <th>CO2 (kg)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {benchmark_comparison.map((item, idx) => {
                const isSelected = activeAlgo === item.algorithm;
                return (
                  <tr
                    key={idx}
                    className={`text-[10px] hover:bg-base-200/60 transition-colors ${
                      isSelected ? 'bg-primary/10 font-bold' : ''
                    }`}
                  >
                    <td>
                      <div className="flex flex-col">
                        <span className="font-bold">{item.algorithm}</span>
                        <span className="text-[8px] text-base-content/50 font-mono">
                          {item.paradigm}
                        </span>
                      </div>
                    </td>

                    <td className="font-mono">
                      {item.status === 'completed' && item.total_distance > 0
                        ? item.total_distance > 1000
                          ? `${(item.total_distance / 1000).toFixed(2)} km`
                          : `${item.total_distance.toFixed(0)} m`
                        : <span className="text-base-content/40 italic">{item.status}</span>}
                    </td>

                    <td className="font-mono">
                      {item.status === 'completed' && item.total_time > 0
                        ? item.total_time > 60
                          ? `${(item.total_time / 60).toFixed(1)} min`
                          : `${item.total_time.toFixed(1)} s`
                        : '-'}
                    </td>

                    <td className="font-mono font-bold">
                      {item.status === 'completed' ? (
                        item.runtime_ms > 1000
                          ? `${(item.runtime_ms / 1000).toFixed(2)} s`
                          : `${item.runtime_ms.toFixed(0)} ms`
                      ) : '-'}
                    </td>

                    <td className="font-mono">
                      {item.status === 'completed' && item.co2_kg > 0
                        ? item.co2_kg.toFixed(3)
                        : '-'}
                    </td>

                    <td>
                      {item.routes && Object.keys(item.routes).length > 0 && (
                        <button
                          type="button"
                          onClick={() => onHighlightAlgo && onHighlightAlgo(item)}
                          className={`btn btn-xs text-[9px] px-1.5 ${
                            isSelected ? 'btn-primary' : 'btn-ghost text-primary'
                          }`}
                          title="Show route on map"
                        >
                          {isSelected ? 'Active' : 'Map'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
