import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { MapData, RegionInfo } from './data'
import type { Place } from '../search/places'
import { createMapController } from './controller'

vi.mock('./overlay', () => ({ createMapOverlay: () => ({ id: 'elevated-overlays', type: 'custom' }) }))
const viewportMock = vi.hoisted(() => ({ width: 375, changed: () => {} }))
vi.mock('./viewport', () => ({ mapViewport: () => ({ left: 24, right: viewportMock.width - 24, top: 300, bottom: 487, padding: { top: 300, bottom: 180, left: 24, right: 24 } }),
  observeMapViewport: (_container: unknown, changed: () => void) => { viewportMock.changed = changed; return () => {} } }))

const region = (id: string, kind: 'city' | 'oblast' = 'oblast'): RegionInfo => ({
  id, kind, name_ru: id, name_kz: id, name_en: id, aliases: [], center: { name: id, lon: 67, lat: 48 },
  bbox: kind === 'city' ? [71, 51, 71.5, 51.5] : [55, 45, 64, 51],
})
const regions = [region('KZ-15'), region('KZ-71', 'city')]
const data = { directory: regions, outline: { features: [] } } as unknown as MapData
const place = (index: number): Place => ({ key: regions[index]!.id, name: regions[index]!.name_ru, region: regions[index]!, city: null })

function setup(reduced = false, economy = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const handlers = new Map<string, Set<() => void>>()
  const single = new Set<() => void>()
  const emit = (event: string) => { for (const callback of [...(handlers.get(event) ?? [])]) { if (single.delete(callback)) handlers.get(event)?.delete(callback); callback() } }
  const off = vi.fn((event: string, callback: () => void) => { handlers.get(event)?.delete(callback) })
  const on = vi.fn((event: string, callback: () => void) => { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event)!.add(callback) })
  const map = {
    on, off,
    once: (event: string, callback: () => void) => { single.add(callback); on(event, callback) },
    addLayer: vi.fn(), removeLayer: vi.fn(), setFeatureState: vi.fn(), triggerRepaint: vi.fn(),
    resize: vi.fn(), setPixelRatio: vi.fn(), setLight: vi.fn(), setPaintProperty: vi.fn(),
    queryRenderedFeatures: vi.fn(() => [{ properties: { id: 'KZ-15' } }]),
    cameraForBounds: vi.fn<(bounds: RegionInfo['bbox'], options: unknown) => object>(() => ({ center: [67, 48], zoom: 4, bearing: -7, padding: { top: 200 } })),
    getCenter: () => ({ lng: 67, lat: 48 }), getZoom: () => 4, getBearing: () => -7,
    unproject: vi.fn(() => ({ lng: 67, lat: 48 })),
    jumpTo: vi.fn(() => emit('moveend')), flyTo: vi.fn(), stop: vi.fn(() => emit('moveend')),
  }
  const status = vi.fn()
  const labels = { dataset: {} }
  const container = { clientWidth: 375, clientHeight: 667, closest: () => null, dataset: {} }
  const controller = createMapController(map as unknown as MapLibreMap, data, container as unknown as HTMLElement, labels as unknown as HTMLElement, {} as SVGSVGElement, status, vi.fn(), undefined, economy)
  return { controller, map, status, emit, labels, container }
}

