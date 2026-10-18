import { MercatorCoordinate } from 'maplibre-gl'
import type { Position } from 'geojson'

export type Vertex = { x: number; y: number; unit: number }

export function vertex(coordinate: Position): Vertex {
  const point = MercatorCoordinate.fromLngLat([coordinate[0]!, coordinate[1]!], 1)
  return { x: point.x, y: point.y, unit: point.z }
}

export function projectVertex(point: Vertex, height: number, matrix: ArrayLike<number>, width: number, canvasHeight: number) {
  const z = point.unit * height
  const w = matrix[3]! * point.x + matrix[7]! * point.y + matrix[11]! * z + matrix[15]!
  return {
    x: (1 + (matrix[0]! * point.x + matrix[4]! * point.y + matrix[8]! * z + matrix[12]!) / w) * width / 2,
    y: (1 - (matrix[1]! * point.x + matrix[5]! * point.y + matrix[9]! * z + matrix[13]!) / w) * canvasHeight / 2,
    visible: w > 0,
  }
}
