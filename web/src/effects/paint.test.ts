import { describe, expect, it, vi } from 'vitest'
import { createSurface, measureLine } from './contour'
import { createPainter } from './paint'
import { effectProfile } from './quality'
vi.mock('../theme/store', () => ({ currentTheme: () => 'light', colors: () => ({}) }))

describe('светлые фоновые эффекты', () => {
  it('очищает только прежний импульс, не весь экран и не создаёт маски или градиенты', () => {
    const surface = createSurface()
    const points = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 100 }]
    surface.update('M100,100L200,200', '', { key: 'test', points, metric: measureLine(points) })
    const context = { clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), createRadialGradient: vi.fn() }
    const paint = createPainter(context as unknown as CanvasRenderingContext2D, surface, 1440, 900, effectProfile(1440, 900, 2, false, false), false, [])
    paint(1); expect(context.clearRect).not.toHaveBeenCalled()
    paint(1.05)
    const [, , width, height] = context.clearRect.mock.calls[0]!
    expect(width * height).toBeLessThan(1440 * 900 / 100)
    expect(context.createRadialGradient).not.toHaveBeenCalled()
    surface.update('', '', null); paint(2)
    const calls = context.clearRect.mock.calls.length
    paint(3); expect(context.clearRect).toHaveBeenCalledTimes(calls)
  })
  it('сообщает о начале и конце движения без повторных уведомлений', () => {
    const surface = createSurface(), changed = vi.fn()
    const stop = surface.subscribeMotion(changed)
    surface.setMoving(true); surface.setMoving(true); surface.setMoving(false)
    expect(changed).toHaveBeenCalledTimes(2)
    stop(); surface.setMoving(true); expect(changed).toHaveBeenCalledTimes(2)
  })
})
