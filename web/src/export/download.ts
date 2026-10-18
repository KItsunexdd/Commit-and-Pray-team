export function exportName(name: string, extension: 'json' | 'csv' | 'xlsx') {
  return `${name.replace(/\.json$/i, '') || 'address'}-result.${extension}`
}
export function summaryName(name: string) { return `${name.replace(/\.json$/i, '') || 'address'}-summary.xlsx` }
export const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export function downloadFile(content: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  try { link.href = url; link.download = name; document.body.append(link); link.click() }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
