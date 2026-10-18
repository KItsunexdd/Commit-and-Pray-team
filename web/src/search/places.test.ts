import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RegionInfo } from '../map/data'
import { findPlaces, indexPlaces, normalize } from './places'
import type { CityInfo } from './places'

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../../data/geo/${name}`, import.meta.url), 'utf8'))
const regions: RegionInfo[] = read('kz-regions.json')
const cities: CityInfo[] = read('kz-cities.json')
const index = indexPlaces(regions, cities)

describe('поиск по локальному справочнику', () => {
  it.each([
    ['алмата', 'Алматы', 'KZ-75'], ['Алма-Ата', 'Алматы', 'KZ-75'],
    ['актюбинск', 'Актобе', 'KZ-15'], ['Ақтөбе қаласы', 'Актобе', 'KZ-15'],
    ['город Актобе', 'Актобе', 'KZ-15'], ['Aktobe', 'Актобе', 'KZ-15'],
    ['Аткобе', 'Актобе', 'KZ-15'], ['Нұр-Сұлтан', 'Астана', 'KZ-71'],
    ['Astana', 'Астана', 'KZ-71'], ['Чимкент', 'Шымкент', 'KZ-79'],
    ['Семипалатинск', 'Семей', 'KZ-10'], ['Капчагай', 'Конаев', 'KZ-19'],
    ['ВКО', 'Восточно-Казахстанская область', 'KZ-63'],
    ['ЗКО', 'Западно-Казахстанская область', 'KZ-27'],
    ['Алматинская область', 'Алматинская область', 'KZ-19'],
    ['Алматы облысы', 'Алматинская область', 'KZ-19'],
    ['Almaty Region', 'Алматинская область', 'KZ-19'],
  ])('%s → %s', (query, name, region) => {
    const result = findPlaces(index, query)[0]
    expect(result?.name).toBe(name)
    expect(result?.region.id).toBe(region)
  })

  it('различает город Алматы и Алматинскую область', () => {
    expect(findPlaces(index, 'Алматы')[0]?.city).not.toBeNull()
    expect(findPlaces(index, 'Алматинская')[0]?.city).toBeNull()
  })
  it('сохраняет одноимённые города отдельными пунктами', () => {
    const duplicates = cities.filter((city) => cities.filter((other) => city.name === other.name).length > 1)
    expect(duplicates.length).toBeGreaterThan(0)
    for (const city of duplicates) {
      const results = findPlaces(index, city.name, 250)
      expect(results.some((place) => place.city?.lon === city.lon && place.city?.lat === city.lat)).toBe(true)
      expect(new Set(results.map((place) => place.key)).size).toBe(results.length)
    }
  })
  it('находит каждый город по полному имени и не меняет исходные данные', () => {
    const before = JSON.stringify({ regions, cities })
    for (const city of cities) expect(findPlaces(index, city.name, 250).some((place) => place.city === city)).toBe(true)
    expect(JSON.stringify({ regions, cities })).toBe(before)
  })
  it.each(['', '   ', '🧭', 'ыфвпхж', 'Туран 55/6 магазин береке', '12', 'а'.repeat(251)])('не подбирает случайный регион для %s', (query) => {
    expect(findPlaces(index, query)).toEqual([])
  })
  it('ограничивает список и ставит точное совпадение первым', () => {
    expect(findPlaces(index, 'а')).toHaveLength(6)
    expect(findPlaces(index, 'Абай')[0]?.name).toBe('Абай')
  })
  it('нормализует казахские буквы, диакритику, пробелы и дефисы', () => {
    expect(normalize('  АқТӨБЕ — Aqtöbe ')).toBe('актобе aqtobe')
  })
})
