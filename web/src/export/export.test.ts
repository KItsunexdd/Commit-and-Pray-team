import { describe, expect, it } from 'vitest'
import { crc32 as nodeCrc32 } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { mockParse } from '../api/mocks'
import { ru } from '../i18n/ru'
import { editRow, exportResults } from '../files/document'
import type { FileRow } from '../files/document'
import { summarizeFile } from '../analytics/model'
import { addressSheet, contractKeys, csvRecords, selectExport, singleJson, singleJsonFile, summarySheet } from './records'
import { exportName, summaryName } from './download'
import { workbook } from './xlsx'
import { crc32, zipStore } from './zip'

const records = [{ id: '05', raw_address: ru.examples[0] }, { id: '05', raw_address: ru.examples[1] }, { id: '003', raw_address: 'Ә Ғ Қ Ң Ө Ұ Ү Һ І; "05"\n1/2' }]
const source = { name: 'Адреса.JSON', records }
const makeRows = (): FileRow[] => mockParse({ records }).items.map(item => ({ item, original: { ...item.result }, edited: [] }))

// Читаем центральный каталог, проверяем указатели и CRC независимой реализацией Node.
function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), decode = new TextDecoder()
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  let cursor = view.getUint32(end + 16, true)
  const count = view.getUint16(end + 10, true), result = new Map<string, string>()
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50)
    expect(view.getUint16(cursor + 10, true)).toBe(0)
    const size = view.getUint32(cursor + 20, true), nameSize = view.getUint16(cursor + 28, true)
    const offset = view.getUint32(cursor + 42, true)
    const name = decode.decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize))
    expect(view.getUint32(offset, true)).toBe(0x04034b50)
    expect(view.getUint16(offset + 6, true)).toBe(0x800)
    expect(view.getUint16(offset + 8, true)).toBe(0)
    const bodyStart = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    const body = bytes.subarray(bodyStart, bodyStart + size)
    expect(decode.decode(bytes.subarray(offset + 30, offset + 30 + nameSize))).toBe(name)
    expect(nodeCrc32(body)).toBe(view.getUint32(cursor + 16, true))
    expect(nodeCrc32(body)).toBe(view.getUint32(offset + 14, true))
    result.set(name, decode.decode(body))
    cursor += 46 + nameSize + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true)
  }
  expect(cursor).toBe(end)
  expect(result.size).toBe(count)
  return result
}
describe('выгрузка записей', () => {
  it('сохраняет порядок источника, дубли ID и правку нужной позиции при выборе фильтра', () => {
    const rows = makeRows()
    rows[1] = editRow(rows[1]!, { ...rows[1]!.item.result, house: '1/2', apartment: '05' })
    rows[1]!.item.result.id = 'не из источника'
    const selected = selectExport(source, rows, [1, 0])
    const json = JSON.parse(exportResults(selected.source, selected.rows))
    expect(json.map((row: { id: string }) => row.id)).toEqual(['05', '05'])
    expect(json[0].raw_address).toBe(records[0]!.raw_address)
    expect(json[1]).toMatchObject({ house: '1/2', apartment: '05', raw_address: records[1]!.raw_address })
    expect(Object.keys(json[1])).toEqual(contractKeys)
    expect(selectExport(source, rows, []).rows).toEqual([])
    expect(() => selectExport(source, rows.slice(0, 1))).toThrow()
  })
  it('одна запись JSON содержит объект из 14 полей, null и исходный confidence, без служебных ключей', () => {
    const result = makeRows()[0]!.item.result
    const json = JSON.parse(singleJson({ ...result, explain: {}, edited: [] } as typeof result))
    expect(Array.isArray(json)).toBe(false)
    expect(Object.keys(json)).toEqual(contractKeys)
    expect(json).toEqual(result)
    const file = JSON.parse(singleJsonFile({ ...result, explain: {}, edited: [] } as typeof result))
    expect(file).toEqual([json])
    expect(Object.keys(file[0])).toEqual(contractKeys)
    for (const format of ['json', 'csv', 'xlsx'] as const) expect(exportName(source.name, format)).toBe(`Адреса-result.${format}`)
    expect(summaryName(source.name)).toBe('Адреса-summary.xlsx')
    expect(summaryName(source.name)).not.toBe(exportName(source.name, 'xlsx'))
  })
  it('CSV содержит UTF-8 BOM, 14 ключей, точку с запятой и экранированные кавычки и переводы строк', () => {
    const rows = selectExport(source, makeRows()).rows, csv = csvRecords(rows)
    expect([...new TextEncoder().encode(csv).slice(0, 3)]).toEqual([239, 187, 191])
    expect(csv.startsWith('\uFEFF' + contractKeys.map(key => `"${key}"`).join(';') + '\r\n')).toBe(true)
    expect(csv).toContain('"003";"Ә Ғ Қ Ң Ө Ұ Ү Һ І; ""05""\n1/2";')
    expect(csv.match(/\r\n"05";/g)).toHaveLength(2)
    expect(csv.indexOf(records[0]!.raw_address)).toBeLessThan(csv.indexOf(records[1]!.raw_address))
    expect(csv.endsWith('\r\n')).toBe(true)
  })
  it.each(['=SUM(1;2)', '+1', '-2', '@A1', '\tcmd', '  =1+2', '\n@x'])('защищает CSV от формул: %j', text => {
    const rows = makeRows(); rows[0]!.item.result.landmark = text
    expect(csvRecords(rows)).toContain(`;"'${text}";`)
  })
})
describe('Excel без зависимостей', () => {
  it('ZIP использует STORE, корректный центральный каталог, Unicode и CRC32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const file = { name: 'Әлем.xml', text: '<test>Қазақша &amp; русский</test>' }
    expect(unzip(zipStore([file])).get(file.name)).toBe(file.text)
  })
  it('содержит два листа, текстовые ячейки, русский и казахский текст, закрепление и размеры', () => {
    const rows = makeRows()
    rows[1] = editRow(rows[1]!, { ...rows[1]!.item.result, house: '1/2', apartment: '05', landmark: '=1+1 & <проверка>' })
    const summary = summarizeFile(rows, [], [])
    const entries = unzip(workbook([addressSheet(rows), summarySheet(summary)]))
    expect([...entries.keys()]).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'])
    expect(entries.get('xl/workbook.xml')).toContain('name="Адреса"')
    expect(entries.get('xl/workbook.xml')).toContain('name="Сводка"')
    expect(entries.get('xl/_rels/workbook.xml.rels')).toContain('Target="worksheets/sheet2.xml"')
    const sheet = entries.get('xl/worksheets/sheet1.xml')!
    expect(sheet.match(/<c /g)).toHaveLength(64)
    expect(sheet.match(/t="inlineStr"/g)).toHaveLength(64)
    expect(sheet).not.toContain('<f>')
    expect(sheet).toContain('>1/2</t>'); expect(sheet).toContain('>05</t>')
    expect(sheet).toContain('Ә Ғ Қ Ң Ө Ұ Ү Һ І; &quot;05&quot;\n1/2')
    expect(sheet).toContain('=1+1 &amp; &lt;проверка&gt;')
    expect(sheet).toContain('state="frozen"'); expect(sheet).toContain('customWidth="1"')
    expect(sheet).toContain('Нужна проверка'); expect(sheet).toContain('Изменено вручную')
    expect(entries.get('xl/worksheets/sheet2.xml')).toContain('Доля с квартирой и подъездом, %')
    expect(unzip(workbook([summarySheet(summary)])).get('xl/workbook.xml')).not.toContain('Адреса')
  })
  it('не теряет текст, похожий на XML escape, и отказывается молча обрезать длинную ячейку', () => {
    const xml = unzip(workbook([{ name: 'Сводка', rows: [['_x0041_\r\u0001']] }])).get('xl/worksheets/sheet1.xml')!
    expect(xml).toContain('_x005F_x0041__x000D__x0001_')
    expect(() => workbook([{ name: 'Сводка', rows: [['a'.repeat(32768)]] }])).toThrow('лимит Excel')
  })
  it('сводка по фильтру учитывает исправленные города, а автоматическое извлечение — исходный ответ', () => {
    const regions = JSON.parse(readFileSync('public/geo/kz-regions.json', 'utf8'))
    const cities = JSON.parse(readFileSync('public/geo/kz-cities.json', 'utf8'))
    const rows = makeRows()
    rows[2] = editRow(rows[2]!, { ...rows[2]!.item.result, city: 'Астана', apartment: '05', entrance: '4' })
    const selected = selectExport(source, rows, [2])
    const analysis = summarizeFile(selected.rows, regions, cities), sheet = summarySheet(analysis)
    expect(sheet.rows).toContainEqual(['Всего адресов', '1'])
    expect(sheet.rows).toContainEqual(['Астана', '1'])
    expect(sheet.rows).toContainEqual(['Исправлено вручную', '1'])
    expect(sheet.rows).toContainEqual(['Квартира и подъезд извлечены автоматически', '0'])
  })
})
