import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { Sparkles, Cpu, Play, CheckCircle2, AlertCircle, Clock, Zap, Atom } from 'lucide-react';
import { API } from '../api';

export default function IntelligenceTab({ routeResult }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const [quantumStatus, setQuantumStatus] = useState(null);
  const [quantumResult, setQuantumResult] = useState(null);
  const [quantumLoading, setQuantumLoading] = useState(false);
  const [quantumError, setQuantumError] = useState(null);

  useEffect(() => {
    API.getQuantumStatus()
      .then(setQuantumStatus)
      .catch((e) => console.warn('Could not fetch quantum status:', e));
  }, []);

  const runQuantumBenchmark = async () => {
    setQuantumLoading(true);
    setQuantumError(null);
    try {
      const payload = {
        stops: [
          { id: 'connaught_place', lat: 28.6329, lon: 77.2195, demand: 0 },
          { id: 'india_gate', lat: 28.6129, lon: 77.2295, demand: 2 },
          { id: 'jantar_mantar', lat: 28.6270, lon: 77.2166, demand: 2 },
        ],
        depot_id: 'connaught_place',
        timeout_seconds: 15.0,
        qpso_iterations: 25,
        annealing_reads: 60,
      };
      const res = await API.validateQuantum(payload);
      setQuantumResult(res);
    } catch (err) {
      setQuantumError(err.message || 'Quantum benchmark failed');
    } finally {
      setQuantumLoading(false);
    }
  };

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

  const firstCost = routeResult?.convergence?.[0]?.best_cost || 0;
  const lastCost = routeResult?.convergence?.[routeResult.convergence.length - 1]?.best_cost || 0;
  const improvement = firstCost > 0 ? (((firstCost - lastCost) / firstCost) * 100).toFixed(2) : '0.00';
  const scipyFit = routeResult?.convergence_analysis;

  return (
    <div className="flex flex-col gap-3">
      {/* 3-Way Quantum Subsolvers Benchmark Tool */}
      <div className="card bg-base-100 border border-primary/20 rounded-xl p-3 flex flex-col gap-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Atom className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Quantum Hardware Solvers (Phase 9)
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`badge badge-xs font-mono text-[9px] ${quantumStatus?.qaoa_available ? 'badge-success' : 'badge-ghost'}`}>
              QAOA: {quantumStatus?.qaoa_available ? 'Ready' : 'Off'}
            </span>
            <span className={`badge badge-xs font-mono text-[9px] ${quantumStatus?.annealing_available ? 'badge-success' : 'badge-ghost'}`}>
              Neal: {quantumStatus?.annealing_available ? 'Ready' : 'Off'}
            </span>
          </div>
        </div>

        <p className="text-[10px] text-base-content/70">
          Compare Gate-Model QAOA (Qiskit Statevector) vs Simulated Quantum Annealing (D-Wave Neal) vs Discrete QPSO on a 3-stop micro-cluster.
        </p>

        <button
          onClick={runQuantumBenchmark}
          disabled={quantumLoading}
          className="btn btn-primary btn-xs w-full flex items-center justify-center gap-1 text-[11px]"
        >
          {quantumLoading ? (
            <>
              <span className="loading loading-spinner loading-xs" />
              <span>Simulating Quantum Circuits...</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" />
              <span>Run 3-Way Quantum Validation</span>
            </>
          )}
        </button>

        {quantumError && (
          <div className="alert alert-error py-1.5 px-2 rounded-lg text-[10px]">
            <AlertCircle className="w-3 h-3" />
            <span>{quantumError}</span>
          </div>
        )}

        {quantumResult?.solvers && (
          <div className="flex flex-col gap-2 mt-1">
            <div className="grid grid-cols-3 gap-1.5">
              {/* QPSO */}
              <div className="bg-base-200/60 p-2 rounded-lg border border-base-300 flex flex-col gap-1 text-center">
                <span className="text-[9px] font-bold uppercase text-primary">QPSO (Swarm)</span>
                <span className="text-xs font-black font-mono">
                  {quantumResult.solvers.qpso?.runtime_ms} ms
                </span>
                <span className="text-[9px] font-mono text-base-content/70">
                  {quantumResult.solvers.qpso?.total_distance > 1000
                    ? `${(quantumResult.solvers.qpso.total_distance / 1000).toFixed(2)} km`
                    : `${quantumResult.solvers.qpso?.total_distance?.toFixed(0)} m`}
                </span>
                <span className="badge badge-ghost badge-xs text-[8px] font-mono">
                  {quantumResult.solvers.qpso?.status}
                </span>
              </div>

              {/* Quantum Annealing */}
              <div className="bg-base-200/60 p-2 rounded-lg border border-base-300 flex flex-col gap-1 text-center">
                <span className="text-[9px] font-bold uppercase text-secondary">Annealing (Neal)</span>
                <span className="text-xs font-black font-mono">
                  {quantumResult.solvers.quantum_annealing?.runtime_ms} ms
                </span>
                <span className="text-[9px] font-mono text-base-content/70">
                  {quantumResult.solvers.quantum_annealing?.total_distance > 1000
                    ? `${(quantumResult.solvers.quantum_annealing.total_distance / 1000).toFixed(2)} km`
                    : `${quantumResult.solvers.quantum_annealing?.total_distance?.toFixed(0)} m`}
                </span>
                <span className="badge badge-ghost badge-xs text-[8px] font-mono">
                  {quantumResult.solvers.quantum_annealing?.status}
                </span>
              </div>

              {/* QAOA */}
              <div className="bg-base-200/60 p-2 rounded-lg border border-base-300 flex flex-col gap-1 text-center">
                <span className="text-[9px] font-bold uppercase text-accent">QAOA (Gate)</span>
                <span className="text-xs font-black font-mono">
                  {quantumResult.solvers.qaoa?.runtime_ms > 1000
                    ? `${(quantumResult.solvers.qaoa.runtime_ms / 1000).toFixed(1)} s`
                    : `${quantumResult.solvers.qaoa?.runtime_ms} ms`}
                </span>
                <span className="text-[9px] font-mono text-base-content/70">
                  {quantumResult.solvers.qaoa?.total_distance > 1000
                    ? `${(quantumResult.solvers.qaoa.total_distance / 1000).toFixed(2)} km`
                    : `${quantumResult.solvers.qaoa?.total_distance?.toFixed(0)} m`}
                </span>
                <span className={`badge badge-xs text-[8px] font-mono ${quantumResult.solvers.qaoa?.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                  {quantumResult.solvers.qaoa?.status}
                </span>
              </div>
            </div>

            {quantumResult.comparison?.best_distance_solver && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-2 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1 font-semibold text-success-content">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  <span>Fastest: <b>{quantumResult.comparison.fastest_solver}</b></span>
                </div>
                <span className="font-mono text-base-content/80">
                  Best Dist: {quantumResult.comparison.best_distance > 1000
                    ? `${(quantumResult.comparison.best_distance / 1000).toFixed(2)} km`
                    : `${quantumResult.comparison.best_distance?.toFixed(0)} m`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart.js Canvas */}
      {routeResult?.convergence?.length > 0 && (
        <div className="card bg-base-100 p-2.5 rounded-xl border border-base-300 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5 px-1 gap-2">
            <span className="text-[10px] font-bold text-base-content/70 uppercase tracking-wider truncate">
              Convergence Trajectory
            </span>
          </div>
          <div className="h-44 w-full">
            <canvas ref={canvasRef} />
          </div>
        </div>
      )}

      {/* SciPy Analytics Card */}
      {routeResult?.convergence?.length > 0 && (
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
      )}

      {/* Theoretical Formulation Box */}
      <div className="alert alert-info bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs flex flex-col gap-1.5 shadow-2xs">
        <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
          Quantum Delta Potential Well Wave Function Update
        </div>
        <div className="w-full bg-base-100 py-2.5 px-3 rounded-lg border border-primary/20 font-mono text-[12px] font-semibold text-base-content shadow-xs whitespace-nowrap overflow-x-auto text-center block">
          x<sub>i</sub>(t+1) = p<sub>i</sub> ± β · |m<sub>best</sub> − x<sub>i</sub>| · ln(1/u)
        </div>
        <div className="text-[10px] text-base-content/70 leading-relaxed">
          Where β is the quantum contraction coefficient linearly decaying from 1.0 to 0.4, and u ~ Uniform(0,1) sampled via SciPy stats.
        </div>
      </div>
    </div>
  );
}