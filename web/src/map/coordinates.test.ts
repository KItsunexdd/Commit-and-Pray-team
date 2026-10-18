import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { displayCoordinates } from './coordinates'
import { Hud } from './Hud'
import type { MapViewport } from './viewport'
import type { RegionInfo } from './data'

const viewport = { left: 36, top: 352, right: 926, bottom: 636 } as MapViewport
describe('координаты в HUD', () => {
  it('проецирует центр свободной области, а не центр всего окна', () => {
    const unproject = vi.fn(() => ({ lon: 66.8, lat: 48.1 }))
    expect(displayCoordinates(null, viewport, unproject)).toEqual({ lon: 66.8, lat: 48.1 })
    expect(unproject).toHaveBeenCalledWith([481, 494])
  })
  it('при выборе региона использует его центр из справочника', () => {
    const unproject = vi.fn()
    const region = { center: { lon: 57.167, lat: 50.283 } } as RegionInfo
    expect(displayCoordinates(region, viewport, unproject)).toEqual({ lon: 57.167, lat: 50.283 })
    expect(unproject).not.toHaveBeenCalled()
  })
  it('до загрузки показывает тире даже при устаревшей телеметрии', () => {
    const html = renderToStaticMarkup(createElement(Hud, { status: 'loading', paused: false, telemetry: { lon: 67, lat: 48, zoom: 3, bearing: -7 } }))
    expect(html).toContain('<span>—</span>')
    expect(html).not.toContain('48.0000')
    expect(html).not.toContain('67.0000')
  })
})
