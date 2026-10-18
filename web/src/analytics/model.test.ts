import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addressFields } from '../api/types'
import type { AddressResult, AddressValues } from '../api/types'
import type { RegionInfo } from '../map/data'
import type { CityInfo } from '../search/places'
import { editRow } from '../files/document'
import type { FileRow } from '../files/document'
import { analysisColors, createRegionIndex, filePositions, percentage, summarizeFile, unassignedRegion, zeroColor } from './model'

const read = (file: string): unknown => JSON.parse(readFileSync(new URL(`../../../data/geo/${file}`, import.meta.url), 'utf8'))
const regions = read('kz-regions.json') as RegionInfo[]
const cities = read('kz-cities.json') as CityInfo[]
const empty = Object.fromEntries(addressFields.map(field => [field, null])) as AddressValues
function row(values: Partial<AddressResult> = {}): FileRow {
  const result = { ...empty, id: 'duplicate', raw_address: 'адрес', confidence: .6, ...values }
  return { item: { result, explain: null }, original: { ...result }, edited: [] }
}

describe('сопоставление записи с регионом', () => {
  const locate = createRegionIndex(regions, cities)
  it('находит все регионы по name_ru и каждому alias без учёта регистра и пробелов', () => {
    for (const region of regions) for (const name of [region.name_ru, ...region.aliases]) {
      expect(locate({ province: `  ${name.toLocaleUpperCase('ru')}  `, city: null }).regionId, name).toBe(region.id)
    }
  })
  it('использует город и его старое название только при отсутствии области', () => {
    expect(locate({ province: null, city: 'Алма-Ата' }).regionId).toBe('KZ-75')
    expect(locate({ province: ' ', city: 'Ақтөбе' }).regionId).toBe('KZ-15')
    expect(locate({ province: null, city: 'г. Нур-Султан' }).regionId).toBe('KZ-71')
    expect(locate({ province: 'Неизвестная область', city: 'Алматы' }).regionId).toBeNull()
    expect(locate({ province: 'ВКО', city: 'Алматы' }).regionId).toBe('KZ-63')
    expect(locate({ province: null, city: 'Алмата' }).regionId).toBeNull()
  })
  it('не угадывает регион при одинаковых названиях городов и учитывает указанную область', () => {
    const duplicated = [
      { ...cities[0]!, name: 'Одинаковый', aliases: [], region_id: 'KZ-15' },
      { ...cities[0]!, name: 'Одинаковый', aliases: [], region_id: 'KZ-63' },
    ]
    const find = createRegionIndex(regions, duplicated)
    expect(find({ province: null, city: 'Одинаковый' }).regionId).toBeNull()
    expect(find({ province: 'ВКО', city: 'Одинаковый' }).city?.region_id).toBe('KZ-63')
    expect(find({ province: null, city: null }).regionId).toBeNull()
  })
})

