import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { labelPriorities, placeLabels } from './labels'
import type { CityLabel } from './labels'
import type { MapData } from './data'

const viewport = { left: 0, top: 0, right: 400, bottom: 400 }
const label = (id: string, x: number, y: number, priority: number, width = 90): CityLabel => ({ id, x, y, priority, width, height: 14 })

describe('размещение подписей городов', () => {
  it('сдвигает подпись в аналитике, оставляя число адресов над точкой открытым', () => {
    const count = { left: 90, right: 110, top: 75, bottom: 92 }
    const [placed] = placeLabels([label('Астана', 100, 100, 0)], viewport, [count])
    expect(placed).toBeDefined()
    expect(placed!.box.right <= count.left || placed!.box.left >= count.right || placed!.box.top >= count.bottom || placed!.box.bottom <= count.top).toBe(true)
    expect(placed!.dy).not.toBe(-23)
  })
  it('отдаёт приоритет столице и двум крупнейшим городам, затем населению центров из справочника', () => {
    const read = (file: string) => JSON.parse(readFileSync(new URL(`../../../data/geo/${file}`, import.meta.url), 'utf8'))
    const regions = read('kz-regions.json') as MapData['directory']
    const cities = read('kz-cities.json') as MapData['cities']
    expect(regions.every(region => cities.some(city => city.region_id === region.id && city.name === region.center.name))).toBe(true)
    const order = [...labelPriorities(regions, cities).keys()]
    expect(order.slice(0, 3)).toEqual(['KZ-71', 'KZ-75', 'KZ-79'])
    expect(order.indexOf('KZ-35')).toBeLessThan(order.indexOf('KZ-19'))
    const reversed = cities.map(city => ({ ...city, population: city.region_id === 'KZ-19' ? 10_000_000 : 0 }))
    expect([...labelPriorities(regions, reversed).keys()][3]).toBe('KZ-19')
  })
  it('пробует смещения, сохраняя обе близкие подписи и не закрывая точки', () => {
    const result = placeLabels([label('Туркестан', 180, 200, 5), label('Шымкент', 200, 210, 2)], viewport)
    expect(result).toHaveLength(2)
    const [a, b] = result.map(item => item.box)
    expect(a!.right <= b!.left || b!.right <= a!.left || a!.bottom <= b!.top || b!.bottom <= a!.top).toBe(true)
    expect(result.some(item => item.dx !== -45 || item.dy !== -23)).toBe(true)
  })
  it('скрывает менее важную подпись только после исчерпания мест, а при приближении возвращает', () => {
    const crowded = [label('главный', 100, 30, 0), label('второй', 101, 30, 1)]
    const narrow = { left: 50, right: 151, top: 0, bottom: 40 }
    expect(placeLabels(crowded, narrow).map(item => item.id)).toEqual(['главный'])
    expect(placeLabels([crowded[0]!, { ...crowded[1]!, x: 300, y: 200 }], viewport)).toHaveLength(2)
  })
  it('выбирает свободную сторону у границы и удерживает текст внутри карты', () => {
    const result = placeLabels([label('край', 8, 20, 0)], viewport)
    expect(result[0]?.dx).toBe(10)
    expect(result[0]?.box.left).toBeGreaterThanOrEqual(viewport.left)
  })
  it('размещает тесную группу без пересечений независимо от порядка входных записей', () => {
    const labels = Array.from({ length: 20 }, (_, i) => label(String(i), 120 + i % 5 * 35, 90 + Math.floor(i / 5) * 22, i))
    const placements = placeLabels(labels, viewport)
    expect(placements).toEqual(placeLabels([...labels].reverse(), viewport))
    for (let i = 0; i < placements.length; i++) for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i]!.box, b = placements[j]!.box
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true)
    }
  })
})
