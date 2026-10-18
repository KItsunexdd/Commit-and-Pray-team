import { addressFields } from '../api/types'
import type { AddressField, AddressRecord, AddressResult, AddressValues, ParseItem } from '../api/types'
import { ru } from '../i18n/ru'

export const maxFileBytes = 10 * 1024 * 1024
export const maxRecords = 25_000
export interface FileSource { name: string; records: AddressRecord[] }
export interface FileRow { item: ParseItem; original: Readonly<AddressResult>; edited: AddressField[] }

export function readRecords(text: string): AddressRecord[] {
  let value: unknown
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { throw new Error(ru.files.invalidJson) }
  const records: unknown = Array.isArray(value) ? value : value && typeof value === 'object' && 'records' in value ? value.records : null
  if (!Array.isArray(records)) throw new Error(ru.files.invalidShape)
  if (!records.length) throw new Error(ru.files.empty)
  if (records.length > maxRecords) throw new Error(ru.files.tooMany)
  return records.map((record: unknown, index) => {
    if (!record || typeof record !== 'object' || !('id' in record) || !('raw_address' in record)
      || typeof record.id !== 'string' || typeof record.raw_address !== 'string') throw new Error(ru.files.invalidRecord(index + 1))
    return { id: record.id, raw_address: record.raw_address }
  })
}

export async function readFile(file: File): Promise<FileSource> {
  if (!/\.json$/i.test(file.name)) throw new Error(ru.files.badExtension)
  if (file.size > maxFileBytes) throw new Error(ru.files.tooLarge)
  let text: string
  try { text = await file.text() } catch { throw new Error(ru.files.readError) }
  return { name: file.name, records: readRecords(text) }
}

export function editRow(row: FileRow, values: AddressValues): FileRow {
  const result = { ...row.item.result }
  const changed = addressFields.filter((field) => {
    if ((values[field] ?? '') === (row.item.result[field] ?? '')) return false
    result[field] = values[field]?.trim() || null
    return result[field] !== row.item.result[field]
  })
  if (!changed.length) return row
  const sources = { ...row.item.explain?.sources }
  for (const field of changed) delete sources[field]
  const explain = { sources, spans: (row.item.explain?.spans ?? []).filter((span) => !changed.includes(span.field)) }
  return { ...row, item: { result, explain }, edited: [...new Set([...row.edited, ...changed])] }
}

// Служебные пояснения и отметки редактора не попадают в контракт выгрузки.
export function exportResults(source: FileSource, rows: readonly FileRow[]): string {
  if (source.records.length !== rows.length) throw new Error(ru.files.downloadPending)
  const results = rows.map(({ item }, index): AddressResult => {
    const original = source.records[index]!
    const fields = Object.fromEntries(addressFields.map((field) => [field, item.result[field]])) as AddressValues
    return { id: original.id, raw_address: original.raw_address, ...fields, confidence: item.result.confidence }
  })
  return JSON.stringify(results, null, 2)
}

export function downloadName(name: string) { return `${name.replace(/\.json$/i, '')}-result.json` }