describe('статистика файла', () => {
  it('считает каждую позицию, включая одинаковые ID, и объединяет варианты названий городов', () => {
    const result = summarizeFile([
      row({ province: 'Алматы', city: 'Алматы', confidence: .9, apartment: '70' }),
      row({ city: 'Алма-Ата', confidence: .6, apartment: '1', entrance: '2' }),
      row({ province: 'Актюбинская область', city: 'Актобе', confidence: .59, entrance: '4' }),
      row({ city: 'Неизвестный посёлок', confidence: .1, apartment: '  ', entrance: '2' }),
      row({ confidence: 0, apartment: '7', entrance: ' ' }),
    ], regions, cities)
    expect(result).toMatchObject({ total: 5, confident: 2, located: 3, unknown: 2, apartments: 3, automaticBoth: 1, edited: 0, missingCity: 1 })
    expect(result.rowRegions).toEqual(['KZ-75', 'KZ-75', 'KZ-15', unassignedRegion, unassignedRegion])
    expect(result.topRegions.map(item => [item.id, item.count])).toEqual([['KZ-75', 2], ['KZ-15', 1]])
    expect(result.topCities.map(item => [item.name, item.count])).toEqual([['Алматы', 2], ['Актобе', 1], ['Неизвестный посёлок', 1]])
    expect(result.regions.reduce((sum, region) => sum + region.count, result.unknown)).toBe(result.total)
  })
  it('переносит исправленный город в другой регион, не улучшая автоматическое извлечение и уверенность', () => {
    const original = row({ city: 'Алматы', confidence: .4, apartment: null, entrance: null })
    const before = summarizeFile([original], regions, cities)
    const changed = editRow(original, { ...original.item.result, city: 'Актобе', apartment: '12', entrance: '3' })
    const after = summarizeFile([changed], regions, cities)
    expect(before.rowRegions).toEqual(['KZ-75'])
    expect(after.rowRegions).toEqual(['KZ-15'])
    expect(after.topCities[0]?.name).toBe('Актобе')
    expect(after).toMatchObject({ located: 1, apartments: 0, automaticBoth: 0, edited: 1 })
    expect(after.histogram).toEqual(before.histogram)
    expect(percentage(after.automaticBoth, after.total)).toBe(0)
    const changedAgain = editRow(changed, { ...changed.item.result, apartment: '13' })
    expect(changedAgain.original).toEqual(original.item.result)
    expect(summarizeFile([changedAgain], regions, cities).edited).toBe(1)
  })
  it('ручное удаление автоматических полей не переписывает качество исходного разбора', () => {
    const original = row({ province: 'ВКО', apartment: '1', entrance: '2', confidence: .9 })
    const changed = editRow(original, { ...original.item.result, province: null, apartment: null, entrance: null })
    const result = summarizeFile([changed], regions, cities)
    expect(result).toMatchObject({ unknown: 1, located: 0, apartments: 1, automaticBoth: 1, confident: 1, edited: 1 })
    expect(result.histogram).toEqual([0, 0, 0, 0, 1])
  })
  it('строит пять корзин по исходной уверенности с точными границами 0,2 / 0,4 / 0,6 / 0,8 / 1', () => {
    const rows = [0, .199, .2, .399, .4, .599, .6, .799, .8, 1].map(confidence => row({ confidence }))
    rows[0]!.item.result.confidence = 1
    const result = summarizeFile(rows, regions, cities)
    expect(result.histogram).toEqual([2, 2, 2, 2, 2])
    expect(result.confident).toBe(4)
  })
  it('разделяет нули и пять равных ступеней количества, включая максимальное значение', () => {
    const rows = Array.from({ length: 11 }, () => row({ province: 'Алматы' }))
    rows.push(...Array.from({ length: 3 }, () => row({ province: 'ВКО' })))
    const result = summarizeFile(rows, regions, cities)
    expect(result.scale.map(step => [step.min, step.max])).toEqual([[1, 3], [4, 5], [6, 7], [8, 9], [10, 11]])
    expect(result.regions.find(region => region.id === 'KZ-75')?.color).toBe(analysisColors[4])
    expect(result.regions.find(region => region.id === 'KZ-63')?.color).toBe(analysisColors[0])
    expect(result.regions.find(region => region.id === 'KZ-71')?.color).toBe(zeroColor)
    expect(result.regions).toHaveLength(regions.length)
  })
  it('ограничивает рейтинги пятью строками, сортируя сначала по количеству', () => {
    const rows = regions.map((region, index) => row({ province: region.name_ru, city: cities[index]!.name }))
    rows.push(row({ province: regions[7]!.name_ru, city: cities[7]!.name }))
    const result = summarizeFile(rows, regions, cities)
    expect(result.topRegions).toHaveLength(5)
    expect(result.topCities).toHaveLength(5)
    expect(result.topRegions[0]).toMatchObject({ id: regions[7]!.id, count: 2 })
  })
  it('не выдумывает значения для полностью неопределённых или пустых данных', () => {
    for (const rows of [[], [row({ confidence: 0 })]]) {
      const result = summarizeFile(rows, regions, cities)
      expect(result.topRegions).toEqual([])
      expect(result.topCities).toEqual([])
      expect(result.unknown).toBe(rows.length)
      expect(result.regions.every(region => region.count === 0 && region.color === zeroColor)).toBe(true)
      expect(percentage(result.automaticBoth, result.total)).toBe(0)
    }
  })
  it('фильтрует таблицу по позициям, совмещает фильтры и снимает фильтр региона', () => {
    const rows = [row({ province: 'ВКО', confidence: .5 }), row({ province: 'ВКО', confidence: .6 }), row({ confidence: 0 })]
    const result = summarizeFile(rows, regions, cities)
    expect(filePositions(rows, false, 'KZ-63', result.rowRegions)).toEqual([0, 1])
    expect(filePositions(rows, true, 'KZ-63', result.rowRegions)).toEqual([0])
    expect(filePositions(rows, false, unassignedRegion, result.rowRegions)).toEqual([2])
    expect(filePositions(rows, false, null, result.rowRegions)).toEqual([0, 1, 2])
    rows[0] = editRow(rows[0]!, { ...rows[0]!.item.result, province: 'Алматы' })
    const updated = summarizeFile(rows, regions, cities)
    expect(filePositions(rows, false, 'KZ-63', updated.rowRegions)).toEqual([1])
    expect(filePositions(rows, false, 'KZ-75', updated.rowRegions)).toEqual([0])
  })
})
