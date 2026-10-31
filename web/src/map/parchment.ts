import type { StyleSpecification } from 'maplibre-gl';

/**
 * «Пергаментный» стиль MapLibre: бумажный фон, коричневые береговые линии,
 * подписи курсивом. Векторные тайлы OpenFreeMap (OpenMapTiles, данные © OpenStreetMap).
 */
export function parchmentStyle(lang: 'ru' | 'it'): StyleSpecification {
  const name = ['coalesce', ['get', `name:${lang}`], ['get', 'name_int'], ['get', 'name']] as any;
  const ink = '#4a3622';
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'paper', type: 'background', paint: { 'background-color': '#ecdcb6' } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', paint: { 'fill-color': '#e2cf9f', 'fill-opacity': 0.5 } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#d9c995', 'fill-opacity': 0.4 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#c4cdbb' } },
      { id: 'coast', type: 'line', source: 'omt', 'source-layer': 'water', paint: { 'line-color': '#8a6a43', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 8, 1.6] } },
      { id: 'rivers', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 5, paint: { 'line-color': '#a3ae98', 'line-width': 1 } },
      { id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]], paint: { 'line-color': '#c7a979', 'line-width': 0.8 } },
      { id: 'borders', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2], paint: { 'line-color': '#8a6a43', 'line-width': 1, 'line-dasharray': [3, 2] } },
      {
        id: 'countries', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['==', ['get', 'class'], 'country'], maxzoom: 7,
        layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11, 6, 15], 'text-transform': 'uppercase', 'text-letter-spacing': 0.15 },
        paint: { 'text-color': '#7a5a36', 'text-halo-color': '#ecdcb6', 'text-halo-width': 1.5 },
      },
      {
        id: 'cities', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]], minzoom: 3,
        layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 10, 15], 'text-offset': [0, 0.6], 'text-anchor': 'top' },
        paint: { 'text-color': ink, 'text-halo-color': '#ecdcb6', 'text-halo-width': 1.2 },
      },
    ],
  };
}
