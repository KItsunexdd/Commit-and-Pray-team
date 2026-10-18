import type { ExpressionSpecification, FillExtrusionLayerSpecification, StyleSpecification, Map as MapLibreMap } from 'maplibre-gl'
import type { MapData } from './data'
import { colors, currentTheme } from '../theme/store'
import type { Palette } from '../theme/palette'

export const heightStops = [[0, 70_000], [4, 70_000], [7, 1_500], [11, 20]] as const

const liftedHeight = (height: number, lift: number) => height + (Math.max(height * 1.8, 2500) - height) * lift

export function surfaceHeight(zoom: number, lift = 0): number {
  for (let i = 1; i < heightStops.length; i++) {
    const [z0, h0] = heightStops[i - 1]!
    const [z1, h1] = heightStops[i]!
    if (zoom <= z1) return liftedHeight(h0, lift) + (liftedHeight(h1, lift) - liftedHeight(h0, lift)) * Math.max(0, (zoom - z0) / (z1 - z0))
  }
  return liftedHeight(heightStops[heightStops.length - 1]![1], lift)
}

function heightExpression(ratio: number): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], ...heightStops.flatMap(([zoom, height]) => [zoom,
    ['*', ratio, ['+', height, ['*', liftedHeight(height, 1) - height, ['coalesce', ['feature-state', 'lift'], 0]]]] as ExpressionSpecification])]
}

export function regionColor(id: string, palette: Palette = colors()): string {
  return palette[`map-region-${Number(id.slice(-2)) % 6}` as keyof Palette]
}

export function extrusionLayers(compact: boolean, palette: Palette = colors(), selectedId: string | null = null): FillExtrusionLayerSpecification[] {
  const plates = compact ? [[0, 0.4], [0.52, 1]] : [[0, 0.18], [0.27, 0.43], [0.52, 0.7], [0.79, 1]]
  const surface: ExpressionSpecification = ['match', ['get', 'tone'], 0, palette['map-region-0'],
    1, palette['map-region-1'], 2, palette['map-region-2'], 3, palette['map-region-3'], 4, palette['map-region-4'], palette['map-region-5']]
  return plates.map(([base, height], index) => ({
    id: `region-plate-${index}`,
    type: 'fill-extrusion',
    source: 'regions',
    paint: {
      'fill-extrusion-base': heightExpression(base!),
      'fill-extrusion-height': heightExpression(height!),
      'fill-extrusion-color': ['case', selectedId ? ['!=', ['get', 'id'], selectedId] : false, palette['map-dim'],
        ['interpolate', ['linear'], ['coalesce', ['feature-state', 'lift'], 0], 0,
          index === plates.length - 1 ? ['coalesce', ['feature-state', 'analyticsColor'], surface] : palette[`map-plate-${index}` as keyof Palette],
          1, palette['map-selected']]],
      'fill-extrusion-color-transition': { duration: 300 },
      'fill-extrusion-opacity': index === plates.length - 1 ? 1 : 0.82,
      'fill-extrusion-vertical-gradient': true,
    },
  }))
}

export function createMapStyle(data: MapData, compact: boolean, palette: Palette = colors()): StyleSpecification {
  return {
    version: 8,
    projection: { type: 'mercator' },
    light: { anchor: 'viewport', color: palette['map-light'], intensity: 0.43, position: [1.5, 195, 35] },
    sources: {
      regions: { type: 'geojson', data: {
        ...data.regions,
        features: data.regions.features.map((feature) => ({ ...feature, id: feature.properties.id,
          properties: { ...feature.properties, tone: Number(feature.properties.id.slice(-2)) % 6 },
        })),
      }, promoteId: 'id', tolerance: 0.25 },
      outline: { type: 'geojson', data: data.outline, lineMetrics: true },
      borders: { type: 'geojson', data: data.borders },
    },
    layers: [
      { id: 'country-shadow', type: 'fill', source: 'outline', filter: ['==', ['get', 'part'], 'country'],
        paint: { 'fill-color': palette['map-shadow'], 'fill-opacity': 0.8, 'fill-translate': [0, 12], 'fill-translate-anchor': 'viewport' } },
      { id: 'country-ground-glow', type: 'line', source: 'outline', filter: ['==', ['get', 'part'], 'contour'],
        paint: { 'line-color': palette['map-contour'], 'line-width': 10, 'line-blur': 7, 'line-opacity': currentTheme() === 'light' ? 0.08 : 0.32 } },
      { id: 'country-ground-line', type: 'line', source: 'outline', filter: ['==', ['get', 'part'], 'contour'],
        paint: { 'line-color': palette['map-ground'], 'line-width': 1, 'line-opacity': 0.7 } },
      ...extrusionLayers(compact, palette),
    ],
  }
}

export function applySelectionColors(map: MapLibreMap, compact: boolean, selectedId: string | null) {
  for (const layer of extrusionLayers(compact, colors(), selectedId)) map.setPaintProperty(layer.id, 'fill-extrusion-color', layer.paint!['fill-extrusion-color'])
}

export function applyMapTheme(map: MapLibreMap, compact: boolean, selectedId: string | null = null) {
  const palette = colors()
  map.setLight({ color: palette['map-light'] })
  map.setPaintProperty('country-shadow', 'fill-color', palette['map-shadow'])
  map.setPaintProperty('country-ground-line', 'line-color', palette['map-ground'])
  map.setPaintProperty('country-ground-glow', 'line-color', palette['map-contour'])
  map.setPaintProperty('country-ground-glow', 'line-opacity', currentTheme() === 'light' ? .08 : .32)
  applySelectionColors(map, compact, selectedId)
}
