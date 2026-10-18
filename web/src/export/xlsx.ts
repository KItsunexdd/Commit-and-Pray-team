import { zipStore } from './zip'

export interface Sheet { name: string; rows: readonly (readonly string[])[] }
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const cellText = (text: string) => xml([...text.replace(/_x[0-9a-f]{4}_/gi, value => `_x005F_${value.slice(1)}`)].map(char => {
  const code = char.codePointAt(0)!
  // Excel хранит управляющие символы строк в такой форме, включая CR.
  return (code < 32 && code !== 9 && code !== 10) || code === 0xfffe || code === 0xffff
    ? `_x${code.toString(16).padStart(4, '0').toUpperCase()}_` : char
}).join(''))
function column(index: number) {
  let name = ''
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name
  return name
}
function worksheet(sheet: Sheet) {
  const widths: number[] = []
  const rows = sheet.rows.map((row, index) => `<row r="${index + 1}">${row.map((text, col) => {
    if (text.length > 32767) throw new Error('Текст ячейки превышает лимит Excel (32 767 знаков). Сохраните JSON или CSV.')
    widths[col] = Math.min(60, Math.max(widths[col] ?? 12, ...text.split(/\r?\n/).map(line => [...line].length + 2)))
    return `<c r="${column(col)}${index + 1}" t="inlineStr"${index === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${cellText(text)}</t></is></c>`
  }).join('')}</row>`).join('')
  const last = `${column(Math.max(0, widths.length - 1))}${Math.max(1, sheet.rows.length)}`
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, col) => `<col min="${col + 1}" max="${col + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData></worksheet>`
}
export function workbook(sheets: readonly Sheet[]) {
  const types = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
  return zipStore([
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${types}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${types}.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${types}.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', text: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', text: `<workbook xmlns="${ns}" xmlns:r="${relationships}"><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${relationships}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rStyles" Type="${relationships}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', text: `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: worksheet(sheet) })),
  ])
}
