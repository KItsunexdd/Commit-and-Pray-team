import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fitView, project, scaleView, svgPath } from './svg-geometry'
import type { MapData } from './data'

const regions = JSON.parse(readFileSync(new URL('../../../data/geo/kz-regions.geojson', import.meta.url), 'utf8')) as MapData['regions']
const directory = JSON.parse(readFileSync(new URL('../../../data/geo/kz-regions.json', import.meta.url), 'utf8')) as MapData['directory']

describe('запасная SVG-карта', () => {
  it('проецирует все 20 реальных регионов без инверсии полигонов', () => {
    const path = svgPath()
    expect(regions.features).toHaveLength(20)
    for (const feature of regions.features) {
      const [[x0, y0], [x1, y1]] = path.bounds(feature)
      const bbox = directory.find(region => region.id === feature.properties.id)!.bbox
      const westNorth = project([bbox[0], bbox[3]])!, eastSouth = project([bbox[2], bbox[1]])!
      expect(x0).toBeCloseTo(westNorth[0], 2)
      expect(y0).toBeCloseTo(westNorth[1], 2)
      expect(x1).toBeCloseTo(eastSouth[0], 2)
      expect(y1).toBeCloseTo(eastSouth[1], 2)
      expect(path(feature)).not.toMatch(/NaN|Infinity/)
    }
  })
  it.each([[375, 667], [390, 844], [412, 915], [768, 1024], [1440, 900]])('вмещает каждый регион в свободную часть экрана %ix%i', (width, height) => {
    for (const feature of regions.features) {
      const viewport: [[number, number], [number, number]] = [[32, height * .4], [width - 32, height - 200]]
      const view = fitView(svgPath().bounds(feature), viewport)
      const [[x0, y0], [x1, y1]] = svgPath(view).bounds(feature)
      expect(x0).toBeGreaterThanOrEqual(viewport[0][0])
      expect(y0).toBeGreaterThanOrEqual(viewport[0][1])
      expect(x1).toBeLessThanOrEqual(viewport[1][0])
      expect(y1).toBeLessThanOrEqual(viewport[1][1])
    }
  })
  it('сохраняет точку под курсором и ограничивает масштаб при жестах', () => {
    const view = { x: 20, y: -10, k: 100 }
    const point: [number, number] = [180, 420]
    const next = scaleView(view, 1000, point, 50, 500)
    expect(next.k).toBe(500)
    expect((point[0] - next.x) / next.k).toBeCloseTo((point[0] - view.x) / view.k)
    expect((point[1] - next.y) / next.k).toBeCloseTo((point[1] - view.y) / view.k)
    expect(scaleView(next, .001, point, 50, 500).k).toBe(50)
  })
})
