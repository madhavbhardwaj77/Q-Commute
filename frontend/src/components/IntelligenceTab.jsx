import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function IntelligenceTab({ routeResult }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !routeResult?.convergence?.length) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const iters = routeResult.convergence.map((c) => c.iteration);
    const costs = routeResult.convergence.map((c) => c.best_cost);

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: iters,
        datasets: [
          {
            label: 'Global Best Cost F(p)',
            data: costs,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            borderWidth: 2.5,
            pointRadius: 1.5,
            pointHoverRadius: 4,
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Cost: ${ctx.parsed.y.toFixed(4)}`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'Iteration (t)', font: { size: 10 } },
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { maxRotation: 0, autoSkip: true, font: { size: 9 } },
          },
          y: {
            title: { display: true, text: 'Objective Cost', font: { size: 10 } },
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { font: { size: 9 } },
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
  }, [routeResult]);

  if (!routeResult?.convergence?.length) {
    return (
      <div className="py-12 text-center text-slate-400 text-xs italic">
        Run QPSO optimization to generate convergence trajectory.
      </div>
    );
  }

  const firstCost = routeResult.convergence[0]?.best_cost || 0;
  const lastCost = routeResult.convergence[routeResult.convergence.length - 1]?.best_cost || 0;
  const improvement = firstCost > 0 ? (((firstCost - lastCost) / firstCost) * 100).toFixed(2) : '0.00';
  const scipyFit = routeResult.convergence_analysis;

  return (
    <div className="flex flex-col gap-3">
      {/* Chart.js Canvas */}
      <div className="card bg-base-100 p-2.5 rounded-xl border border-base-300 shadow-2xs">
        <div className="flex items-center justify-between mb-1.5 px-1 gap-2">
          <span className="text-[10px] font-bold text-base-content/70 uppercase tracking-wider truncate">
            Convergence Trajectory
          </span>
          <span className="badge badge-primary badge-outline badge-xs font-semibold whitespace-nowrap flex-shrink-0">
            Real-Time
          </span>
        </div>
        <div className="h-44 w-full">
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* SciPy Analytics Card */}
      <div className="card bg-base-100 border border-base-300 rounded-xl p-3 flex flex-col gap-2 shadow-2xs">
        <div className="flex items-center justify-between pb-1.5 border-b border-base-200">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            SciPy Curve Fitting & Statistics
          </span>
          <span className="badge badge-ghost badge-xs font-mono text-[9px]">scipy.optimize.curve_fit</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="card bg-base-200/50 p-2 border border-base-300/50">
            <span className="text-[10px] text-base-content/60 block">Initial Best Cost</span>
            <span className="font-bold text-base-content">{firstCost.toFixed(4)}</span>
          </div>
          <div className="card bg-base-200/50 p-2 border border-base-300/50">
            <span className="text-[10px] text-base-content/60 block">Final Converged Cost</span>
            <span className="font-bold text-primary">{lastCost.toFixed(4)}</span>
          </div>
          <div className="card bg-base-200/50 p-2 border border-base-300/50">
            <span className="text-[10px] text-base-content/60 block">Relative Optimization</span>
            <span className="font-bold text-success">+{improvement}%</span>
          </div>
          <div className="card bg-base-200/50 p-2 border border-base-300/50">
            <span className="text-[10px] text-base-content/60 block">SciPy Asymptotic Bound</span>
            <span className="font-bold text-secondary">
              {scipyFit?.asymptotic_cost ? scipyFit.asymptotic_cost.toFixed(4) : lastCost.toFixed(4)}
            </span>
          </div>
        </div>
      </div>

      {/* Theoretical Formulation Box */}
      <div className="alert alert-info bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs flex flex-col gap-1.5 shadow-2xs">
        <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
          Quantum Delta Potential Well Wave Function Update
        </div>
        <div className="card bg-base-100 p-2.5 rounded-lg border border-primary/20 font-mono text-[11px] text-base-content shadow-2xs whitespace-nowrap overflow-x-auto text-center">
          x<sub>i</sub>(t+1) = p<sub>i</sub> ± β · |mbest − x<sub>i</sub>| · ln(1/u)
        </div>
        <div className="text-[10px] text-base-content/70 leading-relaxed">
          Where β is the quantum contraction coefficient linearly decaying from 1.0 to 0.4, and u ~ Uniform(0,1) sampled via SciPy stats.
        </div>
      </div>
    </div>
  );
}