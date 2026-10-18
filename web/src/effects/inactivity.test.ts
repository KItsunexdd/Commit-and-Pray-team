import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeInactivity } from './inactivity'

describe('пауза эффектов без действий пользователя', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('засыпает ровно через 20 секунд и больше не запускает таймеры', () => {
    const change = vi.fn(), stop = observeInactivity(new EventTarget(), change)
    vi.advanceTimersByTime(19_999)
    expect(change).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(change).toHaveBeenCalledExactlyOnceWith(true)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(change).toHaveBeenCalledOnce()
    stop()
  })

  it.each(['pointermove', 'pointerdown', 'touchstart', 'keydown', 'input', 'wheel'])('просыпается по %s и снова отсчитывает 20 секунд', event => {
    const target = new EventTarget(), change = vi.fn(), stop = observeInactivity(target, change)
    vi.advanceTimersByTime(25_000)
    target.dispatchEvent(new Event(event))
    expect(change.mock.calls).toEqual([[true], [false]])
    vi.advanceTimersByTime(19_999)
    expect(change).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect(change).toHaveBeenLastCalledWith(true)
    stop()
  })

  it('продлевает активность без частых уведомлений и дополнительных таймеров', () => {
    const target = new EventTarget(), change = vi.fn(), stop = observeInactivity(target, change)
    for (let second = 0; second < 30; second++) {
      vi.advanceTimersByTime(1000)
      target.dispatchEvent(new Event('pointermove'))
      expect(vi.getTimerCount()).toBe(1)
    }
    expect(change).not.toHaveBeenCalled()
    vi.advanceTimersByTime(19_999)
    expect(change).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(change).toHaveBeenCalledExactlyOnceWith(true)
    stop()
  })

  it('после удаления не реагирует на ввод и отменяет ожидающую проверку', () => {
    const target = new EventTarget(), change = vi.fn(), stop = observeInactivity(target, change)
    stop()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(25_000)
    target.dispatchEvent(new Event('input'))
    expect(change).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    const stopIdle = observeInactivity(target, change)
    vi.advanceTimersByTime(20_000)
    stopIdle()
    target.dispatchEvent(new Event('pointerdown'))
    expect(change).toHaveBeenCalledExactlyOnceWith(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
