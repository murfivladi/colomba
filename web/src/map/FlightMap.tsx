import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { positionAt, type LonLat, type TimelinePoint } from '@colomba/shared';
import { CourierArt } from '../art/Couriers';
import { Compass } from '../art/Misc';
import { parchmentStyle } from './parchment';

/** Непрерывные долготы, чтобы линия через антимеридиан не перечёркивала карту. */
function unwrap(points: LonLat[]): LonLat[] {
  const out: LonLat[] = [];
  let off = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const d = points[i][0] + off - out[i - 1][0];
      if (d > 180) off -= 360;
      else if (d < -180) off += 360;
    }
    out.push([points[i][0] + off, points[i][1]]);
  }
  return out;
}

export interface FlightMapProps {
  timeline: TimelinePoint[];
  startAt: string;
  courier: string;
  postmarks?: { pos: LonLat; stamped: boolean; ru: string; it: string }[];
  lang: 'ru' | 'it';
  onTick?: (info: { moving: boolean; elapsed: number }) => void;
}

/** Старинная карта с курьером, маршрутом и штемпелями. Позицию курьера считает браузер. */
export function FlightMap({ timeline, startAt, courier, postmarks = [], lang, onTick }: FlightMapProps) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current || timeline.length < 2) return;
    const pts = unwrap(timeline.map((p) => [p[0], p[1]] as LonLat));
    const map = new maplibregl.Map({
      container: el.current,
      style: parchmentStyle(lang),
      attributionControl: { compact: true },
      renderWorldCopies: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    const bounds = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    map.fitBounds(bounds, { padding: 50, duration: 0, maxZoom: 9 });

    const start = new Date(startAt).getTime();
    const markerEl = document.createElement('div');
    markerEl.style.width = '54px';
    markerEl.style.height = '54px';
    markerEl.style.filter = 'drop-shadow(0 2px 2px rgba(0,0,0,.35))';
    const root = createRoot(markerEl);
    root.render(<CourierArt code={courier} size={54} />);
    const marker = new maplibregl.Marker({ element: markerEl }).setLngLat(pts[0]).addTo(map);

    const pmMarkers = postmarks.map((p) => {
      const d = document.createElement('div');
      d.title = lang === 'it' ? p.it : p.ru;
      d.style.cssText = `width:14px;height:14px;border-radius:50%;border:2px solid #2e4a62;background:${p.stamped ? '#2e4a62' : 'transparent'};opacity:${p.stamped ? 0.9 : 0.5}`;
      return new maplibregl.Marker({ element: d }).setLngLat(p.pos).addTo(map);
    });

    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } } });
      map.addSource('done', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [pts[0], pts[0]] } } });
      map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#8a6a43', 'line-width': 2, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'done', type: 'line', source: 'done', paint: { 'line-color': '#8c2a1d', 'line-width': 3 } });
    });

    let raf = 0;
    let lastDone = -1;
    const frame = () => {
      const elapsed = (Date.now() - start) / 1000;
      const { pos, moving, index } = positionAt(timeline, elapsed);
      // позиция в «развёрнутых» долготах — ближайшая к соседней точке маршрута
      const ref = pts[Math.min(index, pts.length - 1)];
      let lon = pos[0];
      while (lon - ref[0] > 180) lon -= 360;
      while (lon - ref[0] < -180) lon += 360;
      marker.setLngLat([lon, pos[1]]);
      markerEl.style.opacity = moving ? '1' : '0.75';
      if (index !== lastDone && map.getSource('done')) {
        lastDone = index;
        (map.getSource('done') as maplibregl.GeoJSONSource).setData({
          type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...pts.slice(0, index + 1), [lon, pos[1]]] },
        });
      }
      onTick?.({ moving, elapsed });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      pmMarkers.forEach((m) => m.remove());
      marker.remove();
      setTimeout(() => root.unmount());
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, startAt, courier, lang]);

  return (
    <div className="map-wrap">
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <Compass className="compass" />
    </div>
  );
}
