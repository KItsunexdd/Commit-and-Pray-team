import { addressFields } from '../api/types'
import type { AddressField, AddressSpan, FieldSource, ParseItem } from '../api/types'

export interface TextPart { start: number; end: number; text: string; field: AddressField | null }
export type DisplaySource = FieldSource | 'unknown'
const priority: AddressField[] = ['city', 'street_name', 'house', 'apartment', 'entrance', 'floor', 'street_type', 'district', 'living_area', 'landmark', 'province']
const isLetter = (char: string) => /\p{L}/u.test(char)
const isDigit = (char: string) => /\p{N}/u.test(char)

function literalSpans(raw: string, value: string, field: AddressField): AddressSpan[] {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = raw.matchAll(new RegExp(escaped, 'giu'))
  return [...matches].flatMap((match) => {
    const start = match.index
    const end = start + match[0].length
    const before = raw[start - 1] ?? ''
    const after = raw[end] ?? ''
    const first = value[0] ?? ''
    const last = value[value.length - 1] ?? ''
    if ((isLetter(first) && isLetter(before)) || (isLetter(last) && isLetter(after))
      || (isDigit(first) && isDigit(before)) || (isDigit(last) && isDigit(after))) return []
    return [{ field, start, end }]
  })
}

function validSpan(span: AddressSpan, raw: string): boolean {
  const splitsPair = (at: number) => at > 0 && /[\uD800-\uDBFF]/.test(raw[at - 1]!) && /[\uDC00-\uDFFF]/.test(raw[at] ?? '')
  return Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end > span.start
    && span.end <= raw.length && !splitsPair(span.start) && !splitsPair(span.end)
}

export function explainAddress({ result, explain }: ParseItem): { parts: TextPart[]; sources: Partial<Record<AddressField, DisplaySource>> } {
  const raw = result.raw_address
  const owners: (AddressField | null)[] = Array.from({ length: raw.length }, () => null)
  const sources: Partial<Record<AddressField, DisplaySource>> = {}
  const supplied = (explain?.spans ?? []).filter((span) => result[span.field]?.trim() && validSpan(span, raw))
    .sort((a, b) => (a.end - a.start) - (b.end - b.start) || priority.indexOf(a.field) - priority.indexOf(b.field))
  for (const span of supplied) for (let i = span.start; i < span.end; i++) owners[i] ??= span.field

  const fallback = addressFields.filter((field) => result[field]?.trim() && !supplied.some((span) => span.field === field))
    .sort((a, b) => (result[b]?.length ?? 0) - (result[a]?.length ?? 0) || priority.indexOf(a) - priority.indexOf(b))
  for (const field of fallback) {
    if (explain?.sources?.[field] === 'dictionary') continue
    const candidates = literalSpans(raw, result[field]!, field)
    const span = candidates.find(({ start, end }) => owners.slice(start, end).every((owner) => owner === null))
    if (span) for (let i = span.start; i < span.end; i++) owners[i] = field
  }
  for (const field of addressFields) {
    if (!result[field]?.trim()) continue
    sources[field] = explain?.sources?.[field] ?? (owners.includes(field) ? 'string' : 'unknown')
  }
  const parts: TextPart[] = []
  let start = 0
  while (start < raw.length) {
    const field = owners[start] ?? null
    let end = start + 1
    while (end < raw.length && owners[end] === field) end++
    parts.push({ start, end, text: raw.slice(start, end), field })
    start = end
  }
  return { parts, sources }
}
