/**
 * charts.js — Chart.js wrappers for Q-Commute SIH 2026
 * Deliverable #3 (convergence analysis) + #5 (benchmark)
 */

let convergenceChart = null;
let benchmarkChart   = null;

const ALGO_COLORS = {
  'QPSO':               { border: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
  'Dijkstra':           { border: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  'Genetic Algorithm':  { border: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
};

function drawConvergenceChart(convergenceData, canvasId = 'convergenceChart') {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !convergenceData || !convergenceData.length) return;

  if (convergenceChart) { convergenceChart.destroy(); convergenceChart = null; }

  const labels = convergenceData.map(d => d.iteration);
  const values = convergenceData.map(d => d.best_cost);

  convergenceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Best Objective Cost',
        data: values,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.08)',
        borderWidth: 2,
        pointRadius: 1.5,
        pointHoverRadius: 5,
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeOutCubic' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Cost: ${ctx.parsed.y.toFixed(4)}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Iteration', font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { maxTicksLimit: 10 }
        },
        y: {
          title: { display: true, text: 'Objective Cost', font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' },
        }
      }
    }
  });
}

function drawBenchmarkChart(results, canvasId = 'benchmarkChart') {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !results || !results.length) return;

  if (benchmarkChart) { benchmarkChart.destroy(); benchmarkChart = null; }

  const validResults = results.filter(r => r.valid);
  const labels       = validResults.map(r => r.algorithm);
  const metric       = 'total_cost';

  const datasets = [
    {
      label: 'Obj. Cost',
      data: validResults.map(r => r.total_cost),
      backgroundColor: validResults.map(r => (ALGO_COLORS[r.algorithm] || { bg: 'rgba(100,100,200,0.3)' }).bg),
      borderColor:     validResults.map(r => (ALGO_COLORS[r.algorithm] || { border: '#6366f1' }).border),
      borderWidth: 2,
      borderRadius: 6,
      yAxisID: 'yLeft',
    },
    {
      label: 'Time (s)',
      data: validResults.map(r => r.travel_time_s),
      backgroundColor: 'rgba(16,185,129,0.15)',
      borderColor: '#10b981',
      borderWidth: 2,
      borderRadius: 6,
      yAxisID: 'yRight',
      type: 'line',
      tension: 0.3,
    }
  ];

  benchmarkChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700 },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { font: { size: 11 } }
        },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        yLeft: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Obj. Cost', font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        yRight: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Time (s)', font: { size: 10 } },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function drawRuntimeChart(results, canvasId = 'runtimeChart') {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !results || !results.length) return;

  const valid = results.filter(r => r.valid);
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: valid.map(r => r.algorithm),
      datasets: [{
        label: 'Runtime (ms)',
        data: valid.map(r => r.runtime_ms),
        backgroundColor: valid.map(r => (ALGO_COLORS[r.algorithm]?.bg || 'rgba(100,100,200,0.3)')),
        borderColor:     valid.map(r => (ALGO_COLORS[r.algorithm]?.border || '#6366f1')),
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          title: { display: true, text: 'ms', font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      }
    }
  });
}
