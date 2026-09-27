import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function ConvergenceChart({ data = [], isLive = false }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data.length) return;

    const labels = data.map((d) => d.iteration);
    const costs = data.map((d) => d.best_cost);

    if (chartRef.current) {
      chartRef.current.data.labels = labels;
      chartRef.current.data.datasets[0].data = costs;
      chartRef.current.update(isLive ? 'none' : undefined);
      return;
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Global Best Fitness',
            data: costs,
            borderColor: isLive ? '#3b82f6' : '#6366f1',
            backgroundColor: isLive ? 'rgba(59, 130, 246, 0.12)' : 'rgba(99, 102, 241, 0.08)',
            borderWidth: 2,
            pointRadius: data.length > 40 ? 0 : 2,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: isLive ? false : { duration: 400 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Cost: ${ctx.parsed.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'Iteration', font: { size: 9 } },
            ticks: { font: { size: 8 }, maxRotation: 0, autoSkip: true },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
          y: {
            title: { display: true, text: 'Best Fitness', font: { size: 9 } },
            ticks: { font: { size: 8 } },
            grid: { color: 'rgba(0,0,0,0.05)' },
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
  }, [data, isLive]);

  return (
    <div className="w-full h-36 relative">
      <canvas ref={canvasRef} />
    </div>
  );
}
