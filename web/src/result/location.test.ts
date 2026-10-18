import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mockParse } from '../api/mocks'
import type { RegionInfo } from '../map/data'
import type { CityInfo } from '../search/places'
import { locateAddress } from './location'

const regions: RegionInfo[] = JSON.parse(readFileSync(new URL('../../../data/geo/kz-regions.json', import.meta.url), 'utf8'))
const cities: CityInfo[] = JSON.parse(readFileSync(new URL('../../../data/geo/kz-cities.json', import.meta.url), 'utf8'))
const result = (province: string | null, city: string | null) => ({ ...mockParse({ records: [{ id: '0', raw_address: '' }] }).items[0]!.result, province, city })

describe('регион из разобранного адреса', () => {
  it.each([
    ['Алматы', 'Алматы', 'KZ-75', 'Алматы'],
    ['Актюбинская область', 'Актюбинск', 'KZ-15', 'Актобе'],
    ['ВКО', 'Усть-Каменогорск', 'KZ-63', 'Усть-Каменогорск'],
    [null, 'Нұр-Сұлтан', 'KZ-71', 'Астана'],
    ['Неизвестная область', 'Шымкент', 'KZ-79', 'Шымкент'],
    ['Алматинская область', 'Капчагай', 'KZ-19', 'Конаев'],
  ])('%s / %s → %s', (province, city, id, name) => {
    const located = locateAddress(result(province, city), regions, cities)
    expect(located.place?.region.id).toBe(id)
    expect(located.place?.city?.name).toBe(name)
    expect(located.note).toBeNull()
  })
  it('сохраняет область без выдуманной точки неизвестного города', () => {
    const located = locateAddress(result('Актюбинская область', 'Неизвестный'), regions, cities)
    expect(located.place?.region.id).toBe('KZ-15')
    expect(located.place?.city).toBeNull()
    expect(located.note).toBe('regionOnly')
  })
  it('не переносит адрес в другой регион при противоречии province и city', () => {
    const located = locateAddress(result('Алматинская область', 'Алматы'), regions, cities)
    expect(located.place?.region.id).toBe('KZ-19')
    expect(located.place?.city).toBeNull()
  })
  it('выбирает одноимённый город только с известной областью', () => {
    const duplicates = [ { ...cities[0]!, name: 'Одинаковый', name_kz: '', name_en: '', aliases: [], region_id: 'KZ-15' },
      { ...cities[1]!, name: 'Одинаковый', name_kz: '', name_en: '', aliases: [], region_id: 'KZ-19' } ]
    expect(locateAddress(result(null, 'Одинаковый'), regions, duplicates).place).toBeNull()
    expect(locateAddress(result('Алматинская область', 'Одинаковый'), regions, duplicates).place?.city?.region_id).toBe('KZ-19')
  })
  it('не выбирает похожее место для неизвестного или пустого результата', () => {
    expect(locateAddress(result(null, null), regions, cities).place).toBeNull()
    expect(locateAddress(result('Луна', 'Марс'), regions, cities).place).toBeNull()
  })
})
