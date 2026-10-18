import { afterEach, describe, expect, it, vi } from 'vitest'
import { mapViewport } from './viewport'

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height })
function setup(width: number, height: number, boxes: Record<string, ReturnType<typeof rect>>) {
  const elements = Object.fromEntries(Object.entries(boxes).map(([selector, bounds]) => [selector, { hidden: false, getClientRects: () => [bounds], getBoundingClientRect: () => bounds }]))
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible' }))
  return { clientWidth: width, clientHeight: height, getBoundingClientRect: () => rect(0, 0, width, height),
    closest: () => ({ querySelector: (selector: string) => elements[selector] }) } as unknown as HTMLElement
}
afterEach(() => vi.unstubAllGlobals())

describe('свободная область карты', () => {
  it('учитывает фактический низ всего поиска даже ниже середины экрана', () => {
    const viewport = mapViewport(setup(1366, 768, { '.map-hero': rect(24, 150, 1318, 300) }))
    expect(viewport.top).toBe(474)
  })
  it('оставляет место справа до начала панели, включая её отступ от края', () => {
    const viewport = mapViewport(setup(1366, 768, { '[data-result-panel]': rect(950, 104, 380, 600) }))
    expect(viewport.right).toBe(926)
    expect(viewport.padding.right).toBe(440)
  })
  it('учитывает реальную высоту мобильной шторки без ограничения 42% экрана', () => {
    const viewport = mapViewport(setup(390, 844, { '.map-hero': rect(24, 98, 342, 90), '[data-result-panel]': rect(12, 340, 366, 456) }))
    expect(viewport.top).toBe(212)
    expect(viewport.bottom).toBe(316)
    expect(viewport.padding.bottom).toBe(528)
  })
  it('пересчитывает область при изменении геометрии интерфейса', () => {
    const hero = rect(24, 120, 1318, 220)
    const container = setup(1366, 768, { '.map-hero': hero })
    expect(mapViewport(container).top).toBe(364)
    hero.bottom += 55
    expect(mapViewport(container).top).toBe(419)
  })
  it('не принимает перенесённую в шапку кнопку паузы за нижнюю панель', () => {
    const viewport = mapViewport(setup(390, 844, { '.map-hero': rect(24, 98, 342, 86),
      '.map-controls': rect(322, 34, 44, 44), '[data-result-panel]': rect(12, 446, 366, 350) }))
    expect(viewport.top).toBe(208)
    expect(viewport.bottom).toBe(422)
  })
})
