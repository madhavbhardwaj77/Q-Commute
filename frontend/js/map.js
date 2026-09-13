/**
 * map.js — Leaflet map controller for Q-Commute v2.0
 * Supports: multi-route layers, edge heat-coloring, animated vehicle marker, traffic overlays.
 */

let _map, _tileLayer;
let _layers = { current: null, previous: null, traffic: [], markers: {} };
let _animTimer = null;

const ROUTE_STYLES = {
  QPSO:               { color: '#6366f1', weight: 5, opacity: 0.85 },
  Dijkstra:           { color: '#10b981', weight: 4, opacity: 0.75, dashArray: '8 4' },
  'Genetic Algorithm':{ color: '#f59e0b', weight: 4, opacity: 0.75, dashArray: '4 4' },
  previous:           { color: '#94a3b8', weight: 3, opacity: 0.5,  dashArray: '6 6' },
};

const VEHICLE_ICON = L.divIcon({
  className: '',
  html: '<div style="font-size:22px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))">🚗</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const PIN_ICONS = {
  source: L.divIcon({
    className: '',
    html: '<div style="background:#6366f1;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
    iconSize: [16, 16], iconAnchor: [8, 8],
  }),
  dest: L.divIcon({
    className: '',
    html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
    iconSize: [16, 16], iconAnchor: [8, 8],
  }),
};

const MapView = {
  init() {
    _map = L.map('map', { zoomControl: true, attributionControl: true });
    _tileLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>', maxZoom: 19 }
    ).addTo(_map);
    _map.setView([28.6212, 77.2191], 14);
    setTimeout(() => { if (_map) _map.invalidateSize(); }, 200);
  },

  setSource(lat, lon, name) {
    if (_layers.markers.source) _map.removeLayer(_layers.markers.source);
    _layers.markers.source = L.marker([lat, lon], { icon: PIN_ICONS.source })
      .bindTooltip(`<b>Start:</b> ${name}`, { direction: 'top' })
      .addTo(_map);
  },

  setDestination(lat, lon, name) {
    if (_layers.markers.dest) _map.removeLayer(_layers.markers.dest);
    _layers.markers.dest = L.marker([lat, lon], { icon: PIN_ICONS.dest })
      .bindTooltip(`<b>End:</b> ${name}`, { direction: 'top' })
      .addTo(_map);
  },

  showCurrentRoute(coords, algorithm = 'QPSO') {
    if (_layers.current) _map.removeLayer(_layers.current);
    const style = ROUTE_STYLES[algorithm] || ROUTE_STYLES.QPSO;
    _layers.current = L.polyline(coords, style).addTo(_map);
    if (coords.length > 1) _map.fitBounds(_layers.current.getBounds(), { padding: [40, 40] });
    document.getElementById('mapLegend').style.display = '';
  },

  showPreviousRoute(coords) {
    if (_layers.previous) _map.removeLayer(_layers.previous);
    _layers.previous = L.polyline(coords, ROUTE_STYLES.previous).addTo(_map);
  },

  showComparisonRoutes(routeMap) {
    // routeMap: { algorithm -> coords }
    const allCoords = [];
    ['QPSO','Dijkstra','Genetic Algorithm'].forEach(algo => {
      const coords = routeMap[algo];
      if (coords && coords.length) {
        allCoords.push(...coords);
        const layer = L.polyline(coords, ROUTE_STYLES[algo] || ROUTE_STYLES.QPSO);
        layer.bindTooltip(algo, { sticky: true });
        layer.addTo(_map);
        _layers.traffic.push(layer);
      }
    });
    if (allCoords.length > 1) {
      _map.fitBounds(L.polyline(allCoords).getBounds(), { padding: [40, 40] });
    }
    const legend = document.getElementById('mapLegend');
    if (legend) legend.style.display = '';
  },

  highlightTrafficEdge(coords, eventType) {
    const color = eventType === 'closure' ? '#ef4444' : eventType === 'congestion' ? '#f59e0b' : '#fb923c';
    const layer = L.polyline(coords, { color, weight: 8, opacity: 0.9 });
    layer.addTo(_map);
    _layers.traffic.push(layer);
    // Pulse effect
    let count = 0;
    const iv = setInterval(() => {
      count++;
      layer.setStyle({ opacity: count % 2 === 0 ? 0.9 : 0.3 });
      if (count >= 6) { clearInterval(iv); layer.setStyle({ opacity: 0.85 }); }
    }, 350);
  },

  clearTrafficLayers() {
    _layers.traffic.forEach(l => _map.removeLayer(l));
    _layers.traffic = [];
  },

  clearAll() {
    ['current', 'previous'].forEach(k => { if (_layers[k]) { _map.removeLayer(_layers[k]); _layers[k] = null; } });
    this.clearTrafficLayers();
    Object.values(_layers.markers).forEach(m => _map.removeLayer(m));
    _layers.markers = {};
    this.stopAnimation();
    document.getElementById('mapLegend').style.display = 'none';
  },

  animateVehicle(coords) {
    this.stopAnimation();
    if (!coords || coords.length < 2) return;
    if (_layers.markers.vehicle) _map.removeLayer(_layers.markers.vehicle);
    const marker = L.marker(coords[0], { icon: VEHICLE_ICON }).addTo(_map);
    _layers.markers.vehicle = marker;
    let i = 0;
    _animTimer = setInterval(() => {
      i = (i + 1) % coords.length;
      marker.setLatLng(coords[i]);
    }, 120);
  },

  stopAnimation() {
    if (_animTimer) { clearInterval(_animTimer); _animTimer = null; }
    if (_layers.markers.vehicle) { _map.removeLayer(_layers.markers.vehicle); delete _layers.markers.vehicle; }
  },
};
