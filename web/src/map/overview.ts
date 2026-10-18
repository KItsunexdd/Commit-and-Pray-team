import { LngLat } from 'maplibre-gl'
import type { JumpToOptions, Map as MapLibreMap } from 'maplibre-gl'
import type { MapViewport } from './viewport'
import type { Vertex } from './projection'
import { projectVertex } from './projection'
import { surfaceHeight } from './style'

// cameraForBounds вписывает плоский прямоугольник. Обзор страны уточняем по
// настоящему контуру и верхней поверхности, не меняя камеру во время расчёта.
export function overviewCamera(map: MapLibreMap, initial: JumpToOptions, points: Vertex[], viewport: MapViewport): JumpToOptions {
  // Внутренний transform закреплённой MapLibre 6.14 изолирован здесь:
  // публичный cameraForBounds не учитывает наклон и высоту поверхности.
  const transform = map._camera.transform.clone()
  transform.setPadding(viewport.padding)
  transform.setBearing(initial.bearing ?? -7)
  transform.setPitch(44)
  transform.setCenter(LngLat.convert(initial.center!))
  transform.setZoom(initial.zoom!)
  const middle = transform.locationToScreenPoint(transform.center)
  middle.x = (viewport.left + viewport.right) / 2
  middle.y = (viewport.top + viewport.bottom) / 2
  for (let iteration = 0; iteration < 12; iteration++) {
    const matrix = transform.getProjectionDataForCustomLayer(true).mainMatrix
    const elevation = surfaceHeight(transform.zoom)
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for (const point of points) for (const altitude of [0, elevation]) {
      const p = projectVertex(point, altitude, matrix, transform.width, transform.height)
      left = Math.min(left, p.x); right = Math.max(right, p.x)
      top = Math.min(top, p.y); bottom = Math.max(bottom, p.y)
    }
    const center = middle.clone()
    center.x = (left + right) / 2; center.y = (top + bottom) / 2
    transform.setLocationAtPoint(transform.screenPointToLocation(center), middle)
    const ratio = Math.min(viewport.width / (right - left), viewport.height / (bottom - top)) * .98
    if (Math.abs(Math.log2(ratio)) < .001 && center.dist(middle) < .5) break
    transform.setZoom(transform.zoom + Math.log2(ratio) * .8)
  }
  return { center: transform.center, zoom: transform.zoom, bearing: transform.bearing, pitch: transform.pitch, padding: viewport.padding }
}
