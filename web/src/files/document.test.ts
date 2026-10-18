import { describe, expect, it } from 'vitest'
import { addressFields } from '../api/types'
import type { AddressValues } from '../api/types'
import { mockParse } from '../api/mocks'
import { ru } from '../i18n/ru'
import { downloadName, editRow, exportResults, maxFileBytes, maxRecords, readFile, readRecords } from './document'
import type { FileRow } from './document'

const records = [{ id: 'same', raw_address: ru.examples[0] }, { id: 'same', raw_address: `  ${ru.examples[3]}\n` }]
const source = { name: 'вход.json', records }
const rows = (): FileRow[] => mockParse({ records }).items.map((item) => ({ item, original: { ...item.result }, edited: [] }))

describe('JSON-файл адресов', () => {
  it('принимает оба формата, BOM и сохраняет порядок, ID и исходные строки', () => {
    expect(readRecords(JSON.stringify(records))).toEqual(records)
    expect(readRecords('\uFEFF' + JSON.stringify({ records }))).toEqual(records)
    expect(readRecords(JSON.stringify([{ ...records[0], extra: 12 }]))).toEqual([records[0]])
  })
  it('отклоняет повреждённый, пустой или неверный файл с номером проблемной записи', () => {
    expect(() => readRecords('{')).toThrow(ru.files.invalidJson)
    for (const value of [null, 1, {}, { records: {} }]) expect(() => readRecords(JSON.stringify(value))).toThrow(ru.files.invalidShape)
    expect(() => readRecords('[]')).toThrow(ru.files.empty)
    for (const record of [null, {}, { id: 1, raw_address: 'a' }, { id: '1', raw_address: null }]) {
      expect(() => readRecords(JSON.stringify([records[0], record]))).toThrow(ru.files.invalidRecord(2))
    }
  })
  it('ограничивает размер и число записей до запроса к API', async () => {
    expect(() => readRecords(JSON.stringify(Array.from({ length: maxRecords + 1 }, () => records[0])))).toThrow(ru.files.tooMany)
    await expect(readFile(new File(['[]'], 'input.txt'))).rejects.toThrow(ru.files.badExtension)
    await expect(readFile({ name: 'input.json', size: maxFileBytes + 1 } as File)).rejects.toThrow(ru.files.tooLarge)
    await expect(readFile(new File([JSON.stringify(records)], 'INPUT.JSON'))).resolves.toMatchObject({ records })
  })
})

describe('правка и строгая выгрузка', () => {
  it('меняет только адресные поля, убирает устаревшие spans и сохраняет confidence', () => {
    const row = rows()[0]!
    const updated = editRow(row, { ...row.item.result, apartment: '  71  ', district: '' })
    expect(updated.item.result).toMatchObject({ apartment: '71', district: null, id: 'same', raw_address: ru.examples[0], confidence: .91 })
    expect(updated.edited).toEqual(['district', 'apartment'])
    expect(updated.item.explain?.spans?.some((span) => span.field === 'apartment')).toBe(false)
    expect(updated.item.explain?.sources?.apartment).toBeUndefined()
    expect(row.item.result.apartment).toBe('70')
  })
  it('экспортирует ровно 14 полей, повторяющиеся ID и правки только нужной позиции', () => {
    const results = rows()
    results[1] = editRow(results[1]!, { ...results[1]!.item.result, house: '8а' })
    const exported = JSON.parse(exportResults(source, results))
    expect(Array.isArray(exported)).toBe(true)
    expect(exported.map((record: { id: string }) => record.id)).toEqual(['same', 'same'])
    expect(exported[0].house).toBe('59')
    expect(exported[1].house).toBe('8а')
    expect(exported[1].raw_address).toBe(records[1]!.raw_address)
    expect(Object.keys(exported[0])).toEqual(['id', 'raw_address', ...addressFields, 'confidence'])
    expect(Object.keys(exported[1])).toHaveLength(14)
    expect(() => exportResults(source, results.slice(0, 1))).toThrow(ru.files.downloadPending)
    expect(downloadName('Адреса.JSON')).toBe('Адреса-result.json')
  })
  it('не изменяет исходную запись при сохранении без правок', () => {
    const row = rows()[0]!
    row.item.result.landmark = '  магазин  '
    const values = Object.fromEntries(addressFields.map((field) => [field, row.item.result[field]])) as AddressValues
    expect(editRow(row, values)).toBe(row)
  })
})
