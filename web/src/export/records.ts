import { addressFields } from '../api/types'
import type { AddressResult, AddressValues } from '../api/types'
import type { FileRow, FileSource } from '../files/document'
import { ru } from '../i18n/ru'
import { percentage } from '../analytics/model'
import type { Analysis } from '../analytics/model'
import type { Sheet } from './xlsx'

export const contractKeys = ['id', 'raw_address', ...addressFields, 'confidence'] as const
export function contractRecord(result: AddressResult): AddressResult {
  return { id: result.id, raw_address: result.raw_address,
    ...Object.fromEntries(addressFields.map(field => [field, result[field]])) as AddressValues, confidence: result.confidence }
}
export const singleJson = (result: AddressResult) => JSON.stringify(contractRecord(result), null, 2)
export const singleJsonFile = (result: AddressResult) => JSON.stringify([contractRecord(result)], null, 2)
export function selectExport(source: FileSource, rows: readonly FileRow[], positions?: readonly number[]) {
  if (rows.length !== source.records.length) throw new Error(ru.files.downloadPending)
  const selected = positions ? new Set(positions) : null
  const indices = rows.flatMap((_, index) => !selected || selected.has(index) ? [index] : [])
  return { source: { ...source, records: indices.map(index => source.records[index]!) }, rows: indices.map(index => {
    const row = rows[index]!
    return { ...row, item: { ...row.item, result: contractRecord({ ...row.item.result, ...source.records[index]! }) } }
  }) }
}
const csvCell = (text: string) => `"${(/^[\s]*[=+\-@]|^\t/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`
export function csvRecords(rows: readonly FileRow[]) {
  return '\uFEFF' + [contractKeys, ...rows.map(row => contractKeys.map(key => String(row.item.result[key] ?? '')))]
    .map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n'
}
export function addressSheet(rows: readonly FileRow[]): Sheet {
  return { name: 'Адреса', rows: [
    ['Идентификатор', 'Исходный адрес', ...addressFields.map(field => ru.fields[field]), 'Уверенность', 'Нужна проверка', 'Изменено вручную'],
    ...rows.map(row => [...contractKeys.map(key => String(row.item.result[key] ?? '')), row.item.result.confidence < .6 ? 'Да' : 'Нет', row.edited.length ? 'Да' : 'Нет']),
  ] }
}
export function summarySheet(analysis: Analysis): Sheet {
  return { name: 'Сводка', rows: [
    ['Показатель', 'Значение'], ['Всего адресов', String(analysis.total)], ['Уверенность ≥ 0,6', String(analysis.confident)],
    ['Определён регион', String(analysis.located)], ['Не определено', String(analysis.unknown)],
    ['Извлечена квартира', String(analysis.apartments)], ['Квартира и подъезд извлечены автоматически', String(analysis.automaticBoth)],
    ['Доля с квартирой и подъездом, %', String(percentage(analysis.automaticBoth, analysis.total))],
    ['Исправлено вручную', String(analysis.edited)],
    ['Примечание', `${ru.analytics.currentHint} ${ru.analytics.originalHint}`],
    ['Топ-5 регионов', 'Адресов'], ...analysis.topRegions.map(item => [item.name, String(item.count)]),
    ['Топ-5 городов', 'Адресов'], ...analysis.topCities.map(item => [item.name, String(item.count)]),
    ['Уверенность разбора', 'Адресов'], ...analysis.histogram.map((count, i) => [ru.analytics.histogramLabels[i]!, String(count)]),
  ] }
}
