import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { countryBounds } from './data'
import type { MapData } from './data'
import { createMapStyle, extrusionLayers, surfaceHeight } from './style'
import { palettes } from '../theme/palette'

const read = (filename: string): unknown => JSON.parse(readFileSync(new URL(`../../../data/geo/${filename}`, import.meta.url), 'utf8'))
const data: MapData = {
  regions: read('kz-regions.geojson') as MapData['regions'],
  borders: read('kz-region-borders.geojson') as MapData['borders'],
  outline: read('kz-outline.geojson') as MapData['outline'],
  directory: read('kz-regions.json') as MapData['directory'],
  cities: read('kz-cities.json') as MapData['cities'],
}

describe('локальная карта Казахстана', () => {
  it.each([[true, 'light'], [true, 'dark'], [false, 'light'], [false, 'dark']] as const)('официальный валидатор принимает стиль, компактный режим: %s, тема: %s', (compact, theme) => {
    const style = createMapStyle(data, compact, palettes[theme])
    expect(validateStyleMin(style).map((error) => error.message)).toEqual([])
    expect(style.layers.filter((layer) => layer.type === 'fill-extrusion'))
      .toHaveLength(compact ? 2 : 4)
  })

  it('не содержит внешних источников, тайлов, глифов или текстовых слоёв', () => {
    const style = createMapStyle(data, false)
    expect(style.glyphs).toBeUndefined()
    expect(style.sprite).toBeUndefined()
    expect(style.layers.some((layer) => layer.type === 'symbol')).toBe(false)
    for (const source of Object.values(style.sources)) {
      expect(source.type).toBe('geojson')
      if (source.type === 'geojson') expect(typeof source.data).toBe('object')
    }
  })
  it('валидирует выделение через paint-выражение, без dim в состоянии каждой области', () => {
    const style = createMapStyle(data, false)
    style.layers = [...style.layers.filter(layer => layer.type !== 'fill-extrusion'), ...extrusionLayers(false, palettes.dark, 'KZ-75')]
    expect(validateStyleMin(style).map(error => error.message)).toEqual([])
    expect(JSON.stringify(style.layers)).not.toContain('"dim"')
    expect(JSON.stringify(style.layers)).toContain('KZ-75')
  })

  it('сохраняет все 20 регионов и оригинальные геометрии', () => {
    const original = JSON.stringify(data)
    const style = createMapStyle(data, false)
    expect(data.regions.features).toHaveLength(20)
    expect(data.directory).toHaveLength(20)
    expect(JSON.stringify(data)).toBe(original)
    const source = style.sources.regions
    if (source?.type !== 'geojson' || typeof source.data !== 'object' || source.data.type !== 'FeatureCollection') throw new Error('regions')
    expect(source.data.features.map((feature) => feature.id))
      .toEqual(data.directory.map((region) => region.id))
    expect(source.data.features.map((feature) => feature.geometry))
      .toEqual(data.regions.features.map((feature) => feature.geometry))
  })

  it('вмещает все региональные центры в общую рамку', () => {
    const [west, south, east, north] = countryBounds(data.directory)
    for (const { center } of data.directory) {
      expect(center.lon).toBeGreaterThanOrEqual(west)
      expect(center.lon).toBeLessThanOrEqual(east)
      expect(center.lat).toBeGreaterThanOrEqual(south)
      expect(center.lat).toBeLessThanOrEqual(north)
    }
  })

  it('уменьшает высоту при приближении без отрицательных значений', () => {
    expect(surfaceHeight(3)).toBe(70_000)
    expect(surfaceHeight(7)).toBe(1_500)
    expect(surfaceHeight(11)).toBe(20)
    for (let zoom = 0; zoom <= 12; zoom += 0.25) {
      expect(surfaceHeight(zoom)).toBeGreaterThanOrEqual(20)
      expect(surfaceHeight(zoom + 0.25)).toBeLessThanOrEqual(surfaceHeight(zoom))
    }
  })
  it('сохраняет заметный подъём выбранного города на масштабе 9–12 и плавно интерполирует lift', () => {
    for (let zoom = 9; zoom <= 12; zoom += .25) {
      expect(surfaceHeight(zoom, 1)).toBeGreaterThanOrEqual(2500)
      expect(surfaceHeight(zoom, 1)).toBeLessThanOrEqual(2700)
      expect(surfaceHeight(zoom, .5)).toBeCloseTo((surfaceHeight(zoom) + surfaceHeight(zoom, 1)) / 2)
    }
    expect(surfaceHeight(11)).toBe(20)
    expect(surfaceHeight(4, 1)).toBe(126_000)
  })
})
