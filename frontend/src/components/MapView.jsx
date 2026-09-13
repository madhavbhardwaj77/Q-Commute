import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ROUTE_STYLES = {
  QPSO: { color: '#6366f1', weight: 5, opacity: 0.9 },
  Dijkstra: { color: '#10b981', weight: 4, opacity: 0.8, dashArray: '8 4' },
  'Genetic Algorithm': { color: '#f59e0b', weight: 4, opacity: 0.8, dashArray: '5 5' },
  previous: { color: '#94a3b8', weight: 3, opacity: 0.5, dashArray: '6 6' },
};

const PIN_ICONS = {
  source: L.divIcon({
    className: '',
    html: '<div style="background:#6366f1;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  }),
  dest: L.divIcon({
    className: '',
    html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  }),
};

export default function MapView({
  sourceLoc,
  destLoc,
  activeRoute,
  previousRoute,
  comparisonRoutes,
  trafficIncident,
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const layersRef = useRef({
    sourceMarker: null,
    destMarker: null,
    currentRoute: null,
    prevRoute: null,
    comparison: [],
    traffic: [],
  });

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([28.6212, 77.2191], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstance.current = map;
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update Markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (layersRef.current.sourceMarker) map.removeLayer(layersRef.current.sourceMarker);
    if (layersRef.current.destMarker) map.removeLayer(layersRef.current.destMarker);

    if (sourceLoc) {
      layersRef.current.sourceMarker = L.marker([sourceLoc.lat, sourceLoc.lon], { icon: PIN_ICONS.source })
        .bindTooltip(`<b>Start:</b> ${sourceLoc.name}`, { direction: 'top' })
        .addTo(map);
    }

    if (destLoc) {
      layersRef.current.destMarker = L.marker([destLoc.lat, destLoc.lon], { icon: PIN_ICONS.dest })
        .bindTooltip(`<b>Destination:</b> ${destLoc.name}`, { direction: 'top' })
        .addTo(map);
    }
  }, [sourceLoc, destLoc]);

  // Update Active Route
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (layersRef.current.currentRoute) {
      map.removeLayer(layersRef.current.currentRoute);
      layersRef.current.currentRoute = null;
    }

    if (activeRoute?.coordinates?.length) {
      const coords = activeRoute.coordinates;
      const style = ROUTE_STYLES[activeRoute.algorithm] || ROUTE_STYLES.QPSO;
      const polyline = L.polyline(coords, style).addTo(map);
      layersRef.current.currentRoute = polyline;

      if (coords.length > 1) {
        map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
      }
    }
  }, [activeRoute]);

  // Update Previous Route (ghosted)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (layersRef.current.prevRoute) {
      map.removeLayer(layersRef.current.prevRoute);
      layersRef.current.prevRoute = null;
    }

    if (previousRoute?.coordinates?.length) {
      const polyline = L.polyline(previousRoute.coordinates, ROUTE_STYLES.previous).addTo(map);
      layersRef.current.prevRoute = polyline;
    }
  }, [previousRoute]);

  // Update Comparison Routes (Benchmark)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    layersRef.current.comparison.forEach((l) => map.removeLayer(l));
    layersRef.current.comparison = [];

    if (comparisonRoutes && Object.keys(comparisonRoutes).length > 0) {
      const allCoords = [];
      Object.entries(comparisonRoutes).forEach(([algo, coords]) => {
        if (coords?.length) {
          allCoords.push(...coords);
          const layer = L.polyline(coords, ROUTE_STYLES[algo] || ROUTE_STYLES.QPSO);
          layer.bindTooltip(`<b>${algo}</b>`, { sticky: true });
          layer.addTo(map);
          layersRef.current.comparison.push(layer);
        }
      });
      if (allCoords.length > 1) {
        map.fitBounds(L.polyline(allCoords).getBounds(), { padding: [40, 40] });
      }
    }
  }, [comparisonRoutes]);

  // Highlight Traffic Edge
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    layersRef.current.traffic.forEach((l) => map.removeLayer(l));
    layersRef.current.traffic = [];

    if (trafficIncident?.affected_coordinates?.length >= 2) {
      const color = trafficIncident.event_type === 'closure' ? '#ef4444' : '#f59e0b';
      const layer = L.polyline(trafficIncident.affected_coordinates, {
        color,
        weight: 8,
        opacity: 0.9,
      }).addTo(map);
      layer.bindTooltip(`<b>${trafficIncident.event_type.toUpperCase()}:</b> ${trafficIncident.road_name || 'Segment'}`, { sticky: true });
      layersRef.current.traffic.push(layer);
    }
  }, [trafficIncident]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div ref={mapRef} className="w-full h-full" />

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-[500] card bg-base-100/95 backdrop-blur border border-base-300 rounded-xl p-3 text-xs shadow-lg flex flex-col gap-1.5 pointer-events-auto">
        <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/60 mb-0.5">Route Legend</div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-1 rounded bg-[#6366f1]" />
          <span className="font-semibold text-base-content">QPSO (Quantum)</span>
          <span className="badge badge-primary badge-xs ml-auto">Adaptive</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-1 rounded bg-[#10b981]" />
          <span className="font-semibold text-base-content">Dijkstra (Exact)</span>
          <span className="badge badge-accent badge-xs ml-auto">Baseline</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-1 rounded bg-[#f59e0b]" />
          <span className="font-semibold text-base-content">GA (Evolutionary)</span>
          <span className="badge badge-warning badge-xs ml-auto">Heuristic</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-1 rounded bg-[#ef4444]" />
          <span className="font-semibold text-base-content">Closed Road</span>
          <span className="badge badge-error badge-xs ml-auto">Blocked</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-1 rounded border-b border-dashed border-base-content/40" />
          <span className="font-medium text-base-content/70">Previous Path</span>
        </div>
      </div>
    </div>
  );
}