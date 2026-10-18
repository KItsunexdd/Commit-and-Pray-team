import { describe, expect, it } from 'vitest'
import { svgPerspective } from './svg-perspective'
import { project } from './svg-geometry'
import type { MapViewport } from './viewport'

describe('наклон SVG и передача камеры', () => {
  const layout = { left: 24, top: 300, right: 366, bottom: 650, padding: { left: 24, top: 300, right: 24, bottom: 194 } } as MapViewport
  const perspective = svgPerspective(layout, 844)
  it('сохраняет географический центр, масштаб, наклон и отступы при смене движка', () => {
    const point = project([67, 48])!, k = 1200
    const camera = perspective.camera({ k, x: perspective.cx - point[0] * k, y: perspective.cy - point[1] * k })
    expect(camera.center[0]).toBeCloseTo(67)
    expect(camera.center[1]).toBeCloseTo(48)
    expect(512 * 2 ** camera.zoom).toBeCloseTo(2 * Math.PI * k)
    expect(camera).toMatchObject({ pitch: 44, bearing: -7, padding: layout.padding })
  })
  it('инвертирует перспективу для жестов и не смещает центр свободной области', () => {
    for (const point of [[24, 300], [366, 650], [195, 475]] as [number, number][]) {
      const original = perspective.plane(perspective.screen(point))
      expect(original[0]).toBeCloseTo(point[0]); expect(original[1]).toBeCloseTo(point[1])
    }
    expect(perspective.screen([195, 475])).toEqual([195, 475])
  })
})
