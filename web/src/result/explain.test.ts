import { describe, expect, it } from 'vitest'
import { mockParse } from '../api/mocks'
import type { AddressValues, Explain, ParseItem } from '../api/types'
import { ru } from '../i18n/ru'
import { explainAddress } from './explain'

function item(raw: string, values: Partial<AddressValues>, explain: Explain | null = null): ParseItem {
  const parsed = mockParse({ records: [{ id: '0', raw_address: raw }] }).items[0]!
  return { result: { ...parsed.result, ...values }, explain }
}
const colored = (parsed: ParseItem) => explainAddress(parsed).parts.filter((part) => part.field).map(({ field, text }) => [field, text])

describe('подсветка исходного адреса', () => {
  it('использует позиции API, включая сокращённый тип улицы', () => {
    const parsed = mockParse({ records: [{ id: '0', raw_address: ru.examples[0] }] }).items[0]!
    const display = explainAddress(parsed)
    expect(colored(parsed)).toContainEqual(['street_type', 'Мкр'])
    expect(display.sources.province).toBe('dictionary')
    expect(display.sources.city).toBe('string')
    expect(display.parts.map((part) => part.text).join('')).toBe(ru.examples[0])
  })
  it('находит значения без explain и без учёта регистра', () => {
    const parsed = item('АЛМАТЫ, Абая 12, кв 70', { city: 'Алматы', street_name: 'абая', house: '12', apartment: '70', province: 'Алматинская область' })
    expect(colored(parsed)).toEqual([['city', 'АЛМАТЫ'], ['street_name', 'Абая'], ['house', '12'], ['apartment', '70']])
    expect(explainAddress(parsed).sources.province).toBe('unknown')
  })
  it('дополняет неполные пояснения и не выдаёт словарное значение за найденное в строке', () => {
    const parsed = item('Алматы дом 12', { city: 'Алматы', province: 'Алматы', house: '12' }, { sources: { province: 'dictionary' } })
    expect(colored(parsed)).toEqual([['city', 'Алматы'], ['house', '12']])
    expect(explainAddress(parsed).sources.province).toBe('dictionary')
  })
  it('разделяет повторяющиеся значения дома и квартиры', () => {
    expect(colored(item('дом 12 квартира 12', { house: '12', apartment: '12' }))).toEqual([['house', '12'], ['apartment', '12']])
  })
  it('не подсвечивает число внутри большего числа', () => {
    expect(colored(item('квартал 120 дом 12', { house: '12' }))).toEqual([['house', '12']])
    expect(explainAddress(item('дом 120', { house: '12' })).sources.house).toBe('unknown')
  })
  it('разбирает слитное написание улицы и дома', () => {
    expect(colored(item('Назарбаева8', { street_name: 'Назарбаева', house: '8' }))).toEqual([['street_name', 'Назарбаева'], ['house', '8']])
  })
  it('не принимает часть слова за название', () => {
    expect(colored(item('Алматинская область', { city: 'Алматы' }))).toEqual([])
  })
  it('ищет специальные символы буквально', () => {
    expect(colored(item('ЖК A.(B)+[3], 55/6', { living_area: 'A.(B)+[3]', house: '55/6' }))).toEqual([['living_area', 'A.(B)+[3]'], ['house', '55/6']])
  })
  it('сохраняет текст при пересекающихся интервалах и отдаёт городу приоритет перед областью', () => {
    const parsed = item('Алматы', { province: 'Алматы', city: 'Алматы' }, { spans: [{ field: 'province', start: 0, end: 6 }, { field: 'city', start: 0, end: 6 }] })
    expect(colored(parsed)).toEqual([['city', 'Алматы']])
    expect(explainAddress(parsed).parts.map((part) => part.text).join('')).toBe('Алматы')
  })
  it('игнорирует ошибочные интервалы и не разрезает emoji', () => {
    const parsed = item('📦 Алматы 12', { city: 'Алматы', house: '12' }, { spans: [{ field: 'city', start: 1, end: 6 }, { field: 'house', start: 90, end: 92 }] })
    expect(colored(parsed)).toEqual([['city', 'Алматы'], ['house', '12']])
    expect(explainAddress(parsed).parts[0]?.text).toBe('📦 ')
  })
  it('не подсвечивает пустые значения и сохраняет пробелы, переносы и HTML как текст', () => {
    const raw = '  <img src=x onerror=alert(1)>\nАлматы  '
    const display = explainAddress(item(raw, { city: 'Алматы', district: '   ' }))
    expect(display.parts.map((part) => part.text).join('')).toBe(raw)
    expect(display.sources.district).toBeUndefined()
  })
})