beforeEach(() => {
  viewportMock.width = 375
  vi.stubGlobal('devicePixelRatio', 2)
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', { documentElement: { dataset: { theme: 'light' } }, hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('выбор региона и управление полётом', () => {
  it('после показа страны и переключения паузы не планирует фоновые кадры', () => {
    const { controller, map } = setup()
    controller.select(null, 0)
    vi.mocked(requestAnimationFrame).mockClear()
    const repaint = vi.spyOn(map, 'triggerRepaint')
    controller.motion(false)
    controller.motion(true)
    controller.motion(false)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(repaint).not.toHaveBeenCalled()
    controller.dispose()
  })
  it('скрытая карта отменяет циклы и не перерисовывается при смене данных и палитры', () => {
    const pending = new Map<number, FrameRequestCallback>()
    let next = 0
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { pending.set(++next, callback); return next }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { pending.delete(id) }))
    const { controller, map } = setup()
    controller.select(place(0))
    expect(pending.size).toBeGreaterThan(0)
    controller.suspend(true); controller.display?.(false); controller.motion(true)
    expect(pending.size).toBe(0)
    map.setPaintProperty.mockClear()
    controller.analysis([], vi.fn()); window.dispatchEvent(new Event('themechange'))
    controller.quality?.(true)
    expect(pending.size).toBe(0)
    expect(map.setPaintProperty).not.toHaveBeenCalled()
    controller.display?.(true); controller.suspend(false)
    expect(map.resize).toHaveBeenCalled()
    controller.dispose(); expect(pending.size).toBe(0)
  })
  it('меняет краски темы во время подлёта без сброса камеры, выбора и аналитики', () => {
    const { controller, map, emit, status } = setup()
    controller.analysis([{ id: 'KZ-15', name: 'Область', count: 2, color: 'green' }], vi.fn())
    controller.select(place(0))
    map.stop.mockClear(); map.jumpTo.mockClear(); map.flyTo.mockClear(); map.setFeatureState.mockClear()
    document.documentElement.dataset.theme = 'dark'
    window.dispatchEvent(new Event('themechange'))
    expect(map.setPaintProperty).toHaveBeenCalled()
    expect(map.setLight).toHaveBeenCalled()
    expect(map.setFeatureState).not.toHaveBeenCalled()
    expect(map.stop).not.toHaveBeenCalled(); expect(map.jumpTo).not.toHaveBeenCalled(); expect(map.flyTo).not.toHaveBeenCalled()
    emit('moveend'); expect(status).toHaveBeenLastCalledWith('found')
    controller.dispose()
  })
  it('ограничивает подлёт к городу масштабом 9.5, сохраняя окружение', () => {
    const { controller, map } = setup()
    controller.select(place(1))
    expect(map.cameraForBounds).toHaveBeenLastCalledWith(regions[1]!.bbox, expect.objectContaining({ maxZoom: 9.5 }))
    controller.select(place(0))
    expect(map.cameraForBounds).toHaveBeenLastCalledWith(regions[0]!.bbox, expect.objectContaining({ maxZoom: 10 }))
    controller.dispose()
  })
  it('изменение свободного места во время полёта пересчитывает цель, сохраняя остаток времени', () => {
    const { controller, map } = setup()
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    controller.select(place(0))
    vi.spyOn(performance, 'now').mockReturnValue(1700)
    viewportMock.width = 390; viewportMock.changed()
    expect(map.jumpTo).not.toHaveBeenCalled()
    expect(map.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 1700 }))
    controller.dispose()
  })
  it('меняет размер и качество существующей карты, сохраняя выбор и исходные слои', () => {
    const { controller, map, container } = setup()
    controller.select(place(0), 0)
    container.clientWidth = 1024; viewportMock.width = 1024
    viewportMock.changed()
    expect(map.resize).toHaveBeenCalledOnce()
    expect(map.cameraForBounds).toHaveBeenLastCalledWith(regions[0]!.bbox, expect.any(Object))
    expect(map.setPixelRatio).toHaveBeenLastCalledWith(2)
    controller.quality?.(true)
    expect(map.setPixelRatio).toHaveBeenLastCalledWith(1)
    container.clientWidth = 390; viewportMock.width = 390
    viewportMock.changed()
    expect(map.resize).toHaveBeenCalledTimes(2)
    expect(map.addLayer).toHaveBeenCalledOnce()
    expect(map.removeLayer).not.toHaveBeenCalled()
    controller.analysis([{ id: 'KZ-15', name: 'Актобе', count: 1, color: '#2b8050' }], vi.fn())
    const click = map.on.mock.calls.find(([name]) => name === 'click')![1] as (event: { point: [number, number] }) => void
    click({ point: [100, 100] })
    expect(map.queryRenderedFeatures).toHaveBeenCalledWith([100, 100], { layers: ['region-plate-0', 'region-plate-1'] })
    controller.dispose()
  })
  it('окрашивает аналитику, открывает записи по клику и восстанавливает обычную карту при выходе', () => {
    const { controller, map } = setup()
    const selected = vi.fn()
    const click = map.on.mock.calls.find(([name]) => name === 'click')![1] as (event: { point: [number, number] }) => void
    const event = { point: [100, 200] as [number, number] }
    click(event)
    expect(map.queryRenderedFeatures).not.toHaveBeenCalled()
    controller.analysis([{ id: 'KZ-15', name: 'Актюбинская область', count: 10, color: '#8df5b2' }], selected)
    expect(map.setFeatureState).toHaveBeenCalledWith({ source: 'regions', id: 'KZ-15' }, { analyticsColor: '#8df5b2' })
    click(event)
    expect(selected).toHaveBeenCalledExactlyOnceWith('KZ-15')
    controller.analysis(null, selected)
    expect(map.setFeatureState).toHaveBeenCalledWith({ source: 'regions', id: 'KZ-15' }, { analyticsColor: null })
    click(event)
    expect(selected).toHaveBeenCalledOnce()
    controller.dispose()
    expect(map.off).toHaveBeenCalledWith('click', click)
  })
  it('пауза демо останавливает подлёт и продолжает оставшееся время без преждевременного завершения', () => {
    const { controller, map, status, emit } = setup()
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    controller.select(place(0))
    vi.spyOn(performance, 'now').mockReturnValue(1800)
    controller.suspend(true)
    expect(status).toHaveBeenLastCalledWith('flying')
    emit('moveend')
    expect(status).toHaveBeenLastCalledWith('flying')
    controller.suspend(false)
    expect(map.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 1600 }))
    emit('moveend')
    expect(status).toHaveBeenLastCalledWith('found')
    controller.dispose()
  })
  it('новая цель во время паузы ждёт продолжения и заменяет старую', () => {
    const { controller, map, status, emit } = setup()
    controller.select(place(0)); controller.suspend(true)
    controller.select(place(1))
    expect(map.flyTo).toHaveBeenCalledOnce()
    controller.suspend(false)
    expect(map.flyTo).toHaveBeenCalledTimes(2)
    emit('moveend')
    expect(status).toHaveBeenLastCalledWith('cityFound')
    controller.dispose()
  })
  it('не запускает пересчёт высот при первом показе страны', () => {
    const { controller, map } = setup(false, true)
    controller.select(null, 0)
    expect(map.setFeatureState).not.toHaveBeenCalled()
    expect(map.jumpTo).toHaveBeenCalledOnce()
    controller.dispose()
  })
  it('обновляет только выбранную и предыдущую область, пропуская неизменившиеся высоты', () => {
    const pending = new Map<number, FrameRequestCallback>()
    let serial = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending.set(++serial, callback); return serial })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id))
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const { controller, map } = setup()
    const advance = () => {
      for (let now = 17; now <= 867; now += 17) {
        const callbacks = [...pending.values()]; pending.clear()
        for (const callback of callbacks) callback(now)
      }
    }
    controller.select(place(0)); advance()
    expect(map.setFeatureState).toHaveBeenCalledTimes(50)
    expect(map.setFeatureState.mock.calls.every(([feature]) => feature.id === 'KZ-15')).toBe(true)
    map.setFeatureState.mockClear()
    controller.select(place(1)); advance()
    expect(map.setFeatureState).toHaveBeenCalledTimes(100)
    expect(map.setFeatureState).toHaveBeenLastCalledWith({ source: 'regions', id: 'KZ-71' }, { lift: 1 })
    map.setFeatureState.mockClear()
    controller.select(place(1)); advance()
    expect(map.setFeatureState).not.toHaveBeenCalled()
    controller.dispose()
  })
  it('использует границы выбранного региона и полёт 2,4 секунды', () => {
    const { controller, map, emit, status } = setup()
    controller.select(place(0))
    expect(map.cameraForBounds.mock.calls[0]?.[0]).toEqual(regions[0]!.bbox)
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 2400, pitch: 47 }))
    expect(map.flyTo.mock.calls[0]?.[0]).toHaveProperty('padding', { top: 300, bottom: 180, left: 24, right: 24 })
    expect(map.cameraForBounds.mock.calls[0]?.[1]).toMatchObject({ absolutePadding: true })
    emit('moveend')
    expect(status).toHaveBeenLastCalledWith('found')
    controller.dispose()
  })
  it('отменяет завершение старого полёта при быстром выборе другой цели', () => {
    const { controller, emit, status } = setup()
    controller.select(place(0))
    controller.select(place(1))
    status.mockClear()
    emit('moveend')
    expect(status.mock.calls).toEqual([['cityFound']])
    controller.dispose()
  })
  it('без анимации сразу поднимает выбранный регион, затем снимает выделение при сбросе', () => {
    vi.useFakeTimers()
    const { controller, map, status } = setup(true)
    controller.select(place(1))
    expect(map.flyTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(map.jumpTo).toHaveBeenCalled()
    expect(status).toHaveBeenLastCalledWith('cityFound')
    expect(map.setFeatureState).toHaveBeenCalledWith({ source: 'regions', id: 'KZ-71' }, { lift: 1 })
    expect(map.setFeatureState).toHaveBeenCalledOnce()
    map.setFeatureState.mockClear()
    controller.select(null)
    vi.advanceTimersByTime(250)
    expect(status).toHaveBeenLastCalledWith('ready')
    expect(map.setFeatureState.mock.calls.every(([, state]) => state.lift === 0)).toBe(true)
    controller.dispose()
  })
  it('пауза останавливает декоративное движение, сохраняя ручной выбор', () => {
    const { controller, labels, map } = setup()
    controller.motion(true)
    expect(labels.dataset).toHaveProperty('motion', 'paused')
    controller.select(place(0))
    expect(map.flyTo).toHaveBeenCalledOnce()
    controller.dispose()
  })
  it('удаляет ожидающее завершение полёта при размонтировании', () => {
    const { controller, status, emit } = setup()
    controller.select(place(0))
    controller.dispose()
    status.mockClear()
    emit('moveend')
    expect(status).not.toHaveBeenCalled()
  })

  it('в скрытой вкладке завершает подлёт без продолжающейся анимации', () => {
    const { controller, map, status, labels } = setup()
    controller.select(place(0))
    const visibility = vi.mocked(document.addEventListener).mock.calls.find(([name]) => name === 'visibilitychange')![1] as () => void
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    visibility()
    expect(map.jumpTo).toHaveBeenCalledOnce()
    expect(status).toHaveBeenLastCalledWith('found')
    expect(labels.dataset).toHaveProperty('motion', 'paused')
    expect(map.setFeatureState).toHaveBeenCalledWith({ source: 'regions', id: 'KZ-15' }, { lift: 1 })
    controller.dispose()
  })

  it('в облегчённом режиме не запускает фоновое вращение камеры', () => {
    const { controller } = setup(false, true)
    vi.mocked(requestAnimationFrame).mockClear()
    controller.motion(false)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    controller.dispose()
  })
})
