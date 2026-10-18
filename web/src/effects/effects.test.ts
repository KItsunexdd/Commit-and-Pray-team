import { describe, expect, it, vi } from 'vitest'
import { measureLine, pointOnTrack } from './contour'
import { animationLoop } from './loop'
import { effectProfile, lowPowerDevice, performanceGuard } from './quality'

describe('импульс по замкнутому контуру', () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }]
  const track = { points, metric: measureLine(points), key: 'country' }
  it('проходит весь контур за один цикл, в том числе стык хвоста', () => {
    expect(track.metric.total).toBe(40)
    expect(pointOnTrack(track, .125)).toEqual({ x: 5, y: 0 })
    expect(pointOnTrack(track, .5)).toEqual({ x: 10, y: 10 })
    expect(pointOnTrack(track, 1)).toEqual(pointOnTrack(track, 0))
    expect(pointOnTrack(track, -.125)).toEqual(pointOnTrack(track, .875))
  })
  it('не меняет географическую позицию при изменении проекции', () => {
    const projected = { ...track, points: points.map(({ x, y }) => ({ x: x * 2, y: y / 2 })) }
    expect(pointOnTrack(projected, .375)).toEqual({ x: 20, y: 2.5 })
  })
  it('обрабатывает нулевую длину без NaN', () => {
    expect(pointOnTrack({ key: '', points: [{ x: 0, y: 0 }], metric: measureLine([{ x: 0, y: 0 }]) }, .2)).toBeNull()
  })
})

describe('ограничение нагрузки', () => {
  it('ограничивает плотность пикселей и число частиц', () => {
    const phone = effectProfile(375, 667, 3, false, false)
    expect(phone.ratio).toBe(1)
    expect(phone.particles).toBeLessThan(effectProfile(1440, 900, 3, false, false).particles)
    expect(phone.panels).toBe(false)
    expect(effectProfile(4000, 3000, 3, false, false).particles).toBeLessThanOrEqual(56)
    expect(effectProfile(4000, 3000, 3, false, false).ratio).toBe(1)
    expect(effectProfile(4000, 3000, 3, false, false).fps).toBe(15)
  })
  it('в облегчённом режиме сокращает эффекты, в reduced-motion убирает частицы', () => {
    expect(effectProfile(1440, 900, 3, true, false)).toMatchObject({ ratio: 1, fps: 15, panels: false })
    expect(effectProfile(1440, 900, 3, false, true)).toMatchObject({ particles: 0, waves: 4, panels: false })
    expect(lowPowerDevice({ hardwareConcurrency: 4 })).toBe(true)
    expect(lowPowerDevice({ deviceMemory: 2, hardwareConcurrency: 12 })).toBe(true)
    expect(lowPowerDevice({})).toBe(false)
  })
  it('не снижает качество из-за единичного медленного кадра или прогрева', () => {
    const guard = performanceGuard()
    for (let now = 0; now < 6000; now += 33) expect(guard.sample(now, now === 1980 ? 150 : 16)).toBe(false)
    guard.reset()
    expect(guard.sample(100_000, 100_000)).toBe(false)
  })
  it('распознаёт три последовательных окна с пропусками реальных кадров', () => {
    for (const gap of [60, 150, 600]) {
      const guard = performanceGuard()
      let slow = false
      for (let now = 0; now < 4500; now += gap) expect(guard.sample(now, gap)).toBe(false)
      for (let now = 4500; now < 6000; now += gap) slow ||= guard.sample(now, gap)
      expect(slow).toBe(true)
    }
  })
  it('сбрасывает серию медленных окон после восстановления и скрытия страницы', () => {
    const guard = performanceGuard()
    for (let now = 0; now < 4000; now += 60) expect(guard.sample(now, 60)).toBe(false)
    for (let now = 4000; now < 8000; now += 16) expect(guard.sample(now, 16)).toBe(false)
    guard.reset()
    expect(guard.sample(60_000, 60_000)).toBe(false)
  })
})

describe('часы эффектов', () => {
  it('не запрашивает пустые кадры между отрисовками и отменяет ожидающий таймер при паузе', () => {
    vi.useFakeTimers()
    let callback: FrameRequestCallback = () => {}
    const request = vi.fn((next: FrameRequestCallback) => { callback = next; return 1 })
    vi.stubGlobal('requestAnimationFrame', request)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const draw = vi.fn(), loop = animationLoop(draw, 24)
    try {
      loop.start(); callback(0)
      expect(draw).toHaveBeenCalledOnce()
      vi.advanceTimersByTime(30)
      expect(request).toHaveBeenCalledOnce()
      loop.stop(); vi.advanceTimersByTime(100)
      expect(request).toHaveBeenCalledOnce()
      loop.start(); callback(1000)
      expect(loop.time()).toBe(0)
      expect(draw).toHaveBeenCalledTimes(2)
    } finally { loop.stop(); vi.useRealTimers(); vi.unstubAllGlobals() }
  })
  function setup(fps = 30) {
    const queue = new Map<number, (now: number) => void>()
    let serial = 0
    const draw = vi.fn()
    const loop = animationLoop(draw, fps, { request: (callback) => { queue.set(++serial, callback); return serial }, cancel: (id) => { queue.delete(id) } })
    const step = (now: number) => { const callbacks = [...queue.values()]; queue.clear(); for (const callback of callbacks) callback(now) }
    return { loop, queue, draw, step }
  }
  it('рисует импульс 15 раз в секунду даже на экране 120 Гц', () => {
    const { loop, draw, step } = setup(effectProfile(1440, 900, 2, false, false).fps)
    loop.start()
    for (let frame = 0; frame < 120; frame++) step(frame * 1000 / 120)
    expect(draw).toHaveBeenCalledTimes(15)
    loop.stop()
  })
  it('после паузы продолжает с того же места без скачка времени', () => {
    const { loop, queue, draw, step } = setup()
    loop.start(); loop.start()
    expect(queue.size).toBe(1)
    step(0); step(40)
    expect(loop.time()).toBe(.04)
    loop.stop()
    expect(queue.size).toBe(0)
    step(10_000)
    expect(draw).toHaveBeenCalledTimes(2)
    loop.start(); step(20_000)
    expect(loop.time()).toBe(.04)
    step(20_040)
    expect(loop.time()).toBe(.08)
    loop.stop()
  })
  it('ограничивает отрисовку и допускает остановку внутри кадра', () => {
    const { loop, draw, step, queue } = setup()
    loop.start()
    step(0); step(10); step(20); step(30); step(40)
    expect(draw).toHaveBeenCalledTimes(2)
    draw.mockImplementation(() => loop.stop())
    step(80)
    expect(queue.size).toBe(0)
  })
})
