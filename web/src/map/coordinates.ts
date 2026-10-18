import type { RegionInfo } from './data'
import type { MapViewport } from './viewport'

export function displayCoordinates(region: RegionInfo | null, viewport: MapViewport,
  unproject: (point: [number, number]) => { lon: number; lat: number }) {
  if (region) return { lon: region.center.lon, lat: region.center.lat }
  return unproject([(viewport.left + viewport.right) / 2, (viewport.top + viewport.bottom) / 2])
}
