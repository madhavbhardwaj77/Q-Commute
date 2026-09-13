/**
 * ui.js — DOM updates for Q-Commute v2.0
 * Handles: tab switching, metric cards, math formulation, traffic events list,
 *          benchmark table, animated reveals, toast notifications.
 */

window.$ = window.$ || (id => document.getElementById(id));

// ── Tab Management ────────────────────────────────────────────────────────────
const UI = {
  currentTab: 'metrics',

  switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.style.display = panel.id === `tab-${tabId}` ? '' : 'none';
    });
    this.currentTab = tabId;
  },

  // ── Status Badge ─────────────────────────────────────────────────────────
  setStatus(state, text) {
    const dot  = $('statusDot');
    const span = $('statusText');
    if (!dot || !span) return;
    dot.className = `status-dot status-${state}`;
    span.textContent = text;
  },

  // ── Toast Notifications ──────────────────────────────────────────────────
  toast(message, type = 'info', duration = 4000) {
    const container = $('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  },

  // ── Loading Overlay ──────────────────────────────────────────────────────
  showLoading(text = 'Processing…') {
    const overlay = $('loadingOverlay');
    if (overlay) { $('loadingText').textContent = text; overlay.style.display = 'flex'; }
  },

  hideLoading() {
    const overlay = $('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
  },

  // ── Route Metrics Tab ────────────────────────────────────────────────────
  showRouteResult(result) {
    $('tab-metrics').style.display = '';
    this.switchTab('metrics');

    const fmt = (v, unit, digits=1) => v != null ? `${(+v).toFixed(digits)} ${unit}` : '—';
    const mins = s => { const m = Math.floor(s/60); return m > 0 ? `${m}m ${Math.floor(s%60)}s` : `${Math.floor(s)}s`; };

    const data = [
      { label: 'Algorithm',      value: result.algorithm },
      { label: 'Travel Time',    value: mins(result.travel_time_s) },
      { label: 'Distance',       value: fmt(result.distance_m / 1000, 'km', 2) },
      { label: 'Obj. Cost',      value: result.total_cost?.toFixed(4) ?? '—' },
      { label: 'Runtime',        value: fmt(result.runtime_ms, 'ms', 0) },
      { label: 'Congestion',     value: result.congestion_cost?.toFixed(4) ?? '—' },
      { label: 'Path Nodes',     value: result.path?.length ?? '—' },
    ];

    const grid = $('metricsGrid');
    grid.innerHTML = data.map(d => `
      <div class="metric-card">
        <span class="metric-label">${d.label}</span>
        <span class="metric-value">${d.value}</span>
      </div>`).join('');

    // Show QPSO params badge
    const paramsEl = $('qpsoParams');
    if (paramsEl && result.quantum_params) {
      const p = result.quantum_params;
      paramsEl.style.display = '';
      paramsEl.innerHTML = `
        <span class="param-badge">Particles: <b>${p.n_particles}</b></span>
        <span class="param-badge">Iterations: <b>${p.n_iter}</b></span>
        <span class="param-badge">w<sub>t</sub>: <b>${p.weight_time ?? 0.5}</b></span>
        <span class="param-badge">w<sub>d</sub>: <b>${p.weight_dist ?? 0.3}</b></span>
        <span class="param-badge">w<sub>c</sub>: <b>${p.weight_cong ?? 0.2}</b></span>`;
    } else if (paramsEl) {
      paramsEl.style.display = 'none';
    }
  },

  // ── Algorithm Intelligence Tab ───────────────────────────────────────────
  showAlgorithmDetails(result) {
    if (!result.convergence || !result.convergence.length) return;
    this.switchTab('intelligence');

    // Convergence chart
    const canvas = $('convergenceChart');
    if (canvas) {
      canvas.style.display = '';
      drawConvergenceChart(result.convergence, 'convergenceChart');
    }

    // Stats
    const conv  = result.convergence;
    const first = conv[0]?.best_cost ?? 0;
    const last  = conv[conv.length-1]?.best_cost ?? 0;
    const improvement = first > 0 ? ((first - last) / first * 100).toFixed(2) : '0.00';
    const iEl = $('convImprovement');
    if (iEl) iEl.innerHTML = `
      <div class="stat-row"><span>Initial Cost</span><b>${first.toFixed(4)}</b></div>
      <div class="stat-row"><span>Final Cost</span><b>${last.toFixed(4)}</b></div>
      <div class="stat-row"><span>Improvement</span><b class="text-green">${improvement}%</b></div>
      <div class="stat-row"><span>Iterations</span><b>${conv.length}</b></div>
      <div class="stat-row"><span>Population</span><b>${result.population ?? '—'}</b></div>`;
  },

  // ── Benchmark Tab ────────────────────────────────────────────────────────
  showBenchmark(data) {
    this.switchTab('benchmark');

    const tbody = $('benchmarkBody');
    if (tbody) {
      tbody.innerHTML = data.results.map(r => {
        const badge = r.algorithm === data.winner?.lowest_cost ? '🏆' : '';
        return `
          <tr class="${r.valid ? '' : 'row-invalid'}">
            <td><span class="algo-pill algo-${r.algorithm.replace(' ','-').toLowerCase()}">${r.algorithm}</span></td>
            <td>${r.valid ? (r.distance_m/1000).toFixed(2)+' km' : '—'}</td>
            <td>${r.valid ? Math.floor(r.travel_time_s)+'s' : '—'}</td>
            <td>${r.valid ? r.total_cost.toFixed(4) : '—'} ${badge}</td>
            <td>${r.valid ? r.runtime_ms.toFixed(0)+' ms' : '—'}</td>
          </tr>`;
      }).join('');
    }

    const winEl = $('benchmarkWinner');
    if (winEl && data.winner) {
      winEl.innerHTML = `
        <b>🥇 Best Route:</b> ${data.winner.lowest_cost} &nbsp;|&nbsp;
        <b>⚡ Fastest:</b> ${data.winner.fastest_time} &nbsp;|&nbsp;
        <b>📏 Shortest:</b> ${data.winner.shortest_dist}`;
    }

    if (data.improvement && data.improvement.cost_vs_dijkstra_pct !== undefined) {
      const impEl = $('benchmarkImprovement');
      if (impEl) {
        const pct = data.improvement.cost_vs_dijkstra_pct;
        impEl.innerHTML = pct >= 0
          ? `QPSO improved cost by <b class="text-green">${pct}%</b> over Dijkstra`
          : `Dijkstra outperformed QPSO by <b class="text-red">${Math.abs(pct)}%</b> — honest result shown`;
      }
    }

    // Draw chart
    drawBenchmarkChart(data.results, 'benchmarkChart');
  },

  // ── Rerouting Comparison ─────────────────────────────────────────────────
  showRerouteComparison(result) {
    const section = $('rerouteSection');
    if (!section) return;
    section.style.display = '';

    const prev = result.previous_route;
    const next = result.new_route;
    const diff = result.diff;

    const fmtDiff = (v, unit='s') => {
      if (v == null || isNaN(v)) return '—';
      const cls = v > 0 ? 'text-red' : (v < 0 ? 'text-green' : '');
      return `<span class="${cls}">${v > 0 ? '+' : ''}${Number(v).toFixed(1)} ${unit}</span>`;
    };

    const fmtCost = c => (c != null && !isNaN(c)) ? Number(c).toFixed(4) : '—';
    const fmtDist = d => (d != null && !isNaN(d)) ? `${(Number(d)/1000).toFixed(2)}km` : '—';
    const fmtTime = t => (t != null && !isNaN(t)) ? `${Number(t).toFixed(0)}s` : '—';

    const rows = [
      ['Time',     fmtTime(prev?.travel_time_s), fmtTime(next?.travel_time_s), fmtDiff(diff?.travel_time_s_diff)],
      ['Distance', fmtDist(prev?.distance_m),    fmtDist(next?.distance_m),    fmtDiff(diff?.distance_m_diff, 'm')],
      ['Cost',     fmtCost(prev?.total_cost),    fmtCost(next?.total_cost),    fmtDiff(diff?.total_cost_diff, '')],
    ];

    const el = $('rerouteTable');
    if (el) {
      el.innerHTML = rows.map(([label, before, after, delta]) => `
        <tr>
          <td class="rr-label">${label}</td>
          <td>${before}</td>
          <td><b>${after}</b></td>
          <td>${delta}</td>
        </tr>`).join('');
    }

    const verdict = $('rerouteVerdict');
    if (verdict) {
      verdict.textContent = diff.route_changed
        ? '✅ Route successfully rerouted around traffic event'
        : diff.feasible_alternate
          ? '⚠️ No better alternate found — original route is least-cost despite event'
          : '❌ No feasible alternate route — network blocked';
      verdict.className = `verdict ${diff.route_changed ? 'verdict-success' : diff.feasible_alternate ? 'verdict-warn' : 'verdict-error'}`;
    }
  },

  // ── Traffic Events List ──────────────────────────────────────────────────
  addTrafficEvent(eventData) {
    const list = $('activeEventsList');
    if (!list) return;
    const empty = list.querySelector('.no-events');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'event-item';
    const icons = { congestion: '🚦', slowdown: '🚧', closure: '🚫' };
    item.innerHTML = `
      <span class="event-icon">${icons[eventData.event_type] || '⚠️'}</span>
      <div class="event-info">
        <span class="event-name">${eventData.road_name || 'Road segment'}</span>
        <span class="event-meta">${eventData.event_type} · ${eventData.severity || ''}</span>
      </div>`;
    list.prepend(item);
  },

  clearTrafficEvents() {
    const list = $('activeEventsList');
    if (list) list.innerHTML = '<p class="no-events">No active events</p>';
  },

  // ── Graph Metrics (Math Formulation Tab) ─────────────────────────────────
  showGraphMetrics(data) {
    const el = $('graphMetricsBody');
    if (!el) return;
    const rows = [
      ['Nodes (|V|)',         data.nodes],
      ['Edges (|E|)',         data.edges],
      ['Graph Density',      data.density?.toFixed(6)],
      ['Avg Degree',         data.avg_degree],
      ['Max In-Degree',      data.max_in_degree],
      ['SCCs',               data.strongly_connected_components],
      ['Avg Edge Length',    `${data.avg_edge_length_m} m`],
      ['Avg Travel Time',    `${data.avg_travel_time_s} s`],
      ['Avg Speed',          `${data.avg_speed_kph} km/h`],
      ['Coordinate System',  data.coordinate_system],
    ];
    el.innerHTML = rows.map(([k, v]) => `
      <tr><td class="gm-key">${k}</td><td class="gm-val"><b>${v ?? '—'}</b></td></tr>`).join('');
  },
};
