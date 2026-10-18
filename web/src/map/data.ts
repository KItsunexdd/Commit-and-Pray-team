import type { FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson'
import type { CityInfo } from '../search/places'

export interface RegionInfo {
  id: string
  name_ru: string
  name_kz: string
  name_en: string
  aliases: string[]
  kind: 'oblast' | 'city'
  center: { name: string; lat: number; lon: number }
  bbox: [number, number, number, number]
}

export interface MapData {
  regions: FeatureCollection<Polygon | MultiPolygon, { id: string; name_ru: string; kind: string }>
  borders: FeatureCollection<LineString | MultiLineString>
  outline: FeatureCollection<Polygon | LineString, { part: string }>
  directory: RegionInfo[]
  cities: CityInfo[]
}

export async function localJson<T>(file: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/geo/${file}`, { signal, redirect: 'error' })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${file}`)
  return response.json() as Promise<T>
}

export async function loadMapData(signal: AbortSignal): Promise<MapData> {
  const [regions, borders, outline, directory, cities] = await Promise.all([
    localJson<MapData['regions']>('kz-regions.geojson', signal),
    localJson<MapData['borders']>('kz-region-borders.geojson', signal),
    localJson<MapData['outline']>('kz-outline.geojson', signal),
    localJson<MapData['directory']>('kz-regions.json', signal),
    localJson<MapData['cities']>('kz-cities.json', signal),
  ])
  return { regions, borders, outline, directory, cities }
}

export function countryBounds(directory: RegionInfo[]): [number, number, number, number] {
  return [
    Math.min(...directory.map(({ bbox }) => bbox[0])),
    Math.min(...directory.map(({ bbox }) => bbox[1])),
    Math.max(...directory.map(({ bbox }) => bbox[2])),
    Math.max(...directory.map(({ bbox }) => bbox[3])),
  ]
}
