import { ApiError } from './errors'
import { addressFields } from './types'
import type { AddressRecord, AddressResult, Explain, ParseResponse } from './types'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isResult(value: unknown): value is AddressResult {
  return isObject(value)
    && typeof value.id === 'string'
    && typeof value.raw_address === 'string'
    && typeof value.confidence === 'number'
    && Number.isFinite(value.confidence)
    && value.confidence >= 0 && value.confidence <= 1
    && addressFields.every((field) => value[field] === null || typeof value[field] === 'string')
    && Object.keys(value).length === 14
}

function readExplain(value: unknown, rawAddress: string): Explain | null {
  if (!isObject(value)) return null

  const explain: Explain = {}
  if (Array.isArray(value.spans)) {
    explain.spans = value.spans.flatMap((span: unknown) => {
      if (!isObject(span)) return []
      const field = addressFields.find((field) => field === span.field)
      if (!field || typeof span.start !== 'number' || typeof span.end !== 'number'
        || !Number.isInteger(span.start) || !Number.isInteger(span.end)
        || span.start < 0 || span.end <= span.start || span.end > rawAddress.length) return []
      return [{ field, start: span.start, end: span.end }]
    })
  }
  if (isObject(value.sources)) {
    explain.sources = {}
    for (const field of addressFields) {
      const source = value.sources[field]
      if (source === 'string' || source === 'dictionary') explain.sources[field] = source
    }
  }
  return explain
}

export function readParseResponse(value: unknown, records: readonly AddressRecord[]): ParseResponse {
  if (!isObject(value) || !Array.isArray(value.items) || value.items.length !== records.length) {
    throw new ApiError('invalidResponse')
  }

  const items = value.items.map((item: unknown, index) => {
    const record = records[index]
    if (!isObject(item) || !isResult(item.result)
      || item.result.id !== record?.id || item.result.raw_address !== record.raw_address) {
      throw new ApiError('invalidResponse')
    }
    return { result: item.result, explain: readExplain(item.explain, item.result.raw_address) }
  })
  return { items }
}
