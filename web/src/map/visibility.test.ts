import { describe, expect, it, vi } from 'vitest'
import { loadMapVisibility, renderingGate, saveMapVisibility, visibilityKey } from './visibility'

describe('скрытие карты', () => {
  it('отменяет ожидающий кадр и блокирует новые перерисовки до показа', () => {
    const frame = new AbortController(), repaint = vi.fn()
    const map = { triggerRepaint: repaint, _frameRequest: frame }
    const gate = renderingGate(map)
    gate.show(false)
    expect(frame.signal.aborted).toBe(true)
    for (let i = 0; i < 20; i++) map.triggerRepaint()
    expect(repaint).not.toHaveBeenCalled()
    gate.show(true); expect(repaint).toHaveBeenCalledTimes(1)
    gate.dispose(); expect(map.triggerRepaint).toBe(repaint)
  })
  it('сохраняет выбор и допускает запрет localStorage', () => {
    const storage = { getItem: () => 'false', setItem: vi.fn() }
    expect(loadMapVisibility(storage)).toBe(false)
    saveMapVisibility(true, storage); expect(storage.setItem).toHaveBeenCalledWith(visibilityKey, 'true')
    const blocked = { getItem() { throw Error() }, setItem() { throw Error() } }
    expect(loadMapVisibility(blocked)).toBe(true)
    expect(() => saveMapVisibility(false, blocked)).not.toThrow()
  })
})
