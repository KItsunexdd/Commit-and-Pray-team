import type { MapViewport } from './viewport'
import type { View } from './svg-geometry'
import { project } from './svg-geometry'

const pitch = 44 * Math.PI / 180, angle = 7 * Math.PI / 180
const cp = Math.cos(pitch), sp = Math.sin(pitch), ca = Math.cos(angle), sa = Math.sin(angle)

// Та же перспектива плоскости Mercator, что у камеры MapLibre с pitch 44°.
export function svgPerspective(layout: MapViewport, height: number) {
  const cx = (layout.left + layout.right) / 2, cy = (layout.top + layout.bottom) / 2
  const distance = height * 1.5
  const screen = ([x, y]: [number, number]): [number, number] => {
    const dx = x - cx, dy = y - cy, rx = dx * ca - dy * sa, ry = dx * sa + dy * ca
    const scale = distance / (distance - ry * sp)
    return [cx + rx * scale, cy + ry * cp * scale]
  }
  const plane = ([x, y]: [number, number]): [number, number] => {
    const ry = (y - cy) * distance / (cp * distance + (y - cy) * sp)
    const rx = (x - cx) * (distance - ry * sp) / distance
    return [cx + rx * ca + ry * sa, cy - rx * sa + ry * ca]
  }
  return {
    screen, plane, cx, cy,
    transform: `perspective(${distance}px) rotateX(44deg) rotateZ(7deg)`,
    origin: `${cx}px ${cy}px`,
    camera(view: View) {
      return { center: project.invert!([(cx - view.x) / view.k, (cy - view.y) / view.k])!,
        zoom: Math.log2(2 * Math.PI * view.k / 512), pitch: 44, bearing: -7, padding: layout.padding }
    },
  }
}
