import { describe, expect, it, vi } from 'vitest'
import { lineLevels, setAttributeChanged, setStyleChanged, simplifyLine, svgPath, svgStroke } from './simplify'

describe('лёгкая геометрия контура', () => {
  it('сохраняет углы, концы и замыкание, не меняет исходную линию', () => {
    const points = [{ x: 0, y: 0 }, { x: .5, y: .01 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }]
    expect(simplifyLine(points, .02)).toEqual([points[0], points[2], points[3], points[4]])
    expect(points).toHaveLength(5)
    expect(simplifyLine([], .01)).toEqual([])
  })
  it('возвращает подробности при приближении и кеширует каждый масштаб', () => {
    const points = [{ x: 0, y: 0 }, { x: .0001, y: .00001 }, { x: .0002, y: 0 }]
    const levels = lineLevels([points])
    expect(levels(4)[0]).toHaveLength(2)
    expect(levels(10)[0]).toHaveLength(3)
    expect(levels(4.1)).toBe(levels(4.9))
  })
  it('округляет путь до десятой пикселя без лишних знаков', () => {
    expect(svgPath([[{ x: 10.04, y: 20.06 }, { x: -1.23, y: 0 }]])).toBe('M10,20.1L-1.2,0')
  })
  it('не записывает прежние пути и стили в DOM', () => {
    const attributes = new Map<string, string>()
    const element = { getAttribute: (name: string) => attributes.get(name), setAttribute: vi.fn((name: string, value: string) => attributes.set(name, value)) }
    setAttributeChanged(element as unknown as Element, 'd', 'M1,2')
    setAttributeChanged(element as unknown as Element, 'd', 'M1,2')
    expect(element.setAttribute).toHaveBeenCalledOnce()
    const setter = vi.fn()
    const marker = { style: { get transform() { return 'translate(1px, 2px)' }, set transform(value) { setter(value) } } }
    setStyleChanged(marker as unknown as HTMLElement, 'transform', 'translate(1px, 2px)')
    expect(setter).not.toHaveBeenCalled()
  })
  it('отсекает невидимые штрихи, сохраняя пересечение экрана и разрывы', () => {
    const points = [{ x: -30, y: 20 }, { x: -20, y: 20 }, { x: 50, y: 20 }, { x: 130, y: 20 }, { x: 130, y: 80 }, { x: 50, y: 80 }]
    expect(svgStroke([points], 100, 100)).toBe('M-20,20L50,20L130,20M130,80L50,80')
    expect(svgStroke([[{ x: -30, y: 50 }, { x: 130, y: 50 }]], 100, 100)).toBe('M-30,50L130,50')
    expect(svgStroke([[{ x: -30, y: -20 }, { x: 130, y: -20 }]], 100, 100)).toBe('')
    expect(svgPath([points])).toContain('L130,80')
  })
})
