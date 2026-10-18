import { afterEach, describe, expect, it, vi } from 'vitest'
import { afterMapPaint, delayMapPreview, revealMapOnIdle } from './loading'
import type { Map as MapLibreMap } from 'maplibre-gl'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function scheduler(hasIdle = true) {
  let next = 0
  const frames = new Map<number, () => void>()
  const idle = new Map<number, () => void>()
  const requestIdle = vi.fn((callback: () => void) => { idle.set(++next, callback); return next })
  vi.stubGlobal('window', hasIdle ? { requestIdleCallback: requestIdle } : {})
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { frames.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('requestIdleCallback', requestIdle)
  vi.stubGlobal('cancelIdleCallback', (id: number) => idle.delete(id))
  const flush = (queue: Map<number, () => void>) => { const pending = [...queue.values()]; queue.clear(); pending.forEach(fn => fn()) }
  return { paint: () => flush(frames), rest: () => flush(idle), frames, idle, requestIdle }
}

describe('загрузка 3D после первого кадра SVG', () => {
  it('не показывает заглушку на быстром запуске, а при задержке ждёт 1.2 секунды', () => {
    vi.useFakeTimers()
    const show = vi.fn(), cancel = delayMapPreview(show)
    vi.advanceTimersByTime(1199)
    expect(show).not.toHaveBeenCalled()
    cancel(); vi.advanceTimersByTime(1)
    expect(show).not.toHaveBeenCalled()
    delayMapPreview(show); vi.advanceTimersByTime(1200)
    expect(show).toHaveBeenCalledOnce()
  })
  it('оставляет SVG до idle с подключённым непустым холстом; ранние load/render не открывают 3D', () => {
    const handlers = new Map<string, () => void>()
    const canvas = { isConnected: false, width: 0, height: 0 }
    const map = { on: (name: string, callback: () => void) => handlers.set(name, callback),
      off: (name: string) => handlers.delete(name), getCanvas: () => canvas }
    const host = { contains: () => canvas.isConnected }, reveal = vi.fn()
    const cancel = revealMapOnIdle(map as unknown as MapLibreMap, host as unknown as HTMLElement, reveal)
    handlers.get('load')?.(); handlers.get('render')?.(); handlers.get('idle')?.()
    expect(reveal).not.toHaveBeenCalled()
    canvas.isConnected = true
    handlers.get('idle')?.()
    expect(reveal).not.toHaveBeenCalled()
    canvas.width = 1366; canvas.height = 768
    handlers.get('idle')?.(); handlers.get('idle')?.()
    expect(reveal).toHaveBeenCalledOnce()
    cancel()
  })

  it('отменённая смена карты не открывает устаревший холст после позднего idle', () => {
    let ready!: () => void
    const reveal = vi.fn(), off = vi.fn()
    const map = { on: (_name: string, callback: () => void) => { ready = callback }, off,
      getCanvas: () => ({ isConnected: true, width: 100, height: 100 }) }
    const cancel = revealMapOnIdle(map as unknown as MapLibreMap, { contains: () => true } as unknown as HTMLElement, reveal)
    cancel(); ready()
    expect(reveal).not.toHaveBeenCalled()
    expect(off).toHaveBeenCalledWith('idle', ready)
  })
  it('даёт отрисовать SVG и ждёт свободного времени, ограниченного одной секундой', async () => {
    const clock = scheduler(), ready = vi.fn()
    const pending = afterMapPaint(new AbortController().signal).then(ready)
    clock.paint()
    expect(clock.requestIdle).not.toHaveBeenCalled()
    clock.paint()
    expect(clock.requestIdle).toHaveBeenCalledWith(expect.any(Function), { timeout: 1000 })
    expect(ready).not.toHaveBeenCalled()
    clock.rest()
    await pending
    expect(ready).toHaveBeenCalledOnce()
  })

  it.each([0, 1, 2])('отменяет отложенный запуск после ухода со страницы (шаг %i)', async steps => {
    const clock = scheduler(), abort = new AbortController(), ready = vi.fn()
    const pending = afterMapPaint(abort.signal).then(ready)
    const rejected = expect(pending).rejects.toBe('closed')
    for (let step = 0; step < steps; step++) clock.paint()
    abort.abort('closed')
    clock.paint(); clock.rest()
    await rejected
    expect(ready).not.toHaveBeenCalled()
    expect(clock.frames.size + clock.idle.size).toBe(0)
  })

  it('работает без requestIdleCallback', async () => {
    const clock = scheduler(false)
    const pending = afterMapPaint(new AbortController().signal)
    clock.paint(); clock.paint()
    await pending
    expect(clock.requestIdle).not.toHaveBeenCalled()
  })

  it('не планирует кадр для уже отменённого запуска', async () => {
    const clock = scheduler(), abort = new AbortController()
    abort.abort('closed')
    await expect(afterMapPaint(abort.signal)).rejects.toBe('closed')
    expect(clock.frames.size).toBe(0)
  })
})
