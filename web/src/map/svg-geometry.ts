import { geoMercator, geoPath, geoTransform } from 'd3-geo'

export interface View { x: number; y: number; k: number }
export type Bounds = [[number, number], [number, number]]

export const project = geoMercator().scale(1).translate([0, 0])

// Проецируем точки без сферической переинтерпретации порядка колец RFC 7946.
// Это сохраняет отверстия городов внутри областей и исходную геометрию.
export function svgPath(view: View = { x: 0, y: 0, k: 1 }, screen = (point: [number, number]) => point) {
  return geoPath(geoTransform({ point(lon, lat) {
    const point = project([lon, lat])!
    const pixel = screen([point[0] * view.k + view.x, point[1] * view.k + view.y])
    this.stream.point(pixel[0], pixel[1])
  } })).digits(6)
}

export function fitView(bounds: Bounds, viewport: Bounds): View {
  const [[x0, y0], [x1, y1]] = bounds
  const [[left, top], [right, bottom]] = viewport
  const k = Math.min(Math.max(40, right - left) / Math.max(0.00001, x1 - x0),
    Math.max(40, bottom - top) / Math.max(0.00001, y1 - y0)) * 0.92
  return { k, x: (left + right) / 2 - (x0 + x1) / 2 * k, y: (top + bottom) / 2 - (y0 + y1) / 2 * k }
}

export function scaleView(view: View, factor: number, center: [number, number], min: number, max: number): View {
  const k = Math.max(min, Math.min(max, view.k * factor))
  const ratio = k / view.k
  return { k, x: center[0] + (view.x - center[0]) * ratio, y: center[1] + (view.y - center[1]) * ratio }
}
