import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { Trophy, Award, BarChart3 } from 'lucide-react';

export default function BenchmarkTab({ benchmarkData, loading }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !benchmarkData?.results?.length) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const valid = benchmarkData.results.filter((r) => r.valid);
    const labels = valid.map((r) => r.algorithm);

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Objective Cost',
            data: valid.map((r) => r.total_cost),
            backgroundColor: ['rgba(99,102,241,0.25)', 'rgba(16,185,129,0.25)', 'rgba(245,158,11,0.25)'],
            borderColor: ['#6366f1', '#10b981', '#f59e0b'],
            borderWidth: 2,
            borderRadius: 6,
            yAxisID: 'yLeft',
          },
          {
            label: 'Travel Time (s)',
            data: valid.map((r) => r.travel_time_s),
            borderColor: '#3b82f6',
            backgroundColor: '#3b82f6',
            type: 'line',
            tension: 0.2,
            yAxisID: 'yRight',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        scales: {
          yLeft: {
            position: 'left',
            title: { display: true, text: 'Objective Cost', font: { size: 9, weight: 'bold' } },
            grid: { color: 'rgba(0,0,0,0.04)' },
          },
          yRight: {
            position: 'right',
            title: { display: true, text: 'Time (s)', font: { size: 9, weight: 'bold' } },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [benchmarkData]);

  if (loading) {
    return (
      <div className="card bg-base-200/50 border border-base-300 p-8 flex flex-col items-center justify-center gap-3 text-center">
        <span className="loading loading-spinner loading-lg text-primary" />
        <div className="font-bold text-sm text-base-content">Benchmarking All 3 Algorithms...</div>
        <div className="text-xs text-base-content/60 max-w-xs">
          Computing multi-objective routes using Quantum PSO, Dijkstra, and Genetic Algorithm.
        </div>
      </div>
    );
  }

  if (!benchmarkData) {
    return (
      <div className="card bg-base-200/50 border border-base-300 p-8 flex flex-col items-center justify-center gap-2 text-center text-base-content/60">
        <BarChart3 className="w-8 h-8 opacity-40 text-primary mb-1" />
        <p className="text-xs font-semibold">No benchmark data loaded yet.</p>
        <p className="text-[11px] text-base-content/50 max-w-xs">
          Click <b>"Run All 3 Algorithms Benchmark"</b> in the left panel to compare QPSO against Dijkstra and GA.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Chart.js Comparison */}
      <div className="card bg-base-100 p-2.5 rounded-xl border border-base-300 shadow-2xs">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[10px] font-bold text-base-content/70 uppercase tracking-wider">
            Comparative Performance Analysis
          </span>
          <span className="badge badge-outline badge-xs font-semibold">3 Algorithms</span>
        </div>
        <div className="h-44 w-full">
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Comparison Table */}
      <div className="card bg-base-100 border border-base-300 shadow-2xs overflow-x-auto">
        <table className="table table-zebra table-xs w-full">
          <thead>
            <tr className="bg-base-200/60 text-[10px] text-base-content/70 font-bold uppercase tracking-wider">
              <th>Algorithm</th>
              <th>Distance</th>
              <th>Time</th>
              <th>Objective Cost</th>
              <th>Compute</th>
            </tr>
          </thead>
          <tbody>
            {benchmarkData.results.map((r, i) => {
              const isCostWinner = r.algorithm === benchmarkData.winner?.lowest_cost;
              return (
                <tr key={i} className="hover">
                  <td className="font-bold flex items-center gap-1.5 whitespace-nowrap">
                    <span>{r.algorithm}</span>
                    {isCostWinner && (
                      <span className="badge badge-success badge-xs gap-1 font-bold text-[9px]">
                        <Trophy className="w-2.5 h-2.5" /> Best
                      </span>
                    )}
                  </td>
                  <td className="text-base-content/80 font-medium">{(r.distance_m / 1000).toFixed(2)} km</td>
                  <td className="text-base-content/80 font-medium">{Math.round(r.travel_time_s)}s</td>
                  <td className="font-bold text-primary">{r.total_cost.toFixed(4)}</td>
                  <td className="text-base-content/60 font-mono text-[10px]">{Math.round(r.runtime_ms)} ms</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Winner & Findings */}
      <div className="alert alert-success bg-success/10 border border-success/30 rounded-xl p-3 flex flex-col gap-1 text-xs shadow-2xs">
        <div className="flex items-center gap-1.5 font-bold text-success text-[11px] w-full">
          <Award className="w-4 h-4" />
          <span>Evaluation Outcome Summary</span>
          <span className="badge badge-success badge-xs ml-auto">Verified</span>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full pt-1 text-[11px]">
          <div className="flex items-center gap-1 text-base-content">
            <span className="text-base-content/60">Optimal Route:</span>
            <span className="font-bold text-success">{benchmarkData.winner?.lowest_cost}</span>
          </div>
          <div className="flex items-center gap-1 text-base-content">
            <span className="text-base-content/60">Fastest Compute:</span>
            <span className="font-bold text-primary">{benchmarkData.winner?.fastest_runtime}</span>
          </div>
        </div>
      </div>
    </div>
  );
}