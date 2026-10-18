import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCameraFade, handoffRequest } from './handoff'
import type { MapView } from './handoff'
import type { Place } from '../search/places'

afterEach(() => vi.useRealTimers())
describe('передача вида между SVG и 3D', () => {
  const view: MapView = { camera: { center: [62, 48], zoom: 5.3 }, selection: { key: 'KZ-15' } as Place, remaining: 1540 }
  it('сохраняет остаток полёта, а последний новый выбор получает полные 2400 мс', () => {
    expect(handoffRequest(view, null)).toEqual({ place: view.selection, duration: 1540 })
    const next = { place: { key: 'KZ-71' } as Place, duration: 2400 }
    expect(handoffRequest(view, next)).toEqual(next)
    expect(handoffRequest(view, { place: null, duration: 2400 }).place).toBeNull()
  })
  it('меняет вид на середине затухания 250 мс; отмена не применяет старую цель', () => {
    vi.useFakeTimers()
    const host = { dataset: {} } as HTMLElement, labels = { dataset: {} } as HTMLElement
    const fade = createCameraFade(host, labels), change = vi.fn(), done = vi.fn()
    fade.run(change, done)
    expect(host.dataset.cameraFade).toBe('out')
    vi.advanceTimersByTime(124)
    expect(change).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(change).toHaveBeenCalledOnce()
    expect(host.dataset.cameraFade).toBeUndefined()
    vi.advanceTimersByTime(125)
    expect(done).toHaveBeenCalledOnce()
    fade.run(change, done); fade.cancel(); vi.runAllTimers()
    expect(change).toHaveBeenCalledOnce()
    expect(done).toHaveBeenCalledOnce()
  })
})
