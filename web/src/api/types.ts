export const addressFields = [
  'province', 'city', 'district', 'living_area', 'street_type', 'street_name',
  'house', 'apartment', 'entrance', 'floor', 'landmark',
] as const

export type AddressField = (typeof addressFields)[number]
export type AddressValues = Record<AddressField, string | null>

export interface AddressRecord {
  id: string
  raw_address: string
}

export interface AddressResult extends AddressRecord, AddressValues {
  confidence: number
}

export type FieldSource = 'string' | 'dictionary'

export interface AddressSpan {
  field: AddressField
  start: number
  end: number
}

export interface Explain {
  spans?: AddressSpan[]
  sources?: Partial<Record<AddressField, FieldSource>>
}

export interface ParseItem {
  result: AddressResult
  explain: Explain | null
}

export interface ParseRequest {
  records: AddressRecord[]
}

export interface ParseResponse {
  items: ParseItem[]
}
